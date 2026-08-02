import { isDeviceId } from "./validate";

export const DEVICE_KEY = "sd-device";

/** Pure, so the validation is testable without a DOM. */
export const readStoredDeviceId = (
  store: Record<string, string | undefined>
): string | null => {
  const value = store[DEVICE_KEY];
  return isDeviceId(value) ? value : null;
};

/**
 * A de-duplication key, nothing more: it travels with a like or a view and
 * nowhere else, is never logged, never joined to anything, and no read path can
 * return it (RLS grants insert only). Private browsing clears it, and that is
 * fine — the reader's next like simply counts again.
 */
export function getDeviceId(): string {
  try {
    const existing = readStoredDeviceId(
      localStorage as unknown as Record<string, string | undefined>
    );
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage blocked (private mode, embedded webview): a per-session id still
    // stops a double-tap counting twice, which is the guarantee that matters.
    return crypto.randomUUID();
  }
}
