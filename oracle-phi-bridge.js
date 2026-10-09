/* Oracle Octaves production bridge: first-party Phi wallet + durable five-note receipts.
 * The demo adapter remains separate: ?demo=1 never touches the real wallet.
 */
(function (w) {
  "use strict";
  if (new URLSearchParams(w.location.search).get("demo") === "1") return;
  var ENDPOINT="https://quanta-phi-ledger.marvaseater.workers.dev";
  var LOCAL="musicPhi:quants:v1";
  var LISTENING="musicPhi:listeningQuants:v1";
  var MIDI={C4:60,D4:62,E4:64,G4:67,A4:69};
  var syncing=false;
  w.QUANTAPHI_SEARCH_URL=w.QUANTAPHI_SEARCH_URL||"/?run=1";
  function read(key){try{var v=JSON.parse(w.localStorage.getItem(key)||"[]");return Array.isArray(v)?v:[]}catch(_){return []}}
  function write(key,value){try{w.localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}}
  function utf8(s){return new TextEncoder().encode(s)}
  function hex(buf){return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0")}).join("")}
  async function sha(data) {
    if(!w.crypto?.subtle)throw Error("secure_browser_required_for_receipts");
    return hex(await w.crypto.subtle.digest("SHA-256",utf8(data)));
  }
  async function cloud(path,options){
    if(!w.QuantaCloudConnection?.authenticatedFetch)throw Error("wallet_service_unavailable");
    await w.QuantaCloudConnection.ready;
    if(!w.QuantaCloudConnection.hasCredential?.())throw Error("ledger_not_connected");
    var response=await w.QuantaCloudConnection.authenticatedFetch(ENDPOINT+path,options||{method:"GET",cache:"no-store"});
    var payload=await response.json().catch(function(){return {}});
    if(!response.ok||payload.error)throw Error(payload.error||"cloud_wallet_error");
    return payload;
  }
  function normalizeNotes(input){
    return input.map(function(n,i){
      var name=String(n?.note||n?.name||"").slice(0,12),ms=Number(n?.durationMs||n?.holdMs||250);
      return {name:name,midi:MIDI[name]||Number(n?.midi)||60,
       holdMs:Math.max(40,Math.min(16000,ms)),offsetMs:0,
       onsetMs:i*160,group:i};
    });
  }
  async function quantRecord(kind,eventId,params){
    var token=String(eventId||"").trim();
    if(!/^(?:music|listening)[:_-][A-Za-z0-9_-]{10,100}$/.test(token))throw Error("invalid_music_event_id");
    var idHash=await sha(token);
    var id="mq_"+idHash.slice(0,32);
    var listKey=kind==="listening"?LISTENING:LOCAL;
    var prior=read(listKey).find(function(q){return q.id===id});
    if(prior)return {record:prior,listKey};
    var now=new Date().toISOString(),notes=kind==="listening"?[]:normalizeNotes(params.notes||[]);
    if(kind==="playable"&&notes.length!==5)throw Error("five_notes_required");
    var record={version:3,id,kind,notes,createdAt:now,
      source:kind==="listening"?"infinity-radio-listening-quant":"oracle-octaves-five-note-quant",
      context:{version:1,playback:{
        song:kind==="listening"?String(params.song||"").slice(0,180):"",
        station:"Infinity Radio",playing:false,capturedAt:now},events:[],retention:"user-owned-context"}};
    if(kind==="listening"){
      record.song=String(params.song||"").slice(0,180);
      record.sourceUrl=String(params.sourceUrl||"").slice(0,900);
      record.startedAt=String(params.startedAt||now).slice(0,40);
      record.endedAt=now;record.durationSec=Math.min(86400,Math.max(0,Number(params.durationSec)||0));
    }
    record.hash=await sha(JSON.stringify(record));
    if(!write(listKey,[record,...read(listKey)]))throw Error("music_receipt_storage_unavailable");
    return {record,listKey};
  }
  async function syncOne(record){
    var response=await cloud("/v1/music-quants/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({quants:[record]})});
    if(!Array.isArray(response.accepted)||!response.accepted.includes(record.id))throw Error("music_quant_not_accepted");
    var state=await cloud("/v1/music-quants/state",{method:"GET",cache:"no-store"});
    w.dispatchEvent(new CustomEvent("musicquant:cloud-synced",{detail:state}));
    w.ControlPhi?.refreshCloudWallet?.();
    return state;
  }
  async function submit(kind,eventId,params){
    var saved=await quantRecord(kind,eventId,params);
    try{
      var state=await syncOne(saved.record);
      return {saved:true,eventId,quantId:saved.record.id,balance:state.balance,kind};
    }catch(error){
      // Record stays locally pending and can be reconciled once the same wallet reconnects.
      w.dispatchEvent(new CustomEvent("musicquant:changed",{detail:{pending:true,id:saved.record.id}}));
      return {saved:false,pending:true,eventId,quantId:saved.record.id,reason:String(error.message||error),kind};
    }
  }
  async function syncPending(){
    if(syncing||!w.QuantaCloudConnection?.hasCredential?.())return false;
    syncing=true;
    try{
      var local=[...read(LOCAL),...read(LISTENING)];
      if(!local.length)return true;
      for(var i=0;i<local.length;i+=100){
        var batch=local.slice(i,i+100);
        var receipt=await cloud("/v1/music-quants/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({quants:batch})});
        var accepted=new Set(receipt.accepted||[]);
        if(batch.some(function(q){return !accepted.has(q.id)}))throw Error("pending_music_quant_not_accepted");
      }
      var state=await cloud("/v1/music-quants/state",{method:"GET",cache:"no-store"});
      w.dispatchEvent(new CustomEvent("musicquant:cloud-synced",{detail:state}));
      w.ControlPhi?.refreshCloudWallet?.();
      return true;
    }catch(error){console.warn("Oracle Music Quant retry pending",error);return false}
    finally{syncing=false}
  }
  w.OracleOctavesWallet={
    async getBalance(){var state=await cloud("/v1/quants/state",{method:"GET",cache:"no-store"});return state.balance},
    async getMusicBalance(){var state=await cloud("/v1/music-quants/state",{method:"GET",cache:"no-store"});return state.balance},
    async recordMusicQuant(detail){
      if(!detail||!Array.isArray(detail.notes)||detail.notes.length!==5)return {saved:false,reason:"five_notes_required"};
      return submit("playable",detail.eventId,{notes:detail.notes});
    },
    async recordListeningQuant(detail){
      if(!detail?.song||!detail?.sourceUrl||!detail?.eventId)return {saved:false,reason:"verified_track_required"};
      return submit("listening",detail.eventId,detail);
    },
    syncPending,connected:function(){return !!w.QuantaCloudConnection?.hasCredential?.()},
    creditQuants:async function(){return {credited:false,reason:"search_must_complete_at_quanta_phi"};}
  };
  function check(){void syncPending()}
  w.addEventListener("online",check);
  w.addEventListener("focus",check);
  w.document.addEventListener("starquest:ledger-connected",check);
  w.document.addEventListener("starquest:auth-changed",check);
  if(w.document.readyState==="loading")w.document.addEventListener("DOMContentLoaded",check,{once:true});
  else check();
})(window);
