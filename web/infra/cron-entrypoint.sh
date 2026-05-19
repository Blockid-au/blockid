#!/bin/sh
# BlockID cron entrypoint.
# Generates the crontab at runtime so $CRON_SECRET is resolved from the env.

cat > /etc/crontabs/root <<EOF
# SVI snapshot — every Sunday 14:00 UTC (midnight AEST)
0 14 * * 0   wget -qO- --header="Authorization: Bearer ${CRON_SECRET}" http://web:3000/api/cron/svi-snapshot >> /var/log/cron.log 2>&1

# Notification check — daily 22:00 UTC (8am AEST)
0 22 * * *   wget -qO- --header="Authorization: Bearer ${CRON_SECRET}" http://web:3000/api/cron/svi-notify >> /var/log/cron.log 2>&1
EOF

echo "[blockid:cron] Cron jobs installed. Starting crond..."
crond -f -l 2
