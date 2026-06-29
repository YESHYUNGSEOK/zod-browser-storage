import { SafeStorage, SafeStorageGetOptions } from '@/types/type';
import { getStorageObject } from '../utils/getStorageObject';
import { SafeStorageError } from './errors';

/** Removes a key, normalizing any storage write failure into a SafeStorageError. */
function safeRemove(storageObj: Storage, key: string): void {
  try {
    storageObj.removeItem(key);
  } catch (err) {
    throw new SafeStorageError(
      `Failed to remove storage key "${key}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Retrieves a value from storage.
 * - Returns `null` (or `defaultValue` with `onFailure: 'default'`) when the key is absent or
 *   Web Storage is unavailable (SSR / blocked) — these never throw.
 * - On JSON parse or Zod validation failure, behaves per `options.onFailure`.
 *
 * @template Output The value type produced by the schema (what is returned)
 * @template Input The value type accepted by the schema before parsing
 */
function get<Output, Input = Output>(storageConfig: SafeStorage<Output, Input>): Output | null;
/**
 * `onFailure: 'default'` — returns the validated value, or `defaultValue` (the raw schema INPUT,
 * not re-parsed) when the value is absent/unavailable/invalid. Never returns `null`.
 */
function get<Output, Input = Output>(
  storageConfig: SafeStorage<Output, Input>,
  options: { onFailure: 'default' }
): Output | Input;
/**
 * `onFailure: 'null'` returns the validated value or `null`. `onFailure: 'throw'` returns the
 * validated value, returns `null` when absent/unavailable, and throws on parse/validation failure
 * (the original `ZodError` for validation, a `SafeStorageError` for JSON parse failures).
 */
function get<Output, Input = Output>(
  storageConfig: SafeStorage<Output, Input>,
  options: { onFailure: 'null' | 'throw' }
): Output | null;
function get<Output, Input = Output>(
  storageConfig: SafeStorage<Output, Input>,
  options?: SafeStorageGetOptions
): Output | Input | null;
function get<Output, Input = Output>(
  storageConfig: SafeStorage<Output, Input>,
  options?: SafeStorageGetOptions
): Output | Input | null {
  const { key, value: schema, defaultValue, storage = 'local' } = storageConfig;
  const { onFailure = 'null' } = options ?? {};

  const storageObj = getStorageObject(storage);

  // No value to validate — Web Storage unavailable (SSR / blocked) or key absent. This is not a
  // data error, so we never throw; fall back per onFailure ('default' -> defaultValue, else null).
  if (storageObj === null) {
    return onFailure === 'default' ? defaultValue : null;
  }

  const raw = storageObj.getItem(key);

  // Only a genuinely absent key short-circuits. An empty string is a stored value and is routed
  // through the parse/validation pipeline below.
  if (raw === null) {
    return onFailure === 'default' ? defaultValue : null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    // JSON parse failure — distinct from a schema validation failure.
    if (onFailure === 'throw') {
      throw new SafeStorageError(`Failed to parse stored JSON for key "${key}".`);
    }
    return onFailure === 'default' ? defaultValue : null;
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  // Zod validation failure — preserve the original ZodError so callers keep .issues/.flatten().
  if (onFailure === 'throw') {
    throw result.error;
  }
  return onFailure === 'default' ? defaultValue : null;
}

/**
 * Stores a value in storage after validating it against the schema.
 * - No-op when Web Storage is unavailable (SSR / blocked).
 * - Throws the original `ZodError` when `data` fails schema validation (nothing is written).
 * - Throws a `SafeStorageError` when serialization or the storage write fails (e.g. quota).
 *
 * @template Output The value type produced by the schema
 * @template Input The value type accepted by the schema before parsing (the type of `data`)
 * @param {SafeStorage<Output, Input>} storageConfig - Storage configuration
 * @param {Input} data - The data to store (schema INPUT type)
 * @returns {void}
 */
function set<Output, Input = Output>(storageConfig: SafeStorage<Output, Input>, data: Input): void {
  const { key, value: schema, storage = 'local' } = storageConfig;
  const storageObj = getStorageObject(storage);

  // Web Storage unavailable (SSR / blocked): silent no-op.
  if (storageObj === null) {
    return;
  }

  // Validate the input on write (throws the original ZodError on failure).
  const result = schema.safeParse(data);
  if (!result.success) {
    throw result.error;
  }

  // Normally store the raw INPUT so transform/coerce schemas round-trip (get re-parses to output).
  // An `undefined` input is not storable, so fall back to the parsed output — which for a
  // `.default()` schema is the resolved default (a valid, re-parsable value), and for an optional
  // schema is `undefined` (handled as removal below).
  const toStore = data === undefined ? result.data : data;

  if (toStore === undefined) {
    safeRemove(storageObj, key);
    return;
  }

  let serialized: string;
  try {
    const json: string | undefined = JSON.stringify(toStore);
    // JSON.stringify returns undefined for non-serializable values (functions, symbols) that may
    // pass a permissive schema (z.any()). Writing it would store the literal "undefined"; remove
    // the key instead so reads stay clean.
    if (json === undefined) {
      safeRemove(storageObj, key);
      return;
    }
    serialized = json;
  } catch (err) {
    throw new SafeStorageError(
      `Failed to serialize value for key "${key}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    storageObj.setItem(key, serialized);
  } catch (err) {
    throw new SafeStorageError(
      `Failed to write to storage for key "${key}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Clears a value from storage for the given key.
 * - No-op when Web Storage is unavailable (SSR / blocked).
 * - Throws a `SafeStorageError` if the underlying removal fails.
 *
 * @template Output The value type produced by the schema
 * @template Input The value type accepted by the schema before parsing
 * @param {SafeStorage<Output, Input>} storageConfig - Storage configuration
 * @returns {void}
 */
function clear<Output, Input = Output>(storageConfig: SafeStorage<Output, Input>): void {
  const { key, storage = 'local' } = storageConfig;
  const storageObj = getStorageObject(storage);

  if (storageObj === null) {
    return;
  }

  safeRemove(storageObj, key);
}

/**
 * Initializes storage with the default value.
 * - Validates `defaultValue` against the schema (throws `ZodError` if invalid).
 * - No-op when Web Storage is unavailable (SSR / blocked).
 * - Overwrites unconditionally without checking existence.
 *
 * @template Output The value type produced by the schema
 * @template Input The value type accepted by the schema before parsing
 * @param {SafeStorage<Output, Input>} storageConfig - Storage configuration
 * @returns {void}
 */
function init<Output, Input = Output>(storageConfig: SafeStorage<Output, Input>): void {
  set(storageConfig, storageConfig.defaultValue);
}

/**
 * Type-safe Web Storage utility based on Zod schema.
 * Supports both localStorage and sessionStorage.
 *
 * @example
 * ```ts
 * import { zs, zodStorage } from "zod-browser-storage";
 * import { z } from "zod";
 *
 * // Using localStorage (default)
 * const LocalData = zs({
 *   key: 'localData',
 *   schema: z.array(z.number()),
 *   defaultValue: []
 * });
 *
 * // Using sessionStorage
 * const SessionData = zs({
 *   key: 'sessionData',
 *   schema: z.string(),
 *   defaultValue: '',
 *   storage: 'session'
 * });
 *
 * zodStorage.set(LocalData, [1, 2, 3]);
 * const ids = zodStorage.get(LocalData);
 *
 * zodStorage.set(SessionData, 'hello');
 * const data = zodStorage.get(SessionData);
 * ```
 */
export const zodStorage = { get, set, clear, init };
