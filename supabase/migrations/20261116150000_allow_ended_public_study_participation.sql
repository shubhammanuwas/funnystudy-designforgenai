drop policy "Participants can start active studies"
  on public.study_participations;

create policy "Participants can start active or ended public studies"
  on public.study_participations for insert to authenticated
  with check (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.studies study
      where study.id = study_id
        and (
          (
            (study.start_datetime_utc is null or study.start_datetime_utc <= statement_timestamp())
            and (study.end_datetime_utc is null or study.end_datetime_utc >= statement_timestamp())
          )
          or (
            study.is_private = false
            and (study.start_datetime_utc is null or study.start_datetime_utc <= statement_timestamp())
            and study.end_datetime_utc < statement_timestamp()
          )
        )
    )
  );
