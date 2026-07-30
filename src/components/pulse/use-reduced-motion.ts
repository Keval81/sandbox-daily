"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void): (() => void) => {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

const getSnapshot = (): boolean => matchMedia(QUERY).matches;

/** The server cannot know the reader's motion preference; the store corrects it
 *  on hydration, which is exactly what useSyncExternalStore is for. */
const getServerSnapshot = (): boolean => false;

/**
 * One store, read by both the HUD button and the renderer. Two independent
 * reads drift the moment the setting changes mid-session: the button re-enables
 * itself and says "Pause" over a globe that is still refusing to move.
 */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
