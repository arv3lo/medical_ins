# Code review: PR #12 (P3.1, coverage request model and state machine)

- Target: PR #12 "P3.1 : modèle de demande de prise en charge et machine à états",
  `feat/p3-1-coverage-model` (a5f105a) against `main`.
- Date: 2026-10-24
- Checked: the whole diff, read against the code around it (shared transition table and schemas,
  `coverage-requests` service and transitions, db schema). The findings below were re-checked by
  hand on the branch head. The tests were not run as part of this review.
- Line numbers refer to the files at a5f105a.

## Findings, most severe first

### 1. A request cancelled as a draft becomes visible to the insurer (medical data leak)

- `apps/api/src/modules/coverage-requests/service.ts:177` (`reachableBy`) and
  `apps/api/src/modules/coverage-requests/transitions.ts:28` (`requireReachable`)
- The insurer filter is "status is not `draft`". The table allows `draft → cancelled`
  (`packages/shared/src/schemas/coverage-requests.ts:58`), so a draft the center cancels without
  ever submitting becomes `cancelled` and appears in the insurer's `GET /coverage-requests` and
  `GET /coverage-requests/:id`, with diagnosis, acts and patient identity.
- Why it matters: medical content reaches an insurer it was never sent to (constitution: medical
  content for care roles only; insurers see only what a decision needs). On transitions, the insurer
  also gets 409 instead of 404, which confirms the request exists (FR-014).
- Fix: the insurer sees a request once it has been submitted: "an event with
  `to_status = 'submitted'` exists" (or a `submitted_at` column). Test first: draft → cancelled,
  then the insurer's list, detail and transition all answer as if the request did not exist.

### 2. Unbounded quantity and unit price overflow `integer` columns (500)

- `packages/shared/src/schemas/coverage-requests.ts:141` (`quantity`) and `:91` (`amountSchema`)
- `line_amount`, `estimated_amount` and `quantity` are `int4` (`apps/api/src/db/schema.ts:315,358,360`).
  `{ actCode: 'ACC-CESAR', quantity: 5000 }` gives 6e9 > 2^31−1: Postgres raises
  "integer out of range" and the API answers 500 instead of a French 400.
- Fix: `.max()` on `quantity` and `unitPrice`, and a total check in `itemsSchema` so the sum of up
  to 30 lines stays below 2^31−1 (or switch to `bigint`).

### 3. One access rule, two homes

- `service.ts:177` (SQL `reachableBy`) and `transitions.ts:28` (JS `requireReachable`)
- This duplication is why finding 1 has to be fixed twice; a fix in one place only leaves reads
  and moves disagreeing. CLAUDE.md DRY.
- Fix: lock the row with `SELECT … WHERE id = $1 AND reachableBy(side) FOR UPDATE`, 404 when
  nothing comes back, and drop `requireReachable`.

### 4. Submission bypasses `transitionProblem`

- `transitions.ts:36`
- For `to === 'submitted'`, `problem()` only runs `submissionProblem`. Any condition later added
  to `transitionProblem` for submitted moves would be enforced by the web (which calls it) but not
  by the API.
- Fix: always run `transitionProblem`, then `submissionProblem` when the target is `submitted`.

### 5. `countItems` loads every row to count them

- `service.ts:163`
- Fix: `select({ n: count() })`, or an `EXISTS` / `limit(1)` check, since only "zero items" matters.

### 6. `iso` copied from the consultations service

- `service.ts:182`, duplicate of `apps/api/src/modules/consultations/service.ts:48` (the latter
  also handles `null`).
- Fix: one helper in `apps/api/src/lib`, imported by both modules.

### 7. List and detail serialize timestamps differently

- `service.ts:290` (`updatedAt` in `listCoverageRequests`)
- The list returns a raw `Date`, the detail converts with `iso()`. Types inferred from the service
  differ between the two endpoints.
- Fix: map `updatedAt` through `iso()` like the detail does.

## Outcomes

All seven findings were fixed on `feat/p3-1-coverage-model`, one commit each, findings 1 and 3
together because they are the same rule. The bugs (1, 2) were each reproduced by a test seen
failing first; the refactors (3–7) are covered by the existing tests. Final run on an emptied
database: lint, typecheck, Prettier, build, and 55 shared + 54 web + 137 API tests.

| #   | Outcome                                                                                                                                                                                        | Commit    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Fixed: the insurer reaches a request only once its history shows it was submitted; a draft cancelled before being sent answers 404 to it (list, detail, moves). Test first: 200 before the fix | `00c2fda` |
| 2   | Fixed: quantity ≤ 100 and unit price ≤ 20 000 000 Ar in the shared schema; the server refuses an estimate above 2 000 000 000 Ar with a French 400. Test first: 500 before the fix             | `7741017` |
| 3   | Fixed with 1: the rule has one home (`reachableBy`), applied by the reads and by the locked read every write starts with; `requireReachable` is gone                                           | `00c2fda` |
| 4   | Fixed: `transitionProblem` always runs, then `submissionProblem` for a submission                                                                                                              | `b72427d` |
| 5   | Fixed: lines counted with `count()`                                                                                                                                                            | `9ec6ba1` |
| 6   | Fixed: one `iso()` in `apps/api/src/lib/iso.ts`, used by consultations and coverage requests                                                                                                   | `a4cf80a` |
| 7   | Fixed: the list maps `updatedAt` through `iso()` like the detail                                                                                                                               | `edd8c46` |

The spec's research and contract were updated to match 1 and 2 (`b00eae4`).

### Follow-up, after checking the fixes

| #   | Finding                                                                                                                                                                                                                         | Outcome                                                                                                                             | Commit    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8   | `updateCoverageRequest` wrote the lines before `total()` ran, and reference prices are unbounded: 100 × an act above ~21.4 M Ar overflowed `line_amount` on the insert (500). The bounds comment claimed every line was covered | Fixed: the total (which covers every line) is checked before any line is written; comment corrected. Test first: 500 before the fix | `0557313` |
| 9   | `MAX_ITEM_QUANTITY` and `MAX_UNIT_PRICE` were exported with no importer (YAGNI)                                                                                                                                                 | Fixed: private to the schema; `MAX_REQUEST_AMOUNT` stays exported for the API                                                       | `8b6256f` |

Final run on the emptied test database: lint, typecheck, Prettier, build, and 55 shared + 54 web +
138 API tests.
