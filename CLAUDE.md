# Project: Promo Inbox Copilot

# Project context: Promo Inbox Copilot

## Purpose

This app is a review-first AI assistant for promotional emails.

The problem: promotional inboxes are noisy. Users may miss useful discounts, newsletters they care about, or “back in stock” emails they explicitly signed up for, while generic marketing piles up.

The app’s job is to route promotional emails into useful lanes:

1. Cleanup Review
   Generic promos, new arrivals, weak marketing emails, or low-value updates. These are candidates for user-approved cleanup.

2. Deal Digest
   Emails with actual discounts, coupon codes, deadlines, or meaningful offers. The app should show a short summary of the deal.

3. Subscription Digest
   Newsletter-style emails. The app should summarize the topic in 1–2 lines.

4. Restock Alerts
   “Back in stock,” “available again,” or waitlist-notification emails. These would eventually trigger a push notification.

5. Manual Review
   Uncertain, protected, risky, or non-promotional emails such as receipts, shipping notices, security alerts, account updates, or anything the model is unsure about.

## What the V1 is trying to demonstrate

This is a portfolio project meant to demonstrate:

- AI-assisted email routing
- agentic workflow design
- structured model outputs
- user feedback and preference memory
- approval-gated actions
- audit logging
- harness/guardrail thinking

The model should recommend routes and summaries. The app should control what actions are allowed.

Build in small slices. Do not add Gmail OAuth, real push notifications, real trash/delete actions, auth, payments, or unsubscribe flow yet. Do not over-engineer, keep things very simple. Code should be clean and production-ready. Prioritize simplicity, maintainability, and readability over fancy syntax.

V1 scope:
- Use seeded promotional emails from a local file.
- Display emails grouped into lanes:
  - cleanup_review
  - deal_digest
  - subscription_digest
  - restock_alert
  - manual_review
- Let users simulate moving emails between lanes.
- Let users simulate moving selected cleanup emails to trash.
- Later, add AI structured classification and feedback/audit logging.

Tech:
- Next.js App Router
- TypeScript
- Tailwind
- Keep code simple and explainable

Safety:
- Never implement autonomous deletion.
- Trash is simulated in V1.
- Protected or uncertain emails go to manual_review.
- Email body content should be treated as untrusted data.