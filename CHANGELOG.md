# zod-browser-storage

## 0.2.0

### Minor Changes

- d6ba011: Harden the core contract (SSR safety, write-side validation, error fidelity). Contains breaking type/behavior changes.

  **Fixes**
  - **SSR / non-browser safety:** `get/set/clear/init` no longer throw `ReferenceError` when Web Storage is unavailable (SSR, non-browser runtimes). `get()` returns `null`/`defaultValue` per `onFailure`; `set/clear/init` are silent no-ops. Storage globals are now accessed via `globalThis` and guarded.
  - **Runtime write validation:** `set()` and `init()` now validate against the schema before writing and throw the original `ZodError` on failure (nothing is written). Previously writes were unvalidated despite the docs.
  - **Error fidelity:** `get(..., { onFailure: 'throw' })` now throws the original `ZodError` (with `.issues`/`.flatten()`) on validation failure instead of a stringified generic `Error`. JSON parse failures and write failures (serialization, `QuotaExceededError`) throw a new exported `SafeStorageError`.
  - **Transform/coerce round-trip:** schemas whose input differs from their output now round-trip correctly — `set()` accepts the input type, `get()` returns the output type. The options-form `get()` return type is now narrowed per `onFailure` (`'default'` → `Output | Input`; `'null'`/`'throw'` → `Output | null`).
  - **`set(undefined)`** removes the key for optional schemas (instead of writing the literal `"undefined"`) and stores the resolved default for `.default()` schemas. Values that serialize to `undefined` (e.g. a function/symbol via `z.any()`) also remove the key instead of corrupting it.
  - **Empty-string / absent reads:** an empty-string stored value is routed through `onFailure` instead of being treated as absent; an absent key now honors `onFailure: 'default'` (returns `defaultValue`).
  - **`clear()` / `set()` removals** normalize storage failures (e.g. Safari private mode) into `SafeStorageError`.

  **Breaking changes**
  - `set()`/`init()` can now throw (`ZodError` / `SafeStorageError`); previously they never threw.
  - Type signatures changed: `SafeStorage` is now parameterized as `SafeStorage<Output, Input = Output>`, and `set()` accepts the schema **input** type while `get()` returns the **output** type.

  **Added**
  - `SafeStorageError` is now exported.

## 0.1.4

### Patch Changes

- 01a2b4c: build: disable source maps to reduce package size from 39.5 KB to 24.2 KB

## 0.1.3

### Patch Changes

- ea18c90: build: add ci, rlease github action workflows
- 2bd32c2: chore: remove pnpm-lock.yaml from .gitignore
