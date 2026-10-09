/* Oracle Octaves demo adapter: active ONLY with ?demo=1; never credits a real wallet. */
(() => {
  const demoEnabled = new URLSearchParams(window.location.search).get("demo") === "1";
  if (!demoEnabled || window.OracleOctavesWallet) return;

  const searchIds = new Set();
  const musicIds = new Set();
  const receipts = [];
  let searchQuants = 0;

  const requireId = (value) => {
    if (typeof value !== "string" || !value.trim()) throw new Error("An eventId is required.");
    return value;
  };

  window.OracleOctavesDemo = true;
  window.OracleOctavesWallet = {
    async getBalance() {
      return searchQuants;
    },
    async creditQuants(amount, details = {}) {
      if (amount !== 1 || details.reason !== "search" || !String(details.query || "").trim()) {
        throw new Error("Invalid mock search credit.");
      }
      const eventId = requireId(details.eventId);
      const duplicate = searchIds.has(eventId);
      if (!duplicate) {
        searchIds.add(eventId);
        searchQuants += 1;
      }
      const receipt = { eventId, type: "search", credited: !duplicate, duplicate, simulated: true, balance: searchQuants };
      receipts.push(receipt);
      return receipt;
    },
    async recordMusicQuant(quant) {
      const eventId = requireId(quant && quant.eventId);
      if (!Array.isArray(quant.notes) || quant.notes.length !== 5 || quant.noteCount !== 5 ||
          quant.notes.some((n) => !Number.isFinite(n.frequency) || n.frequency <= 0 || n.frequency > 20000)) {
        throw new Error("A valid five-note phrase is required.");
      }
      const duplicate = musicIds.has(eventId);
      if (!duplicate) musicIds.add(eventId);
      const receipt = { eventId, type: "music", saved: !duplicate, duplicate, simulated: true, count: musicIds.size };
      receipts.push(receipt);
      return receipt;
    }
  };
  window.OracleOctavesMock = Object.freeze({
    snapshot: () => ({
      searchQuants,
      musicQuants: musicIds.size,
      receipts: receipts.slice(-30).map((receipt) => ({ ...receipt }))
    })
  });
})();
