alter table public.study_participations
  add column progress jsonb;

create function public.valid_study_progress(p_progress jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  caption_id text;
  field_name text;
  field_value jsonb;
  field_object jsonb;
  position numeric;
  caption_count integer;
  distinct_caption_count integer;
begin
  if p_progress is null
    or jsonb_typeof(p_progress) is distinct from 'object'
    or jsonb_typeof(p_progress -> 'captionOrder') is distinct from 'array'
    or jsonb_typeof(p_progress -> 'currentCaptionIndex') is distinct from 'number'
    or jsonb_typeof(p_progress -> 'sessionStats') is distinct from 'object'
    or not (p_progress -> 'sessionStats' ?& array[
      'likedCaptionTimeMsByKey',
      'navigationTimeMsByKey',
      'viewedCaptionKeys'
    ]) then
    return false;
  end if;

  if (p_progress ->> 'currentCaptionIndex') !~ '^(0|[1-9][0-9]*)$' then
    return false;
  end if;

  position := (p_progress ->> 'currentCaptionIndex')::numeric;
  caption_count := jsonb_array_length(p_progress -> 'captionOrder');
  if caption_count = 0 or position >= caption_count then
    return false;
  end if;

  select count(distinct value), count(*)
    into distinct_caption_count, caption_count
    from jsonb_array_elements_text(p_progress -> 'captionOrder') as ids(value);

  if distinct_caption_count <> caption_count then
    return false;
  end if;

  for caption_id in
    select value from jsonb_array_elements_text(p_progress -> 'captionOrder') as ids(value)
  loop
    if caption_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
  end loop;

  foreach field_name in array array['likedCaptionTimeMsByKey', 'navigationTimeMsByKey'] loop
    field_object := p_progress -> 'sessionStats' -> field_name;
    if jsonb_typeof(field_object) is distinct from 'object' then
      return false;
    end if;
    for field_value in select value from jsonb_each(field_object) loop
      if jsonb_typeof(field_value) <> 'number'
        or field_value::text !~ '^(0|[1-9][0-9]*)$'
        or field_value::text::numeric > 9007199254740991 then
        return false;
      end if;
    end loop;
  end loop;

  field_object := p_progress -> 'sessionStats' -> 'viewedCaptionKeys';
  if jsonb_typeof(field_object) is distinct from 'object' then
    return false;
  end if;
  for field_value in select value from jsonb_each(field_object) loop
    if field_value <> 'true'::jsonb then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.valid_study_progress(jsonb) from public, anon;
grant execute on function public.valid_study_progress(jsonb) to authenticated;

alter table public.study_participations
  add constraint study_participations_valid_progress
  check (progress is null or public.valid_study_progress(progress));

revoke all on public.study_participations from public, anon, authenticated;
grant select on public.study_participations to authenticated;
grant insert (profile_id, study_id) on public.study_participations to authenticated;
grant update (ended_at, completion_stats, progress)
  on public.study_participations to authenticated;

create or replace function public.stamp_study_participation_end()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.ended_at is not null then
    new.ended_at := old.ended_at;
    new.completion_stats := old.completion_stats;
    new.progress := old.progress;
  elsif new.ended_at is distinct from old.ended_at
    or new.completion_stats is distinct from old.completion_stats then
    new.ended_at := statement_timestamp();
  else
    new.ended_at := old.ended_at;
  end if;
  return new;
end;
$$;

create function public.save_study_progress(p_study_id bigint, p_progress jsonb)
returns public.study_participations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  participation public.study_participations;
begin
  if not public.valid_study_progress(p_progress) then
    raise exception 'Invalid study progress' using errcode = '22023';
  end if;

  update public.study_participations
  set progress = p_progress
  where profile_id = auth.uid()
    and study_id = p_study_id
    and ended_at is null
  returning * into participation;

  if not found then
    raise exception 'Could not save progress for this study';
  end if;

  return participation;
end;
$$;

revoke all on function public.save_study_progress(bigint, jsonb) from public, anon;
grant execute on function public.save_study_progress(bigint, jsonb) to authenticated;
