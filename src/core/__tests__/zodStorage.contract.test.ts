import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { zs } from '../zs';
import { zodStorage } from '../zodStorage';
import { SafeStorageError } from '../errors';

describe('write-side validation (C2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('throws ZodError when set() receives schema-invalid data', () => {
    const storage = zs({
      key: 'age',
      schema: z.number().min(0).max(120),
      defaultValue: 0,
    });

    expect(() => zodStorage.set(storage, 999)).toThrow(z.ZodError);
  });

  it('does not write to storage when set() validation fails', () => {
    const storage = zs({
      key: 'age',
      schema: z.number().min(0).max(120),
      defaultValue: 0,
    });

    expect(() => zodStorage.set(storage, 999)).toThrow();
    expect(localStorage.getItem('age')).toBeNull();
  });

  it('init() throws when the configured defaultValue is schema-invalid (C15)', () => {
    const storage = zs({
      key: 'short',
      schema: z.string().min(3),
      defaultValue: 'ab',
    });

    expect(() => zodStorage.init(storage)).toThrow(z.ZodError);
  });
});

describe('transform round-trip with input != output (C5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates the INPUT on set() and returns the OUTPUT on get()', () => {
    const storage = zs({
      key: 'word',
      schema: z
        .string()
        .min(3)
        .transform((s) => s.length),
      defaultValue: 'abc',
    });

    // 'ab' is a valid string (compile-time input type) but fails min(3) at runtime
    expect(() => zodStorage.set(storage, 'ab')).toThrow(z.ZodError);

    zodStorage.set(storage, 'hello');
    expect(zodStorage.get(storage)).toBe(5);
  });
});

describe('set(undefined) does not corrupt storage (C6)', () => {
  // happy-dom does not perform WebIDL DOMString coercion, so we use a spec-compliant
  // storage mock that coerces values via String() (turning `undefined` into 'undefined').
  let original: Storage;

  const specStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      removeItem: (k: string) => map.delete(k),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
    } as Storage;
  };

  beforeEach(() => {
    original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: specStorage(),
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: original,
      configurable: true,
    });
  });

  it('removes the key instead of writing the literal string "undefined"', () => {
    const storage = zs({
      key: 'opt',
      schema: z.string().optional(),
      defaultValue: undefined,
    });

    localStorage.setItem('opt', JSON.stringify('x'));
    zodStorage.set(storage, undefined);

    expect(localStorage.getItem('opt')).toBeNull();
    expect(zodStorage.get(storage)).toBeNull();
  });
});

describe('throw path preserves error identity (C4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('throws the original ZodError (with .issues) on validation failure', () => {
    const storage = zs({ key: 'n', schema: z.number(), defaultValue: 0 });
    localStorage.setItem('n', JSON.stringify('not-a-number'));

    expect(() => zodStorage.get(storage, { onFailure: 'throw' })).toThrow(z.ZodError);

    try {
      zodStorage.get(storage, { onFailure: 'throw' });
      throw new Error('expected get() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect(Array.isArray((err as z.ZodError).issues)).toBe(true);
    }
  });

  it('throws a SafeStorageError (not a ZodError) on invalid JSON', () => {
    const storage = zs({ key: 'n', schema: z.number(), defaultValue: 0 });
    localStorage.setItem('n', 'not valid json');

    expect(() => zodStorage.get(storage, { onFailure: 'throw' })).toThrow(SafeStorageError);

    try {
      zodStorage.get(storage, { onFailure: 'throw' });
      throw new Error('expected get() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SafeStorageError);
      expect(err).not.toBeInstanceOf(z.ZodError);
    }
  });
});

describe('write failure paths are normalized (C3 / C11)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps a setItem failure (quota) in SafeStorageError', () => {
    const storage = zs({ key: 'q', schema: z.string(), defaultValue: '' });
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => zodStorage.set(storage, 'x')).toThrow(SafeStorageError);
  });

  it('wraps a JSON.stringify failure (circular reference) in SafeStorageError', () => {
    const storage = zs({ key: 'c', schema: z.any(), defaultValue: null });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => zodStorage.set(storage, circular)).toThrow(SafeStorageError);
  });
});

describe('empty-string raw value is routed through onFailure, not treated as absent (C8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaultValue (onFailure:default) when an external writer stored an empty string', () => {
    const storage = zs({ key: 'e', schema: z.string(), defaultValue: 'fallback' });
    localStorage.setItem('e', '');

    expect(zodStorage.get(storage, { onFailure: 'default' })).toBe('fallback');
  });
});

describe('default-bearing schema round-trips through set(undefined) (EF-1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the resolved default when set() receives undefined for a .default() schema', () => {
    const storage = zs({
      key: 'greeting',
      schema: z.string().default('hello'),
      defaultValue: 'fallback',
    });

    zodStorage.set(storage, undefined);
    expect(zodStorage.get(storage)).toBe('hello');
  });

  it('still removes the key for an optional schema given undefined', () => {
    const storage = zs({
      key: 'maybe',
      schema: z.string().optional(),
      defaultValue: undefined,
    });

    localStorage.setItem('maybe', JSON.stringify('prev'));
    zodStorage.set(storage, undefined);
    expect(localStorage.getItem('maybe')).toBeNull();
  });
});

describe('values that serialize to undefined do not corrupt storage (WV-1 / S1)', () => {
  let original: Storage;

  const specStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      removeItem: (k: string) => map.delete(k),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
    } as Storage;
  };

  beforeEach(() => {
    original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: specStorage(), configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
  });

  it('removes the key instead of writing "undefined" when a validated value is not serializable', () => {
    const storage = zs({ key: 'fn', schema: z.any(), defaultValue: null });
    localStorage.setItem('fn', JSON.stringify('prev'));

    zodStorage.set(storage, () => 1);

    expect(localStorage.getItem('fn')).not.toBe('undefined');
    expect(localStorage.getItem('fn')).toBeNull();
  });
});

describe('absent key honors onFailure (WV-2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaultValue with onFailure:default when the key is absent', () => {
    const storage = zs({ key: 'missing', schema: z.string(), defaultValue: 'fallback' });
    expect(zodStorage.get(storage, { onFailure: 'default' })).toBe('fallback');
  });

  it('returns null (default onFailure) when the key is absent', () => {
    const storage = zs({ key: 'missing', schema: z.string(), defaultValue: 'fallback' });
    expect(zodStorage.get(storage)).toBeNull();
  });
});

describe('blocked storage (throwing global) is treated as unavailable (COV-1)', () => {
  let descriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });

  afterEach(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });

  it('get() returns null/defaultValue and does not throw', () => {
    const storage = zs({ key: 'b', schema: z.string(), defaultValue: 'fallback' });
    expect(zodStorage.get(storage)).toBeNull();
    expect(zodStorage.get(storage, { onFailure: 'default' })).toBe('fallback');
    expect(() => zodStorage.get(storage, { onFailure: 'throw' })).not.toThrow();
  });

  it('set/clear/init are silent no-ops', () => {
    const storage = zs({ key: 'b', schema: z.string(), defaultValue: 'x' });
    expect(() => zodStorage.set(storage, 'v')).not.toThrow();
    expect(() => zodStorage.clear(storage)).not.toThrow();
    expect(() => zodStorage.init(storage)).not.toThrow();
  });
});

describe('removeItem failures are normalized to SafeStorageError (SSR-2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clear() wraps a removeItem failure in SafeStorageError', () => {
    const storage = zs({ key: 'r', schema: z.string(), defaultValue: '' });
    vi.spyOn(globalThis.localStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => zodStorage.clear(storage)).toThrow(SafeStorageError);
  });
});
