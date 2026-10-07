---
version: 1.0.0
status: draft
author: [Your Name]
last_updated: YYYY-MM-DD
pitch_reference: [Link or filename to the expanded pitch, e.g. pitches/04-guided-workout-logging.md]
design_reference: [Link or filename to the design doc, e.g. docs/design/04-guided-workout-logging-design-doc.md]
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: [Issue ID, omit if none yet]
---

# [Feature Name]

## Summary

[Two to three paragraphs: what the feature does in one sentence, the core technical
abstraction, how it fits the training workflow, and what "working" means from an
implementation perspective.]

---

## Problem

[Current pain points, questions the system cannot answer today, why this blocks
downstream work, which PRD journey it supports, which pitch it unlocks or depends on.]

---

## Scope and Non-Scope

### In Scope

- [Behavior this spec covers]

### Out of Scope

- [Deferred or excluded behavior, with whether it is Post-MVP or a permanent non-goal]

---

## Core Concepts

| Concept | Description |
| ------- | ----------- |
| `[concept]` | [description, including cardinality and whether it is stored or derived] |

**Distinctions to preserve:**

- [Concept A vs. Concept B, and why they must not collapse]

---

## States and Lifecycle

### [Enum name]

```text
[value]
[value]
```

### State Transition Rules

| From | To | Allowed? | Side Effects |
| ---- | -- | -------- | ------------ |
| `[state]` | `[state]` | [yes/no/conditional] | [writes that must happen together] |

---

## UI Integration

> Reference the design doc for detailed UI/UX specifications.

### Screens

| Screen | Purpose | Data Needed | Actions |
| ------ | ------- | ----------- | ------- |
| [screen] | [purpose] | [data] | [actions] |

### Components

| Component | Data Contract | Notes |
| --------- | ------------- | ----- |
| `[Component]` | [contract] | [note] |

### Forms and Validation

| Field | Type | Required | Validation | Notes |
| ----- | ---- | -------- | ---------- | ----- |
| `[field]` | [type] | [yes/no] | [rule] | [note] |

---

## Data Model

### Relationship to Existing Schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `[from]` | [relation] | `[to]` | [description] |

### New Models

```prisma
// [Model definition using this project's naming, mapping, and index conventions]
```

### Updated Models

```prisma
// Add to existing [Model]:
// [new or changed fields only]
```

### Enums

```prisma
// [enum definition]
```

### Row-Level Security

```sql
-- [One ALTER TABLE ... ENABLE ROW LEVEL SECURITY statement per new table. No policies.]
```

### Derived Fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| `[field]` | [yes/no] | [inputs] | [note] |

---

## Authorization and Access Control

[How the two layers apply to the resources in this spec: authenticated server code,
and row-level security deny-all in the database.]

```ts
// [server action guard example]
```

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| `[resource]` | [rule] | [rule] | [rule] | [rule] |

---

## Storage Model

**Container:** [bucket name]
**Access:** [public or private, and why]

**Path convention:**

```text
[convention]
```

| Rule | Requirement |
| ---- | ----------- |
| [rule] | [requirement] |

---

## Server Actions and API Surface

### Server Actions

```ts
// [Input and result types]
```

| Action | Input | Output | Side Effects |
| ------ | ----- | ------ | ------------ |
| `[action]` | [input] | [output] | [side effects] |

### Route Handlers

[Only if a server action cannot do the job. Omit this heading otherwise.]

**Authentication:** [requirement]
**Request:** [shape, if applicable]
**Response:** [shape, if applicable]
**Side Effects:** [if applicable]

### Error Response Format

```ts
// [ActionResult and ErrorCode type definitions]
```

| Code | HTTP Status | Description |
| ---- | ----------- | ----------- |
| `[code]` | [status] | [description] |

---

## Validation Rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `[field]` | [rule] | `[error code]` |

---

## UI Data Contracts

```ts
// [DTO definitions]
```

---

## Testing Strategy

> See `references/testing-patterns.md` for category definitions and templates.

### 1. [Feature Area]

```text
TEST: [descriptive_snake_case_name]
GIVEN:
  - [precondition]
WHEN:
  - [action]
THEN:
  - [expected outcome]
  - [side effect]
```

### 2. Invariant Tests

```text
TEST: [invariant_name]
GIVEN: Any system state
THEN: [property that must hold]
QUERY: [verification query]
EXPECT: [expected result]
```

### 3. Integration Scenarios

```text
TEST: [lifecycle_scenario_name]
SCENARIO: [description]

STEP 1: [action]
VERIFY:
  - [expected state]

STEP 2: [action]
VERIFY:
  - [expected state]
```

### Test Data Factories

```ts
// [factory function using this project's real entity and field names]
```

---

## Acceptance Criteria

1. **[Feature Area]**
   - [ ] [Observable, testable criterion]
   - [ ] [Criterion]

2. **[Feature Area]**
   - [ ] [Criterion]

---

## Explicit Non-Goals

- ❌ [Permanent non-goal touched by this feature]
- ❌ [Deferred work this spec must not pull in]

---

## Open Questions

1. **[Topic]** — [unresolved decision; mark blocking or state the default assumption]

---

## Future Considerations

- **[Future feature]** can build on [what this spec establishes].
