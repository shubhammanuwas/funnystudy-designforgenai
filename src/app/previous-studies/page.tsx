import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalDateTime } from "@/components/LocalDateTime";
import {
  fetchPublicPastStudyIdentities,
  type StudyRow,
} from "@/lib/studies";
import { createClient } from "@/lib/supabase/server";

export default async function PreviousStudiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { studies, error } = await fetchPublicPastStudyIdentities(supabase);
  if (error) {
    console.error("[PreviousStudiesPage] load previous studies failed", error);
    throw new Error("Could not load previous studies");
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

  return (
    <div className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 pt-5 pb-24 text-[var(--foreground)] sm:px-6 sm:pt-8">
      <main className="relative mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain p-1">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        >
          <ArrowLeftIcon aria-hidden className="h-5 w-5" />
          Back to studies
        </Link>
        <header className="mb-6 space-y-2 sm:mb-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Previous studies</h1>
          <p className="text-sm text-[var(--muted)] sm:text-base">
            Browse ended public studies and add or remove heart responses,
            including on captions you skipped. Saved completion stats remain
            unchanged.
          </p>
        </header>

        {studies.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 text-center sm:p-8">
            <h2 className="text-xl font-semibold">No previous studies found</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Ended public studies will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {studies.map((study) => (
              <li key={study.id}>
                <PastStudyCard study={study} />
              </li>
            ))}
          </ul>
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

function PastStudyCard({ study }: { study: StudyRow }) {
  return (
    <Link
      href={`/previous-studies/${study.id}`}
      className="glass-panel flex items-center justify-between gap-4 rounded-2xl p-5 transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:p-6"
    >
      <span className="min-w-0 space-y-2">
        <span className="block text-lg font-semibold sm:text-xl">
          Study {study.id}
        </span>
        <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-sm leading-6 text-[var(--muted)]">
          <span>Ended</span>
          <span>{study.end_datetime_utc ? <LocalDateTime value={study.end_datetime_utc} /> : "Unknown"}</span>
        </span>
        <span className="block text-sm font-semibold text-[var(--accent-strong)]">
          Browse captions
        </span>
      </span>
      <ArrowRightIcon aria-hidden className="h-5 w-5 shrink-0 text-[var(--accent-strong)]" />
    </Link>
  );
}
