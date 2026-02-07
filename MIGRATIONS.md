# Database Migrations Guide

This guide explains how to handle database schema changes using Prisma in this project.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Creating Migrations](#creating-migrations)
- [Running Migrations](#running-migrations)
- [Common Scenarios](#common-scenarios)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

We use **Prisma** for database migrations. Migrations are automatically applied when Docker containers start.

**Key Files:**

- `api/prisma/schema.prisma` - Database schema definition
- `api/prisma/migrations/` - Migration history
- `api/docker-entrypoint.sh` - Auto-runs migrations on startup

---

## Quick Start

### Making Database Changes

```bash
# 1. Edit the schema
vim api/prisma/schema.prisma

# 2. Create migration locally
cd api
npx prisma migrate dev --name your_migration_name

# 3. Rebuild and restart Docker
cd ..
docker compose build api
docker compose up -d

# ✅ Migrations run automatically on startup!
```

---

## Creating Migrations

### Step 1: Edit Schema

Edit `api/prisma/schema.prisma`:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String   // ← NEW FIELD
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### Step 2: Generate Migration

```bash
cd api
npx prisma migrate dev --name add_user_name
```

**What this does:**

- ✅ Generates SQL migration file
- ✅ Applies migration to your local database
- ✅ Updates Prisma Client
- ✅ Creates: `prisma/migrations/YYYYMMDDHHMMSS_add_user_name/migration.sql`

### Step 3: Review Migration

Check the generated SQL:

```bash
cat prisma/migrations/YYYYMMDDHHMMSS_add_user_name/migration.sql
```

### Step 4: Commit to Git

```bash
git add api/prisma/migrations/
git add api/prisma/schema.prisma
git commit -m "Add name field to User model"
```

---

## Running Migrations

### Development (Docker)

Migrations run **automatically** when you start the container:

```bash
docker compose up -d
```

The `docker-entrypoint.sh` script runs:

```bash
npx prisma migrate deploy
```

### Production

For production deployments:

```bash
# Option 1: Run migrations before starting app
docker compose exec api npx prisma migrate deploy

# Option 2: Migrations run automatically on container startup (default)
docker compose up -d
```

### Manual Migration

If you need to run migrations manually:

```bash
# Inside Docker container
docker compose exec api npx prisma migrate deploy

# Locally (if running app outside Docker)
cd api
npx prisma migrate deploy
```

---

## Common Scenarios

### Adding a New Field

```prisma
model User {
  id       String @id @default(uuid())
  email    String @unique
  phoneNumber String?  // ← Optional field
}
```

```bash
npx prisma migrate dev --name add_user_phone
```

### Adding a New Table

```prisma
model Post {
  id        String   @id @default(uuid())
  title     String
  content   String
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
}

model User {
  id    String @id @default(uuid())
  email String @unique
  posts Post[]  // ← Relation
}
```

```bash
npx prisma migrate dev --name add_posts_table
```

### Adding an Index

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())

  @@index([createdAt])  // ← Index for faster queries
}
```

```bash
npx prisma migrate dev --name add_user_created_at_index
```

### Renaming a Field

⚠️ **Warning:** Renaming loses data! Use `@map` instead:

```prisma
model User {
  id           String @id @default(uuid())
  fullName     String @map("name")  // ← Rename in code, keep DB column
}
```

```bash
npx prisma migrate dev --name rename_name_to_fullname
```

### Making a Field Required

⚠️ **Warning:** Existing NULL values will cause migration to fail!

**Solution:** Two-step migration:

```prisma
// Step 1: Add field as optional with default
model User {
  name String? @default("Unknown")
}
```

```bash
npx prisma migrate dev --name add_user_name_optional
```

```prisma
// Step 2: Make it required (after backfilling data)
model User {
  name String @default("Unknown")
}
```

```bash
npx prisma migrate dev --name make_user_name_required
```

---

## Best Practices

### ✅ DO

1. **Always test migrations locally first**

   ```bash
   npx prisma migrate dev --name test_migration
   ```

2. **Use descriptive migration names**

   ```bash
   # Good
   npx prisma migrate dev --name add_user_email_verification
   
   # Bad
   npx prisma migrate dev --name update
   ```

3. **Review generated SQL before committing**

   ```bash
   cat prisma/migrations/*/migration.sql
   ```

4. **Commit migrations with schema changes**

   ```bash
   git add api/prisma/
   git commit -m "Add email verification to users"
   ```

5. **Use transactions for complex migrations**
   - Prisma wraps migrations in transactions automatically

### ❌ DON'T

1. **Don't edit migration files manually** (unless you know what you're doing)
2. **Don't delete migrations** that have been deployed
3. **Don't skip migrations** in production
4. **Don't make breaking changes** without a rollback plan

---

## Troubleshooting

### Migration Failed

```bash
Error: P3009
The migration cannot be applied because it would result in data loss
```

**Solution:** Make the change in two steps (see "Making a Field Required" above)

### Migrations Out of Sync

```bash
# Reset local database (⚠️ DELETES ALL DATA)
cd api
npx prisma migrate reset

# Or force sync
npx prisma migrate resolve --applied MIGRATION_NAME
```

### Docker Container Won't Start

Check logs:

```bash
docker compose logs api
```

Common issues:

- Database not ready (add `depends_on` in docker-compose.yml)
- Wrong DATABASE_URL
- Migration file corrupted

### Rollback a Migration

Prisma doesn't support automatic rollbacks. Options:

1. **Create a new migration** that reverses changes
2. **Restore from database backup**
3. **Manually write SQL** to undo changes

---

## Environment-Specific Configurations

### Local Development

- Uses `localhost` for database connection
- Migrations created with `prisma migrate dev`

### Docker Development

- Uses `postgres` (container name) for database connection
- Migrations run automatically via `docker-entrypoint.sh`

### Production

- Uses production DATABASE_URL
- Migrations run with `prisma migrate deploy`
- **Never use `migrate dev` in production!**

---

## Migration Commands Reference

| Command | Description | When to Use |
|---------|-------------|-------------|
| `npx prisma migrate dev --name NAME` | Create & apply migration | Development |
| `npx prisma migrate deploy` | Apply pending migrations | Production/Docker |
| `npx prisma migrate status` | Check migration status | Debugging |
| `npx prisma migrate reset` | Reset DB & reapply all | Local dev only |
| `npx prisma migrate resolve --applied NAME` | Mark migration as applied | Fix sync issues |
| `npx prisma generate` | Regenerate Prisma Client | After schema changes |

---

## Example Workflow

```bash
# 1. Pull latest code
git pull origin main

# 2. Make schema changes
vim api/prisma/schema.prisma

# 3. Create migration
cd api
npx prisma migrate dev --name add_user_profile_fields

# 4. Review the migration
cat prisma/migrations/*/migration.sql

# 5. Test locally
npm run start:dev

# 6. Commit changes
git add prisma/
git commit -m "Add profile fields to User model"
git push

# 7. Deploy (migrations run automatically)
docker compose build api
docker compose up -d
```

---

## Need Help?

- **Prisma Docs:** <https://www.prisma.io/docs/concepts/components/prisma-migrate>
- **Schema Reference:** <https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference>
- **Migration Issues:** Check `docker compose logs api`

---

**Last Updated:** 2026-02-08
