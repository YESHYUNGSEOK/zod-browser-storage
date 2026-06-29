import { StorageType } from '@/types/type';

/**
 * Returns the requested Web Storage object, or `null` when Web Storage is unavailable —
 * server-side rendering / non-browser runtimes (the global is undefined) or storage
 * disabled/blocked by the browser (accessing the global throws, e.g. Safari private mode).
 *
 * Accessing via `globalThis` (rather than the bare global) yields `undefined` instead of a
 * `ReferenceError` on the server, so callers can fall back gracefully.
 */
export const getStorageObject = (type: StorageType = 'local'): Storage | null => {
  try {
    const storage = type === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
};
