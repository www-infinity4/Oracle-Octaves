const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1].trim()).filter(Boolean);
  assert.ok(scripts.length >= 1, "The workspace must contain a parseable app script");
  // The page now has separate canonical-redirect, service-bootstrap, and app scripts.
  // Check all inline code instead of assuming there can be only one script tag.
  scripts.forEach((source, index) => new vm.Script(source, { filename: "index.html:inline:" + (index + 1) }));
  for (const file of ["oracle-mock.js", "oracle-monitor.js"]) {
    assert.ok(html.includes('src="./' + file + '"'), file + " must be included");
    new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
  }
  for (const id of ["monitor-state", "monitor-stats", "monitor-latest", "save-phrase", "search-form"]) {
    assert.equal([...html.matchAll(new RegExp('id="' + id + '"', "g"))].length, 1, "Unique ID " + id);
  }

  const mock = fs.readFileSync("oracle-mock.js", "utf8");
  const base = { URLSearchParams, Set, Map, Promise, Error, Number, String };
  const productionWindow = { location: { search: "" } };
  vm.runInNewContext(mock, { ...base, window: productionWindow });
  assert.equal(productionWindow.OracleOctavesWallet, undefined, "No demo wallet by default");
  const window = { location: { search: "?demo=1" } };
  vm.runInNewContext(mock, { ...base, window });
  const wallet = window.OracleOctavesWallet;
  assert.ok(wallet, "Demo wallet initializes when explicitly requested");
  const first = await wallet.creditQuants(1, { reason: "search", query: "hydrogen", eventId: "s-1" });
  const duplicate = await wallet.creditQuants(1, { reason: "search", query: "hydrogen", eventId: "s-1" });
  assert.equal(first.credited, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(await wallet.getBalance(), 1, "No duplicate search mint");
  const notes = Array.from({ length: 5 }, (_, i) => ({ frequency: 220 + i * 10 }));
  const quant = { eventId: "music-1", notes, noteCount: 5 };
  const musicA = await wallet.recordMusicQuant(quant);
  const musicB = await wallet.recordMusicQuant(quant);
  assert.equal(musicA.saved, true);
  assert.equal(musicB.duplicate, true);
  assert.equal(window.OracleOctavesMock.snapshot().musicQuants, 1, "No duplicate music quant");
  await assert.rejects(wallet.recordMusicQuant({ eventId: "bad", notes: [], noteCount: 0 }));

  const listeners = {};
  const monitorWindow = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of listeners[event.type] || []) fn(event); },
    setInterval() { return 0; }
  };
  const classCustomEvent = class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  vm.runInNewContext(fs.readFileSync("oracle-monitor.js", "utf8"), {
    window: monitorWindow, document: { getElementById: () => null },
    CustomEvent: classCustomEvent, Date, Map, Promise, Math, Number, String, Array
  });
  monitorWindow.dispatchEvent(new classCustomEvent("oracle-octaves:search", { detail: { query: "private exact search words" } }));
  monitorWindow.dispatchEvent(new classCustomEvent("oracle-octaves:note", { detail: { note: "C4", frequency: 261.63, durationMs: 480, packet: "sustained" } }));
  monitorWindow.dispatchEvent(new classCustomEvent("oracle-octaves:radio", { detail: { playing: true } }));
  const reading = monitorWindow.OracleOctavesMonitor.snapshot();
  assert.equal(reading.state, "burst");
  assert.equal(reading.totalObserved, 3);
  assert.equal(reading.events[0].words, 4);
  assert.ok(!JSON.stringify(reading).includes("private exact search words"), "Do not store query contents");
  assert.equal(reading.events[1].frequencyHz, 261.63);
  console.log("Smoke checks passed: syntax, opt-in mock, idempotency, event monitor, sanitized queries.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
