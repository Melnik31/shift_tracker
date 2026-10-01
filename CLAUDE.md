# CLAUDE.md

Instructions for any Claude Code session working in this repo.

## Architecture

ShiftTracker is multi-tenant: everything hangs off `Workspace` (the tenant). The scheduling grid is a deliberately generic layout engine —

```
Workspace → Campus → Section → Location → SubRow → Shift → CellValue
```

`Section`/`Location`/`SubRow` carry only admin-entered labels, never domain-specific naming — the same schema models a rink, a classroom, or any other shift-based org. Employees are many-to-many with `Campus` via the `EmployeeCampus` join table, and hold multiple free-text `roles` (a Postgres `String[]`, not a join table). A `Shift` created via "New Shift Block" shares a `blockId` with its siblings, which drives the Matrix view's overlap-lane layout and per-block coloring (`client/src/lib/lanes.ts`).

Access control is role-based (`COACH`, `DIRECTOR`, `SENIOR_LEAD_INSTRUCTOR`, `ADMIN`, `CEO`) plus a separate employee session type. **Every route scopes tenant/campus data through the shared helpers in `server/src/lib/campusScope.ts` and `server/src/lib/ownership.ts` — never trust a client-supplied `workspaceId`/`campusId` directly.** New routes touching tenant data should reuse these helpers rather than re-deriving scoping logic.

## Commands

```bash
npm run dev                      # server + client together (root)
npm run db:migrate                # Prisma migrate dev (server)
npm run db:seed                   # demo data (server)
npm test                          # server tests (Vitest + Supertest, real Postgres)
npm test --prefix client          # client tests (Vitest)
npx tsc --noEmit                  # server typecheck (run from server/)
npx tsc -b                        # client typecheck (run from client/)
```

## Conventions

- **Migrations**: hand-author SQL matching the existing style — `-- AlterTable`/`-- CreateTable`/`-- CreateIndex`/`-- AddForeignKey` comments, `ON DELETE RESTRICT ON UPDATE CASCADE` on foreign keys. Match the patterns already in `server/prisma/migrations/`.
- **Server tests**: Vitest + Supertest, run against a real Postgres instance (not mocked) — see any `server/src/routes/*.test.ts` for the pattern.
- **Client tests**: Vitest only, currently pure-logic unit tests (`client/src/lib/*.test.ts`) — there is no component/interaction test setup (no jsdom, no Testing Library) and no E2E framework yet. Follow the existing `describe`/`it`/`expect` style when adding more.
- **Scoping**: any new query touching `Shift`, `CellValue`, `Employee`, or similar tenant data must go through `campusScope.ts`/`ownership.ts`, not an ad hoc `where` clause.
- **Git commits**: do **not** add a `Co-Authored-By` or Claude-Session trailer to commit messages in this repo.
