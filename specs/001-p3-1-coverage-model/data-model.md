# Modèle de données : P3.1 Demandes de prise en charge

Montants en ariary entiers (MGA). Les dates calendaires sont au format `AAAA-MM-JJ`, les instants
en UTC. Les tables existantes réutilisées sont `patients`, `patient_center_links`, `affiliations`,
`organizations`, `users`, `icd10_codes` et `audit_logs`.

## Énumération `coverage_request_status`

`draft`, `submitted`, `under_review`, `granted`, `rejected`, `info_requested`, `used`, `billed`,
`cancelled`, `expired`.

Libellés français (dans le module partagé) : brouillon, soumise, en examen, accordée, refusée,
complément demandé, utilisée, facturée, annulée, expirée.

Statuts définitifs : `rejected`, `cancelled`, `expired` et `billed`.

## `medical_acts` (référentiel de départ, futur P1.5)

| Colonne           | Type    | Règles                                 |
| ----------------- | ------- | -------------------------------------- |
| `code`            | text PK | code local au projet, ex. `CONS-GEN`   |
| `label`           | text    | non nul, en français                   |
| `reference_price` | integer | non nul, > 0 (CHECK) ; tarif indicatif |

Le jeu de départ est inséré par une migration personnalisée idempotente (`ON CONFLICT DO NOTHING`).

## `coverage_requests`

| Colonne            | Type        | Règles                                                                          |
| ------------------ | ----------- | ------------------------------------------------------------------------------- |
| `id`               | uuid PK     |                                                                                 |
| `center_id`        | uuid FK     | → organizations ; centre demandeur (type centre de santé)                       |
| `insurer_id`       | uuid FK     | → organizations ; toujours l'assureur de l'affiliation, posé par le serveur     |
| `patient_id`       | uuid FK     | → patients ; rattaché au centre à la création                                   |
| `affiliation_id`   | uuid FK     | → affiliations ; doit appartenir au patient                                     |
| `diagnosis_code`   | text FK     | → icd10_codes ; diagnostic principal                                            |
| `estimated_amount` | integer     | non nul, ≥ 0 ; somme des lignes, recalculée par le serveur                      |
| `granted_amount`   | integer     | nullable ; posé à l'accord ; CHECK `0 < granted ≤ estimated`                    |
| `patient_share`    | integer     | nullable ; CHECK `patient_share = estimated − granted` quand `granted` est posé |
| `valid_until`      | date        | nullable ; posé à l'accord ; ≥ aujourd'hui (Madagascar) à ce moment             |
| `status`           | enum        | non nul, défaut `draft`                                                         |
| `created_by`       | uuid FK     | → users ; médecin auteur                                                        |
| `created_at`       | timestamptz | horodatages habituels (`timestamps`)                                            |
| `updated_at`       | timestamptz |                                                                                 |

- **Index** : `(center_id, status)`, `(insurer_id, status)`, `(patient_id)`.
- **CHECK** :
  - `granted_amount` et `patient_share` sont posés ensemble ;
  - `valid_until` est posé dès qu'il y a un montant accordé ;
  - les montants sont cohérents (voir le tableau).
- **Partielle** (FR-011) : se déduit de `granted_amount < estimated_amount`, sans colonne.

## `coverage_request_items`

| Colonne               | Type    | Règles                                                        |
| --------------------- | ------- | ------------------------------------------------------------- |
| `id`                  | uuid PK |                                                               |
| `coverage_request_id` | uuid FK | → coverage_requests                                           |
| `act_code`            | text FK | → medical_acts                                                |
| `act_label`           | text    | non nul ; copie du libellé au moment de la saisie             |
| `quantity`            | integer | non nul, CHECK ≥ 1                                            |
| `unit_price`          | integer | non nul, CHECK > 0 ; tarif de référence par défaut, ajustable |
| `line_amount`         | integer | non nul ; CHECK `line_amount = quantity × unit_price`         |
| `position`            | integer | non nul ; ordre d'affichage                                   |

- **Index** : `(coverage_request_id)`.
- Une modification de lignes, possible seulement en `draft` ou `info_requested`, remplace
  l'ensemble des lignes et recalcule `estimated_amount` dans la même transaction.

## `coverage_request_events` (historique, ajout seul)

| Colonne               | Type        | Règles                                              |
| --------------------- | ----------- | --------------------------------------------------- |
| `id`                  | uuid PK     |                                                     |
| `coverage_request_id` | uuid FK     | → coverage_requests                                 |
| `from_status`         | enum        | nullable (création)                                 |
| `to_status`           | enum        | non nul                                             |
| `actor_user_id`       | uuid FK     | → users ; nul pour une transition `system`          |
| `reason`              | text        | nullable ; obligatoire selon la transition (FR-004) |
| `created_at`          | timestamptz | non nul, défaut `now()`                             |

- **Index** : `(coverage_request_id, created_at)`.
- **Trigger** (migration personnalisée) : il rejette UPDATE et DELETE, comme pour `audit_logs` et
  `consultation_addenda`.
- **Invariant SC-004** : le `to_status` du dernier événement d'une demande est son `status`. Un test
  le vérifie après chaque scénario.

## Machine à états (règle partagée)

| De                          | Vers             | Acteur  | Conditions (fonction de condition partagée)                                                     |
| --------------------------- | ---------------- | ------- | ----------------------------------------------------------------------------------------------- |
| —                           | `draft`          | center  | patient rattaché au centre ; affiliation du patient ; diagnostic connu ; ≥ 1 ligne valide       |
| `draft`                     | `submitted`      | center  | `submissionProblem` : affiliation active aujourd'hui, diagnostic posé, ≥ 1 ligne                |
| `draft`                     | `cancelled`      | center  | —                                                                                               |
| `submitted`                 | `under_review`   | insurer | —                                                                                               |
| `submitted`, `under_review` | `cancelled`      | center  | motif                                                                                           |
| `under_review`              | `granted`        | insurer | `grantProblem` : 0 < accordé ≤ estimé ; `valid_until` ≥ aujourd'hui ; motif si accordé < estimé |
| `under_review`              | `rejected`       | insurer | motif                                                                                           |
| `under_review`              | `info_requested` | insurer | motif                                                                                           |
| `info_requested`            | `submitted`      | center  | `submissionProblem`                                                                             |
| `info_requested`            | `cancelled`      | center  | motif                                                                                           |
| `granted`                   | `used`           | center  | aujourd'hui ≤ `valid_until`                                                                     |
| `granted`                   | `expired`        | system  | aujourd'hui > `valid_until` (déclenché par P3.5)                                                |
| `used`                      | `billed`         | system  | reprise dans une feuille de soins (déclenché par P4)                                            |

- Toute autre combinaison (statut, statut d'arrivée, acteur) est refusée (SC-001).
- Les lignes, le diagnostic et l'affiliation ne se modifient qu'en `draft` ou `info_requested`, par
  l'acteur `center`.
- Un motif est une chaîne non vide après `trim`, d'au plus 1 000 caractères.
