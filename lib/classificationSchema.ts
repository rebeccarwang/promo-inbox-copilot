import { z } from "zod";
import type { EmailRoute } from "./seedEmails";

// Validates future AI email-classifier output. Not wired to any UI, API,
// or model yet — this is the contract we'll validate responses against.

export const EmailTypeSchema = z.enum([
  "generic_promo",
  "discount",
  "newsletter",
  "restock",
  "protected",
  "uncertain",
]);

// Routes the classifier may assign. `satisfies` keeps these in lockstep with
// the existing EmailRoute union so the schema can't drift to an invalid route.
const EMAIL_ROUTES = [
  "cleanup_review",
  "deal_digest",
  "subscription_digest",
  "restock_alert",
  "manual_review",
] as const satisfies readonly EmailRoute[];

// Compile-time guard: errors if EmailRoute gains a value not listed above.
type MissingRoutes = Exclude<EmailRoute, (typeof EMAIL_ROUTES)[number]>;
const _allRoutesCovered: MissingRoutes extends never ? true : false = true;
void _allRoutesCovered;

export const EmailClassificationSchema = z.object({
  emailType: EmailTypeSchema,
  route: z.enum(EMAIL_ROUTES),
  summary: z.string().max(120),
  reason: z.string().max(180),
  confidence: z.number().min(0).max(1),
  extractedOffer: z.string().nullable(),
  productName: z.string().nullable(),
  expiresAt: z.string().nullable(),
  isProtected: z.boolean(),
  protectionReason: z.string().nullable(),
});

export type EmailClassificationResult = z.infer<typeof EmailClassificationSchema>;

// Safe fallback: when the classifier output can't be validated, we don't trust
// it — the email is treated as uncertain and routed to manual_review for a
// human to look at, never auto-cleaned.
export function fallbackToManualReview(
  reason = "Classifier output failed validation."
): EmailClassificationResult {
  return {
    emailType: "uncertain",
    route: "manual_review",
    summary: "Could not classify this email with confidence.",
    reason,
    confidence: 0,
    extractedOffer: null,
    productName: null,
    expiresAt: null,
    isProtected: false,
    protectionReason: null,
  };
}

// Validates raw classifier output. Returns the parsed result on success, or the
// manual_review fallback on any validation failure.
export function parseClassification(input: unknown): EmailClassificationResult {
  const result = EmailClassificationSchema.safeParse(input);
  return result.success
    ? result.data
    : fallbackToManualReview(
        `Classifier output failed validation: ${result.error.issues
          .map((i) => i.message)
          .join("; ")}`
      );
}
