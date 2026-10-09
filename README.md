# Oracle Octaves

A standalone, embeddable resonance workspace for QuantaPhi search, an Infinity
Radio-style player/ad placement, and a five-note quant piano.

Open `index.html` directly to try the interface. The page has no build step or
external dependencies. When embedding it, install the optional integrations
before the page script runs:

```html
<script>
  window.QUANTAPHI_SEARCH_URL = "https://your-search-service.example/search";
  window.OracleOctavesWallet = {
    getBalance: () => wallet.getBalance(),
    creditQuants: (amount, details) => wallet.creditQuants(amount, details),
    recordMusicQuant: (musicQuant) => wallet.recordMusicQuant(musicQuant)
  };
</script>
```

`QUANTAPHI_SEARCH_URL` receives the query in its `q` parameter. Without it,
searches dispatch `oracle-octaves:search` on `window` with `{ query }`. Without
a wallet adapter, the page does not simulate or claim a credit; it dispatches
`oracle-octaves:music-quant` with five note packets when a phrase is saved.
The wallet adapter methods may return promises. Search credits use
`creditQuants(1, { reason: "search", query })`; music phrases use
`recordMusicQuant({ notes, noteCount })`.

The radio control is a local synthesized preview and dispatches
`oracle-octaves:radio` with `{ playing }`. The ad area is a placement for a
host-provided ad service; no external ad or tracking code is loaded.