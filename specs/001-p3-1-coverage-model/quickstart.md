# Validation rapide : P3.1

Ce guide montre comment vérifier que P3.1 tient ses critères. Le détail des routes est dans
[`contracts/coverage-requests.md`](contracts/coverage-requests.md), celui des tables dans
[`data-model.md`](data-model.md).

## Prérequis

- Les dépendances sont installées sur un disque ext4 : le disque NTFS du dépôt casse
  `pnpm install`.
- Une base de test jetable, jamais 5432 ni 5433 :

  ```sh
  docker run -d --name medins-test-pg -e POSTGRES_USER=medins -e POSTGRES_PASSWORD=medins \
    -e POSTGRES_DB=medins_test -p 5442:5432 postgres:16-alpine
  export TEST_DATABASE_URL=postgres://medins:medins@localhost:5442/medins_test
  ```

## Vérifications automatiques

```sh
pnpm --filter @medical-ins/shared test   # règle des transitions, test exhaustif (SC-001)
pnpm --filter @medical-ins/api test      # opérations, audit, concurrence (SC-002 à SC-005)
pnpm lint && pnpm typecheck && pnpm build
```

Résultats attendus :

| Critère | Test qui le prouve                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001  | test partagé qui parcourt statuts × statuts × acteurs et compare à la table de `data-model.md`                                         |
| SC-002  | test API qui fait toutes les transitions avec un diagnostic et des libellés repérables, puis cherche ces textes dans tout `audit_logs` |
| SC-003  | test API de course : verrou tenu par le test, deux décisions, une seule réussit                                                        |
| SC-004  | test API : après chaque scénario, le dernier événement de l'historique redonne le statut                                               |
| SC-005  | test API : `estimatedAmount` et `patientShare` égaux au recalcul depuis les lignes                                                     |

## Parcours manuel (API seule, pas d'écran en P3.1)

Prérequis du parcours : un centre avec un médecin, un assureur avec un médecin conseil, un patient
rattaché au centre et une affiliation validée.

1. Le médecin crée un brouillon (`POST …/coverage-requests`) avec deux lignes. Le GET montre le
   montant estimé égal à la somme des lignes et un événement `draft`.
2. Il soumet (`POST …/transitions`, `{ "to": "submitted" }`). Avec une affiliation en attente, la
   réponse est 400 et un message en français.
3. Le médecin conseil prend en examen (`{ "to": "under_review" }`), puis accorde partiellement avec
   un motif. Le GET côté assureur montre la part patient et ne contient aucune autre donnée du
   dossier.
4. Le médecin marque la demande utilisée. Avec `validUntil` dépassé, la réponse est 400.
5. Dans `audit_logs`, chaque étape a son entrée, sans diagnostic, libellé ni motif.
