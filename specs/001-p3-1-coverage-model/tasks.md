---
description: 'Tâches de P3.1 : modèle et machine à états des demandes de prise en charge'
---

# Tâches : P3.1 Modèle et machine à états des demandes de prise en charge

**Entrée** : documents de `specs/001-p3-1-coverage-model/` ([plan](plan.md), [spec](spec.md),
[recherche](research.md), [modèle](data-model.md), [contrat](contracts/coverage-requests.md),
[validation](quickstart.md)).

**Tests** : obligatoires. La constitution rend le test d'abord non négociable (principe IV) :
chaque test est écrit, lancé et **vu en échec** avant le code qui le fait passer. Le test et son
code partent dans le même commit (`feat:` ou `fix:`).

**Organisation** : par récit utilisateur de la spec. Les numéros de récit suivent la spec (US1 à
US5) ; les phases suivent la priorité : US1, US2, US3 et US5 (P1), puis US4 (P2).

## Format : `[ID] [P?] [Récit] Description`

- **[P]** : parallélisable (fichiers différents, aucune tâche inachevée en dépendance).
- **[USn]** : récit de la spec.
- Commandes à lancer depuis la racine du dépôt, dans une copie sur disque ext4 (le disque NTFS
  casse `pnpm install`).
- Tests de l'API : `TEST_DATABASE_URL=postgres://medins:medins@localhost:5442/medins_test`, jamais
  5432 ni 5433 ([quickstart](quickstart.md)).

---

## Phase 1 : Mise en place

**But** : un environnement de test qui tourne avant d'écrire la première ligne.

- [x] T001 Recréer la base de test jetable `medins-test-pg` sur le port 5442 (commande dans `specs/001-p3-1-coverage-model/quickstart.md`), installer les dépendances (`pnpm install --frozen-lockfile`), et vérifier que `pnpm test` passe sur `feat/p3-1-coverage-model` avant tout changement.

---

## Phase 2 : Fondations (bloquant)

**But** : le schéma, les migrations et le squelette du module, dont tous les récits dépendent.

**⚠️** Aucun récit ne commence avant la fin de cette phase.

- [x] T002 Squelette partagé `packages/shared/src/schemas/coverage-requests.ts` :
  - `COVERAGE_REQUEST_STATUSES` et le type `CoverageRequestStatus` ;
  - `COVERAGE_REQUEST_STATUS_LABELS` (brouillon, soumise, en examen, accordée, refusée, complément demandé, utilisée, facturée, annulée, expirée) ;
  - `FINAL_STATUSES` (`rejected`, `cancelled`, `expired`, `billed`) ;
  - le type `CoverageRequestActor = 'center' | 'insurer' | 'system'` ;
  - l'export depuis `packages/shared/src/index.ts`.
- [x] T003 Ajouter à `apps/api/src/db/schema.ts` :
  - l'énumération `coverage_request_status` (`draft`, `submitted`, `under_review`, `granted`, `rejected`, `info_requested`, `used`, `billed`, `cancelled`, `expired`), dont les valeurs viennent de `COVERAGE_REQUEST_STATUSES` (T002) ;
  - la table `medical_acts` : `code` text PK, `label` text non nul, `reference_price` integer non nul avec CHECK `> 0`.

  Ces deux éléments servent tous les récits.

- [x] T004 Ajouter `coverage_requests` à `apps/api/src/db/schema.ts`, colonnes et index exactement comme dans `data-model.md` :
  - FK `center_id`, `insurer_id`, `patient_id`, `affiliation_id`, `diagnosis_code` (→ `icd10_codes`) et `created_by` ;
  - `estimated_amount` integer non nul `≥ 0` ;
  - `granted_amount` et `patient_share` integer nullables ;
  - `valid_until` date nullable ;
  - `status` défaut `draft` ;
  - CHECK `0 < granted_amount ≤ estimated_amount` ;
  - CHECK `patient_share = estimated_amount − granted_amount` quand `granted_amount` est posé ;
  - CHECK « `granted_amount`, `patient_share` et `valid_until` posés ensemble » ;
  - index `(center_id, status)`, `(insurer_id, status)` et `(patient_id)`.
- [x] T005 Ajouter `coverage_request_items` à `apps/api/src/db/schema.ts` :
  - `act_code` FK → `medical_acts`, `act_label` text non nul ;
  - `quantity` CHECK `≥ 1`, `unit_price` CHECK `> 0` ;
  - `line_amount` CHECK `= quantity × unit_price` ;
  - `position` integer non nul ; index `(coverage_request_id)`.
- [x] T006 Ajouter `coverage_request_events` à `apps/api/src/db/schema.ts` :
  - `from_status` nullable, `to_status` non nul ;
  - `actor_user_id` FK nullable (nul pour `system`), `reason` text nullable ;
  - `created_at` défaut `now()` ; index `(coverage_request_id, created_at)` ;
  - un commentaire qui renvoie au trigger d'ajout seul (T007).
- [x] T007 Générer les migrations dans `apps/api/drizzle/`, depuis la racine :
  - `pnpm db:generate`, renommer en `0013_coverage_requests` (relire le SQL) ;
  - `pnpm --filter @medical-ins/api exec drizzle-kit generate --custom --name coverage_request_events_append_only`, avec un trigger qui rejette UPDATE et DELETE sur `coverage_request_events`, sur le modèle de `apps/api/drizzle/0011_consultations_read_only.sql` ;
  - `--custom --name medical_acts_starter` : une vingtaine d'actes courants (consultation générale, consultation spécialisée, échographie abdominale, radiographie thoracique, NFS, glycémie, TDR paludisme, ECG, accouchement par voie basse, césarienne, petite chirurgie, hospitalisation par jour…), avec codes locaux (`CONS-GEN`…), `INSERT … ON CONFLICT DO NOTHING`, et un en-tête qui dit que les tarifs sont **indicatifs, à valider par le propriétaire avant la production**.
- [x] T008 Squelette du module : `apps/api/src/modules/coverage-requests/routes.ts` (fonction `coverageRequestRoutes(app, { db })`, vide), `service.ts` et `transitions.ts`. Enregistrer les routes dans `apps/api/src/app.ts`, et ajouter `coverage_request_events`, `coverage_request_items` et `coverage_requests` au `TRUNCATE` de `resetDb` dans `apps/api/test/helpers.ts`, en ordre de dépendance, sans `medical_acts`, qui est un référentiel de migration. _Fait en partie : `resetDb` est à jour ; le module et son enregistrement dans `app.ts` arrivent avec la première route (T020), un module vide ne passant pas le lint._
- [x] T009 Vérifier que `pnpm typecheck`, `pnpm lint` et `pnpm test` passent (migrations `apps/api/drizzle/0013` à `0015` appliquées sur une base vide), puis committer les fondations. Les migrations et le schéma partent dans un commit `feat(api):` à part.

**Point de contrôle** : le schéma existe, les tests existants passent, et le module est vide.

---

## Phase 3 : US1, le cycle de vie ne suit que les transitions prévues (P1) 🎯 MVP

**But** : la règle des transitions, partagée et prouvée de façon exhaustive (FR-003 à FR-005,
SC-001).

**Test indépendant** : le test partagé parcourt chaque triplet (statut de départ, statut
d'arrivée, acteur) et compare à la table de `data-model.md`.

### Tests (à écrire d'abord, vus en échec)

- [x] T010 [US1] Test exhaustif dans `packages/shared/src/schemas/coverage-requests.test.ts` :
  - pour chaque `from` de `COVERAGE_REQUEST_STATUSES`, chaque `to` et chaque acteur (`center`, `insurer`, `system`), `canTransition(from, to, actor)` vaut `true` exactement pour les 13 lignes de la table « Machine à états » de `data-model.md` ;
  - un statut de `FINAL_STATUSES` n'a aucune transition sortante ;
  - aucun `to` n'est `draft`.

### Implémentation

- [x] T011 [US1] Implémenter `TRANSITIONS` (de → vers → acteur) et `canTransition` dans `packages/shared/src/schemas/coverage-requests.ts`. Commentaire court : la table est la seule source de la règle, le serveur la fait respecter et l'interface s'en sert pour n'afficher que les actions possibles.
- [x] T012 [US1] Test puis implémentation de `transitionInputSchema` (zod) dans `packages/shared/src/schemas/coverage-requests.ts` :
  - `{ to, reason?, grantedAmount?, validUntil? }` ;
  - `reason` : chaîne « non vide après trim, au plus 1 000 caractères » ;
  - `grantedAmount` : entier > 0 ;
  - `validUntil` : `isoDateSchema` ;
  - `to` ne peut pas être `draft`.
- [x] T013 [US1] Test puis implémentation de `transitionProblem(from, to, input, context)` dans `packages/shared/src/schemas/coverage-requests.ts`. Elle renvoie un message français ou `null` :
  - motif obligatoire pour `cancelled` depuis `submitted`, `under_review` ou `info_requested`, ainsi que pour `rejected` et `info_requested` ;
  - pour `granted` : `0 < grantedAmount ≤ estimatedAmount`, `validUntil ≥ today()`, motif obligatoire si `grantedAmount < estimatedAmount` ;
  - pour `used` : `today() ≤ validUntil`.

  Les tests figent le temps à 22 h 30 UTC pour vérifier le jour de Madagascar.

**Point de contrôle** : `pnpm --filter @medical-ins/shared test` est vert, et SC-001 est prouvé.

---

## Phase 4 : US2, le centre prépare puis soumet une demande (P1)

**But** : création, modification d'un brouillon et soumission (FR-001, FR-002, FR-009, FR-015,
FR-017).

**Test indépendant** : créer un brouillon avec des lignes, le soumettre, puis vérifier le statut,
le montant estimé et l'historique par le GET.

### Tests (à écrire d'abord, vus en échec)

- [x] T014 [P] [US2] Test partagé de `createCoverageRequestInputSchema` et `updateCoverageRequestInputSchema` dans `packages/shared/src/schemas/coverage-requests.test.ts` :
  - `items` de 1 à 30 lignes, `quantity` entier ≥ 1, `unitPrice` entier > 0 facultatif ;
  - `diagnosisCode` au format CIM-10 (réutiliser le schéma de code de `consultations.ts`) ;
  - la mise à jour exige au moins un champ.
- [x] T015 [P] [US2] Test partagé de `submissionProblem(affiliation, request, today)` dans `packages/shared/src/schemas/coverage-requests.test.ts` :
  - refuse une affiliation non active à cette date (réutiliser `isAffiliationActive`) ;
  - refuse une demande sans diagnostic ou sans ligne.
- [x] T016 [US2] Tests d'intégration dans `apps/api/test/coverage-requests.test.ts` :
  - **création** : 201 `{ id }` ; `insurerId` tiré de l'affiliation ; `estimatedAmount` recalculé (2 × 15 000 + 1 × 40 000 = 70 000, même si le client envoie autre chose) ; `unitPrice` absent = tarif de référence ; ligne copiant code, libellé et tarif ; événement `null → draft` ; audit `coverage_request.create` ;
  - **refus de création** :
    - 404 pour un patient non rattaché, une affiliation d'un autre patient, un acte ou un code inconnu ;
    - 403 pour l'accueil, le médecin conseil ou le super admin seul ;
    - 404 si `:orgId` n'est pas un centre ; _inatteignable : un médecin ne peut pas être membre d'un assureur, l'appel s'arrête au 403 de la permission ; `requireHealthCenter` reste en défense._
  - **modification** : PATCH en `draft` ; `items` remplace les lignes et recalcule le montant ; audit `{ fields }` ; 409 hors `draft`/`info_requested` ; un autre médecin du même centre modifie et soumet le brouillon d'un collègue (200, FR-009) ;
  - **soumission** (`POST …/transitions`, `{ to: 'submitted' }`) : 200 avec une affiliation validée et active ; 400 avec un message français pour une affiliation `pending`, `rejected`, `withdrawn` ou hors de ses dates.

### Implémentation

- [x] T017 [US2] Implémenter les schémas (T014) et `submissionProblem` (T015) dans `packages/shared/src/schemas/coverage-requests.ts`.
- [x] T018 [US2] Dans `apps/api/src/modules/coverage-requests/service.ts`, implémenter :
  - `lockCoverageRequest(tx, id)`, qui lit avec `.for('update')` (patron de `requireOwnDraft`) ;
  - `insertCoverageRequest(tx, center, actor, input)`, qui vérifie le patient avec `requireLinkedPatient`, puis l'affiliation, les actes et le code, calcule les lignes et le montant, insère la demande et ses lignes, puis l'événement ;
  - `replaceItems` et `updateDraft` (verrou, statut `draft` ou `info_requested` sinon 409, recalcul).
- [x] T019 [US2] Dans `apps/api/src/modules/coverage-requests/transitions.ts`, implémenter `applyTransition(tx, { id, orgId, actor, actorUserId, input, ip })`, dans cet ordre :
  1. verrou ;
  2. contrôle d'organisation (centre : `center_id = orgId` ; assureur : `insurer_id = orgId` et statut différent de `draft`, sinon 404) ;
  3. `canTransition`, sinon 409 ;
  4. `transitionProblem` ou `submissionProblem`, sinon 400 ;
  5. mise à jour ;
  6. insertion de l'événement ;
  7. `audit(tx, { action: 'coverage_request.<to>', after: { from, to } })`, sans le motif.
- [x] T020 [US2] Dans `apps/api/src/modules/coverage-requests/routes.ts`, écrire des routes minces :
  - `POST /api/organizations/:orgId/coverage-requests` (`coverage_request.create`, `requireHealthCenter`) ;
  - `PATCH …/:id` ;
  - `POST …/:id/transitions`, qui déduit l'acteur de la permission détenue dans `:orgId` (`center` ou `insurer` ; jamais `system`, sinon 403).

  Toutes les écritures répondent avec les ids seulement.

- [x] T021 [P] [US2] Ajouter `GET /api/referentials/medical-acts?q=` dans `apps/api/src/modules/coverage-requests/routes.ts` et `service.ts` : `requireUser`, au plus 50 résultats, recherche sur le code ou le libellé insensible à la casse avec `escapeLike` (`apps/api/src/lib/sql.ts`). Le test (code ou libellé, échappement de `%`, 401 anonyme) va dans `apps/api/test/coverage-requests.test.ts`.

**Point de contrôle** : un médecin crée, modifie et soumet une demande par l'API, et T016 est vert.

---

## Phase 5 : US3, le médecin conseil décide (P1)

**But** : prise en examen, accord total ou partiel, refus, demande de complément, et projection
assureur (FR-010 à FR-014, FR-017).

**Test indépendant** : faire passer une demande soumise par chaque décision, puis vérifier les
montants, la date limite, le motif et ce que voit le médecin conseil.

### Tests (à écrire d'abord, vus en échec)

- [X] T022 [US3] Tests d'intégration dans `apps/api/test/coverage-request-transitions.test.ts` :
  - `under_review` par le médecin conseil de l'assureur destinataire ;
  - l'accord total de 70 000 sur 70 000 donne `patientShare` 0 ;
  - l'accord partiel de 50 000 avec motif donne `patientShare` 20 000 ;
  - un accord partiel sans motif, un montant > estimé, nul ou négatif, ou une `validUntil` passée répondent 400 ;
  - `rejected` et `info_requested` sans motif répondent 400 ;
  - un médecin du centre qui tente `granted` reçoit 409 ;
  - le médecin conseil d'un autre assureur reçoit 404 ;
  - le médecin conseil sur un brouillon reçoit 404 ;
  - une affiliation retirée, ou dont `endsOn` est passé, après la soumission : la décision reste possible (200), et le GET assureur montre le statut actuel de l'affiliation.
- [X] T023 [P] [US3] Tests de lecture dans `apps/api/test/coverage-requests.test.ts` :
  - `GET …/:id` côté centre : forme complète du contrat ;
  - côté assureur : forme assureur avec `center: { id, name }` ; les clés de premier niveau sont exactement celles du contrat ; aucune donnée de consultation ni d'autre demande ;
  - brouillon côté assureur : 404 ;
  - autre centre ou autre assureur : 404 ;
  - après le retrait de l'adhésion de l'auteur au centre, un autre médecin du centre lit toujours la demande et son historique (200) ;
  - infirmier, accueil, facturation ou super admin sans rôle : 403 ;
  - chaque lecture écrit `medical_record.read` avec `entityType: 'coverage_request'` ;
  - liste : centre (toutes ses demandes), assureur (sans brouillons), filtres `status` et `patientId`, pages de 50, sans diagnostic ni lignes, audit `{ coverageRequestIds }`.

### Implémentation

- [X] T024 [US3] Étendre `applyTransition` dans `apps/api/src/modules/coverage-requests/transitions.ts` pour `granted` : poser `granted_amount`, `patient_share = estimated − granted` et `valid_until`, et ajouter `{ grantedAmount, validUntil }` au payload d'audit.
- [X] T025 [US3] Dans `apps/api/src/modules/coverage-requests/service.ts`, implémenter :
  - `findCoverageRequestForCenter` et `findCoverageRequestForInsurer` : sélections explicites selon le contrat, avec diagnostic (code et libellé), lignes triées par `position` et événements triés par `created_at` ;
  - `listCoverageRequests(tx, { orgId, side, status?, patientId?, offset })`.
- [X] T026 [US3] Dans `apps/api/src/modules/coverage-requests/routes.ts`, ajouter `GET …/coverage-requests/:id` et `GET …/coverage-requests`. Le côté vient de la permission (`coverage_request.create` donne le centre, `coverage_request.decide` l'assureur). L'audit `medical_record.read` (`entityType: 'coverage_request'`) est écrit dans la même transaction que la lecture.

**Point de contrôle** : le cycle soumission → examen → décision passe par l'API, et les tests
T022 et T023 sont verts.

---

## Phase 6 : US5, historique et audit de chaque transition (P1)

**But** : atomicité, aucun texte médical dans l'audit, une seule décision gagne en concurrence
(FR-006 à FR-008, SC-002 à SC-004).

**Test indépendant** : une transition qui échoue ne laisse aucune trace ; une transition qui
réussit écrit le statut, l'événement et l'audit ensemble.

### Tests (à écrire d'abord, vus en échec)

- [X] T027 [P] [US5] Atomicité dans `apps/api/test/coverage-request-transitions.test.ts` : avec `withAuditFailing` (`apps/api/test/helpers.ts`), une transition répond 500, et le statut et les événements restent inchangés.
- [X] T028 [P] [US5] Aucun texte médical dans l'audit (SC-002), dans `apps/api/test/coverage-request-transitions.test.ts` :
  - un parcours complet (création, modification, soumission, examen, complément, nouvelle soumission, examen, accord partiel, utilisation) avec un motif, un libellé d'acte et un diagnostic repérables ;
  - ni le motif, ni le libellé, ni le code ou le libellé du diagnostic n'apparaissent dans le JSON d'une ligne de `audit_logs`.
- [X] T029 [P] [US5] Course déterministe (SC-003), dans `apps/api/test/coverage-request-transitions.test.ts` : le test tient la ligne avec `SELECT … FOR UPDATE` dans sa propre transaction, envoie deux décisions (`granted` et `rejected`), attend qu'elles soient bloquées (`pg_stat_activity`), puis relâche. Résultat attendu : `[200, 409]`, et un seul événement de décision. Réutiliser l'approche du test de course de P2.4 (`whileSigning`).
- [X] T030 [P] [US5] Historique en ajout seul, dans `apps/api/test/coverage-request-transitions.test.ts` :
  - UPDATE et DELETE directs sur `coverage_request_events` échouent avec le message du trigger ;
  - après chaque scénario du fichier, le `to_status` du dernier événement égale le `status` de la demande (SC-004).

### Implémentation

- [X] T031 [US5] Corriger, dans `apps/api/src/modules/coverage-requests/transitions.ts` et `service.ts`, tout ce que T027 à T030 font échouer. En principe rien, si T018 et T019 ont suivi le plan : dans ce cas, ces tests ne font que couvrir, et le message de commit le dit. Vérifier leur pouvoir de détection en cassant volontairement l'ordre verrou → contrôle, puis en rétablissant.

**Point de contrôle** : SC-002, SC-003 et SC-004 sont prouvés.

---

## Phase 7 : US4, complément, nouvelle soumission, annulation, utilisation (P2)

**But** : les transitions restantes du centre (FR-004 et FR-009).

**Test indépendant** : complément → nouvelle soumission → accord → utilisation, et brouillon →
annulation, avec l'historique.

### Tests (à écrire d'abord, vus en échec)

- [ ] T032 [US4] Tests d'intégration dans `apps/api/test/coverage-request-transitions.test.ts` :
  - en `info_requested`, PATCH des lignes puis `submitted` : deux événements de soumission dans l'historique ;
  - `cancelled` depuis `draft` (sans motif), et depuis `submitted`, `under_review` ou `info_requested` (motif obligatoire) ;
  - toute transition depuis `cancelled` répond 409 ;
  - `used` avant `valid_until` répond 200 ;
  - `used` après `valid_until` répond 400 (forcer la date passée en base) ;
  - `expired` ou `billed` demandés par HTTP : refusés, puisque l'acteur `system` n'est pas accessible.

### Implémentation

- [ ] T033 [US4] Compléter `applyTransition` dans `apps/api/src/modules/coverage-requests/transitions.ts` et `transitionProblem` dans `packages/shared/src/schemas/coverage-requests.ts` pour faire passer T032, sans nouvelle route.

**Point de contrôle** : tout le tableau FR-004 est couvert par l'API, sauf les transitions
`system`, couvertes par le test partagé.

---

## Phase 8 : Finitions et points transverses

- [ ] T034 [P] Dans `apps/api/src/db/schema.ts`, corriger les numéros de migration de deux commentaires (rendez-vous : 0006 → 0009 ; consultations : 0008 → 0011). Commit `docs:` à part.
- [ ] T035 [P] Dans les « Questions ouvertes » de `docs/ROADMAP.md`, ajouter : « Valider les tarifs indicatifs du jeu d'actes de départ (P3.1) avant la mise en production ». Commit `docs:` à part.
- [ ] T036 Vérifier que chaque fichier de `apps/api/src/modules/coverage-requests/` reste sous ~500 lignes. Factoriser ce qui se répète entre les deux projections, sans abstraction à un seul appelant.
- [ ] T037 Dérouler `specs/001-p3-1-coverage-model/quickstart.md` : `pnpm lint`, `pnpm typecheck`, `pnpm test` (shared, web, API sur une base vide), `node_modules/.bin/prettier --check .`, `pnpm build`, puis le parcours manuel.
- [ ] T038 Mettre à jour `docs/ROADMAP.md` : P3.1 coché `(fait)` dans la PR qui livre l'item. Ouvrir la PR vers `main`, sans pied « Generated by », et cocher les tâches de ce fichier au fil des commits.

---

## Dépendances et ordre d'exécution

### Phases

- **Phase 1 (mise en place)** : aucune dépendance.
- **Phase 2 (fondations)** : dépend de la phase 1, et bloque tous les récits.
- **US1 (phase 3)** : dépend des fondations. C'est la règle que tous les autres récits appliquent.
- **US2 (phase 4)** : dépend d'US1 (`canTransition`, `transitionInputSchema`).
- **US3 (phase 5)** : dépend d'US2, puisqu'il faut une demande soumise pour décider.
- **US5 (phase 6)** : dépend d'US2 et d'US3, puisqu'il faut un parcours complet à auditer.
- **US4 (phase 7)** : dépend d'US3 (accord et complément).
- **Finitions (phase 8)** : T034 et T035 à tout moment, T036 à T038 à la fin.

Les récits ne sont pas indépendants les uns des autres : une machine à états se construit dans
l'ordre de son cycle. Chaque phase reste testable à son point de contrôle.

### À l'intérieur d'un récit

Test vu en échec → règle partagée → service → route → test vert → commit.

### Parallélisme

- Fondations : T002 (shared) d'abord, car l'énumération en dépend ; T003 à T006 touchent le même
  fichier (`schema.ts`), donc pas de parallélisme.
- US2 : T014 et T015 (tests partagés) en parallèle ; T021 (référentiel) en parallèle de T018 à
  T020.
- US3 : T023 (lectures) en parallèle de T022 (décisions), puisque ce sont des fichiers de test
  différents.
- US5 : T027 à T030 dans le même fichier de test, mais indépendants. On peut les écrire
  ensemble, puis les faire passer un par un.
- Finitions : T034 et T035 sont indépendants de tout le reste.

### Exemple (US2)

```text
En parallèle :
  T014  schémas d'entrée          packages/shared/src/schemas/coverage-requests.test.ts
  T015  submissionProblem         packages/shared/src/schemas/coverage-requests.test.ts
  T021  référentiel d'actes       apps/api/src/modules/coverage-requests/{routes,service}.ts
Puis : T016 → T017 → T018 → T019 → T020
```

## Stratégie

1. **MVP = phases 1 à 3 (US1)** : la règle des transitions, partagée et prouvée. Elle est déjà
   utilisable par les écrans futurs.
2. **Incrément 2 = US2 + US3** : le cycle principal passe par l'API (créer, soumettre, examiner,
   décider, lire).
3. **Incrément 3 = US5** : les garanties d'audit et de concurrence sont prouvées.
4. **Incrément 4 = US4** : le cycle est complet. P3.1 est alors livrable dans une seule PR.

Chaque incrément se termine par lint, typecheck, tests et build verts, puis par des micro-commits.
