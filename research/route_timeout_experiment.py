#!/usr/bin/env python3
"""Data Octave bottleneck experiment.

The octave thresholds are hypotheses. 'Mock vector' denotes an assumed
second queue, NOT actual SIMD execution or hardware/DMA routing.
No pip or external dependencies.
"""
import argparse
import hashlib
import json
import math
import statistics
import time
import zlib
from collections import Counter

SAMPLES = {
 "Bulk Machine Log": "A"*1000,
 "Conversational Baseline": "he is really freaking smart he went to college to learn that all",
 "Sophisticated Packet": "Highly sophisticated algorithmic processing architectures exhibit high structural entropy profiles.",
}

def entropy(values):
    if not values:
        return 0.0
    n=len(values)
    return -sum((count/n)*math.log2(count/n) for count in Counter(values).values())

def classify(text):
    encoded=text.encode("utf-8")
    h=entropy(text)
    size=len(encoded)
    tier, route = (
        ("N+1 Compressed (hypothesis)", "vector_candidate") if h>4.1 and size<150
        else ("N Standard (hypothesis)", "cpu_candidate") if h>3.0
        else ("N-1 Sustained (hypothesis)", "bulk_candidate")
    )
    return {
      "bytes":size,
      "H_char_bits_per_character":round(h,5),
      "H_byte_bits_per_byte":round(entropy(encoded),5),
      "original_entropy_divided_by_bytes":round(h/size,7) if size else 0,
      "zlib_to_raw_size_ratio":round(len(zlib.compress(encoded))/size,5) if size else None,
      "tier":tier,"route_candidate":route,
      "verified_hardware_route":False
    }

def jobs(copies,spacing):
    out=[]
    for i in range(copies):
        for j, text in enumerate(SAMPLES.values()):
            result=classify(text)
            out.append(((3*i+j)*spacing,result["bytes"],result["route_candidate"]=="vector_candidate"))
    return out

def simulate(jobs, split=False, deadline_us=4800):
    """Two deterministic queues with ASSUMED timing; no real accelerator."""
    cpu_free,vector_free=0.0,0.0
    observations=[]
    for arrival,size,vector_candidate in jobs:
        use_vector=split and vector_candidate
        if use_vector:
            service=270+size/1.5
            start=max(arrival,vector_free)
            vector_free=start+service
        else:
            service=2600+size/0.32
            start=max(arrival,cpu_free)
            cpu_free=start+service
        latency=start+service-arrival
        observations.append((latency,latency>deadline_us,use_vector))
    latencies=sorted(r[0] for r in observations)
    idx=max(0,math.ceil(.95*len(latencies))-1)
    return {
      "assumed_hardware_model":"mock_split_vector_queue" if split else "mock_single_cpu_queue",
      "jobs":len(jobs),
      "assumed_deadline_us":deadline_us,
      "simulated_vector_jobs":sum(r[2] for r in observations),
      "simulated_timeouts":sum(r[1] for r in observations),
      "simulated_p50_us":round(statistics.median(latencies),2),
      "simulated_p95_us":round(latencies[idx],2)
    }

def real_cpu_benchmark(repeats=15):
    """Real local timing of THE SAME CPU workload, NOT specialized routing."""
    result={}
    for name,text in SAMPLES.items():
        payload=text.encode("utf-8")
        durations=[]
        for i in range(repeats):
            started=time.perf_counter_ns()
            hashlib.sha256(payload).digest()
            zlib.compress(payload)
            durations.append((time.perf_counter_ns()-started)/1000)
        result[name]={"median_CPU_us":round(statistics.median(durations),3),
                      "bytes":len(payload),"accelerator_used":False}
    return result

def report(copies=20, spacing_us=1500, deadline_us=4800, measure=False):
    observations=jobs(copies,spacing_us)
    return {
      "warning":"Simulated queue performance does NOT validate physical routing or prove hypothesis A.",
      "sample_metrics":{name:classify(text) for name,text in SAMPLES.items()},
      "mock_comparison":[simulate(observations,False,deadline_us),
                         simulate(observations,True,deadline_us)],
      "actual_local_CPU_measurements":real_cpu_benchmark() if measure else None,
      "required_real_validation":"Randomize workloads, keep operations identical, measure actual CPU/SIMD paths with instrumentation and collect timeout and scheduler traces."
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--copies",type=int,default=20)
    parser.add_argument("--spacing-us",type=float,default=1500)
    parser.add_argument("--deadline-us",type=float,default=4800)
    parser.add_argument("--measure",action="store_true")
    args=parser.parse_args()
    if args.copies<1 or args.spacing_us<=0 or args.deadline_us<=0:
        parser.error("copies, spacing and deadline must be positive")
    print(json.dumps(report(args.copies,args.spacing_us,args.deadline_us,args.measure),indent=2))

if __name__=="__main__":
    main()
