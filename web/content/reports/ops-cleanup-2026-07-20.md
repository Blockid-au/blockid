# Ops Cleanup — 2026-07-20

Disk + process optimization pass on the BlockID.au production server.

## Before

| Mount | Size | Used | Avail | Use% |
|---|---|---|---|---|
| `/` (sda1) | 276G | **44G** | 221G | 17% |
| `/data` (sdb) | 295G | 17G | 263G | 6% |

Top consumers investigated:

| Path | Size |
|---|---|
| `/data/releases` (6 dirs, deploy retains 6) | 2.4G |
| `web/node_modules` | 1.7G |
| `web/.next` (cache: 1.4G) | 1.2G |
| `web/content/reports` | — |
| `/tmp/blockid-*.log` (largest: cron.log 91K) | ≤ 91K each |

Docker footprint:

- Images: **14.71GB** (14 active, 3.10GB reclaimable)
- Local Volumes: **4.08GB** — **99% reclaimable** (all `runner-*` GitLab-CI leftovers)
- Build Cache: 0B

## Actions taken

- `docker rmi gitlab-deploy/demo-ci-cd:latest` — 230MB freed. Stale CI image; per platform policy no Docker/GitLab CI is used (server = production).
- `docker volume rm` × 8 orphaned `runner-*-cache-*` volumes — **~4.08GB freed**. Zero LINKS, GitLab-runner leftovers, cannot be repopulated under current deploy model.
- No log truncation needed — all `/tmp/blockid-*.log` files are well under the 50 MB threshold (largest 91K).
- No `/data/releases` prune needed — exactly 6 dirs, matches `deploy-live.sh` retention policy.
- No npm cache prune — `~/.npm` is 0 bytes.
- No `.next` cache prune — a `next build --webpack` (PID 2528515) was **active during the pass**; touching cache would corrupt the in-flight build.

## After

| Mount | Size | Used | Avail | Use% | Delta |
|---|---|---|---|---|---|
| `/` (sda1) | 276G | **40G** | 225G | 15% | **−4 GB** |
| `/data` (sdb) | 295G | 17G | 263G | 6% | 0 |

Docker footprint:

- Images: 14.48GB (−230MB)
- Local Volumes: **384.3kB** (−4.08GB, −99.99%)

**Total freed: ~4.3 GB on root filesystem.**

## Findings (flagged, not touched)

1. **Two stale `next-server` processes** (not listening on prod port 4001):
   - PID **617064** — `next-server (v15.5.19)`, uptime **3d 13h**, listening on 127.0.0.1:**4002** (not 4001 prod or 4099 swap). Likely orphaned from a failed deploy swap. **~48 MB RSS.**
   - PID **2894338** — `next-server (v16.2.3)`, uptime **35d 9h**, **no listener at all**. Zombie from a very old deploy. **~64 MB RSS.**
   - Live prod is PID 136849 on :4001 (14 h uptime, healthy).
   - Did NOT kill during this pass because `next build --webpack` (PID 2528515) was actively running and taking 197% CPU — reserving all changes to avoid disrupting the deploy in-flight. Recommend `kill 617064 2894338` after next successful deploy quiesces.
2. **Port :4002 listener** — unexpected. The deploy script contract per task brief is 4001 (prod) + 4099 (swap). Nothing should be on :4002. Likely a legacy `PORT` env or hard-coded swap fallback in an older deploy script version.
3. **`web/.next/cache` = 1.4 GB** — normal for Next 16 Webpack build, but grows unbounded. Should be pruned periodically (see recommendations).
4. **`searxng/searxng` image (375 MB, 2 months old)** — kept; may be referenced by the R&D agent's competitor-search flow. Not touched pending confirmation.
5. **17 total docker images = 14.48 GB** with 2.88 GB still reclaimable (dangling filter). All active supabase-* images preserved per platform memory ("supabase-* stays up").
6. **No log rotation in place** — `/tmp/blockid-cron.log` grew to 91K in one day; extrapolates to ~30 MB/year but the cron-runner.sh internal 200KB rotation cited in `crontab.production` may already handle this. Confirm.

## Recommendations

### 1. Kill stale next-server processes after next deploy

```bash
# After confirming :4001 is healthy and no build is active:
kill 617064 2894338
```

Adds ~112 MB free RAM. Root cause worth checking: verify `deploy-live.sh` always kills old PIDs on port swap failure (grep for `4002` should return zero — if it doesn't, delete that legacy branch).

### 2. Add weekly Next.js cache prune to crontab.production

Currently `web/.next/cache` is unbounded. Add:

```cron
# Weekly Next.js cache trim (Sundays 03:15 UTC) — Webpack rebuilds it on next build
15 3 * * 0 find /home/dovanlong/blockid.au/web/.next/cache -type f -mtime +7 -delete 2>&1 | tail -5 >> /tmp/blockid-cleanup.log
```

### 3. Add logrotate config for `/tmp/blockid-*.log`

Even though nothing is currently huge, drop-in insurance. As `~/.config/logrotate/blockid.conf`, invoked from cron `0 4 * * * /usr/sbin/logrotate --state ~/.local/share/logrotate.state ~/.config/logrotate/blockid.conf`:

```
/tmp/blockid-production.log
/tmp/blockid-production-new.log
/tmp/blockid-cron.log
/tmp/blockid-self-upgrade.log
/tmp/blockid-token-refresh.log
/tmp/blockid-deploy-*.log
{
    size 50M
    rotate 3
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` avoids needing to signal the Node process. `rotate 3` keeps three compressed generations (typically < 5 MB total).

### 4. Add monthly docker volume-prune to cron

To prevent future `runner-*` or dangling volumes accumulating silently:

```cron
# Monthly docker volume prune — safe, only unlinked volumes
30 4 1 * * docker volume prune -f 2>&1 | tee -a /tmp/blockid-cleanup.log
```

### 5. Consider removing `searxng/searxng` image (375 MB) if R&D agent has moved on

Verify with `grep -r searxng /home/dovanlong/blockid.au/web/src` before removal.

## Summary

Cleanup was low-risk (~4.3 GB freed, all from CI/Docker artifacts violating the "no Docker/CI deploy" policy). Overall disk pressure is **not a concern** at 15% / 6%. Main hygiene items are (a) killing two stale Next.js processes and (b) adding preventive rotation for logs, docker volumes, and Next.js cache.
