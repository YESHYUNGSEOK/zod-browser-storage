import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Storage type
 */
export type StorageType = 'local' | 'session';

/**
 * Type defining type-safe storage entry configuration.
 *
 * Parameterized by both the schema OUTPUT and INPUT types so that schemas whose input differs
 * from their output (transform / coerce / pipe / default) round-trip correctly: `set` accepts
 * the INPUT, `get` returns the OUTPUT. For ordinary schemas the two coincide.
 *
 * @template Output The value type produced by parsing (what `get` returns)
 * @template Input The value type accepted before parsing (what `set` accepts), defaults to Output
 *
 * @property {string} key
 *   - Storage key used with localStorage/sessionStorage.getItem / setItem
 *
 * @property {ZodType<Output, ZodTypeDef, Input>} value
 *   - Zod schema used to validate/parse stored data (safeParse after JSON.parse on get,
 *     safeParse before JSON.stringify on set)
 *
 * @property {Input} defaultValue
 *   - Default value used by init() and returned by get() with onFailure: 'default'
 *
 * @property {StorageType} storage
 *   - Storage type ("local" | "session"). Default: "local"
 */
export type SafeStorage<Output, Input = Output> = {
  key: string;
  value: ZodType<Output, ZodTypeDef, Input>;
  defaultValue: Input;
  storage?: StorageType;
};

/**
 * Options type for SafeStorage get method
 */
export interface SafeStorageGetOptions {
  /**
   * Specifies behavior on parsing/validation failure.
   *
   * - "null": Returns `null` on failure (default)
   * - "default": Returns `defaultValue` on failure
   * - "throw": Throws on failure — the original `ZodError` for schema validation failures,
   *   or a `SafeStorageError` for JSON parse failures
   */
  onFailure?: 'default' | 'null' | 'throw';
}
