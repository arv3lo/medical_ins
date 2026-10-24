# Recherche : P3.1 Modèle et machine à états des demandes de prise en charge

Aucune inconnue technique ne reste : la pile, les tests et les patrons existent déjà (P2.1 à P2.4).
Chaque décision ci-dessous réutilise un patron du dépôt plutôt que d'en inventer un.

## R1. Où vit la règle des transitions

- **Décision** : un module partagé, `packages/shared/src/schemas/coverage-requests.ts`. Il contient :
  - les statuts ;
  - la table `TRANSITIONS`, qui associe à chaque statut de départ les statuts d'arrivée possibles
    et l'acteur autorisé (`center`, `insurer` ou `system`) ;
  - `canTransition(from, to, actor)` ;
  - des fonctions de condition pures, sur le modèle de `signingProblem` de P2.4 :
    `submissionProblem` et `grantProblem`, qui renvoient un message en français ou `null`.
- **Pourquoi** : la constitution demande une seule place par règle (principe VI). Le serveur la
  fait respecter, et les écrans de P3.2/P3.3 s'en servent pour n'afficher que les actions
  possibles, comme `canChangeAppointmentStatus` et `isStatusChangeDue` en P2.3. Le test exhaustif
  (SC-001) devient un simple produit statuts × statuts × acteurs.
- **Alternatives écartées** :
  - une machine à états en base, par triggers : règle illisible, invisible côté interface et
    difficile à tester exhaustivement ;
  - une bibliothèque (XState) : une dépendance pour une table de 13 lignes (YAGNI).

## R2. Du rôle à l'acteur de la transition

- **Décision** :
  - `center` correspond à `coverage_request.create` dans le centre demandeur ;
  - `insurer` correspond à `coverage_request.decide` dans l'organisation de l'assureur
    destinataire ;
  - `system` n'est jamais atteignable par une requête HTTP en P3.1. Il servira à P3.5 (expiration)
    et à P4 (facturation), appelés côté serveur.
- **Pourquoi** :
  - les permissions existent déjà dans `roles.ts` (médecin : `create` ; médecin conseil :
    `decide`) ;
  - la liste des droits du super admin les met déjà à `false` : le super admin seul n'a aucun accès
    (constitution, principe II) ;
  - l'organisation vient de l'URL, comme partout.
- **Alternative écartée** : coder les rôles en dur dans la table (`doctor`, `medical_advisor`). La
  matrice ne vivrait plus seulement dans `roles.ts`.

## R3. Concurrence

- **Décision** : chaque opération qui modifie une demande la lit d'abord sous
  `SELECT … FOR UPDATE`, dans la transaction : `lockCoverageRequest(tx, orgId, id)`, sur le
  modèle de `requireOwnDraft` en P2.4. Elle vérifie ensuite la transition et les conditions sur la
  ligne verrouillée. Une seconde requête concurrente attend, relit le nouveau statut et reçoit 409.
- **Pourquoi** : c'est le patron retenu après la revue des PR #5 à #7 (constitution, principe V),
  et il se teste de façon déterministe (verrou tenu par le test, attente vue dans
  `pg_stat_activity`).
- **Alternative écartée** : `UPDATE … WHERE status = <attendu>` seul. Il suffirait pour le statut,
  mais pas pour les modifications de lignes, qui touchent plusieurs tables.

## R4. Montants

- **Décision** :
  - colonnes entières en ariary : `estimated_amount`, `granted_amount` (nullable),
    `patient_share` (nullable), `unit_price` et `line_amount` par ligne ;
  - le serveur recalcule `estimated_amount` (somme des lignes) dans la transaction qui modifie les
    lignes, et `patient_share = estimated − granted` à l'accord ;
  - des CHECK en base rejettent ce qui ne doit jamais exister : quantité ≥ 1, tarif > 0,
    `0 < granted ≤ estimated`, et `patient_share = estimated − granted` quand un montant est
    accordé.
- **Pourquoi** : la constitution exige des ariary entiers, calculés côté serveur, et des invariants
  en base (principe V). Le montant estimé est stocké plutôt que recalculé à la lecture : la
  décision et la future facture (P4) doivent se référer à un montant figé.
- **Alternative écartée** : une vue calculée. Le montant changerait si une ligne changeait après la
  décision ; le verrou l'empêche, mais une valeur stockée et vérifiée est plus simple à auditer.

## R5. Historique

- **Décision** : une table `coverage_request_events` avec la demande, l'ancien statut (nul à la
  création), le nouveau statut, l'auteur (nul pour `system`), le motif (nullable) et la date. Elle
  est en ajout seul : un trigger rejette UPDATE et DELETE, dans une migration personnalisée, comme
  pour `audit_logs` et les avenants de P2.4.
- **Pourquoi** :
  - FR-006 exige un historique jamais modifié, et SC-004 demande que la suite des événements
    redonne le statut actuel ;
  - le motif peut contenir du texte médical. Il reste donc dans l'historique, visible seulement de
    ceux qui voient la demande, et jamais dans l'audit.
- **Alternative écartée** : se servir de `audit_logs` comme historique. L'audit ne doit pas
  contenir de motif (principe I), et il n'est pas restreint aux rôles de soin.

## R6. Audit

- **Décision** :
  - actions `coverage_request.create`, `coverage_request.update` et
    `coverage_request.<statut d'arrivée>` (par exemple `coverage_request.submitted`) ;
  - payloads : `{ from, to }` pour une transition, plus `{ grantedAmount, validUntil }` pour un
    accord. Pour une modification : `{ fields: [...] }` (noms des champs), sans diagnostic, sans
    libellé, sans motif ;
  - lectures : `medical_record.read`, comme en P2.4, avec `entityType: 'coverage_request'` (et
    `{ coverageRequestIds }` pour une liste). Une demande porte un diagnostic : une seule action
    pour toute lecture de contenu médical, pour qu'une requête sur `medical_record.read` les
    retrouve toutes (revue PR #7, constat 28).
- **Pourquoi** : principe I, et le même format que les audits de P2.4 corrigés par la revue.

## R7. Référentiel d'actes de départ (réponse Q1 : B)

- **Décision** :
  - table `medical_acts` : `code` (clé), `label`, `reference_price` (entier, MGA), sous le nom que
    P1.5 utilisera. P1.5 y ajoutera les colonnes qui lui manquent (par exemple « soumis à accord
    par défaut ») ;
  - un jeu de départ d'une vingtaine d'actes courants, inséré par une migration personnalisée
    idempotente (`ON CONFLICT DO NOTHING`), comme `0012_icd10_starter.sql` ;
  - chaque ligne de demande garde une copie du code, du libellé et du tarif au moment de la
    saisie, en plus de la clé étrangère vers l'acte ;
  - les tarifs de référence du jeu de départ sont **indicatifs**. Ils doivent être validés par le
    propriétaire avant la mise en production, ce qui est ajouté aux questions ouvertes de la
    roadmap ;
  - les codes sont locaux au projet (par exemple `CONS-GEN`, `ECHO-ABD`), sans prétendre suivre une
    nomenclature officielle. Ils seront remplacés ou reliés lors de l'import de P1.5.
- **Pourquoi** : le référentiel est cohérent dès le départ, et P1.5/P1.7 n'invalident pas les
  demandes existantes (FR-015).
- **Alternative écartée** : la saisie libre. Codes incohérents et nettoyage à prévoir (Q1, option A
  refusée).

## R8. Visibilité et projections (réponse Q3 : A)

- **Décision** :
  - **côté centre** : `coverage_request.create` dans le centre, et `center_id = orgId`. Les
    médecins du centre voient toutes les demandes du centre, brouillons compris, avec le
    diagnostic ;
  - **côté assureur** : `coverage_request.decide` dans l'assureur, `insurer_id = orgId`, et statut
    différent de `brouillon`. Un brouillon n'existe pas pour l'assureur : 404 ;
  - **projection assureur explicite** (principe III) :
    - identité du patient : nom, prénoms, date de naissance, CIN ;
    - affiliation : numéro, qualité, régime, dates, statut actuel ;
    - diagnostic : code et libellé ;
    - les lignes, les montants, la date limite et l'historique ;
    - le nom du médecin demandeur (rien d'autre sur lui), et rien d'autre du dossier ;
  - une demande d'une autre organisation répond 404 (FR-014).

## R9. Opérations exposées (réponse Q2 : A)

- **Décision** : une seule route de transition, `POST …/coverage-requests/:id/transitions`, avec
  `{ to, reason?, grantedAmount?, validUntil? }`. Elle applique la table partagée plutôt que d'avoir
  une route par action. Les autres opérations sont la création, la modification et deux lectures,
  liste et détail. Le détail est dans `contracts/coverage-requests.md`.
- **Pourquoi** : la route reste mince et délègue à la règle partagée (principe VI). P3.2 et P3.3
  n'ajouteront que des écrans.
- **Alternative écartée** : une route par verbe (`/submit`, `/grant`…). Treize routes pour une même
  règle, avec le risque qu'elles divergent.

## R10. Dates

- **Décision** :
  - `valid_until` est une date calendaire (`isoDateSchema`), au moins aujourd'hui à Madagascar
    (`today()`) au moment de l'accord ;
  - « utilisée » n'est permis que si `today() ≤ valid_until` ;
  - « active aujourd'hui », pour l'affiliation, réutilise `isAffiliationActive(affiliation, today())`.
- **Pourquoi** : constitution, principe V, et une seule règle de couverture déjà testée en P2.2.

## Divers relevé en lisant le code

- Dans `apps/api/src/db/schema.ts`, deux commentaires citent encore d'anciens numéros de
  migration : « migration 0006 » pour les rendez-vous (aujourd'hui 0009) et « migration 0008 » pour
  les consultations (aujourd'hui 0011). À corriger dans un commit `docs:` à part.
- `resetDb` (tests de l'API) devra vider les nouvelles tables.
