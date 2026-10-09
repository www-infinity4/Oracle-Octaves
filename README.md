# Oracle Octaves

Oracle Octaves is a real Phi workspace hosted at **https://quantaphi.org/oracle-octaves/**. It uses the same first-party wallet as QuantaPhi and the unified Infinity Phi-style Oracle cards and rounded button system. Five-note piano Quants and completed Infinity Radio listening tracks use authenticated Cloudflare music-quant receipts.

The original demo remains at **https://quantaphi.org/oracle-octaves/?demo=1**. Demo credits stay in memory and never touch the real wallet.

## Try the safe mock integration

Open `index.html?demo=1` and perform searches, play notes, and save a five-note
phrase. The visible **DEMO wallet** starts at zero; credits and receipts stay
in JavaScript memory, are idempotent by event ID and disappear on reload.
**Demo credits are not money, real Quants, or Cloudflare D1 entries.**
Visit `index.html` without `?demo=1` for the regular embeddable workspace.
Production accounts are never automatically substituted with mock accounts.

### How the host connects

Install adapters **before** loading the workspace script (for example, in the
embedding page). The search adapter must return `{ completed: true }` only
when a real search has finished and passed the host's validation.

```html
<script>
  window.OracleOctavesSearch = {
    execute: async ({ query, eventId }) => {
      // Send eventId + query to your verified search backend.
      // Return { completed: true } only on genuine completion.
      return { completed: false };
    }
  };
  window.OracleOctavesWallet = {
    getBalance: () => wallet.getBalance(),
    creditQuants: (amount, { reason, query, eventId }) =>
      wallet.creditQuants(amount, { reason, query, eventId }),
    recordMusicQuant: ({ notes, noteCount, eventId }) =>
      wallet.recordMusicQuant({ notes, noteCount, eventId })
  };
  window.OracleOctavesTelemetry = {
    recordEvent: (measuredEvent) => monitor.recordEvent(measuredEvent)
  };
</script>
```

The placeholder example does not mint anything. The real adapter should return
`{ credited: true, eventId }` after a server-verified credit, or
`{ duplicate: true, eventId }` on a repeat. Music Quant recording returns
`{ saved: true, eventId }` or `{ duplicate: true, eventId }`.
A resolved Promise with no explicit receipt does **not** cause the UI to claim a
credit. The backend—not browser JavaScript—must independently authenticate the
user/device, verify that an eligible search or five-note phrase occurred,
atomically deduplicate `eventId`, and persist each record to its durable ledger.
Client-supplied IDs are correlation/idempotency keys, **not** authorization.

If `QUANTAPHI_SEARCH_URL` is set, the page navigates with the query in its
`q` parameter. **Redirects do not mint search credits**, because completion
cannot be verified before navigation; the destination app handles its own
verified search credit. Without a search adapter or URL, the page emits
`oracle-octaves:search` and reports pending host completion, not success.
If an adapter is installed, the same event is emitted for observation: do not
register a second search executor on that event or you will run a duplicate
search.

## Events and Oracle Monitor

The workspace dispatches these `CustomEvent` names on `window`:

| Event | Details |
| --- | --- |
| `oracle-octaves:search` | `{ query, eventId, url? }` |
| `oracle-octaves:note` | `{ note, frequency, durationMs, packet }` |
| `oracle-octaves:music-quant` | `{ noteCount, eventId, acknowledged, simulated }` |
| `oracle-octaves:radio` | `{ playing }` |
| `oracle-octaves:monitor` | Sanitized measured event without original search query |

`oracle-monitor.js` retains at most 100 sanitized events in **memory**.
The public `OracleOctavesMonitor.snapshot()` exposes those recent observations.
It measures last-ten-second event rate, note frequency in hertz, note length,
search word/character counts, and Shannon character entropy in bits/character:

`H(X) = -sum(p(character) * log2(p(character)))`

The state colors are operational, not an unverified measure of intelligence:

- **Idle**: no events within 10 seconds, no radio playing.
- **Active** (purple): at least one recent event.
- **Sustained** (blue): radio playing, or a long note currently sustaining.
- **Burst** (red): three or more events within three seconds.

The state picks burst first, then sustained, then active. This is a measurable
**data-cadence metaphor**, not proof that language, intelligence or geometry
emit literal musical frequencies. The original query is neither stored in the
Monitor's event list nor sent to its telemetry adapter.

Telemetry is opt-in through `OracleOctavesTelemetry.recordEvent(event)`.
Telemetry failures do not stop search, wallet, or audio. For production,
implement privacy review, consent where appropriate, buffering/retry policy,
and authenticated ingestion in the host.

## Empirical Data Octaves (experimental)

Data Octaves are operational labels, not claims of acoustics or a CPU hardware frequency law. The scripts require only standard Python 3 (Android/Termux included), without NumPy, SciPy, pip or OAuth.

- research/data_octave_validation.py: five-feature measurements; train-only percentile calibration; holdout prediction compared with constant and size-only baselines. Run: python3 research/data_octave_validation.py --demo
- research/route_timeout_experiment.py: Shannon bits per character and byte, zlib compression-size proxy, heuristic classes and an explicitly simulated queue bottleneck. Run: python3 research/route_timeout_experiment.py --measure

Both scripts separate measured observations from simulated assumptions. The queue's imaginary second hardware path does NOT prove actual CPU vector instruction execution, DMA routing, processor affinity, or a speedup.

The three provided sample strings are 1000, 64, and 99 bytes respectively (not 1000, 62 and 95). The quotient Shannon character entropy / byte length is not a standard measure of information density. The report retains it only as a named historical quotient, and also provides bits per observed byte and zlib compression ratio. These are estimates and proxies, not measurements of Kolmogorov complexity.

Hardware-routing claims require actual specialized workloads, controlled randomized trials, trace collection, identical semantics across engines, and measured latency/timeout results. The simulated queue timing can be made to succeed or fail solely by changing assumed service rates or deadlines; that is not empirical validation.

## Audio

The five keys use the browser's Web Audio oscillator at their actual displayed
frequency. The higher keys play short preview tones and the lower keys use
longer preview tones. `Play phrase` sequences the five captured tones;
`Save music quant` sends an event to the host or waits for a wallet receipt.
A second click on a confirmed saved phrase is disabled until **Clear**; retrying
an unconfirmed phrase reuses the same event ID.

Infinity Radio now plays the **actual classical-piano recordings** from the established Infinity Radio playlist. `/infinity-radio/oracle-track-feed.json` is generated from the source station's 24-track library; the player uses a real browser audio element and advances through tracks. If a track host blocks playback, it shows an error instead of playing a pretend synth loop. A listening Music Quant is submitted only when the browser reports an entire track completed; no listening credit is claimed on play, refresh, or error.

The five-key piano remains its own Web Audio instrument. A completed five-note phrase creates a stable receipt ID, five note events (name, MIDI, hold duration and onset), and a SHA-256 provenance hash. The first-party wallet bridge submits this Music Quant to Cloudflare `/v1/music-quants/sync`. Only an accepted ID is confirmed; otherwise it stays pending locally and is retried through the same wallet. The full unified wallet panel is shared with QuantaPhi and Infinity Radio.

Production searches open QuantaPhi with the entered query, where a completed verified search is handled. Navigation itself does not mint. The adapter never claims that clicking Search has credited a Quant.

The advertisement area is an unconnected host placement; the preview does not
load ad tracking code. Authenticated Phi wallet, Infinity Radio feed and Music Quant D1 receipt routes are configured in production. Availability and balances must still be verified with an enrolled user account; standalone previews cannot prove wallet crediting.
