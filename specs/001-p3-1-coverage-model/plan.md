# Plan d'implémentation : P3.1 Modèle et machine à états des demandes de prise en charge

**Branche** : `feat/p3-1-coverage-model` | **Date** : 2026-10-24 | **Spec** : [spec.md](spec.md)

**Entrée** : spécification de `specs/001-p3-1-coverage-model/spec.md`, clarifiée le 2026-10-24
(Q1 : B, Q2 : A, Q3 : A).

## Résumé

P3.1 livre :

- le modèle des demandes de prise en charge : demande, lignes d'actes, historique en ajout seul ;
- un référentiel d'actes de départ ;
- la règle des transitions, partagée entre l'API et le web ;
- les opérations serveur (création, modification, transition, lectures), sans écran.

Approche (détails dans [research.md](research.md)) :

- une table de transitions pure dans `packages/shared`, avec des fonctions de condition, testée de
  façon exhaustive ;
- un module API `coverage-requests` dont chaque écriture verrouille la demande
  (`SELECT … FOR UPDATE`), puis écrit la mise à jour, l'événement d'historique et l'audit (ids
  seulement) dans une seule transaction ;
- des invariants de montants et l'historique en ajout seul tenus aussi par la base (CHECK,
  trigger).

## Contexte technique

- **Langage / version** : TypeScript strict, ESM ; Node 22.9+.
- **Dépendances principales** : Fastify 5, Drizzle ORM (drizzle-kit pour les migrations), zod
  (schémas partagés). Aucune nouvelle dépendance.
- **Stockage** : PostgreSQL 16. Trois tables, une énumération, deux migrations personnalisées
  (trigger d'historique, jeu d'actes) ; prochaines migrations à partir de `0013`.
- **Tests** :
  - Vitest ;
  - tests unitaires de la règle dans `packages/shared` ;
  - tests d'intégration de l'API (`apps/api/test`, Fastify `inject` contre un vrai PostgreSQL).
- **Plateforme cible** : serveur Linux (docker-compose + Caddy), une instance centrale.
- **Type de projet** : service web d'un monorepo (`apps/api`, `apps/web`, `packages/shared`). P3.1
  ne touche pas `apps/web`, sauf si un type partagé l'exige.
- **Objectifs de performance** : listes paginées par 50. Lecture d'une demande en une requête plus
  ses lignes et son historique. Pas d'objectif chiffré au-delà des usages actuels.
- **Contraintes** :
  - ariary entiers ;
  - « aujourd'hui » à Madagascar ;
  - aucun contenu médical dans l'audit ;
  - accès vérifié côté serveur ;
  - fichiers de moins de ~500 lignes.
- **Volume** : quelques centres et assureurs pilotes, au plus des milliers de demandes par mois.
  Les index de `data-model.md` suffisent.

## Vérification de la constitution

_Gate : avant la phase 0, puis à nouveau après la phase 1._

| Principe                                | Comment le plan le respecte                                                                                                                                                                        | Statut |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Audit atomique, sans contenu médical | Audit dans la transaction de chaque écriture et de chaque lecture. Payloads `{ from, to }`, `{ fields }`, montants et ids seulement. Test par textes repérables (SC-002)                           | ✅     |
| II. Accès vérifié côté serveur          | `requirePermission` avec `coverage_request.create` / `.decide`, organisation dans l'URL, 404 entre organisations. Acteur `system` inaccessible en HTTP. Super admin à `false` pour ces permissions | ✅     |
| III. Contenu médical aux rôles de soin  | Centre : médecins seulement (Q3 : A). Assureur : projection explicite, brouillons invisibles, rien du dossier                                                                                      | ✅     |
| IV. Tests d'abord                       | Chaque tâche commence par un test vu en échec : table exhaustive, conditions, routes, course déterministe, audit                                                                                   | ✅     |
| V. Intégrité en concurrence             | Verrou `FOR UPDATE` par demande, CHECK sur les montants, trigger d'ajout seul sur l'historique, ariary entiers, `today()` Madagascar                                                               | ✅     |
| VI. Simplicité, une place par règle     | Une table de transitions partagée, une route de transition, réutilisation de `isAffiliationActive`, `requireLinkedPatient`, `escapeLike`, `audit`                                                  | ✅     |

Aucune violation : pas de tableau de complexité.

**Après la phase 1** : le modèle, le contrat et le guide de validation ne changent aucune ligne du
tableau. ✅

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/001-p3-1-coverage-model/
├── spec.md
├── plan.md              # ce fichier
├── research.md          # phase 0
├── data-model.md        # phase 1
├── quickstart.md        # phase 1
├── contracts/
│   └── coverage-requests.md
├── checklists/
│   └── requirements.md
└── tasks.md             # phase 2 (/speckit-tasks, pas encore créé)
```

### Code source

```text
packages/shared/src/
├── schemas/coverage-requests.ts        # statuts, libellés, TRANSITIONS, canTransition,
│                                       # submissionProblem, grantProblem, schémas zod des entrées
├── schemas/coverage-requests.test.ts   # test exhaustif + conditions
└── index.ts                            # export

apps/api/src/
├── db/schema.ts                        # medical_acts, coverage_requests, coverage_request_items,
│                                       # coverage_request_events, énumération
├── modules/coverage-requests/
│   ├── routes.ts                       # 5 routes + référentiel d'actes, minces
│   ├── service.ts                      # lecture/verrou, création, modification, projections
│   └── transitions.ts                  # application d'une transition (verrou → règle → écritures)
└── app.ts                              # enregistrement des routes

apps/api/drizzle/
├── 0013_coverage_requests.sql          # généré
├── 0014_coverage_request_events_append_only.sql   # personnalisé (trigger)
└── 0015_medical_acts_starter.sql       # personnalisé (jeu d'actes, tarifs indicatifs)

apps/api/test/
├── coverage-requests.test.ts           # création, modification, lectures, visibilité
├── coverage-request-transitions.test.ts # chaque transition, conditions, course, historique, audit
└── helpers.ts                          # resetDb vide les nouvelles tables
```

**Choix de structure** : le monorepo existant, avec un module API par domaine
(`apps/api/src/modules/*`), comme `consultations` et `appointments`. Les transitions ont leur propre
fichier pour garder `service.ts` sous ~500 lignes.

## Hors périmètre (rappel)

- Écrans de création, de soumission et de décision : P3.2 et P3.3.
- Notifications : P3.4.
- Expiration automatique : P3.5 ; seule la transition `system` est définie ici.
- Bon PDF : P3.6.
- Pièces jointes : P2.6.
- Tarifs conventionnés : P1.7.
- Référentiel complet : P1.5.
- Accès de la facturation : P4.

## À faire en passant (commits séparés)

- `docs:` corriger, dans `apps/api/src/db/schema.ts`, les numéros de migration cités par deux
  commentaires (0006 → 0009, 0008 → 0011).
- `docs:` ajouter aux questions ouvertes de la roadmap : « valider les tarifs indicatifs du jeu
  d'actes de départ avant la mise en production ».
