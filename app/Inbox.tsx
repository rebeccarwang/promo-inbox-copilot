"use client";

import { useMemo, useState } from "react";
import type { EmailRoute, SeedEmail } from "@/lib/seedEmails";
import { createAuditEvent, type AuditEvent } from "@/lib/auditLog";
import {
  fallbackToManualReview,
  type EmailClassificationResult,
} from "@/lib/classificationSchema";

const SECTIONS: { route: EmailRoute; title: string }[] = [
  { route: "cleanup_review", title: "Cleanup Review" },
  { route: "deal_digest", title: "Deal Digest" },
  { route: "subscription_digest", title: "Subscription Digest" },
  { route: "restock_alert", title: "Restock Alerts" },
  { route: "manual_review", title: "Manual Review" },
];

// A card is "pending" (unreviewed) until the AI classifier has run on it.
// `source` doubles as review status: "seeded" = pending; anything else =
// reviewed. Seed `route` is ignored for placement until a row is reviewed, so
// the pre-sorted seed state is never shown.
type Source = "seeded" | "classifier" | "failed";

const STATUS_LABELS: Record<Source, string> = {
  seeded: "Pending AI review",
  classifier: "Reviewed by AI",
  failed: "AI review failed",
};

// `flaggedWrong` is user feedback: the user thinks this email is mis-routed,
// and `suggestedRoute` is the lane they think it belongs in. Feedback only —
// the email never actually moves lanes.
type Row = SeedEmail & {
  selected: boolean;
  flaggedWrong: boolean;
  suggestedRoute: EmailRoute | null;
  source: Source;
};

function toRows(emails: SeedEmail[]): Row[] {
  return emails.map((e) => ({
    ...e,
    selected: false,
    flaggedWrong: false,
    suggestedRoute: null,
    source: "seeded" as Source,
  }));
}

const isReviewed = (r: Row) => r.source !== "seeded";

function routeTitle(route: EmailRoute | null): string {
  return SECTIONS.find((s) => s.route === route)?.title ?? "—";
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (confidence >= 0.7) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-rose-50 text-rose-700 ring-rose-600/20";
}

const ACTION_BTN =
  "rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export default function Inbox({
  emails,
  onAudit,
  onReset,
}: {
  emails: SeedEmail[];
  onAudit: (event: AuditEvent) => void;
  onReset: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(emails));
  // Which row's "should have been…" category picker is currently open.
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);
  // Ids of rows with an in-flight classifier request.
  const [classifyingIds, setClassifyingIds] = useState<Set<string>>(
    () => new Set()
  );
  // True while "Run AI Review" is classifying the whole pending inbox.
  const [reviewingAll, setReviewingAll] = useState(false);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows]
  );

  const pendingRows = useMemo(
    () => rows.filter((r) => r.source === "seeded" && r.status === "active"),
    [rows]
  );

  // Reviewed rows grouped by their AI-assigned route. Pending rows are excluded
  // so they only ever appear in the Unreviewed Inbox.
  const reviewedByRoute = useMemo(() => {
    const map = new Map<EmailRoute, Row[]>();
    for (const r of rows) {
      if (!isReviewed(r)) continue;
      const bucket = map.get(r.route) ?? [];
      bucket.push(r);
      map.set(r.route, bucket);
    }
    return map;
  }, [rows]);

  const toggleSelect = (id: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );

  // Select all reviewed, active rows in a lane (pending rows aren't selectable).
  const toggleSectionSelect = (route: EmailRoute, checked: boolean) =>
    setRows((prev) =>
      prev.map((r) =>
        isReviewed(r) && r.route === route && r.status === "active"
          ? { ...r, selected: checked }
          : r
      )
    );

  const moveSelectedToTrash = () => {
    rows
      .filter((r) => r.selected && r.status === "active")
      .forEach((r) =>
        onAudit(
          createAuditEvent({
            actor: "user",
            eventType: "USER_MOVED_TO_TRASH",
            emailId: r.id,
            emailSubject: r.subject,
            details: `Moved to simulated Trash from ${r.route}.`,
          })
        )
      );
    setRows((prev) =>
      prev.map((r) =>
        r.selected ? { ...r, status: "trashed", selected: false } : r
      )
    );
  };

  // Row feedback: the user flags an email as mis-routed and picks the lane it
  // should have been in. Records the signal only — the email stays put.
  const flagWrongCategory = (id: string, suggestedRoute: EmailRoute) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    onAudit(
      createAuditEvent({
        actor: "user",
        eventType: "USER_FLAGGED_WRONG_CATEGORY",
        emailId: row.id,
        emailSubject: row.subject,
        details: `Was ${row.route}; user says it should be ${suggestedRoute}.`,
      })
    );
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, flaggedWrong: true, suggestedRoute } : r
      )
    );
    setPickerOpenId(null);
  };

  // Apply a classification result to a row: overwrite the routing fields and
  // mark it reviewed. Changing `route` re-groups the card into its new lane.
  const applyClassification = (
    id: string,
    c: EmailClassificationResult,
    source: Source
  ) =>
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              route: c.route,
              summary: c.summary,
              reason: c.reason,
              confidence: c.confidence,
              isProtected: c.isProtected,
              protectionReason: c.protectionReason ?? undefined,
              source,
            }
          : r
      )
    );

  const setClassifying = (id: string, on: boolean) =>
    setClassifyingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Log a "Safety guard applied" event when the AI result was forced to Manual
  // Review by a guard (protected record, or confidence below the 0.7 threshold).
  const logGuardIfAny = (row: Row, result: EmailClassificationResult) => {
    if (result.isProtected) {
      onAudit(
        createAuditEvent({
          actor: "system",
          eventType: "SYSTEM_PROTECTED_EMAIL",
          emailId: row.id,
          emailSubject: row.subject,
          details:
            result.protectionReason ??
            "Protected record → routed to Manual Review, never auto-cleaned.",
        })
      );
    } else if (result.confidence < 0.7) {
      onAudit(
        createAuditEvent({
          actor: "system",
          eventType: "SYSTEM_PROTECTED_EMAIL",
          emailId: row.id,
          emailSubject: row.subject,
          details: `Low confidence (${Math.round(
            result.confidence * 100
          )}%) → routed to Manual Review for a human to check.`,
        })
      );
    }
  };

  // Classify a single email via the API and apply its result. On any transport
  // failure the email falls back to Manual Review with an explicit reason.
  const runClassifier = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || classifyingIds.has(id)) return;
    setClassifying(id, true);
    try {
      const res = await fetch("/api/classify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: row.sender,
          subject: row.subject,
          bodyText: row.bodyText,
        }),
      });
      if (!res.ok) throw new Error(`Classifier responded ${res.status}`);
      // The API reports which engine actually classified the email.
      const isMock = res.headers.get("x-classifier-mode") === "mock";
      const result = (await res.json()) as EmailClassificationResult;
      applyClassification(id, result, "classifier");
      onAudit(
        createAuditEvent({
          actor: isMock ? "system" : "ai",
          eventType: isMock ? "MOCK_SORTED_ROUTE" : "AI_RECOMMENDED_ROUTE",
          emailId: row.id,
          emailSubject: row.subject,
          details: `Routed to ${routeTitle(result.route)} at ${Math.round(
            result.confidence * 100
          )}% confidence. ${result.reason}`,
        })
      );
      logGuardIfAny(row, result);
    } catch (err) {
      const fallback = fallbackToManualReview(
        `Classifier request failed: ${
          err instanceof Error ? err.message : "unknown error"
        }.`
      );
      applyClassification(id, fallback, "failed");
      onAudit(
        createAuditEvent({
          actor: "ai",
          eventType: "AI_RECOMMENDED_ROUTE",
          emailId: row.id,
          emailSubject: row.subject,
          details: `Safe fallback to Manual Review. ${fallback.reason}`,
        })
      );
      logGuardIfAny(row, fallback);
    } finally {
      setClassifying(id, false);
    }
  };

  // Run the AI classifier across every pending email in the inbox.
  const runAiReview = async () => {
    const ids = rows
      .filter((r) => r.source === "seeded" && r.status === "active")
      .map((r) => r.id);
    if (ids.length === 0) return;
    setReviewingAll(true);
    try {
      await Promise.all(ids.map((id) => runClassifier(id)));
    } finally {
      setReviewingAll(false);
    }
  };

  // Reset the whole demo: emails back to pending, selections cleared, audit
  // log emptied (via the parent).
  const resetDemo = () => {
    setRows(toRows(emails));
    setPickerOpenId(null);
    setClassifyingIds(new Set());
    onReset();
  };

  const pendingCount = pendingRows.length;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Demo header */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Promo Inbox Copilot
            </h1>
            <p className="text-xs text-zinc-500">
              AI-assisted routing for promotional emails, with protected-email
              guardrails.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAiReview}
              disabled={reviewingAll || pendingCount === 0}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {reviewingAll
                ? "Reviewing…"
                : `Run AI Review${pendingCount ? ` (${pendingCount})` : ""}`}
            </button>
            <button
              type="button"
              onClick={moveSelectedToTrash}
              disabled={selectedCount === 0}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Move to trash ({selectedCount})
            </button>
            <button
              type="button"
              onClick={resetDemo}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Unreviewed Inbox */}
        {pendingRows.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Unreviewed Inbox
              </h2>
              <span className="text-xs text-zinc-400">
                ({pendingRows.length})
              </span>
            </div>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
              {pendingRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="w-56 shrink-0">
                    <p className="truncate font-medium" title={row.subject}>
                      {row.subject}
                    </p>
                    <p className="truncate text-xs text-zinc-500" title={row.sender}>
                      {row.sender}
                    </p>
                  </div>
                  <p
                    className="min-w-0 flex-1 truncate text-xs text-zinc-400"
                    title={row.bodyText}
                  >
                    {row.bodyText}
                  </p>
                  <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400 sm:inline">
                    {STATUS_LABELS.seeded}
                  </span>
                  <button
                    type="button"
                    onClick={() => runClassifier(row.id)}
                    disabled={classifyingIds.has(row.id)}
                    className={`${ACTION_BTN} bg-indigo-50 text-indigo-700 ring-indigo-600/20 hover:bg-indigo-100`}
                  >
                    {classifyingIds.has(row.id) ? "Reviewing…" : "Run AI"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reviewed lanes */}
        {SECTIONS.map((section) => {
          const sectionRows = reviewedByRoute.get(section.route) ?? [];
          const activeRows = sectionRows.filter((r) => r.status === "active");
          const allSelected =
            activeRows.length > 0 && activeRows.every((r) => r.selected);

          return (
            <section key={section.route}>
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={activeRows.length === 0}
                  onChange={(e) =>
                    toggleSectionSelect(section.route, e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
                  aria-label={`Select all in ${section.title}`}
                />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {section.title}
                </h2>
                <span className="text-xs text-zinc-400">
                  ({sectionRows.length})
                </span>
              </div>

              <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                {sectionRows.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">
                    No emails routed here yet.
                  </p>
                ) : (
                  <div className="flex items-center gap-3 rounded-t-lg bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span className="w-3.5 shrink-0" aria-hidden />
                    <span className="w-56 shrink-0">Sender</span>
                    <span className="min-w-0 flex-1">Summary</span>
                    <span className="hidden w-24 shrink-0 lg:inline">Status</span>
                    <span className="w-11 shrink-0 text-center">Conf.</span>
                    <span className="shrink-0">Feedback</span>
                  </div>
                )}
                {sectionRows.map((row) => {
                  const trashed = row.status === "trashed";
                  const lowConfidence =
                    row.route === "manual_review" && row.confidence < 0.7;
                  return (
                    <div
                      key={row.id}
                      className={`flex items-center gap-3 px-3 py-2 text-sm ${
                        trashed ? "opacity-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={trashed}
                        onChange={() => toggleSelect(row.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 accent-zinc-900"
                        aria-label={`Select ${row.subject}`}
                      />

                      {/* Sender + subject */}
                      <div className="w-56 shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p
                            className={`truncate font-medium ${
                              trashed ? "line-through" : ""
                            }`}
                            title={row.subject}
                          >
                            {row.subject}
                          </p>
                          {row.isProtected && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              Protected
                            </span>
                          )}
                          {lowConfidence && !row.isProtected && (
                            <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/20">
                              Low confidence
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-zinc-500" title={row.sender}>
                          {row.sender}
                        </p>
                      </div>

                      {/* Summary + reason */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-zinc-700" title={row.summary}>
                          {row.summary}
                        </p>
                        <p className="truncate text-xs text-zinc-400" title={row.reason}>
                          {row.reason}
                        </p>
                        {lowConfidence && (
                          <p className="truncate text-xs text-rose-600">
                            ⚠ Low confidence → Manual Review fallback
                          </p>
                        )}
                        {row.isProtected && row.protectionReason && (
                          <p
                            className="truncate text-xs text-emerald-700"
                            title={row.protectionReason}
                          >
                            🔒 {row.protectionReason}
                          </p>
                        )}
                      </div>

                      {/* Review status */}
                      <span
                        className={`hidden w-24 shrink-0 truncate text-[10px] font-medium uppercase tracking-wide lg:inline ${
                          row.source === "failed"
                            ? "text-rose-600"
                            : "text-indigo-600"
                        }`}
                      >
                        {STATUS_LABELS[row.source]}
                      </span>

                      {/* Confidence */}
                      <span
                        className={`w-11 shrink-0 rounded-full text-center text-xs font-medium ring-1 ring-inset ${confidenceTone(
                          row.confidence
                        )}`}
                      >
                        {Math.round(row.confidence * 100)}%
                      </span>

                      {/* Actions + feedback */}
                      <div className="relative flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => runClassifier(row.id)}
                          disabled={classifyingIds.has(row.id)}
                          className={`${ACTION_BTN} bg-indigo-50 text-indigo-700 ring-indigo-600/20 hover:bg-indigo-100`}
                        >
                          {classifyingIds.has(row.id) ? "Reviewing…" : "Re-run AI"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPickerOpenId((cur) =>
                              cur === row.id ? null : row.id
                            )
                          }
                          aria-expanded={pickerOpenId === row.id}
                          title="Flag this email as mis-routed and pick where it belongs (feedback only)"
                          className={`${ACTION_BTN} ${
                            row.flaggedWrong
                              ? "bg-amber-600 text-white ring-amber-600"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20 hover:bg-amber-100"
                          }`}
                        >
                          {row.flaggedWrong
                            ? `Wrong → ${routeTitle(row.suggestedRoute)}`
                            : "Wrong category"}
                        </button>

                        {pickerOpenId === row.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Should have been…
                            </p>
                            {SECTIONS.filter(
                              (s) => s.route !== row.route
                            ).map((s) => (
                              <button
                                key={s.route}
                                type="button"
                                onClick={() =>
                                  flagWrongCategory(row.id, s.route)
                                }
                                className="block w-full rounded px-2 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                              >
                                {s.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
