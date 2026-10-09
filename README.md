# Oracle Octaves

An embeddable search, audio and five-note Music Quant workspace with a passive
**Oracle Monitor**. Open `index.html` in a browser. No package manager,
accounts, API keys, or build step are required for the local preview.

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

## Audio

The five keys use the browser's Web Audio oscillator at their actual displayed
frequency. The higher keys play short preview tones and the lower keys use
longer preview tones. `Play phrase` sequences the five captured tones;
`Save music quant` sends an event to the host or waits for a wallet receipt.
A second click on a confirmed saved phrase is disabled until **Clear**; retrying
an unconfirmed phrase reuses the same event ID.

Infinity Radio here remains an **on-device synthesized preview**, not the live
Infinity Radio stream. The host can use `oracle-octaves:radio` to connect real
streaming playback. Audio autoplay restrictions can require a user tap.

The advertisement area is an unconnected host placement; the preview does not
load ad tracking code. Real QuantaPhi, Infinity Radio, D1, and wallet services
remain separate integrations rather than assumed live connections.
