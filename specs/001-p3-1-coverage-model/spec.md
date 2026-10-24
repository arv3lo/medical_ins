# Spécification : P3.1 Modèle et machine à états des demandes de prise en charge

**Branche** : `feat/p3-1-coverage-model`

**Créée le** : 2026-10-24

**Statut** : brouillon (clarifications du 2026-10-24 intégrées)

**Origine** : item P3.1 de `docs/ROADMAP.md`. Une demande de prise en charge (accord préalable) relie un
patient, son affiliation, le centre demandeur, l'assureur, un diagnostic et des lignes d'actes. Elle
suit un cycle de statuts dont chaque transition est autorisée selon le statut et le rôle,
historisée avec son motif et auditée. P3.1 livre le modèle et la machine à états. Les écrans
(P3.2 et P3.3), les notifications (P3.4), l'expiration automatique (P3.5) et le bon PDF (P3.6)
viennent ensuite.

## Scénarios utilisateur et tests _(obligatoire)_

### Récit 1 : Le cycle de vie d'une demande ne suit que les transitions prévues (priorité P1)

Une demande passe par une suite de statuts : brouillon, soumise, en examen, accordée (totale ou
partielle), refusée, complément demandé, utilisée, facturée, annulée et expirée. À chaque statut,
seules certaines transitions sont possibles, et chacune seulement pour un rôle donné. Tout le
reste est refusé.

**Pourquoi cette priorité** : c'est le socle de P3. Un accord donné à tort, ou une demande
modifiée après décision, engage de l'argent et la responsabilité de l'assureur.

**Test indépendant** : énumérer chaque couple (statut, transition, rôle) et vérifier que seuls ceux
du tableau des transitions (FR-004) sont acceptés.

**Scénarios d'acceptation** :

1. **Étant donné** une demande « soumise », **quand** le médecin conseil de l'assureur destinataire
   la prend en examen, **alors** elle passe « en examen ».
2. **Étant donné** une demande « soumise », **quand** un médecin du centre tente de l'accorder,
   **alors** l'action est refusée et le statut ne change pas.
3. **Étant donné** une demande « refusée », **quand** quiconque tente une transition, **alors**
   elle est refusée : le refus est définitif.
4. **Étant donné** une demande « en examen », **quand** le médecin conseil d'un autre assureur
   tente de la décider, **alors** elle est introuvable pour lui.

---

### Récit 2 : Le centre prépare puis soumet une demande (priorité P1)

Un médecin du centre crée une demande en brouillon pour un patient affilié. Il y renseigne le
diagnostic et les actes demandés (acte, quantité, tarif), puis la soumet à l'assureur de
l'affiliation. Le montant estimé est toujours la somme des lignes.

**Pourquoi cette priorité** : sans demande soumise, il n'y a rien à décider.

**Test indépendant** : créer un brouillon, ajouter des lignes, le soumettre, puis vérifier son
statut, son montant estimé et son historique.

**Scénarios d'acceptation** :

1. **Étant donné** un patient avec une affiliation active aujourd'hui, **quand** le médecin soumet
   un brouillon complet (diagnostic principal et au moins une ligne d'acte), **alors** la demande
   passe « soumise » et l'historique enregistre la soumission.
2. **Étant donné** une affiliation en attente, refusée, retirée ou hors de ses dates, **quand** le
   médecin soumet, **alors** la soumission est refusée avec un message qui en donne la raison.
3. **Étant donné** des lignes de 2 × 15 000 Ar et 1 × 40 000 Ar, **quand** la demande est
   enregistrée, **alors** le montant estimé vaut 70 000 Ar, quel que soit le montant envoyé par
   le client.
4. **Étant donné** une demande soumise, **quand** le médecin tente d'en modifier les lignes,
   **alors** la modification est refusée : seul un brouillon ou une demande en « complément
   demandé » se modifie.

---

### Récit 3 : Le médecin conseil décide (priorité P1)

Le médecin conseil de l'assureur prend en examen une demande soumise. Il l'accorde en totalité ou
en partie (avec un montant accordé et une date limite de validité), la refuse avec un motif, ou
demande un complément avec un motif. Il ne voit que ce que la décision exige.

**Pourquoi cette priorité** : la décision est la raison d'être de la demande.

**Test indépendant** : faire passer une demande soumise par chaque décision, puis vérifier le
statut, les montants, la date limite, le motif et ce que voit le médecin conseil.

**Scénarios d'acceptation** :

1. **Étant donné** une demande en examen de 70 000 Ar, **quand** elle est accordée pour
   70 000 Ar, **alors** elle est « accordée » totalement et la part patient vaut 0 Ar.
2. **Étant donné** la même demande, **quand** elle est accordée pour 50 000 Ar avec un motif,
   **alors** elle est « accordée » partiellement et la part patient vaut 20 000 Ar.
3. **Étant donné** une décision de refus ou de demande de complément sans motif, **quand** elle
   est envoyée, **alors** elle est refusée.
4. **Étant donné** un montant accordé supérieur au montant estimé, nul ou négatif, **quand** il
   est envoyé, **alors** il est refusé.
5. **Étant donné** une demande en examen, **quand** le médecin conseil la consulte, **alors** il
   voit l'identité du patient, l'affiliation, le diagnostic, les lignes d'actes, les montants et
   l'historique, et rien d'autre du dossier médical (ni consultations, ni notes, ni autres
   demandes d'autres assureurs).

---

### Récit 4 : Complément, nouvelle soumission, annulation, utilisation (priorité P2)

Le centre répond à une demande de complément en modifiant la demande et en la soumettant à
nouveau. Il peut aussi annuler une demande avant la décision. Une fois l'acte réalisé, il marque
l'accord comme utilisé, avant la date limite de validité.

**Pourquoi cette priorité** : ces cas complètent le cycle, mais les récits 1 à 3 apportent déjà de
la valeur sans eux.

**Test indépendant** : parcourir complément → nouvelle soumission → accord → utilisation, puis
brouillon → annulation, et vérifier l'historique.

**Scénarios d'acceptation** :

1. **Étant donné** une demande en « complément demandé », **quand** le médecin la modifie et la
   soumet, **alors** elle redevient « soumise » et l'historique garde les deux soumissions.
2. **Étant donné** une demande soumise ou en examen, **quand** le centre l'annule avec un motif,
   **alors** elle passe « annulée », définitivement.
3. **Étant donné** une demande accordée dont la date limite n'est pas dépassée, **quand** le
   médecin la marque utilisée, **alors** elle passe « utilisée ».
4. **Étant donné** une demande accordée dont la date limite est dépassée, **quand** le médecin la
   marque utilisée, **alors** l'action est refusée : la demande est expirée de fait, et P3.5
   l'expirera.

---

### Récit 5 : Historique et audit de chaque transition (priorité P1)

Chaque transition est enregistrée dans l'historique de la demande : ancien et nouveau statut,
auteur, date et motif. Elle écrit aussi une entrée d'audit, dans la même opération. L'audit ne
contient aucun contenu médical.

**Pourquoi cette priorité** : la traçabilité est une règle du projet (constitution, principe I).
Elle sert aussi en cas de litige entre centre et assureur.

**Test indépendant** : faire une transition qui échoue à mi-parcours et vérifier que ni le statut,
ni l'historique, ni l'audit n'ont changé. Faire une transition qui réussit et vérifier que les
trois ont changé ensemble.

**Scénarios d'acceptation** :

1. **Étant donné** une transition réussie, **quand** on lit l'historique, **alors** elle y figure
   avec son auteur, sa date et son motif.
2. **Étant donné** un diagnostic et des libellés d'actes repérables, **quand** on parcourt toutes
   les entrées d'audit, **alors** aucun de ces textes n'y apparaît. Seuls les identifiants, les
   statuts et les montants y figurent.
3. **Étant donné** deux décisions envoyées en même temps sur la même demande, **quand** elles sont
   traitées, **alors** une seule réussit, et l'autre est refusée parce que le statut a changé.

---

### Cas limites

- Deux transitions concurrentes sur la même demande (deux médecins conseils, ou une décision et
  une annulation) : une seule réussit, l'autre est refusée sans rien modifier.
- L'affiliation est retirée ou expire entre la soumission et la décision : la décision reste
  possible, et le médecin conseil voit le statut actuel de l'affiliation.
- Le patient a plusieurs affiliations : la demande en désigne une seule, et l'assureur
  destinataire est celui de cette affiliation.
- Une demande sans ligne d'acte ou sans diagnostic principal ne peut pas être soumise.
- Montants : ariary entiers, sans décimales. Quantité entière ≥ 1. Tarif unitaire > 0.
- Un médecin quitte le centre : ses demandes restent visibles pour le centre, avec leur
  historique.
- Le super admin seul n'a accès à aucune demande, puisqu'elles contiennent un diagnostic (liste
  des droits du super admin, constitution, principe II).

## Exigences _(obligatoire)_

### Exigences fonctionnelles

- **FR-001** : Une demande DOIT relier un patient, une de ses affiliations, le centre demandeur,
  l'assureur de cette affiliation, un diagnostic principal (code CIM-10 existant), une ou plusieurs
  lignes d'actes, le montant estimé, le montant accordé, la part patient, la date limite de
  validité et le statut.
- **FR-002** : Le montant estimé DOIT être recalculé par le serveur à partir des lignes
  (quantité × tarif). Il n'est jamais repris du client.
- **FR-003** : Les statuts sont : brouillon, soumise, en examen, accordée, refusée, complément
  demandé, utilisée, facturée, annulée, expirée. Refusée, annulée, expirée et facturée sont
  définitifs.
- **FR-004** : Les transitions autorisées DOIVENT être exactement celles de ce tableau. Toute
  autre est refusée.

  | De                 | Vers               | Qui                                        | Conditions                                                                  |
  | ------------------ | ------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
  | (aucun)            | brouillon          | médecin du centre                          | patient rattaché au centre                                                  |
  | brouillon          | soumise            | médecin du centre                          | affiliation active aujourd'hui ; diagnostic principal ; ≥ 1 ligne           |
  | brouillon          | annulée            | médecin du centre                          | —                                                                           |
  | soumise            | en examen          | médecin conseil de l'assureur destinataire | —                                                                           |
  | soumise, en examen | annulée            | médecin du centre                          | motif obligatoire                                                           |
  | en examen          | accordée           | médecin conseil                            | 0 < montant accordé ≤ estimé ; date limite ≥ aujourd'hui ; motif si partiel |
  | en examen          | refusée            | médecin conseil                            | motif obligatoire                                                           |
  | en examen          | complément demandé | médecin conseil                            | motif obligatoire                                                           |
  | complément demandé | soumise            | médecin du centre                          | mêmes conditions que la première soumission                                 |
  | complément demandé | annulée            | médecin du centre                          | motif obligatoire                                                           |
  | accordée           | utilisée           | médecin du centre                          | date limite non dépassée                                                    |
  | accordée           | expirée            | système (P3.5)                             | date limite dépassée                                                        |
  | utilisée           | facturée           | système (P4)                               | demande reprise dans une feuille de soins                                   |

- **FR-005** : La règle des transitions DOIT être définie à un seul endroit, partagé par le serveur
  et l'interface. Un test exhaustif DOIT couvrir chaque couple (statut, transition, rôle).
- **FR-006** : Chaque transition DOIT enregistrer dans l'historique de la demande l'ancien et le
  nouveau statut, l'auteur (ou « système »), la date et le motif. L'historique ne se modifie
  jamais.
- **FR-007** : Chaque transition DOIT écrire une entrée d'audit, dans la même opération que le
  changement de statut et l'historique : soit tout est enregistré, soit rien. L'audit ne contient
  que des identifiants, des statuts et des montants. Ni le diagnostic, ni les libellés d'actes, ni
  les motifs n'y figurent.
- **FR-008** : Deux transitions concurrentes sur une même demande ne DOIVENT jamais réussir toutes
  les deux. La seconde est refusée parce que le statut a changé.
- **FR-009** : Les lignes, le diagnostic et l'affiliation ne se modifient qu'en « brouillon » ou en
  « complément demandé », par un médecin du centre demandeur.
- **FR-010** : La part patient DOIT valoir le montant estimé moins le montant accordé. Elle est
  calculée par le serveur.
- **FR-011** : Une demande est « partielle » quand le montant accordé est inférieur au montant
  estimé. Ce n'est pas un statut distinct.
- **FR-012** : Le médecin conseil ne DOIT voir que les demandes adressées à son organisation, et de
  chacune seulement : identité du patient, affiliation, diagnostic, lignes, montants, historique.
  Il ne voit aucune autre donnée du dossier médical.
- **FR-013** : Toute lecture d'une demande, par le centre ou par l'assureur, DOIT être auditée
  comme une lecture de contenu médical, puisqu'une demande porte un diagnostic.
- **FR-014** : Une demande d'un autre centre ou d'un autre assureur DOIT répondre « introuvable ».
- **FR-015** : Les actes viennent d'un petit référentiel de départ (code, libellé, tarif de
  référence en ariary), amorcé avec le projet comme le jeu CIM-10 de P2.4. Le médecin choisit un
  acte existant ; le tarif de la ligne reprend le tarif de référence et peut être ajusté (> 0). Le
  référentiel complet (P1.5) et les tarifs conventionnés (P1.7) le remplaceront sans changer les
  demandes existantes : chaque ligne garde le code, le libellé et le tarif en vigueur à la saisie.
- **FR-016** : P3.1 livre le modèle, la règle des transitions et les opérations serveur qui
  exécutent chacune (création, modification d'un brouillon, chaque transition, lecture), testées
  sans écran. P3.2 et P3.3 n'ajouteront que les écrans.
- **FR-017** : Côté centre, tous les médecins du centre demandeur voient toutes les demandes du
  centre, diagnostic compris ; seul un médecin du centre les crée, les modifie et les fait
  avancer. Les autres rôles du centre (accueil, infirmier, pharmacien, facturation, admin) ne
  voient aucune demande en P3.1 ; l'accès de la facturation viendra avec P4.

### Entités clés

- **Demande de prise en charge** : patient, affiliation, centre demandeur, assureur, diagnostic
  principal, montants (estimé, accordé, part patient), date limite de validité, statut, auteur,
  dates de création et de mise à jour.
- **Ligne d'acte** : appartient à une demande. Acte (code et libellé), quantité, tarif unitaire,
  montant de la ligne.
- **Événement d'historique** : appartient à une demande. Ancien statut, nouveau statut, auteur ou
  système, date, motif. Ne se modifie jamais.
- **Acte (référentiel de départ)** : code, libellé, tarif de référence en ariary. Remplacé plus
  tard par le référentiel complet (P1.5).
- Entités existantes réutilisées : patient, affiliation (P2.2, avec sa règle « active à une date »),
  organisation (centre ou assureur), code CIM-10 (P2.4), utilisateur et ses rôles.

## Critères de réussite _(obligatoire)_

### Résultats mesurables

- **SC-001** : 100 % des couples (statut, transition, rôle) hors du tableau FR-004 sont refusés, et
  100 % de ceux du tableau sont acceptés quand leurs conditions sont remplies (test exhaustif).
- **SC-002** : Aucune entrée d'audit ne contient le diagnostic, un libellé d'acte ou un motif
  (vérifié par recherche de textes repérables dans tout l'audit).
- **SC-003** : Sur 100 paires de décisions concurrentes, exactement une décision par paire
  réussit.
- **SC-004** : Pour toute demande, la reconstitution de son parcours depuis l'historique redonne
  son statut actuel.
- **SC-005** : Le montant estimé et la part patient affichés sont toujours égaux à ceux recalculés
  depuis les lignes, sur tout jeu d'essai.

## Clarifications

### Session 2026-10-24

- Q : D'où viennent les actes et leurs tarifs, sans P1.5 ni P1.7 ? → R : un petit référentiel
  d'actes amorcé avec tarif de référence ; le médecin choisit un acte et peut ajuster le tarif
  (FR-015).
- Q : Que livre P3.1 ? → R : le modèle, la règle des transitions et les opérations serveur de
  chaque transition, sans écran (FR-016).
- Q : Qui voit une demande côté centre ? → R : tous les médecins du centre, diagnostic compris ;
  aucun autre rôle avant P4 (FR-017).

## Hypothèses

- « Médecin du centre » désigne un rôle disposant de la permission de créer des demandes (le
  médecin aujourd'hui). « Médecin conseil » désigne un rôle disposant de la permission de décider,
  dans l'organisation de l'assureur destinataire.
- La prise en examen est une action explicite du médecin conseil. Elle n'est pas déclenchée par la
  simple consultation.
- La date limite de validité est fixée par le médecin conseil à l'accord. L'interface propose
  30 jours par défaut.
- La part patient vaut estimé − accordé. Le calcul avec les taux de couverture des régimes (P1.6)
  et les tarifs conventionnés (P1.7) viendra avec ces items.
- Un patient peut avoir plusieurs affiliations (question ouverte de la roadmap, hypothèse « oui ») :
  la demande en choisit une.
- Les pièces jointes (P2.6) ne sont pas encore disponibles. Elles viendront s'ajouter à la demande
  sans changer la machine à états.
- Les transitions « système » (expiration, facturation) font partie de la règle dès P3.1, mais
  elles sont déclenchées par P3.5 et P4.
- La demande d'urgence et son délai de réponse (question ouverte de la roadmap) ne font pas partie
  de P3.1.
