// natal-modal.js — profiles dropdown + form fill (CRUD + validation + GEO search UI + reset + change-detect)
import {
  getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js'; import {
  getFirestore, collection, query, where, getDocs, getDoc,
  limit, addDoc, doc, setDoc, deleteDoc, serverTimestamp,
  setLogLevel, runTransaction, increment, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';


import { ensureReportsShape, addReport, ensureSignedIn } from './firebase-init.js';
setLogLevel('silent'); // suppress Firestore debug logs

const auth = getAuth();
const db   = getFirestore();


async function __saveNatalReport(title, chartUrl, answerText){
  try {
    const user = await ensureSignedIn();
    if (!user) throw new Error('No authenticated user');
    await ensureReportsShape(user.uid);
    const firstLine = String(title || answerText || '').split('\n')[0].slice(0, 120).trim();
    const reportObj = {
      heading: firstLine || 'Натален анализ',
      chart: String(chartUrl || ''),
      report: String(answerText || ''),
      createdAt: new Date().toISOString()
    };
    await addReport(user.uid, 'natal', reportObj);
    console.log('[Firestore] Saved natal report for', user.uid, reportObj);
  } catch (err) {
    console.warn('Failed to save natal report:', err);
  }
}





// === natal page UI helpers (loading/result) ===

// === UI helper: clears screen, shows GENERATING overlay, then renders result ===
(function initNatalUI(){
  if (window.__natalUI) return;
  const $ = (id) => document.getElementById(id);
  const natalModal     = $('natalModal');
  const loadingOverlay = $('loadingOverlay');
  const resultStageEl  = $('resultStage');
  const resultTitleEl  = $('resultTitle');
  const resultImgEl    = $('resultNatalImg');
  const resultTextEl   = $('resultText');

  function hideAll(){
    try { natalModal && natalModal.classList.add('hidden'); } catch(_){}
    try { resultStageEl && resultStageEl.classList.add('hidden'); } catch(_){}
  }
  function showGenerating(){
    hideAll();
    if (loadingOverlay) { loadingOverlay.hidden = false; loadingOverlay.focus?.(); }
    if (resultTitleEl) resultTitleEl.textContent = '';
    if (resultTextEl)  resultTextEl.textContent  = '';
    if (resultImgEl){ resultImgEl.src = ''; resultImgEl.hidden = true; }
  }
  function showResult(title, answerText, chartUrl){
    if (loadingOverlay) loadingOverlay.hidden = true;
    if (resultTitleEl) resultTitleEl.textContent = String(title || '');
    if (resultTextEl)  resultTextEl.textContent  = String(answerText || '');
    if (resultImgEl){
      if (chartUrl){ resultImgEl.src = String(chartUrl); resultImgEl.hidden = false; }
      else { resultImgEl.hidden = true; }
    }
    if (resultStageEl) resultStageEl.classList.remove('hidden');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_){}
  }
  function reset(){
    if (loadingOverlay) loadingOverlay.hidden = true;
    if (resultStageEl) resultStageEl.classList.add('hidden');
    if (natalModal) natalModal.classList.remove('hidden');
  }
  window.__natalUI = { showGenerating, showResult, reset };
})();


  // Cache elements (if present in natal.html)
  const bgVideo        = document.getElementById('bg-video');
  const natalModal     = document.getElementById('natalModal');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const resultStageEl  = document.getElementById('resultStage');
  const resultTitleEl  = document.getElementById('resultTitle');
  const resultImgEl    = document.getElementById('resultNatalImg');
  const resultTextEl   = document.getElementById('resultText');

  function ensureVideoPlays(){
  try {
    if (bgVideo && typeof bgVideo.play === 'function') {
      const p = bgVideo.play();
      if (p && typeof p.catch === 'function') p.catch(()=>{});
    }
  } catch(_) {}
}

function _creditsDevBypass(){ try { return (document.body?.dataset?.creditsDev || '').toLowerCase()==='bypass'; } catch(_) { return false; } }

function _getCreditsConfig(){
  const cfg = {};
  try {
    const ds = (document.body && document.body.dataset) || {};
    // Prefer body data- attributes; fallback to globals
    cfg.docPath = ds.creditsDoc
      || (window.APP_CONFIG && window.APP_CONFIG.creditsDoc)
      || (window.CREDITS_CONFIG && window.CREDITS_CONFIG.docPath)
      || '';
    cfg.field = ds.creditsField
      || (window.APP_CONFIG && window.APP_CONFIG.creditsField)
      || (window.CREDITS_CONFIG && window.CREDITS_CONFIG.field)
      || '';
    cfg.chargeEndpoint = ds.chargeEndpoint
      || (window.APP_CONFIG && window.APP_CONFIG.chargeEndpoint)
      || (window.CREDITS_CONFIG && window.CREDITS_CONFIG.chargeEndpoint)
      || '';
    cfg.balanceEndpoint = ds.balanceEndpoint
      || (window.APP_CONFIG && window.APP_CONFIG.balanceEndpoint)
      || (window.CREDITS_CONFIG && window.CREDITS_CONFIG.balanceEndpoint)
      || '';
  } catch(_) {}
  return cfg;
}
// Read nested field like "wallet.balance" from an object
function _readNested(obj, path){
  if (!obj || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts){
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)){ cur = cur[p]; }
    else { return undefined; }
  }
  return cur;
}

// Try reading balance from a specific Firestore doc/field defined by config
async function _firestoreBalanceFromConfig(){
  try {
    const { docPath, field } = _getCreditsConfig();
    if (!auth || !auth.currentUser || !docPath) return NaN;
    const uid = auth.currentUser.uid;
    const path = docPath.replace('{uid}', uid);
    const segs = path.split('/').filter(Boolean);
    if (segs.length % 2 !== 0) return NaN; // must be a document path
    const ref = doc(db, ...segs);
    const snap = await getDoc(ref);
    if (snap && snap.exists()){
      const data = snap.data() || {};
      if (field){
        const v = _readNested(data, field);
        const n = _num(v);
        if (!Number.isNaN(n)) return n;
      }
      // fallback: attempt to extract commonly named fields
      const n = _extractBalance(data);
      if (!Number.isNaN(n)) return n;
    }
  } catch(e){ /* ignore and fallback */ }
  return NaN;
}

try {
  if (typeof onAuthStateChanged === 'function' && auth){
    onAuthStateChanged(auth, async (user) => {
      if (user){
        try {
          const n = await getUserCreditsDirect();
          if (Number.isFinite(n)) {
            window.USER_CREDITS = n;
            try { if (curCreditsEl) curCreditsEl.textContent = String(n); } catch(_) {}
          }
        } catch(_) {}
      }
    });
  }
} catch(_) { /* optional */ }

// === Credits config & refs (align with data-credits-doc / data-credits-field) ===


// Deduct credits atomically via Firestore transaction
async function deductCredits(uid, cost = CREDIT_COST){
  const ref = _creditsDocRef(uid);
  const { field } = _getCreditsConfig();
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};
    const curVal = (field && field.includes('.'))
      ? field.split('.').reduce((o,k)=> (o && o[k] != null) ? o[k] : undefined, data)
      : data?.[field ?? 'credits'];
    const cur = Number(curVal ?? 0);
    if (!Number.isFinite(cur) || cur < cost){
      throw new Error('INSUFFICIENT_CREDITS');
    }
    if (field && field !== 'credits'){
      tx.update(ref, { [field]: increment(-cost) });
    } else {
      tx.update(ref, { credits: increment(-cost) });
    }
    return cur - cost;
  });
}
function _creditsDocRef(uid){
  const { docPath } = _getCreditsConfig();
  const path = String(docPath).replace('{uid}', uid).trim();
  const segs = path.split('/').filter(Boolean);
  // expect an even number of segments for a document
  return doc(db, ...segs);
}

// DOM refs
const profilesSelect = document.getElementById('profilesSelect');
const nmEl   = document.getElementById('nm');
const dtEl   = document.getElementById('dt');
const tmEl   = document.getElementById('tm');
const cityEl = document.getElementById('city');
const dstEl  = document.getElementById('dst');
const btnSave   = document.getElementById('saveChoose');
const btnDelete = document.getElementById('deleteProfile');
const btnClear  = document.getElementById('clearForm');
// GEO search UI
const citySearchBtn = document.getElementById('citySearch');
const cityDropdown  = document.getElementById('cityDropdown');
// или 'error' ако искаш да виждаш само грешки

// Helper: POST to our server API (proxied in server.js)
async function callApi(endpoint, body){
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok){
    const txt = await res.text().catch(()=>String(res.status));
    throw new Error(`[${endpoint}] HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

let profiles = [];       // от /users/{uid}/profiles и/или top-level /profiles
let firstUser = null;    // ПЪРВИЯТ елемент от /users/{uid}/user
let currentSelection = { id: null, source: null }; // {id, source: 'profiles'|'users-profiles'|'user-first'|null}
let selectedCity = null; // {complete_name, latitude, longitude, timezone}
let lastFormSnapshot = null; // за детекция на промени

const z2 = (n)=> String(n).padStart(2,'0');

function nameFromData(d = {}) {
  return d.name || d.fullName || [d.firstName, d.lastName].filter(Boolean).join(' ') || '(без име)';
}

function keyFromRecord(rec){
  try {
    const name = (rec.name || '').trim().toLowerCase();
    const bd = (rec.birthDate || '').trim();
    const bt = (rec.birthTime || '').trim();
    const city = (rec.birthCity || '').trim().toLowerCase();
    const lat = rec.body?.latitude ?? rec.cityGeo?.latitude ?? '';
    const lon = rec.body?.longitude ?? rec.cityGeo?.longitude ?? '';
    return [name, bd, bt, city, lat, lon].join('|');
  } catch(e){
    return String(Math.random()).slice(2);
  }
}

function normalizeRecord(d = {}){
  const out = { ...d };
  out.__label = nameFromData(d);

  let birthDate = d.birthDate || d.date || null;
  let birthTime = d.birthTime || d.time || null;
  let birthDST  = (typeof d.birthDST === 'boolean') ? d.birthDST : null;
  let birthCity = d.birthCity || d.city || d.place || null;
  let cityGeo   = d.cityGeo || null;

  const body = d.body || d.astroPayload || null;
  if (!birthDate && body && body.year!=null && body.month!=null && body.date!=null){
    birthDate = `${body.year}-${z2(body.month)}-${z2(body.date)}`;
  }
  if (!birthTime && body && (body.hours!=null || body.minutes!=null)){
    birthTime = `${z2(body.hours||0)}:${z2(body.minutes||0)}`;
  }
  if (!birthCity && cityGeo && (cityGeo.complete_name || cityGeo.name)){
    birthCity = cityGeo.complete_name || cityGeo.name;
  }
  if (birthDST == null && (body?.timezone!=null) && (cityGeo?.timezone_offset!=null)){
    const diff = Number(body.timezone) - Number(cityGeo.timezone_offset);
    birthDST = (diff === 1);
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

function renderSelect() {
  if (!profilesSelect) return;
  profilesSelect.innerHTML = '';

  // placeholder
  const def = document.createElement('option');
  def.value = '';
  def.textContent = (firstUser || profiles.length) ? '— изберете профил —' : 'няма налични профили';
  def.disabled = true; def.selected = true;
  profilesSelect.appendChild(def);

  // 1) Първо място: първият документ от колекцията "user"
  if (firstUser) {
    const opt0 = document.createElement('option');
    opt0.value = firstUser.id;         // формат: user:<docId>
    opt0.textContent = `★ ${nameFromData(firstUser)}`;
    opt0.dataset.source = 'user-first';
    profilesSelect.appendChild(opt0);
  }

  // 2) След това — всички профили (нормализирани)
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.__label || nameFromData(p);
    opt.dataset.source = p.source || 'profiles';
    profilesSelect.appendChild(opt);
  }

  // reset selection
  currentSelection = { id: null, source: null };
  profilesSelect.selectedIndex = 0; // placeholder
  snapshotForm();
  syncButtons();
}

function fillForm(recRaw = {}) {
  const d = normalizeRecord(recRaw);
  if (nmEl)   nmEl.value   = d.__label || '';
  if (dtEl)   dtEl.value   = d.birthDate || '';
  if (tmEl)   tmEl.value   = d.birthTime || '';
  if (cityEl) cityEl.value = d.birthCity || '';
  if (dstEl)  dstEl.checked= !!d.birthDST;
  // Ако записът си носи cityGeo – приемаме го за избран град (за целите на geo/tz при запис)
  selectedCity = d.cityGeo ? mapCityGeo(d.cityGeo) : selectedCity;
  snapshotForm();
  syncButtons();
}

function parseTimezone(v){
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s0 = String(v).trim();
  const s  = s0.replace(/^(?:UTC|GMT)\s*/i, '');
  // formats: "+02:00", "+0200", "-5", "5.5"
  const m1 = s.match(/^([+\-])?(\d{1,2})(?::?(\d{2}))?$/);
  if (m1){
    const sign = m1[1] === '-' ? -1 : 1;
    const hh = parseInt(m1[2],10);
    const mm = m1[3] ? parseInt(m1[3],10) : 0;
    return sign * (hh + mm/60);
  }
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

function mapCityGeo(cg){if (!cg) return null;
  // Prefer numeric timezone_offset (or similar) for timezone; keep IANA in zoneId
  const tzRaw = (cg.timezone_offset ?? cg.gmtOffset ?? cg.utcOffset ?? cg.tz_offset ?? cg.timezone ?? cg.tz);
  const tzNum = parseTimezone(tzRaw);
  const lat = Number(cg.latitude ?? cg.lat ?? cg.lat_deg);
  const lon = Number(cg.longitude ?? cg.lon ?? cg.lng ?? cg.lon_deg);
  const name = cg.complete_name || cg.name || cg.city || cg.display_name || '';
  const zoneId = (
    cg.zoneId ?? cg.timeZoneId ?? cg.timezoneId ?? cg.time_zone_id ?? cg.timezone_name ?? cg.timeZone
  ) || null;
  return { complete_name: name, latitude: lat, longitude: lon, timezone: tzNum, zoneId };
}
function optionFromGeo(geo){
  const o = document.createElement('option');
  o.textContent = geo.complete_name || geo.name || geo.city || `${geo.latitude}, ${geo.longitude}`;
  o.value = JSON.stringify({
    complete_name: geo.complete_name || geo.name || geo.city || '',
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: geo.timezone,
    zoneId: geo.zoneId ?? null
  });
  // data-* за по-лесно четене
  o.dataset.fullname = geo.complete_name || geo.name || geo.city || '';
  o.dataset.lat = geo.latitude;
  o.dataset.lon = geo.longitude;
  o.dataset.tz  = geo.timezone;
  if (geo.zoneId) o.dataset.zoneid = geo.zoneId;
  return o;
}


function getCurrentCityGeo(){
  if (selectedCity) return selectedCity;

  if (currentSelection.source === 'profiles'){
    const rec = profiles.find(x => x.id === currentSelection.id);
    if (rec?.cityGeo) return mapCityGeo(rec.cityGeo);
    // Fallback: derive from saved body if cityGeo missing
    if (rec?.body && (rec.body.latitude!=null) && (rec.body.longitude!=null)) {
      return mapCityGeo({
        complete_name: rec.birthCity || rec.city || rec.place || rec.name || '',
        latitude: rec.body.latitude,
        longitude: rec.body.longitude,
        timezone: rec.body.timezone ?? rec.body.tz ?? rec.body.time_zone ?? null
      , zoneId: rec.body.zoneId ?? rec.body.timeZoneId ?? rec.body.zone ?? null });
    }
  }

  if (currentSelection.source === 'user-first'){
    if (firstUser?.cityGeo) return mapCityGeo(firstUser.cityGeo);
    // Fallback: derive from saved body in user-first
    if (firstUser?.body && (firstUser.body.latitude!=null) && (firstUser.body.longitude!=null)) {
      return mapCityGeo({
        complete_name: firstUser.birthCity || firstUser.city || firstUser.place || firstUser.name || '',
        latitude: firstUser.body.latitude,
        longitude: firstUser.body.longitude,
        timezone: firstUser.body.timezone ?? firstUser.body.tz ?? firstUser.body.time_zone ?? null
      , zoneId: firstUser.body.zoneId ?? firstUser.body.timeZoneId ?? firstUser.body.zone ?? null });
    }
  }
  return null;
}

function getFormState(){
  const name = (nmEl?.value || '').trim();
  const date = (dtEl?.value || '').trim();
  const time = (tmEl?.value || '').trim();
  const city = (cityEl?.value || '').trim();
  const dst  = !!(dstEl?.checked);
  const hasGeo = !!getCurrentCityGeo();
  const allFilled = !!(name && date && time && city && hasGeo);
  return { name, date, time, city, dst, hasGeo, allFilled };
}

function snapshotForm(){
  const { name, date, time, city, dst } = getFormState();
  const geo = getCurrentCityGeo();
  lastFormSnapshot = JSON.stringify({ name, date, time, city, dst, geo });
}

function isChanged(){
  const { name, date, time, city, dst } = getFormState();
  const geo = getCurrentCityGeo();
  const now = JSON.stringify({ name, date, time, city, dst, geo });
  return now !== lastFormSnapshot;
}

function syncButtons(){
  const { allFilled } = getFormState();
  if (btnSave)   btnSave.disabled   = !allFilled;
  if (btnClear)  btnClear.disabled  = !allFilled; // активен при попълнени полета и валиден град
  const canDelete = currentSelection.source === 'users-profiles' && !!currentSelection.id; // първият ★ не може да се трие
  if (btnDelete) btnDelete.disabled = !canDelete;
}

function buildBodyFromForm(){
  const { name, date, time, dst } = getFormState();
  const [Y,M,D] = (date||'').split('-').map(Number);
  const [h,mn]  = (time||'').split(':').map(Number);

  const geo = getCurrentCityGeo(); // идва от избрания град или от зареден запис
  if (!geo){
    console.warn('[geo] Няма избран град с координати/часова зона.');
  }

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
      language: 'en'
    }
  };

  return {
    body,
    name,
    birthDate: `${z2(body.year)}-${z2(body.month)}-${z2(body.date)}`,
    birthTime: `${z2(body.hours)}:${z2(body.minutes)}`,
    birthDST:  !!dst,
    birthCity: cityEl?.value || '',
    cityGeo: geo ? { complete_name: geo.complete_name, latitude: geo.latitude, longitude: geo.longitude, timezone: geo.timezone, zoneId: geo?.zoneId ?? null } : null,
  };
}

// Helper: choose profile and print final payload to console + emit event
function chooseAndPrint(id, payload){
  try {
    console.group('[profiles] ЗАПАЗЕНО & ИЗБРАНО');
    const uid = (auth?.currentUser?.uid) || ':uid';
    console.log('id:', id);
    console.log('path:', `users/${uid}/profiles/${id}`);
    console.log('payload:', payload);
    console.groupEnd();
  } catch(e){ /* no-op */ }
  try {
    window.dispatchEvent(new CustomEvent('profile:chosen', { detail: { id, payload } }));
  } catch(e){ /* no-op */ }
}


async function loadUserFirst(uid) {
  try {
    const q = query(collection(db, 'users', uid, 'user'), limit(1));
    const snap = await getDocs(q);
    let d0 = null; snap.forEach(d => { if (!d0) d0 = d; });
    if (d0) {
      firstUser = { id: `user:${d0.id}`, source: 'user-first', ...d0.data() };
      console.info(`[profiles] user-first users/${uid}/user/${d0.id}`);
    } else {
      firstUser = null;
    }
  } catch (e) {
    firstUser = null;
    console.warn(`[profiles] users/{uid}/user блокирано/грешка:`, e);
  }
}

async function loadProfiles(uid) {
  const results = new Map();
  try {
    // ЧЕТЕМ САМО подколекцията /users/{uid}/profiles
    const subSnap = await getDocs(collection(db, 'users', uid, 'profiles'));
    subSnap.forEach(docu => results.set(docu.id, normalizeRecord({ id: docu.id, source: 'users-profiles', ...docu.data() })) );
    console.info(`[profiles] users/${uid}/profiles: +${subSnap.size}`);
  } catch (e) {
    console.warn(`[profiles] users/${uid}/profiles блокирано/грешка:`, e);
  }
  profiles = Array.from(results.values());
  console.log(`[profiles] заредени общо (/users/${uid}/profiles): ${profiles.length}`);
}


function parseGeoResponse(json){
  const raw = json?.data || json?.results || json?.locations || json || [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(r => mapCityGeo({
    complete_name: r.complete_name || r.name || r.city || r.display_name,
    latitude: r.latitude ?? r.lat ?? r.lat_deg,
    longitude: r.longitude ?? r.lon ?? r.lng ?? r.lon_deg,
    timezone_offset: r.timezone_offset ?? r.gmtOffset ?? r.utcOffset ?? r.tz_offset ?? r.timezone ?? r.tz,
    zoneId: r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone
  })).filter(g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
}

function populateCityDropdown(geos){
  if (!cityDropdown) return;
  cityDropdown.classList.remove('hidden');
  cityDropdown.innerHTML = '';
  const ph = document.createElement('option');
  ph.textContent = 'избери град';
  ph.disabled = true; ph.selected = true;
  cityDropdown.appendChild(ph);
  geos.forEach(g => cityDropdown.appendChild(optionFromGeo(g)));
  // Фокус за да се „отвори“ системното падащо меню при клик
  cityDropdown.focus();
}

function getSelectedOption(){
  const sel = cityDropdown?.selectedOptions?.[0] || null;
  return sel && sel.value ? sel : null;
}

async function commitCitySelection(){
const opt = getSelectedOption();
  if (!opt) return;
  try {
    const j = JSON.parse(opt.value);
    selectedCity = mapCityGeo(j);
  } catch {
    selectedCity = {
      complete_name: opt.dataset.fullname || opt.textContent.trim(),
      latitude: parseFloat(opt.dataset.lat),
      longitude: parseFloat(opt.dataset.lon),
      timezone: parseTimezone(opt.dataset.tz),
      zoneId: opt.dataset.zoneid || null
    };
  }

  // Enrich timezone if missing
  if (!Number.isFinite(selectedCity?.timezone) || selectedCity.zoneId == null){
    try {
      const enrich = await callApi('geo-details', { latitude: selectedCity.latitude, longitude: selectedCity.longitude });
      const arr = Array.isArray(enrich?.data) ? enrich.data : (Array.isArray(enrich) ? enrich : []);
      if (arr.length){
        const r = arr[0];
        const candTz = r.timezone_offset ?? r.gmtOffset ?? r.utcOffset ?? r.tz_offset ?? r.timezone ?? r.tz ?? null;
      const candZone = r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone ?? null; r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone ?? null;
        const tzNum = parseTimezone(candTz);
        if (Number.isFinite(tzNum)) selectedCity.timezone = tzNum;
        if (!selectedCity.zoneId && typeof candZone === 'string') selectedCity.zoneId = candZone;
      }
    } catch(e){
      console.warn('[geo] enrich timezone failed:', e);
    }
  }

  if (cityEl && selectedCity?.complete_name) cityEl.value = selectedCity.complete_name;
  syncButtons();
}


function resetCityDropdown(){
  if (!cityDropdown) return;
  cityDropdown.innerHTML = '<option disabled selected>избери град</option>';
  cityDropdown.classList.add('hidden');
  selectedCity = null;
}

citySearchBtn?.addEventListener('click', async () => {
  const q = (cityEl?.value || '').trim();
  if (!q) return alert('Въведете град за търсене.');
  citySearchBtn.disabled = true; citySearchBtn.textContent = 'ТЪРСЯ…';
  try {
    const json = await callApi('geo-details', { city: q });
    const geos = parseGeoResponse(json);
    if (!geos.length){
      alert('Не бяха намерени резултати. Опитайте с друг правопис.');
      return;
    }
    populateCityDropdown(geos);
  } catch (e) {
    console.error('[geo] грешка при търсене:', e);
    alert('Грешка при търсене на град. Виж конзолата.');
  } finally {
    citySearchBtn.disabled = false; citySearchBtn.textContent = 'ТЪРСИ';
  }
});

// Двоен клик върху ред = избор
cityDropdown?.addEventListener('dblclick', () => { commitCitySelection(); snapshotForm(); });
// Enter върху select = избор
cityDropdown?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitCitySelection(); snapshotForm(); }
});
// Единичен клик/тап (или промяна) върху select = избор
cityDropdown?.addEventListener('change', () => { commitCitySelection(); snapshotForm(); });


// Selection -> fill form (профили)
profilesSelect?.addEventListener('change', (e) => {
  const id = String(e.target.value || '');
  if (!id) { currentSelection = { id:null, source:null }; snapshotForm(); syncButtons(); return; }

  if (id.startsWith('user:')) {
    currentSelection = { id, source: 'user-first' };
    fillForm(firstUser || {});
  } else {
    const rec = profiles.find(x => x.id === id) || null;
    currentSelection = { id, source: (rec && rec.source) ? rec.source : 'users-profiles' };
    if (rec) fillForm(rec);
  }
});

// Live validation на формата
[nmEl, dtEl, tmEl, cityEl, dstEl].forEach(el => el && el.addEventListener('input', () => { syncButtons(); }));


// SAVE & CHOOSE (с потвърждение за 10 Astro кредита)
const CREDIT_COST = 10;

// Read balance like synastry: users/{uid}.credits
async function getUserCreditsDirect(){
  try{
    if (!auth || !auth.currentUser) return 0;
    const uid = auth.currentUser.uid;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const d = snap && snap.exists() ? snap.data() : {};
    const c = Number(d && d.credits != null ? d.credits : 0);
    return Number.isFinite(c) ? c : 0;
  }catch(_){ return 0; }
}


function _num(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }

// Try several common Firestore locations for a user's credit balance
async function _firestoreBalance(){
  try {
    if (!auth || !auth.currentUser) return NaN;
    const uid = auth.currentUser.uid;
    const tryDocs = [
      ['users', uid],
      ['wallets', uid],
      ['users', uid, 'private', 'wallet'],
      ['users', uid, 'meta', 'wallet'],
      ['users', uid, 'credits', 'current']
    ];
    for (const path of tryDocs){
      try {
        const ref = doc(db, ...path);
        if (!ref) continue;
        const snap = await getDoc(ref);
        if (snap && snap.exists()){
          const data = snap.data() || {};
          const n = _extractBalance(data);
          if (!Number.isNaN(n)) return n;
          // Also try common flat fields
          const flat = _num(data.credits ?? data.balance ?? data.credit ?? data.wallet);
          if (!Number.isNaN(flat)) return flat;
        }
      } catch(e){ /* keep trying */ }
    }
  } catch(e){ /* noop */ }
  return NaN;
}
function _extractBalance(res){
  if (res == null) return NaN;
  if (typeof res === 'number' || typeof res === 'string') return _num(res);
  if (typeof res === 'object'){
    const cands = [
      res.balance, res.credits, res.wallet?.balance, res.wallet?.credits,
      res.data?.balance, res.data?.credits, res.user?.balance, res.user?.credits,
      res.result?.balance, res.meta?.balance
    ];
    for (const c of cands){ const n=_num(c); if (!Number.isNaN(n)) return n; }
  }
  return NaN;
}



// === Credits confirm (synastry-like) ===
// Elements of the new pretty modal
const ccScrim = document.getElementById('creditConfirm');
const ccTitle = document.getElementById('cc-title');
const ccCost  = document.getElementById('cc-cost');
const ccCost2 = document.getElementById('cc-cost2');
const ccBal   = document.getElementById('cc-balance');
const ccBtnOk = document.getElementById('cc-confirm');
const ccBtnNo = document.getElementById('cc-cancel');


function openCreditConfirm(balance, cost=CREDIT_COST){
  return new Promise((resolve) => {
    if (!ccScrim) { return resolve(true); } // fallback: auto-confirm if modal missing
    // normal state
    ccScrim.classList.remove('cc-insufficient');
    if (ccTitle) ccTitle.textContent = 'Потвърдете покупката';
    if (ccCost)  ccCost.textContent = String(cost);
    if (ccCost2) ccCost2.textContent = String(cost);
    if (ccBal)   ccBal.textContent = String(balance);

    ccScrim.hidden = false;

    function cleanup(){
      try{
        ccBtnOk && ccBtnOk.removeEventListener('click', onOk, {capture:false});
        ccBtnNo && ccBtnNo.removeEventListener('click', onNo, {capture:false});
        document.removeEventListener('keydown', onKeydown, {capture:false});
      }catch(_){}
    }
    function close(){
      ccScrim.hidden = true;
      cleanup();
    }
    function onOk(){
      close();
      try { window.__natalUI?.showGenerating(); } catch(_){}
      resolve(true);
    }
    function onNo(){
      close();
      resolve(false);
    }
    function onKeydown(e){
      if (e.key === 'Escape'){ onNo(); }
      if (e.key === 'Enter'){ onOk(); }
    }

    ccBtnOk && ccBtnOk.addEventListener('click', onOk, { once:true });
    ccBtnNo && ccBtnNo.addEventListener('click', onNo, { once:true });
    document.addEventListener('keydown', onKeydown, { once:true });
  });
}


function showInsufficientCredits(){
  if (!ccScrim) { alert('Нямате достатъчно кредити'); return; }
  ccScrim.classList.add('cc-insufficient');
  if (ccTitle) ccTitle.textContent = 'Недостатъчно кредити';
  const body = ccScrim.querySelector('.cc-body');
  if (body){
    body.innerHTML = '<p class="cc-line" style="justify-content:center; font-weight:800; font-size:16px;">Нямате достатъчно кредити</p><div class="cc-actions" style="justify-content:center;"><button id="cc-close-only" class="cta primary" type="button">Разбрах</button></div>';
    const closeBtn = body.querySelector('#cc-close-only');
    closeBtn && closeBtn.addEventListener('click', ()=> ccScrim.hidden = true, { once:true });
  }
  ccScrim.hidden = false;
}

// === Credit confirmation flow (uses getCreditsBalance/chargeCredits) ===
function confirmCreditFlow(next){
  return new Promise(async (resolve) => {
    try{
      console.log('[credits] flow:start');
      const balance = await getCreditsBalance();
      console.log('[credits] balance:', balance, 'cost:', CREDIT_COST);
      if (balance < CREDIT_COST){ console.warn('[credits] insufficient'); showInsufficientCredits(); return resolve(false); }
      const ok = await openCreditConfirm(balance, CREDIT_COST);
      console.log('[credits] user confirmed?', ok);
      if (!ok) return resolve(false);

      if (_creditsDevBypass()){
        console.warn('[credits][DEV] bypass enabled -> skipping chargeCredits');
        if (typeof next === 'function'){ await next(); console.log('[credits][DEV] next() done'); }
        return resolve(true);
      }

      // Deduct via API/Firestore (already implemented in chargeCredits)
      try{
        console.log('[credits] charging...');
        const res = await chargeCredits(CREDIT_COST, { reason: 'natal_save_choose', page: 'natal.html' });
        console.log('[credits] charge result:', res);
        if (!res || res.ok !== true){
          alert('Неуспешно плащане. Опитайте отново.');
          return resolve(false);
        }
      }catch(e){
        const msg = String(e?.code || e?.message || e);
        console.error('[credits] charge error:', msg);
        if (msg.includes('INSUFFICIENT')){ showInsufficientCredits(); return resolve(false); }
        if (msg.includes('AUTH_REQUIRED')){ alert('Моля, влезте в профила си, за да използвате кредити.'); return resolve(false); }
        alert('Възникна грешка при таксуване.');
        return resolve(false);
      }

      if (typeof next === 'function'){ console.log('[credits] calling next()...'); await next(); console.log('[credits] next() done'); }
      resolve(true);
    }catch(err){
      console.error('[credits] confirm flow (natal) failed:', err);
      resolve(false);
    }
  });
}


// === Save & choose profile after successful charge ===

async function performSaveChoose(){ console.log('[profiles] performSaveChoose:start');
  try {
    if (!auth.currentUser){
      alert('Моля, влезте в профила си.');
      return;
    }
    const uid = auth.currentUser.uid;
    const payload = buildBodyFromForm();

    let id = currentSelection?.id || null;
    const isExisting = currentSelection?.source === 'users-profiles' && !!id;
    const isFirst   = currentSelection?.source === 'user-first'; // Първият профил от падащото меню

    if (isExisting){
      try {
        await setDoc(doc(db, 'users', uid, 'profiles', id), {
          ...payload,
          __label: payload?.name || payload?.__label || '',
          updatedAt: serverTimestamp(),
          ownerId: uid
        }, { merge: true });
      } catch(e){
        console.warn('[profiles] setDoc failed for existing, but will continue to choose:', e);
      }
      chooseAndPrint(id, payload);
      console.log('[profiles] performSaveChoose:done (updated existing)');
      return;
    }

    // 🚫 НЕ ЗАПИСВАЙ ако е първият профил (user-first)
    if (isFirst){
      console.log('[profiles] skip save for first (user-first) profile; only choosing');
      chooseAndPrint(id, payload);
      console.log('[profiles] performSaveChoose:done (user-first, no save)');
      return;
    }

    // НОВ профил → записвай в users/{uid}/profiles (fallback към /profiles)
    const baseData = {
      ...payload,
      __label: payload?.name || payload?.__label || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ownerId: uid
    };
    try {
      const ref = await addDoc(collection(db, 'users', uid, 'profiles'), baseData);
      id = ref.id;
    } catch(e){
      console.warn('[profiles] addDoc to users/{uid}/profiles failed, fallback to /profiles:', e);
      const ref = await addDoc(collection(db, 'profiles'), baseData);
      id = ref.id;
    }
    currentSelection = { id, source: 'users-profiles' };
    await loadProfiles(uid);
    renderSelect();
    chooseAndPrint(id, payload);
    console.log('[profiles] performSaveChoose:done');
  } catch(e){
    console.error('[profiles] performSaveChoose:error', e);
  }
}

async function getCreditsBalance(){

// Prefer synastry-style direct Firestore doc users/{uid}.credits
try {
  if (auth && auth.currentUser) {
    const n = await getUserCreditsDirect();
    if (Number.isFinite(n)) return n;
  }
} catch(_) {}

  try {
    if (window.Credits && typeof window.Credits.getBalance === 'function'){
      const b = await window.Credits.getBalance();
      const n = _num(b);
      if (!Number.isNaN(n)) return n;
    }
  } catch(_) {}

  // Try configured Firestore doc first
  const conf = await _firestoreBalanceFromConfig();
  if (!Number.isNaN(conf)) return conf;

  const routes = ['credits-balance','credits/balance','wallet-balance','wallet/balance','user-credits'];
  for (const route of routes){
    try {
      const r = await callApi(route, {});
      const n = _extractBalance(r);
      if (!Number.isNaN(n)) return n;
    } catch(e){ /* continue trying */ }
  }

  const fb = await _firestoreBalance();
  if (!Number.isNaN(fb)) return fb;

  if (typeof window.USER_CREDITS !== 'undefined'){
    const n = _num(window.USER_CREDITS);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}



async function chargeCredits(amount, meta){
  console.log('[credits] chargeCredits start', { amount, meta });
  try {
    if (!auth || !auth.currentUser) throw new Error('AUTH_REQUIRED');
    const uid = auth.currentUser.uid;
    await deductCredits(uid, amount);
    console.log('[credits] chargeCredits ok');
    return { ok: true };
  } catch(e){
    console.error('[credits] chargeCredits failed:', e);
    if (String(e && (e.code || e.message)).includes('INSUFFICIENT')){
      throw e;
    }
    throw new Error('CHARGE_FAILED');
  }
}


// Клик по бутона → първо потвърждение и таксуване, след това изпълняване
btnSave?.addEventListener('click', async (ev) => {
  ev.preventDefault();
  const { allFilled } = getFormState();
  if (!allFilled) return;
  await confirmCreditFlow(performSaveChoose);
});

// DELETE
// DELETE
btnDelete?.addEventListener('click', async () => {
  if (!auth.currentUser) return alert('Моля, влезте в профила си.');
  if (!currentSelection.id) return;
  if (!confirm('Сигурни ли сте, че искате да изтриете този профил?')) return;
  const uid = auth.currentUser.uid;
  try {
    try { await deleteDoc(doc(db, 'users', uid, 'profiles', currentSelection.id)); } catch(e){}
    try { await deleteDoc(doc(db, 'profiles', currentSelection.id)); } catch(e){}

    currentSelection = { id: null, source: null };
    clearForm(true);
    await loadProfiles(uid);
    renderSelect();
  } catch (e) {
    console.error('[profiles] Изтриването се провали:', e);
    alert('Изтриването беше отказано от правилата или възникна грешка.');
  }
});

function clearForm(skipSnap = false){
  if (nmEl)   nmEl.value = '';
  if (dtEl)   dtEl.value = '';
  if (tmEl)   tmEl.value = '';
  if (cityEl) cityEl.value = '';
  if (dstEl)  dstEl.checked = false;
  resetCityDropdown();
  currentSelection = { id: null, source: null };
  if (!skipSnap) snapshotForm();
  syncButtons();
}

// CLEAR
btnClear?.addEventListener('click', () => {
  clearForm();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    profiles = []; firstUser = null; renderSelect();
    return;
  }
  (async () => {
    const uid = user.uid;
    await loadUserFirst(uid);   // 1) вземи първия от /users/{uid}/user
    await loadProfiles(uid);    // 2) вземи профилите
    renderSelect();             // 3) визуализирай — user-first излиза ПЪРВИ
  
})();
});

// === profile:chosen → API calls, planets object, aspects (in natal-modal.js) ===

  // Fallbacks for BG dictionaries if not present on window
  const PLANETS_BG = (typeof window !== 'undefined' && window.planets_BG) || {
    "Sun":"Слънце","Moon":"Луна","Mercury":"Меркурий","Venus":"Венера","Mars":"Марс",
    "Jupiter":"Юпитер","Saturn":"Сатурн","Uranus":"Уран","Neptune":"Нептун","Pluto":"Плутон"
  };

  const SIGNS_BG = (typeof window !== 'undefined' && window.signs_BG) || {
    "Aries":"Овен","Taurus":"Телец","Gemini":"Близнаци","Cancer":"Рак","Leo":"Лъв","Virgo":"Дева",
    "Libra":"Везни","Scorpio":"Скорпион","Sagittarius":"Стрелец","Capricorn":"Козирог","Aquarius":"Водолей","Pisces":"Риби"
  };

  // Helpers
  function _sanitizeDeg(v){
    if (typeof v === 'number') return v;
    try { return parseFloat(String(v).replace(",", ".").replace(/[^\d.+-]/g, "")) || null; }
    catch { return null; }
  }

  function houseOf(planetDeg, housesArr) {
    if (!Array.isArray(housesArr) || housesArr.length !== 12) return null;
    for (let i = 0; i < 12; i++) {
      let start = housesArr[i].deg;
      let end   = housesArr[(i + 1) % 12].deg;
      if (end < start) end += 360;
      let p = planetDeg;
      if (p < start) p += 360;
      if (p >= start && p < end) return housesArr[i].house;
    }
    return null;
  }

  // ---- Aspect logic (major only for brevity) ----
  const MAJOR = ["Conjunction","Sextile","Square","Trine","Opposition"];
  const ASPECTS = [
    { name:"Conjunction", angle:0,   orb:5, sunMoonOrb:8 },
    { name:"Sextile",     angle:60,  orb:5, sunMoonOrb:8 },
    { name:"Square",      angle:90,  orb:5, sunMoonOrb:8 },
    { name:"Trine",       angle:120, orb:5, sunMoonOrb:8 },
    { name:"Opposition",  angle:180, orb:5, sunMoonOrb:8 },
  ];
  const isSunOrMoon = (n) => n === 'Sun' || n === 'Moon';
  const wrap360 = (n) => (n % 360 + 360) % 360;
  const angularDist = (a,b) => { let d = Math.abs(wrap360(a) - wrap360(b)); return d > 180 ? 360 - d : d; };
  const orbFor = (asp, p1, p2) => (isSunOrMoon(p1.name) || isSunOrMoon(p2.name)) ? (asp.sunMoonOrb ?? asp.orb) : asp.orb;

  function matchAspect(p1, p2) {
    const diff = angularDist(p1.deg, p2.deg);
    for (const asp of ASPECTS) {
      const delta = Math.abs(diff - asp.angle);
      const orb   = orbFor(asp, p1, p2);
      if (delta <= orb) return { aspect: asp, delta };
    }
    return null;
  }

  function aspectsBetween(arr) {
    const hits = [];
    for (let i=0;i<arr.length;i++) {
      for (let j=i+1;j<arr.length;j++) {
        const res = matchAspect(arr[i], arr[j]);
        if (res) hits.push({ p1: arr[i].name, p2: arr[j].name, aspect: res.aspect.name });
      }
    }
    return hits;
  }

  function normalizePlanets(planetsRes) {
    const raw = Array.isArray(planetsRes?.output) ? planetsRes.output
              : (planetsRes?.output?.Planets || planetsRes?.Planets || []);
    return raw
      .filter(p => p && p.planet && (p.fullDegree != null || p.degree != null))
      .map(p => ({ name: p.planet?.en, deg: _sanitizeDeg(p.fullDegree ?? p.degree), sign: (p?.zodiac_sign?.name?.en ?? p?.zodiac_sign?.en ?? p?.sign ?? '') }))
      .filter(p => p.name && (p.deg != null));
  }

  function getMajorAspects(planetsRes) {
    const arr = normalizePlanets(planetsRes);
    const hits = aspectsBetween(arr);
    return hits
      .filter(h => MAJOR.includes(h.aspect))
      .reduce((acc,h) => (acc[`${h.p1}-${h.p2}`] = h.aspect, acc), {});
  }

  // Main handler
  window.addEventListener('profile:chosen', async (ev) => {
    const payload = ev?.detail?.payload?.body || ev?.detail?.payload || null;
    console.group('[profiles] Избрания профил → заявки към FreeAstrologyAPI (в natal-modal.js)');
    try {
      if (!payload) throw new Error('Липсва body/payload в събитието.');
      console.log('📦 Payload към API:', payload);
      if (window.__natalUI) window.__natalUI.showGenerating();

      const [planetsRes, housesRes, wheelRes] = await Promise.all([
        callApi('planets', payload),
        callApi('houses', payload),
        callApi('natal-wheel-chart', payload),
      ]);

      console.log('🔭 /planets →', planetsRes);
      console.log('🏠 /houses →',  housesRes);
      console.log('🌀 /natal-wheel-chart →', wheelRes);

      const planetsArr = normalizePlanets(planetsRes);
      const housesRaw = Array.isArray(housesRes?.output?.Houses)
        ? housesRes.output.Houses : (housesRes?.Houses || []);
      const housesArr = housesRaw.map((h,i)=>({ house:i+1, deg:_sanitizeDeg(h.degree ?? h.cusp ?? h.fullDegree) }));

      // New object with BG labels + computed house
      const planetsNewObj = {}
      planetsArr.forEach(pl => {
        const bgName = PLANETS_BG[pl.name] || pl.name;
        const bgSign = SIGNS_BG[pl.sign]   || pl.sign;
        const hNum   = houseOf(pl.deg, housesArr);
        planetsNewObj[pl.name] = { name: bgName, house: hNum, sign: bgSign };
      });
      console.log('🆕 Обект с планети (BG имена + дом + знак):', planetsNewObj);

      // Aspects
      const aspectsObj = getMajorAspects(planetsRes);
      console.log('📐 Обект с аспектите (мажорни):', aspectsObj);

      const allAspects = aspectsBetween(planetsArr.map(x => ({ name:x.name, deg:x.deg })));
      console.log('📐 Всички аспекти (списък):', allAspects);

      // === STRING OUTPUTS (as requested) ===
      const planetsNewObjText = JSON.stringify(planetsNewObj, null, 2);
      console.log('🧵 Планети (текст):\n' + planetsNewObjText);

      const allAspectsText = JSON.stringify(allAspects, null, 2);
      console.log('🧵 Всички аспекти (текст):\n' + allAspectsText);
      // === Ask GPT for full natal analysis ===
      const profileName = (ev?.detail?.payload?.name || ev?.detail?.payload?.__label || '').trim();
      const title = `Анализ на наталната карта на ${profileName || 'избрания профил'}`;
      const q = `Направи цялостен анализ на наталната карта, като положенията на планетите са следните ${planetsNewObjText} и правят следните аспекти: ${allAspectsText}. отговори разбираемо за човек, който не разбира от Астрология. Не използвай астрологични термини. Направи прогнозата по дълга, опиши в повече изречения.`;
      let answerText = '';
      try {
        const askResp = await callApi('ask', { question: q });
        answerText = (askResp && (askResp.answer || askResp.text || (askResp.choices && askResp.choices[0] && askResp.choices[0].message && askResp.choices[0].message.content))) || String(askResp || '');
        console.log('🤖 Отговор от GPT:', askResp);
      } catch (e) {
        console.error('⚠️ Грешка при AI заявката:', e);
        answerText = 'Възникна грешка при генериране на анализа. Опитайте отново.';
      }

      // Extract chart URL from wheel response (try JSON fields first)
      let chartUrl = (wheelRes && (wheelRes.output && (wheelRes.output.url || wheelRes.output.imageUrl || wheelRes.output.image))) 
                   || wheelRes?.url || wheelRes?.imageUrl || wheelRes?.image || '';
      console.log(wheelRes.output)
      chartUrl=wheelRes.output;
      // Fallback: fetch binary from /api/chart-data and create an object URL
      if (!chartUrl) {
        try {
          const binRes = await fetch('/api/chart-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const raw = await binRes.blob();
          if (binRes.ok) {
            chartUrl = URL.createObjectURL(raw);
          } else {
            console.warn('[chart-data] HTTP ' + binRes.status, raw);
          }
        } catch (e) {
          console.warn('[chart-data] fallback failed:', e);
        }
      }

      if (window.__natalUI) window.__natalUI.showResult(title, answerText, chartUrl);
// Persist report for the current user
__saveNatalReport(title, chartUrl, answerText);


    } catch (e) {
      console.error('⚠️ Грешка при обработката на избран профил:', e);
    } finally {
      console.groupEnd();
    }
  });
