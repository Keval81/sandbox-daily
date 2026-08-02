const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/;

export const isSlug = (value: unknown): value is string =>
  typeof value === "string" && SLUG.test(value);

export const isDeviceId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/** Shared by both write routes: validated, not sanitised. A bad shape is a bug
 *  or an attack, and either way it has no business reaching the database. */
export function readSignalBody(
  body: unknown
): { slug: string; deviceId: string } | { error: string } {
  const { slug, deviceId } = (body ?? {}) as { slug?: unknown; deviceId?: unknown };
  if (!isSlug(slug)) return { error: "bad slug" };
  if (!isDeviceId(deviceId)) return { error: "bad deviceId" };
  return { slug, deviceId };
}
