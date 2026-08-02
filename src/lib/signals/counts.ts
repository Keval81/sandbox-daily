export interface SignalCounts {
  likes: number;
  views: number;
}

export type CountsBySlug = Record<string, SignalCounts>;

/** PostgREST returns bigint aggregates as JSON strings often enough that
 *  trusting `number` here would put NaN on the page. */
const toCount = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * Parses the `signal_counts` view.
 *
 * Deliberately total: a paused project, an expired key or a schema drift all
 * return something that is not an array of rows, and every one of those has to
 * degrade to "no counts" rather than throw inside a route handler. A row it
 * cannot read is dropped, never guessed at.
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

/** A slug nobody has liked or read yet is absent from the view — the UI still
 *  wants a zero rather than a hole. */
export function emptyCounts(slugs: string[]): CountsBySlug {
  return Object.fromEntries(slugs.map((s) => [s, { likes: 0, views: 0 }]));
}
