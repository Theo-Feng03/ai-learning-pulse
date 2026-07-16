import type { ReactNode } from "react";

const BADGE_TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-sky-100 text-sky-800",
  gray: "bg-stone-200 text-stone-700",
  purple: "bg-violet-100 text-violet-800",
};

export function Badge({ tone = "gray", children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone] ?? BADGE_TONES.gray}`}
    >
      {children}
    </span>
  );
}

export function runStatusTone(status: string): string {
  if (status === "completed") return "green";
  if (status === "partial_failed") return "amber";
  if (status === "failed" || status === "failed_stale") return "red";
  return "blue";
}

export function entryStatusTone(status: string): string {
  return { draft: "gray", confirmed: "blue", published: "green", archived: "amber" }[status] ?? "gray";
}

export function aiStatusTone(status: string): string {
  return (
    {
      analyzed: "green",
      analyze_failed: "red",
      not_configured: "gray",
      rate_limited: "amber",
      queued: "blue",
      pending: "blue",
    }[status] ?? "gray"
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-stone-200 bg-white p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-semibold text-stone-700">{title}</h2> : null}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}

export const btnPrimary =
  "inline-flex items-center rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed";
export const btnSecondary =
  "inline-flex items-center rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed";
export const btnDanger =
  "inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed";
export const inputCls =
  "w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none";
export const labelCls = "block text-xs font-medium text-stone-600 mb-1";
