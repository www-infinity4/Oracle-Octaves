/* Passive, privacy-conscious event monitor. Octave names are operational labels,
   not claims that information complexity has an intrinsic acoustic frequency. */
(() => {
  const MAX_EVENTS = 100;
  const observed = [];
  let radioPlaying = false;

  function shannonEntropy(value) {
    if (!value) return 0;
    const characters = Array.from(value);
    const counts = new Map();
    for (const char of characters) counts.set(char, (counts.get(char) || 0) + 1);
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / characters.length;
      entropy -= p * Math.log2(p);
    }
    return Number(entropy.toFixed(2));
  }

  function readEvent(kind, detail = {}) {
    const time = Date.now();
    const event = { kind, time };
    if (kind === "search") {
      const query = String(detail.query || "");
      event.characters = Array.from(query).length;
      event.words = query.trim() ? query.trim().split(/\s+/u).length : 0;
      event.entropyBitsPerCharacter = shannonEntropy(query);
      // Deliberately do not retain the search text.
    } else if (kind === "note") {
      event.frequencyHz = Number(detail.frequency) || 0;
      event.durationMs = Number(detail.durationMs) || 0;
      event.packet = detail.packet === "sustained" ? "sustained" : "tight";
      event.note = String(detail.note || "").slice(0, 8);
    } else if (kind === "music-quant") {
      event.noteCount = Number(detail.noteCount) || 0;
      event.acknowledged = detail.acknowledged === true;
      event.simulated = detail.simulated === true;
    } else if (kind === "radio") {
      radioPlaying = detail.playing === true;
      event.playing = radioPlaying;
    }
    return event;
  }

  function stateOf(now) {
    const last10 = observed.filter((entry) => now - entry.time <= 10000);
    const last3 = observed.filter((entry) => now - entry.time <= 3000);
    const sustained = observed.some((entry) =>
      entry.kind === "note" && entry.durationMs >= 350 && now <= entry.time + entry.durationMs);
    const state = last3.length >= 3 ? "burst" : (radioPlaying || sustained) ? "sustained" : last10.length ? "active" : "idle";
    return { state, ratePerSecond: Number((last10.length / 10).toFixed(2)) };
  }

  function snapshot() {
    const { state, ratePerSecond } = stateOf(Date.now());
    return {
      state, ratePerSecond, radioPlaying, totalObserved: observed.length,
      events: observed.map((event) => ({ ...event }))
    };
  }

  function render() {
    const badge = document.getElementById("monitor-state");
    const stats = document.getElementById("monitor-stats");
    const latest = document.getElementById("monitor-latest");
    if (!badge || !stats || !latest) return;

    const current = snapshot();
    badge.textContent = current.state[0].toUpperCase() + current.state.slice(1);
    badge.dataset.state = current.state;
    stats.textContent = `${current.totalObserved} observed · ${current.ratePerSecond} events/sec (10-sec window)`;
    const event = observed[observed.length - 1];
    if (!event) {
      latest.textContent = "Waiting for search, piano, or radio events.";
    } else if (event.kind === "search") {
      latest.textContent = `Last: search · ${event.words} words · ${event.entropyBitsPerCharacter} bits/character of text entropy`;
    } else if (event.kind === "note") {
      latest.textContent = `Last: ${event.note} · ${event.frequencyHz} Hz · ${event.durationMs} ms · ${event.packet} packet`;
    } else if (event.kind === "music-quant") {
      latest.textContent = `Last: five-note phrase · ${event.acknowledged ? (event.simulated ? "demo receipt" : "host receipt") : "not confirmed"}`;
    } else {
      latest.textContent = `Last: radio ${event.playing ? "playing" : "paused"}`;
    }
  }

  function observe(kind, detail) {
    const item = readEvent(kind, detail);
    observed.push(item);
    if (observed.length > MAX_EVENTS) observed.shift();
    render();
    window.dispatchEvent(new CustomEvent("oracle-octaves:monitor", { detail: { ...item } }));
    const adapter = window.OracleOctavesTelemetry;
    if (adapter && typeof adapter.recordEvent === "function") {
      try { Promise.resolve(adapter.recordEvent({ ...item })).catch(() => {}); }
      catch { /* Telemetry must never interrupt search, sound, or wallet activity. */ }
    }
  }

  for (const kind of ["search", "note", "music-quant", "radio"]) {
    window.addEventListener("oracle-octaves:" + kind, (event) => observe(kind, event.detail || {}));
  }
  window.OracleOctavesMonitor = Object.freeze({ snapshot });
  window.addEventListener("DOMContentLoaded", render);
  window.setInterval(render, 2000);
})();
