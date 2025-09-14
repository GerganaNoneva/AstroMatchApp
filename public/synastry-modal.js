// synastry-modal.js — двоен модал: Партньор 1 и Партньор 2
// Изисквания (кратко):
// - В падащото меню първо се показва Първият документ от колекцията `user`,
//   след това всички профили от `users/{uid}/profiles`.
// - При избор на профил се попълва формата. При „ЗАПАЗИ И ИЗБЕРИ“:
//   A1) Без промени → НЕ пишем в БД, строим body от въведените данни, принтираме в конзолата,
//       заключваме формата, показваме overlay /images/izbrano.svg и бутон ПРОМЕНИ.
//   A2) С промени → Записваме промените в БД и правим същото като A1.
// - Бутон ИЗТРИЙ е активен само за записи от `users/{uid}/profiles`. Първият от `user` не може да се трие.
// - Бутон ИЗЧИСТИ чисти формата и падащото меню за град.
// - Ако няма избран профил и потребителят попълни всичко → „ЗАПАЗИ И ИЗБЕРИ“ създава нов профил в `users/{uid}/profiles`.
// - DST (лятно часово) добавя +1 към timezone.
// - След успешно „ЗАПАЗИ И ИЗБЕРИ“ се емитира и събитие partner1:saved / partner2:saved с payload.
let planetsP1;
let housesP1;
let planetsP2;
let housesP2;
let planetAllP1=[];
let planetAllP2=[];
const info = {};

// === UI helpers for loading + result (like horary) ===
const bgVideoSyn   = document.getElementById('bg-video');
const modalSyn     = document.getElementById('synastryModal');
const footerSyn    = document.querySelector('.analyze-footer');
const resultStageSyn = document.getElementById('resultStage');
const askgptCardSyn = document.querySelector('.askgpt-card');
const resultTitleSyn = document.getElementById('resultTitle');
let __synAnalyzing = false;

const resultImg1Syn  = document.getElementById('resultSynImg1');
const resultImg2Syn  = document.getElementById('resultSynImg2');
const resultTextSyn  = document.getElementById('resultText');
const loadingOverlaySyn = document.getElementById('loadingOverlay');

const COST_ASTRO = 15;

// Read the requested cost from the modal (#cc-cost) with a safe fallback
const COST_ASTRO_FALLBACK = COST_ASTRO;
function getRequestedCost(){
  const el = document.getElementById('cc-cost');
  if (!el) return COST_ASTRO_FALLBACK;
  const raw = (el.textContent||'').replace(/[^0-9.\-]/g,'').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : COST_ASTRO_FALLBACK;
}

const CREDITS_ICON = '/images/icons/zodiac_circle_money.png';

// Credit confirm modal elements (lazy lookup to avoid early nulls)
function $cc(){
  const scrim = document.getElementById('creditConfirm');
  return {
    scrim,
    title: document.getElementById('cc-title'),
    cost:  document.getElementById('cc-cost'),
    cost2: document.getElementById('cc-cost2'),
    bal:   document.getElementById('cc-balance'),
    ok:    document.getElementById('cc-confirm'),
    no:    document.getElementById('cc-cancel'),
  };
}
function openCreditConfirm(balance, cost){
  return new Promise((resolve) => {
    const { scrim, title, cost:ccCost, cost2:ccCost2, bal, ok, no } = $cc();
    if (!scrim) { return resolve(true); } // fallback: auto-confirm

    // normal state
    scrim.classList.remove('cc-insufficient');
    if (title)  title.textContent = 'Потвърдете покупката';
    if (ccCost) ccCost.textContent = String(cost);
    if (ccCost2)ccCost2.textContent = String(cost);
    if (bal)    bal.textContent    = String(balance);

    // show
    scrim.hidden = false;

    function cleanup(){
      try{
        ok && ok.removeEventListener('click', onOk, {capture:false});
        no && no.removeEventListener('click', onNo, {capture:false});
      }catch(_){}
    }
    function onOk(){ cleanup(); scrim.hidden = true; resolve(true); }
    function onNo(){ cleanup(); scrim.hidden = true; resolve(false); }

    ok && ok.addEventListener('click', onOk, {once:true});
    no && no.addEventListener('click', onNo, {once:true});
  });
}
async function getUserCredits(uid){
  try{
    const snap = await getDoc(doc(db, 'users', uid));
    const cur = Number((snap.exists() ? snap.data()?.credits : 0) || 0);
    return Number.isFinite(cur) && cur >= 0 ? cur : 0;
  }catch(e){
    console.error('[credits] getUserCredits failed:', e?.message||e);
    return 0;
  }
}

async function deductCredits(uid, cost){
  const ref = doc(db, 'users', uid);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = Number((snap.exists() ? snap.data()?.credits : 0) || 0);
    if (!Number.isFinite(cur) || cur < cost){
      throw new Error('INSUFFICIENT_CREDITS');
    }
    const next = cur - cost;
    tx.update(ref, { credits: next });
    return next;
  });
}


async function ensureVideoPlaysSyn(){
  try { if (bgVideoSyn && bgVideoSyn.paused) { await bgVideoSyn.play(); } } catch(e){ console.debug('[bg-video] play() blocked:', e?.message||e); }
}
function pauseVideoSyn(){
  try { if (bgVideoSyn && !bgVideoSyn.paused){ bgVideoSyn.pause(); } } catch(e){ console.debug('[bg-video] pause() failed:', e?.message||e); }
}

function stopVideoSyn(){
  try {
    if (!bgVideoSyn) return;
    bgVideoSyn.pause();
    // занули кадъра, за да не върви „на заден фон“
    try { bgVideoSyn.currentTime = 0; } catch(_) {}
    // махни автоплей и луп, за да не се стартира неочаквано
    bgVideoSyn.removeAttribute('autoplay');
    bgVideoSyn.removeAttribute('loop');
  } catch(e){
    console.debug('[bg-video] stop() failed:', e?.message || e);
  }
}

function showGeneratingSyn(){
  if (bgVideoSyn) { bgVideoSyn.style.display = ''; }
  ensureVideoPlaysSyn();
  if (modalSyn)  modalSyn.style.display = 'none';
  if (footerSyn) footerSyn.style.display = 'none';
  if (resultStageSyn) resultStageSyn.classList.add('hidden');
  if (askgptCardSyn) askgptCardSyn.style.display = 'none';
  if (loadingOverlaySyn) loadingOverlaySyn.hidden = false;
  document.body?.setAttribute('aria-busy','true');
}
function restoreUIOnErrorSyn(){
  if (loadingOverlaySyn) loadingOverlaySyn.hidden = true;
  if (modalSyn)  modalSyn.style.display = '';
  if (footerSyn) footerSyn.style.display = '';
  if (resultStageSyn) resultStageSyn.classList.add('hidden');
  if (askgptCardSyn) askgptCardSyn.style.display = 'none';
  if (bgVideoSyn) { bgVideoSyn.style.display=''; ensureVideoPlaysSyn(); }
  document.body?.removeAttribute('aria-busy');
}
function extractChartUrlMaybe(x){
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object'){
    return x.url || x.image_url || x.src || x.href || x.link || x.svg || x.png || '';
  }
  return '';
}
function showResultSyn(answer, name1, name2, chart1, chart2){
  if (loadingOverlaySyn) loadingOverlaySyn.hidden = true;
  stopVideoSyn();
  if (modalSyn)  modalSyn.style.display = 'none';
  if (footerSyn) footerSyn.style.display = 'none';
  if (resultStageSyn) resultStageSyn.classList.remove('hidden');
  if (resultTitleSyn) resultTitleSyn.textContent = `Астрологичен анализ на взаимоотношенията между ${name1} и ${name2}`;

  const c1 = extractChartUrlMaybe(chart1);
  const c2 = extractChartUrlMaybe(chart2);
  if (resultImg1Syn && c1){ resultImg1Syn.src = c1; resultImg1Syn.removeAttribute('hidden'); resultImg1Syn.alt = `Natal Chart — ${name1}`; }
  if (resultImg2Syn && c2){ resultImg2Syn.src = c2; resultImg2Syn.removeAttribute('hidden'); resultImg2Syn.alt = `Natal Chart — ${name2}`; }

  if (resultTextSyn) resultTextSyn.textContent = answer || '';

  document.body?.removeAttribute('aria-busy');
}


const planets_BG = {
  "Sun": "Слънце",
  "Moon": "Луна",
  "Mercury": "Меркурий",
  "Venus": "Венера",
  "Mars": "Марс",
  "Jupiter": "Юпитер",
  "Saturn": "Сатурн",
  "Uranus": "Уран",
  "Neptune": "Нептун",
  "Pluto": "Плутон",
  "Chiron": "Хирон",
  "Lilith": "Лилит",
  "True Node": "Северен възел"
}

const signs_BG = {
  "Aries": "Овен",
  "Taurus": "Телец",
  "Gemini": "Близнаци",
  "Cancer": "Рак",
  "Leo": "Лъв",
  "Virgo": "Дева",
  "Libra": "Везни",
  "Scorpio": "Скорпион",
  "Sagittarius": "Стрелец",
  "Capricorn": "Козирог",
  "Aquarius": "Водолей",
  "Pisces": "Риби",
}



import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore, collection, query, getDocs, limit, addDoc, doc, setDoc, deleteDoc, serverTimestamp, setLogLevel, getDoc, runTransaction, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

import { ensureSignedIn, ensureReportsShape, addReport } from './firebase-init.js';
try { setLogLevel('silent'); } catch(_) {}

const auth = getAuth();
const db   = getFirestore();


async function __saveSynastryReport(title, chartUrl1, chartUrl2, answerText){
  try {
    const user = await ensureSignedIn();
    if (!user) throw new Error('No authenticated user');
    await ensureReportsShape(user.uid);
    const firstLine = String(title || answerText || '').split('\n')[0].slice(0, 120).trim();
    const reportObj = {
      heading: firstLine || 'Синастричен анализ',
      chart1: String(chartUrl1 || ''),
      chart2: String(chartUrl2 || ''),
      report: String(answerText || ''),
      createdAt: new Date().toISOString()
    };
    await addReport(user.uid, 'synastry', reportObj);
    console.log('[Firestore] Saved synastry report for', user.uid, reportObj);
  } catch (err) {
    console.warn('Failed to save synastry report:', err);
  }
}



// === Utility helpers ===
const z2 = (n)=> String(n ?? '').padStart(2,'0');

function parseTimezone(v){
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/^(?:UTC|GMT)\s*/i, '');
  const m = s.match(/^([+\-])?(\d{1,2})(?::?(\d{2}))?$/);
  if (m){
    const sign = m[1] === '-' ? -1 : 1;
    const hh = parseInt(m[2],10);
    const mm = m[3] ? parseInt(m[3],10) : 0;
    return sign * (hh + mm/60);
  }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

function mapCityGeo(cg){ if (!cg) return null;
  const tzRaw = (cg.timezone_offset ?? cg.gmtOffset ?? cg.utcOffset ?? cg.tz_offset ?? cg.timezone ?? cg.tz);
  const tzNum = parseTimezone(tzRaw);
  const lat = Number(cg.latitude ?? cg.lat);
  const lon = Number(cg.longitude ?? cg.lon ?? cg.lng);
  const name = cg.complete_name || cg.name || cg.city || cg.display_name || '';
  const zoneId = (
    cg.zoneId ?? cg.timeZoneId ?? cg.timezoneId ?? cg.time_zone_id ?? cg.timezone_name ?? cg.timeZone
  ) || null;
  return { complete_name: name, latitude: lat, longitude: lon, timezone: tzNum, zoneId };
}

function optionFromGeo(geo){
  const o = document.createElement('option');
  o.textContent = geo.complete_name || `${geo.latitude}, ${geo.longitude}`;
  o.value = JSON.stringify({
    complete_name: geo.complete_name,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: geo.timezone,
    zoneId: geo.zoneId ?? null,
  });
  o.dataset.fullname = geo.complete_name;
  o.dataset.lat = String(geo.latitude);
  o.dataset.lon = String(geo.longitude);
  o.dataset.tz  = String(geo.timezone ?? '');
  if (geo.zoneId) o.dataset.zoneid = geo.zoneId;
  return o;
}

// === Global API rate limiter (1 req/sec) ===
const __RATE_MS = 3500;
window.__apiRate = window.__apiRate || { lastStart: 0, lastEnd: 0, cooldownUntil: 0, chain: Promise.resolve() };
const __sleep = (ms)=> new Promise(r => setTimeout(r, ms));

/**
 * Queued API call with pacing by request START time.
 * Retries 429 with backoff and honors Retry-After if provided.
 */

function __parseRetryAfter(h){
  if (!h) return null;
  // Numeric seconds
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n*1000));
  // HTTP-date
  const t = Date.parse(h);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return null;
}

async function callApi(endpoint, body, opts = {}){
  const { retries = 3 } = opts;

  const runner = async () => {
    const now = Date.now();
    // Respect server-declared cooldown
    if (window.__apiRate.cooldownUntil && now < window.__apiRate.cooldownUntil) {
      await __sleep(window.__apiRate.cooldownUntil - now);
    }
    // Pace by FINISH time to be safer with server-side accounting
    const sinceEnd = (window.__apiRate.lastEnd ? now - window.__apiRate.lastEnd : 0);
    const baseWait = (window.__apiRate.lastEnd ? Math.max(0, __RATE_MS - sinceEnd) : __RATE_MS);
    const jitter = Math.floor(Math.random() * 300);
    const waitMs = baseWait + jitter;
    if (waitMs > 0) await __sleep(waitMs);
console.debug(`[rate] starting ${endpoint} after wait=${waitMs}ms at`, new Date().toISOString());
    // Mark start to pace next call even if this one fast-fails.
    window.__apiRate.lastStart = Date.now();

    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });

    if (res.status === 429){
      let ra = res.headers.get('Retry-After');
      let extraWait = __parseRetryAfter(ra);
      if (extraWait == null) extraWait = (2 * __RATE_MS);
      window.__apiRate.cooldownUntil = Date.now() + extraWait;
      window.__apiRate.lastEnd = Date.now();
      if (retries > 0){
        await __sleep(extraWait);
        return callApi(endpoint, body, { retries: retries - 1 });
      }
    }

    if (!res.ok){
      const txt = await res.text().catch(()=> String(res.status));
      throw new Error(`[${endpoint}] HTTP ${res.status}: ${txt}`);
    }
    console.debug(`[rate] finished ${endpoint} with status ${res.status} at`, new Date().toISOString());
    window.__apiRate.lastEnd = Date.now();
    return res.json();
  };

  const next = window.__apiRate.chain.then(runner, runner);
  window.__apiRate.chain = next.catch(()=>{});
  return next;
}
function normalizeRecord(d = {}){
  const out = { ...d };
  out.__label = d.name || d.fullName || [d.firstName, d.lastName].filter(Boolean).join(' ') || '(без име)';

  let birthDate = d.birthDate || d.date || null;
  let birthTime = d.birthTime || d.time || null;
  let birthDST  = (typeof d.birthDST === 'boolean') ? d.birthDST : null;
  let birthCity = d.birthCity || d.city || d.place || null;
  let cityGeo   = d.cityGeo || null;

  const body = d.body || null;
  if (!birthDate && body && body.year!=null && body.month!=null && body.date!=null){
    birthDate = `${body.year}-${z2(body.month)}-${z2(body.date)}`;
  }
  if (!birthTime && body && (body.hours!=null || body.minutes!=null)){
    birthTime = `${z2(body.hours||0)}:${z2(body.minutes||0)}`;
  }
  if (!birthCity && cityGeo && (cityGeo.complete_name || cityGeo.name)){
    birthCity = cityGeo.complete_name || cityGeo.name;
  }

  return {
    ...out,
    __label: out.__label,
    birthDate: birthDate || '',
    birthTime: birthTime || '',
    birthDST:  !!birthDST,
    birthCity: birthCity || '',
    cityGeo:   cityGeo || null,
  };
}

// === Контролер за едната страна ===
class PartnerFormController{
  constructor(side){
    this.side = side; // 'p1' | 'p2'
    this.root   = document.getElementById(side);
    this.select = document.getElementById(`profilesSelect-${side}`);
    this.nm     = document.getElementById(`nm-${side}`);
    this.dt     = document.getElementById(`dt-${side}`);
    this.tm     = document.getElementById(`tm-${side}`);
    this.dst    = document.getElementById(`dst-${side}`);
    this.city   = document.getElementById(`city-${side}`);
    this.cityBtn= document.getElementById(`citySearch-${side}`);
    this.cityDD = document.getElementById(`cityDropdown-${side}`);

    this.btnSave = document.getElementById(`saveChoose-${side}`);
    this.btnDel  = document.getElementById(`deleteProfile-${side}`);
    this.btnClr  = document.getElementById(`clearForm-${side}`);
    this.btnEdit = document.getElementById(`editMode-${side}`);
    this.btnEditHome = this.btnEdit?.parentElement || null;

    // state
    this.firstUser = null;    // първият запис от `user`
    this.profiles  = [];      // всички от `users/{uid}/profiles`
    this.currentSelection = { id:null, source:null }; // source: 'user-first' | 'users-profiles' | null
    this.selectedCity = null; // {complete_name, latitude, longitude, timezone, zoneId}
    this.lastSnapshot = null; // JSON на текущото състояние
    this.locked = false;      // дали формата е заключена (избрано)

    this.bindEvents();
    this.renderSelect();
    this.syncButtons();
  }

  // === UI helpers ===
  ensureOverlay(){
    if (this.overlay) return this.overlay;
    const veil = document.createElement('div');
    veil.className = 'chosen-veil hidden';
    veil.setAttribute('aria-hidden','true');
    const img = document.createElement('img');
    img.src = '/images/izbrano.svg';
    img.alt = 'ИЗБРАНО';
    veil.appendChild(img);
    this.root.appendChild(veil);
    this.overlay = veil; return veil;
  }
  showOverlay(on){
    const v = this.ensureOverlay();
    v.classList.toggle('hidden', !on);
  }

  setEnabled(on){
    const ctrls = [this.nm,this.dt,this.tm,this.dst,this.city,this.cityBtn,this.cityDD,this.select,this.btnClr,this.btnDel];
    ctrls.forEach(el=>{ if (el) el.disabled = !on; });
  }
  setLocked(isLocked){
    this.locked = !!isLocked;
    this.setEnabled(!this.locked);
    if (this.btnSave) this.btnSave.style.display = this.locked ? 'none' : '';
    if (this.btnEdit) this.btnEdit.style.display = this.locked ? '' : 'none';
    this.showOverlay(this.locked);
    this.syncButtons();

    // Преместваме ПРОМЕНИ долу център върху картата
    try{
      if (this.btnEdit){
        if (this.locked){
          if (this.btnEdit.parentElement !== this.root) this.root.appendChild(this.btnEdit);
          this.btnEdit.classList.add('edit-bottom');
        } else {
          this.btnEdit.classList.remove('edit-bottom');
          if (this.btnEditHome && this.btnEdit.parentElement !== this.btnEditHome) this.btnEditHome.appendChild(this.btnEdit);
        }
      }
    }catch(_){}

    try { window.dispatchEvent(new CustomEvent('synastry:lock-changed', { detail: { side: this.side, locked: this.locked, id: this.currentSelection?.id || null } })); } catch(_){ }
  }

  // === Form state ===
  getFormState(){
    const name = (this.nm?.value || '').trim();
    const date = (this.dt?.value || '').trim();
    const time = (this.tm?.value || '').trim();
    const city = (this.city?.value || '').trim();
    const dst  = !!(this.dst?.checked);
    const hasGeo = !!this.getCurrentCityGeo();
    const allFilled = !!(name && date && time && city && hasGeo);
    return { name, date, time, city, dst, hasGeo, allFilled };
  }
  snapshot(){
    const { name, date, time, city, dst } = this.getFormState();
    const geo = this.getCurrentCityGeo();
    this.lastSnapshot = JSON.stringify({ name,date,time,city,dst,geo });
  }
  isChanged(){
    const { name, date, time, city, dst } = this.getFormState();
    const geo = this.getCurrentCityGeo();
    const now = JSON.stringify({ name,date,time,city,dst,geo });
    return now !== this.lastSnapshot;
  }
  syncButtons(){
    const { allFilled } = this.getFormState();
    if (this.btnSave) this.btnSave.disabled = !allFilled || this.locked;
    if (this.btnClr)  this.btnClr.disabled  = false; // винаги позволи „ИЗЧИСТИ“
    const canDelete = (this.currentSelection.source === 'users-profiles') && !!this.currentSelection.id;
    if (this.btnDel) this.btnDel.disabled = !canDelete || this.locked; // не трием в заключено състояние
  }

  // === Rendering ===
  renderSelect(){
    const sel = this.select; if (!sel) return;
    sel.innerHTML = '';

    const def = document.createElement('option');
    def.value = '';
    def.textContent = (this.firstUser || this.profiles.length) ? '— изберете профил —' : 'няма налични профили';
    def.disabled = true; def.selected = true;
    sel.appendChild(def);

    if (this.firstUser){
      const opt0 = document.createElement('option');
      opt0.value = this.firstUser.id;     // `user:<docId>`
      opt0.textContent = `★ ${this.firstUser.__label || this.firstUser.name || '(без име)'}`;
      opt0.dataset.source = 'user-first';
      sel.appendChild(opt0);
    }

    for (const p of this.profiles){
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.__label || p.name || '(без име)';
      opt.dataset.source = 'users-profiles';
      sel.appendChild(opt);
    }

    this.currentSelection = { id:null, source:null };
    sel.selectedIndex = 0;
    this.snapshot();
    this.syncButtons();
  }

  async loadUserFirst(uid){
    try{
      const qy = query(collection(db,'users', uid, 'user'), limit(1));
      const snap = await getDocs(qy);
      let d0 = null; snap.forEach(d => { if (!d0) d0 = d; });
      if (d0){
        this.firstUser = normalizeRecord({ id: `user:${d0.id}`, source:'user-first', ...(d0.data()||{}) });
      } else {
        this.firstUser = null;
      }
    }catch(e){ console.warn(`[${this.side}] loadUserFirst err:`, e); this.firstUser = null; }
  }
  async loadProfiles(uid){
    const list = [];
    try{
      const snap = await getDocs(collection(db,'users', uid, 'profiles'));
      snap.forEach(d => list.push(normalizeRecord({ id: d.id, source:'users-profiles', ...(d.data()||{}) })) );
    }catch(e){ console.warn(`[${this.side}] loadProfiles err:`, e); }
    this.profiles = list;
  }
  async initForUser(uid){
    await this.loadUserFirst(uid);
    await this.loadProfiles(uid);
    this.renderSelect();
  }

  // === Fill & City helpers ===
  fillForm(rec){
    const d = normalizeRecord(rec||{});
    if (this.nm)   this.nm.value   = d.__label || '';
    if (this.dt)   this.dt.value   = d.birthDate || '';
    if (this.tm)   this.tm.value   = d.birthTime || '';
    if (this.city) this.city.value = d.birthCity || '';
    if (this.dst)  this.dst.checked= !!d.birthDST;

    this.selectedCity = d.cityGeo ? mapCityGeo(d.cityGeo) : this.selectedCity;
    this.snapshot();
    this.syncButtons();
  }

  getCurrentCityGeo(){
    if (this.selectedCity) return this.selectedCity;

    // от текущия избор
    if (this.currentSelection.source === 'users-profiles'){
      const rec = this.profiles.find(x => x.id === this.currentSelection.id);
      if (rec?.cityGeo) return mapCityGeo(rec.cityGeo);
      if (rec?.body && rec.body.latitude!=null && rec.body.longitude!=null){
        return mapCityGeo({
          complete_name: rec.birthCity || rec.city || rec.place || rec.name || '',
          latitude: rec.body.latitude,
          longitude: rec.body.longitude,
          timezone: rec.body.timezone ?? null,
          zoneId: rec.body.zoneId ?? null,
        });
      }
    }
    if (this.currentSelection.source === 'user-first'){
      const rec = this.firstUser || {};
      if (rec.cityGeo) return mapCityGeo(rec.cityGeo);
      if (rec.body && rec.body.latitude!=null && rec.body.longitude!=null){
        return mapCityGeo({
          complete_name: rec.birthCity || rec.city || rec.place || rec.name || '',
          latitude: rec.body.latitude,
          longitude: rec.body.longitude,
          timezone: rec.body.timezone ?? null,
          zoneId: rec.body.zoneId ?? null,
        });
      }
    }
    return null;
  }

  parseGeoResponse(json){
    const raw = json?.data || json?.results || json?.locations || json || [];
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map(r => mapCityGeo({
      complete_name: r.complete_name || r.name || r.city || r.display_name,
      latitude: r.latitude ?? r.lat,
      longitude: r.longitude ?? r.lon ?? r.lng,
      timezone_offset: r.timezone_offset ?? r.gmtOffset ?? r.utcOffset ?? r.tz_offset ?? r.timezone ?? r.tz,
      zoneId: r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone,
    })).filter(g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
  }

  populateCityDropdown(geos){
    if (!this.cityDD) return;
    this.cityDD.classList.remove('hidden');
    this.cityDD.innerHTML = '';
    const ph = document.createElement('option');
    ph.textContent = 'избери град'; ph.disabled = true; ph.selected = true;
    this.cityDD.appendChild(ph);
    geos.forEach(g => this.cityDD.appendChild(optionFromGeo(g)));
    this.cityDD.focus();
  }
  async commitCitySelection(){
    const sel = this.cityDD?.selectedOptions?.[0] || null;
    if (!sel) return;
    try { this.selectedCity = mapCityGeo(JSON.parse(sel.value)); }
    catch{
      this.selectedCity = {
        complete_name: sel.dataset.fullname || sel.textContent.trim(),
        latitude: parseFloat(sel.dataset.lat),
        longitude: parseFloat(sel.dataset.lon),
        timezone: parseTimezone(sel.dataset.tz),
        zoneId: sel.dataset.zoneid || null,
      };
    }

    // Ако няма tz/zoneId — обогати по координати
    if (!Number.isFinite(this.selectedCity?.timezone) || this.selectedCity.zoneId == null){
      try{
        const enrich = await callApi('geo-details', { latitude: this.selectedCity.latitude, longitude: this.selectedCity.longitude });
        const arr = Array.isArray(enrich?.data) ? enrich.data : (Array.isArray(enrich) ? enrich : []);
        if (arr.length){
          const r = arr[0];
          const candTz = r.timezone_offset ?? r.gmtOffset ?? r.utcOffset ?? r.tz_offset ?? r.timezone ?? r.tz ?? null;
          const candZone = r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone ?? null;
          const tzNum = parseTimezone(candTz);
          if (Number.isFinite(tzNum)) this.selectedCity.timezone = tzNum;
          if (!this.selectedCity.zoneId && typeof candZone === 'string') this.selectedCity.zoneId = candZone;
        }
      }catch(e){ console.warn('[geo] enrich timezone failed:', e); }
    }

    if (this.city && this.selectedCity?.complete_name) this.city.value = this.selectedCity.complete_name;
    this.snapshot();
    this.syncButtons();
  }
  resetCityDropdown(){
    if (!this.cityDD) return;
    this.cityDD.innerHTML = '<option disabled selected>избери град</option>';
    this.cityDD.classList.add('hidden');
    this.selectedCity = null;
  }

  // === Build payload/body ===
  buildBodyFromForm(){
    const { name, date, time, dst } = this.getFormState();
    const [Y,M,D] = (date||'').split('-').map(Number);
    const [h,mn]  = (time||'').split(':').map(Number);
    const geo = this.getCurrentCityGeo();

    const body = {
      year: Y||0,
      month: M||0,
      date: D||0,
      hours: h||0,
      minutes: mn||0,
      seconds: 0,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      timezone: (typeof geo?.timezone === 'number' ? (geo.timezone + (dst ? 1 : 0)) : null),
      config: {
        observation_point: 'topocentric',
        ayanamsha: 'tropical',
        language: 'en',
      },
    };

    const pack = {
      body,
      name,
      birthDate: `${z2(body.year)}-${z2(body.month)}-${z2(body.date)}`,
      birthTime: `${z2(body.hours)}:${z2(body.minutes)}`,
      birthDST:  !!dst,
      birthCity: this.city?.value || '',
      cityGeo:   geo ? { complete_name: geo.complete_name, latitude: geo.latitude, longitude: geo.longitude, timezone: geo.timezone, zoneId: geo?.zoneId ?? null } : null,
    };

    return pack;
  }

  // === Events binding ===
  bindEvents(){
    // typing → enable/disable
    [this.nm,this.dt,this.tm,this.city,this.dst].forEach(el => el && el.addEventListener('input', ()=> this.syncButtons()));

    // профил от падащото
    this.select?.addEventListener('change', (e) => {
      const id = String(e.target.value || '');
      if (!id){
        this.currentSelection = { id:null, source:null };
        this.snapshot(); this.syncButtons(); return;
      }
      if (id.startsWith('user:')){
        this.currentSelection = { id, source:'user-first' };
        this.fillForm(this.firstUser||{});
      } else {
        const rec = this.profiles.find(x => x.id === id) || null;
        this.currentSelection = { id, source: (rec && rec.source) ? rec.source : 'users-profiles' };
        if (rec) this.fillForm(rec);
      }
    });

    // търси град
    this.cityBtn?.addEventListener('click', async () => {
      const q = (this.city?.value || '').trim();
      if (!q) return alert('Въведете град за търсене.');
      this.cityBtn.disabled = true; this.cityBtn.textContent = 'ТЪРСЯ...';
      try{
        const json = await callApi('geo-details', { city: q });
        const geos = this.parseGeoResponse(json);
        if (!geos.length){ alert('Не бяха намерени резултати. Опитайте с друг правопис.'); return; }
        this.populateCityDropdown(geos);
      }catch(err){ console.error('[geo] грешка при търсене:', err); alert('Грешка при търсене на град. Виж конзолата.'); }
      finally{ this.cityBtn.disabled = false; this.cityBtn.textContent = 'ТЪРСИ'; }
    });

    // избор на град: Enter / dblclick
    this.cityDD?.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); this.commitCitySelection(); }});
    this.cityDD?.addEventListener('dblclick', ()=> this.commitCitySelection());
    // избор на град с единичен клик/тап (или промяна от клавиатурата)
    this.cityDD?.addEventListener('change', () => {
      if (this.cityDD.selectedIndex > 0) {
        this.commitCitySelection();
      }
    });


    // ЗАПАЗИ И ИЗБЕРИ
    this.btnSave?.addEventListener('click', async () => {
      if (!auth.currentUser) return alert('Моля, влезте в профила си.');
      const { allFilled } = this.getFormState();
      if (!allFilled) return;

      const uid = auth.currentUser.uid;
      const pack = this.buildBodyFromForm();
      // запази последното body за този партньор (ще се ползва при ГЕНЕРИРАЙ АНАЛИЗ)
      try { window.__synBodies = window.__synBodies || {}; window.__synBodies[this.side] = pack.body; } catch(_) {}

      // === 1) принтни body в конзолата ===
      console.group(`[${this.side}] SAVE & CHOOSE`);
      console.log('SYN BODY:', pack.body);

      // === 2) запис/без запис в БД според случая ===
      try{
        let finalId = this.currentSelection.id || null;
        const payload = {
          ownerId: uid,
          name: pack.name,
          birthDate: pack.birthDate,
          birthTime: pack.birthTime,
          birthDST:  pack.birthDST,
          birthCity: pack.birthCity,
          cityGeo:   pack.cityGeo,
          body:      pack.body,
          updatedAt: serverTimestamp(),
        };

        if (this.currentSelection.source === 'users-profiles' && this.currentSelection.id){
          // A) избран профил от profiles — обновяваме само ако има промени
          if (this.isChanged()){
            await setDoc(doc(db,'users', uid, 'profiles', this.currentSelection.id), payload, { merge:true });
          }
          finalId = this.currentSelection.id;
        } else if (this.currentSelection.source === 'user-first' && this.currentSelection.id?.startsWith('user:')){
          // B) първият от `user` — обновяваме само ако има промени
          const userDocId = this.currentSelection.id.slice(5);
          if (this.isChanged()){
            await setDoc(doc(db,'users', uid, 'user', userDocId), payload, { merge:true });
          }
          finalId = this.currentSelection.id;
        } else {
          // C) няма избран профил — създаваме нов в users/{uid}/profiles
          payload.createdAt = serverTimestamp();
          const ref = await addDoc(collection(db,'users', uid, 'profiles'), payload);
          this.currentSelection = { id: ref.id, source:'users-profiles' };
          finalId = ref.id;
        }

        // === 3) заключи UI и покажи overlay/ПРОМЕНИ ===
        this.snapshot();
        this.setLocked(true);
        this.syncButtons();

        // === 4) изпрати събития към bootstrap-а ===
        try{
          const generic = { side: this.side, id: finalId, payload };
          window.dispatchEvent(new CustomEvent('synastry:partner-chosen', { detail: generic }));
          const evName = (this.side === 'p1') ? 'partner1:saved' : 'partner2:saved';
          window.dispatchEvent(new CustomEvent(evName, { detail: payload }));
        }catch(_){ }

      }catch(e){
        console.error('[profiles] save failed:', e);
        alert('Записът беше отказан от правилата или възникна грешка.');
      } finally {
        console.groupEnd();
      }
    });

    // ИЗТРИЙ (само за users/{uid}/profiles)
    this.btnDel?.addEventListener('click', async () => {
      if (!auth.currentUser) return alert('Моля, влезте в профила си.');
      if (!this.currentSelection.id || this.currentSelection.source !== 'users-profiles') return;
      if (!confirm('Сигурни ли сте, че искате да изтриете този профил?')) return;
      const uid = auth.currentUser.uid;
      try{
        await deleteDoc(doc(db,'users', uid, 'profiles', this.currentSelection.id));
        // Ако имате и root `profiles`, опитайте да изтриете и него (тихо)
        try { await deleteDoc(doc(db, 'profiles', this.currentSelection.id)); } catch(_){ }

        this.clearForm(true);
        await this.initForUser(uid);
      }catch(e){
        console.error('[profiles] delete failed:', e);
        alert('Изтриването беше отказано от правилата или възникна грешка.');
      }
    });

    // ИЗЧИСТИ
    this.btnClr?.addEventListener('click', () => this.clearForm());

    // ПРОМЕНИ
    this.btnEdit?.addEventListener('click', () => { this.setLocked(false); this.syncButtons(); });
  }

  clearForm(skipSnap = false){
    if (this.nm)   this.nm.value = '';
    if (this.dt)   this.dt.value = '';
    if (this.tm)   this.tm.value = '';
    if (this.city) this.city.value = '';
    if (this.dst)  this.dst.checked = false;
    this.resetCityDropdown();
    this.currentSelection = { id:null, source:null };
    if (!skipSnap) this.snapshot();
    this.setLocked(false);
    this.syncButtons();
  }
}

// === Analyze button enabled only if и двамата са избрани ===
function updateAnalyzeReady(){
  const btn = document.getElementById('analyzeBtn');
  if (!btn) return;
  const hasP1 = !!(window.__synChosenP1 && window.__synChosenP1.id);
  const hasP2 = !!(window.__synChosenP2 && window.__synChosenP2.id);
  btn.disabled = !(hasP1 && hasP2);
}
function setChosenState(side, detail){
  if (side === 'p1') window.__synChosenP1 = { id: detail.id || null, locked: true };
  if (side === 'p2') window.__synChosenP2 = { id: detail.id || null, locked: true };
  updateAnalyzeReady();
}
function setLockState(side, locked){
  if (side === 'p1') { window.__synChosenP1 = window.__synChosenP1 || {}; window.__synChosenP1.locked = !!locked; }
  if (side === 'p2') { window.__synChosenP2 = window.__synChosenP2 || {}; window.__synChosenP2.locked = !!locked; }
  updateAnalyzeReady();
}

// === Инициализация ===
const p1 = new PartnerFormController('p1');
const p2 = new PartnerFormController('p2');

onAuthStateChanged(auth, (user) => {
  if (!user){
    p1.profiles = []; p1.firstUser = null; p1.renderSelect();
    p2.profiles = []; p2.firstUser = null; p2.renderSelect();
    return;
  }
  (async () => { const uid = user.uid; await p1.initForUser(uid); await p2.initForUser(uid); })();
});

// Информативни слушатели (и поддръжка на бутона ГЕНЕРИРАЙ АНАЛИЗ)
window.addEventListener('synastry:partner-chosen', (ev) => { const { side, id } = ev.detail || {}; setChosenState(side, { id }); });
window.addEventListener('synastry:lock-changed', (ev) => { const { side, locked } = ev.detail || {}; setLockState(side, locked); });

// При стартиране — деактивирай бутона, докато не се изберат и двамата
updateAnalyzeReady();

// === ГЕНЕРИРАЙ АНАЛИЗ: за двамата партньори извикай planets, houses, natal-chart-wheel и принтирай ===
(function attachAnalyzeHandler(){
  const btn = document.getElementById('analyzeBtn');
  let synPaying = false;
  if (!btn) return;

  async function runForSide(sideKey, body){
    console.group(`[ANALYZE] ${sideKey === 'p1' ? 'Партньор 1' : 'Партньор 2'}`);
    try{
      console.log('➡ body:', body);
      const planetsP = callApi('planets', body);
      const housesP  = callApi('houses', body);

      // primary endpoint (новото име) с fallback към старото, ако гръмне
      let wheel;
      try {
        wheel = await callApi('natal-wheel-chart', body);
      } catch(_){
        try {
          wheel = await callApi('natal-chart-wheel', body);
        } catch(e2){
          console.warn('[wheel] fallback също не успя:', e2);
          throw e2;
        }
      }

      const planets = await planetsP;
      const houses = await housesP;
      console.log('✅ planets:', planets);
      console.log('✅ houses:', houses);
      console.log('✅ natal-wheel-chart:', wheel);

      // само запази резултатите за страната; кръстосаните пресмятания ще са СЛЕД Promise.all
      info[sideKey] = { planets: planets.output, houses: houses.output, chart: wheel.output };
      console.log('[info updated]', sideKey, info[sideKey]);

      // пазим суровите отговори за по-нататъшна употреба
      try {
        window.__synApiRaw = window.__synApiRaw || { p1:{}, p2:{} };
        window.__synApiRaw[sideKey].planets = planets;
        window.__synApiRaw[sideKey].houses  = houses;
        window.__synApiRaw[sideKey].wheel   = wheel;
        window.dispatchEvent(new CustomEvent('synastry:api-results', { detail: { side: sideKey, planets, houses, wheel } }));
      } catch(_) {}
    }catch(err){
      console.error(`[ANALYZE] Грешка за ${sideKey}:`, err);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  btn.addEventListener('click', async () => {
  try {
    if (__synAnalyzing) return;
    __synAnalyzing = true;

    if (synPaying) return;
    synPaying = true;
    
    // === Astro Credits gate ===
    if (!auth.currentUser){ alert('Моля, влезте в профила си.'); return; }
    const uid = auth.currentUser.uid;
    const origHTML = btn.innerHTML;
    try{
      const cost = getRequestedCost();
      const balance = await getUserCredits(uid);
      if (balance < cost){
        // Show the credit modal in "insufficient" state instead of alert
        try { showInsufficientCredits(); } catch(_) { alert('Нямате достатъчно кредити.'); }
        restoreUIOnErrorSyn();
        btn.disabled = false;
        btn.innerHTML = origHTML;
        synPaying = false;
        __synAnalyzing = false;
        return;
      }
      const ok = await openCreditConfirm(balance, cost);
      if (!ok){ __synAnalyzing=false; synPaying=false; return; }
      // 👉 Стартираме анимацията веднага след Потвърди
      btn.disabled = true;
      btn.innerHTML = origHTML;
      showGeneratingSyn();


      // Deduct credits atomically
      try {
        await deductCredits(uid, cost);
      } catch(e){
        if (String(e.message||e).includes('INSUFFICIENT')){ restoreUIOnErrorSyn(); btn.disabled=false; btn.innerHTML = origHTML; alert('Нямате достатъчно кредити. Моля, заредете и опитайте отново.'); return; }
        console.error('[credits] deduct failed:', e);
        alert('Неуспешно плащане. Опитайте отново.');
        restoreUIOnErrorSyn(); btn.disabled=false; btn.innerHTML = origHTML;
        synPaying=false; __synAnalyzing=false;
        return;
      }

      // proceed with original flow
      btn.disabled = true; btn.innerHTML = origHTML;
      showGeneratingSyn();
    }catch(e){
      console.error('[credits] gate error:', e);
      return;
    }
    
      // Опитай да вземеш запомнените body-та от SAVE, иначе ги построи от формите
      const b1 = (window.__synBodies && window.__synBodies.p1) || (typeof p1 !== 'undefined' ? p1.buildBodyFromForm().body : null);
      const b2 = (window.__synBodies && window.__synBodies.p2) || (typeof p2 !== 'undefined' ? p2.buildBodyFromForm().body : null);
      const nameP1Early = (document.getElementById('nm-p1')?.value || 'Партньор 1').trim() || 'Партньор 1';
      const nameP2Early = (document.getElementById('nm-p2')?.value || 'Партньор 2').trim() || 'Партньор 2';
      console.log('[Имена - начално]', { partner1: nameP1Early, partner2: nameP2Early });
      if (!b1 || !b2){ alert('Моля, попълнете и изберете и двамата партньори.'); restoreUIOnErrorSyn(); return; }

      // 1) Дърпаме данните ПАРАЛЕЛНО
      await Promise.all([ runForSide('p1', b1), runForSide('p2', b2) ]);

      // 2) Кръстосани пресмятания — чак СЛЕД като и двамата са готови
      // Изчистваме буферите (ако анализът се пуска повторно)
      planetAllP1 = [];
      planetAllP2 = [];

      const hasP1 = info?.p1 && Array.isArray(info.p1.planets) && info.p1.houses?.Houses;
      const hasP2 = info?.p2 && Array.isArray(info.p2.planets) && info.p2.houses?.Houses;
      if (!hasP1 || !hasP2){
        console.warn('[ANALYZE] липсва info.p1 или info.p2 за кръстосания анализ:', { hasP1, hasP2, info });
        alert('Възникна проблем при изтегляне на данните. Опитайте отново.');
        restoreUIOnErrorSyn();
        return;
      }

      const getSignBg = (obj) => {
        const en = obj?.zodiac_sign?.name?.en;
        return (en && (signs_BG[en] || en)) || '—';
      };

      for (const pl in planets_BG) {
        console.log(info.p1.planets)
        const p1Pl = info.p1.planets.find(el => el?.planet?.en === pl);
        console.log(p1Pl)
        if (p1Pl && Number.isFinite(p1Pl.fullDegree)){
          const house1 = getHouseByDegree(p1Pl.fullDegree, info.p1.houses.Houses);
          const partner1 = getHouseByDegree(p1Pl.fullDegree, info.p2.houses.Houses);
          planetAllP1.push({ pl: {
            name: planets_BG[pl],
            sign: getSignBg(p1Pl),
            house: house1,
            houseOfPartner: partner1
          }});
        }
        console.log(planetAllP1)
        const p2Pl = info.p2.planets.find(el => el?.planet?.en === pl);
        if (p2Pl && Number.isFinite(p2Pl.fullDegree)){
          const house2 = getHouseByDegree(p2Pl.fullDegree, info.p2.houses.Houses);
          const partner2 = getHouseByDegree(p2Pl.fullDegree, info.p1.houses.Houses);
          planetAllP2.push({ pl: {
            name: planets_BG[pl],
            sign: getSignBg(p2Pl),
            house: house2,
            houseOfPartner: partner2
          }});
        }
      }

      console.log('[planetAllP1]', planetAllP1);
      console.log('[planetAllP2]', planetAllP2);

      const aspectsBetween = computeAspects(info.p1.planets, info.p2.planets);
      console.table(aspectsBetween);

      let planetP1Text = '';
      let planetP2Text = '';
      let aspectsText  = '';

      for (const pl of planetAllP1) {
        console.log(pl)
        planetP1Text += `${pl.pl.name} в ${pl.pl.sign} в ${pl.pl.house} дом. Попада в ${pl.pl.houseOfPartner} дом на партньора. `;
      }
      for (const pl of planetAllP2) {
        planetP2Text += `${pl.pl.name} в ${pl.pl.sign} в ${pl.pl.house} дом. Попада в ${pl.pl.houseOfPartner} дом на партньора. `;
      }
      for (const asp of aspectsBetween) {
        aspectsText += `${asp.pl1} прави ${asp.aspect} с ${asp.pl2} с орбис ${asp.orb} градуса. `;
      }

      console.log('[planetP1Text]', planetP1Text);
      console.log('[planetP2Text]', planetP2Text);
      console.log('[aspects]', aspectsText);

      // === Names from inputs (fallbacks) ===
      const nm1 = (document.getElementById('nm-p1')?.value || 'Партньор 1').trim() || 'Партньор 1';
      const nm2 = (document.getElementById('nm-p2')?.value || 'Партньор 2').trim() || 'Партньор 2';

      // 3) Print names to console as requested
      console.log('[Имена] Партньор 1:', nm1);
      console.log('[Имена] Партньор 2:', nm2);

      // 4) Build the ChatGPT-5 prompt exactly as specified
      const prompt = "Направи синастричен анализ на взаимоотношенията, като ползваш общите правила и ползваш имената на партньор 1 и на партньор 2 и имаш следната информация: " +
                     "планети на партньор 1 — " + planetP1Text + "; " +
                     "на партньор 2 — " + planetP2Text + "; " +
                     "аспекти между планетите — " + aspectsText + ";" +
                     " Имената са: Партньор 1 — " + nm1 + "; Партньор 2 — " + nm2 + "." +
                     "Направи анализа разказвателно, да няма астрологични термини. Да се разбира от човек, който не разбира от Астрология";

      // 5) While ChatGPT runs, keep global loader visible (already on); hide everything else
      // (UI was hidden at click; see showGeneratingSyn())

      // 6) Call GPT-5 via our API
      let gpt;
      try {
        try {
          gpt = await callApi('ask', { question: prompt });
        } catch(eAsk){
          gpt = await callApi('chat', { question: prompt });
        }
      } catch(gErr){
        console.error('[GPT-5 ERROR]', gErr);
        restoreUIOnErrorSyn();
        alert('Грешка при заявката към ChatGPT: ' + (gErr?.message || gErr));
        return;
      }

      const answer = (gpt && (gpt.answer || gpt.output || gpt.text)) || '';
      // 7) Render final screen: title + two natal charts + formatted answer
      const ch1 = info?.p1?.chart || null;
      const ch2 = info?.p2?.chart || null;
      showResultSyn(answer, nm1, nm2, ch1, ch2);
// Persist synastry report for the current user
__saveSynastryReport(`Астрологичен анализ на взаимоотношенията между ${nm1} и ${nm2}` , ch1, ch2, answer);

    } catch(e) {
      console.error('[ANALYZE] неуспешно:', e);
    } finally {
      __synAnalyzing=false;
      synPaying=false;

      btn.disabled=false; 
    }
  });
})();


/**
 * Намира дома (1–12) за планета по абсолютен градус.
 * @param {number} fullDegreee - Абсолютен зодиакален градус [0, 360)
 * @param {{House:number, degree:number}[]} cusps - Масив от 12 дома с абсолютни градуси на куспидите
 * @returns {number} Цяло число от 1 до 12
 */
function getHouseByDegree(fullDegreee, cusps) {
  if (!Number.isFinite(fullDegreee)) {
    throw new Error("fullDegreee трябва да е число.");
  }
  if (!Array.isArray(cusps) || cusps.length !== 12) {
    throw new Error("cusps трябва да е масив от 12 елемента.");
  }

  // Нормализира до [0,360)
  const mod360 = (d) => ((d % 360) + 360) % 360;

  // Подреждаме по номер на дом (1→12) и нормализираме градусите
  const sorted = [...cusps]
    .sort((a, b) => a.House - b.House)
    .map((c) => ({ house: c.House, deg: mod360(c.degree) }));

  // Проверка дали имаме 1-ви дом
  if (sorted[0].house !== 1) {
    const idx1 = sorted.findIndex((c) => c.house === 1);
    if (idx1 === -1) throw new Error("Липсва куспид за 1-ви дом.");
    // Ротираме така, че 1-вият дом да е на позиция 0 (по-надеждно при странен вход)
    const rotated = [...sorted.slice(idx1), ...sorted.slice(0, idx1)];
    sorted.length = 0;
    sorted.push(...rotated);
  }

  // „Развиваме“ (unwrap) градусите, за да са строго нарастващи през 360°
  const unwrapped = new Array(12);
  unwrapped[0] = sorted[0].deg;
  for (let i = 1; i < 12; i++) {
    let d = sorted[i].deg;
    while (d < unwrapped[i - 1]) d += 360; // добавяме 360°, докато редът стане нарастващ
    unwrapped[i] = d;
  }

  // Нормализираме градуса на планетата в същия „цикъл“, започващ от куспида на 1 дом
  let d = mod360(fullDegreee);
  while (d < unwrapped[0]) d += 360;

  // Правило за принадлежност:
  // Домът е интервалът [куспид_i, куспид_{i+1}), т.е. включително долната граница.
  // Така планета точно на куспид влиза в започващия от него дом (астрологично стандартно).
  for (let i = 0; i < 11; i++) {
    if (d < unwrapped[i + 1]) return sorted[i].house; // между i и i+1
  }
  // Ако е след куспида на 12 дом, но преди следващия 1 дом → 12 дом
  return sorted[11].house;
}

// Твоят списък с аспекти
const ASPECTS = [
  { name: "Conjunction", angle: 0,   orb: 5,   sunMoonOrb: 8 },
  { name: "Semi sextile", angle: 30, orb: 1,   sunMoonOrb: 2 },
  { name: "Decile", angle: 36,       orb: 1,   sunMoonOrb: 1 },
  { name: "Nonagon", angle: 40,      orb: 2,   sunMoonOrb: 2 },
  { name: "Semi square", angle: 45,  orb: 1,   sunMoonOrb: 1.5 },
  { name: "Sextile", angle: 60,      orb: 5,   sunMoonOrb: 8 },
  { name: "Quintile", angle: 72,     orb: 2,   sunMoonOrb: 2 },
  { name: "Bino¬nonagon", angle: 80, orb: 1,   sunMoonOrb: 1 },
  { name: "Square", angle: 90,       orb: 5,   sunMoonOrb: 8 },
  { name: "Senta¬gon", angle: 100,   orb: 1.5, sunMoonOrb: 1.5 },
  { name: "Tridecile", angle: 108,   orb: 1.5, sunMoonOrb: 2 },
  { name: "Trine", angle: 120,       orb: 5,   sunMoonOrb: 8 },
  { name: "Sesqui square", angle: 135, orb: 2, sunMoonOrb: 3 },
  { name: "Bi quintile", angle: 144,   orb: 1, sunMoonOrb: 1 },
  { name: "Quincunx", angle: 150,      orb: 3, sunMoonOrb: 4 },
  { name: "Opposition", angle: 180,    orb: 5, sunMoonOrb: 7 },
  { name: "Semi nonagon", angle: 20,   orb: 0.5, sunMoonOrb: 0.5 },
];

/**
 * Изчислява аспекти между два набора тела (планети/точки).
 * - Ако подадеш един и същ масив за A и B → вътрешни аспекти (без дубли: i<j).
 * - Ако подадеш два различни масива → кръстосани аспекти (всички двойки A×B).
 *
 * @param {Array<{planet:any, fullDegreee:number}>} bodiesA
 * @param {Array<{planet:any, fullDegreee:number}>} bodiesB - по желание; ако липсва → вътрешни аспекти в bodiesA
 * @param {Array<{name:string, angle:number, orb:number, sunMoonOrb:number}>} aspects - по подразбиране ASPECTS
 * @returns {Array<{pl1:string, aspect:string, pl2:string, orb:number}>}
 */
function computeAspects(bodiesA, bodiesB = null, aspects = ASPECTS) {
  if (!Array.isArray(bodiesA) || bodiesA.length === 0) return [];
  const sameSet = !bodiesB || bodiesB === bodiesA;

  const mod360 = (d) => ((d % 360) + 360) % 360;

 // Кандидат-ключове, които често срещаме за име
const NAME_KEYS = [
  "name","Name","label","Label","title","Title",
  "displayName","abbr","symbol","glyph",
  "en","bg","bg_name","bgName","name_bg","en_name","enName","name_en",
  "key","code","id","type","slug","short","long"
];

// Дълбоко търсене на текстово име по кандидат-ключове (до 3 нива)
function deepFindString(obj, keys = NAME_KEYS, maxDepth = 3) {
  const seen = new Set();
  const stack = [{ o: obj, d: 0 }];
  while (stack.length) {
    const { o, d } = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o) || d > maxDepth) continue;
    seen.add(o);

    // 1) директно текстово поле
    for (const k of keys) {
      if (k in o && typeof o[k] === "string" && o[k].trim()) return o[k].trim();
    }
    // 2) поле-обект като name/en, name/bg, label/text и пр.
    for (const k of keys) {
      const v = o[k];
      if (v && typeof v === "object") {
        for (const kk of ["en","bg","text","label","name","value"]) {
          if (typeof v[kk] === "string" && v[kk].trim()) return v[kk].trim();
        }
      }
    }
    // 3) обхождаме децата
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") stack.push({ o: v, d: d + 1 });
    }
  }
  return null;
}

// ЗАМЕНИ старата getName с тази
function getName(item) {
  if (!item) return "Unknown";
  // често името е просто string, или на самия item
  if (typeof item.planet === "string") return item.planet;
  if (typeof item.name === "string") return item.name;

  // търсим в planet {...}
  const fromPlanet = deepFindString(item.planet);
  if (fromPlanet) return fromPlanet;

  // последен опит – търсим и в целия item
  const fallback = deepFindString(item);
  return fallback || "Unknown";
}


  const getDeg = (o) => {
    if (!o) return NaN;
    // Try direct numeric fields first
    const directKeys = ["fullDegreee","fullDegree","degree","deg","angle","lon","longitude"];
    for (const k of directKeys) {
      if (k in o && Number.isFinite(Number(o[k]))) return mod360(Number(o[k]));
    }
    // Try common nested shapes
    const nests = [
      o.position?.fullDegreee, o.position?.fullDegree, o.position?.degree, o.position?.deg, o.position?.angle,
      o.ecliptic?.lon, o.ecliptic?.longitude,
      o.coords?.lon, o.coords?.longitude
    ];
    for (const v of nests) {
      if (Number.isFinite(Number(v))) return mod360(Number(v));
    }
    return NaN;
  };

  const isAxis = (name) => {
    if (!name) return false;
    const n = name.toLowerCase();
    // игнорирай основните оси, за да броим „между планетите“
    return (
      n.includes("asc") || n.includes("дсц") || n.includes("dsc") || n.includes("desc") ||
      n === "mc" || n.includes("midheaven") ||
      n === "ic" || n.includes("imum") || n.includes("coeli")
    );
  };

  const isLuminary = (name) => {
    if (!name) return false;
    const n = name.toLowerCase();
    // на бг и ен
    return n === "sun" || n === "moon" || n === "слънце" || n === "луна";
  };

  // Филтрираме само валидни тела и изключваме осите
  const A = bodiesA
    .map((o) => ({ raw: o, name: getName(o), deg: getDeg(o) }))
    .filter((x) => Number.isFinite(x.deg) && !isAxis(x.name));

  const B = sameSet
    ? A
    : bodiesB
        .map((o) => ({ raw: o, name: getName(o), deg: getDeg(o) }))
        .filter((x) => Number.isFinite(x.deg) && !isAxis(x.name));

  const results = [];

  const checkPair = (a, b) => {
    // ъглова дистанция 0..180
    let d = Math.abs(a.deg - b.deg) % 360;
    if (d > 180) d = 360 - d;

    for (const asp of aspects) {
      const target = asp.angle;
      const allowed = (isLuminary(a.name) || isLuminary(b.name)) ? asp.sunMoonOrb : asp.orb;
      const diff = Math.abs(d - target);
      if (diff <= allowed + 1e-9) {
        results.push({
          pl1: a.name,
          aspect: asp.name,
          pl2: b.name,
          orb: +diff.toFixed(4), // реалният орбис (разминаване от точния ъгъл)
        });
      }
    }
  };

  if (sameSet) {
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        checkPair(A[i], A[j]);
      }
    }
  } else {
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) {
        checkPair(A[i], B[j]);
      }
    }
  }

  return results;
}


/* BEGIN CHAT WIDGET — same as began; always visible via .chat-fab */
(function(){
  function wire(){
    const fab    = document.getElementById('chatFab');
    const popup  = document.getElementById('chatPopup');
    const closeB = document.getElementById('chatClose');
    const logEl  = document.getElementById('chatLog');
    const form   = document.getElementById('chatForm');
    const input  = document.getElementById('chatInput');
    if (!fab || !popup || !form || !input || !logEl) return;

    function addMsg(role, text){
      const roleKey = (role === 'Ти' || role === 'user') ? 'user' : (role === 'Бот' || role === 'bot') ? 'bot' : 'bot';
      const wrap = document.createElement('div');
      wrap.className = `msg ${roleKey}`;
      wrap.innerHTML = `<div class="role">${roleKey==='user'?'Ти':'Бот'}</div><div class="text"></div>`;
      wrap.querySelector('.text').textContent = String(text || '');
      logEl.appendChild(wrap);
      while (logEl.children.length > 50) logEl.removeChild(logEl.firstChild);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function showTyping(){
      if (document.getElementById('typingMsg')) return;
      const wrap = document.createElement('div');
      wrap.id = 'typingMsg';
      wrap.className = 'msg bot typing';
      wrap.innerHTML = `<div class="role">Бот</div><div class="text"><span class="dots"><i></i><i></i><i></i></span></div>`;
      logEl.appendChild(wrap);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function hideTyping(){
      const t = document.getElementById('typingMsg');
      if (t && t.parentNode) t.parentNode.removeChild(t);
    }
    function toggleChat(open){
      popup.classList[open ? 'add' : 'remove']('open');
      if (open) setTimeout(()=> input?.focus(), 0);
    }

    fab.addEventListener('click', ()=> toggleChat(true));
    closeB.addEventListener('click', ()=> toggleChat(false));

    async function callApi(endpoint, body){
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      if (!res.ok){
        const txt = await res.text().catch(()=> String(res.status));
        throw new Error(`[${endpoint}] HTTP ${res.status}: ${txt}`);
      }
      return res.json();
    }

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const msg = (input.value || '').trim();
      if (!msg){ input.focus(); return; }
      addMsg('user', msg);
      input.value = '';
      showTyping();
      try{
        let data;
        try {
          data = await callApi('chat', { message: msg });
        } catch (e) {
          data = await callApi('ask', { question: msg });
        }
        const reply = data?.reply || data?.answer || 'Няма отговор.';
        hideTyping();
        addMsg('bot', reply);
      } catch(err){
        hideTyping();
        addMsg('bot', 'Грешка: ' + (err?.message || err));
      }
    });
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
})();
/* END CHAT WIDGET */



/* CHAT TOGGLE WIDGET */
(function(){
  function ensureCallApi(){
    if (typeof window.callApi === 'function') return window.callApi;
    return async function(endpoint, body){
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      if (!res.ok){ throw new Error(`[${endpoint}] HTTP ${res.status}`); }
      return res.json();
    };
  }
  function wire(){
    const fab    = document.getElementById('chatFab');
    const popup  = document.getElementById('chatPopup');
    const closeB = document.getElementById('chatClose');
    const logEl  = document.getElementById('chatLog');
    const form   = document.getElementById('chatForm');
    const input  = document.getElementById('chatInput');
    if (!fab || !popup || !form || !input || !logEl) return;

    function addMsg(role, text){
      const roleKey = (role === 'user') ? 'user' : 'bot';
      const wrap = document.createElement('div');
      wrap.className = `msg ${roleKey}`;
      wrap.innerHTML = `<div class="role">${roleKey==='user'?'Ти':'Бот'}</div><div class="text"></div>`;
      wrap.querySelector('.text').textContent = String(text || '');
      logEl.appendChild(wrap);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function toggle(open){
      if (!popup) return;
      const willOpen = (typeof open === 'boolean') ? open : !popup.classList.contains('open');
      popup.classList[willOpen ? 'add' : 'remove']('open');
      if (willOpen) setTimeout(()=> input?.focus(), 0);
    }

    fab.addEventListener('click', ()=> toggle());
    closeB?.addEventListener('click', ()=> toggle(false));

    const callApi = ensureCallApi();
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const msg = (input.value || '').trim();
      if (!msg){ input.focus(); return; }
      addMsg('user', msg);
      input.value = '';
      try{
        let data;
        try { data = await callApi('chat', { message: msg }); }
        catch { data = await callApi('ask',  { question: msg }); }
        addMsg('bot', data?.reply || data?.answer || 'Няма отговор.');
      } catch(err){
        addMsg('bot', 'Грешка: ' + (err?.message || err));
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();


function showInsufficientCredits(){
  const { scrim, title } = $cc();
  if (!scrim) { alert('Нямате достатъчно кредити'); return; }
  scrim.classList.add('cc-insufficient');
  if (title) title.textContent = 'Недостатъчно кредити';
  const body = scrim.querySelector('.cc-body');
  if (body){
    body.innerHTML = '<p class="cc-line" style="justify-content:center; font-weight:800; font-size:16px;">Нямате достатъчно кредити</p>' +
                     '<div class="cc-actions" style="justify-content:center;"><button id="cc-close-only" class="cta primary" type="button">Разбрах</button></div>';
    const closeBtn = body.querySelector('#cc-close-only');
    closeBtn && closeBtn.addEventListener('click', ()=> scrim.hidden = true, { once:true });
  }
  scrim.hidden = false;
}