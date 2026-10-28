/**
 * THE ADMIN GATE (Admin Center & Feedback, spec section 6.2; R2, R15). A PURE
 * function of (model, operation, args) -> the args Prisma actually runs, or an
 * AdminScopeError. src/lib/data/admin/db.ts applies it to every model
 * operation of the admin client, so admin code can reach ONLY:
 *
 *  - account metadata on Profile (never the appearance preference, never a
 *    relation), with status as the only writable field;
 *  - whether the onboarding tour was finished or skipped;
 *  - feedback messages, with category and handled state the only writable
 *    fields;
 *  - the audit log, create and read only (no update, no delete);
 *  - for Mesocycle and LoggedSet, ONLY "which accounts have at least one row"
 *    (groupBy userId, nothing else): their training content is unreachable,
 *    and no other training model is reachable at all.
 *
 * `include` and relation selects are refused everywhere, every select value
 * must be `true`, and every where/orderBy key must be an allowed scalar field
 * (so no relation filter can smuggle training content into a count).
 */

export class AdminScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminScopeError";
  }
}

type Rule = {
  /** Operations allowed on the model. */
  ops: ReadonlySet<string>;
  /** Fields a select may name and a where/orderBy may use. */
  fields: ReadonlySet<string>;
  /** Fields an update or create may write. */
  writable?: ReadonlySet<string>;
};

const set = (...v: string[]): ReadonlySet<string> => new Set(v);

/** Account metadata the admin area may see (CLAUDE.md admin boundary). */
export const PROFILE_ADMIN_FIELDS = [
  "userId",
  "firstName",
  "lastName",
  "username",
  "timeZone",
  "status",
  "lastActiveOn",
  "createdAt",
] as const;

const RULES: Record<string, Rule> = {
  Profile: {
    ops: set("findMany", "findUnique", "count", "updateMany"),
    fields: set(...PROFILE_ADMIN_FIELDS),
    writable: set("status"),
  },
  TourProgress: {
    ops: set("findMany"),
    fields: set("userId", "outcome"),
  },
  Feedback: {
    ops: set("findMany", "findUnique", "count", "updateMany"),
    fields: set(
      "id",
      "userId",
      "category",
      "message",
      "createdAt",
      "handledAt",
    ),
    writable: set("category", "handledAt"),
  },
  FeedbackAttachment: {
    // Screenshots the lifter chose to send with a message: feedback content,
    // not training content. Read-only, scalar metadata only (no image bytes
    // live here); the bytes are reached only through a signed Storage URL.
    ops: set("findMany"),
    fields: set(
      "id",
      "feedbackId",
      "objectPath",
      "contentType",
      "sizeBytes",
      "position",
      "createdAt",
    ),
  },
  AdminAuditEntry: {
    ops: set("create", "findMany", "count"),
    fields: set(
      "id",
      "actorUserId",
      "kind",
      "targetUserId",
      "feedbackId",
      "detail",
      "createdAt",
    ),
    writable: set(
      "actorUserId",
      "kind",
      "targetUserId",
      "feedbackId",
      "detail",
    ),
  },
};

/** Training models whose only admin-visible fact is "this account has a row". */
export const PRESENCE_ONLY_MODELS: readonly string[] = [
  "Mesocycle",
  "LoggedSet",
];

/** Every model the admin client can reach in any way (for tests). */
export const ADMIN_REACHABLE_MODELS: readonly string[] = [
  ...Object.keys(RULES),
  ...PRESENCE_ONLY_MODELS,
].sort();

type Args = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function refuse(message: string): never {
  throw new AdminScopeError(message);
}

const READ_KEYS = set("where", "select", "orderBy", "skip", "take");
const LOGICAL = set("AND", "OR", "NOT");

function checkKeys(model: string, args: Args, allowed: ReadonlySet<string>) {
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) refuse(`Admin ${model}: "${key}" is not allowed.`);
  }
}

function checkSelect(model: string, rule: Rule, select: unknown) {
  if (!isPlainObject(select)) refuse(`Admin ${model}: a select is required.`);
  if (Object.keys(select).length === 0)
    refuse(`Admin ${model}: an empty select.`);
  for (const [key, value] of Object.entries(select)) {
    if (!rule.fields.has(key))
      refuse(`Admin ${model}: field "${key}" is outside the admin boundary.`);
    if (value !== true)
      refuse(`Admin ${model}: select "${key}" must be true (no relations).`);
  }
}

function checkWhere(model: string, rule: Rule, where: unknown): void {
  if (where === undefined) return;
  const clauses = Array.isArray(where) ? where : [where];
  for (const clause of clauses) {
    if (!isPlainObject(clause)) refuse(`Admin ${model}: malformed where.`);
    for (const [key, value] of Object.entries(clause)) {
      if (LOGICAL.has(key)) {
        checkWhere(model, rule, value);
        continue;
      }
      if (!rule.fields.has(key))
        refuse(`Admin ${model}: cannot filter on "${key}".`);
    }
  }
}

function checkOrderBy(model: string, rule: Rule, orderBy: unknown): void {
  if (orderBy === undefined) return;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  for (const clause of clauses) {
    if (!isPlainObject(clause)) refuse(`Admin ${model}: malformed orderBy.`);
    for (const [key, value] of Object.entries(clause)) {
      if (!rule.fields.has(key))
        refuse(`Admin ${model}: cannot order by "${key}".`);
      if (value !== "asc" && value !== "desc")
        refuse(`Admin ${model}: orderBy "${key}" must be "asc" or "desc".`);
    }
  }
}

function checkData(model: string, rule: Rule, data: unknown) {
  if (!isPlainObject(data)) refuse(`Admin ${model}: data must be an object.`);
  for (const key of Object.keys(data)) {
    if (!rule.writable?.has(key))
      refuse(`Admin ${model}: "${key}" is not writable by admin code.`);
  }
}

export function adminArgs(
  model: string,
  operation: string,
  args: unknown,
): Args {
  const input: Args = isPlainObject(args) ? args : {};

  if (PRESENCE_ONLY_MODELS.includes(model)) {
    if (operation !== "groupBy")
      refuse(`Admin ${model}: only "which accounts have a row" is allowed.`);
    const keys = Object.keys(input);
    const by = input.by;
    if (
      keys.length !== 1 ||
      keys[0] !== "by" ||
      !Array.isArray(by) ||
      by.length !== 1 ||
      by[0] !== "userId"
    )
      refuse(`Admin ${model}: groupBy must be exactly { by: ["userId"] }.`);
    return { by: ["userId"] };
  }

  const rule = RULES[model];
  if (!rule) refuse(`Admin code cannot reach ${model}.`);
  if (!rule.ops.has(operation))
    refuse(`Admin ${model}: "${operation}" is not allowed.`);

  switch (operation) {
    case "findMany":
    case "findUnique":
      checkKeys(model, input, READ_KEYS);
      checkSelect(model, rule, input.select);
      checkWhere(model, rule, input.where);
      checkOrderBy(model, rule, input.orderBy);
      return input;
    case "count":
      checkKeys(model, input, set("where"));
      checkWhere(model, rule, input.where);
      return input;
    case "updateMany":
      checkKeys(model, input, set("where", "data"));
      if (input.where === undefined)
        refuse(`Admin ${model}: an update needs a where.`);
      checkWhere(model, rule, input.where);
      checkData(model, rule, input.data);
      return input;
    case "create":
      checkKeys(model, input, set("data", "select"));
      checkData(model, rule, input.data);
      if (input.select !== undefined) checkSelect(model, rule, input.select);
      return input;
    default:
      return refuse(`Admin ${model}: "${operation}" is not allowed.`);
  }
}
