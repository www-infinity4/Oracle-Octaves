"""Regression tests for the standalone Oracle routing model; no extra packages."""
import unittest
import route_timeout_experiment as o

class OracleOctavesRoutingTests(unittest.TestCase):
    def test_all_sample_lengths(self):
        self.assertEqual(o.classify(o.SAMPLES["Bulk Machine Log"])["bytes"], 1000)
        self.assertEqual(o.classify(o.SAMPLES["Conversational Baseline"])["bytes"], 64)
        self.assertEqual(o.classify(o.SAMPLES["Sophisticated Packet"])["bytes"], 99)

    def test_entropy(self):
        self.assertEqual(o.entropy("AAAA"), 0.0)
        self.assertAlmostEqual(o.entropy("ABAB"), 1.0)
        self.assertEqual(o.entropy(""), 0.0)

    def test_unicode_sizes(self):
        self.assertEqual(o.classify("é")["bytes"], 2)
        self.assertEqual(o.classify("é")["H_char_bits_per_character"], 0)

    def test_mock_is_not_a_hardware_claim(self):
        m=o.classify("Quantum processor")
        self.assertIs(m["verified_hardware_route"], False)
        samples=o.jobs(20, 1500)
        cpu=o.simulate(samples)
        assumed=o.simulate(samples, split=True)
        self.assertEqual(cpu["jobs"], 60)
        self.assertEqual(cpu["simulated_vector_jobs"], 0)
        self.assertEqual(assumed["simulated_vector_jobs"], 20)
        self.assertGreater(cpu["simulated_timeouts"], assumed["simulated_timeouts"])

    def test_cpu_benchmark_does_not_claim_accelerator(self):
        for result in o.real_cpu_benchmark(repeats=2).values():
            self.assertEqual(result["accelerator_used"], False)
            self.assertGreaterEqual(result["median_CPU_us"], 0)

if __name__ == "__main__":
    unittest.main()
