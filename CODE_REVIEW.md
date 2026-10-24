# Code review: PR #1 "Socle technique : monorepo, API, app web, docker-compose"

- Target: PR #1, `feat/socle-technique` (0cc65ac) against `main`
- Effort: xhigh (recall-oriented, no verification pass, so some findings may be uncertain)
- Scope: whole diff except `pnpm-lock.yaml` and the generated drizzle snapshots
- Date: 2026-10-24

## Fix status

Fixes are on `feat/socle-technique`, one commit per finding, each bug fix reproduced first by a
failing test (or by hand for build, Docker and nginx issues). Final run: lint, typecheck, 29 tests
(API against a real Postgres 16), build, both Docker images, API image smoke test.

| #   | Finding                                  | Outcome                                                                                                                                      | Commit    |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Account takeover through add-member      | Fixed (owner's choice): only the super admin creates accounts (`POST /api/users`); add-member attaches existing accounts only, 404 otherwise | `516b9cb` |
| 2   | Audit written outside the transaction    | Fixed: `audit(tx, …)` inside the change's transaction (organizations, memberships, login, logout)                                            | `7ddbc6c` |
| 3   | Login timing reveals accounts            | Fixed: verify against a dummy hash when no active account matches                                                                            | `241e986` |
| 4   | TRUNCATE wipes the audit log             | Fixed: migration `0002` adds a statement-level TRUNCATE trigger; test resets skip triggers explicitly                                        | `39f284a` |
| 5   | `trustProxy: true`                       | Fixed: `TRUST_PROXY_HOPS` (default 0, docker-compose sets 1 for Caddy)                                                                       | `5cb7409` |
| 6   | Account creation not audited             | Fixed with #1: `user.create` audited, without the password hash                                                                              | `516b9cb` |
| 7   | Seed password in the api container       | Fixed: one-off `seed` service (`docker compose run --rm seed`)                                                                               | `8a7e9a2` |
| 8   | Migrations folder wrong from `dist/`     | Fixed: folder resolved from the package root; `MIGRATIONS_DIR` removed                                                                       | `a3cb663` |
| 9   | Main-module check misses encoded paths   | Fixed: separate `migrate-cli.ts` entry, no main-module check                                                                                 | `a3cb663` |
| 10  | Password not URL-encoded in DATABASE_URL | Fixed in docs: compose, `.env.example` and README ask for a URL-safe password (`openssl rand -hex 32`)                                       | `8a7e9a2` |
| 11  | `.env` not loaded by vitest              | Fixed: `vitest.config.ts` loads the repository `.env`                                                                                        | `af0c2f1` |
| 12  | List error hidden, no global 401         | Fixed: any 401 clears the session; the organization list shows its error                                                                     | `589841f` |
| 13  | Race on a new email                      | Fixed with #1: `POST /api/users` uses `ON CONFLICT DO NOTHING` and answers 409                                                               | `516b9cb` |
| 14  | Outage redirects to login                | Fixed: the layout shows the error with a retry button                                                                                        | `ae13c52` |
| 15  | `index.html` cached                      | Fixed: `Cache-Control: no-cache` on `index.html` and SPA routes                                                                              | `b061a60` |

Below the cap:

| Item                                         | Outcome                                                                                                                                                                              | Commit    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Claude attribution on efdd462 and PR body    | Fixed: commit rewritten as `0cc65ac` (author and committer set to the owner, `Co-Authored-By`/`Claude-Session` trailers dropped, same tree); credit line removed from the PR #1 body | `0cc65ac` |
| `onRequest` runs 3 queries per request       | Not fixed: a performance tweak with no measured problem; revisit when the auth hook grows                                                                                            | —         |
| argon2 hash inside the transaction           | Fixed with #1: `POST /api/users` hashes before opening the transaction                                                                                                               | `516b9cb` |
| Organization type labels written three times | Fixed: `ORGANIZATION_TYPE_LABELS` in `packages/shared`                                                                                                                               | `0271497` |
| `addMemberInputSchema` only in the API       | Fixed with #1: moved to `packages/shared`                                                                                                                                            | `516b9cb` |
| `organizationSchema` null/updatedAt          | Fixed                                                                                                                                                                                | `28b3589` |
| Expired sessions never purged                | Fixed: purged on each login                                                                                                                                                          | `008c06b` |
| Tests near the login rate limit              | Fixed: each test login comes from its own address                                                                                                                                    | `d9c80c1` |
| `/organizations` route not guarded           | Not fixed: the link is hidden for non-super-admins, the API answers 403 and the page now shows "Accès refusé" (#12); a client-side guard would only duplicate the server rule        | —         |
| Seed ignores an existing non-admin email     | Fixed: the seed fails instead of reporting success; it never promotes an account silently                                                                                            | `6b227ba` |
| `COOKIE_SECURE` false in production          | Fixed: defaults to Secure when `NODE_ENV=production`                                                                                                                                 | `f7a3a5a` |
| `engines` allows Node < 22.9                 | Fixed: `>=22.9`                                                                                                                                                                      | `5b7c630` |
| `api()` drops a `Headers` instance           | Fixed                                                                                                                                                                                | `fbc015a` |

## Findings (most severe first)

1. **apps/api/src/modules/organizations/routes.ts:84**: adding a member by email silently reuses any existing account, and the first person to add an email sets its password. That lets someone take over an account before its owner ever uses it.
   - Scenario: the center admin of center A adds `advisor@ostie.mg` as `doctor` and sets `initialPassword` to a value they know. Later the OSTIE insurer manager (or the super admin) adds `advisor@ostie.mg` as `medical_advisor`. The account already exists, so `fullName`/`initialPassword` are ignored and nobody is told. The center admin can now log in as an OSTIE medical advisor (`coverage_request.decide`). The same branch also reveals whether an email has an account: a 400 asking for `fullName` and `initialPassword` means no account, a 201 or 409 means one exists.

2. **apps/api/src/modules/organizations/routes.ts:110** (also line 41 and `apps/api/src/lib/audit.ts:15`): audit entries are written after the action's transaction commits, outside it. `audit(db: Db, …)` only accepts the root `Db`, so callers cannot put the audit write inside the transaction.
   - Scenario: the organization insert at line 40 succeeds, then the audit insert fails (connection reset, timeout). The client gets a 500, the organization stays without any audit row, and the user clicks "Ajouter" again, which creates a duplicate organization (there is no unique constraint on the name). The same thing happens with memberships: the transaction commits, the audit fails, and the retry returns 409. That breaks the README's promise that every action is audited. Fix: let `audit` take a `Db | Tx` and run each action and its audit write in one transaction.

3. **apps/api/src/modules/auth/routes.ts:21**: login only runs argon2 `verifyPassword` when the user exists and is active. Unknown or deactivated emails answer measurably faster.
   - Scenario: timing `POST /api/auth/login` across candidate emails shows which addresses have active accounts (roughly a 20–50 ms argon2 gap), even though the error message is the same. Fix: verify against a dummy hash when the user is missing or inactive.

4. **apps/api/drizzle/0001_audit_logs_append_only.sql:9**: the append-only trigger is `BEFORE UPDATE OR DELETE … FOR EACH ROW`, so it does not cover `TRUNCATE`.
   - Scenario: `TRUNCATE audit_logs`, or `TRUNCATE users CASCADE` (CASCADE follows the foreign key from `audit_logs`), wipes the whole audit log without error. The test helper `resetDb` relies on exactly this. Fix: add a `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger, and have tests disable it or use a dedicated role.

5. **apps/api/src/app.ts:18**: `trustProxy: true` trusts every `X-Forwarded-For` hop, so a client can set `request.ip` to anything. The login rate limit and the audit `ip` column are both keyed on it.
   - Scenario: under `pnpm dev` the API binds `0.0.0.0:3000`, and the same happens with any deployment where the API is reachable without Caddy or sits behind another proxy or CDN. An attacker sends a fresh `X-Forwarded-For` value on each attempt, gets unlimited login attempts past the 10/min limit, and forges the IPs in the audit log. Fix: trust a hop count (`1`) or the Caddy network.

6. **apps/api/src/modules/organizations/routes.ts:92**: creating a new user account (with a password chosen by the admin) writes no audit entry of its own. Only `membership.create` is logged.
   - Scenario: a center admin creates accounts through add-member. Searching `audit_logs` for `entity_type='user'` finds no creation event, and nothing records who chose the initial credentials.

7. **docker-compose.yml:34**: `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` stay in the environment of the long-running `api` container.
   - Scenario: anyone with `docker inspect` or `/proc/1/environ` access can read the super-admin password in plaintext for as long as the container runs. There is no endpoint to change the password, so the seeded one stays valid. Pass the values only to the one-off `docker compose exec -e … api node dist/seed.js` instead.

8. **apps/api/src/db/migrate.ts:10**: the fallback migrations folder `../../drizzle` is relative to `import.meta.url`. That is correct from `src/db/migrate.ts` but wrong from the bundled `dist/migrate.js`.
   - Scenario: `pnpm --filter @medical-ins/api start` (package.json `start`) without `MIGRATIONS_DIR` resolves to `apps/drizzle`, and `migrate()` fails with "Can't find meta/_journal.json". Only the Docker image works, because it sets `MIGRATIONS_DIR`.

9. **apps/api/src/db/migrate.ts:17**: the main-module check `import.meta.url === \`file://${process.argv[1]}\``misses whenever the path is percent-encoded (spaces, accents such as`Développement/`) or reached through a symlink (`import.meta.url`is the real path,`argv[1]` is not).
   - Scenario: `pnpm db:migrate` in such a checkout does nothing and exits 0 without printing "Migrations applied", leaving an unmigrated database. Fix: compare against `pathToFileURL(process.argv[1]).href`, or move the CLI into a separate entry file.

10. **docker-compose.yml:29**: `DATABASE_URL` is built from `${POSTGRES_PASSWORD}` without URL-encoding.
    - Scenario: following the README ("changer les mots de passe") with a generated password containing `@`, `#`, `/`, `?` or `%` gives a malformed or misparsed URL. The API then fails at startup in `env.ts` or connects with the wrong credentials, while the `db` container starts fine.

11. **apps/api/test/helpers.ts:10**: the integration tests read `process.env.TEST_DATABASE_URL`, but nothing loads the repository `.env` for `vitest run`. Vitest does not put arbitrary `.env` variables into `process.env`.
    - Scenario: a developer follows the README (`cp .env.example .env`, which defines `TEST_DATABASE_URL`, then `pnpm test`). Every API integration suite is skipped by `describe.skipIf`, and the run is still green.

12. **apps/web/src/pages/OrganizationsPage.tsx:55**: the list query's error is never rendered, and nothing handles 401 globally.
    - Scenario: the session expires after 12 h (the `me` query is never refetched, since focus refetch is off), or the API returns 403/500. The page shows an empty "Organisations" table with no message, and the user is never sent back to the login page.

13. **apps/api/src/modules/organizations/routes.ts:92**: "find user by email, then insert" is a race. Two concurrent add-member calls for the same new email both see no user.
    - Scenario: the second insert violates `users_email_unique`. The error handler maps that to a 500 "Erreur interne" instead of 409, or instead of reusing the account.

14. **apps/web/src/Layout.tsx:9**: when `/auth/me` fails with anything other than 401 (API down, 500, network error), `data` is `undefined`, and the layout redirects to `/login` as if the user were logged out.
    - Scenario: during a short API outage, logged-in users are sent to the login form, and their login attempts fail with "Erreur interne". The outage looks like a lost session.

15. **apps/web/nginx.conf:11**: `index.html` is served with no `Cache-Control`, so browsers can cache it heuristically (Last-Modified plus ETag).
    - Scenario: after a redeploy, a browser keeps the old `index.html`, which references hashed `/assets/*` files that no longer exist in the new image. The result is a blank page until a hard refresh. Add `Cache-Control: no-cache` for `index.html`.

## Below the 15-finding cap

These are lower priority; correctness findings take precedence when the cap applies.

- **Conventions (`~/.claude/CLAUDE.md`, "Git attribution")**: the rule says "Do NOT append the `Co-Authored-By: Claude <...>` trailer to commit messages" and "Do NOT add `🤖 Generated with [Claude Code](https://claude.com/claude-code)` (or any "Generated with Claude Code" credit) to PR bodies". Commit 0cc65ac ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: …`, and its author is `Claude <noreply@anthropic.com>`. The PR #1 body ends with `_Generated by [Claude Code](https://claude.ai/code/session_…)_`.
- **Efficiency**, `apps/api/src/plugins/auth.ts:18`: the `onRequest` hook runs 3 sequential queries (session, user, memberships) on every request that has a cookie, including `/api/health`. It also runs before the route-level rate-limit hook on login. A single join would do, or loading lazily in `requireUser`.
- **Efficiency**, `apps/api/src/modules/organizations/routes.ts:97`: the argon2 hash is computed inside `db.transaction`, which holds a pooled connection for the length of the hash. Hash before opening the transaction.
- **Reuse**, `apps/web/src/pages/HomePage.tsx:25`, `OrganizationsPage.tsx:6` and `:44`: the organization type labels are written three times. Add an `ORGANIZATION_TYPE_LABELS` next to `ROLE_LABELS` in `packages/shared/src/roles.ts`.
- **Reuse**, `apps/api/src/modules/organizations/routes.ts:14`: `addMemberInputSchema` lives in the API, while `createOrganizationInputSchema` is in `packages/shared/src/schemas/organizations.ts`. The web app will need it.
- `packages/shared/src/schemas/organizations.ts:14`: `organizationSchema` types `taxId`, `region` and `address` as `string | undefined`, but the API returns `null`, so the type contract is wrong (and `updatedAt` is missing).
- `apps/api/src/lib/session.ts`: expired sessions are never purged, so the table grows without bound.
- `apps/api/test/organizations.test.ts`: the tests log in about 6 times per file against a 10/min per-IP limit. A few more tests will start getting 429s.
- `apps/web/src/main.tsx:23`: the `/organizations` route is not guarded. Non-super-admins can open it and see the create form, which then returns 403.
- `apps/api/src/db/seed.ts:15`: an existing user with the seed email is neither promoted to super admin nor updated, but the script still reports "already exists".
- `apps/api/src/env.ts:8`: `COOKIE_SECURE` defaults to `false` even when `NODE_ENV=production`.
- `apps/api/package.json:7`: `--env-file-if-exists` needs Node 22.9 or later, but `engines` allows `>=22`.
- `apps/web/src/lib/api.ts:14`: spreading `init.headers` drops headers passed as a `Headers` instance.
