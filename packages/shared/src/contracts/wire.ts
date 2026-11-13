/**
 * Wire conventions for the mobile API contracts (Pitch 21b spec §13).
 *
 * - Every body is plain JSON: strings, numbers, booleans, null, arrays, and
 *   plain objects. No Date, Set, Map, bigint, class instance, or function.
 * - A calendar date is an `IsoDate` ("2026-11-12", in the account's time
 *   zone). An instant is an `IsoDateTime` ("2026-11-12T18:04:05.123Z",
 *   `Date#toISOString`). A field is one or the other, never both.
 * - `null` means not recorded or none (a bodyweight set's weight, an
 *   unrecorded RIR, no performance yet). Zero is only ever a real zero.
 * - A gated Pro result keeps `locked: true` with its Pro fields `null`, exactly
 *   as the server's gate returns it.
 * - Enum-valued fields use the shared enum registry's unions.
 * - Within API v1, changes are additive only, because old app versions stay
 *   installed (CLAUDE.md, mobile API rules).
 */

/** A calendar date in the account's time zone: "2026-11-12". */
export type IsoDate = string;

/** An instant, `Date#toISOString` form: "2026-11-12T18:04:05.123Z". */
export type IsoDateTime = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

/**
 * Compile-time check that a contract crosses the wire unchanged: `true` when
 * `T` contains only JSON values (optional keys allowed), `false` when it holds
 * a Date, Set, Map, bigint, function, symbol, or `undefined` as a value. A
 * union is checked member by member, so every variant of a discriminated
 * union is inspected. Used by apps/web/tests/unit/mobile-contracts.test.ts.
 */
export type IsJsonSafe<T> =
  true extends IsUnion<T> ? EveryMember<T> : SingleIsJsonSafe<T>;

type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

type EveryMember<T> = [
  T extends unknown ? (SingleIsJsonSafe<T> extends true ? never : T) : never,
] extends [never]
  ? true
  : false;

type SingleIsJsonSafe<T> = [T] extends [JsonPrimitive]
  ? true
  : [T] extends [undefined]
    ? false
    : [T] extends [Date | Set<unknown> | Map<unknown, unknown>]
      ? false
      : [T] extends [bigint | symbol | ((...args: never[]) => unknown)]
        ? false
        : [T] extends [readonly (infer E)[]]
          ? IsJsonSafe<E>
          : [T] extends [object]
            ? AllTrue<{
                [K in keyof T]-?: IsJsonSafe<Exclude<T[K], undefined>>;
              }>
            : false;

type AllTrue<O> = false extends O[keyof O] ? false : true;
