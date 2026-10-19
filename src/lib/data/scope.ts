import { Prisma } from "@prisma/client";

/**
 * The account-scoping rules (Multi-User Foundation, spec §9). A PURE function
 * of (model, operation, args, acting userId) → the args Prisma actually runs.
 * src/lib/data/account-db.ts applies it to every model operation of the
 * account-scoped client, so feature code never decides whether to scope.
 *
 *  - Owned model (any model with a `userId` scalar): reads and targeted writes
 *    are INTERSECTED with `userId = acting` (a caller's own filter can narrow
 *    the set, never widen it); creates are stamped with the acting userId.
 *  - Exercise, the one shared-or-owned model: reads see the library
 *    (`userId = null`) plus the acting account's custom exercises; writes reach
 *    only the acting account's custom exercises, so library rows are read-only.
 *  - Refused outright (AccountScopeError — a programming error, never a silent
 *    pass): a `userId` in create data that is not the acting account; any
 *    `userId` in update data (ownership is immutable); any nested relation write
 *    (it would bypass per-operation stamping); any traversal from Exercise into
 *    an owned relation (the only way to reach another account's rows by
 *    relation, since every owned parent's children share its owner); any model
 *    or operation this module does not classify.
 *
 * Model shapes come from Prisma's runtime DMMF, so a new owned model is scoped
 * automatically and a new Exercise back-relation is refused automatically.
 */

export class AccountScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountScopeError";
  }
}

/** The one model whose rows are either shared (library) or owned (custom). */
export const SHARED_OR_OWNED_MODEL = "Exercise";
const OWNER_FIELD = "userId";

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];

const MODELS = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, m]),
);

const RELATIONS = new Map<string, Map<string, string>>(
  [...MODELS.values()].map((m) => [
    m.name,
    new Map(
      m.fields
        .filter((f) => f.kind === "object")
        .map((f) => [f.name, f.type as string]),
    ),
  ]),
);

function hasOwnerField(model: string): boolean {
  return (
    MODELS.get(model)?.fields.some(
      (f) => f.name === OWNER_FIELD && f.kind === "scalar",
    ) ?? false
  );
}

/** Every model scoped strictly to its owner (all but the shared-or-owned one). */
export function ownedModels(): string[] {
  return [...MODELS.keys()]
    .filter((m) => m !== SHARED_OR_OWNED_MODEL && hasOwnerField(m))
    .sort();
}

/** Models with no owner column at all: none may exist (the app would leak them). */
export function unclassifiedModels(): string[] {
  return [...MODELS.keys()].filter((m) => !hasOwnerField(m)).sort();
}

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const TARGETED_WRITE_OPS = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
const UPDATE_DATA_OPS = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
]);

type Args = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** where ∧ filter, preserving every condition the caller wrote. */
function intersect(where: unknown, filter: Args): Args {
  const base = isPlainObject(where) ? where : {};
  return { ...base, AND: [...asArray(base.AND), filter] };
}

function isOwnedTarget(model: string): boolean {
  return model !== SHARED_OR_OWNED_MODEL && hasOwnerField(model);
}

/* ------------------------------------------------------------------------ */
/* Traversal guard: never walk from the shared Exercise into owned rows.     */
/* ------------------------------------------------------------------------ */

function checkTraversal(from: string, field: string): string {
  const target = RELATIONS.get(from)?.get(field);
  if (!target) {
    throw new AccountScopeError(`Unknown relation ${from}.${field}.`);
  }
  if (from === SHARED_OR_OWNED_MODEL && isOwnedTarget(target)) {
    throw new AccountScopeError(
      `Relation ${from}.${field} reaches every account's ${target} rows; ` +
        `query ${target} directly through the account-scoped client instead.`,
    );
  }
  return target;
}

function walkCount(model: string, value: unknown): void {
  if (!isPlainObject(value) || !isPlainObject(value.select)) return;
  for (const [field, spec] of Object.entries(value.select)) {
    const target = checkTraversal(model, field);
    if (isPlainObject(spec) && spec.where !== undefined)
      walkWhere(target, spec.where);
  }
}

function walkSelection(model: string, selection: unknown): void {
  if (!isPlainObject(selection)) return;
  for (const [key, value] of Object.entries(selection)) {
    if (key === "_count") {
      walkCount(model, value);
      continue;
    }
    if (!RELATIONS.get(model)?.has(key)) continue; // scalar
    if (value === false || value === undefined) continue;
    const target = checkTraversal(model, key);
    if (isPlainObject(value)) walkRelationArgs(target, value);
  }
}

function walkRelationArgs(model: string, args: Args): void {
  walkSelection(model, args.select);
  walkSelection(model, args.include);
  if (args.where !== undefined) walkWhere(model, args.where);
  if (args.orderBy !== undefined) walkOrderBy(model, args.orderBy);
}

const RELATION_FILTER_KEYS = new Set(["some", "every", "none", "is", "isNot"]);

function walkWhere(model: string, where: unknown): void {
  for (const clause of asArray(where)) {
    if (!isPlainObject(clause)) continue;
    for (const [key, value] of Object.entries(clause)) {
      if (key === "AND" || key === "OR" || key === "NOT") {
        walkWhere(model, value);
        continue;
      }
      if (!RELATIONS.get(model)?.has(key)) continue; // scalar filter
      const target = checkTraversal(model, key);
      if (!isPlainObject(value)) continue; // e.g. `gym: null`
      const keys = Object.keys(value);
      if (keys.length > 0 && keys.every((k) => RELATION_FILTER_KEYS.has(k))) {
        for (const k of keys) walkWhere(target, value[k]);
      } else {
        walkWhere(target, value); // direct to-one filter
      }
    }
  }
}

function walkOrderBy(model: string, orderBy: unknown): void {
  for (const clause of asArray(orderBy)) {
    if (!isPlainObject(clause)) continue;
    for (const [key, value] of Object.entries(clause)) {
      if (!RELATIONS.get(model)?.has(key)) continue;
      const target = checkTraversal(model, key);
      if (isPlainObject(value) && !("_count" in value))
        walkOrderBy(target, value);
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Write-data guards.                                                        */
/* ------------------------------------------------------------------------ */

function assertNoNestedWrites(model: string, data: unknown): void {
  for (const row of asArray(data)) {
    if (!isPlainObject(row)) continue;
    for (const key of Object.keys(row)) {
      if (RELATIONS.get(model)?.has(key)) {
        throw new AccountScopeError(
          `Nested write through ${model}.${key} is not allowed; write each ` +
            `owned model directly so it is stamped with its owner.`,
        );
      }
    }
  }
}

function stampCreate(
  model: string,
  data: unknown,
  userId: string,
): Record<string, unknown> {
  if (!isPlainObject(data)) {
    throw new AccountScopeError(`Create on ${model} needs a data object.`);
  }
  if (OWNER_FIELD in data && data[OWNER_FIELD] !== userId) {
    throw new AccountScopeError(
      `A ${model} can only be created for the acting account.`,
    );
  }
  if (model === SHARED_OR_OWNED_MODEL && data.isCustom !== true) {
    throw new AccountScopeError(
      "Library exercises are shared reference data; only custom exercises can be created.",
    );
  }
  return { ...data, [OWNER_FIELD]: userId };
}

function assertNoOwnerInUpdate(model: string, data: unknown): void {
  if (isPlainObject(data) && OWNER_FIELD in data) {
    throw new AccountScopeError(`Ownership of a ${model} never changes.`);
  }
}

/* ------------------------------------------------------------------------ */
/* Entry point.                                                              */
/* ------------------------------------------------------------------------ */

export function scopeArgs(
  model: string,
  operation: string,
  args: unknown,
  userId: string,
): Args {
  if (!MODELS.has(model)) {
    throw new AccountScopeError(`Unknown model ${model}.`);
  }
  const shared = model === SHARED_OR_OWNED_MODEL;
  if (!shared && !hasOwnerField(model)) {
    throw new AccountScopeError(
      `Model ${model} has no owner column and cannot be reached through the account-scoped client.`,
    );
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new AccountScopeError("No acting account.");
  }

  const input: Args = isPlainObject(args) ? args : {};
  walkRelationArgs(model, input);

  const readFilter: Args = shared
    ? { OR: [{ [OWNER_FIELD]: null }, { [OWNER_FIELD]: userId }] }
    : { [OWNER_FIELD]: userId };
  const writeFilter: Args = { [OWNER_FIELD]: userId };

  if (READ_OPS.has(operation)) {
    return { ...input, where: intersect(input.where, readFilter) };
  }

  if (CREATE_OPS.has(operation)) {
    assertNoNestedWrites(model, input.data);
    const data = Array.isArray(input.data)
      ? input.data.map((row) => stampCreate(model, row, userId))
      : operation === "create"
        ? stampCreate(model, input.data, userId)
        : asArray(input.data).map((row) => stampCreate(model, row, userId));
    return { ...input, data };
  }

  if (TARGETED_WRITE_OPS.has(operation)) {
    if (UPDATE_DATA_OPS.has(operation)) {
      assertNoNestedWrites(model, input.data);
      assertNoOwnerInUpdate(model, input.data);
    }
    return { ...input, where: intersect(input.where, writeFilter) };
  }

  if (operation === "upsert") {
    assertNoNestedWrites(model, input.create);
    assertNoNestedWrites(model, input.update);
    assertNoOwnerInUpdate(model, input.update);
    return {
      ...input,
      where: intersect(input.where, writeFilter),
      create: stampCreate(model, input.create, userId),
    };
  }

  throw new AccountScopeError(
    `Operation ${operation} on ${model} is not supported by the account-scoped client.`,
  );
}
