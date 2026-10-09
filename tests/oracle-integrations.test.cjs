'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Oracle Octaves keeps the approved five-key card and consistent controls',()=>{
 const html=read('index.html');
 assert.equal((html.match(/class="key"/g)||[]).length,5);
 for(const control of ['play-phrase','save-phrase','clear-phrase','radio-toggle','radio-next']){
   assert.match(html,new RegExp('id="'+control+'"'));
 }
 assert.match(html,/oracle-interface\.css/);
 assert.match(html,/oracle-action/);
 assert.match(html,/data-control-phi-wallet-host/);
});
test('The old synthetic radio station is not a substitute for real tracks',()=>{
 const page=read('index.html'),player=read('oracle-infinity-radio.js');
 assert.doesNotMatch(page,/Synthesized preview|radioTimer|sequence = \[220/);
 assert.match(player,/oracle-track-feed\.json/);
 assert.match(player,/audio\.play\(\)/);
 assert.match(player,/audio\.addEventListener\("ended"/);
 assert.match(player,/recordListeningQuant/);
 assert.match(player,/audio\.addEventListener\("error"/);
});
test('Music Quant bridge requires real Cloudflare acceptance, not local credit claims',()=>{
 const code=read('oracle-phi-bridge.js');
 assert.match(code,/v1\/music-quants\/sync/);
 assert.match(code,/receipt\.accepted/);
 assert.match(code,/music_quant_not_accepted/);
 assert.match(code,/new URLSearchParams\(w\.location\.search\).*demo/s);
 assert.match(code,/musicPhi:quants:v1/);
 assert.match(code,/musicPhi:listeningQuants:v1/);
 assert.match(code,/search_must_complete_at_quanta_phi/);
 assert.match(code,/notes\.length!==5/);
});
test('Production scripts are disabled in explicit demo mode',()=>{
 const html=read('index.html');
 assert.match(html,/get\("demo"\) === "1"\) return/);
 assert.match(html,/OracleOctavesBoot/);
 assert.match(html,/oracle-mock\.js/);
 assert.match(html,/cloud-wallet-client\.js/);
 assert.match(html,/wallet-runtime\.js/);
});
