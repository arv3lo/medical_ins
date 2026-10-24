# medical_ins

Plateforme centralisée entre centres de santé et assureurs santé à Madagascar (OSTIE, BSA, …) :
dossiers patients, prises en charge, remboursements et gestion des rôles dans les centres.
Chaque action est tracée dans un journal d'audit en ajout seul.

## Structure

| Dossier           | Contenu                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/api`        | API Node.js : Fastify, Drizzle ORM, PostgreSQL, sessions par cookie      |
| `apps/web`        | Application React + Vite (TanStack Query, React Router)                  |
| `packages/shared` | Types, rôles, matrice de permissions et schémas zod partagés             |
| `docker/`         | Caddyfile (reverse proxy + TLS) et script de création de la base de test |

## Développement

Prérequis : Node.js 22, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL (bases medins et medins_test)
pnpm install
pnpm db:migrate
pnpm db:seed                                     # crée le super admin défini dans .env
pnpm dev                                         # API sur :3000, web sur :5173
```

Ouvrir http://localhost:5173 et se connecter avec `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

Autres commandes : `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`.
Après une modification de `apps/api/src/db/schema.ts`, générer la migration avec `pnpm db:generate`.

Les tests d'intégration de l'API utilisent `TEST_DATABASE_URL` ; sans cette variable, ils sont ignorés.

## Auto-hébergement

```bash
cp .env.example .env    # changer les mots de passe et DOMAIN
docker compose up -d --build
docker compose exec api node dist/seed.js
```

Caddy sert l'application sur `https://$DOMAIN` (certificat Let's Encrypt automatique, ou certificat
local pour `localhost`). L'API applique les migrations à chaque démarrage.

## Rôles

Les rôles sont attribués par organisation (une personne peut être médecin dans deux centres).
Seul le super admin crée les comptes (`POST /api/users`) ; les administrateurs d'organisation
rattachent des comptes existants, sans jamais choisir le mot de passe de quelqu'un.
La matrice de permissions est dans `packages/shared/src/roles.ts` :
le contenu médical est réservé aux soignants, l'assureur ne voit que ce que sa décision demande.
