# Code review: PRs #4 to #9 (patients, affiliations, appointments, consultations, super admin, animations)

- Targets, in stack order (each against its base, merge commits from the base excluded):
  - PR #4 "P2.1 : patients", `feat/p2-1-patients` (17f6547) against `feat/p1-0-shadcn`
  - PR #5 "P2.2 : affiliations", `feat/p2-2-affiliations` (c61943f) against `feat/p2-1-patients`
  - PR #6 "P2.3 : rendez-vous", `feat/p2-3-appointments` (1b3cbf3) against `feat/p2-2-affiliations`
  - PR #7 "P2.4 : consultations", `feat/p2-4-consultations` (707698e) against `feat/p2-3-appointments`
  - PR #8 "Retirer au super admin l'accès au contenu médical", `feat/super-admin-no-medical`
    (122cd7c) against `feat/p2-4-consultations`
  - PR #9 "Animations : Animate.css", `feat/animate-css` (6743d2a) against `feat/p1-0-shadcn`
- Date: 2026-10-24
- Checked: every diff except `pnpm-lock.yaml`, `apps/api/drizzle/meta` and the vendored
  `components/ui/*` (aligned with the shadcn registry earlier today). PRs #4 to #7 were read by one
  reviewer each, and the main findings were re-checked against the code: the decide, reschedule and
  status races, the affiliation index, the audit payloads, the date checks (`Date.parse('2023-02-30')`
  is accepted) and the line numbers. #8 and #9 were reviewed by hand. Acceptance criteria come from
  `docs/ROADMAP.md` (PR #2). CI is green on every PR. The API tests were not run as part of this
  review.
- Line numbers refer to the file at the head of the PR being reviewed.

## Fix status

Fixes are on each PR's branch, one commit per finding, each behavior change reproduced by a test
seen failing first (coverage-only tests noted). They were merged down the stack in order
(#4 → #5 → #6 → #7 → #8). Final run on #8 (the top): lint, typecheck, Prettier, build,
40 shared + 53 web + 99 API tests against a fresh Postgres 16.

**Migrations renumbered.** #5's fixes added 0005–0007, so #6's migrations were regenerated on top
as 0008–0009 and #7's as 0010–0012 (generated SQL identical to before; custom SQL copied as is).
Any local database that ran the old 0005–0009 must be recreated.

| #   | Outcome                                                                                                                                                                       | Commit                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| A   | Fixed: `today()` in `Indian/Antananarivo` (shared `dates.ts`), used by the schemas and the web forms                                                                          | `ec9f21a`, `067eeb7`            |
| B   | Fixed where found: row locks or conditional updates in affiliations (#10), appointments (#17, #18), consultations (#27)                                                       | see those rows                  |
| C   | Fixed: `isoDateSchema` checks a real calendar day from 1900 on                                                                                                                | `802580a`, `11275ab`            |
| 1   | Fixed: 409 « Un patient existe déjà avec ce CIN » on update                                                                                                                   | `463d433`                       |
| 2   | Fixed: optional fields accept `null`; the form sends `null` for an emptied field                                                                                              | `542e4ee`                       |
| 3   | No change (owner decision: any center may link a patient; recorded in the decision log); `/link` tests added with #7                                                          | `8c0bc21` (roadmap)             |
| 4   | Fixed with C                                                                                                                                                                  | `11275ab`                       |
| 5   | Fixed with A                                                                                                                                                                  | `067eeb7`                       |
| 6   | Fixed: duplicate check inside the transaction under an advisory lock, and on PATCH when name or birth date change                                                             | `e0555c5`                       |
| 7   | Tests added (coverage of existing behavior; regression-checked by breaking the route)                                                                                         | `4238aa1`                       |
| 8   | Fixed: the warning shows the API's message                                                                                                                                    | `b545afe`                       |
| 9   | Fixed: exclusion constraint (one number, one patient; rejected and withdrawn rows don't count), plus « Retirer » for a pending declaration (`withdrawn` status, audited)      | `e10f208`, `9b42b1e`, `9a5f806` |
| 10  | Fixed: decide only applies while pending, 409 otherwise (race test)                                                                                                           | `a4f4606`                       |
| 11  | Fixed with A                                                                                                                                                                  | `ec9f21a`                       |
| 12  | Fixed: explicit insurer projection, exact keys tested                                                                                                                         | `b152469`                       |
| 13  | Fixed: pages of 50 with « Charger plus », member-number filter                                                                                                                | `9f832bc`, `748ee6c`, `3a09659` |
| 14  | Fixed: permission checked before the body                                                                                                                                     | `05b740a`                       |
| 15  | Fixed: the form remounts on each opening (no DOM test environment, so untested)                                                                                               | `523d31f`                       |
| 16  | Tests added; declaring the same dependent twice is tested as allowed (several periods)                                                                                        | `f39e5df`                       |
| 17  | Fixed: reschedule reads and checks the row under `FOR UPDATE` (race test)                                                                                                     | `3042856`                       |
| 18  | Fixed: status change locks the row (race test)                                                                                                                                | `26ee0e1`                       |
| 19  | Fixed: Jour / Semaine toggle, « Mes rendez-vous » (next 30 days), « Déplacer » dialog                                                                                         | `d2027f0`, `de8d274`, `907def4` |
| 20  | Fixed: « Arrivé » from 60 min before the start, « Absent » / « Terminé » once started, « Annuler » anytime (shared `isStatusChangeDue`)                                       | `37770b6`                       |
| 21  | Fixed: one query of the center's active doctors for listing and booking                                                                                                       | `ad9dd6f`                       |
| 22  | Tests added (past move, other center's doctor, nurse as doctor, cross-center 404, audits)                                                                                     | `0404d12`                       |
| 23  | Fixed: agenda keyed on the center, dialog date reset on open (untested, no DOM environment)                                                                                   | `decd75c`                       |
| 24  | Fixed: `GET /appointments` requires a range of at most 92 days; the patient card shows −30 / +62 days                                                                         | `30bc72d`                       |
| 25  | `SLOT_HOLDING_STATUSES` removed (`53178fa`); keeping query params on center change is intended and tested (`e73af39`); reception seeing the reason is an owner decision (log) | `53178fa`, `e73af39`            |
| —   | Also fixed (found while fixing #26): appointment audit entries no longer store the free-text reason                                                                           | `47bc8ec`                       |
| 26  | Fixed: consultation audits hold ids and metadata only (`fields` names, `signedAt`, `addendumId`, `patientId`/`appointmentId`); marker-string test over every audit row        | `47f2124`                       |
| 27  | Fixed: the draft row is locked for PATCH and sign; races answer 409. The trigger exception isn't mapped (no API path reaches it any more)                                     | `991c7cc`                       |
| 28  | Fixed: the list is audited as `medical_record.read` with the returned ids                                                                                                     | `1cba97f`                       |
| 29  | Fixed: every write returns ids only (the addendum returns itself); the client refetches through the audited GET                                                               | `19aa118`                       |
| 30  | Fixed: the editor only where the draft can be saved                                                                                                                           | `c26bf11`                       |
| 31  | Tests added for every read-only trigger                                                                                                                                       | `d44c4a9`                       |
| 32  | Fixed: the comment states the French ICD-10 wording and that source and license must be confirmed (open question added to the roadmap); drizzle doesn't re-check file hashes  | `c8e0dd2`                       |
| 33  | Fixed: `Record<Permission, boolean>` allow-list; coverage requests are no longer open to the super admin                                                                      | `33c062f`                       |
| 34  | No change (owner decision: Animate.css is deliberate; recorded in the decision log)                                                                                           | `8c0bc21` (roadmap)             |

Merge fix-ups: the agenda passes `consultAs` through the new day, week and « Mes rendez-vous »
lists, and the consultation test books its appointment 30 minutes ahead because of #20
(`437b6e7`).

## Across the stack

Three problems show up in several PRs. Fixing each in one place covers every PR that has it.

- **A. "Today" is the UTC date** (#4 finding 5, #5 finding 11). `new Date().toISOString().slice(0, 10)`
  gives the wrong day between 00:00 and 03:00 in Madagascar (UTC+3). It belongs in one shared helper
  in `packages/shared/src/schemas/dates.ts`, computed in `Indian/Antananarivo`, with a unit test at
  22:30 UTC.
- **B. Check, then update without a lock** (findings 10, 17, 18, 27). The state is read, checked in JS,
  and then updated with `WHERE id = …` only. Two concurrent requests both pass the check. The fix is
  the same everywhere: `SELECT … FOR UPDATE` inside the transaction, or a conditional
  `UPDATE … WHERE status = <expected>` that answers 409 when no row is updated.
- **C. Calendar dates are validated with `Date.parse`** (finding 4; #5 moves it into the shared
  `isoDateSchema`). V8 accepts `2023-02-30` and rolls it to March 2, and Postgres then rejects the value
  with a 500. The fix is a round-trip check (`Date.UTC(y, m - 1, d)` must give back the same string)
  and a minimum year.

## PR #4: patients

### 1. Changing the CIN to one another patient has returns a 500 (medium)

- Where: `apps/api/src/modules/patients/service.ts:115-122` (`updatePatient`), called from
  `routes.ts:96`.
- Why: the unique index `patients_national_id_unique` throws, and the generic handler answers
  `500 "Erreur interne"`. Creation handles the same conflict properly with a 409. On update, the user
  is never told that the CIN is already taken.
- Fix: check for another patient with that CIN first (or catch 23505 on that index) and answer 409
  "Un patient existe déjà avec ce CIN". Add an integration test.

### 2. Optional fields can never be cleared (medium)

- Where: `apps/web/src/components/patients/patient-form.tsx:29` (`empty` → `undefined`) and
  `packages/shared/src/schemas/patients.ts:13, 41-44`.
- Why: an emptied field is dropped from the PATCH, and the schema doesn't accept `null`. A wrong phone
  number or CIN can't be removed: the API answers 200 and the old value stays.
- Fix: make the optional fields `.nullable()` in the update schema, and have the form send `null` for
  an emptied field in edit mode. Add a test (`{ phone: null }` gives `phone: null`, with the change in
  the audit).

### 3. `POST /:patientId/link` lets any center attach any patient (medium, owner decision)

- Where: `apps/api/src/modules/patients/routes.ts:69-88`; the ids come from the duplicate 409 in
  `service.ts` (`findDuplicates`).
- Why: the roadmap gives a center access through creation, an appointment or a consultation. This is
  a fourth path with no precondition. A receptionist who enters a CIN out of curiosity gets the holder's
  name, birth date and id from the 409, and then their phone and address through `/link`. The link is
  audited, but nothing prevents it.
- Fix: either record it in the decision log as the intended flow, or narrow it. For example, re-run
  the duplicate match on the server in `/link` (require the creation payload), and answer a CIN-only
  probe without a summary unless the name also matches.

### 4. A date that doesn't exist (`2023-02-30`) returns a 500 (low)

- Where: `packages/shared/src/schemas/patients.ts:11`. See C above.

### 5. "Future birth date" is checked against UTC (low)

- Where: `packages/shared/src/schemas/patients.ts:19`, `patient-form.tsx:80`. Between 00:00 and 03:00
  local time, a baby born today is refused. See A above.

### 6. The duplicate check can be raced, and is skipped on update (low)

- Where: `routes.ts:38-64` (the check runs before and outside the transaction) and `routes.ts:96`.
- Why: two receptions registering the same person without a CIN at the same moment both create a
  record. A PATCH that changes the name or birth date into an existing person's values is not checked.
  (The CIN race is handled correctly by `onConflictDoNothing`.)
- Fix: accept it as a soft check and say so, or take
  `pg_advisory_xact_lock(hashtext(lower(last_name) || birth_date))` inside the transaction and re-run
  the check there.

### 7. Tests missing (low)

- `patient.link` audit (written once, not again on a second link).
- PATCH from an unlinked center (404): the IDOR guard for writes has no test.
- `/link` for an unknown patient (404) and by a role without `patient.create` (403).
- An insurer member calling a center's patient route.
- PATCH with a CIN that's already taken (finding 1).

### 8. The duplicate warning title is wrong for a CIN conflict (nit)

- Where: `apps/web/src/components/patients/duplicate-warning.tsx:18`. The title always says « Ce patient
  semble déjà enregistré », even when the CIN is a certain match. Show the API message instead.

## PR #5: affiliations

### 9. The holder number index counts rejected and expired rows (high)

- Where: `apps/api/drizzle/0004_affiliations.sql:24`, `apps/api/src/db/schema.ts:156`,
  `service.ts:54-66` (`insertAffiliation`).
- Why: `UNIQUE (insurer_id, member_number) WHERE holder_status = 'holder'` ignores the status and the
  dates, and there is no way to cancel a declaration.
  - A wrong declaration that the insurer rejects blocks the number forever: the real holder gets 409 at
    every center.
  - A corrected re-declaration after a rejection gets 409.
  - Renewing a validated affiliation that has ended gets 409.
  - The 409 also confirms to any receptionist that someone holds that number.
- Fix: one number belongs to one person, not to one row. Use
  `EXCLUDE USING gist (insurer_id WITH =, member_number WITH =, patient_id WITH <>) WHERE (holder_status = 'holder' AND status <> 'rejected')`
  (`btree_gist`, already created by #6), plus a way to withdraw a pending declaration. Add tests for
  re-declaration after a rejection and for a second period for the same holder.

### 10. Two concurrent decisions: the second one overwrites the first (medium)

- Where: `apps/api/src/modules/affiliations/service.ts:70-86` (`decideAffiliation`). See B above.
- Why: two managers click Valider and Refuser at the same moment. Both get 200, two audit entries are
  written, and the final state contradicts the first confirmed decision. This breaks "decisions are
  final".

### 11. « Couvert aujourd'hui » uses the UTC date (medium)

- Where: `packages/shared/src/schemas/dates.ts:10` (`today`), used in `PatientPage.tsx`. See A above.
  It's the shared active-coverage rule, so coverage requests (P3) would inherit the wrong day.

### 12. The insurer list sends more than a decision needs (low)

- Where: `service.ts:14` (`withInsurerName` spreads every column) and its use in the insurer list.
- Why: the insurer receives `declaredByOrganizationId` (which center the patient visits, which can hint
  at a specialty), `patientId` and timestamps. Medical-content-adjacent data should be opt-in.
- Fix: select an explicit projection for the insurer view, and assert the top-level keys in the test.

### 13. The insurer list has no limit (low)

- Where: the insurer list in `service.ts` (no `limit`). The "Validée" tab of a large insurer such as
  OSTIE returns everything in one response. Add a limit plus pagination, and a member-number filter.

### 14. The reject body is validated before the access check (low)

- Where: `apps/api/src/modules/affiliations/routes.ts:101`. An anonymous caller sending `{}` gets 400
  instead of 401/403. Check the permission first.

### 15. The declaration dialog reopens with the previous values (low)

- Where: `apps/web/src/components/affiliations/declare-affiliation-dialog.tsx` (`onSuccess` only closes
  it). Declaring a second insurer starts from the first one's insurer, number and dates, which invites
  a duplicate. Reset the form on success, or key it.

### 16. Tests missing (low)

- Re-declaration after a rejection, and the decide race (findings 9 and 10).
- `GET …/patients/:id/affiliations` from an unlinked center.
- Member-number search not returning another center's patient (only the positive case is tested).
- Dependents declared twice are not deduplicated: either test that this is intended, or reject it.

## PR #6: appointments

### 17. Reschedule checks the state outside the transaction (medium)

- Where: `apps/api/src/modules/appointments/routes.ts:82-114`. `before` is read with `db` before the
  transaction, and the UPDATE filters on `id` only. See B above.
- Why: a reschedule running at the same moment as a cancellation gives the cancelled appointment a new
  time, and the audit's `before` says `scheduled`. An appointment whose start passes between the check
  and the write can also be moved.

### 18. Concurrent status changes: the last one wins (medium)

- Where: `routes.ts:116-140`. `findAppointment(tx, …)` takes no lock. See B above.
- Why: « Arrivé » and « Annuler » clicked at the same moment both commit. The row ends up `cancelled`,
  freeing the slot under a patient who is in the building.

### 19. Acceptance criteria only partly met (medium)

- No week view: `AgendaPage.tsx` shows one day only, and P2.3 requires day and week per doctor.
- No « mes rendez-vous » list for the doctor: the agenda only pre-filters one day on the doctor's own
  id.
- Rescheduling exists in the API but has no screen.
- Fix: add them, or record in the roadmap what is deferred.

### 20. Status changes ignore the time (low)

- Where: `routes.ts:116-140`, `packages/shared/src/schemas/appointments.ts` (status rules).
- Why: `no_show` and `completed` are accepted on an appointment weeks away (the test does exactly that,
  with an appointment in 2099). A mis-click on « Absent » frees the doctor's slot for good.
- Fix: allow `arrived`, `no_show` and `completed` only once `starts_at` has passed (or is close),
  checked with server time.

### 21. An inactive doctor can still be booked (low)

- Where: `apps/api/src/modules/appointments/service.ts:62` (`requireDoctorOf`). `listDoctors` filters
  on `users.isActive` (line 56), but `requireDoctorOf` doesn't, so the API accepts a deactivated doctor.
  Share one query between the two functions.

### 22. Tests missing (low)

- Rescheduling a past appointment (the core "can't move a past appointment" criterion).
- Rescheduling to a doctor of another center.
- Center B reading or changing center A's appointment id (404).
- A non-`doctor` member refused as the doctor.
- Audit entries for reschedules and status changes (only `appointment.create` is checked).

### 23. The agenda keeps stale state (low)

- `AgendaPage.tsx`: the doctor filter is set once. Switching center keeps `doctorId = me` where I'm not
  a doctor, which gives an empty agenda.
- `book-appointment-dialog.tsx`: the date is set once. After moving the agenda to another day,
  « Nouveau rendez-vous » still opens on the first day shown.
- Fix: key the filter on `centerId`, and reset the date when the dialog opens.

### 24. Unbounded lists (low)

- `GET /appointments` without `from`/`to` returns every appointment the center has ever had, and the
  patient card asks for all of them. Require a range, or add a limit.

### 25. Smaller points (nit)

- `SLOT_HOLDING_STATUSES` (`packages/shared/src/schemas/appointments.ts`) is exported but unused, and
  its content is repeated by hand in `0006_appointments_no_overlap.sql`. Delete it, or point to it as
  the source of the SQL list.
- `use-center-param.ts`: `setCenterId` now keeps the other query params. That's a behavior change
  inside a `refactor:` commit.
- Owner decision: `appointment.read` lets reception see the reason (« Fièvre » is medical). It is
  coherent, since reception types the reason, but it should be recorded in the decision log as an
  exception to "care roles only".

## PR #7: consultations

### 26. Full medical content is copied into the append-only audit log (high)

- Where: `apps/api/src/modules/consultations/routes.ts:129-149` (`consultation.update` stores `before`
  and `after`, full consultations), `:196-212` (`consultation.addendum` stores the addendum text),
  `:113` (`consultation.create`).
- Why: `audit_logs` can never be corrected or purged. Every draft save adds another complete copy of
  the examination, notes, vitals and diagnoses. Roadmap P1.8 gives center admins their organization's
  audit entries, and `center_admin` has no `medical_record.read`. Once P1.8 ships, the audit screen
  becomes a way to read every patient's notes. That breaks "medical content is for care roles only".
  The leak is latent until P1.8.
- Fix: audit ids and metadata only, as the appointment routes do: changed field names, diagnosis codes
  at most, the addendum id. Add a test that no audit payload contains `examination`, `notes`, `vitals`
  or `content`.

### 27. Sign and edit race: a signed record can end up with different diagnoses (medium, plausible)

- Where: `apps/api/src/modules/consultations/service.ts:144` (`requireOwnDraft`, a plain SELECT).
  See B above.
- Why: a PATCH that only changes diagnoses doesn't lock the consultation row. A concurrent `/sign`
  checks the old diagnoses and commits. The diagnoses trigger already ran while `signed_at` was still
  NULL. The result is a signed record whose diagnoses changed after signing, possibly with no primary
  diagnosis. Two concurrent signs give a 500 instead of a 409. This follows from Postgres locking rules
  but hasn't been reproduced.
- Fix: `SELECT … FOR UPDATE` in `requireOwnDraft` (PATCH, sign and addenda), and map the trigger's
  exception to a 409.

### 28. The list read isn't audited as `medical_record.read` (low)

- Where: `routes.ts:45-60` (action `medical_record.list`, with only the patient id). P2.4 says every read
  is audited as `medical_record.read`. The list shows the reason and the primary diagnosis across every
  linked center, and the audit trail can't say which consultations were shown.
- Fix: use `medical_record.read` with the returned ids, or record the separate action in the decision
  log.

### 29. Mutation responses return the full record without a read audit (low)

- Where: `routes.ts:196-212`. `POST …/addenda` returns the whole signed consultation (another doctor's
  examination and notes included) and only audits `consultation.addendum`. It isn't a privilege
  escalation, since writers also read, but it bypasses "every read audited". Return only the addendum
  and let the client refetch through the audited GET.

### 30. The editor appears for a draft that can't be edited from this center (low)

- Where: `apps/web/src/pages/ConsultationPage.tsx:46` (editor whenever `!c.signedAt`). A doctor in
  centers A and B who opens their A draft with `?centre=B` gets an editor where every save answers 404.
- Fix: show the editor only when `c.organizationId === centerId` and
  `canIn(user, centerId, 'medical_record.write')`. Otherwise show the read-only record.

### 31. Trigger tests missing (low)

- INSERT of a diagnosis on a signed consultation, DELETE of a signed consultation, DELETE of an
  addendum, a draft still editable and deletable, and the race in finding 27.

### 32. The ICD-10 seed's provenance (nit)

- Where: `apps/api/drizzle/0009_icd10_starter.sql:1` says the labels were "written for this project",
  yet many match the WHO/ATIH French wording. Record the source and license in the decision log before
  P1.5 imports the full table.

## PR #8: super admin without medical access

### 33. A deny-list: future medical permissions are open to the super admin by default (low)

- Where: `packages/shared/src/roles.ts` (`MEDICAL_PERMISSIONS`, `superAdminBypasses`).
- Why: the rule fails open. A permission added later that carries medical content is open to the super
  admin until someone remembers to add it to the list. Examples: `coverage_request.decide` (P3.3, where
  the medical advisor sees the diagnosis and acts), and document reads (P2.6). `appointment.read` (the
  reason) already bypasses.
- Fix: invert it, with an allow-list of what super admin status alone grants (`org.members.manage`,
  `patient.read_admin`, …). Add a test that every permission is classified, so a new one breaks it.

The mechanism itself is sound: `requirePermission` is the only place that grants super admin access
(`requireSuperAdmin` stays for accounts and organizations). A super admin with a care role keeps that
role's access. The integration test covers read, list and create.

## PR #9: Animate.css

### 34. A second animation library for one fade (low, owner decision)

- Where: `apps/web/src/index.css:4`, `apps/web/src/Layout.tsx`.
- Why: Animate.css is 95 KB of CSS (5.9 KB gzip), 97 keyframes for one `fadeIn`, and Tailwind doesn't
  remove the unused rules. `tw-animate-css`, already installed, does the same with
  `motion-safe:animate-in motion-safe:fade-in`. That goes against KISS/YAGNI and the 3G budget (P6.7).
- Fix: if the PR title means Animate.css was a deliberate choice, keep it and record it in the decision
  log. Otherwise use the `tw-animate-css` utilities and drop the dependency.

Fine as it is:

- Keying `<main>` on `pathname` only remounts on a path change, and the routes are flat, so no nested
  state is lost.
- `?centre=` changes don't replay the fade.
- Reduced motion is handled: Animate.css cuts animations to 1 ms under
  `prefers-reduced-motion: reduce`.
- It is a devDependency, pinned.

## Verdict

- **#4:** fix 1 and 2 before merging; #3 needs the owner's decision.
- **#5:** fix 9 (data model) and 10 before merging, since the index is hard to change once real
  declarations exist.
- **#6:** fix 17 and 18 (the shared fix B); finding 19 means P2.3 isn't complete.
- **#7:** fix 26 before any real data is written. The audit log can't be cleaned afterwards.
- **#8:** mergeable; 33 is a small hardening.
- **#9:** mergeable once the owner settles 34.
