# Reader signals — de-duplicated homepage, likes, views, share

**Date:** 2026-08-02
**Status:** design, awaiting implementation plan

Three asks from SanSan, one shared spine: the front page must stop printing the
same story three times, every story gets a prominent like, and stories (plus
Planet Pulse) get a share. Views ride along on the like plumbing.

---

## 1. The duplication defect

The homepage composes itself from three independent readers of the article
store, none of which knows what the others took:

| surface | selection | file |
|---|---|---|
| Night hero (lead + 3 briefs) | newest 4 overall | `page.tsx:31` |
| INSIDE THE EDITION grid | newest **9** overall | `page.tsx:25` |
| Vertical strip (4 tiles) | newest 3 *per vertical* | `vertical-strip.tsx:37` |

So today's lead is the hero, card 1 of the grid, and the first thumbnail of its
section tile — the same story three times before a reader has scrolled once.

### Fix: one selection pass, structurally enforced

New pure module `src/lib/homepage/select.ts`:

```ts
selectHomepage(articles: Article[], perSection = 6): {
  hero: Article[];                       // newest 4 overall
  sections: Record<Vertical, Article[]>; // newest `perSection` per vertical, none already claimed
}
```

It walks in order, marking each slug as claimed. `page.tsx` calls it once and
passes the results down. Two consequences, both deliberate:

- **`VerticalStrip` stops fetching.** It takes its stories as props and becomes
  presentational. A component that cannot reach the article store cannot
  duplicate what another surface already used.
- **`ArticleGrid` comes off the homepage** (SanSan's call: below the hero should
  be previous stories by section). The component stays — `/news`, `/tech`,
  `/sport` and `/features` all still use it.

`perSection = 6`. Stock is news 25, features 34, sport 11, tech 8, so every row
fills even after the hero takes its four.

**Invariant, unit-tested:** across `hero` + every section, no slug appears twice.
Also tested: a section only ever contains its own vertical; a vertical with
fewer than `perSection` remaining articles returns what it has rather than
padding from elsewhere.

---

## 2. Likes and views

### Storage

Supabase project **sandbox-daily** (`cjwgiigdoxsgwfrunivw`, eu-west-2, free
tier, created 2026-08-02). Two tables of identical shape:

```sql
article_likes (slug text, device_id uuid, created_at timestamptz default now(),
               unique (slug, device_id))
article_views (slug text, device_id uuid, viewed_on date default current_date,
               unique (slug, device_id, viewed_on))
```

Row-per-signal, not a bare counter: the unique constraints make double-counting
a database property rather than a client-side promise. A refresh cannot inflate
a view; a double-tap cannot inflate a like.

A view is **one device per article per day** — a reader returning tomorrow counts
again, a reader refreshing five times does not.

RLS on both, anon may `insert` only. Counts are read through a view
(`signal_counts`) exposing `slug, likes, views`, so the anon role never selects
raw rows and device ids stay unreadable from the browser.

### Access

Plain `fetch` against PostgREST from Next route handlers — no
`@supabase/supabase-js`. It is ~20 lines for insert-ignoring-duplicates plus a
counts read, and the house rule is no dependency for what 20 lines can do. The
cost is hand-written response types for two shapes, accepted.

Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — `.env.local` and all three
Vercel environments. Keys stay server-side in the route handlers regardless of
being publishable.

### Routes

| route | does |
|---|---|
| `POST /api/likes` | `{slug, deviceId}` → insert, ignore conflict → `{likes}` |
| `POST /api/views` | `{slug, deviceId}` → insert, ignore conflict → `204` |
| `GET /api/signals?slugs=a,b` | `{[slug]: {likes, views}}` |

Device id: `crypto.randomUUID()` in `localStorage` under `sd-device`, written on
first need. Not identity, not tracking — a de-duplication key.

### Failure behaviour

Every call fails soft. Supabase unreachable, paused, or erroring →
counts hide, the thumb still fills locally, the page never shows an error and
never fails to render. Free-tier projects pause after ~7 days idle; a quiet week
must cost the site a number, not a page.

### Display

- **Like thumb on every card** — no count. Prominent, tappable, keeps the front
  page a newspaper rather than a dashboard.
- **Article pages:** likes + views together, under the standfirst and again at
  the end of the piece.
- Counts fetch **after mount**, in one request per page, so ISR caching and the
  static shell are untouched.
- Numbers render as-is. No inflation, no rounding up, no "1.2k" until it is
  genuinely 1.2k. Early counts will read `4 views · 1 like`; that is the honest
  state of a site that publishes daily and is not yet read daily.

---

## 3. Share

One client component, `<ShareButton url title text />`:

- `navigator.share` where it exists — the native sheet on iOS/Android.
- Otherwise `navigator.clipboard.writeText` plus a transient "Link copied"
  confirmation.
- No third-party share SDKs, no per-network buttons, no tracking parameters.

**Articles:** beside the like button, both placements.

**Planet Pulse:** in the HUD. With an event selected it shares
`/pulse?event=<id>`; with nothing selected, `/pulse`. On arrival the page reads
`?event=` **from `window.location.search` in a mount effect**, not
`useSearchParams` — the hook would opt `/pulse` out of static rendering, and the
codebase already uses the read-after-mount pattern for exactly this reason
(`folio-row.tsx`, `pulse-client.tsx`). A missing or unknown id selects nothing
and is not an error.

---

## 4. Verification

Unit (`npm run test:lib`):

- `selectHomepage` — the no-duplicate invariant, vertical purity, short-stock
  behaviour.
- signal count parsing — the two PostgREST response shapes, including empty.
- share URL builder — event id present/absent.

Integration, by Playwright probe (mobile + desktop, the harness used for
today's hydration work):

- Homepage renders no slug twice.
- Like persists across reload; a second like from the same device does not move
  the count.
- A view is recorded once per day per device.
- Share falls back to clipboard when `navigator.share` is absent.
- Supabase unreachable → page renders, counts absent, no console error surfaced
  to the reader.

Then confirmed on production after deploy, not assumed from a green local run.

---

## Out of scope

Per-network share buttons · comments · reader accounts · analytics dashboards ·
any use of the device id beyond de-duplication · likes or views on Planet Pulse
events (share only).
