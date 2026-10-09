"""Unit tests for the dependency-free Oracle Data Octave instrument."""
import base64
import csv
import tempfile
import unittest
from pathlib import Path

import data_octave_validation as octave


class MetricsTests(unittest.TestCase):
    def record(self, payload=b"ABAB", **values):
        return octave.Record(
            sample_id=values.get("id", "test"),
            payload=payload,
            events=values.get("events", 10),
            observation_ms=values.get("observation_ms", 1000),
            lifecycle_ms=values.get("lifecycle_ms", 250),
            processing_us=values.get("processing_us", 400),
            timeout=values.get("timeout", False),
        )

    def test_entropy_measures_bits_per_observed_byte(self):
        self.assertEqual(octave.shannon_byte_entropy(b"AAAAAA"), 0)
        self.assertAlmostEqual(octave.shannon_byte_entropy(b"ABABAB"), 1, places=8)
        self.assertAlmostEqual(octave.shannon_byte_entropy(bytes(range(256))), 8, places=8)
        self.assertEqual(octave.shannon_byte_entropy(b""), 0)

    def test_vectors_have_five_finite_values(self):
        x = octave.features(self.record(b"AB" * 200))
        self.assertEqual(len(x), 5)
        self.assertAlmostEqual(x[0], 1, places=7)
        self.assertGreater(x[1], 0)
        self.assertGreater(x[2], 0)
        self.assertGreater(x[3], 0)
        self.assertGreater(x[4], 0)

    def test_rejects_impossible_observation_windows(self):
        with self.assertRaises(ValueError):
            octave.features(self.record(observation_ms=0))
        with self.assertRaises(ValueError):
            octave.features(self.record(lifecycle_ms=-1))
        with self.assertRaises(ValueError):
            octave.features(self.record(events=-1))

    def test_tier_labels_stay_in_five_levels(self):
        vectors = [octave.features(self.record(
            bytes([i]) * (32 + i * 24), events=2 + i))
            for i in range(25)]
        calibration = octave.calibrate_tiers(vectors[:20])
        self.assertTrue(all(0 <= octave.tier_index(x, calibration) <= 4
                            for x in vectors))

    def test_prediction_compares_size_and_five_metric_baselines(self):
        data = [self.record(bytes([i % 251]) * (64 + (i * 37)),
                            id=str(i), events=1 + (i % 8),
                            lifecycle_ms=40 + (i % 6) * 20,
                            processing_us=200 + 2.4 * i + (i % 4))
                for i in range(45)]
        report = octave.validate(data, splits=3, seed=123)
        self.assertEqual(report["observations"], 45)
        self.assertEqual(report["splits"], 3)
        for model in ("mean_only", "size_only", "octave_tier_only", "five_metrics"):
            self.assertIn(model, report["holdout_evaluation"])
            self.assertGreaterEqual(report["holdout_evaluation"][model]["MAE_us"], 0)
        self.assertEqual(len(report["holdout_timeout_counts_by_tier"]), 5)

    def test_csv_accepts_base64_and_text_without_leaking_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "traces.csv"
            with file.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "id", "payload_text", "payload_base64", "event_count",
                    "observation_ms", "lifecycle_ms", "processing_us", "timeout"])
                writer.writeheader()
                writer.writerow({"id": "text", "payload_text": "alpha beta",
                                 "event_count": "5", "observation_ms": "1000",
                                 "lifecycle_ms": "50", "processing_us": "23"})
                writer.writerow({"id": "binary",
                                 "payload_base64": base64.b64encode(b"\x00\xfe").decode(),
                                 "event_count": "8", "observation_ms": "100",
                                 "lifecycle_ms": "20", "processing_us": "19",
                                 "timeout": "true"})
            rows = octave.read_csv(file)
        self.assertEqual([r.payload for r in rows], [b"alpha beta", b"\x00\xfe"])
        self.assertTrue(rows[1].timeout)
        self.assertFalse(rows[0].timeout)


if __name__ == "__main__":
    unittest.main()
