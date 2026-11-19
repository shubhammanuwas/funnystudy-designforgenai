"use client";

import { useMemo, useState } from "react";

import {
  PreviousStudyCaptionCard,
  type PreviousStudyCaption,
} from "@/components/PreviousStudyCaptionCard";

type LikeFilter = "all" | "liked" | "not-liked";

type CaptionEntry = {
  caption: PreviousStudyCaption;
  captionNumber: number;
};

const filters: { label: string; value: LikeFilter }[] = [
  { label: "All captions", value: "all" },
  { label: "Liked", value: "liked" },
  { label: "Not liked", value: "not-liked" },
];

export function filterPreviousStudyCaptions(
  entries: CaptionEntry[],
  search: string,
  likeFilter: LikeFilter
) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return entries.filter(({ caption }) => {
    const matchesSearch =
      !normalizedSearch ||
      caption.content?.toLocaleLowerCase().includes(normalizedSearch);
    const matchesLikeFilter =
      likeFilter === "all" ||
      (likeFilter === "liked" && caption.isLiked) ||
      (likeFilter === "not-liked" && !caption.isLiked);

    return matchesSearch && matchesLikeFilter;
  });
}

export function PreviousStudyCaptionList({
  captions,
  studyId,
}: {
  captions: CaptionEntry[];
  studyId: number;
}) {
  const [entries, setEntries] = useState(captions);
  const [search, setSearch] = useState("");
  const [likeFilter, setLikeFilter] = useState<LikeFilter>("all");

  const visibleEntries = useMemo(
    () => filterPreviousStudyCaptions(entries, search, likeFilter),
    [entries, likeFilter, search]
  );

  function updateLike(mappingId: number, isLiked: boolean) {
    setEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.caption.studyCaptionMappingId === mappingId
          ? { ...entry, caption: { ...entry.caption, isLiked } }
          : entry
      )
    );
  }

  function clearFilters() {
    setSearch("");
    setLikeFilter("all");
  }

  return (
    <section aria-label="Find and rate captions on this page">
      <div className="glass-panel mb-5 space-y-4 rounded-2xl p-4 sm:p-5">
        <div>
          <label
            htmlFor="archive-caption-search"
            className="mb-2 block text-sm font-semibold"
          >
            Find a caption
          </label>
          <input
            id="archive-caption-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search caption text on this page"
            className="min-h-11 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--input-bg)] px-4 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Filter by heart</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter captions by heart">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={likeFilter === filter.value}
                onClick={() => setLikeFilter(filter.value)}
                className={`min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] ${
                  likeFilter === filter.value
                    ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-contrast)]"
                    : "border-[var(--panel-border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="text-sm text-[var(--muted)]">
          Showing {visibleEntries.length} of {entries.length} captions on this
          page
        </p>
      </div>

      {visibleEntries.length ? (
        <ul className="space-y-5">
          {visibleEntries.map(({ caption, captionNumber }) => (
            <PreviousStudyCaptionCard
              key={`${caption.id}-${caption.studyCaptionMappingId}`}
              caption={caption}
              captionNumber={captionNumber}
              canEditVotes={caption.studyCaptionMappingId !== null}
              onLikeChange={(isLiked) => {
                if (caption.studyCaptionMappingId !== null) {
                  updateLike(caption.studyCaptionMappingId, isLiked);
                }
              }}
              studyId={studyId}
            />
          ))}
        </ul>
      ) : (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <h2 className="text-lg font-semibold">No captions match</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Try a different search or heart filter.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 min-h-11 rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
          >
            Clear search and filters
          </button>
        </div>
      )}
    </section>
  );
}
