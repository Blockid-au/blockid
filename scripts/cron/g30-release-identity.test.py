#!/usr/bin/env python3
"""Exercise the release directory reservation from deploy-live in temp paths only."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

SOURCE = (Path(__file__).resolve().parents[2] / 'web/scripts/deploy-live.sh').read_text()
START = SOURCE.index('mkdir -p "$RELEASES_DIR"', SOURCE.index('BUILD_ID="$(cat "$STANDALONE/.next/BUILD_ID")"'))
END = SOURCE.index('\ncp -a --reflink=auto ', START)
RESERVE = SOURCE[START:END]

class ReleaseIdentityTests(unittest.TestCase):
    def run_case(self, kind):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            releases = root / 'releases'
            releases.mkdir()
            candidate = releases / 'fixture'
            target = root / 'protected'
            target.mkdir()
            marker = target / 'server.js'
            marker.write_text('known-good')
            if kind == 'directory':
                candidate.mkdir()
                (candidate / 'server.js').write_text('known-good')
            elif kind == 'symlink':
                candidate.symlink_to(target, target_is_directory=True)
            elif kind == 'dangling':
                candidate.symlink_to(root / 'missing', target_is_directory=True)
            env = dict(os.environ, RELEASES_DIR=str(releases), RELEASE_DIR=str(candidate), BUILD_ID='fixture')
            result = subprocess.run(['bash', '-c', 'fail() { exit 42; };\n' + RESERVE], env=env, capture_output=True, timeout=5)
            if kind == 'new':
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(candidate.is_dir())
            else:
                self.assertEqual(result.returncode, 42, result.stderr)
                self.assertEqual(marker.read_text(), 'known-good')
                if kind == 'directory':
                    self.assertEqual((candidate / 'server.js').read_text(), 'known-good')
                else:
                    self.assertTrue(candidate.is_symlink())

    def test_new_identity(self): self.run_case('new')
    def test_existing_release_is_preserved(self): self.run_case('directory')
    def test_release_alias_is_preserved(self): self.run_case('symlink')
    def test_dangling_alias_is_not_reused(self): self.run_case('dangling')

if __name__ == '__main__': unittest.main()
