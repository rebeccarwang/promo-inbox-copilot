# Promo Inbox Copilot

Promo Inbox Copilot is an AI-assisted workflow for organizing promotional emails while keeping risky or transactional emails out of automated cleanup.

The project focuses on building a review-first AI workflow around an LLM classifier: structured outputs, schema validation, protected-email guardrails, user feedback, audit logging, and evals over a labeled seed set.

## Demo
- Demo video: https://www.loom.com/share/025c8cc0dbfc4c45bf5651c820ac86f5

## Problem

Promotional inboxes are noisy. Real discounts, newsletters, and back-in-stock alerts are buried under generic marketing, and occasionally transactional mail gets miscategorized into the mix: a receipt, shipping notice, billing record, or security alert that should not be swept into cleanup.

That last group is uncommon but high-stakes, and it's why a basic classifier is not enough; some emails should not be automatically deleted. Promo Inbox Copilot treats the model as one part of a larger controlled workflow rather than blindly trusting every classification.

## What It Does

The app reviews seeded promotional emails and routes them into lanes:

- **Cleanup Review**: generic marketing and low-value promos
- **Deal Digest**: real discounts, coupon codes, and limited-time offers
- **Subscription Digest**: newsletters and recurring updates
- **Restock Alerts**: back-in-stock and waitlist availability emails
- **Manual Review**: protected, uncertain, suspicious, or non-promotional emails

Users can review AI recommendations, provide feedback, and move selected cleanup candidates to simulated trash. Nothing is deleted automatically.

## Key Features

- LLM-backed email classification (OpenAI)
- Structured classifier output with route, summary, confidence, reason, protected-email flag, and optional extracted fields
- Zod validation for model responses
- Safety fallback to Manual Review for invalid, low-confidence, protected, or suspicious outputs
- Protected-email guardrails for receipts, shipping notices, billing records, order confirmations, account/security emails, and similar transactional messages
- User feedback controls for incorrect classifications
- Visible audit trail for AI decisions, safety guardrails, user corrections, and simulated trash actions
- Mock classifier mode for deterministic local development (no API key required)
- LLM eval script over labeled seeded emails, with hard safety invariants

## Tech Stack

- **Next.js** (App Router) + **React**
- **TypeScript**
- **Tailwind CSS**
- **Zod** for structured-output schema validation
- **OpenAI** Chat Completions API (called directly via `fetch`, no SDK dependency)

## Architecture

```text
Seeded Emails
   ↓
Dashboard Review UI
   ↓
/api/classify-email
   ↓
LLM Classifier
   ↓
Zod Schema Validation
   ↓
Manual Review Fallbacks
   ↓
Routed Email Lanes
   ↓
User Feedback + Audit Log
   ↓
Eval Harness over Seeded Emails
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- An OpenAI API key (only needed for real LLM mode; see below)

### Install

```bash
npm install
```

### Run the app

```bash
npm run dev
```

Then open http://localhost:3000.

By default the app runs in **mock classifier mode**, which uses deterministic keyword rules and requires no API key, so you can clone and run it immediately.

### Classifier modes

The classifier has two modes, selected by environment variables:

| Mode | When it's used | Requirements |
| --- | --- | --- |
| **Mock** (default) | `CLASSIFIER_MODE` is unset or not `llm` | None |
| **LLM** | `CLASSIFIER_MODE=llm` **and** `OPENAI_API_KEY` is set | OpenAI API key |

If `CLASSIFIER_MODE=llm` is set but no API key is present, the app safely falls back to mock mode rather than failing.

### Environment variables

Create a `.env` file in the project root:

```bash
# Enable the real LLM classifier (omit to stay in mock mode)
CLASSIFIER_MODE=llm

# Required when CLASSIFIER_MODE=llm
OPENAI_API_KEY=sk-...

# Optional; defaults to gpt-5-mini
OPENAI_MODEL=gpt-5-mini
```

`.env` is git-ignored and is never committed.

## Evals

The project includes an eval harness that runs the classifier against the labeled seed set and reports route accuracy plus safety invariants (protected and prompt-injection emails must never escape Manual Review; a violation fails the run).

```bash
# Mock classifier (no API key, deterministic)
npm run eval:mock

# Real OpenAI classifier (requires CLASSIFIER_MODE=llm and OPENAI_API_KEY)
npm run eval:llm
```

The LLM eval exercises the exact same classification and safety-guard code path as `/api/classify-email`, so a passing eval reflects real production behavior.

## Project Structure

```text
app/
  Inbox.tsx                     Dashboard review UI
  page.tsx, layout.tsx          App shell
  api/classify-email/route.ts   Classification endpoint; dispatches mock vs LLM
components/
  AuditLog.tsx                  Visible audit trail UI
lib/
  seedEmails.ts                 Labeled seed email set
  classifyEmail.ts              Deterministic keyword (mock) classifier
  llmClassifier.ts              OpenAI classifier + post-validation safety guards
  classificationSchema.ts       Zod schema, parsing, and safe fallbacks
  auditLog.ts                   Audit log model
scripts/
  evalCore.ts                   Shared eval reporting and safety metrics
  evalMock.ts                   Mock-classifier eval
  evalLlm.ts                    Real OpenAI eval
```

## Scope & Limitations

This is a portfolio project scoped to demonstrate a review-first AI workflow. Several things are intentionally out of scope for this version:

- **Emails are seeded from a local file**. There is no Gmail integration or OAuth.
- **Trash is simulated**. No email is ever actually deleted, and there is no autonomous deletion.
- **No authentication, accounts, payments, unsubscribe flow, or real push notifications.**
- **Email body content is treated as untrusted data** and is never followed as instructions by the classifier.

These are deliberate boundaries; the goal is to showcase structured model outputs, guardrail design, and approval-gated actions.

## License

This is a personal portfolio project shared for demonstration and review. It is **not licensed for reuse**. No permission is granted to copy, modify, or redistribute the code. All rights reserved.
