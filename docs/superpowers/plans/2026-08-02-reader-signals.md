# Reader Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the homepage printing the same story three times, and give every story a like, a view count and a share — plus a share on Planet Pulse.

**Architecture:** One pure selection pass composes the homepage so no component can independently claim an article. Likes and views are rows in two Supabase tables whose unique constraints do the de-duplication in the database; Next route handlers talk to PostgREST over plain `fetch` and every read fails soft. Share is one client component using `navigator.share` with a clipboard fallback.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, Supabase (PostgREST over `fetch`, no client library), `node --test` via tsx.

## Global Constraints

- **No new npm dependencies.** Supabase is reached with `fetch` against PostgREST.
- **TypeScript strict, no `any`.** Named exports only. `const` over `let`.
- **Tests live at `src/lib/**/*.test.ts`** and run with `npm run test:lib` (the glob is quoted in package.json — nested paths work, and files one level deep are included).
- **Fail soft everywhere.** A Supabase error, a paused project or a network failure hides counts and leaves the page working. Never throw into a render path, never surface a reader-facing error.
- **Honest numbers.** Counts render exactly as returned. No rounding up, no inflation, no fake baseline.
- **Supabase project:** `sandbox-daily`, ref `cjwgiigdoxsgwfrunivw`, region eu-west-2.
- **Env var names:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. Server-side only — never `NEXT_PUBLIC_`.
- **Device id is a de-duplication key, not identity.** It is never logged, never joined to anything, never exposed by any read path.
- Every commit message body explains *why*, per the repo's existing history.

---

### Task 1: Homepage selection — the no-duplicate invariant

**Files:**
- Create: `src/lib/homepage/select.ts`
- Test: `src/lib/homepage/select.test.ts`

**Interfaces:**
- Consumes: `Article`, `Vertical` from `@/lib/types`.
- Produces: `selectHomepage(articles: Article[], perSection?: number): HomepageSelection` where
  `HomepageSelection = { hero: Article[]; sections: Record<Vertical, Article[]> }`.
  `HERO_COUNT = 4`, `DEFAULT_PER_SECTION = 6` exported as consts.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectHomepage, HERO_COUNT } from "./select";
import type { Article, Vertical } from "@/lib/types";

const article = (slug: string, category: Vertical, date: string): Article =>
  ({
    slug, category, date,
    title: slug, wordCount: 800, tags: [], content: "",
    status: "published", readTime: 4,
  } as unknown as Article);

/** Newest first, the order getAllArticles() hands over. */
const stock = (): Article[] => [
  article("n1", "news", "2026-08-02"),
  article("f1", "features", "2026-08-01"),
  article("n2", "news", "2026-07-31"),
  article("s1", "sport", "2026-07-30"),
  article("t1", "tech", "2026-07-29"),
  article("n3", "news", "2026-07-28"),
  article("f2", "features", "2026-07-27"),
  article("s2", "sport", "2026-07-26"),
  article("t2", "tech", "2026-07-25"),
];

test("no slug is ever printed twice across the whole page", () => {
  const { hero, sections } = selectHomepage(stock(), 3);
  const printed = [...hero, ...Object.values(sections).flat()].map((a) => a.slug);
  assert.equal(new Set(printed).size, printed.length);
});

test("the hero takes the newest four, in order", () => {
  const { hero } = selectHomepage(stock(), 3);
  assert.equal(hero.length, HERO_COUNT);
  assert.deepEqual(hero.map((a) => a.slug), ["n1", "f1", "n2", "s1"]);
});

test("a section never contains another vertical's article", () => {
  const { sections } = selectHomepage(stock(), 3);
  for (const [vertical, articles] of Object.entries(sections)) {
    for (const a of articles) assert.equal(a.category, vertical);
  }
});

test("sections skip what the hero already claimed", () => {
  const { sections } = selectHomepage(stock(), 3);
  assert.deepEqual(sections.news.map((a) => a.slug), ["n3"]);
  assert.deepEqual(sections.sport.map((a) => a.slug), ["s2"]);
});

test("a thin vertical returns what it has rather than padding", () => {
  const { sections } = selectHomepage(stock(), 6);
  assert.deepEqual(sections.tech.map((a) => a.slug), ["t2"]);
  assert.ok(sections.tech.every((a) => a.category === "tech"));
});

test("every vertical is present as a key even when it has nothing left", () => {
  const onlyNews = [article("n1", "news", "2026-08-02")];
  const { sections } = selectHomepage(onlyNews, 6);
  assert.deepEqual(Object.keys(sections).sort(), ["features", "news", "sport", "tech"]);
  assert.deepEqual(sections.news, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/homepage/select.test.ts`
Expected: FAIL — `Cannot find module './select'`

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Article, Vertical } from "@/lib/types";

export const HERO_COUNT = 4;
export const DEFAULT_PER_SECTION = 6;

const VERTICALS: readonly Vertical[] = ["news", "tech", "sport", "features"];

export interface HomepageSelection {
  hero: Article[];
  sections: Record<Vertical, Article[]>;
}

/**
 * The homepage's single selection pass.
 *
 * Three surfaces used to read the article store independently — the hero took
 * the newest 4, the grid the newest 9, each section tile the newest 3 of its
 * vertical — so the lead story printed three times before a reader scrolled.
 * Claiming slugs in one place makes "no repeats" a property of the code rather
 * than a rule every future component has to remember.
 *
 * `articles` must arrive newest-first (what getAllArticles returns); the order
 * is preserved, never re-sorted, so the hero's lead stays the newest piece.
 */
export function selectHomepage(
  articles: Article[],
  perSection: number = DEFAULT_PER_SECTION
): HomepageSelection {
  const claimed = new Set<string>();

  const hero = articles.slice(0, HERO_COUNT);
  for (const a of hero) claimed.add(a.slug);

  const sections = Object.fromEntries(
    VERTICALS.map((vertical) => [
      vertical,
      articles
        .filter((a) => a.category === vertical && !claimed.has(a.slug))
        .slice(0, perSection),
    ])
  ) as Record<Vertical, Article[]>;

  // Claimed after the fact, not during: a slug belongs to exactly one vertical,
  // so sections cannot collide with each other — but recording them keeps the
  // set honest for anything added below.
  for (const list of Object.values(sections)) for (const a of list) claimed.add(a.slug);

  return { hero, sections };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/homepage/select.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/homepage/select.ts src/lib/homepage/select.test.ts
git commit -m "feat: one selection pass for the homepage, so no story can print twice"
```

---

### Task 2: Wire the homepage to the selection

**Files:**
- Modify: `src/app/page.tsx` (drop `ArticleGrid`, call `selectHomepage`, pass sections down)
- Modify: `src/components/vertical-strip.tsx` (take articles as props; stop calling `getArticlesByVertical`)

**Interfaces:**
- Consumes: `selectHomepage` from Task 1.
- Produces: `VerticalStrip` props `{ sections: Record<Vertical, Article[]> }`.

- [ ] **Step 1: Change VerticalStrip to receive its stories**

Replace the `strips` construction (`vertical-strip.tsx:33-38`) and the import of `getArticlesByVertical`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { verticals } from "@/lib/verticals";
import { type Article, type Vertical } from "@/lib/types";
import { SectionCarousel } from "@/components/section-carousel";

// TILE_DEFINITIONS stays exactly as it is.

/**
 * Presentational by design. It used to call getArticlesByVertical itself, which
 * is precisely how the front page ended up printing the lead story in the hero,
 * in the grid and in its section tile. The homepage now does one selection pass
 * (@/lib/homepage/select) and hands each tile what it may show.
 */
export function VerticalStrip({ sections }: { sections: Record<Vertical, Article[]> }) {
  const strips = TILE_DEFINITIONS.map((def) => ({
    vertical: verticals[def.vertical],
    tagline: def.tagline,
    articles: sections[def.vertical],
  }));
  // ...rest of the component unchanged
}
```

- [ ] **Step 2: Rewire the homepage**

In `src/app/page.tsx`: delete the `ArticleGrid` import and its JSX block, delete `const articles = getAllArticles().slice(0, 9)`, and build from the selection instead:

```tsx
import { selectHomepage } from "@/lib/homepage/select";

const { hero, sections } = selectHomepage(getAllArticles());

const heroArticles: HeroArticle[] = hero.map((a, i) => ({
  href: `/${a.category}/${a.slug}`,
  section: a.category,
  title: a.title,
  standfirst: i === 0 ? a.standfirst : undefined,
  thumb: a.heroImage,
}));
```

and in the returned JSX replace `<VerticalStrip />` with `<VerticalStrip sections={sections} />`, removing the `<ArticleGrid …>` element entirely. `ArticleGrid` itself stays — `/news`, `/tech`, `/sport` and `/features` all still use it.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors from `page.tsx` or `vertical-strip.tsx` (7 pre-existing errors in `src/app/textures/page.tsx` are unrelated and stay).

- [ ] **Step 4: Prove it on the rendered page**

Run the dev server (`npm run dev`), then:

```bash
node -e '
const re = /href="\/(news|tech|sport|features)\/([a-z0-9-]+)"/g;
fetch("http://localhost:3000/").then(r => r.text()).then(html => {
  const slugs = [...html.matchAll(re)].map(m => m[2]);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  console.log("links:", slugs.length, "unique:", new Set(slugs).size);
  console.log(dupes.length ? "DUPLICATES: " + [...new Set(dupes)].join(", ") : "no duplicates");
});'
```

Expected: `no duplicates`. Run the same check against the current homepage *before* the change if you want the contrast — it reports the lead slug two or three times.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/vertical-strip.tsx
git commit -m "fix: the front page printed the lead story three times

The hero took the newest 4, the grid the newest 9 and each section tile the
newest 3 of its vertical, all reading the article store independently. One
selection pass now claims each slug once and hands the tiles what they may
show; the INSIDE THE EDITION grid comes off the homepage in favour of the
section rows (SanSan's call), and ArticleGrid stays for the section pages."
```

---

### Task 3: Supabase schema and environment

**Files:**
- Create: `.env.local` entries (untracked)
- Modify: `.env.local.example`

**Interfaces:**
- Produces: tables `public.article_likes`, `public.article_views`; view `public.signal_counts (slug text, likes bigint, views bigint)`; env vars `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1: Apply the migration**

Via the Supabase MCP `apply_migration` against project `cjwgiigdoxsgwfrunivw`, name `reader_signals`:

```sql
create table public.article_likes (
  slug text not null,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (slug, device_id)
);

create table public.article_views (
  slug text not null,
  device_id uuid not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (slug, device_id, viewed_on)
);

alter table public.article_likes enable row level security;
alter table public.article_views enable row level security;

-- Insert only. Nothing may read raw rows, so device ids are unreadable from
-- the browser even though the key that reaches PostgREST is publishable.
create policy "anon may like" on public.article_likes
  for insert to anon with check (true);
create policy "anon may record a view" on public.article_views
  for insert to anon with check (true);

-- Counts come from a view owned by postgres (security_invoker stays off), so
-- selecting it does not require select policies on the base tables.
create view public.signal_counts as
select
  s.slug,
  (select count(*) from public.article_likes l where l.slug = s.slug) as likes,
  (select count(*) from public.article_views v where v.slug = s.slug) as views
from (
  select slug from public.article_likes
  union
  select slug from public.article_views
) s;

grant select on public.signal_counts to anon;
```

- [ ] **Step 2: Verify the shape from the outside**

```bash
curl -s "https://cjwgiigdoxsgwfrunivw.supabase.co/rest/v1/signal_counts?select=slug,likes,views" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

Expected: `[]` — the view exists, anon may read it, and there are no rows yet.

Then confirm raw rows are NOT readable:

```bash
curl -s "https://cjwgiigdoxsgwfrunivw.supabase.co/rest/v1/article_likes?select=device_id" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

Expected: `[]` with no device ids ever returned (RLS grants insert only). If this ever returns rows, stop — the policy is wrong.

- [ ] **Step 3: Set the environment**

Local (`.env.local`, untracked):

```
SUPABASE_URL=https://cjwgiigdoxsgwfrunivw.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_F2gFMBgQv0IfC44ajBe86g_GIoV-l2o
```

Vercel — all three environments:

```bash
for env in production preview development; do
  printf '%s' "https://cjwgiigdoxsgwfrunivw.supabase.co" | vercel env add SUPABASE_URL $env
  printf '%s' "sb_publishable_F2gFMBgQv0IfC44ajBe86g_GIoV-l2o" | vercel env add SUPABASE_PUBLISHABLE_KEY $env
done
vercel env ls
```

Document both names in `.env.local.example` with a comment that the key is publishable and RLS is what protects the tables.

- [ ] **Step 4: Commit**

```bash
git add .env.local.example
git commit -m "chore: document the Supabase env vars behind reader signals"
```

---

### Task 4: The signals client — counts, likes, views over PostgREST

**Files:**
- Create: `src/lib/signals/counts.ts`
- Create: `src/lib/signals/store.ts`
- Test: `src/lib/signals/counts.test.ts`

**Interfaces:**
- Produces:
  - `interface SignalCounts { likes: number; views: number }`
  - `type CountsBySlug = Record<string, SignalCounts>`
  - `parseCounts(rows: unknown): CountsBySlug`
  - `emptyCounts(slugs: string[]): CountsBySlug`
  - `recordLike(slug: string, deviceId: string): Promise<void>`
  - `recordView(slug: string, deviceId: string): Promise<void>`
  - `readCounts(slugs: string[]): Promise<CountsBySlug>`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseCounts, emptyCounts } from "./counts";

test("parseCounts maps PostgREST rows by slug", () => {
  const rows = [
    { slug: "a", likes: 3, views: 41 },
    { slug: "b", likes: 0, views: 7 },
  ];
  assert.deepEqual(parseCounts(rows), {
    a: { likes: 3, views: 41 },
    b: { likes: 0, views: 7 },
  });
});

test("parseCounts returns an empty map for an empty result", () => {
  assert.deepEqual(parseCounts([]), {});
});

test("parseCounts ignores rows it cannot read rather than throwing", () => {
  const rows = [{ slug: "a", likes: 2, views: 5 }, { nope: true }, null, "x"];
  assert.deepEqual(parseCounts(rows), { a: { likes: 2, views: 5 } });
});

test("parseCounts survives a non-array body", () => {
  assert.deepEqual(parseCounts({ message: "JWT expired" }), {});
  assert.deepEqual(parseCounts(null), {});
});

test("parseCounts coerces bigint counts arriving as strings", () => {
  assert.deepEqual(parseCounts([{ slug: "a", likes: "12", views: "300" }]), {
    a: { likes: 12, views: 300 },
  });
});

test("emptyCounts gives every requested slug a zero pair", () => {
  assert.deepEqual(emptyCounts(["a", "b"]), {
    a: { likes: 0, views: 0 },
    b: { likes: 0, views: 0 },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/signals/counts.test.ts`
Expected: FAIL — `Cannot find module './counts'`

- [ ] **Step 3: Implement `counts.ts`**

```ts
export interface SignalCounts {
  likes: number;
  views: number;
}

export type CountsBySlug = Record<string, SignalCounts>;

/** PostgREST returns bigint aggregates as JSON strings often enough that
 *  trusting `number` here would show NaN on the page. */
const toCount = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * Parses the `signal_counts` view. Deliberately total: a paused project, an
 * expired key or a schema drift all return something that is not an array of
 * rows, and every one of those must degrade to "no counts", never to a throw
 * inside a route handler.
 */
export function parseCounts(rows: unknown): CountsBySlug {
  if (!Array.isArray(rows)) return {};
  const out: CountsBySlug = {};
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { slug, likes, views } = row as Record<string, unknown>;
    const l = toCount(likes);
    const v = toCount(views);
    if (typeof slug !== "string" || l === null || v === null) continue;
    out[slug] = { likes: l, views: v };
  }
  return out;
}

/** A slug with no rows yet is absent from the view — the UI still wants a zero. */
export function emptyCounts(slugs: string[]): CountsBySlug {
  return Object.fromEntries(slugs.map((s) => [s, { likes: 0, views: 0 }]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/signals/counts.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Implement `store.ts` (the PostgREST calls)**

```ts
import { emptyCounts, parseCounts, type CountsBySlug } from "./counts";

const url = () => process.env.SUPABASE_URL;
const key = () => process.env.SUPABASE_PUBLISHABLE_KEY;

/** 2s: a signal is never worth making a reader wait. */
const TIMEOUT_MS = 2000;

const headers = (extra: Record<string, string> = {}): HeadersInit => ({
  apikey: key() ?? "",
  Authorization: `Bearer ${key() ?? ""}`,
  "Content-Type": "application/json",
  ...extra,
});

const call = async (path: string, init: RequestInit): Promise<Response | null> => {
  if (!url() || !key()) return null;   // unconfigured is a soft state, not an error
  try {
    return await fetch(`${url()}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
};

/** Insert-or-ignore: the table's primary key is what makes a second tap a
 *  no-op, so a duplicate is success, not an error to report. */
const insert = async (table: string, body: Record<string, string>): Promise<void> => {
  await call(table, {
    method: "POST",
    headers: headers({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(body),
  });
};

export const recordLike = (slug: string, deviceId: string): Promise<void> =>
  insert("article_likes", { slug, device_id: deviceId });

export const recordView = (slug: string, deviceId: string): Promise<void> =>
  insert("article_views", { slug, device_id: deviceId });

/**
 * Counts for the given slugs. Missing slugs come back as zeroes; an
 * unreachable or unconfigured backend comes back as zeroes too — the caller
 * distinguishes them by `ok`, and the UI hides counts rather than showing a
 * confident 0 it cannot stand behind.
 */
export async function readCounts(
  slugs: string[]
): Promise<{ ok: boolean; counts: CountsBySlug }> {
  if (slugs.length === 0) return { ok: true, counts: {} };
  const list = slugs.map((s) => `"${s.replace(/"/g, '')}"`).join(",");
  const res = await call(`signal_counts?select=slug,likes,views&slug=in.(${list})`, {
    method: "GET",
    headers: headers(),
  });
  if (!res || !res.ok) return { ok: false, counts: emptyCounts(slugs) };
  const parsed = parseCounts(await res.json().catch(() => null));
  return { ok: true, counts: { ...emptyCounts(slugs), ...parsed } };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/signals
git commit -m "feat: read and write reader signals over PostgREST, failing soft

No supabase-js: insert-ignoring-duplicates plus one aggregate read is twenty
lines of fetch. Every failure path — unconfigured env, paused project, expired
key, timeout — degrades to 'no counts' so a signal can never take a page down."
```

---

### Task 5: Route handlers

**Files:**
- Create: `src/app/api/likes/route.ts`
- Create: `src/app/api/views/route.ts`
- Create: `src/app/api/signals/route.ts`

**Interfaces:**
- Consumes: `recordLike`, `recordView`, `readCounts` from Task 4.
- Produces: `POST /api/likes {slug, deviceId} → {likes, views}`; `POST /api/views {slug, deviceId} → 204`; `GET /api/signals?slugs=a,b → {ok, counts}`.

- [ ] **Step 1: Write `src/app/api/likes/route.ts`**

```ts
import { NextResponse } from "next/server";
import { recordLike, readCounts } from "@/lib/signals/store";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { slug, deviceId } = (body ?? {}) as { slug?: unknown; deviceId?: unknown };

  // Validated, not sanitised: a bad shape is a bug or an attack, and either way
  // it has no business reaching the database.
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    return NextResponse.json({ error: "bad slug" }, { status: 400 });
  }
  if (typeof deviceId !== "string" || !UUID.test(deviceId)) {
    return NextResponse.json({ error: "bad deviceId" }, { status: 400 });
  }

  await recordLike(slug, deviceId);
  const { ok, counts } = await readCounts([slug]);
  return NextResponse.json({ ok, ...counts[slug] });
}
```

- [ ] **Step 2: Write `src/app/api/views/route.ts`**

Same validation, `recordView`, and no body in the reply — a view is fire-and-forget:

```ts
import { NextResponse } from "next/server";
import { recordView } from "@/lib/signals/store";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { slug, deviceId } = (body ?? {}) as { slug?: unknown; deviceId?: unknown };
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    return NextResponse.json({ error: "bad slug" }, { status: 400 });
  }
  if (typeof deviceId !== "string" || !UUID.test(deviceId)) {
    return NextResponse.json({ error: "bad deviceId" }, { status: 400 });
  }
  await recordView(slug, deviceId);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Write `src/app/api/signals/route.ts`**

```ts
import { NextResponse } from "next/server";
import { readCounts } from "@/lib/signals/store";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,120}$/;
const MAX_SLUGS = 40;

/** Batched on purpose: one request per page, not one per card. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("slugs") ?? "";
  const slugs = raw.split(",").filter((s) => SLUG.test(s)).slice(0, MAX_SLUGS);
  const { ok, counts } = await readCounts(slugs);
  return NextResponse.json({ ok, counts });
}
```

- [ ] **Step 4: Exercise all three against the dev server**

```bash
DEV=http://localhost:3000
ID=$(uuidgen | tr 'A-Z' 'a-z')
curl -s -X POST $DEV/api/likes -H 'content-type: application/json' \
  -d "{\"slug\":\"buying-the-ceiling\",\"deviceId\":\"$ID\"}"
curl -s -X POST $DEV/api/likes -H 'content-type: application/json' \
  -d "{\"slug\":\"buying-the-ceiling\",\"deviceId\":\"$ID\"}"
curl -s "$DEV/api/signals?slugs=buying-the-ceiling"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $DEV/api/views \
  -H 'content-type: application/json' -d "{\"slug\":\"buying-the-ceiling\",\"deviceId\":\"$ID\"}"
curl -s -X POST $DEV/api/likes -H 'content-type: application/json' -d '{"slug":"../etc","deviceId":"x"}'
```

Expected, in order: `{"ok":true,"likes":1,"views":0}` · the same again (**still 1** — the second tap changed nothing) · `{"ok":true,"counts":{"buying-the-ceiling":{"likes":1,"views":0}}}` · `204` · `{"error":"bad slug"}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/likes src/app/api/views src/app/api/signals
git commit -m "feat: like, view and counts endpoints

Signals batch through one GET per page so ISR-cached pages keep their cache;
writes validate slug and device id before touching PostgREST."
```

---

### Task 6: Device id and the like button

**Files:**
- Create: `src/lib/signals/device.ts`
- Create: `src/components/signals/like-button.tsx`
- Test: `src/lib/signals/device.test.ts`

**Interfaces:**
- Produces: `getDeviceId(): string` (browser only); `<LikeButton slug count?  liked? size? />`.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readStoredDeviceId, DEVICE_KEY } from "./device";

test("readStoredDeviceId returns a stored uuid unchanged", () => {
  const id = "3f7c1f2e-9a55-4a7d-9a6b-2f4f1f4a0c11";
  assert.equal(readStoredDeviceId({ [DEVICE_KEY]: id }), id);
});

test("readStoredDeviceId rejects anything that is not a uuid", () => {
  assert.equal(readStoredDeviceId({ [DEVICE_KEY]: "nope" }), null);
  assert.equal(readStoredDeviceId({}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/signals/device.test.ts`
Expected: FAIL — `Cannot find module './device'`

- [ ] **Step 3: Implement `device.ts`**

```ts
export const DEVICE_KEY = "sd-device";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure, so the validation is testable without a DOM. */
export const readStoredDeviceId = (store: Record<string, string | undefined>): string | null => {
  const value = store[DEVICE_KEY];
  return typeof value === "string" && UUID.test(value) ? value : null;
};

/**
 * A de-duplication key, nothing more: it is never sent anywhere except
 * alongside a like or a view, never logged, never joined to anything, and the
 * read path cannot return it. Private browsing clears it, and that is fine —
 * the reader's next like simply counts again.
 */
export function getDeviceId(): string {
  try {
    const existing = readStoredDeviceId(localStorage as unknown as Record<string, string | undefined>);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage blocked: a per-session id still de-duplicates the double-tap.
    return crypto.randomUUID();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/signals/device.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Implement `<LikeButton>`**

```tsx
"use client";

import { useState } from "react";
import { getDeviceId } from "@/lib/signals/device";

interface Props {
  slug: string;
  /** Omit to render the thumb alone — the card treatment. */
  count?: number;
  className?: string;
}

/**
 * Optimistic by design: the thumb fills on tap and the count moves immediately,
 * because a reader tapping a like has no interest in waiting for a round trip.
 * A failed write rolls the optimism back rather than leaving a lie on screen.
 */
export function LikeButton({ slug, count, className = "" }: Props) {
  const [liked, setLiked] = useState(false);
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);

  const like = async (e: React.MouseEvent) => {
    // Cards wrap their content in a Link; this button sits over it.
    e.preventDefault();
    e.stopPropagation();
    if (liked || busy) return;
    setLiked(true);
    setDelta(1);
    setBusy(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, deviceId: getDeviceId() }),
      });
      if (!res.ok) throw new Error(`like failed: ${res.status}`);
    } catch {
      setLiked(false);
      setDelta(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={like}
      aria-pressed={liked}
      aria-label={liked ? `Liked ${slug}` : `Like this story`}
      className={`sd-like ${liked ? "sd-like--on" : ""} ${className}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
           fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
        <path d="M7 10v10H4V10h3zm3 10h7.6a2 2 0 0 0 2-1.7l1.1-6a2 2 0 0 0-2-2.3H15V6.5A2.5 2.5 0 0 0 12.5 4L10 10v10z" />
      </svg>
      {typeof count === "number" && (
        <span className="sd-like-count font-mono">{count + delta}</span>
      )}
    </button>
  );
}
```

Add to `src/app/globals.css`, beside the other component classes:

```css
/* Reader signals — the like thumb sits over a card's own Link, so it needs its
   own stacking context and a hit area a thumb can actually find on a phone. */
.sd-like {
  display: inline-flex; align-items: center; gap: 0.4rem;
  min-height: 44px; min-width: 44px; justify-content: center;
  padding: 0 0.6rem; border-radius: 999px;
  background: color-mix(in srgb, var(--color-cream) 88%, transparent);
  color: var(--color-ink);
  cursor: pointer;
  transition: transform var(--dur-fast, 150ms) ease, background 150ms ease;
}
.sd-like:hover { background: var(--color-cream); }
.sd-like:active { transform: scale(0.94); }
.sd-like--on { color: var(--color-orange); }
.sd-like-count { font-size: 0.75rem; letter-spacing: 0.04em; }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/signals/device.ts src/lib/signals/device.test.ts src/components/signals/like-button.tsx src/app/globals.css
git commit -m "feat: the like thumb, optimistic and rolled back on failure"
```

---

### Task 7: The like thumb on cards

**Files:**
- Modify: `src/components/article-card.tsx`
- Modify: `src/components/section-carousel.tsx`

**Interfaces:**
- Consumes: `<LikeButton slug />` from Task 6.

- [ ] **Step 1: Restructure the card so the button is not inside the anchor**

`ArticleCard` currently wraps everything in `<Link>`. A `<button>` inside an `<a>` is invalid HTML and behaves unpredictably on touch. Wrap the card in a positioned container and make the button a **sibling** of the link:

```tsx
return (
  <div className="relative">
    <Link href={href} className={`group block …existing classes…`}>
      {/* unchanged card contents */}
    </Link>
    <LikeButton slug={article.slug} className="absolute right-3 top-3 z-10 shadow-sm" />
  </div>
);
```

Import `LikeButton` at the top. No count on cards — the thumb only.

- [ ] **Step 2: Same treatment for the carousel slides**

In `section-carousel.tsx`, the slide's `<Link>` wraps the thumbnail. Put the button beside it inside the existing `CarouselItem`:

```tsx
<CarouselItem key={article.slug} className="pl-2">
  <div className="relative">
    <Link href={`${routePrefix}/${article.slug}`} className="block group/slide">
      {/* unchanged slide contents */}
    </Link>
    <LikeButton slug={article.slug} className="absolute right-2 top-2 z-10 shadow-sm" />
  </div>
</CarouselItem>
```

- [ ] **Step 3: Check the markup is valid and the tap works**

Run the dev server, then in a browser at mobile width: tap a thumb on the homepage — it fills, and **the card does not navigate**. Reload: the count is unchanged (cards show no count) and tapping the same thumb again does not double-count (verify with `curl "$DEV/api/signals?slugs=<slug>"` — likes stays 1).

Also confirm no nesting warning:

```bash
node -e '
fetch("http://localhost:3000/").then(r=>r.text()).then(h=>{
  const bad = /<a[^>]*>(?:(?!<\/a>)[\s\S])*?<button/i.test(h);
  console.log(bad ? "INVALID: button inside anchor" : "no button inside an anchor");
});'
```

Expected: `no button inside an anchor`.

- [ ] **Step 4: Commit**

```bash
git add src/components/article-card.tsx src/components/section-carousel.tsx
git commit -m "feat: a like thumb on every card

Sibling of the card's Link, not a child: a button inside an anchor is invalid
markup and swallows taps on touch."
```

---

### Task 8: Share

**Files:**
- Create: `src/lib/signals/share.ts`
- Create: `src/components/signals/share-button.tsx`
- Test: `src/lib/signals/share.test.ts`

**Interfaces:**
- Produces: `buildShareUrl(origin: string, path: string, params?: Record<string, string>): string`; `<ShareButton url title text? className? />`.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildShareUrl } from "./share";

test("buildShareUrl joins origin and path", () => {
  assert.equal(buildShareUrl("https://x.com", "/news/a"), "https://x.com/news/a");
});

test("buildShareUrl tolerates a trailing slash on the origin", () => {
  assert.equal(buildShareUrl("https://x.com/", "/pulse"), "https://x.com/pulse");
});

test("buildShareUrl appends and encodes params", () => {
  assert.equal(
    buildShareUrl("https://x.com", "/pulse", { event: "eonet/EONET_1 2" }),
    "https://x.com/pulse?event=eonet%2FEONET_1+2"
  );
});

test("buildShareUrl omits the query entirely when there are no params", () => {
  assert.equal(buildShareUrl("https://x.com", "/pulse", {}), "https://x.com/pulse");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/signals/share.test.ts`
Expected: FAIL — `Cannot find module './share'`

- [ ] **Step 3: Implement `share.ts`**

```ts
/** Absolute, because a share target that receives "/news/x" is useless. */
export function buildShareUrl(
  origin: string,
  path: string,
  params: Record<string, string> = {}
): string {
  const base = `${origin.replace(/\/$/, "")}${path}`;
  const query = new URLSearchParams(params).toString();
  return query ? `${base}?${query}` : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/signals/share.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Implement `<ShareButton>`**

```tsx
"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Absolute URL. Pass a builder result, never a bare path. */
  url: string;
  title: string;
  text?: string;
  className?: string;
}

type State = "idle" | "copied" | "failed";

/**
 * The native sheet where it exists, clipboard everywhere else. No per-network
 * buttons and no share SDKs: those are third-party script tags on a page whose
 * whole pitch is that it does not carry any.
 */
export function ShareButton({ url, title, text, className = "" }: Props) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(id);
  }, [state]);

  const share = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title, text });
        return;
      } catch {
        // Dismissing the sheet rejects too; fall through to the clipboard
        // rather than reporting a failure the reader caused on purpose.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button type="button" onClick={share} className={`sd-share ${className}`}
            aria-label={`Share: ${title}`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
           fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4" />
      </svg>
      <span className="font-mono sd-share-label">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}
      </span>
    </button>
  );
}
```

CSS beside `.sd-like`:

```css
.sd-share {
  display: inline-flex; align-items: center; gap: 0.4rem;
  min-height: 44px; padding: 0 0.8rem; border-radius: 999px;
  background: color-mix(in srgb, var(--color-cream) 88%, transparent);
  color: var(--color-ink); cursor: pointer;
}
.sd-share:hover { background: var(--color-cream); }
.sd-share-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/signals/share.ts src/lib/signals/share.test.ts src/components/signals/share-button.tsx src/app/globals.css
git commit -m "feat: share via the native sheet, clipboard as the fallback"
```

---

### Task 9: Article signals — counts, view beacon, share, on all four verticals

**Files:**
- Create: `src/components/signals/article-signals.tsx`
- Modify: `src/app/news/[slug]/page.tsx`, `src/app/tech/[slug]/page.tsx`, `src/app/sport/[slug]/page.tsx`, `src/app/features/[slug]/page.tsx`

**Interfaces:**
- Consumes: `LikeButton` (Task 6), `ShareButton` + `buildShareUrl` (Task 8), `GET /api/signals` and `POST /api/views` (Task 5).
- Produces: `<ArticleSignals slug title vertical placement />` where `placement: "top" | "bottom"`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { LikeButton } from "./like-button";
import { ShareButton } from "./share-button";
import { buildShareUrl } from "@/lib/signals/share";
import { getDeviceId } from "@/lib/signals/device";
import type { SignalCounts } from "@/lib/signals/counts";
import type { Vertical } from "@/lib/types";

interface Props {
  slug: string;
  title: string;
  vertical: Vertical;
  /** The top row records the view; the bottom row must not record it twice. */
  placement: "top" | "bottom";
}

export function ArticleSignals({ slug, title, vertical, placement }: Props) {
  const [counts, setCounts] = useState<SignalCounts | null>(null);
  const [url, setUrl] = useState("");

  // After mount, never during render: these pages are statically rendered and
  // must stay that way, and the first client render has to match the server
  // HTML (the pattern folio-row.tsx and pulse-client.tsx already use).
  useEffect(() => {
    setUrl(buildShareUrl(window.location.origin, `/${vertical}/${slug}`));

    let cancelled = false;
    fetch(`/api/signals?slugs=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; counts?: Record<string, SignalCounts> } | null) => {
        if (cancelled || !data?.ok) return;   // unreachable backend: show nothing
        setCounts(data.counts?.[slug] ?? { likes: 0, views: 0 });
      })
      .catch(() => undefined);

    if (placement === "top") {
      void fetch("/api/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, deviceId: getDeviceId() }),
        keepalive: true,
      }).catch(() => undefined);
    }

    return () => { cancelled = true; };
  }, [slug, vertical, placement]);

  return (
    <div className="sd-signals">
      <LikeButton slug={slug} count={counts?.likes} />
      {counts && (
        <span className="font-mono sd-signals-views">
          {counts.views.toLocaleString("en-GB")} {counts.views === 1 ? "view" : "views"}
        </span>
      )}
      {url && <ShareButton url={url} title={title} />}
    </div>
  );
}
```

CSS:

```css
.sd-signals { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; }
.sd-signals-views { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
```

- [ ] **Step 2: Mount it on all four article pages**

In each of the four `[slug]/page.tsx` files, import the component and add it twice — once directly after the date/read-time `<p>` in the header section, once after the rendered article body:

```tsx
import { ArticleSignals } from "@/components/signals/article-signals";

// in the header block, after the date line:
<ArticleSignals slug={article.slug} title={article.title} vertical="news" placement="top" />

// after the article body, before the related-articles block:
<ArticleSignals slug={article.slug} title={article.title} vertical="news" placement="bottom" />
```

Substitute the right literal for `vertical` in each file: `"news"`, `"tech"`, `"sport"`, `"features"`.

- [ ] **Step 3: Verify on the dev server**

Open an article. Expect: the view count increments by one on first load, stays put on refresh (same device, same day), the like thumb fills and the count rises by one, and a second tap does nothing. Then stop Supabase reachability (`SUPABASE_URL=https://127.0.0.1:9 npm run dev`) and reload — expect the page to render normally, no counts, no reader-visible error.

- [ ] **Step 4: Commit**

```bash
git add src/components/signals/article-signals.tsx src/app/news src/app/tech src/app/sport src/app/features src/app/globals.css
git commit -m "feat: likes, views and share on article pages

Counts fetch after mount so the pages stay statically rendered; only the top
placement fires the view beacon, or every article would count itself twice."
```

---

### Task 10: Share on Planet Pulse, with a deep link back to the pin

**Files:**
- Modify: `src/components/pulse/pulse-client.tsx`

**Interfaces:**
- Consumes: `ShareButton`, `buildShareUrl`.

- [ ] **Step 1: Read `?event=` after mount and select that pin**

Add to `PulseClient`, beside its existing mount effects:

```tsx
// Deep link from a shared URL. Read from window.location rather than
// useSearchParams: the hook opts the route out of static rendering, and /pulse
// is prerendered with revalidate = 600.
useEffect(() => {
  const id = new URLSearchParams(window.location.search).get("event");
  if (!id) return;
  // An id that no longer exists (the feeds move) selects nothing — a stale
  // share link should open the globe, not an error.
  if (snapshot.events.some((e) => e.id === id)) setSelectedId(id);
}, [snapshot.events]);
```

- [ ] **Step 2: Add the share control to the HUD**

```tsx
const [origin, setOrigin] = useState("");
useEffect(() => setOrigin(window.location.origin), []);

const shareUrl = origin
  ? buildShareUrl(origin, "/pulse", selectedId ? { event: selectedId } : {})
  : "";
```

Render it next to the existing HUD controls:

```tsx
{shareUrl && (
  <ShareButton
    url={shareUrl}
    title={selected ? `${selected.title} — Planet Pulse` : "Planet Pulse — Sandbox Daily"}
    text={selected ? undefined : "A live globe of what is burning, shaking and flooding right now."}
  />
)}
```

- [ ] **Step 3: Verify**

On the dev server: select a pin, share (clipboard on desktop), paste the URL into a new tab — the same pin opens with its detail panel. Then hand-edit the URL to `?event=does-not-exist` — the globe loads with nothing selected and no error.

- [ ] **Step 4: Commit**

```bash
git add src/components/pulse/pulse-client.tsx
git commit -m "feat: share a Planet Pulse pin, not just the page

The shared URL reopens the event; an id the feeds have since dropped opens the
globe rather than failing. URL read from window.location after mount so /pulse
stays statically rendered."
```

---

### Task 11: Full verification and deploy

**Files:** none — this task changes nothing and proves everything.

- [ ] **Step 1: The whole suite, lint and types**

```bash
npm run test:lib && npx tsc --noEmit && npm run lint
```

Expected: all tests pass (298 before this work, plus the new ones), no type errors, and only the 7 pre-existing `src/app/textures/page.tsx` lint errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: green, and the route table still shows `/` and `/pulse` as `○` (Static) — the three `/api/*` routes are `ƒ` (Dynamic), which is correct. If `/` or `/pulse` has become dynamic, a client component is reading the URL during render; fix that before shipping.

- [ ] **Step 3: Rendered checks, mobile and desktop**

With `npm run start` on the production build, run the Playwright probe harness used for the hydration work (iPhone 13 + 1440×900):

- homepage: no slug appears twice in the rendered HTML
- homepage: `data-theme` survives (no hydration regression from the new client components)
- article page: view recorded once; a reload does not increment
- like: fills, count rises, second tap is a no-op
- share: `navigator.share` absent → clipboard path sets "Link copied"
- Supabase unreachable → page renders, counts hidden, nothing thrown at the reader

- [ ] **Step 4: Ship**

```bash
git push origin main
```

Then wait for the deployment to reach READY and repeat the homepage-duplication check, the like round trip and the Pulse deep link **against production**. A local pass is not the claim; the deployed site is.

- [ ] **Step 5: Update the registry**

Add the outcome to `~/brain/PROJECTS.md` under Sandbox Daily and commit in `~/brain`, per the router's operating rules.

---

## Self-review

**Spec coverage:** de-duplication → Tasks 1–2 · Supabase schema and env → Task 3 · PostgREST access and fail-soft → Task 4 · routes → Task 5 · device id and like button → Task 6 · thumb on cards → Task 7 · share component → Task 8 · article likes/views/share and the view rule → Task 9 · Pulse share and deep link → Task 10 · verification → Task 11. Every spec section maps to a task.

**Placeholders:** none — every code step carries the code.

**Type consistency:** `SignalCounts`, `CountsBySlug`, `parseCounts`, `emptyCounts`, `readCounts` (returns `{ok, counts}`), `recordLike`, `recordView`, `getDeviceId`, `buildShareUrl`, `selectHomepage`/`HomepageSelection` are used with the same names and shapes in every task that consumes them.
