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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Review Revisions

The `/review` page supports three actions on each pending article: **Approve**, **Request revision**, and **Reject**. Approve and Reject behave as before. Request revision opens an inline annotation flow:

1. Select any text in the article body — a 💬 popover appears.
2. Click it to attach an inline comment.
3. Add overall notes in the right-hand drawer if you want whole-piece feedback.
4. Tick "Also regenerate the image" + add image-context guidance if the image needs a fresh attempt.
5. Click **Send to reviser**. A status banner polls every 2s; ~30s later the page reloads with a fresh draft (`status: pending`, `revision_round` incremented).

### Architecture

- **`POST /api/review/revision`** — accepts the annotation payload, writes a JSON sidecar, flips the article to `status: revision-requested`, spawns the reviser-agent as a detached process. Dev-only (403 in production).
- **`GET /api/review/revision/status?id=<jobId>`** — polled by the UI; returns the current job record.
- **`reviser-agent`** — lives at `~/Desktop/ssnn-outputs/reviser-agent/`. Reads the article + sidecar, calls the LLM via the Claude CLI, validates the output (4 sanity rules), writes the revised draft back to the site repo, and optionally re-invokes the image-agent with `--revision-context` for a fresh image.

### Filesystem layout (agent side)

```
~/Desktop/ssnn-outputs/
  review-requests/{vertical}/{slug}.review-request.json   # in-flight request
  review-jobs/{jobId}.json                                # job status records
  review-jobs/{jobId}.log                                 # per-job logs
  review-archive/{slug}/{ISO-timestamp}/                  # original .md + sidecar, kept forever
```

### Recovery

To roll back a revision:
```bash
# Find the archive
ls ~/Desktop/ssnn-outputs/review-archive/<slug>/
# Copy the original back
cp ~/Desktop/ssnn-outputs/review-archive/<slug>/<timestamp>/original.md \
   "<site-repo>/src/content/<vertical>/<original-filename>.md"
```

### Environment

Defaults assume `~/Desktop/ssnn-outputs/`. Override via `.env.local` if needed:

```
REVISER_AGENT_PATH=...
SSNN_REVIEW_REQUESTS_ROOT=...
SSNN_REVIEW_JOBS_ROOT=...
```

See `.env.local.example` for the full list.
