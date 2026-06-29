// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { zs } from '../zs';
import { zodStorage } from '../zodStorage';

// In the Node (SSR) environment there is no Web Storage. We additionally force-remove the
// globals so the test is deterministic regardless of the Node version (Node 22.4+ can expose
// experimental localStorage behind a flag).
const removeStorageGlobals = () => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
  }
};

describe('SSR / non-browser environment (C1 / C3 / C10)', () => {
  beforeEach(() => {
    removeStorageGlobals();
  });

  afterEach(() => {
    removeStorageGlobals();
  });

  const storage = zs({ key: 'k', schema: z.string(), defaultValue: 'fallback' });

  it('get() returns null (onFailure:null) instead of throwing', () => {
    expect(typeof globalThis.localStorage).toBe('undefined');
    expect(zodStorage.get(storage)).toBeNull();
  });

  it('get() returns defaultValue (onFailure:default) instead of throwing', () => {
    expect(zodStorage.get(storage, { onFailure: 'default' })).toBe('fallback');
  });

  it('get() does not throw even with onFailure:throw (SSR is not a data error)', () => {
    expect(() => zodStorage.get(storage, { onFailure: 'throw' })).not.toThrow();
    expect(zodStorage.get(storage, { onFailure: 'throw' })).toBeNull();
  });

  it('set() is a silent no-op', () => {
    expect(() => zodStorage.set(storage, 'value')).not.toThrow();
  });

  it('clear() is a silent no-op', () => {
    expect(() => zodStorage.clear(storage)).not.toThrow();
  });

  it('init() is a silent no-op', () => {
    expect(() => zodStorage.init(storage)).not.toThrow();
  });
});
