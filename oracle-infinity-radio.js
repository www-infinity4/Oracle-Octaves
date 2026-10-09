/* Oracle Octaves player for Infinity Radio's published piano track feed.
 * Real audio only: never substitute synthesized preview tones for station audio.
 */
(function(w){
 "use strict";
 var PLAYLIST="/infinity-radio/oracle-track-feed.json?v=20261009-library1";
 var audio=new Audio();
 audio.preload="none";
 var tracks=[],index=0,playing=false,busy=false,session=null,errors=0;
 var btn=w.document.getElementById("radio-toggle"),state=w.document.getElementById("radio-state");
 var title=w.document.getElementById("octaves-track-title");
 var subtitle=w.document.getElementById("octaves-track-meta");
 var volume=w.document.getElementById("octaves-volume");
 var next=w.document.getElementById("radio-next");
 var note=w.document.getElementById("radio-credit-note");
 if(!btn||!state)return;
 audio.volume=0.7;
 function noteText(value){if(note)note.textContent=value}
 function ui(){
   btn.textContent=playing?"Ⅱ":"▶";
   btn.setAttribute("aria-label",playing?"Pause Infinity Radio":"Play Infinity Radio");
   btn.setAttribute("aria-pressed",String(playing));
   var t=tracks[index];
   if(title)title.textContent=t?.title||"Infinity Radio";
   if(subtitle)subtitle.textContent=t?"Piano · "+(index+1)+" / "+tracks.length+" tracks":"Connecting to the Infinity Radio library";
   if(next)next.disabled=!tracks.length;
 }
 function event(name,detail){w.dispatchEvent(new CustomEvent(name,{detail}))}
 function validTrack(t){
   if(!t||typeof t.title!=="string"||typeof t.url!=="string")return false;
   try{var u=new URL(t.url);return u.protocol==="https:"&&["orangefreesounds.com","www.orangefreesounds.com","archive.org","www.archive.org"].includes(u.hostname)}catch(_){return false}
 }
 async function load(){
   if(tracks.length)return tracks;
   state.textContent="Loading Infinity Radio library…";
   try{
     var response=await fetch(PLAYLIST,{cache:"no-store"});
     if(!response.ok)throw Error("library HTTP "+response.status);
     var data=await response.json();
     tracks=(Array.isArray(data.tracks)?data.tracks:[]).filter(validTrack);
     if(!tracks.length)throw Error("no_valid_tracks");
     state.textContent="Ready · real piano tracks";
     noteText("Opt-in playback. Music Quants are recorded only after an entire track finishes.");
   }catch(error){
     state.textContent="Radio library unavailable";
     noteText("Open the full Infinity Radio page to listen while the embedded library is unavailable.");
     console.warn("Infinity Radio library unavailable",error);
   }
   ui();
   return tracks;
 }
 function pause(){
   audio.pause();
   playing=false;
   state.textContent="Paused";
   ui();
   event("oracle-octaves:radio",{playing:false,mode:"infinity-radio"});
 }
 function beginSession(track){
   if(session&&session.sourceUrl===track.url)return;
   var id=w.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(36).slice(2);
   session={eventId:"listening:"+id.replace(/-/g,""),song:track.title,sourceUrl:track.url,startedAt:new Date().toISOString()};
 }
 async function playSelected(){
   if(busy)return false;
   busy=true;
   try{
     if(!tracks.length)await load();
     if(!tracks.length)return false;
     var track=tracks[index];
     if(audio.src!==track.url){audio.src=track.url;session=null}
     beginSession(track);
     state.textContent="Buffering "+track.title+"…";
     await audio.play(); // Browser user gesture, actual HTMLAudioElement playback.
     playing=!audio.paused;
     if(!playing)throw Error("Audio not playing");
     errors=0;
     state.textContent="Playing · Infinity Radio";
     event("oracle-octaves:radio",{playing:true,mode:"infinity-radio",title:track.title});
     return true;
   }catch(error){
     playing=false;
     state.textContent="Playback unavailable · retry or open Infinity Radio";
     noteText("The track host did not start audio. No listening reward has been created.");
     event("oracle-octaves:radio",{playing:false,mode:"infinity-radio"});
     console.warn("Infinity Radio audio was blocked",error);
     return false;
   }finally{busy=false;ui()}
 }
 async function changeTrack(){
   if(!tracks.length){await load();if(!tracks.length)return}
   var resume=playing;
   audio.pause();
   audio.removeAttribute("src");
   audio.load();
   session=null;
   index=(index+1)%tracks.length;
   playing=false;ui();
   if(resume)await playSelected();
 }
 btn.addEventListener("click",async()=>{
   if(playing)pause();
   else await playSelected();
 });
 next?.addEventListener("click",async()=>{await changeTrack()});
 volume?.addEventListener("input",()=>{var n=Number(volume.value);audio.volume=Math.max(0,Math.min(1,n/100))});
 audio.addEventListener("ended",async()=>{
   var completed=session;
   session=null;playing=false;
   state.textContent="Track completed";
   ui();
   if(completed&&w.OracleOctavesWallet?.recordListeningQuant){
     var receipt=await w.OracleOctavesWallet.recordListeningQuant({
       ...completed,durationSec:Number.isFinite(audio.duration)?Math.round(audio.duration):Math.round(audio.currentTime)
     });
     noteText(receipt.saved?"Full track verified · Music Quant saved in the shared wallet":
       receipt.pending?"Full track finished · Music Quant pending Cloudflare wallet confirmation":
       "Full track finished · listening credit unavailable");
   }
   await changeTrack();
   await playSelected();
 });
 audio.addEventListener("error",async()=>{
   if(!audio.src)return;
   playing=false;
   session=null;
   errors++;
   if(errors>=Math.min(3,tracks.length||3)){
     state.textContent="Station files unavailable · open full Infinity Radio";
     noteText("The current music source failed; no listening credit is recorded.");
     ui();return;
   }
   state.textContent="Trying next Infinity Radio recording…";
   await changeTrack();
   await playSelected();
 });
 w.addEventListener("pagehide",()=>{audio.pause()});
 w.OracleOctavesRadio={load,play:playSelected,pause,next:changeTrack,
   get state(){return {playing,index,totalTracks:tracks.length,title:tracks[index]?.title||"",duration:audio.duration}}};
 ui();void load();
})(window);
