"use client";

import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import { useState } from "react";

import { setPreviousStudyCaptionLike } from "@/app/actions";

export type PreviousStudyCaption = {
  content: string | null;
  id: string;
  imageSrc: string | null;
  isLiked: boolean;
  studyCaptionMappingId: number | null;
};

export function PreviousStudyCaptionCard({
  caption,
  captionNumber,
  canEditVotes,
  studyId,
}: {
  caption: PreviousStudyCaption;
  captionNumber: number;
  canEditVotes: boolean;
  studyId: number;
}) {
  const [isLiked, setIsLiked] = useState(caption.isLiked);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLikeClick() {
    if (isPending || caption.studyCaptionMappingId === null) return;

    const nextIsLiked = !isLiked;
    setIsPending(true);
    setError(null);
    try {
      const result = await setPreviousStudyCaptionLike({
        captionId: caption.id,
        isLiked: nextIsLiked,
        studyCaptionMappingId: caption.studyCaptionMappingId,
        studyId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }

      setIsLiked(nextIsLiked);
    } catch (err) {
      console.error("[PreviousStudyCaptionCard] update vote failed", err);
      setError("We couldn't update your like. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <li className="glass-panel rounded-2xl p-4 sm:p-6">
      {caption.content ? (
        <p className="mb-4 whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg">
          {caption.content}
        </p>
      ) : null}
      {caption.imageSrc ? (
        <div className="relative mx-auto h-[min(60svh,32rem)] w-full">
          <Image
            src={caption.imageSrc}
            alt={`Image paired with caption ${captionNumber}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
          />
        </div>
      ) : null}
      {canEditVotes ? (
        <div className="mt-4 border-t border-[var(--panel-border)] pt-3">
          <button
            type="button"
            onClick={handleLikeClick}
            disabled={isPending}
            aria-pressed={isLiked}
            aria-label={
              isLiked
                ? `Remove your like for caption ${captionNumber}`
                : `Like caption ${captionNumber}`
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60"
          >
            {isLiked ? (
              <HeartSolidIcon aria-hidden className="h-6 w-6 text-rose-500" />
            ) : (
              <HeartOutlineIcon aria-hidden className="h-6 w-6" />
            )}
            {isPending
              ? "Saving…"
              : isLiked
                ? "Liked · remove like"
                : "Like this caption"}
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-[var(--error-text)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
