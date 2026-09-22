#!/usr/bin/env python3
"""Execute admission only in temporary trees; no runtime HTTP/process calls."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]
CONTROL = dict(version=1, owner='g30', status='active', source_of_truth='docs/plans/SOURCE-OF-TRUTH.md')
WRITERS = ['agent-orchestrator', 'agent-auto-improve', 'agent-deploy', 'agent-healthcheck', 'agent-guardian', 'publish-insight']
class TestAdmission(unittest.TestCase):
    def test_admission_matrix(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); (root/'web/scripts').mkdir(parents=True); (root/'docs/plans').mkdir(parents=True)
            log=root/'cron.log'; control=root/'docs/plans/g30-execution-control.json'
            source=(ROOT/'web/scripts/cron-runner.sh').read_text().split('# END G30 cron ownership admission')[0]
            source=source.replace('/tmp/blockid-cron.log',str(log))+'\nprintf "ADMITTED\\n"\ncurl() { printf "MOCK_CURL_CALLED\\n"; }\ncurl fixture.invalid\n'
            script=root/'web/scripts/cron-runner.sh';script.write_text(source)
            for raw in [None, 'not-json', '{}', json.dumps({**CONTROL,'version':True}), json.dumps(CONTROL)]:
                if control.exists():control.unlink()
                if raw is not None:control.write_text(raw)
                for endpoint in WRITERS:
                    result=subprocess.run(['bash',str(script),endpoint],capture_output=True,text=True)
                    self.assertEqual(result.returncode,0,result.stderr);self.assertNotIn('ADMITTED',result.stdout);self.assertNotIn('MOCK_CURL_CALLED',result.stdout)
                    self.assertIn('deferred',log.read_text());self.assertNotIn('status=ok',log.read_text())
                read_only=subprocess.run(['bash',str(script),'health-status'],capture_output=True,text=True)
                self.assertIn('ADMITTED',read_only.stdout)
            control.write_text(json.dumps({**CONTROL,'status':'released'}))
            for endpoint in WRITERS:
                result=subprocess.run(['bash',str(script),endpoint],capture_output=True,text=True)
                self.assertIn('ADMITTED',result.stdout)
    def test_before_http_and_secret_reads(self):
        source=(ROOT/'web/scripts/cron-runner.sh').read_text()
        self.assertLess(source.index('# END G30 cron ownership admission'),source.index('CRON_SECRET='))
        self.assertLess(source.index('# END G30 cron ownership admission'),source.index('LOCK_FILE='))
if __name__=='__main__':unittest.main()
