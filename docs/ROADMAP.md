# Roadmap

Feuille de route de la plateforme, du socle (fait) jusqu'à la V2. Elle découle du
[cahier des charges fonctionnel](https://claude.ai/artifact/A8xLFbjdbVGzi9LKHAx1Ss) et respecte
les règles de `CLAUDE.md` (tests d'abord, micro-commits, audit atomique, droits vérifiés côté
serveur).

## Comment utiliser ce fichier

- **Un item = une branche = une PR.** Les identifiants (`P2.3`, …) servent de nom de branche
  (`feat/p2-3-rendez-vous`) et de référence dans les messages de commit et les PR.
- Chaque item liste ses **dépendances**, ce qu'il **livre** (tables, routes, écrans) et ses
  **critères d'acceptation**. Un item n'est terminé que si chaque critère est couvert par un test.
- Cocher la case dans la PR qui livre l'item. Un item en cours porte `(en cours)`.
- Les phases se suivent, mais les items d'une même phase sans dépendance entre eux peuvent
  avancer en parallèle.
- Toute nouvelle permission va dans `packages/shared/src/roles.ts` (matrice unique), avec un
  test unitaire. Toute route qui modifie des données écrit son audit dans la même transaction.
- Une décision prise en cours de route (choix technique, règle métier) est ajoutée au
  [journal des décisions](#journal-des-décisions) en bas de ce fichier.

## Vue d'ensemble

| Phase | Objectif                                          | Statut    |
| ----- | ------------------------------------------------- | --------- |
| P0    | Socle technique                                   | Fait      |
| P1    | Comptes, organisations et référentiels            | À faire   |
| P2    | Patients et dossiers médicaux                     | En cours  |
| P3    | Prises en charge                                  | À faire   |
| P4    | Facturation et remboursements                     | À faire   |
| P5    | Tableaux de bord et statistiques                  | À faire   |
| P6    | Sécurité, exploitation et mise en production      | À faire   |
| P7    | V2 : patients, interconnexions, paiements, mobile | Plus tard |

La V1 utilisable par un premier centre pilote = P1 à P4 + les items P6 marqués **[pilote]**.

---

## P0 · Socle technique (fait)

- [x] **P0.1** Monorepo pnpm : `apps/api`, `apps/web`, `packages/shared` (PR #1)
- [x] **P0.2** Auth par sessions cookie (jeton haché), argon2, connexion à temps constant,
      limite de tentatives
- [x] **P0.3** Organisations, rôles par organisation, matrice de permissions partagée
- [x] **P0.4** Journal d'audit en ajout seul (triggers UPDATE, DELETE, TRUNCATE), écrit dans
      la transaction de l'action
- [x] **P0.5** docker-compose (PostgreSQL, API, web, Caddy), compose de dev, CI GitHub Actions

---

## P1 · Comptes, organisations et référentiels

Ce qu'il manque pour administrer la plateforme au quotidien.

- [ ] **P1.0 Design system shadcn/ui** (en cours)
  - Dépend de : P0
  - Livre : Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) dans `apps/web` (`components.json`,
    composants copiés dans `src/components/ui`), thème défini par des variables CSS (clair et
    sombre) ; les pages existantes (connexion, accueil, organisations) migrées vers les
    composants shadcn ; `styles.css` actuel supprimé.
  - Règles : utiliser un composant shadcn chaque fois qu'il en existe un (Button, Input, Form,
    Table, Dialog, Select, Calendar, Toast, …) avant d'écrire un composant maison ; les composants
    métier se construisent par composition dans `src/components`.
  - Acceptation : aucune couleur codée en dur hors des variables du thème ; la charte couleurs
    fournie par Gérald remplacera ces variables sans toucher aux composants.

- [ ] **P1.1 Gestion des comptes (super admin)**
  - Dépend de : P0
  - Livre : `PATCH /api/users/:id` (nom, téléphone, actif), `POST /api/users/:id/reset-password`
    (mot de passe provisoire), écran liste + fiche utilisateur.
  - Ajouter `users.phone`, `users.must_change_password`.
  - Acceptation : un compte désactivé ne peut plus se connecter et ses sessions sont supprimées ;
    chaque changement est audité (sans hash) ; un utilisateur avec mot de passe provisoire est
    forcé de le changer à la connexion suivante.

- [ ] **P1.2 Changement de mot de passe par l'utilisateur**
  - Dépend de : P1.1
  - Livre : `POST /api/auth/change-password` (ancien + nouveau), écran « Mon compte ».
  - Acceptation : l'ancien mot de passe est vérifié ; les autres sessions de l'utilisateur sont
    fermées ; règle de longueur minimale (12) dans `packages/shared`.

- [ ] **P1.3 Membres d'une organisation**
  - Dépend de : P0
  - Livre : `DELETE /api/organizations/:id/members/:membershipId`, écran « Membres » pour
    `center_admin` / `insurer_manager` (liste, ajout d'un compte existant, retrait).
  - Acceptation : une organisation garde toujours au moins un admin, quel que soit l'auteur du
    retrait (super admin compris) ; un admin d'un centre ne voit pas les membres d'un autre
    centre ; retrait audité.

- [ ] **P1.4 Organisation active dans l'interface**
  - Dépend de : P1.3
  - Livre : sélecteur d'organisation dans l'en-tête (mémorisé côté client), menus filtrés selon
    les permissions du rôle dans l'organisation active. Les routes API prennent l'organisation
    dans l'URL (`/api/organizations/:orgId/...`), jamais dans un en-tête implicite.
  - Acceptation : un utilisateur à deux organisations bascule sans se reconnecter ; un menu
    sans permission n'apparaît pas (et l'API répond 403 de toute façon).

- [ ] **P1.5 Référentiels**
  - Dépend de : P0
  - Livre : tables `medical_acts` (code, libellé, tarif de référence en MGA, soumis à accord
    par défaut), `drugs` (DCI, forme, dosage), `icd10_codes` (code, libellé FR) ; import CSV par
    le super admin (`POST /api/referentials/:kind/import`) ; recherche
    `GET /api/referentials/:kind?q=` utilisée par les formulaires.
  - Acceptation : import idempotent (upsert sur le code) ; recherche insensible aux accents
    (`unaccent` + index trigram) ; un import est audité avec le nombre de lignes.
  - Base : extensions `unaccent` et `pg_trgm` ; `unaccent()` n'étant pas `IMMUTABLE`, l'index
    passe par une fonction enveloppe immuable.
  - Note : la CIM-10 FR est diffusée par l'OMS / l'ATIH ; vérifier la licence avant d'en
    committer un extrait. Prévoir un petit jeu d'essai dans `apps/api/test/fixtures`.

- [ ] **P1.6 Contrats d'assurance (côté assureur)**
  - Dépend de : P1.5
  - Livre : table `insurance_plans` (assureur, nom du régime, taux de couverture par défaut,
    plafond annuel, ticket modérateur), CRUD sous une nouvelle permission
    `insurance_plan.manage` (rôle `insurer_manager`).
  - Acceptation : un assureur ne voit et ne modifie que ses propres régimes.

- [ ] **P1.7 Conventions centre ↔ assureur**
  - Dépend de : P1.5, P1.6
  - Livre : table `agreements` (centre, assureur, dates, taux par catégorie d'actes, actes
    soumis à accord préalable, tarifs conventionnés), proposition par l'assureur, acceptation
    par l'admin du centre.
  - Acceptation : une seule convention active par couple centre/assureur à une date donnée
    (contrainte d'exclusion sur la période, extension `btree_gist`) ; les deux parties voient
    la convention ; changement de statut audité.

- [ ] **P1.8 Consultation du journal d'audit**
  - Dépend de : P0
  - Livre : `GET /api/audit-logs` (filtres : organisation, acteur, entité, action, période ;
    pagination par curseur), écran pour le super admin et, limité à leur organisation, pour
    les admins.
  - Acceptation : un admin de centre ne voit que les entrées de son organisation ; aucun
    endpoint ne permet de modifier une entrée.

---

## P2 · Patients et dossiers médicaux (étape 3 du plan)

- [ ] **P2.1 Patients** (en cours)
  - Dépend de : P0
  - Livre : table `patients` (nom, prénoms, date de naissance, sexe, CIN facultatif, téléphone,
    adresse, région) ; `POST /api/organizations/:orgId/patients`,
    `GET /api/organizations/:orgId/patients?q=` (nom, CIN, téléphone),
    `GET/PATCH /api/organizations/:orgId/patients/:id` ; écrans liste/recherche et fiche.
  - Règles : le patient est partagé entre centres (dossier unique) ; un centre le voit dès qu'il
    a créé le patient, pris un rendez-vous ou fait une consultation pour lui (table
    `patient_center_links`). Détection de doublon probable (même nom + même date de naissance)
    avant création.
  - Acceptation : `reception` crée (`patient.create`) et modifie (nouvelle permission
    `patient.update`) l'administratif ; tout rôle ayant `patient.read_admin` le lit ; aucun
    rôle assureur n'accède à cette route ; chaque création et modification est auditée avec
    avant/après.

- [ ] **P2.2 Affiliations** (en cours)
  - Dépend de : P2.1, P1.6 (à défaut, régime saisi en texte libre puis migré)
  - Livre : table `affiliations` (patient, assureur, régime, numéro d'assuré, statut titulaire
    ou ayant droit, titulaire lié, employeur, début, fin) ; ajout par l'accueil
    (`patient.update`, l'affiliation fait partie de l'administratif), validation par
    l'assureur (`insured.manage`) ; `GET .../patients/:id/affiliations` ; la recherche de
    patients (P2.1) trouve aussi par numéro d'assuré.
  - Acceptation : une affiliation n'est « active » qu'entre ses dates et une fois validée ;
    un numéro d'assuré est unique par assureur ; l'assureur ne voit que les affiliations à
    son organisation, avec l'identité du patient mais sans contenu médical.

- [ ] **P2.3 Rendez-vous** (en cours)
  - Dépend de : P2.1
  - Livre : table `appointments` (patient, centre, médecin, début, durée, motif, statut :
    prévu, arrivé, annulé, absent, terminé) ; CRUD pour `appointment.manage` ; agenda du jour
    et de la semaine par médecin ; liste « mes rendez-vous » pour le médecin.
  - Acceptation : pas de chevauchement pour un même médecin (contrainte d'exclusion
    `tstzrange`, extension `btree_gist`) ; le médecin doit être membre du centre avec le rôle `doctor` ; un rendez-vous
    passé ne peut plus être déplacé, seulement clos.

- [ ] **P2.4 Consultations** (en cours)
  - Dépend de : P2.1, P2.3 (le rendez-vous est facultatif), P1.5 (CIM-10 ; à défaut, code
    saisi et validé sur son format, puis relié à `icd10_codes` par une migration)
  - Livre : tables `consultations` (patient, centre, médecin, rendez-vous, motif, examen,
    constantes en JSON typé, notes, `signed_at`), `diagnoses` (code CIM-10, principal ou
    secondaire) ; création et édition en brouillon, signature ; avenant après signature
    (`consultation_addenda`).
  - Acceptation : seul `medical_record.write` crée et signe ; une consultation signée est en
    lecture seule (vérifié par l'API et par un trigger) ; `medical_record.read` voit les
    consultations du patient dans tous les centres liés ; **chaque lecture** d'une consultation
    est auditée (`medical_record.read`).

- [ ] **P2.5 Prescriptions et délivrance**
  - Dépend de : P2.4, P1.5 (médicaments)
  - Livre : tables `prescriptions` (consultation, médicament, posologie, durée, quantité) et
    `dispensations` (prescription, quantité délivrée, pharmacien, date) ; écran pharmacie :
    ordonnances à délivrer du centre.
  - Acceptation : le pharmacien voit l'ordonnance mais pas le reste de la consultation ; la
    quantité délivrée cumulée ne dépasse pas la quantité prescrite.

- [ ] **P2.6 Documents**
  - Dépend de : P2.4 ; stockage Garage via S3 (voir journal des décisions)
  - Livre : interface `DocumentStorage` (put, get en flux, delete logique) avec un premier
    adaptateur ; table `documents` (patient, consultation ou demande, type, nom, taille, type
    MIME, empreinte SHA-256, clé de stockage) ; upload (taille max, types autorisés : PDF, JPEG,
    PNG), téléchargement via l'API (jamais d'URL publique).
  - Acceptation : un document hérite des droits de ce à quoi il est rattaché ; chaque
    téléchargement est audité ; le volume est inclus dans les sauvegardes (P6.3).

- [ ] **P2.7 Vue dossier patient**
  - Dépend de : P2.1 à P2.6
  - Livre : écran chronologique du patient (consultations, diagnostics, prescriptions,
    documents, rendez-vous), filtré selon les permissions ; impression d'un résumé.
  - Acceptation : un rôle sans `medical_record.read` voit l'onglet administratif uniquement.

---

## P3 · Prises en charge

Statuts : brouillon → soumise → en examen → accordée (totale ou partielle) / refusée /
complément demandé → (soumise) ; accordée → utilisée → facturée ; annulée et expirée.

- [ ] **P3.1 Modèle et machine à états**
  - Dépend de : P2.4, P1.7
  - Livre : tables `coverage_requests` (patient, affiliation, centre, assureur, diagnostic,
    montant estimé, montant accordé, part patient, date limite de validité, statut) et
    `coverage_request_items` (acte, quantité, tarif) ; `coverage_request_events` (historique de
    statut avec motif) ; fonction pure de transition dans `packages/shared` (table des
    transitions autorisées par statut et par rôle).
  - Acceptation : toute transition non prévue est refusée (test exhaustif de la table) ; chaque
    transition écrit un événement et un audit dans la même transaction.

- [ ] **P3.2 Création et soumission par le centre**
  - Dépend de : P3.1
  - Livre : écran de création depuis une consultation (actes pré-remplis, tarifs de la
    convention), pièces jointes (P2.6), soumission.
  - Acceptation : impossible sans affiliation active à la date ; montant estimé recalculé côté
    serveur à partir des tarifs, jamais pris du client.

- [ ] **P3.3 Décision par le médecin conseil**
  - Dépend de : P3.2
  - Livre : file des demandes de l'assureur (filtrable, triée par ancienneté), écran de décision
    (accord total, partiel avec montant, refus motivé, demande de complément).
  - Acceptation : le médecin conseil voit actes, diagnostic et pièces jointes de la demande,
    rien d'autre du dossier ; un refus exige un motif.

- [ ] **P3.4 Notifications in-app**
  - Dépend de : P3.3
  - Livre : table `notifications` (destinataire organisation ou utilisateur, type, lien, lu),
    pastille dans l'en-tête, page « Notifications ».
  - Acceptation : le centre est notifié d'une décision, l'assureur d'une soumission.
  - Plus tard : e-mail et SMS (P6.8).

- [ ] **P3.5 Expiration et annulation**
  - Dépend de : P3.3
  - Livre : tâche planifiée (au démarrage + toutes les heures, verrou consultatif PostgreSQL)
    qui passe en « expirée » les accords non utilisés après leur date limite ; annulation par le
    centre avant décision.
  - Acceptation : l'expiration est idempotente et auditée avec un acteur système.

- [ ] **P3.6 Bon de prise en charge PDF**
  - Dépend de : P3.3
  - Livre : génération PDF du bon (formulaire type du cahier des charges), avec numéro et
    QR code de vérification (`GET /api/verify/coverage/:token` qui confirme validité et
    statut sans données médicales).
  - Acceptation : le PDF reflète l'état au moment de la génération ; le QR code d'un bon
    expiré renvoie « expiré ».

---

## P4 · Facturation et remboursements

- [ ] **P4.1 Feuilles de soins**
  - Dépend de : P2.4, P2.5, P1.7
  - Livre : table `care_sheets` + lignes (acte ou médicament, quantité, prix conventionné, part
    assureur, part patient), créée depuis une consultation et ses délivrances, liée à une prise
    en charge si l'acte l'exige.
  - Acceptation : calcul des parts côté serveur selon la convention et le régime ; une ligne
    soumise à accord sans prise en charge accordée est bloquée.

- [ ] **P4.2 Factures (bordereaux)**
  - Dépend de : P4.1
  - Livre : tables `invoices` + `invoice_lines` ; regroupement des feuilles de soins d'une
    période par assureur ; statuts : brouillon, envoyée, en contrôle, validée, partiellement
    validée, contestée, payée ; PDF du bordereau.
  - Acceptation : une feuille de soins ne figure que dans une facture ; montants en ariary
    stockés en entiers ; une facture envoyée n'est plus modifiable.

- [ ] **P4.3 Contrôle par l'assureur**
  - Dépend de : P4.2
  - Livre : écran du comptable assureur : acceptation ou rejet motivé ligne par ligne, total
    accepté.
  - Acceptation : chaque rejet a un motif d'une liste (`packages/shared`) + commentaire.

- [ ] **P4.4 Contestation**
  - Dépend de : P4.3
  - Livre : le centre conteste une ligne rejetée avec justificatif ; l'assureur rouvre ou
    confirme.
  - Acceptation : historique complet de la ligne visible des deux côtés.

- [ ] **P4.5 Paiements**
  - Dépend de : P4.3
  - Livre : table `payments` (facture, montant, date, mode : virement, chèque, mobile money,
    référence) ; une facture passe « payée » quand la somme des paiements atteint le total
    accepté.
  - Acceptation : les paiements partiels sont gérés ; aucun paiement au-delà du total accepté.

- [ ] **P4.6 Plafonds et consommation**
  - Dépend de : P4.3, P1.6
  - Livre : suivi de la consommation annuelle par affiliation ; alerte quand le plafond est
    proche ; blocage des nouvelles prises en charge au-delà.
  - Acceptation : la consommation est recalculée de façon déterministe depuis les lignes
    acceptées (pas de compteur modifié à la main).

---

## P5 · Tableaux de bord et statistiques

- [ ] **P5.1 Tableau de bord centre** : rendez-vous du jour, consultations de la semaine,
      prises en charge en attente, factures impayées et délai moyen de paiement.
- [ ] **P5.2 Tableau de bord assureur** : demandes à traiter, délai moyen de décision, taux
      d'accord, montants engagés et payés par centre.
- [ ] **P5.3 Suivi des maladies** : nombre de diagnostics par code CIM-10 (chapitre et code),
      par région et par semaine ; données agrégées uniquement, seuil minimal d'effectif
      (pas de case < 5) pour éviter la réidentification.
- [ ] **P5.4 Exports** : CSV des tableaux ci-dessus, audités.
  - Acceptation commune : chaque tableau ne montre que les données de l'organisation active ;
    les requêtes lourdes passent par des vues matérialisées rafraîchies périodiquement.

---

## P6 · Sécurité, exploitation et mise en production

- [ ] **P6.1 Double authentification (TOTP)** **[pilote]** : obligatoire pour les rôles
      médicaux et assureurs, codes de secours, réinitialisation par le super admin (auditée).
- [ ] **P6.2 En-têtes et politique de sécurité** **[pilote]** : CSP stricte servie par Caddy,
      cookies `SameSite=Strict` si possible, protection CSRF (jeton ou vérification d'origine
      sur les méthodes non sûres), expiration de session à l'inactivité.
- [ ] **P6.3 Sauvegardes** **[pilote]** : service `backup` dans docker-compose (pg_dump
      quotidien chiffré + volume documents), rotation, procédure de restauration testée et
      documentée dans `docs/exploitation.md`.
- [ ] **P6.4 Supervision** **[pilote]** : logs JSON centralisés, endpoint de métriques,
      alerte si l'API ou la base tombe, suivi de l'espace disque.
- [ ] **P6.5 Données personnelles** **[pilote]** : revue de conformité à la loi n°2014-038
      (à faire valider par un juriste), registre des traitements, export des données d'un
      patient, politique de conservation.
- [ ] **P6.6 Langue malgache** : textes de l'interface externalisés (i18n), traduction
      malgache, choix de la langue par utilisateur.
- [ ] **P6.7 Performance et connectivité** : budget de poids des pages pour la 3G, tests de
      charge sur les recherches patients et les files de demandes, étude d'un mode hors ligne
      pour l'accueil.
- [ ] **P6.8 Notifications externes** : e-mail (SMTP) et SMS (passerelle locale à choisir)
      pour les décisions de prise en charge et les rendez-vous.
- [ ] **P6.9 Déploiement** **[pilote]** : images publiées sur GitHub Container Registry par la
      CI, docker-compose de production qui les tire au lieu de builder, procédure de mise à jour
      sans perte (migrations au démarrage, retour arrière documenté).
- [ ] **P6.10 Tests de bout en bout** : Playwright sur les parcours clés (rendez-vous →
      consultation → prise en charge → facture → paiement), lancés en CI sur docker-compose.

---

## P7 · V2 (après le pilote)

- [ ] **P7.1 Portail patient** : consultation de son dossier, de ses droits et de ses
      remboursements, prise de rendez-vous en ligne.
- [ ] **P7.2 API pour les assureurs** : échange avec les systèmes existants (import des
      assurés, export des décisions), authentification par clé ou OAuth client credentials.
- [ ] **P7.3 Paiement mobile money** : encaissement du ticket modérateur et remboursements.
- [ ] **P7.4 Application mobile** : PWA ou application native pour les médecins et l'accueil.
- [ ] **P7.5 Statistiques avancées** : indicateurs épidémiologiques, export vers les autorités
      sanitaires.

---

## Questions ouvertes

Reprises du cahier des charges ; chaque réponse va dans le journal des décisions.

- Un patient peut-il avoir plusieurs assureurs en même temps ? (Hypothèse : oui, une
  affiliation principale.)
- Le dossier médical est-il partagé entre centres ? (Hypothèse V1 : oui, accès tracé.)
- Les pharmacies hors centre sont-elles des organisations ? (Hypothèse V1 : non.)
- Le ticket modérateur est-il encaissé via la plateforme ? (Hypothèse : calculé et affiché
  seulement.)
- Quel délai maximal de réponse de l'assureur pour une demande urgente ?
- Obtenir un vrai bon de prise en charge et une vraie feuille de soins pour valider les
  formulaires.

## Journal des décisions

| Date       | Décision                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-24 | Stack : TypeScript, Fastify, Drizzle, PostgreSQL 16, React + Vite, auto-hébergement docker-compose + Caddy.                                 |
| 2026-10-24 | MinIO abandonné (images Docker plus publiées). Stockage des documents à choisir avant P2.6.                                                 |
| 2026-10-24 | Seul le super admin crée les comptes ; les admins d'organisation rattachent des comptes existants (revue PR #1).                            |
| 2026-10-24 | Les routes métier prennent l'organisation dans l'URL (`/api/organizations/:orgId/...`) pour que chaque contrôle d'accès soit explicite.     |
| 2026-10-24 | Interface : shadcn/ui autant que possible (Tailwind, variables CSS de thème) ; charte couleurs à venir.                                     |
| 2026-10-24 | Déploiement : une instance centrale unique (API + PostgreSQL avec réplique de secours) ; les centres et filiales y accèdent par navigateur. |
| 2026-10-24 | Documents : interface `DocumentStorage` sur l'API S3, avec Garage auto-hébergé (plusieurs nœuds pour la redondance en production).          |
