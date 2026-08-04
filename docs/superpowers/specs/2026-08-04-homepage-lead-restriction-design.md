# Homepage lead restriction — design

**Date:** 2026-08-04
**Status:** approved, not built
**Context:** Phase C of the three-radars work (Phases A + B shipped 2026-08-02).

## The problem

Phase A gave the radar three verticals; Phase B carried a promoted lead's
vertical through research → article → category, so sport and tech stories now
reach the paper in real numbers. They also reach the **front page lead**:
`selectHomepage` takes the newest four articles of any vertical, so on
2026-08-02 a transfer story led the edition.

That is an editorial decision the code is making by accident. The Sandbox Daily
is a news paper whose front door should lead on news or a feature; sport and
tech belong beneath, as briefs — unless the operator decides otherwise for a
specific story.

## The rule

An article is **lead-eligible** when either is true:

- its category is `news` or `features`, or
- its frontmatter carries `homepage_lead: true`.

The lead is the **first lead-eligible article in the existing newest-first
order**. Everything else about the homepage is unchanged: the three brief slots
below the lead take the next three newest of any vertical, and the section
strips below them are untouched.

Two consequences worth stating, because they are the whole design:

**Recency still decides.** Scanning newest-first means a flagged sport story
leads only while nothing eligible is newer, then yields on its own. There is no
expiry rule, no clearing of older flags, no "current lead" pointer to keep
correct. The flag makes a story *eligible*; it never makes it *win*.

**The restriction is a preference, not a wall.** If no lead-eligible article
exists, the newest article leads regardless of vertical. A paper always has a
lead; a front page rendering headless because the rule had nothing to select is
a worse failure than a sport story leading for a day. (SanSan's call,
2026-08-04.)

Today the store is 28 news / 34 features / 13 sport / 9 tech, so the fallback is
close to hypothetical — but it is reachable on a fresh checkout or if the
content root is ever filtered, and undefined behaviour there means an empty
hero.

## Where it lives

`selectHomepage` (`src/lib/homepage/select.ts`) already owns every homepage
claim — that single-pass ownership is what stopped the lead printing four times
(2026-08-02). The lead rule goes there and nowhere else: no component may
re-derive it.

```
leadEligible(a) = a.category === "news" || a.category === "features"
                  || a.homepageLead === true

lead   = articles.find(leadEligible) ?? articles[0]   // undefined on an empty store
hero   = lead
         ? [lead, ...articles.filter(a => a.slug !== lead.slug)
                           .slice(0, HERO_COUNT - 1)]
         : []
```

`articles` arrives newest-first (`byRecency`, applied by `getAllArticles`) and
is never re-sorted here — same contract the function already documents.

An empty store yields an empty hero, as it does today.

Unchanged: `VerticalStrip`, the section fronts, the PRESS WIRE ticker
(deliberately cross-vertical — a genuinely massive sport story belongs on the
wire), `/pulse`, the folio.

## The flag's round trip

The seam runs: **review checkbox → `/api/review` → `approveArticle` →
frontmatter → `articles.ts` parse → `selectHomepage`.** Six hops; each one is a
place the flag can be silently dropped.

| Hop | Change |
|---|---|
| `ReviewActions.tsx` | Checkbox "Lead the front page", rendered only when `vertical` is `sport` or `tech`. Sent in the approve `fields` payload as `homepage_lead`. |
| `/api/review/route.ts` | `ReviewRequest["fields"]` gains `homepage_lead?: boolean`; non-boolean values are ignored rather than 400 (the field is optional and absent for every news/features approval). |
| `approve.ts` | `true` writes `homepage_lead: true`; `false` deletes the key if present; **absent leaves the file untouched.** |
| `types.ts` | `Article.homepageLead?: boolean`. |
| `articles.ts` | `homepageLead: data.homepage_lead === true` — strict equality, no truthiness, matching the `SANDBOX_ADMIN === "1"` house rule. A string `"false"` in hand-edited frontmatter must not read as true. |
| `select.ts` | The rule above. |

**Byte-identity is load-bearing.** `approveArticle` writes the file only when
the serialised output differs, and `publishArticle` treats "nothing staged" as
a re-approval and skips the commit. One approval that restamped a single line
shipped seven production builds on 2026-08-02. So the absent case must not
write `homepage_lead: false` into every article, and a repeat approval with the
same checkbox state must produce identical bytes.

### Naming

`homepage_lead` in frontmatter (snake_case, alongside `social_post`,
`edited_at`, `word_count`); `homepageLead` on the `Article` type. This is the
existing convention in both files, not a new one.

## Testing

Unit, on `selectHomepage` (`src/lib/homepage/select.test.ts`):

1. newest article is sport, a news piece is second → the news piece leads
2. that sport piece still appears, in the briefs, exactly once
3. newest article is sport with `homepageLead: true` → it leads
4. flagged sport piece older than a news piece → the news piece leads
5. store contains only sport and tech → the newest article leads (fallback)
6. empty store → empty hero, no throw
7. the lead never repeats in the briefs or in any section list

Unit, on `approveArticle` (`src/lib/review/approve.test.ts`):

8. `homepage_lead: true` writes the key
9. `homepage_lead: false` removes an existing key
10. field absent → an article already carrying the flag keeps it
11. re-approving with the same state returns `changed: false` and writes nothing

Integration, new (`src/lib/homepage/lead.integration.test.ts`):

12. write a real markdown file carrying `homepage_lead: true` into a temp
    content root, read it back through the article parser, and assert the flag
    survives into `selectHomepage`'s decision.

Test 12 is not redundant. Tests 1–7 build `Article` objects by hand, which
proves the rule and nothing about whether the frontmatter key ever reaches it —
the exact gap that produced the `sport`/`sports` category bug (Phase B) and the
seven-commit publish loop, where each component was correct and the seam
between them was not. A test that fabricates a state the real flow cannot
produce is not coverage.

Tests live at `src/lib/**` so the existing quoted-glob runner picks them up.

## Rendered verification

Two states checked on a prod-parity build (`next build && next start`), not on
`next dev`, and by computed style / screenshot rather than curl — grepping
compiled output has passed inert fixes here before:

- default store → a news or features story leads, the newest sport story sits
  in the briefs
- one sport article flagged and newest → it leads

## Out of scope

- **Promoting an already-published article to lead.** The checkbox rides the
  approve action; changing a published story's flag means editing frontmatter
  by hand. A surface for that is a separate piece of work.
- **Pinning a lead against newer stories.** Deliberate: recency is the whole
  ordering model, and a pin needs an unpin, which needs a surface.
- **Tech as a lead-eligible vertical.** News and features only.

## Follow-on, same session

`npm run radar:snapshot` and commit the refreshed
`src/lib/radar/events.snapshot.json`, so prod's ticker reflects the tech and
sport feeds added in Phase A. Prod has no live radar feed — the committed
snapshot *is* the ticker there.

*Last updated: 2026-08-04*
