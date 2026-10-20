#!/bin/bash
# Shared production env loader (sourced, never executed).
#
# Extracted verbatim from deploy-live.sh (L1-4, 2026-10-20) so the boot path
# (g30-boot-serve.sh) launches origins with exactly the environment a deploy
# gives them. g30-supervised-launch.py copies only names present in web/.env
# from the caller's exported environment, so both callers must load it the
# same way. Requires WEB_DIR. Callers: deploy-live.sh, g30-boot-serve.sh.
load_env() {
  eval "$(node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('$WEB_DIR/.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx);
      let val = trimmed.slice(idx + 1);
      if ((val.startsWith('\"') && val.endsWith('\"')) || (val.startsWith(\"'\") && val.endsWith(\"'\"))) {
        val = val.slice(1, -1);
      }
      const escaped = val.replace(/'/g, \"'\\\\\\\"'\\\\\\\"'\");
      console.log('export ' + key + \"='\" + escaped + \"'\");
    }
  ")"
  export NODE_ENV=production
  export HOSTNAME=0.0.0.0
  export SUPABASE_URL=http://127.0.0.1:8000
  export REDIS_URL=redis://127.0.0.1:6379
}
