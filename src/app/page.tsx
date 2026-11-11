import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

import { AccountMenu } from "@/components/AccountMenu";
import { LocalDateTime } from "@/components/LocalDateTime";
import { ParticipantProgress, type ParticipantProgressStep } from "@/components/ParticipantProgress";
import { SubmitButton } from "@/components/SubmitButton";
import { ThemeMenu } from "@/components/theme/ThemeMenu";
import { buildDemographicsPath, fetchDemographicSurveyState } from "@/lib/demographics";
import { DEMOGRAPHIC_SKIPS_COOKIE, readDemographicSkips } from "@/lib/demographic-skips";
import { buildNotificationPreferencesPath, buildParticipantProgressPath, fetchNotificationPreferences, NOTIFICATION_SKIPS_COOKIE, readNotificationSkips } from "@/lib/notification-preferences";
import { fetchPublicActiveStudyIdentities, type StudyRow } from "@/lib/studies";
import { createClient } from "@/lib/supabase/server";
import { fetchStudyParticipations, isStudyCompleted, type StudyParticipation } from "@/lib/study-participation";
import { parseStudyProgress } from "@/lib/study-progress";
import type { TablesUpdate } from "@/types/supabase";

type Profile = {
  first_name: string | null;
  last_name: string | null;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const requestedNext = Array.isArray(resolvedParams.next) ? resolvedParams.next[0] : resolvedParams.next;
  const intendedPath = typeof requestedNext === "string" ? requestedNext : "/";
  const dashboardPath = buildParticipantProgressPath(intendedPath);
  const messageRaw = resolvedParams.message;
  const message = Array.isArray(messageRaw) ? messageRaw[0] : messageRaw;

  const supabase = await createClient();
  const studyNow = new Date();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const skippedNotifications = readNotificationSkips(cookieStore.get(NOTIFICATION_SKIPS_COOKIE)?.value, user.id);
  const skippedQuestionIds = readDemographicSkips(
    cookieStore.get(DEMOGRAPHIC_SKIPS_COOKIE)?.value,
    user.id
  );

  const [
    { data: profileData },
    { studies: activeStudyIdentities, error: activeStudyIdentitiesError },
    notificationState,
    demographicState,
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      fetchPublicActiveStudyIdentities(supabase, studyNow),
      fetchNotificationPreferences(supabase, user.id, skippedNotifications),
      fetchDemographicSurveyState(supabase, user.id, skippedQuestionIds),
    ]);

  const profile = profileData as Profile | null;

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName = fullName || user.email || "your account";

  const progressSteps: ParticipantProgressStep[] = [
    {
      label: "Profile",
      description: profile?.first_name && profile.last_name
        ? "Your name is saved."
        : "Add your name to continue to studies.",
      status: profile?.first_name && profile.last_name ? "complete" : "needs-action",
    },
    {
      label: "Notifications",
      description: notificationState.error
        ? "We couldn't verify your reminder choices."
        : notificationState.pending.length
          ? "Choose Yes, No, or Skip for each reminder channel."
          : "Your reminder preferences are up to date, or skipped for this session.",
      href: notificationState.pending.length || notificationState.error
        ? buildNotificationPreferencesPath(intendedPath)
        : undefined,
      status: notificationState.error
        ? "unknown"
        : notificationState.pending.length
          ? "needs-action"
          : skippedNotifications.length
            ? "skipped"
            : "complete",
    },
    {
      label: "Demographics",
      description: demographicState.error
        ? "We couldn't verify your survey status."
        : demographicState.pendingQuestions.length
          ? `${demographicState.pendingQuestions.length} survey question${demographicState.pendingQuestions.length === 1 ? "" : "s"} remain.`
          : "The survey is complete, or unanswered questions were skipped for this session.",
      href: demographicState.pendingQuestions.length || demographicState.error
        ? buildDemographicsPath({ next: intendedPath, skippedQuestionIds })
        : undefined,
      status: demographicState.error
        ? "unknown"
        : demographicState.pendingQuestions.length
          ? "needs-action"
          : skippedQuestionIds.length
            ? "skipped"
            : "complete",
    },
  ];
  const setupNeedsAction = progressSteps.some((step) => step.status === "needs-action");

  if (!profile?.first_name || !profile?.last_name) {
    return (
      <CompleteProfileForm
        userEmail={user.email}
        initialFirst={profile?.first_name ?? ""}
        initialLast={profile?.last_name ?? ""}
        message={message}
        nextPath={dashboardPath}
        progressSummary={<ParticipantProgress steps={progressSteps} />}
      />
    );
  }

  if (activeStudyIdentitiesError) {
    console.error("[Home] load active study identities failed", activeStudyIdentitiesError);
  }

  const { participations, error: participationError } = await fetchStudyParticipations(
    supabase, user.id, activeStudyIdentities.map((study) => study.id)
  );
  const participationByStudy = new Map(participations.map((row) => [row.study_id, row]));
  if (participationError) {
    console.error("[Home] load study participation failed", participationError);
  }

  return (
    <div
      id="home-root"
      className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 pt-8 pb-24 text-[var(--foreground)] sm:px-6 sm:pt-12"
    >
      <main
        id="home-content"
        className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain p-1"
      >
        <ParticipantProgress steps={progressSteps} />
        {activeStudyIdentitiesError ? (
          <div className="glass-panel rounded-2xl p-6 text-center sm:p-8">
            <h1 className="text-2xl font-bold text-[var(--error-text)]">
              We couldn&apos;t load studies
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Please refresh and try again.
            </p>
          </div>
        ) : activeStudyIdentities.length === 0 ? (
          <section className="space-y-4">
            <div className="glass-panel rounded-2xl p-6 text-center sm:p-8">
              <h1 className="text-2xl font-bold sm:text-3xl">No active studies</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                You can still browse captions from previous public studies.
              </p>
            </div>
            <PastStudiesLink />
          </section>
        ) : (
          <>
            <header className="mb-6 space-y-2 sm:mb-8">
              <h1 className="text-3xl font-bold sm:text-4xl">Active studies</h1>
              <p className="text-sm text-[var(--muted)] sm:text-base">
                Choose a study to start rating captions.
              </p>
            </header>
            {participationError ? (
              <p role="alert" className="mb-4 text-sm text-[var(--error-text)]">
                We couldn&apos;t load your study completion status. Please refresh to try again.
              </p>
            ) : null}
            <ul className="space-y-3">
              {activeStudyIdentities.map((study) => (
                <li key={study.id}>
                  <StudyCard
                    study={study}
                    participation={participationByStudy.get(study.id)}
                    setupNeedsAction={setupNeedsAction}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <PastStudiesLink />
            </div>
          </>
        )}
      </main>
      <AccountMenu displayName={displayName} email={user.email} signOutAction={signOut} />
    </div>
  );
}

function CompleteProfileForm({
  userEmail,
  initialFirst,
  initialLast,
  message,
  nextPath = "/",
  progressSummary,
}: {
  userEmail: string | undefined | null;
  initialFirst: string;
  initialLast: string;
  message?: string | null;
  nextPath?: string;
  progressSummary?: React.ReactNode;
}) {
  return (
    <div
      id="profile-complete-root"
      className="relative flex h-[100svh] min-h-[100svh] items-start justify-center overflow-hidden px-4 py-10 text-[var(--foreground)] sm:items-center sm:px-6 sm:py-16"
    >
      <div
        id="profile-bg-shell"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          id="profile-bg-orb-1"
          className="absolute -left-16 top-10 h-64 w-64 rounded-full bg-amber-500/25 blur-[110px] animate-orb"
        />
        <div
          id="profile-bg-orb-2"
          className="absolute bottom-6 right-8 h-56 w-56 rounded-full bg-yellow-300/20 blur-[110px] animate-orb-reverse"
        />
        <div
          id="profile-bg-orb-3"
          className="absolute left-12 top-1/2 h-60 w-60 -translate-y-1/2 rounded-full bg-amber-300/20 blur-[100px] animate-orb-sway"
        />
        <div
          id="profile-bg-grid"
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(251,191,36,0.12),transparent_42%),radial-gradient(circle_at_80%_12%,rgba(253,224,71,0.12),transparent_35%)] animate-grid-drift"
        />
      </div>

      <div
        id="profile-complete-card"
        className="relative w-full max-w-2xl rounded-3xl border border-[var(--panel-border)] bg-[var(--card-surface)] p-8 shadow-[var(--panel-shadow)] backdrop-blur-sm animate-card-rise sm:p-10 max-h-[calc(100svh-4rem)] overflow-y-auto sm:max-h-none"
      >
        <div
          id="profile-card-topline"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--accent-strong)] to-[var(--accent)] animate-shine"
        />
        <div
          id="profile-card-topglow"
          className="absolute -left-16 top-0 h-28 w-28 rounded-full bg-amber-500/15 blur-3xl"
        />
        <div id="profile-card-body" className="space-y-7 relative">
          <header className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--soft)]">
              Welcome
            </p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              <span className="text-[var(--foreground)]">
                Tell us who you are
              </span>
            </h1>
            <div aria-hidden className="h-1 w-16 rounded-full bg-[var(--accent-strong)]" />
            <p className="text-sm text-[var(--muted)] sm:text-base">
              We need your first and last name before you can enter. You&apos;re
              signed in as {userEmail ?? "your account"}.
            </p>
            {message ? (
              <p className="rounded-xl bg-[color-mix(in_srgb,_var(--accent)_12%,_transparent)] px-4 py-3 text-sm font-medium text-[var(--foreground)] ring-1 ring-[color-mix(in_srgb,_var(--accent)_35%,_transparent)]">
                {message}
              </p>
            ) : null}
            {progressSummary}
          </header>

          <form id="profile-name-form" action={updateProfileName} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div id="profile-name-grid" className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                First name
                <input
                  name="first_name"
                  defaultValue={initialFirst}
                  required
                  minLength={2}
                  className="mt-2 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--foreground)] shadow-inner outline-none ring-1 ring-[var(--input-border)] transition focus:ring-2 focus:ring-[var(--input-ring)]"
                  placeholder="Jane"
                />
              </label>
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                Last name
                <input
                  name="last_name"
                  defaultValue={initialLast}
                  required
                  minLength={2}
                  className="mt-2 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--foreground)] shadow-inner outline-none ring-1 ring-[var(--input-border)] transition focus:ring-2 focus:ring-[var(--input-ring)]"
                  placeholder="Doe"
                />
              </label>
            </div>
            <div
              id="profile-action-row"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end"
            >
              <SubmitButton
                formAction={updateProfileName}
                pendingLabel="Saving…"
                className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-contrast)] shadow-lg shadow-[0_15px_40px_-20px_rgba(245,158,11,0.55)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:w-auto"
              >
                Save and continue
              </SubmitButton>
              <SubmitButton
                pendingLabel="Signing out…"
                formAction={signOut}
                formNoValidate
                className="w-full rounded-xl border border-[var(--panel-border)] bg-[var(--surface-muted)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] shadow-inner shadow-black/40 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--panel-border)] sm:w-auto"
              >
                Log out
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
      <ThemeMenu />
    </div>
  );
}

async function signOut() {
  "use server";

  const supabase = await createClient({ allowCookieWrite: true });
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

async function updateProfileName(formData: FormData) {
  "use server";

  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const first = formData.get("first_name")?.toString().trim() ?? "";
  const last = formData.get("last_name")?.toString().trim() ?? "";
  const rawNext = formData.get("next")?.toString() ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("\\")
    ? rawNext
    : "/";

  if (first.length < 2 || last.length < 2) {
    const url = new URL(next, "http://localhost");
    url.searchParams.set("message", "Please enter a valid first and last name.");
    redirect(`${url.pathname}${url.search}`);
  }

  const updatePayload: TablesUpdate<"profiles"> = {
    first_name: first,
    last_name: last,
    modified_by_user_id: user.id,
  };
  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) {
    const url = new URL(next, "http://localhost");
    url.searchParams.set("message", "We could not save your name. Please try again.");
    redirect(`${url.pathname}${url.search}`);
  }

  redirect(next);
}

function PastStudiesLink() {
  return (
    <Link
      href="/previous-studies"
      className="glass-panel flex items-center justify-between gap-4 rounded-2xl p-5 transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:p-6"
    >
      <span className="min-w-0">
        <span className="block font-semibold">Browse previous studies</span>
        <span className="mt-1 block text-sm text-[var(--muted)]">
          Browse ended studies and update your own likes.
        </span>
      </span>
      <ArrowRightIcon aria-hidden className="h-5 w-5 shrink-0 text-[var(--accent-strong)]" />
    </Link>
  );
}

function StudyCard({
  study,
  participation,
  setupNeedsAction,
}: {
  study: StudyRow;
  participation?: StudyParticipation;
  setupNeedsAction: boolean;
}) {
  const completed = isStudyCompleted(participation);
  const inProgress = Boolean(participation?.started_at && !completed);
  const label = completed ? "View results" : inProgress ? "Resume study" : "Start study";
  const progress = parseStudyProgress(participation?.progress);
  const content = (
    <>
      <div className="min-w-0 flex-1 space-y-2 break-words">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold sm:text-xl">Study {study.id}</h2>
          {completed ? (
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
              Completed
            </span>
          ) : inProgress ? (
            <span className="text-xs font-semibold text-[var(--muted)]">In progress</span>
          ) : null}
        </div>
        {inProgress ? (
          <p className="text-sm text-[var(--muted)]">
            {progress
              ? `Caption ${progress.currentCaptionIndex + 1} of ${progress.captionOrder.length}`
              : "Your progress will be saved as you continue."}
          </p>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm leading-6 text-[var(--muted)]">
          <dt>Start</dt>
          <dd>{study.start_datetime_utc ? <LocalDateTime value={study.start_datetime_utc} /> : "No start date"}</dd>
          <dt>End</dt>
          <dd>{study.end_datetime_utc ? <LocalDateTime value={study.end_datetime_utc} /> : "No end date"}</dd>
        </dl>
        <p className="text-sm font-semibold text-[var(--accent-strong)]">
          {setupNeedsAction && !completed ? "Complete setup to continue" : label}
        </p>
      </div>
      <ArrowRightIcon aria-hidden className="h-5 w-5 shrink-0 text-[var(--accent-strong)]" />
    </>
  );
  const className = "glass-panel flex items-center gap-4 rounded-2xl p-5 sm:p-6";

  if (setupNeedsAction && !completed) {
    return <div aria-disabled="true" className={`${className} cursor-not-allowed opacity-65`}>{content}</div>;
  }

  return (
    <Link
      href={`/study/${study.id}`}
      prefetch={false}
      aria-label={`${label}: Study ${study.id}`}
      className={`${className} transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]`}
    >
      {content}
    </Link>
  );
}
