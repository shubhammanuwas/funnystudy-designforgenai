import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { PreviousStudyCaptionCard } from "@/components/PreviousStudyCaptionCard";
import {
  fetchPublicPastStudyCaptionPage,
  resolveNumericStudy,
} from "@/lib/studies";
import { resolveStudyCaptionImageUrl } from "@/lib/caption-images";
import { createClient } from "@/lib/supabase/server";

const CAPTIONS_PER_PAGE = 24;
type PageParams = Promise<{ studyId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseStudyId(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const studyId = Number(value);
  return Number.isSafeInteger(studyId) && studyId > 0 ? studyId : null;
}

function parsePage(value: string | string[] | undefined) {
  const rawPage = Array.isArray(value) ? value[0] : value;
  if (typeof rawPage !== "string" || !/^\d+$/.test(rawPage)) {
    return 0;
  }

  const page = Number(rawPage);
  return Number.isSafeInteger(page) ? page : 0;
}

export default async function PreviousStudyCaptionsPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: SearchParams;
}) {
  const { studyId: studyIdParam } = await params;
  const studyId = parseStudyId(studyIdParam);
  if (studyId === null) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const studyResult = await resolveNumericStudy(supabase, studyId, now);
  if (studyResult.status === "error") {
    console.error("[PreviousStudyCaptionsPage] load study failed", studyResult.error);
    throw new Error("Could not load previous study");
  }

  const study = studyResult.study;
  const endTime = study?.end_datetime_utc
    ? new Date(study.end_datetime_utc).getTime()
    : Number.POSITIVE_INFINITY;
  if (
    !study ||
    study.is_private !== false ||
    study.end_datetime_utc === null ||
    endTime >= now.getTime()
  ) {
    notFound();
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedPage = parsePage(resolvedSearchParams.page);
  const {
    captions,
    count,
    error,
  } = await fetchPublicPastStudyCaptionPage(
    supabase,
    study.id,
    requestedPage,
    CAPTIONS_PER_PAGE
  );
  if (error) {
    console.error("[PreviousStudyCaptionsPage] load captions failed", error);
    throw new Error("Could not load previous study captions");
  }

  const pageCount = Math.ceil(count / CAPTIONS_PER_PAGE);
  const lastPage = Math.max(0, pageCount - 1);
  if (requestedPage > lastPage) {
    redirect(`/previous-studies/${study.id}${lastPage ? `?page=${lastPage}` : ""}`);
  }

  const latestVoteByMapping = new Map<number, string>();
  const mappingIds = captions
    .map((caption) => caption.study_caption_mapping_id)
    .filter((mappingId): mappingId is number => mappingId !== null);
  if (mappingIds.length) {
    const { data: votes, error: votesError } = await supabase
      .from("study_caption_vote_events")
      .select("study_caption_mapping_id, vote_value")
      .eq("profile_id", user.id)
      .in("study_caption_mapping_id", mappingIds)
      .order("id", { ascending: true });
    if (votesError) {
      console.error(
        "[PreviousStudyCaptionsPage] load participant votes failed",
        votesError
      );
      throw new Error("Could not load previous study votes");
    }

    for (const vote of votes ?? []) {
      if (vote.study_caption_mapping_id !== null) {
        latestVoteByMapping.set(
          vote.study_caption_mapping_id,
          vote.vote_value
        );
      }
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || user.email || "your account";
  const start = count === 0 ? 0 : requestedPage * CAPTIONS_PER_PAGE + 1;
  const end = Math.min((requestedPage + 1) * CAPTIONS_PER_PAGE, count);

  return (
    <div className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 pt-5 pb-24 text-[var(--foreground)] sm:px-6 sm:pt-8">
      <main className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain p-1">
        <Link
          href="/previous-studies"
          className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        >
          <ArrowLeftIcon aria-hidden className="h-5 w-5" />
          Previous studies
        </Link>
        <header className="mb-6 space-y-2 sm:mb-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Study {study.id}</h1>
          <p className="text-sm text-[var(--muted)] sm:text-base">
            {count} caption{count === 1 ? "" : "s"} from this ended public study
          </p>
          <p className="text-sm leading-6 text-[var(--muted)]">
            You can add or remove a heart on any caption from this ended
            public study, including captions you skipped. Previously saved
            Study Stats remain unchanged.
          </p>
        </header>

        {count === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center sm:p-8">
            <h2 className="text-xl font-semibold">No captions available</h2>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Showing {start}–{end} of {count}
            </p>
            <ul className="space-y-5">
              {captions.map((caption, index) => {
                const imageUrl = resolveStudyCaptionImageUrl(caption);
                const latestVote =
                  caption.study_caption_mapping_id === null
                    ? null
                    : latestVoteByMapping.get(
                        caption.study_caption_mapping_id
                      ) ?? null;
                return (
                  <PreviousStudyCaptionCard
                    key={`${caption.id}-${caption.study_caption_mapping_id}`}
                    caption={{
                      content: caption.content,
                      id: caption.id,
                      imageSrc: imageUrl,
                      isLiked:
                        latestVote === "funny" || latestVote === "very funny",
                      studyCaptionMappingId:
                        caption.study_caption_mapping_id,
                    }}
                    captionNumber={start + index}
                    canEditVotes={caption.study_caption_mapping_id !== null}
                    studyId={study.id}
                  />
                );
              })}
            </ul>
            {pageCount > 1 ? (
              <nav
                aria-label="Archive caption pages"
                className="mt-6 flex items-center justify-between gap-4"
              >
                {requestedPage > 0 ? (
                  <Link
                    href={`/previous-studies/${study.id}?page=${requestedPage - 1}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--panel-border)] px-4 py-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
                  >
                    <ArrowLeftIcon aria-hidden className="h-4 w-4" />
                    Previous
                  </Link>
                ) : <span />}
                <span className="text-sm text-[var(--muted)]">
                  Page {requestedPage + 1} of {pageCount}
                </span>
                {requestedPage < lastPage ? (
                  <Link
                    href={`/previous-studies/${study.id}?page=${requestedPage + 1}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--panel-border)] px-4 py-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
                  >
                    Next
                    <ArrowRightIcon aria-hidden className="h-4 w-4" />
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
          </>
        )}
      </main>
      <AccountMenu
        displayName={displayName}
        email={user.email}
        signOutAction={signOut}
      />
    </div>
  );
}
