// Client-side audit log for important workflow events.
// No persistence, network, or backend — events live in React state only.

export type AuditActor = "system" | "user" | "ai";

export type AuditEventType =
  | "SYSTEM_PROTECTED_EMAIL"
  | "USER_FLAGGED_WRONG_CATEGORY"
  | "USER_MOVED_TO_TRASH"
  | "USER_CREATED_PREFERENCE"
  | "SYSTEM_APPLIED_PREFERENCE"
  | "AI_RECOMMENDED_ROUTE"
  | "MOCK_SORTED_ROUTE";

export type AuditEvent = {
  id: string;
  emailId?: string;
  emailSubject?: string;
  eventType: AuditEventType;
  details: string;
  createdAt: string; // ISO timestamp
  actor: AuditActor;
};

// Human-readable labels for each event type.
export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  SYSTEM_PROTECTED_EMAIL: "Safety guard applied",
  USER_FLAGGED_WRONG_CATEGORY: "User feedback recorded",
  USER_MOVED_TO_TRASH: "Moved to simulated trash",
  USER_CREATED_PREFERENCE: "Preference created",
  SYSTEM_APPLIED_PREFERENCE: "Preference applied",
  AI_RECOMMENDED_ROUTE: "Reviewed by AI",
  MOCK_SORTED_ROUTE: "Sorted by keyword rules",
};

type CreateAuditEventInput = Omit<AuditEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

// Builds an AuditEvent, filling in id/createdAt when not provided.
export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    actor: input.actor,
    eventType: input.eventType,
    details: input.details,
    emailId: input.emailId,
    emailSubject: input.emailSubject,
  };
}
