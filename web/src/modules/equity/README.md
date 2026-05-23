# Module: equity

## API Routes
See `src/app/api/equity/`

## Dependencies
- Shared: `lib/shared/` (database, auth, credits)
- Module-specific: see `lib/` files referenced in routes

## Independence Rules
- DO NOT import from other module's API routes
- DO import from `lib/shared/` or `lib/` for cross-cutting concerns
- Inter-module data flows through Supabase (shared database)
