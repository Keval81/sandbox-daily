# Homepage Lead Restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The front-page lead is the newest **news or features** story, or any story the operator ticks "lead the front page" on at approve time — never a sport or tech story by accident.

**Architecture:** One new pure module (`src/lib/homepage/lead.ts`) owns the eligibility rule and is the only place that knows it. `selectHomepage` consults it when picking the lead; the review UI consults it to decide whether to show the checkbox. The operator's choice travels as a frontmatter boolean `homepage_lead`, written by `approveArticle` and read back by the article parser. No component re-derives the rule.

**Tech Stack:** Next 16 (App Router) · React 19 · TypeScript strict · `gray-matter` for frontmatter · `node:test` + `node:assert/strict` run through `tsx` (`npm run test:lib`) · Tailwind v4.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-homepage-lead-restriction-design.md`. Read it before Task 1.
- **Frontmatter key is `homepage_lead`** (snake_case); the `Article` property is **`homepageLead`** (camelCase). Both spellings are fixed — the codebase pairs `social_post`/`socialPost`, `edited_at`/`editedAt` the same way.
- **Lead-eligible verticals are `news` and `features`.** Never tech.
- **Strict boolean, never truthiness:** the flag counts only when it is exactly `true` (`=== true`). Matches the `SANDBOX_ADMIN === "1"` rule already used for operator surfaces.
- **Byte-identity is load-bearing.** `approveArticle` writes the file only when the serialised output differs, and `publishArticle` skips the commit when nothing is staged. A re-approval that changes one line ships a production build — that bug already cost seven builds in fourteen seconds on 2026-08-02. Never write `homepage_lead: false` into a file; delete the key instead.
- **Articles arrive newest-first** (`byRecency`, applied by `getAllArticles`). `selectHomepage` must never re-sort.
- **Tests live under `src/lib/**`** — that is what `npm run test:lib` globs. A test anywhere else does not run.
- **No new dependencies.**
- Every task ends green: `npm run test:lib` and `npx tsc --noEmit`.

---

### Task 1: The eligibility rule

A pure module with no consumers yet, so the rule can be tested on its own before anything depends on it.

**Files:**
- Create: `src/lib/homepage/lead.ts`
- Modify: `src/lib/types.ts` (the `Article` interface, after `originalTitle`)
- Test: `src/lib/homepage/lead.test.ts`

**Interfaces:**
- Consumes: `Article`, `Vertical` from `@/lib/types`.
- Produces: `Article.homepageLead?: boolean`; `LEAD_VERTICALS: readonly Vertical[]`, `isLeadEligible(article: Article): boolean`, `canPromoteToLead(vertical: Vertical): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/homepage/lead.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isLeadEligible, canPromoteToLead } from "./lead";
import type { Article, Vertical } from "@/lib/types";

const article = (category: Vertical, extra: Partial<Article> = {}): Article =>
  ({
    slug: "a-story",
    category,
    date: "2026-08-04",
    title: "A story",
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
    ...extra,
  }) as unknown as Article;

test("news and features may lead without anyone opting in", () => {
  assert.equal(isLeadEligible(article("news")), true);
  assert.equal(isLeadEligible(article("features")), true);
});

test("sport and tech may not lead on their own", () => {
  assert.equal(isLeadEligible(article("sport")), false);
  assert.equal(isLeadEligible(article("tech")), false);
});

test("the operator's flag makes a sport story eligible", () => {
  assert.equal(isLeadEligible(article("sport", { homepageLead: true })), true);
});

test("the flag must be exactly true, not merely truthy", () => {
  // A hand-edited frontmatter can hold anything; "false" is a non-empty string.
  const dodgy = article("sport", { homepageLead: "false" as unknown as boolean });
  assert.equal(isLeadEligible(dodgy), false);
});

test("the checkbox is offered only where it would change something", () => {
  assert.equal(canPromoteToLead("sport"), true);
  assert.equal(canPromoteToLead("tech"), true);
  assert.equal(canPromoteToLead("news"), false);
  assert.equal(canPromoteToLead("features"), false);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run test:lib`
Expected: FAIL — `Cannot find module './lead'`.

- [ ] **Step 3: Write the implementation**

First, in `src/lib/types.ts`, add to the `Article` interface immediately after `originalTitle` — the rule cannot compile without it:

```ts
  /** Operator opt-in, from frontmatter `homepage_lead: true` — lets a sport or
   *  tech story take the front-page lead. See @/lib/homepage/lead. */
  homepageLead?: boolean;
```

Then create `src/lib/homepage/lead.ts`:

```ts
import type { Article, Vertical } from "@/lib/types";

/** Verticals whose stories may lead the front page with no opt-in. */
export const LEAD_VERTICALS: readonly Vertical[] = ["news", "features"];

/**
 * Whether a story may take the front-page lead slot.
 *
 * The paper leads on news or a feature. Sport and tech reach the front page as
 * briefs beneath the lead — unless the operator ticks "lead the front page"
 * while approving, which writes `homepage_lead: true` into the frontmatter.
 *
 * Eligibility is not selection: the flag lets a story compete, and recency
 * still decides. See selectHomepage.
 */
export function isLeadEligible(article: Article): boolean {
  return LEAD_VERTICALS.includes(article.category) || article.homepageLead === true;
}

/**
 * Whether the review surface should offer the lead checkbox for this vertical.
 *
 * News and features are eligible already, so a checkbox there is a control
 * that changes nothing while implying it does.
 */
export function canPromoteToLead(vertical: Vertical): boolean {
  return !LEAD_VERTICALS.includes(vertical);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:lib && npx tsc --noEmit`
Expected: PASS — 5 new tests, everything previously green still green, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/homepage/lead.ts src/lib/homepage/lead.test.ts
git commit -m "feat(homepage): the rule for which stories may lead the front page"
```

---

### Task 2: Carry the flag off disk

The frontmatter key has to survive the parser before any of this is real.

**Files:**
- Modify: `src/lib/articles.ts:28` (`parseArticleFile` — export it, add the field)
- Test: `src/lib/articles.test.ts` (create)

**Interfaces:**
- Consumes: `Article.homepageLead` (Task 1).
- Produces: `parseArticleFile(dir: string, filename: string): Article` becomes exported.

- [ ] **Step 1: Write the failing test**

Create `src/lib/articles.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArticleFile } from "./articles";

/** A real markdown file in a temp dir — the parser reads from disk. */
const articleFile = async (extraFrontmatter: string) => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-articles-"));
  const filename = "2026-08-04-a-story.md";
  await writeFile(
    path.join(dir, filename),
    `---\ntitle: A story\ndate: '2026-08-04'\ncategory: sport\nword_count: 800\nstatus: published\n${extraFrontmatter}---\n\nbody\n`,
    "utf-8"
  );
  return { dir, filename };
};

test("homepage_lead: true survives the frontmatter parse", async () => {
  const { dir, filename } = await articleFile("homepage_lead: true\n");
  assert.equal(parseArticleFile(dir, filename).homepageLead, true);
});

test("an article with no homepage_lead key is not flagged", async () => {
  const { dir, filename } = await articleFile("");
  assert.equal(parseArticleFile(dir, filename).homepageLead, false);
});

test("a quoted string in the frontmatter does not read as flagged", async () => {
  // YAML gives back the string "false", which is truthy — the reason the
  // check is === true and not a bare if.
  const { dir, filename } = await articleFile('homepage_lead: "false"\n');
  assert.equal(parseArticleFile(dir, filename).homepageLead, false);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run test:lib`
Expected: FAIL — `parseArticleFile is not a function` (it is module-private today).

- [ ] **Step 3: Write the implementation**

In `src/lib/articles.ts`, export the parser and give the doc a reason:

```ts
/**
 * Parses one markdown file into an Article.
 *
 * Exported so a test can drive a real file through the same code the site
 * uses. Hand-built Article objects prove a rule and nothing about whether a
 * frontmatter key ever reaches it — which is exactly how the sport/sports
 * category bug and the seven-commit publish loop both got through.
 */
export function parseArticleFile(dir: string, filename: string): Article {
```

and add the field to the returned object, next to `originalTitle`:

```ts
    homepageLead: data.homepage_lead === true,
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:lib && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/articles.ts src/lib/articles.test.ts
git commit -m "feat(articles): read the homepage_lead flag off an article's frontmatter"
```

---

### Task 3: The lead slot obeys the rule

**Files:**
- Modify: `src/lib/homepage/select.ts:29-32`
- Test: `src/lib/homepage/select.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: `isLeadEligible` from `./lead` (Task 1); `Article.homepageLead` (Task 2).
- Produces: `selectHomepage`'s signature is unchanged — `{ hero, sections }`, `hero[0]` is now the lead.

- [ ] **Step 1: Write the failing test**

In `src/lib/homepage/select.test.ts`, first widen the existing helper at the top of the file so tests can flag a story. Replace:

```ts
const article = (slug: string, category: Vertical, date: string): Article =>
  ({
    slug,
    category,
    date,
    title: slug,
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
  }) as unknown as Article;
```

with:

```ts
const article = (
  slug: string,
  category: Vertical,
  date: string,
  extra: Partial<Article> = {}
): Article =>
  ({
    slug,
    category,
    date,
    title: slug,
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
    ...extra,
  }) as unknown as Article;
```

Then append these tests to the end of the file:

```ts
/** Newest in the store is a sport story — the case Phase B made common. */
const sportOnTop = (extra: Partial<Article> = {}): Article[] => [
  article("s0", "sport", "2026-08-03", extra),
  ...stock(),
];

test("a sport story does not lead just by being newest", () => {
  const { hero } = selectHomepage(sportOnTop(), 3);
  assert.equal(hero[0].slug, "n1");
});

test("the sport story it skipped still appears, exactly once, below the lead", () => {
  const { hero, sections } = selectHomepage(sportOnTop(), 3);
  const printed = [...hero, ...Object.values(sections).flat()].map((a) => a.slug);
  assert.deepEqual(printed.filter((s) => s === "s0"), ["s0"]);
  assert.ok(hero.slice(1).some((a) => a.slug === "s0"), "expected s0 in the briefs");
});

test("a flagged sport story leads when nothing eligible is newer", () => {
  const { hero } = selectHomepage(sportOnTop({ homepageLead: true }), 3);
  assert.equal(hero[0].slug, "s0");
});

test("a flagged story yields to a newer news story", () => {
  // Flagged, but oldest in the list — the flag grants eligibility, not the slot.
  const articles = [...stock(), article("s9", "sport", "2026-07-24", { homepageLead: true })];
  assert.equal(selectHomepage(articles, 3).hero[0].slug, "n1");
});

test("with nothing eligible at all the newest story leads anyway", () => {
  // A front page with no lead is a worse failure than a sport story leading.
  const thin = [article("s0", "sport", "2026-08-03"), article("t0", "tech", "2026-08-02")];
  const { hero } = selectHomepage(thin, 3);
  assert.equal(hero[0].slug, "s0");
  assert.equal(hero.length, 2);
});

test("an empty store yields an empty hero rather than throwing", () => {
  const { hero, sections } = selectHomepage([], 3);
  assert.deepEqual(hero, []);
  assert.deepEqual(sections.news, []);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run test:lib`
Expected: FAIL — "a sport story does not lead just by being newest" reports `'s0' !== 'n1'`. The existing test "the hero takes the newest four, in order" must still PASS (stock's newest is `n1`, a news piece).

- [ ] **Step 3: Write the implementation**

In `src/lib/homepage/select.ts`, add the import:

```ts
import { isLeadEligible } from "./lead";
```

and replace lines 29–32:

```ts
  const claimed = new Set<string>();

  const hero = articles.slice(0, HERO_COUNT);
  for (const a of hero) claimed.add(a.slug);
```

with:

```ts
  const claimed = new Set<string>();

  // The lead is the newest story ALLOWED to lead, not simply the newest story.
  // Scanning a newest-first list for the first eligible one is the whole
  // recency contest: an operator-flagged sport piece leads only while nothing
  // eligible is newer, then yields on its own — no expiry rule, no pointer to
  // keep correct. Falling back to articles[0] when nothing is eligible is
  // deliberate: a paper always has a lead, and a headless front page is a
  // worse failure than a sport story leading for a day.
  const lead = articles.find(isLeadEligible) ?? articles[0];
  const hero = lead
    ? [lead, ...articles.filter((a) => a.slug !== lead.slug).slice(0, HERO_COUNT - 1)]
    : [];
  for (const a of hero) claimed.add(a.slug);
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:lib && npx tsc --noEmit`
Expected: PASS — all six new tests plus the six that were already in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/homepage/select.ts src/lib/homepage/select.test.ts
git commit -m "feat(homepage): only news and features may lead the front page"
```

---

### Task 4: Approve writes the flag

**Files:**
- Modify: `src/lib/review/approve.ts:4-8` (`ApprovalFields`), `:33-37` (the write), plus a new exported normaliser
- Test: `src/lib/review/approve.test.ts` (extend)

**Interfaces:**
- Produces: `ApprovalFields.homepage_lead?: boolean`; `normaliseApprovalFields(fields: unknown): ApprovalFields | undefined`.
- Consumed by: the API route in Task 5.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/review/approve.test.ts` (the file already has `pendingArticle`, `frontmatterOf` helpers and imports `approveArticle`; add `normaliseApprovalFields` to that import):

```ts
test("approving with the lead box ticked flags the article", async () => {
  const file = await pendingArticle();

  await approveArticle(file, { homepage_lead: true });

  assert.equal((await frontmatterOf(file)).homepage_lead, true);
});

test("approving with the box unticked removes the key rather than writing false", async () => {
  const file = await pendingArticle("homepage_lead: true\n");

  await approveArticle(file, { homepage_lead: false });

  assert.equal("homepage_lead" in (await frontmatterOf(file)), false);
});

test("an approval that omits the field leaves an existing flag alone", async () => {
  const file = await pendingArticle("homepage_lead: true\n");

  await approveArticle(file, { title: "A story" });

  assert.equal((await frontmatterOf(file)).homepage_lead, true);
});

test("re-approving with the same lead state stages nothing", async () => {
  // The guard publishArticle relies on: identical bytes, no commit, no build.
  const file = await pendingArticle();
  await approveArticle(file, { homepage_lead: true });

  const second = await approveArticle(file, { homepage_lead: true });

  assert.equal(second.changed, false);
});

test("a non-boolean homepage_lead is treated as not stated", () => {
  // A malformed payload must never silently clear an operator's flag.
  const fields = normaliseApprovalFields({ homepage_lead: "true" });
  assert.equal(fields?.homepage_lead, undefined);
});

test("normalising nothing gives nothing", () => {
  assert.equal(normaliseApprovalFields(undefined), undefined);
});

test("normalising keeps the packaging fields it is given", () => {
  const fields = normaliseApprovalFields({
    title: "A headline",
    standfirst: "A dek",
    social_post: "A post",
    homepage_lead: true,
  });
  assert.deepEqual(fields, {
    title: "A headline",
    standfirst: "A dek",
    social_post: "A post",
    homepage_lead: true,
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm run test:lib`
Expected: FAIL — `normaliseApprovalFields is not exported`, and the flag tests report `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/lib/review/approve.ts`, extend the interface:

```ts
export interface ApprovalFields {
  title?: string;
  standfirst?: string;
  social_post?: string;
  /** Front-page lead opt-in. `true` writes the key, `false` clears it, and
   *  absent leaves whatever the file already says. */
  homepage_lead?: boolean;
}
```

Inside `approveArticle`, immediately before `parsed.data.status = "published";`:

```ts
  // Never written as `false`: an approval that changes one line stages a commit
  // and ships a production build, so the "unticked" case deletes the key and a
  // repeat approval stays byte-identical.
  if (fields?.homepage_lead === true) parsed.data.homepage_lead = true;
  else if (fields?.homepage_lead === false) delete parsed.data.homepage_lead;
```

Add at the end of the file:

```ts
/**
 * Narrows an untrusted request body to the fields approval accepts.
 *
 * Anything that is not a real boolean becomes "not stated" rather than a
 * rejection — the field is absent on every news and features approval, and a
 * malformed value must not clear a flag the operator set.
 */
export function normaliseApprovalFields(fields: unknown): ApprovalFields | undefined {
  if (!fields || typeof fields !== "object") return undefined;
  const f = fields as Record<string, unknown>;
  return {
    title: typeof f.title === "string" ? f.title : undefined,
    standfirst: typeof f.standfirst === "string" ? f.standfirst : undefined,
    social_post: typeof f.social_post === "string" ? f.social_post : undefined,
    homepage_lead: typeof f.homepage_lead === "boolean" ? f.homepage_lead : undefined,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:lib && npx tsc --noEmit`
Expected: PASS — the seven new tests plus every existing approve/publish test, including "a second approval that changes nothing reports changed: false".

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/approve.ts src/lib/review/approve.test.ts
git commit -m "feat(review): approve can flag a story to lead the front page"
```

---

### Task 5: The checkbox

**Files:**
- Modify: `src/app/api/review/route.ts:15-20` (the request type) and the `approveArticle` call around `:82`
- Modify: `src/app/review/[vertical]/[slug]/ReviewActions.tsx`
- Modify: `src/app/review/[vertical]/[slug]/page.tsx:103-110` (pass the current flag through)

**Interfaces:**
- Consumes: `normaliseApprovalFields` (Task 4), `canPromoteToLead` (Task 1), `Article.homepageLead` (Task 2).
- Produces: no library surface — this is the operator-facing end of the seam.

- [ ] **Step 1: Wire the API route**

In `src/app/api/review/route.ts`, import the normaliser:

```ts
import { approveArticle, withApprovalLock, normaliseApprovalFields } from "@/lib/review/approve";
```

Extend the request type:

```ts
interface ReviewRequest {
  vertical: Vertical;
  slug: string;
  action: Action;
  fields?: {
    title?: string;
    standfirst?: string;
    social_post?: string;
    homepage_lead?: boolean;
  };
}
```

and change the approve call from `approveArticle(articlePath, body.fields)` to:

```ts
      const { title } = await approveArticle(articlePath, normaliseApprovalFields(body.fields));
```

- [ ] **Step 2: Add the checkbox to ReviewActions**

In `src/app/review/[vertical]/[slug]/ReviewActions.tsx`, add the import:

```ts
import { canPromoteToLead } from "@/lib/homepage/lead";
```

Add `homepageLead?: boolean;` to the `Props` interface after `socialPost?: string;`, and take it in the destructure:

```ts
export function ReviewActions({ vertical, slug, articleHtml, interactive, headline, standfirst, socialPost, homepageLead }: Props) {
```

Add state next to the other edit state:

```ts
  const [editLead, setEditLead] = useState(homepageLead ?? false);
```

In `callApi`, replace the approve `fields` object with:

```ts
          fields:
            action === "approve"
              ? {
                  title: editHeadline,
                  standfirst: editStandfirst,
                  social_post: editSocial,
                  // Only sent where it means something. On news and features
                  // there is no checkbox, so there is nothing to say.
                  ...(canPromoteToLead(vertical) ? { homepage_lead: editLead } : {}),
                }
              : undefined,
```

Add the control at the end of the edit block, immediately after the closing `</div>` of the X caption field and before that block's closing `</div>`:

```tsx
          {canPromoteToLead(vertical) && (
            <label className="flex items-start gap-3 border-2 border-ink bg-cream px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editLead}
                onChange={(e) => setEditLead(e.target.checked)}
                className="mt-1 h-5 w-5 accent-orange"
              />
              <span>
                <span className="block font-mono text-meta-sm uppercase tracking-mono-wide">
                  Lead the front page
                </span>
                <span className="block font-mono text-meta-sm text-grey mt-1">
                  Sport and tech sit in the briefs by default. Ticked, this story
                  may take the lead — until something newer is published.
                </span>
              </span>
            </label>
          )}
```

The whole label is the tap target (roughly 60px tall, past the 44px WCAG 2.5.5 minimum) because this surface is used from a phone over Tailscale, where a 20px Promote button already had to be fixed once.

- [ ] **Step 3: Pass the current flag in**

In `src/app/review/[vertical]/[slug]/page.tsx`, add one prop to the `<ReviewActions>` element, after `socialPost={article.socialPost}`:

```tsx
              homepageLead={article.homepageLead}
```

- [ ] **Step 4: Verify**

Run: `npm run test:lib && npx tsc --noEmit && npm run lint`
Expected: all green. No new tests here — the logic under this UI is already covered by Tasks 1 and 4; what remains is wiring, and it is proved end-to-end by Task 6 and the rendered check in Task 7.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/review/route.ts" "src/app/review/[vertical]/[slug]/ReviewActions.tsx" "src/app/review/[vertical]/[slug]/page.tsx"
git commit -m "feat(review): a lead-the-front-page checkbox on sport and tech approvals"
```

---

### Task 6: Prove the seam

The chain is checkbox → route → approve → frontmatter → parser → selection. Tasks 1–5 each tested one link against hand-built objects. This drives a real file through the real functions.

**Files:**
- Test: `src/lib/homepage/lead.integration.test.ts` (create)

**Interfaces:**
- Consumes: `approveArticle` (Task 4), `parseArticleFile` (Task 2), `selectHomepage` (Task 3).

- [ ] **Step 1: Write the test**

Create `src/lib/homepage/lead.integration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { approveArticle } from "@/lib/review/approve";
import { parseArticleFile } from "@/lib/articles";
import { selectHomepage } from "./select";
import type { Article, Vertical } from "@/lib/types";

/**
 * The whole seam: an approval writes frontmatter, the parser reads it back,
 * and the homepage decides. Every link is the real one — a unit test on a
 * hand-built Article proves the rule and nothing about whether the operator's
 * tick ever reaches it.
 */
const pendingSportStory = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sd-lead-"));
  const filename = "2026-08-04-the-transfer.md";
  await writeFile(
    path.join(dir, filename),
    `---\ntitle: The transfer\ndate: '2026-08-04'\ncategory: sport\nword_count: 800\nstatus: pending\n---\n\nbody\n`,
    "utf-8"
  );
  return { dir, filename, file: path.join(dir, filename) };
};

const published = (slug: string, category: Vertical, date: string): Article =>
  ({
    slug,
    category,
    date,
    title: slug,
    wordCount: 800,
    tags: [],
    content: "",
    status: "published",
    readTime: 4,
  }) as unknown as Article;

test("ticking the box on review puts a sport story on the front page", async () => {
  const { dir, filename, file } = await pendingSportStory();

  await approveArticle(file, { homepage_lead: true });
  const story = parseArticleFile(dir, filename);

  const { hero } = selectHomepage([story, published("n1", "news", "2026-08-03")], 3);
  assert.equal(hero[0].slug, "2026-08-04-the-transfer");
});

test("leaving the box unticked leaves the news story leading", async () => {
  const { dir, filename, file } = await pendingSportStory();

  await approveArticle(file, { homepage_lead: false });
  const story = parseArticleFile(dir, filename);

  const { hero } = selectHomepage([story, published("n1", "news", "2026-08-03")], 3);
  assert.equal(hero[0].slug, "n1");
  assert.equal(hero[1].slug, "2026-08-04-the-transfer");
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:lib`
Expected: PASS. If it fails, the bug is real and in the seam — do not adjust the test to match the code.

- [ ] **Step 3: Commit**

```bash
git add src/lib/homepage/lead.integration.test.ts
git commit -m "test(homepage): drive a real approval through to the lead slot"
```

---

### Task 7: Verify rendered, refresh the ticker snapshot

**Files:**
- Modify: `src/lib/radar/events.snapshot.json` (regenerated, not hand-edited)

- [ ] **Step 1: Full check**

Run: `npm run test:lib && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Verify the front page rendered**

Prod-parity, not `next dev` — the root-route hydration bug and the minifier bug both hid from dev builds.

```bash
npm run build && npm run start
```

Before starting, confirm nothing is squatting on port 3000: `lsof -ti tcp:3000`. `pkill -f "next start"` misses the real `next-server` process, and an orphan will serve the previous build's manifest — screenshots of "new" code that are actually old. Kill by PID and check the port owner's start time.

Load `http://localhost:3000` and confirm by eye:
- the lead story is a news or features piece
- the newest sport story (`2026-08-03-high-and-free`, once approved) appears in the briefs, not the lead
- no story appears twice on the page

- [ ] **Step 3: Verify the flagged case**

Temporarily add `homepage_lead: true` to the newest sport article's frontmatter, rebuild, reload, confirm it takes the lead — then revert the edit and rebuild.

```bash
git checkout -- src/content/sport
```

- [ ] **Step 4: Refresh the ticker snapshot**

Prod has no live radar feed; the committed snapshot IS the ticker there, and it has not been refreshed since the tech and sport feeds landed in Phase A.

```bash
npm run radar:snapshot
git diff --stat src/lib/radar/events.snapshot.json
```

The script reports what changed and whether a commit is owed. If it says a commit is owed:

```bash
git add src/lib/radar/events.snapshot.json
git commit -m "chore(radar): refresh the ticker snapshot for the tech and sport feeds"
```

- [ ] **Step 5: Push**

```bash
git push origin main
```

The operator surfaces run from this working tree, so the change is live locally the moment it is committed; the push is what carries it to prod. Confirm the Vercel deploy reaches READY before calling it done — and note this machine has no global git identity, so a commit authored under an email that is not on the team is silently BLOCKED.

---

## Definition of done

- `npm run test:lib` green, `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` green.
- The front page's lead is a news or features story on the live site.
- Ticking "lead the front page" on a sport approval puts that story in the lead; unticking removes the key rather than writing `false`.
- Approving the same article twice produces one commit.
- `events.snapshot.json` refreshed and committed.
- `~/brain/PROJECTS.md` updated (Phase C shipped; next action advanced) and committed in `~/brain`.

*Last updated: 2026-08-04*
