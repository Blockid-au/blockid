import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location("smoke", Path(__file__).with_name("g30-deepinfra-smoke.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def good(case):
    return {"facts": case["facts"], "citations": case["fact_sources"],
            "gaps": case["gaps"], "competitors": [{"name": name, "source_ids": [next(k for k, value in case["evidence"].items() if name in value)]} for name in case["competitors"]],
            "valuation_status": "unavailable", "summary": {"en": "Review the evidence and its limits.", "vi": "Cần xem xét bằng chứng và giới hạn."}}


def response(job, case):
    return {"model": job["model"], "usage": {"prompt_tokens": 500, "completion_tokens": 100, "estimated_cost": 0.0001},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(good(case))}}]}


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.case = m.load_cases()[0]
        self.job = m.make_job(self.case, "classify", m.ROLES["classify"][0])

    def test_dry_manifest_no_network(self):
        with patch.object(m, "http_transport", side_effect=AssertionError("network")):
            packet = m.manifest()
        self.assertEqual(len(packet["jobs"]), 64)
        self.assertEqual(Decimal(packet["total_reserved_usd"]), Decimal("0.098944"))
        self.assertEqual({j["case_id"] for j in packet["jobs"]}, {f"S0{i}" for i in range(1, 9)})

    def test_whole_budget_rejects_before_transport(self):
        transport = Mock()
        with self.assertRaisesRegex(ValueError, "whole_run_budget"):
            m.run([self.job], Decimal("0.000001"), transport, lambda _: None)
        transport.assert_not_called()

    def test_wrong_provider_endpoint_model_rejected(self):
        for key, value in [("provider", "openrouter"), ("endpoint", "https://other.test"), ("model", "new-model")]:
            transport = Mock()
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.run([{**self.job, key: value}], Decimal("1"), transport, lambda _: None)
            transport.assert_not_called()

    def test_checkpoint_failure_prevents_dispatch(self):
        transport = Mock()
        with self.assertRaises(OSError):
            m.run([self.job], Decimal("1"), transport, Mock(side_effect=OSError("disk")))
        transport.assert_not_called()

    def test_reservation_precedes_attempt_and_no_retry(self):
        saved = []
        def transport(job):
            self.assertEqual(saved[-1]["results"][-1]["status"], "reserved")
            raise TimeoutError("SECRET SHOULD NOT BE LOGGED")
        mock = Mock(side_effect=transport)
        result = m.run([self.job, self.job], Decimal("1"), mock, lambda ledger: saved.append(json.loads(json.dumps(ledger))))
        self.assertEqual(mock.call_count, 1)
        self.assertEqual(result["reserved_usd"], self.job["reserved_usd"])
        self.assertIsNone(result["results"][0]["actual_provider_cost_usd"])
        self.assertNotIn("SECRET", json.dumps(result))

    def test_absent_usage_or_cost_stops_and_stays_unknown(self):
        for missing in ["usage", "estimated_cost"]:
            data = response(self.job, self.case)
            if missing == "usage":
                data.pop("usage")
            else:
                data["usage"].pop("estimated_cost")
            transport = Mock(return_value=data)
            result = m.run([self.job, self.job], Decimal("1"), transport, lambda _: None)
            self.assertEqual(transport.call_count, 1)
            self.assertIsNone(result["results"][0]["actual_provider_cost_usd"])
            self.assertIn("unknown", result["stopped"])

    def test_malformed_and_wrong_returned_model_stop(self):
        for variant in ["json", "model", "length", "token_overrun", "cost_overrun"]:
            data = response(self.job, self.case)
            if variant == "json": data["choices"][0]["message"]["content"] = "not json"
            if variant == "model": data["model"] = "other/model"
            if variant == "length": data["choices"][0]["finish_reason"] = "length"
            if variant == "token_overrun": data["usage"]["completion_tokens"] = 1001
            if variant == "cost_overrun": data["usage"]["estimated_cost"] = 10
            transport = Mock(return_value=data)
            result = m.run([self.job, self.job], Decimal("1"), transport, lambda _: None)
            self.assertEqual(result["results"][0]["status"], "failed")
            self.assertEqual(transport.call_count, 1)

    def test_compatible_result_tracks_actual_and_reserved_separately(self):
        result = m.run([self.job], Decimal("1"), lambda j: response(j, self.case), lambda _: None)
        row = result["results"][0]
        self.assertIsNone(result["stopped"])
        self.assertEqual(row["actual_provider_cost_usd"], "0.0001")
        self.assertEqual(result["reserved_usd"], self.job["reserved_usd"])
        self.assertTrue(row["evaluation"]["deterministic_pass"])
        self.assertEqual(row["evaluation"]["human_review"], "pending")

    def test_unsupported_financial_facts_fail(self):
        for key, value in [("sam_aud", 310), ("churn_pct", 5), ("invented_valuation", 10000000)]:
            output = good(self.case)
            output["facts"] = {**output["facts"], key: value}
            self.assertFalse(m.grade(self.case, output)["deterministic_pass"])

    def test_null_not_zero_and_negative_not_positive(self):
        for index, key, value in [(1, "revenue_aud", 0), (4, "operating_cash_flow_aud", 100000)]:
            case = m.load_cases()[index]
            output = good(case)
            output["facts"] = {**output["facts"], key: value}
            self.assertFalse(m.grade(case, output)["deterministic_pass"])

    def test_competitor_abstention_and_no_padding(self):
        for index in [5, 6]:
            case = m.load_cases()[index]
            output = good(case)
            self.assertTrue(m.grade(case, output)["deterministic_pass"])
            output["competitors"].append({"name": "Invented rival", "source_ids": ["E1"]})
            self.assertFalse(m.grade(case, output)["deterministic_pass"])

    def test_known_but_wrong_fact_source_fails(self):
        case = m.load_cases()[3]
        output = good(case)
        output["citations"] = {k: ["E1"] for k in case["facts"]}
        self.assertFalse(m.grade(case, output)["deterministic_pass"])

    def test_unknown_citations_and_valuation_fail(self):
        output = good(self.case)
        output["citations"] = {k: ["unknown"] for k in self.case["facts"]}
        output["valuation_status"] = "available"
        result = m.grade(self.case, output)
        self.assertIn("unsupported_or_missing_citation", result["errors"])
        self.assertIn("unsupported_company_valuation", result["errors"])

    def test_cli_requires_execute_budget_and_never_overwrites(self):
        script = str(Path(__file__).with_name("g30-deepinfra-smoke.py"))
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "manifest.json")
            missing = subprocess.run([sys.executable, script, "--execute", "--output", target], capture_output=True)
            self.assertNotEqual(missing.returncode, 0)
            self.assertFalse(Path(target).exists())
            dry = subprocess.run([sys.executable, script, "--output", target], capture_output=True)
            self.assertEqual(dry.returncode, 0, dry.stderr)
            before = Path(target).read_bytes()
            duplicate = subprocess.run([sys.executable, script, "--output", target], capture_output=True)
            self.assertNotEqual(duplicate.returncode, 0)
            self.assertEqual(Path(target).read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
