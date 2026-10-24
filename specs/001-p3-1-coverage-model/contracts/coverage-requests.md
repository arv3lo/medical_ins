# Contrat HTTP : demandes de prise en charge (P3.1)

Conventions du projet :

- session par cookie ;
- l'organisation est toujours dans l'URL ;
- corps JSON, validé par des schémas zod partagés (`packages/shared`) ;
- messages d'erreur en français, au format `{ message, …details }`.

Codes de réponse communs :

| Code | Quand                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | corps invalide, ou condition non remplie (affiliation inactive, montant hors bornes, motif manquant…)                                          |
| 401  | pas de session                                                                                                                                 |
| 403  | pas la permission dans l'organisation de l'URL                                                                                                 |
| 404  | demande, patient, affiliation, acte ou code introuvable, ou appartenant à une autre organisation ; demande jamais soumise, vue par un assureur |
| 409  | transition impossible depuis le statut actuel, y compris après une transition concurrente                                                      |

Chaque écriture répond avec les identifiants seulement ; le client relit par le GET, qui audite la
lecture.

## Référentiel d'actes

`GET /api/referentials/medical-acts?q=` : tout utilisateur connecté.

- Réponse 200 : `[{ code, label, referencePrice }]`, au plus 50 résultats.
- Recherche sur le code ou le libellé, insensible à la casse ; `q` est échappé pour `LIKE`.

## Créer un brouillon (centre)

`POST /api/organizations/:orgId/coverage-requests`

- Permission : `coverage_request.create` dans `:orgId`, qui doit être un centre de santé.
- Corps :

  ```json
  {
    "patientId": "uuid",
    "affiliationId": "uuid",
    "diagnosisCode": "B54",
    "items": [{ "actCode": "CONS-GEN", "quantity": 1, "unitPrice": 15000 }]
  }
  ```

  - `items` : de 1 à 30 lignes ; `quantity` est un entier de 1 à 100 ;
  - `unitPrice` est facultatif (le tarif de référence par défaut) ; s'il est fourni, c'est un
    entier de 1 à 20 000 000 ;
  - le montant estimé ne dépasse pas 2 000 000 000 Ar, sinon 400 (les montants sont stockés en
    entiers 32 bits).

- Règles :
  - le patient est rattaché au centre ;
  - l'affiliation appartient au patient (sinon 404) ;
  - `insurerId` est posé par le serveur depuis l'affiliation ;
  - `estimatedAmount` est calculé par le serveur.
- Réponse : 201 `{ "id": "uuid" }`.
- Audit : `coverage_request.create`, avec `{ patientId, affiliationId, insurerId }`.
- Historique : un événement `null → draft`.

## Modifier (centre, `draft` ou `info_requested`)

`PATCH /api/organizations/:orgId/coverage-requests/:id`

- Permission : `coverage_request.create` ; la demande appartient au centre `:orgId`.
- Corps : sous-ensemble de `{ affiliationId, diagnosisCode, items }`, au moins un champ. `items`
  remplace toutes les lignes.
- Réponse : 200 `{ "id": "uuid" }` ; 409 si le statut n'est ni `draft` ni `info_requested`.
- Audit : `coverage_request.update`, avec `{ fields: [...] }`.

## Transition

`POST /api/organizations/:orgId/coverage-requests/:id/transitions`

- Corps :

  ```json
  { "to": "granted", "reason": "…", "grantedAmount": 50000, "validUntil": "2026-11-30" }
  ```

  `reason`, `grantedAmount` et `validUntil` sont exigés selon la table de transitions
  (`data-model.md`).

- Acteur :
  - `center` si l'appelant a `coverage_request.create` dans `:orgId` et que la demande est de ce
    centre ;
  - `insurer` s'il a `coverage_request.decide` dans `:orgId` et que la demande est adressée à cet
    assureur (et lui a été soumise au moins une fois) ;
  - l'acteur `system` n'est jamais accepté ici.
- Traitement :
  1. verrou sur la demande ;
  2. `canTransition` et les conditions partagées ;
  3. mise à jour ;
  4. événement d'historique ;
  5. audit.

  Les étapes 3 à 5 se font dans une seule transaction.

- Réponse : 200 `{ "id": "uuid", "status": "granted" }`.
- Audit : `coverage_request.<to>`, avec `{ from, to }` ; plus `{ grantedAmount, validUntil }` pour
  un accord. Jamais le motif.

## Lire une demande

`GET /api/organizations/:orgId/coverage-requests/:id`

- **Centre** (`coverage_request.create`) :

  ```json
  {
    "id": "…",
    "status": "…",
    "center": { "id": "…", "name": "…" },
    "insurer": { "id": "…", "name": "…" },
    "patient": {
      "id": "…",
      "lastName": "…",
      "firstNames": "…",
      "birthDate": "…",
      "nationalId": "…"
    },
    "affiliation": {
      "id": "…",
      "memberNumber": "…",
      "holderStatus": "…",
      "planName": "…",
      "startsOn": "…",
      "endsOn": null,
      "status": "validated"
    },
    "diagnosis": { "code": "B54", "label": "Paludisme, sans précision" },
    "items": [
      { "actCode": "…", "actLabel": "…", "quantity": 1, "unitPrice": 15000, "lineAmount": 15000 }
    ],
    "estimatedAmount": 15000,
    "grantedAmount": null,
    "patientShare": null,
    "validUntil": null,
    "createdBy": { "fullName": "…" },
    "createdAt": "…",
    "updatedAt": "…",
    "events": [
      {
        "fromStatus": null,
        "toStatus": "draft",
        "actor": { "fullName": "…" },
        "reason": null,
        "createdAt": "…"
      }
    ]
  }
  ```

- **Assureur** (`coverage_request.decide`) : la même forme. Tout ce qu'elle contient sert la décision
  (FR-012), y compris le nom du médecin demandeur. Elle est sélectionnée colonne par colonne,
  jamais par une table entière. 404 sur une demande jamais soumise (brouillon, ou brouillon annulé).
- Audit : `medical_record.read` (`entityType: 'coverage_request'`), dans la même transaction que
  la lecture.

## Lister

`GET /api/organizations/:orgId/coverage-requests?status=&patientId=&offset=`

- **Centre** : les demandes du centre. **Assureur** : celles qui lui ont été soumises au
  moins une fois, quel que soit leur statut actuel.
- Réponse : une liste de demandes, de la même forme des deux côtés, sans diagnostic ni lignes :
  `id`, `status`, `estimatedAmount`, `grantedAmount`, `validUntil`, `updatedAt`, plus
  `patient: { lastName, firstNames }`, `center: { name }` et `insurer: { name }`. Pages de 50,
  triées par `updatedAt` décroissant.
- Audit : `medical_record.read` (`entityType: 'coverage_request'`), avec `{ coverageRequestIds }`
  (FR-013).
