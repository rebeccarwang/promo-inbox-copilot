This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Classifier evals

There are two eval modes for the email classifier. Both grade predicted routes
against `SeedEmail.route` (the answer key) and check the safety invariants
(protected/transactional and prompt-injection emails must land in
`manual_review`).

- **`npm run eval:mock`** — cheap, deterministic regression check against the
  keyword classifier. No API key, no network; safe to run on every
  typecheck/commit. Good for catching schema, route-label, protected-invariant,
  and plumbing regressions. It does **not** measure real AI behavior. Exits
  non-zero on any failed check.

- **`npm run eval:llm`** — evaluates the **real OpenAI classifier** (the same
  `classifyWithLLM` + safety-guard code path as `/api/classify-email`) against
  the seeded emails. Run it intentionally/manually — it never runs during
  typecheck or dev. Requires `CLASSIFIER_MODE=llm` and `OPENAI_API_KEY` (read
  from `.env`), and makes one API call per active seeded email. Route mismatches
  are tolerated while the prompt is being tuned, but any safety-invariant
  failure (a protected or injection email escaping `manual_review`, especially
  into `cleanup_review`) fails the run.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
