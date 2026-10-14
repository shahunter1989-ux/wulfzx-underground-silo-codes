import { BUNDLED_CONFIG, fetchSourceSnapshot, readLastVerified, resolveSources, writeLastVerified } from './silo-data.js';
import { canCopyResolution, elapsedSession, formatElapsed } from './terminal-state.js';

const $ = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-tab]')];
const storageKey = 'wulfzx-personal-terminal:v1';
let storageOK = true;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { storageOK = false; }
const defaults = {name:'',phosphor:'green',brightness:100,motion:true,scanlines:true,clickSounds:true,volume:20,channel:'megaton'};
const prefs = {...defaults,...saved.prefs};
prefs.name = typeof prefs.name === 'string' ? prefs.name.slice(0,24) : '';
prefs.phosphor = ['green','amber','ice'].includes(prefs.phosphor) ? prefs.phosphor : 'green';
prefs.channel = ['megaton','bunker','relay','night'].includes(prefs.channel) ? prefs.channel : 'megaton';
prefs.brightness = Math.min(115,Math.max(75,Number(prefs.brightness)||100));
prefs.volume = Math.min(60,Math.max(0,Number(prefs.volume)||0));
let notes = Array.isArray(saved.notes) ? saved.notes.filter(n=>n && typeof n.title==='string' && typeof n.body==='string' && Number.isFinite(n.created)).slice(0,100) : [];
let session = saved.session && Number.isFinite(saved.session.elapsed) && (saved.session.startedAt===null || Number.isFinite(saved.session.startedAt)) ? saved.session : {elapsed:0,startedAt:null};
let deleted = null;
let currentTab = 'status';
let dialAngle = 0;
let asleep = false;
let toastTimer;
function toast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>$('toast').hidden=true,3500); }
function persist() {
  try { localStorage.setItem(storageKey,JSON.stringify({prefs,notes,session})); storageOK=true; }
  catch { storageOK=false; toast('Storage unavailable. Export notes before leaving this page.'); }
  $('storageStatus').textContent=storageOK?'LOCAL STORAGE READY':'TEMPORARY SESSION · EXPORT NOTES';
  $('footerStatus').textContent=storageOK?'PERSONAL TERMINAL · LOCAL STORAGE':'PERSONAL TERMINAL · UNSAVED SESSION';
}
function openTab(name, focus=false) {
  if(asleep)return;
  const oldIndex=tabs.findIndex(t=>t.dataset.tab===currentTab);
  const newIndex=tabs.findIndex(t=>t.dataset.tab===name);
  let steps=newIndex-oldIndex;
  if(steps>2)steps-=tabs.length;
  if(steps < -2)steps+=tabs.length;
  dialAngle+=steps*72;
  currentTab=name;
  document.querySelectorAll('.hardware-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.open===name)));
  tabs.forEach(t=>{const selected=t.dataset.tab===name;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$(t.getAttribute('aria-controls')).hidden=!selected;});
  const panel=$(`panel-${name}`);panel.classList.remove('panel-enter');void panel.offsetWidth;panel.classList.add('panel-enter');
  $('terminal').scrollTop=0;
  $('device').style.setProperty('--dial',`${dialAngle}deg`);
  $('selector').setAttribute('aria-label',`Select next terminal tab. Current: ${tabs[newIndex].textContent}`);
  if(focus)$(`tab-${name}`).focus();
}
tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>openTab(tab.dataset.tab));
  tab.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();openTab(tabs[next].dataset.tab,true);}});
});
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.open,true)));
const selector=$('selector');
const stepSelector=direction=>openTab(tabs[(tabs.findIndex(t=>t.dataset.tab===currentTab)+direction+tabs.length)%tabs.length].dataset.tab);
let drag=null,suppressClick=false;
selector.title='Click to turn · drag vertically · use arrow keys';
selector.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}stepSelector(1);});
selector.addEventListener('keydown',event=>{if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown'].includes(event.key)){event.preventDefault();stepSelector(['ArrowRight','ArrowUp'].includes(event.key)?1:-1);beep();}});
selector.addEventListener('pointerdown',event=>{if(event.button!==0||asleep)return;suppressClick=false;drag={id:event.pointerId,y:event.clientY};selector.setPointerCapture(event.pointerId);selector.classList.add('turning');});
selector.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const distance=drag.y-event.clientY;if(Math.abs(distance)>=18){stepSelector(distance>0?1:-1);beep();drag.y=event.clientY;suppressClick=true;}});
const endDrag=()=>{drag=null;selector.classList.remove('turning');};
selector.addEventListener('pointerup',endDrag);selector.addEventListener('pointercancel',endDrag);selector.addEventListener('lostpointercapture',endDrag);
function power(on) {
  asleep=!on;$('device').classList.toggle('sleeping',asleep);$('standby').hidden=on;
  for(const el of [$('terminal'),document.querySelector('.tabs'),document.querySelector('.masthead'),document.querySelector('.screen-footer')])el.inert=asleep;
  $('power').setAttribute('aria-pressed',String(on));$('power').setAttribute('aria-label',on?'Put terminal in standby':'Power on terminal');
  $('selector').disabled=asleep;
  if(asleep){setAudio(false);$('wake').focus();}else{openTab(currentTab,true);$('screen').classList.remove('booting');void $('screen').offsetWidth;$('screen').classList.add('booting');}
}
$('power').addEventListener('click',()=>power(asleep));$('wake').addEventListener('click',()=>power(true));

function greeting(){const hour=new Date().getHours();$('greeting').textContent=`Good ${hour<12?'morning':hour<18?'afternoon':'evening'}, ${prefs.name.trim()||'Operator'}.`;}
function applyPrefs(){
  const colors={green:['#91e9ba','#73a58b','#315c46','rgba(98,237,158,.12)'],amber:['#f1c886','#bca276','#665334','rgba(242,186,94,.12)'],ice:['#a5dcf4','#7babbf','#355666','rgba(130,203,239,.12)']};
  ['--ink','--muted','--line','--glow'].forEach((key,i)=>document.documentElement.style.setProperty(key,colors[prefs.phosphor][i]));
  document.documentElement.style.setProperty('--brightness',prefs.brightness/100);
  document.documentElement.style.setProperty('--scan',prefs.scanlines?'.12':'0');
  document.body.classList.toggle('no-motion',!prefs.motion);greeting();
}
for(const [id,key] of [['operatorName','name'],['phosphor','phosphor'],['brightness','brightness'],['motion','motion'],['scanlines','scanlines'],['clickSounds','clickSounds']]){
  const el=$(id);if(el.type==='checkbox')el.checked=Boolean(prefs[key]);else el.value=prefs[key];
  el.addEventListener('input',()=>{prefs[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;applyPrefs();persist();});
}
$('sessionToggle').addEventListener('click',()=>{if(session.startedAt===null)session.startedAt=Date.now();else{session.elapsed=elapsedSession(session);session.startedAt=null;}persist();tick();});
$('sessionReset').addEventListener('click',()=>{session={elapsed:0,startedAt:null};persist();tick();});
function renderNotes(){
  $('noteCount').textContent=`${notes.length} ${notes.length===1?'ENTRY':'ENTRIES'}`;
  $('notePreview').textContent=notes.length?`${notes[0].title} — ${notes[0].body}`:'No entries yet. Record a thought. Plan your next expedition.';
  $('notesList').replaceChildren();
  if(!notes.length){const p=document.createElement('p');p.className='quiet';p.textContent='ARCHIVE EMPTY / Your first entry starts here.';$('notesList').append(p);}
  notes.forEach(note=>{const article=document.createElement('article');const h=document.createElement('h3');h.textContent=note.title;const time=document.createElement('time');time.dateTime=new Date(note.created).toISOString();time.textContent=new Date(note.created).toLocaleString();const body=document.createElement('p');body.textContent=note.body;const remove=document.createElement('button');remove.className='text-button';remove.textContent='Remove entry';remove.setAttribute('aria-label',`Remove ${note.title}`);remove.addEventListener('click',()=>{deleted=note;notes=notes.filter(n=>n!==note);persist();renderNotes();$('undoDelete').hidden=false;toast('Entry removed. Undo is available below the archive.');});article.append(h,time,body,remove);$('notesList').append(article);});
  $('exportNotes').disabled=notes.length===0;
}
$('noteForm').addEventListener('submit',event=>{event.preventDefault();const title=$('noteTitle').value.trim(),body=$('noteBody').value.trim();if(!title||!body){toast('Add a title and a field note.');return;}if(notes.length>=100){toast('Archive full. Export and remove older entries first.');return;}notes.unshift({id:crypto.randomUUID(),title,body,created:Date.now()});persist();renderNotes();$('noteForm').reset();toast(storageOK?'Entry saved to your personal archive.':'Entry held in memory. Export to keep it.');});
$('undoDelete').addEventListener('click',()=>{if(deleted){notes.unshift(deleted);deleted=null;persist();renderNotes();$('undoDelete').hidden=true;toast('Entry restored.');}});
$('exportNotes').addEventListener('click',()=>{const text=`WULFZX — PERSONAL LOGBOOK\n\n${notes.map(n=>`${n.title}\n${new Date(n.created).toLocaleString()}\n\n${n.body}`).join('\n\n------------------------\n\n')}`;const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='wulfzx-logbook.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Logbook export prepared.');});

// Audio is synthesized locally, and is never enabled automatically on reload.
let audioContext,master,ambientGain,oscillators=[],audioOn=false;
const radio = new Audio();
radio.preload = 'none';
let playbackRequest = 0;
const radioUrl = 'https://us2.internet-radio.com/proxy/megatoncafe?mp=/stream;';
const frequencies={bunker:[55,82.41,110],relay:[110,164.81,220],night:[65.41,98,130.81]};
function buildAudio(){
  audioContext=new (window.AudioContext||window.webkitAudioContext)();master=audioContext.createGain();master.gain.value=0;master.connect(audioContext.destination);ambientGain=audioContext.createGain();ambientGain.gain.value=.18;ambientGain.connect(master);
  oscillators=frequencies[prefs.channel === 'megaton' ? 'bunker' : prefs.channel].map((frequency,i)=>{const osc=audioContext.createOscillator();osc.type='sine';osc.frequency.value=frequency;const gain=audioContext.createGain();gain.gain.value=[.5,.18,.1][i];osc.connect(gain);gain.connect(ambientGain);osc.start();return osc;});
}
function renderAudio(state) {
  document.body.classList.toggle('playing',audioOn && state !== 'BUFFERING');
  $('audioToggle').textContent=audioOn?'Audio on':'Audio off';
  $('audioToggle').setAttribute('aria-pressed',String(audioOn));
  $('signalToggle').textContent=audioOn?'Stop playback':'Play channel';
  $('signalState').textContent=state || (audioOn ? (prefs.channel==='megaton'?'LIVE RADIO':'AMBIENT') : 'STANDBY');
  $('signalLabel').textContent=audioOn?$('channel').selectedOptions[0].textContent.toUpperCase():'RECEIVER OFFLINE';
}
async function setAudio(on){
  const request=++playbackRequest;
  radio.pause();
  if(master)master.gain.setTargetAtTime(0,audioContext.currentTime,.06);
  audioOn=on;
  renderAudio(on?'TUNING…':'STANDBY');
  if(!on){radio.removeAttribute('src');radio.load();return;}
  try {
    if(prefs.channel==='megaton'){
      radio.src=radioUrl;radio.volume=prefs.volume/100;
      await radio.play();
    }else{
      if(!audioContext)buildAudio();
      oscillators.forEach((o,i)=>o.frequency.setTargetAtTime(frequencies[prefs.channel][i],audioContext.currentTime,.2));
      await audioContext.resume();
      if(request!==playbackRequest)return;
      master.gain.setTargetAtTime(prefs.volume/100,audioContext.currentTime,.1);
    }
    if(request!==playbackRequest)return;
    renderAudio();
  }catch{
    if(request!==playbackRequest)return;
    audioOn=false;radio.pause();renderAudio('SIGNAL UNAVAILABLE');
    toast('Channel unavailable. Try again or open the station website below.');
  }
}
radio.addEventListener('waiting',()=>{if(audioOn&&prefs.channel==='megaton')renderAudio('BUFFERING');});
radio.addEventListener('playing',()=>{if(audioOn&&prefs.channel==='megaton')renderAudio('LIVE RADIO');});
radio.addEventListener('error',()=>{if(audioOn&&prefs.channel==='megaton'){audioOn=false;renderAudio('SIGNAL UNAVAILABLE');toast('Radio connection lost. Press Play channel to reconnect.');}});
radio.addEventListener('ended',()=>{if(audioOn&&prefs.channel==='megaton'){audioOn=false;renderAudio('SIGNAL ENDED');}});

function beep(){if(!audioOn||!prefs.clickSounds||!audioContext)return;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.setValueAtTime(620,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(330,audioContext.currentTime+.065);gain.gain.setValueAtTime(.07,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.07);osc.connect(gain);gain.connect(master);osc.start();osc.stop(audioContext.currentTime+.08);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
document.addEventListener('click',e=>{if(e.target.closest('button'))beep();});
$('audioToggle').addEventListener('click',()=>setAudio(!audioOn));$('signalToggle').addEventListener('click',()=>setAudio(!audioOn));
$('volume').value=prefs.volume;$('volumeValue').textContent=`${prefs.volume}%`;$('channel').value=prefs.channel;
$('volume').addEventListener('input',()=>{prefs.volume=Number($('volume').value);$('volumeValue').textContent=`${prefs.volume}%`;radio.volume=prefs.volume/100;if(audioOn&&master&&prefs.channel!=='megaton')master.gain.setTargetAtTime(prefs.volume/100,audioContext.currentTime,.1);persist();});
$('channel').addEventListener('change',()=>{prefs.channel=$('channel').value;if(audioOn)setAudio(true);persist();});
for(let i=0;i<48;i++){const bar=document.createElement('i');bar.style.setProperty('--i',i);bar.style.setProperty('--height',`${12+Math.abs(Math.sin(i*1.8))*42}px`);document.querySelector('.signal-bars').append(bar);}

let resolution={config:BUNDLED_CONFIG,status:'SYNCING',canCopy:false,sourceStates:[]};
let refreshing=false;
function renderCodes(){
  const allowed=canCopyResolution(resolution);const status=resolution.canCopy&&!allowed?'EXPIRED':resolution.status;
  $('statusText').textContent=status;
  $('relayHeading').textContent=allowed?'Authorization received.':status==='SYNCING'?'Contacting the relay.':'Relay needs attention.';
  for(const silo of ['alpha','bravo','charlie']){const button=$(`${silo}Code`);button.disabled=!allowed;button.querySelector('strong').textContent=allowed?resolution.config[silo]:'--------';button.setAttribute('aria-label',allowed?`Copy Site ${silo} code ${resolution.config[silo]}`:`Site ${silo} code unavailable`);document.querySelector(`[data-summary=${silo}]`).textContent=allowed?resolution.config[silo]:'--------';}
  const warnings={SYNCING:'Establishing secure relay…',LIVE:'Provisional authorization. Secondary verification pending.',VERIFIED:'Authorization verified. Codes ready for transfer.',CONFLICT:'Verification mismatch. Code transfer suspended.',EXPIRED:'Authorization window inactive. Awaiting updated codes.',FALLBACK:'Relay unavailable. Code transfer suspended.'};
  $('sourceWarning').textContent=warnings[status]||'';
  $('resetText').textContent=allowed?new Date(resolution.config.validTo).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Waiting for current codes';
}
async function refreshCodes(){
  if(refreshing)return;refreshing=true;$('refreshCodes').disabled=true;$('refreshCodes').textContent='Syncing…';
  try{const snapshot=await fetchSourceSnapshot();let previous=null;try{previous=readLastVerified();}catch{}resolution=resolveSources(snapshot,previous);if(resolution.status==='VERIFIED'){try{writeLastVerified(resolution.config);}catch{}}}
  catch{resolution={...resolution,status:'FALLBACK',canCopy:false};}
  finally{refreshing=false;$('refreshCodes').disabled=false;$('refreshCodes').textContent='Refresh relay ↻';renderCodes();}
}
document.querySelectorAll('[data-silo]').forEach(button=>button.addEventListener('click',async()=>{if(!canCopyResolution(resolution)){renderCodes();toast('Code authorization has expired. Refresh the relay.');return;}try{await navigator.clipboard.writeText(resolution.config[button.dataset.silo]);toast(`Site ${button.dataset.silo.toUpperCase()} code copied.`);}catch{toast('Clipboard unavailable. Select and copy the displayed code manually.');}}));
$('refreshCodes').addEventListener('click',refreshCodes);
let wasCopyAllowed=false;
function tick(){
  const now=new Date();$('localTime').textContent=now.toLocaleTimeString(undefined,{hour12:false});$('localDate').textContent=now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
  $('sessionTime').textContent=formatElapsed(elapsedSession(session));$('sessionToggle').textContent=session.startedAt===null?(session.elapsed?'Resume session':'Start session'):'Pause session';
  const allowed=canCopyResolution(resolution);if(allowed!==wasCopyAllowed){renderCodes();wasCopyAllowed=allowed;}
  const remaining=Date.parse(resolution.config.validTo)-Date.now();$('countdownText').textContent=allowed?`${Math.floor(remaining/86400000)}d ${formatElapsed(remaining%86400000)}`:'AWAITING AUTHORIZATION';
}
$('sessionTime').setAttribute('aria-live','off');
$('volume').setAttribute('aria-label','Playback volume');
applyPrefs();renderNotes();renderCodes();renderAudio();tick();persist();refreshCodes();
setInterval(()=>{if(!document.hidden)tick();},1000);
setInterval(()=>{if(!document.hidden)refreshCodes();},15*60*1000);
window.addEventListener('focus',()=>{tick();refreshCodes();});window.addEventListener('online',refreshCodes);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();refreshCodes();}});
