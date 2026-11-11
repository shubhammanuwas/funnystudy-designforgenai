import Link from "next/link";

export type ParticipantProgressStep = {
  description: string;
  href?: string;
  label: string;
  status: "complete" | "needs-action" | "skipped" | "unknown";
};

const statusLabels: Record<ParticipantProgressStep["status"], string> = {
  complete: "Complete",
  "needs-action": "Needs attention",
  skipped: "Skipped for now",
  unknown: "Could not check",
};

export function ParticipantProgress({ steps }: { steps: readonly ParticipantProgressStep[] }) {
  const completedCount = steps.filter((step) => step.status === "complete").length;

  return (
    <section
      aria-labelledby="participant-progress-title"
      className="glass-panel mb-6 rounded-2xl p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="participant-progress-title" className="text-xl font-bold">
          Your progress
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {completedCount} of {steps.length} setup steps complete
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.label}
            className="min-w-0 rounded-xl border border-[var(--panel-border)] bg-[var(--surface-muted)] p-4"
          >
            <div className="flex min-w-0 flex-col items-start gap-2">
              <h3 className="break-words font-semibold">{step.label}</h3>
              <span className="max-w-full rounded-full border border-[var(--panel-border)] bg-[var(--card-surface)] px-2.5 py-1 text-xs font-semibold leading-4 text-[var(--muted)]">
                {statusLabels[step.status]}
              </span>
            </div>
            <p className="mt-3 break-words text-sm leading-5 text-[var(--muted)]">
              {step.description}
            </p>
            {step.href ? (
              <Link
                href={step.href}
                className="mt-3 inline-flex text-sm font-semibold text-[var(--accent-strong)] underline decoration-[var(--accent)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
              >
                Continue
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
