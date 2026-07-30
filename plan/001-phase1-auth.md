# Phase 1 — Real Auth for `core-backend/api`

## Context

`core-backend` is further along than a blank scaffold: the `api` service already has a fully-migrated Prisma schema (`User`, `Organization`, `UserOrganization` join table with an `ADMIN`/`MEMBER` role enum, `RefreshToken`), and `auth`/`users` module folders already exist — but they're empty stubs. Nothing about auth actually works yet: `AuthController`/`AuthService` are empty classes, there's no `UsersController` at all, and critically **`AuthModule`/`UsersModule` aren't even imported into `AppModule`** (`imports: []`), so the `/auth` routes are unreachable regardless of what's built inside them. There's also no Prisma wiring into the Nest app anywhere (`@prisma/client` is installed but no `PrismaService`/`PrismaModule` exists), and none of the auth-related npm packages (`@nestjs/jwt`, `@nestjs/passport`, `bcrypt`, `class-validator`, etc.) are installed.

This phase is the unblocker for everything downstream: the frontend's Login page, `analytics-engine`'s internal-token trust boundary, and every future guarded endpoint all depend on real JWT auth existing first. Goal: implement register/login/refresh/logout against the existing schema (no schema changes needed — it already models everything required), wire up Prisma properly, add a reusable `JwtAuthGuard`, and back it with real unit tests.

## Grounded current state (verified by direct exploration, 2026-07-30)

- Schema already has everything needed: `User(email unique, passwordHash, isActive)`, `Organization`, `UserOrganization(userId, orgId, role: Role, @@id([userId,orgId]))`, `RefreshToken(tokenHash, expiresAt, revoked, indexed on userId + expiresAt)`, `enum Role { ADMIN, MEMBER }`. Migration `20260207185855_auth_init` matches the schema exactly — **no new migration needed**.
- `src/modules/auth/` and `src/modules/users/` are stub-only (empty controller/service, boilerplate "should be defined" specs with zero-arg constructors — these will break the moment real DI deps are added, so specs need full rewrites, not patches).
- `app.module.ts` has `imports: []` — must be fixed as part of this phase or nothing is reachable.
- No `PrismaService`/`PrismaModule` exists anywhere in `src/`.
- `package.json` has none of: `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `class-validator`, `class-transformer` (or their `@types`).
- `main.ts` is default scaffolding — no `ValidationPipe`, no CORS, no shutdown hooks.
- `tsconfig.json` uses `"module"/"moduleResolution": "nodenext"`, but `package.json` has no `"type"` field (defaults to CommonJS) — so output is CommonJS despite the modern setting. `passport-jwt` (CJS, no `exports` map) resolves fine via `esModuleInterop`; low risk, but verify with a `tsc` build right after installing packages, before writing business logic.
- **No `.env`/`.env.example` exists anywhere** (root or `api/`). Root `docker-compose.yml` hardcodes Postgres creds (`core_user`/`core_password`/`core_db`) directly rather than sourcing them from `.env`, even though `api`/`worker`/`socket` all reference a root `.env` via `env_file:`. Two `.env` files are needed: one at `core-backend/.env` (Docker, Postgres host = `postgres`) and one at `core-backend/api/.env` (bare local dev, Postgres host = `localhost`) — both must have `DATABASE_URL` matching the hardcoded compose creds.
- `api/Dockerfile`'s production stage runs an **independent** `npm ci --omit=dev` (doesn't copy `node_modules` from the builder) — a bcrypt native-binding risk to verify early via `docker compose build api`, not just local `npm install`.
- `docker-entrypoint.sh` runs `npx prisma migrate deploy` on every container start — standing rule for future phases, not relevant here since no migration changes.
- **Decision (confirmed with user):** since a `User` can belong to multiple `Organization`s but there's no org-switcher UI yet, login (and refresh) picks **the user's oldest `UserOrganization` membership by `createdAt`** for the JWT's `orgId`/`role`. Deterministic, DB-sorted (`orderBy: createdAt asc, take: 1`), documented in code as an explicit MVP simplification — not an oversight. Multi-org switching is out of scope for Phase 1.

## Implementation plan

### 1. Packages
Add to `api/package.json`:
- **dependencies:** `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `class-validator`, `class-transformer`
- **devDependencies:** `@types/passport-jwt`, `@types/bcrypt`, `@types/passport`
- Add `"postinstall": "prisma generate"` script so a fresh clone doesn't need a manual `npx prisma generate`.

Run `docker compose build api` after this step (before writing logic) to catch any bcrypt native-binding issue in the `node:20-alpine` production stage early. If it fails, fall back to `bcryptjs` — otherwise keep `bcrypt` as specified.

### 2. Env files
Create `.env.example` (committed) at both `core-backend/.env.example` and `core-backend/api/.env.example`, and instruct `cp .env.example .env` locally. Keys:
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://core_user:core_password@<postgres|localhost>:5432/core_db
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN_DAYS=30
```
(`postgres` host for the root `.env` used by docker-compose, `localhost` for `api/.env` used by bare `npm run start:dev`.) Bcrypt cost (12) is hardcoded in code, not env-configurable.

### 3. Prisma wiring (`src/prisma/`)
- `prisma.service.ts` — `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`, connects/disconnects in lifecycle hooks.
- `prisma.module.ts` — `@Global()` module exporting `PrismaService`, imported once into `AppModule`. Being global means `AuthModule`/`UsersModule` inject it without re-importing.
- `main.ts`: add `app.enableShutdownHooks()` so `onModuleDestroy` actually fires on `docker stop` (SIGTERM reaches the process directly since the entrypoint uses `exec node dist/main.js`).

### 4. `app.module.ts`
Wire in `ConfigModule.forRoot({ isGlobal: true })`, `PrismaModule`, `AuthModule`, `UsersModule`. This is the change that makes everything else reachable — land it as part of this same change, not an afterthought.

### 5. Auth module (`src/modules/auth/`)
- `dto/register.dto.ts` — `email` (`@IsEmail`), `password` (`@IsString @MinLength(8)`), `organizationName` (`@IsString @IsNotEmpty`).
- `dto/login.dto.ts` — `email`, `password` (no `MinLength` on login — just presence).
- `dto/refresh.dto.ts` — `refreshToken` (`@IsString @IsNotEmpty`), reused for both `/refresh` and `/logout`.
- `strategies/jwt.strategy.ts` — `PassportStrategy(Strategy, 'jwt')`, pulls `JWT_ACCESS_SECRET` from `ConfigService`, `validate()` returns `{ userId: payload.sub, orgId, role }` → becomes `req.user`.
- `auth.service.ts` — constructor takes `PrismaService`, `JwtService`, `ConfigService`.
  - `register(dto)`: bcrypt-hash (cost 12) → single interactive `$transaction` creating `Organization` → `User` → `UserOrganization(role: ADMIN)`. Catch Prisma `P2002` (unique email) → `ConflictException`; no pre-check, avoids TOCTOU race. Returns token pair for the new org/ADMIN.
  - `login(dto)`: fetch user with `organizations` ordered by `createdAt asc, take: 1`. If no user, inactive, or `bcrypt.compare` fails → **same** `UnauthorizedException('Invalid credentials')` in all cases (doesn't leak whether the email exists).
  - `issueTokenPair(userId, orgId, role)` (private): signs JWT (`{ sub, orgId, role }`, 15m), generates opaque refresh token (`randomBytes(32).toString('hex')`), stores only its SHA-256 hash + 30-day `expiresAt` in `RefreshToken`, returns `{ accessToken, refreshToken }` (raw) to caller.
  - `hashToken(raw)` (private, single implementation used by issue/refresh/logout — hash-algorithm drift between issuance and lookup would silently break all refresh/logout calls).
  - `refresh(dto)`: hash incoming token, look up by `tokenHash`. Reject before any mutation if not found/revoked/expired. Then revoke old row, issue new pair (rotation).
  - `logout(dto)`: hash, find, revoke if found and not already revoked; no-op (not an error) if unknown/already-revoked — avoids leaking token validity via error vs success.
- `auth.controller.ts` — `POST /auth/register` (201), `/login` (200), `/refresh` (200), `/logout` (204), each thin delegation to `AuthService`.
- `auth.module.ts` — imports `PassportModule`, `JwtModule.registerAsync(...)` (secret/expiry from `ConfigService`, throws at boot factory if `JWT_ACCESS_SECRET` missing); providers: `AuthService`, `JwtStrategy`.

### 6. Shared guard (`src/common/guards/jwt-auth.guard.ts`)
`JwtAuthGuard extends AuthGuard('jwt')` — no constructor deps (Passport resolves the `'jwt'` strategy from its own global registry by name, not via Nest DI), so it lives outside `AuthModule` and any controller can `@UseGuards(JwtAuthGuard)` without importing `AuthModule` — no circular-import risk.

### 7. Users module (`src/modules/users/`)
- `users.service.ts` — `getMe(userId)`: `prisma.user.findUnique` with explicit `select` (never fetches `passwordHash`), includes `organizations` with nested `org` info. Throws `NotFoundException` if missing.
- `users.controller.ts` (new) — `GET /users/me`, `@UseGuards(JwtAuthGuard)`, reads `req.user.userId`.
- `users.module.ts` — controllers: `[UsersController]`, providers: `[UsersService]`.

### 8. `main.ts`
Add global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — verify DTO field sets exactly match documented bodies so legit requests aren't 400'd.

### 9. Tests
Rewrite (not patch) the existing boilerplate specs — their zero-arg constructors will throw DI resolution errors the moment real deps are added:
- `auth.service.spec.ts`: mock `PrismaService` as a plain object (never construct the real class — it extends `PrismaClient`), mock `$transaction` as `(cb) => cb(prismaMock)`, mock `bcrypt.hash`/`compare` via `jest.mock('bcrypt')`, mock `JwtService.sign`. Leave real Node `crypto` so tests can assert `sha256(returnedRefreshToken) === tokenHash passed to refreshToken.create`. Cases: successful register, duplicate-email → `ConflictException`, successful login, **wrong password → `UnauthorizedException`**, unknown email → same exception/message as wrong password, inactive user, successful refresh rotation (assert old row revoked + new row created), token-not-found, **revoked token → `UnauthorizedException` with no mutation calls**, expired token, successful logout, logout on unknown/already-revoked token (idempotent no-op).
- `auth.controller.spec.ts`: mock `AuthService`, assert delegation.
- `users.service.spec.ts`: mock `PrismaService`, assert `getMe` shape and `NotFoundException` on missing user.
- `users.controller.spec.ts` (new): mock `UsersService`.

Run `npm run test` and `npm run lint`, fix anything failing.

## Verification
1. `npm install` in `api/` (picks up new deps, `postinstall` regenerates Prisma client).
2. `docker compose build api` from `core-backend/` — confirms bcrypt native bindings build cleanly in the alpine production stage.
3. `npm run test` and `npm run lint` in `api/` — must pass.
4. Local smoke test: `cp .env.example .env` in both `core-backend/` and `core-backend/api/`, fill in a real `JWT_ACCESS_SECRET`, `docker compose up postgres redis -d`, then `npm run start:dev` in `api/` and manually hit:
   - `POST /auth/register` with a new email → expect 201 + `{accessToken, refreshToken}`.
   - `POST /auth/login` with correct/wrong password → 200 vs 401.
   - `GET /users/me` with the access token as a Bearer header → 200 with user+orgs, no `passwordHash` in the response.
   - `POST /auth/refresh` with the refresh token → 200 + new pair; replaying the *old* refresh token afterward → 401 (proves rotation/revocation works).
   - `POST /auth/logout` then retry `/auth/refresh` with that same token → 401.
5. Full stack: `docker compose up` from `core-backend/` and repeat the same curl sequence against `localhost:3000` to confirm the Docker path (migrations-on-start, alpine bcrypt) works end to end.
