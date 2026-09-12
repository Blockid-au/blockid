#!/usr/bin/env bash
# Shim — the canonical backup script moved to scripts/db-backup.sh (repo root)
# in release QA-3 P0-4 (custom-format dump + sha256 sidecar + 14d/8w retention
# + Telegram alert + non-zero exit). Kept so old references keep working.
exec /home/dovanlong/blockid.au/scripts/db-backup.sh "$@"
