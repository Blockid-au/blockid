---
name: db-migrate
description: "Create and apply Supabase database migrations. Use when user says 'migrate', 'add table', 'alter column', or 'database change'."
arguments: [description]
---

# Database Migration — BlockID.au

Create and apply a Supabase migration.

**Argument:** `$0` — description of the change

## Steps

1. **Check current state**
   - List existing migrations: `ls web/supabase/migrations/ | sort | tail -5`
   - Determine next migration number (increment by 1)

2. **Create migration**
   - Write SQL to `web/supabase/migrations/XXXX_description.sql`
   - Include: CREATE TABLE, ALTER TABLE, indexes, RLS enable
   - Follow existing patterns (uuid PKs, timestamptz, enable RLS)

3. **Apply migration**
   - Execute via: `docker exec -i supabase-db psql -U postgres -c "$(cat web/supabase/migrations/XXXX.sql)"`
   - Verify success

4. **Update TypeScript** (if new table)
   - Add types/interfaces in relevant lib files
   - Update API routes that query the new table

5. **Commit**
   - Stage migration file
   - Commit with message: `db: description`