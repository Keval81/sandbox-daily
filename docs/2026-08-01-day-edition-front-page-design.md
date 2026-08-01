# Day Edition — the printed front page (2026-08-01)

Direction from SanSan: the homepage should read as a printed newspaper. Big
tabloid/broadsheet masthead, section navigation restored, thumbnails on the
front-page stories, date/time/temp under the masthead, the ticker back in its
old ink style (slightly bigger), globe filters gone from the front page
(Pulse keeps its own), and — now the globe lives in a framed window — the rest
of the page moves off night ink onto paper.

## Decisions

1. **Paper, not ink.** `.night-hero` flips to a warm newsprint paper tone
   (`--paper`, a shade warmer than `--color-cream`) with an ink-dot grain.
   The globe's plate window keeps its ink interior — it is now literally a
   dark window cut into a paper page ("Reality Window", strengthened).
2. **Masthead stack (top → bottom):** ears (PRINTED NIGHTLY / THE PLANET,
   FACT-CHECKED) flanking a large uppercase Playfair 900 nameplate
   (`SANDBOX DAILY`, DAILY in orange italic) → hairline rule → folio line
   `№ N · DATELINE · CLOCK · LONDON T°C` (client, ticking — the "date time
   temp under the main header" ask) → section rail (NEWS TECH SPORT FEATURES
   PULSE, real links, colour ticks) → 3px double rule. Nameplate (server)
   owns the whole stack and renders FolioRow (client) inside it.
3. **Ticker** reverts to the ink strip + Live dot, one size up from the
   original (13px vs 11px meta; the 19px orange wire dies). Headlines: radar
   events when the local feed exists, else the latest published article
   titles — the radar file is machine-local, so production always fell back
   to the static "SANDBOX DAILY — LIVE" string. Empty list renders nothing.
4. **Front-page body:** lead column (kicker, headline, 2-col standfirst,
   bordered lead illustration + mono caption, then three thumbnail briefs in
   a row) | hairline column rule | plate window + live line. Four stories on
   the front page, thumbnails from `heroImage`.
5. **Filters:** layer chips removed from the front page entirely
   (`chipsFromLayers`/`GHOST_CHIPS` deleted); /pulse keeps its layer panel.
6. **Globe spin** raised from −0.0018 to −0.0032 rad/frame (~1 rev/33 s) —
   the old rate read as a still image. Pins already pulse.
7. **Nav:** fixed site nav appears once the in-page masthead rail scrolls
   away (fixed 300px threshold, was 70vh). Other routes keep the always-solid
   bar. The rail is the load-time navigation the old page lacked.
8. **Deploy truth:** prod builds from pushed main; the 11 new articles and
   their images were untracked. They ship with this change.

*Last updated: 2026-08-01*
