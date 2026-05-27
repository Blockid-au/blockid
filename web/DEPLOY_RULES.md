# BlockID.au — Deploy Rules & Agent Upgrade Protocol

> **MANDATORY** for all C-Level agents, human developers, and automated routines.
> Violation = deploy blocked. No exceptions.

---

## Golden Rule

**NEVER deploy code that hasn't passed ALL 9 gates.**

```
Gate 1: All 16 critical env keys present
Gate 2: Supabase + Redis connectivity verified
Gate 3: TypeScript compilation (0 errors)
Gate 4: ESLint (0 errors)
Gate 5: Next.js build succeeds
Gate 6: Smoke test 6 endpoints on temp port 4099
Gate 7: Supabase query from new build
Gate 8: Swap to production port 4001
Gate 9: Post-deploy public URL verification
```

---

## How to Deploy

```bash
# Standard deploy (all gates)
bash scripts/deploy-live.sh

# Emergency deploy (skip lint/typecheck — use ONLY for hotfixes)
bash scripts/deploy-live.sh --quick

# Deploy existing build without rebuilding
bash scripts/deploy-live.sh --skip-build

# Instant rollback to previous build
bash scripts/deploy-live.sh --rollback
```

---

## Forbidden Actions

| Action | Why | Alternative |
|--------|-----|-------------|
| `docker build` / `docker run` for production | Env vars lost, Supabase hostname broken | `deploy-live.sh` |
| `git push` to trigger GitLab CI | CI pipeline broken, slow, unreliable | `deploy-live.sh` |
| GitHub Actions | Not configured | `deploy-live.sh` |
| Edit files in `.next/standalone/` directly | Overwritten on next build | Edit `src/`, then deploy |
| `npm run build` without deploy script | Missing env overrides (SUPABASE_URL, REDIS_URL) | `deploy-live.sh` |
| Deploy without Supabase connectivity test | API endpoints will return 500 | Gate 2 checks this |
| Deploy with TypeScript errors | Runtime crashes | Gate 3 catches this |

---

## Agent Auto-Upgrade Protocol

When a C-Level agent (CEO, CTO, RnD, etc.) wants to ship code:

### Step 1: Create a Branch
```bash
git checkout -b {agent}/daily-upgrade-$(date -u +%Y-%m-%d)
```

### Step 2: Make Changes (max 3 files per upgrade)
- Small, focused improvements
- Never refactor more than 1 component per day
- Always run `npx tsc --noEmit` before committing

### Step 3: Self-Test
```bash
npx tsc --noEmit        # Must pass (0 errors)
npm run lint             # Must pass (0 errors)
```

### Step 4: Commit & Push
```bash
git add <changed files only>
git commit -m "feat/fix: [description]

Prioritized from: [which agent report]
Expected impact: [user/revenue/retention]

Co-Authored-By: BlockID [Agent] Agent <agent@blockid.au>"
git push -u origin HEAD
```

### Step 5: Create PR (do NOT merge directly to master)
```bash
gh pr create --title "Daily upgrade: [description]" --body "..."
```

### Step 6: Human Review Required
- Agent PRs are NEVER auto-merged
- Human must review and merge to master
- After merge: human runs `bash scripts/deploy-live.sh`

---

## Pre-Deploy Checklist (for Human)

Before running `deploy-live.sh`, verify:

- [ ] All agent PRs reviewed and merged
- [ ] No conflicting changes between agents
- [ ] `.env` file has all keys (Gate 1 will check)
- [ ] Supabase Docker container running (`docker ps | grep supabase-kong`)
- [ ] Redis Docker container running (`docker ps | grep blockid-redis`)
- [ ] No other `next build` process running (`pgrep -f "next build"`)
- [ ] Enough disk space (`df -h /home/dovanlong/ | tail -1`)

---

## Env Var Rules for Standalone Deploy

The `.env` file uses Docker hostnames (`supabase-kong`, `blockid-redis`).
The deploy script **automatically overrides** these for host-level access:

| Var in .env | Override in deploy script | Why |
|-------------|-------------------------|-----|
| `SUPABASE_URL=http://supabase-kong:8000` | `http://127.0.0.1:8000` | Standalone can't resolve Docker DNS |
| `REDIS_URL=redis://blockid-redis:6379` | `redis://127.0.0.1:6379` | Same reason |

**NEVER change these overrides** in `deploy-live.sh` or `start-production.sh`.

---

## Rollback Procedure

If production is broken after deploy:

```bash
# Instant rollback (< 5 seconds)
bash scripts/deploy-live.sh --rollback

# Manual rollback (if script fails)
fuser -k 4001/tcp
cp -r .next-backup/* .next/
bash scripts/start-production.sh
```

---

## Monitoring After Deploy

```bash
# Check logs
tail -f /tmp/blockid-production.log

# Quick health check
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/
curl -s https://blockid.au/api/auth/me

# Full endpoint test
for p in / /auth/login /pricing /score /api/auth/me /api/svi/check-gate?email=t@t.com; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://blockid.au$p) $p"
done
```
