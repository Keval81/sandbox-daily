/** Absolute, because a share target handed "/news/x" is useless to whoever
 *  receives it. */
export function buildShareUrl(
  origin: string,
  path: string,
  params: Record<string, string> = {}
): string {
  const base = `${origin.replace(/\/$/, "")}${path}`;
  const query = new URLSearchParams(params).toString();
  return query ? `${base}?${query}` : base;
}
