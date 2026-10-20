#!/usr/bin/env python3
"""L1-7: diff the repo crontab (single source of truth) against `crontab -l`.

Comments, blank lines and whitespace runs are ignored; environment lines
(RUN=…) and every active job line count. Read-only: never installs anything.

  python3 web/scripts/crontab-drift.py            # human report
  python3 web/scripts/crontab-drift.py --json     # machine report
  python3 web/scripts/crontab-drift.py --live-file saved.cron

Exit 0 = in sync, 1 = drift, 2 = a side could not be read.
Used as a non-fatal warning by deploy-auto.sh. Fix drift by editing
web/scripts/crontab.production and installing it:
  crontab -n web/scripts/crontab.production && crontab web/scripts/crontab.production
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys

REPO_CRONTAB = Path(__file__).resolve().with_name('crontab.production')


def active_lines(text):
    lines = []
    for raw in text.splitlines():
        line = ' '.join(raw.split())
        if line and not line.startswith('#'):
            lines.append(line)
    return lines


def diff(repo_text, live_text):
    repo, live = Counter(active_lines(repo_text)), Counter(active_lines(live_text))
    return {
        'in_sync': repo == live,
        'missing_from_live': sorted((repo - live).elements()),   # repo says run, host does not
        'extra_in_live': sorted((live - repo).elements()),       # host runs, repo does not record
        'repo_active': sum(repo.values()), 'live_active': sum(live.values()),
    }


def read_live(path=None):
    if path:
        return Path(path).read_text()
    result = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError('crontab -l failed: ' + result.stderr.strip()[:200])
    return result.stdout


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo-file', type=Path, default=REPO_CRONTAB)
    parser.add_argument('--live-file', type=Path)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    try:
        report = diff(args.repo_file.read_text(), read_live(args.live_file))
    except Exception as error:
        print(json.dumps({'error': 'unreadable', 'detail': str(error)[:300]}) if args.json else f'crontab drift: cannot compare ({error})')
        return 2
    if args.json:
        print(json.dumps(report))
    elif report['in_sync']:
        print(f"crontab in sync ({report['repo_active']} active lines)")
    else:
        print(f"crontab DRIFT: repo {report['repo_active']} vs live {report['live_active']} active lines")
        for line in report['missing_from_live']:
            print(f'  - repo only (not installed): {line}')
        for line in report['extra_in_live']:
            print(f'  + live only (not in repo):   {line}')
    return 0 if report['in_sync'] else 1


if __name__ == '__main__':
    sys.exit(main())
