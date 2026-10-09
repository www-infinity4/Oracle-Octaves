#!/usr/bin/env python3
"""Oracle Data Octaves: measurable features and out-of-sample hypothesis test.

No pip, NumPy or SciPy required. This is a research instrument, not a
CPU scheduler and not a demonstration of acoustic frequency doubling.
"""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import math
import random
import statistics
import time
import zlib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

FEATURE_NAMES = (
    "entropy_bits_per_byte",
    "log1p_event_rate_per_second",
    "log1p_payload_bytes",
    "zlib_size_ratio",
    "log1p_lifecycle_ms",
)
# Pre-registered *heuristic* signs, NOT fitted physical laws.
WEIGHTS = (0.20, 0.25, -0.20, 0.20, -0.15)
TIERS = ("N-2 Foundational", "N-1 Sustained", "N Baseline",
         "N+1 Compressed", "N+2 Ultra-Dense")


@dataclass(frozen=True)
class Record:
    sample_id: str
    payload: bytes
    events: float
    observation_ms: float
    lifecycle_ms: float
    processing_us: float
    timeout: bool = False


def shannon_byte_entropy(payload: bytes) -> float:
    """Plug-in Shannon entropy of observed byte frequencies, 0-8 bits/byte."""
    if not payload:
        return 0.0
    total = len(payload)
    counts = Counter(payload)
    return -sum((n / total) * math.log2(n / total) for n in counts.values())


def features(record: Record) -> tuple[float, ...]:
    if record.observation_ms <= 0 or record.lifecycle_ms < 0:
        raise ValueError("observation_ms must be positive; lifecycle_ms nonnegative")
    if record.events < 0 or record.processing_us < 0:
        raise ValueError("events and processing_us must be nonnegative")
    n = len(record.payload)
    ratio = len(zlib.compress(record.payload, level=6)) / max(1, n)
    return (shannon_byte_entropy(record.payload),
            math.log1p(record.events * 1000.0 / record.observation_ms),
            math.log1p(n), ratio, math.log1p(record.lifecycle_ms))


def feature_report(record: Record) -> dict:
    vector = features(record)
    return {
        "id": record.sample_id,
        "H_bits_per_byte": round(vector[0], 5),
        "R_e_events_per_s": round(record.events * 1000 / record.observation_ms, 5),
        "S_b_bytes": len(record.payload),
        "C_g_zlib_ratio_proxy": round(vector[3], 5),
        "delta_t_ms": record.lifecycle_ms,
        "processing_us": round(record.processing_us, 5),
        "timeout": record.timeout,
    }


def means_and_scales(xs: list[tuple[float, ...]]):
    dims = len(xs[0])
    mean = [statistics.fmean(row[j] for row in xs) for j in range(dims)]
    scale = [max(1e-8, math.sqrt(statistics.fmean(
        (row[j] - mean[j]) ** 2 for row in xs))) for j in range(dims)]
    return mean, scale


def standardized(row, mean, scale):
    return [(value - mu) / sigma for value, mu, sigma in zip(row, mean, scale)]


def rank_score(row, mean, scale) -> float:
    return sum(w * x for w, x in zip(
        WEIGHTS, standardized(row, mean, scale)))


def percentile(sorted_values: list[float], fraction: float) -> float:
    at = (len(sorted_values) - 1) * fraction
    lo = math.floor(at)
    hi = math.ceil(at)
    weight = at - lo
    return sorted_values[lo] * (1 - weight) + sorted_values[hi] * weight


def calibrate_tiers(train_x):
    """Use *training inputs only* to define tiers (no timing labels leaked)."""
    mean, scale = means_and_scales(train_x)
    scores = sorted(rank_score(x, mean, scale) for x in train_x)
    boundaries = [percentile(scores, i / 5) for i in range(1, 5)]
    return mean, scale, boundaries


def tier_index(x, calibration) -> int:
    mean, scale, boundaries = calibration
    score = rank_score(x, mean, scale)
    return sum(score > boundary for boundary in boundaries)


def solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Small linear system via partial-pivot Gaussian elimination."""
    n = len(b)
    m = [row[:] + [y] for row, y in zip(a, b)]
    for k in range(n):
        pivot = max(range(k, n), key=lambda j: abs(m[j][k]))
        m[k], m[pivot] = m[pivot], m[k]
        if abs(m[k][k]) < 1e-12:
            raise ValueError("Singular regression matrix")
        divisor = m[k][k]
        for j in range(k, n + 1):
            m[k][j] /= divisor
        for i in range(n):
            if i == k:
                continue
            mul = m[i][k]
            for j in range(k, n + 1):
                m[i][j] -= mul * m[k][j]
    return [m[i][n] for i in range(n)]


def fit_ridge(xs, targets, penalty=0.4):
    """Fit log-latency; ridge regularizes features, not the intercept."""
    width = len(xs[0]) + 1
    rows = [[1.0, *x] for x in xs]
    a = [[sum(row[i] * row[j] for row in rows)
          + (penalty if i == j and i else 0)
          for j in range(width)] for i in range(width)]
    b = [sum(row[i] * y for row, y in zip(rows, targets))
         for i in range(width)]
    return solve(a, b)


def infer(coef, row):
    log_y = coef[0] + sum(w * x for w, x in zip(coef[1:], row))
    return max(0.0, math.expm1(min(30.0, max(0.0, log_y))))


def error_metrics(actual: list[float], predicted: list[float]) -> dict:
    return {
        "MAE_us": statistics.fmean(abs(a - b) for a, b in zip(actual, predicted)),
        "RMSE_us": math.sqrt(statistics.fmean(
            (a - b) ** 2 for a, b in zip(actual, predicted))),
    }


def validate(records: list[Record], splits=5, seed=19) -> dict:
    """Compare no-feature, size-only, tier-only and five-feature predictors."""
    if len(records) < 24:
        raise ValueError("Need at least 24 independent observations")
    x = [features(r) for r in records]
    y = [r.processing_us for r in records]
    results = {name: [] for name in ("mean_only", "size_only",
                                   "octave_tier_only", "five_metrics")}
    tier_timeouts = [[0, 0] for _ in TIERS]
    for split in range(splits):
        indices = list(range(len(records)))
        random.Random(seed + split).shuffle(indices)
        cut = max(16, min(len(records) - 6, round(len(records) * 0.8)))
        train, test = indices[:cut], indices[cut:]
        calibration = calibrate_tiers([x[i] for i in train])
        train_y_log = [math.log1p(y[i]) for i in train]
        feature_mean, feature_scale = means_and_scales([x[i] for i in train])
        all_train = [standardized(x[i], feature_mean, feature_scale) for i in train]
        all_test = [standardized(x[i], feature_mean, feature_scale) for i in test]
        tier_train = [[float(tier_index(x[i], calibration))] for i in train]
        tier_test = [[float(tier_index(x[i], calibration))] for i in test]
        train_sets = {
            "size_only": [[row[2]] for row in all_train],
            "octave_tier_only": tier_train,
            "five_metrics": all_train,
        }
        test_sets = {
            "size_only": [[row[2]] for row in all_test],
            "octave_tier_only": tier_test,
            "five_metrics": all_test,
        }
        mean_us = statistics.fmean(y[i] for i in train)
        actual = [y[i] for i in test]
        results["mean_only"].append(error_metrics(actual, [mean_us] * len(test)))
        for model in train_sets:
            coef = fit_ridge(train_sets[model], train_y_log)
            predicted = [infer(coef, row) for row in test_sets[model]]
            results[model].append(error_metrics(actual, predicted))
        if split == 0:
            for i in test:
                t = tier_index(x[i], calibration)
                tier_timeouts[t][0] += 1
                tier_timeouts[t][1] += int(records[i].timeout)
    summary = {
        name: {metric: round(statistics.fmean(row[metric] for row in trials), 5)
               for metric in ("MAE_us", "RMSE_us")}
        for name, trials in results.items()
    }
    base = summary["size_only"]["MAE_us"]
    full = summary["five_metrics"]["MAE_us"]
    improvement = 100 * (base - full) / base if base > 0 else 0
    return {
        "observations": len(records), "splits": splits,
        "features": list(FEATURE_NAMES),
        "tier_names": list(TIERS),
        "tier_weights_pre_registered": list(WEIGHTS),
        "holdout_evaluation": summary,
        "five_metric_improvement_vs_size_only_pct": round(improvement, 3),
        "five_metric_outperforms_size_baseline_by_5pct": improvement >= 5,
        "holdout_timeout_counts_by_tier": [
            {"tier": tier, "observations": n, "timeouts": t}
            for tier, (n, t) in zip(TIERS, tier_timeouts)],
        "interpretation": (
            "Association on these samples only. A positive result does not "
            "verify vector-register, cache-isolation or octave-transition "
            "hypotheses; those require instrumented randomized experiments."
        ),
    }


def parse_bool(s) -> bool:
    return str(s).strip().lower() in {"1", "true", "yes", "y"}


def read_csv(path: Path) -> list[Record]:
    rows = []
    with path.open(newline="", encoding="utf-8") as handle:
        for i, row in enumerate(csv.DictReader(handle), 1):
            payload64 = row.get("payload_base64", "").strip()
            if payload64:
                payload = base64.b64decode(payload64, validate=True)
            else:
                payload = (row.get("payload_text") or "").encode("utf-8")
            rows.append(Record(
                sample_id=row.get("id") or str(i),
                payload=payload,
                events=float(row.get("event_count") or 0),
                observation_ms=float(row.get("observation_ms") or 1000),
                lifecycle_ms=float(row.get("lifecycle_ms") or 0),
                processing_us=float(row["processing_us"]),
                timeout=parse_bool(row.get("timeout", "false")),
            ))
    return rows


def process_payload(payload: bytes, repeat=12) -> None:
    """Fixed test workload; no special vector or hardware path is assumed."""
    for _ in range(repeat):
        hashlib.sha256(payload).digest()
        zlib.compress(payload, level=6)


def demo_records() -> list[Record]:
    """Actual *local CPU timings*, synthetic input data. Not production traces."""
    rng = random.Random(20261009)
    records = []
    patterns = ("constant", "alternating", "english", "random", "blocks")
    for size in (64, 256, 1024, 4096, 16384, 65536):
        for kind in patterns:
            for variation in range(3):
                if kind == "constant":
                    data = bytes([65 + variation]) * size
                elif kind == "alternating":
                    data = (b"ABCD" * (size // 4 + 1))[:size]
                elif kind == "english":
                    data = (b"study energy chemistry science research " *
                            (size // 40 + 2))[:size]
                elif kind == "random":
                    data = bytes(rng.getrandbits(8) for _ in range(size))
                else:
                    data = (bytes(rng.getrandbits(8) for _ in range(128)) *
                            (size // 128 + 1))[:size]
                process_payload(data, 2)  # warm-up outside measurement
                started = time.perf_counter_ns()
                process_payload(data)
                elapsed_us = (time.perf_counter_ns() - started) / 1000.0
                observation = (100, 500, 2000)[variation]
                # Cadence/lifecycle are input descriptors, not derived from cost.
                events = (1, 25, 100)[(variation + patterns.index(kind)) % 3]
                lifecycle = (4, 150, 4000)[(variation + size // 256) % 3]
                records.append(Record(
                    sample_id=f"{kind}-{size}-{variation}", payload=data,
                    events=events, observation_ms=observation,
                    lifecycle_ms=lifecycle, processing_us=elapsed_us))
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--demo", action="store_true",
                       help="Measure synthetic payload processing on this device")
    group.add_argument("--csv", type=Path,
                       help="Use your own measured and labeled CSV traces")
    parser.add_argument("--out", type=Path, help="Write a JSON report")
    parser.add_argument("--splits", type=int, default=5)
    args = parser.parse_args()
    if args.splits < 1 or args.splits > 100:
        parser.error("--splits must be from 1 to 100")
    records = demo_records() if args.demo else read_csv(args.csv)
    report = {
        "method": "held-out ridge prediction on measured processing_us",
        "dataset": "synthetic_payloads_real_local_cpu_timings" if args.demo else "user_supplied_trace",
        "units": {"H": "bits/byte", "R_e": "events/s", "S_b": "bytes",
                  "C_g": "zlib compressed/original ratio (proxy)",
                  "delta_t": "milliseconds", "latency": "microseconds"},
        "validation": validate(records, splits=args.splits),
        "sample_features": [feature_report(r) for r in records[:10]],
    }
    output = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        args.out.write_text(output + "\n", encoding="utf-8")
        print("Report saved to", args.out)
    print(output)


if __name__ == "__main__":
    main()
