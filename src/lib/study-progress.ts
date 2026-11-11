import type { Json } from "@/types/supabase";

export type SessionStudyStats = {
  likedCaptionTimeMsByKey: Record<string, number>;
  navigationTimeMsByKey: Record<string, number>;
  viewedCaptionKeys: Record<string, true>;
};

export type StudyProgress = {
  captionOrder: string[];
  currentCaptionIndex: number;
  sessionStats: SessionStudyStats;
};

export function createEmptyStudyProgress(): StudyProgress {
  return {
    captionOrder: [],
    currentCaptionIndex: 0,
    sessionStats: {
      likedCaptionTimeMsByKey: {},
      navigationTimeMsByKey: {},
      viewedCaptionKeys: {},
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTimingMap(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, timing]) =>
    typeof timing !== "number" || !Number.isSafeInteger(timing) || timing < 0
  )) return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

function parseViewedMap(value: unknown): Record<string, true> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, viewed]) => viewed !== true)) return null;
  return Object.fromEntries(entries) as Record<string, true>;
}

export function parseStudyProgress(value: unknown): StudyProgress | null {
  if (!isRecord(value)) return null;
  const order = value.captionOrder;
  const currentCaptionIndex = value.currentCaptionIndex;
  const stats = value.sessionStats;
  if (
    !Array.isArray(order) ||
    order.length === 0 ||
    order.some((id) => typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
    new Set(order).size !== order.length ||
    typeof currentCaptionIndex !== "number" ||
    !Number.isSafeInteger(currentCaptionIndex) ||
    currentCaptionIndex < 0 ||
    currentCaptionIndex >= order.length ||
    !isRecord(stats)
  ) return null;

  const likedCaptionTimeMsByKey = parseTimingMap(stats.likedCaptionTimeMsByKey);
  const navigationTimeMsByKey = parseTimingMap(stats.navigationTimeMsByKey);
  const viewedCaptionKeys = parseViewedMap(stats.viewedCaptionKeys);
  if (!likedCaptionTimeMsByKey || !navigationTimeMsByKey || !viewedCaptionKeys) return null;

  return {
    captionOrder: order,
    currentCaptionIndex,
    sessionStats: { likedCaptionTimeMsByKey, navigationTimeMsByKey, viewedCaptionKeys },
  };
}

export function studyProgressToJson(progress: StudyProgress): Json {
  return {
    captionOrder: progress.captionOrder,
    currentCaptionIndex: progress.currentCaptionIndex,
    sessionStats: {
      likedCaptionTimeMsByKey: progress.sessionStats.likedCaptionTimeMsByKey,
      navigationTimeMsByKey: progress.sessionStats.navigationTimeMsByKey,
      viewedCaptionKeys: progress.sessionStats.viewedCaptionKeys,
    },
  };
}
