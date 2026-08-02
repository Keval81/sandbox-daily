import { emptyCounts, parseCounts, type CountsBySlug } from "./counts";

const url = (): string | undefined => process.env.SUPABASE_URL;
const key = (): string | undefined => process.env.SUPABASE_PUBLISHABLE_KEY;

/** 2s. A signal is never worth making a reader wait for. */
const TIMEOUT_MS = 2000;

const headers = (extra: Record<string, string> = {}): HeadersInit => ({
  apikey: key() ?? "",
  "Content-Type": "application/json",
  ...extra,
});

const call = async (path: string, init: RequestInit): Promise<Response | null> => {
  // Unconfigured is a soft state, not an error: a checkout without env vars
  // should render the site, minus counts.
  if (!url() || !key()) return null;
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

/**
 * Plain insert; a duplicate is success.
 *
 * NOT `Prefer: resolution=ignore-duplicates` — measured against this project on
 * 2026-08-02, that resolution makes PostgREST run an upsert, which RLS rejects
 * (42501) because these tables grant INSERT only and deliberately carry no
 * UPDATE policy. Letting the primary key raise 23505 keeps the grant minimal:
 * the second tap is refused by the database itself, which is the whole point.
 */
const insert = async (table: string, body: Record<string, string>): Promise<void> => {
  await call(table, {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  });
};

export const recordLike = (slug: string, deviceId: string): Promise<void> =>
  insert("article_likes", { slug, device_id: deviceId });

export const recordView = (slug: string, deviceId: string): Promise<void> =>
  insert("article_views", { slug, device_id: deviceId });

/**
 * Counts for the given slugs. A slug with no rows comes back as zeroes; an
 * unreachable or unconfigured backend comes back `ok: false`, and the UI hides
 * counts rather than showing a confident 0 it cannot stand behind.
 */
export async function readCounts(
  slugs: string[]
): Promise<{ ok: boolean; counts: CountsBySlug }> {
  if (slugs.length === 0) return { ok: true, counts: {} };
  // Slugs are validated at the route boundary; quoting here is belt-and-braces
  // against a caller that forgot.
  const list = slugs.map((s) => `"${s.replace(/["(),]/g, "")}"`).join(",");
  const res = await call(`signal_counts?select=slug,likes,views&slug=in.(${list})`, {
    method: "GET",
    headers: headers(),
  });
  if (!res || !res.ok) return { ok: false, counts: emptyCounts(slugs) };
  const parsed = parseCounts(await res.json().catch(() => null));
  return { ok: true, counts: { ...emptyCounts(slugs), ...parsed } };
}
