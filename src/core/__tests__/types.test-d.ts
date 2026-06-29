/**
 * Type-level contract tests (C5). Verified by `tsc --noEmit` (pnpm typecheck), NOT by vitest
 * (the `.test-d.ts` suffix does not match vitest's `*.test.ts` include glob). A failing
 * `@ts-expect-error` (TS2578) or any stray type error fails the typecheck gate.
 */
import { z } from 'zod';
import { zs } from '../zs';
import { zodStorage } from '../zodStorage';

// A schema whose INPUT (string) differs from its OUTPUT (number).
const transformStore = zs({
  key: 'len',
  schema: z.string().transform((s) => s.length),
  defaultValue: 'abc', // defaultValue is the INPUT type (string)
});

// set() accepts the INPUT type (string).
zodStorage.set(transformStore, 'hello');

// set() rejects the OUTPUT type (number). If this were accepted, get() would re-parse a
// number as a string and silently lose the value (the original C5 bug).
// @ts-expect-error set() must take z.input (string), not z.output (number)
zodStorage.set(transformStore, 5);

// get() returns the OUTPUT type (number | null).
const transformed: number | null = zodStorage.get(transformStore);
void transformed;

// onFailure:'default' returns Output | Input (the un-parsed default), never null.
const def: number | string = zodStorage.get(transformStore, { onFailure: 'default' });
void def;

// onFailure:'null' returns Output | null — must NOT leak the Input (string) type.
const viaNull: number | null = zodStorage.get(transformStore, { onFailure: 'null' });
void viaNull;

// onFailure:'throw' returns Output | null (absent/SSR -> null; failures throw).
const viaThrow: number | null = zodStorage.get(transformStore, { onFailure: 'throw' });
void viaThrow;

// Plain schema: input === output, behaves like a single type.
const plainStore = zs({ key: 'p', schema: z.number(), defaultValue: 0 });
zodStorage.set(plainStore, 42);
const plain: number | null = zodStorage.get(plainStore);
void plain;
