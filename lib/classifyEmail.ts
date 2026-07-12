import type { EmailClassificationResult } from "@/lib/classificationSchema";

// Deterministic, offline keyword classifier. This is the "mock" engine used
// when the LLM is disabled, and the shared core that both the API route and the
// eval harness run — so classification rules live in exactly one place.
//
// It intentionally does no network I/O and is fully synchronous, which is what
// lets the eval script run it against the seeded emails without any API key.

export type ClassifyInput = {
  sender: string;
  subject: string;
  bodyText: string;
};

// Returns the first matching keyword, or null if none match.
function firstMatch(text: string, keywords: string[]): string | null {
  return keywords.find((k) => text.includes(k)) ?? null;
}

// Rules are checked in priority order: protected first (safety), then the more
// specific promo types, and finally an uncertain fallback.
export function classify({ sender, subject, bodyText }: ClassifyInput): EmailClassificationResult {
  const text = `${sender} ${subject} ${bodyText}`.toLowerCase();

  const protectedHit = firstMatch(text, [
    "receipt",
    "invoice",
    "billing",
    "payment",
    "order confirmation",
    // Specific shipping-notice terms — not bare "shipping", which would also
    // match promotional "free shipping".
    "shipped",
    "shipment",
    "tracking number",
    "shipping notice",
    "shipping notification",
    "security",
    "password",
    "login",
    "account",
  ]);
  if (protectedHit) {
    return {
      emailType: "protected",
      route: "manual_review",
      summary: `Transactional or account email (matched "${protectedHit}").`,
      reason: `Protected-record keyword "${protectedHit}" detected (receipt/billing/shipping/security). Routed to manual review, never auto-cleaned.`,
      confidence: 0.9,
      extractedOffer: null,
      productName: null,
      expiresAt: null,
      isProtected: true,
      protectionReason: `Protected as a transactional or account/security record (matched "${protectedHit}").`,
    };
  }

  const restockHit = firstMatch(text, [
    "back in stock",
    "available again",
    "waitlist",
    "restocked",
    "restock",
  ]);
  if (restockHit) {
    return {
      emailType: "restock",
      route: "restock_alert",
      summary: `Item restock notification (matched "${restockHit}").`,
      reason: `Restock keyword "${restockHit}" detected.`,
      confidence: 0.85,
      extractedOffer: null,
      productName: null,
      expiresAt: null,
      isProtected: false,
      protectionReason: null,
    };
  }

  const discountHit = firstMatch(text, [
    "coupon",
    "promo code",
    "discount",
    "% off",
    "sale ends",
    "free shipping",
  ]);
  if (discountHit) {
    return {
      emailType: "discount",
      route: "deal_digest",
      summary: `Discount or promo offer (matched "${discountHit}").`,
      reason: `Discount keyword "${discountHit}" detected.`,
      confidence: 0.83,
      extractedOffer: discountHit,
      productName: null,
      expiresAt: null,
      isProtected: false,
      protectionReason: null,
    };
  }

  const newsletterHit = firstMatch(text, [
    "newsletter",
    "weekly digest",
    "digest",
    "roundup",
    "article",
    "update",
  ]);
  if (newsletterHit) {
    return {
      emailType: "newsletter",
      route: "subscription_digest",
      summary: `Recurring newsletter or digest (matched "${newsletterHit}").`,
      reason: `Newsletter keyword "${newsletterHit}" detected.`,
      confidence: 0.8,
      extractedOffer: null,
      productName: null,
      expiresAt: null,
      isProtected: false,
      protectionReason: null,
    };
  }

  const promoHit = firstMatch(text, [
    "new arrival",
    "back by popular demand",
    "just dropped",
  ]);
  if (promoHit) {
    return {
      emailType: "generic_promo",
      route: "cleanup_review",
      summary: `Vague promotional email (matched "${promoHit}").`,
      reason: `Generic promo keyword "${promoHit}" detected; low-value marketing.`,
      confidence: 0.6,
      extractedOffer: null,
      productName: null,
      expiresAt: null,
      isProtected: false,
      protectionReason: null,
    };
  }

  // Nothing matched — don't guess, send it to manual review.
  return {
    emailType: "uncertain",
    route: "manual_review",
    summary: "Could not confidently classify this email.",
    reason: "No routing keywords matched. Defaulting to manual review.",
    confidence: 0.3,
    extractedOffer: null,
    productName: null,
    expiresAt: null,
    isProtected: false,
    protectionReason: null,
  };
}
