/**
 * Error thrown by zod-browser-storage for NON-validation failures:
 * - JSON parse failure when reading (`get` with `onFailure: 'throw'`)
 * - serialization failure when writing (e.g. circular reference, BigInt)
 * - storage write failure when writing (e.g. `QuotaExceededError`, Safari private mode)
 *
 * Zod schema validation failures throw the original `ZodError` instead, so callers can
 * distinguish the two causes with `instanceof` (`ZodError` vs `SafeStorageError`).
 */
export class SafeStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeStorageError';
    // Preserve the prototype chain so `instanceof` holds across transpilation targets.
    Object.setPrototypeOf(this, SafeStorageError.prototype);
  }
}
