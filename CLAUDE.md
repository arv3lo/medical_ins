# CLAUDE.md

Platform between health centers and health insurers in Madagascar (OSTIE, BSA, …): patient
records, coverage requests, reimbursements and per-organization roles. Every action is written to
an append-only audit log. The owner writes in French or English; answer in the language used.
User-facing text (UI, API error messages) is in French.

## Layout

```
apps/api         Fastify 5 + Drizzle ORM + PostgreSQL, cookie sessions (src/modules/*: routes per domain)
apps/web         React 19 + Vite, TanStack Query, React Router
packages/shared  Roles, permission matrix and zod schemas shared by api and web
docker/          Caddyfile (reverse proxy + TLS), test database init script
```

## Commands

```sh
pnpm install
pnpm lint          # ESLint (CI runs it)
pnpm typecheck     # tsc in every package
pnpm test          # Vitest in every package; API integration tests need TEST_DATABASE_URL
pnpm format        # Prettier
pnpm db:generate   # after a change to apps/api/src/db/schema.ts; commit apps/api/drizzle
pnpm db:migrate
pnpm db:seed       # creates the super admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

API integration tests **wipe** the database in `TEST_DATABASE_URL`. Never point it at real data,
nor at another project's Postgres (localhost:5432 and 5433 belong to other projects on this
machine). CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every PR: run the
same locally before pushing.

## Rules that must hold

- **Every action is audited, atomically.** The audit entry is written in the same transaction
  as the change it records (`audit(tx, …)`). `audit_logs` is append-only, enforced by triggers.
- **Access is checked on the server.** Routes call `requireUser` / `requireSuperAdmin` /
  `requirePermission`; the permission matrix lives only in `packages/shared/src/roles.ts`.
- **Only the super admin creates user accounts.** Organization admins attach existing accounts.
- **Medical content is for care roles only**; insurers see only what a decision needs, and the
  super admin gets no medical permission without a care role (`superAdminBypasses`).

## Working on this repo

### Tests first

- Every behavior change starts with a test that is written and **seen failing** before the
  implementation (red → green → refactor). Bug fixes start with a test that reproduces the bug.
- API changes get integration tests (`apps/api/test`, Fastify `inject` against a real Postgres).
  Pure rules (roles, schemas) get unit tests next to their source.
- Never merge with failing tests, or with new behavior that has no test.

### Micro-commits

- One logical change per commit: a fix and its test go together; refactors, docs and config
  changes are separate commits. Conventional prefixes: `feat:`, `fix:`, `refactor:`, `test:`,
  `docs:`, `chore:`.
- Branch before the first commit of a task; never commit straight to `main`.
- **Never add Claude attribution** to commits or PRs: no `Co-Authored-By: Claude` trailer, no
  "Generated with Claude Code" line, no Claude author, nothing similar.

### Code quality: KISS, DRY, YAGNI, SOLID

These apply to new code, reviews and fixes.

- **KISS**: the simplest code that solves the problem; no cleverness for its own sake.
- **DRY**: before writing a helper, constant, label map or schema, search `packages/shared` and
  `apps/api/src/lib` and reuse what exists. A rule that appears in two places gets one home
  (shared between api and web → `packages/shared`).
- **YAGNI**: no config knobs, abstractions, parameters or exports nobody uses yet. An abstraction
  needs two real callers. Delete dead code rather than keeping it "just in case".
- **SOLID**: one responsibility per module, component and function; routes stay thin and
  delegate to `lib/` (or a module service once logic grows); no route→route imports.
- Readable code: clear names, short functions, early returns, comments that explain _why_.
- Split files beyond ~500 lines along their natural seams, unless the flow is genuinely linear.
- Refactors don't change behavior unless that is the explicit goal (then it is its own `fix:`
  commit). Auth, session and audit code get mechanical refactors only.

### Code review

- Review results live **only** in `CODE_REVIEW.md` at the repo root. Each review overwrites it
  (target, date, what was checked, findings ranked most severe first with file:line, why it
  matters, fix). No other review file, no copies elsewhere.
- When asked about review results, read `CODE_REVIEW.md` first; don't rely on the conversation.
- After fixing, record each finding's outcome (fixed / not fixed and why) in `CODE_REVIEW.md`,
  and commit it at the **end** of the fix work, not before. If no fixes follow, leave it
  uncommitted and say so.

## Code style

- **UI: shadcn/ui first.** Use a shadcn/ui component whenever one exists (`apps/web/components.json`;
  add with `pnpm dlx shadcn@latest add <name>` from `apps/web`) before writing a custom one.
  Business components compose them in `apps/web/src/components`. Colors come only from the theme
  tokens in `apps/web/src/index.css`, so the project's color chart can replace them in one place.

- **Animations**: Animate.css classes (`animate__animated animate__…`) for entrance and attention
  effects; `tw-animate-css` stays for shadcn component states. Keep them short and purposeful:
  Animate.css cuts them to ~1 ms under `prefers-reduced-motion`, so never rely on an animation to
  convey information.

- TypeScript strict, ESM. `import type` for types. Prettier for formatting, ESLint for lint.
- Small named exports, short doc comments on anything non-obvious.
