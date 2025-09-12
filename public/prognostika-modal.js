// === prognostika page UI helpers (копие от natal) ===
(function(){
  const bgVideo        = document.getElementById('bg-video');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const resultStageEl  = document.getElementById('resultStage');
  const resultTitleEl  = document.getElementById('resultTitle');
  const resultImgEl    = document.getElementById('resultNatalImg');
  const resultTextEl   = document.getElementById('resultText');

  function ensureVideoPlays(){ try { if (bgVideo && bgVideo.paused) bgVideo.play(); } catch(_){} }
  function pauseVideo(){ try { if (bgVideo && !bgVideo.paused) bgVideo.pause(); } catch(_){} }

  window.__natalUI = {
    showGenerating(){
      if (loadingOverlay) loadingOverlay.hidden = false;
      ensureVideoPlays();
      document.body?.setAttribute('aria-busy','true');
    },
    showResult(title, answer, chartUrl){
      if (loadingOverlay) loadingOverlay.hidden = true;
      pauseVideo();
      if (resultStageEl) resultStageEl.classList.remove('hidden');
      if (resultTitleEl) resultTitleEl.textContent = title || '';
      if (resultImgEl) {
        console.log(chartUrl)
        if (chartUrl) resultImgEl.src = chartUrl;
        resultImgEl.removeAttribute('hidden');
      }
      if (resultTextEl) resultTextEl.textContent = answer || '';
      document.body?.removeAttribute('aria-busy');
    }
  };
})();
// === end ui helpers ===
// prognostika-modal.js — UI за профили + форма (CRUD + GEO търсене + валидиране) за прогностика
// При „ЗАПАЗИ И ИЗБЕРИ“: принтираме body, скриваме първата модалка и показваме методната.

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

let planetsUser;
let planetsTranzits;
let aspectsBetweenTranzits; 
let planetsProgressions;
let aspectsBetweenProgressions;
let aspectsBetweenDirections;
let aspectBetweenDirections;




import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  query,
  limit,
  getDocs,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  setLogLevel,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

import { ensureSignedIn, ensureReportsShape, addReport } from './firebase-init.js';
try { setLogLevel('silent'); } catch(_) {}

const auth = getAuth();
const db   = getFirestore();


async function __savePrognostikaReport(title, chartUrl, answerText){
  try {
    const user = await ensureSignedIn();
    if (!user) throw new Error('No authenticated user');
    await ensureReportsShape(user.uid);
    const firstLine = String(title || answerText || '').split('\n')[0].slice(0, 120).trim();
    const reportObj = {
      heading: firstLine || 'Прогностичен анализ',
      chart: String(chartUrl || ''),
      report: String(answerText || ''),
      createdAt: new Date().toISOString()
    };
    await addReport(user.uid, 'prognostika', reportObj);
    console.log('[Firestore] Saved prognostika report for', user.uid, reportObj);
  } catch (err) {
    console.warn('Failed to save prognostika report:', err);
  }
}



// DOM refs
const prognostikaModal = document.getElementById('prognostikaModal');
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

// Methods modal
const methodsModal = document.getElementById('methodsModal');
const generateBtn  = document.getElementById('generateAnalysis');
const methodCbs = [
  document.getElementById('m-transits'),
  document.getElementById('m-progressions'),
  document.getElementById('m-directions'),
];
const aspectCbs = [
  document.getElementById('a-major'),
  document.getElementById('a-minor'),
  document.getElementById('a-creative'),
  document.getElementById('a-karma'),
];
// === Dynamic credits cost (5 per selected method) and button label ===
const genBtn = document.getElementById('generateAnalysis');
const genCostWrap = document.getElementById('gen-cost-wrap');
const ccCostA = document.getElementById('cc-cost');
const ccCostB = document.getElementById('cc-cost2');

function countSelectedMethods(){
  return methodCbs.reduce((n, cb) => n + (cb && cb.checked ? 1 : 0), 0);
}
function formatCredits(n){
  n = Number(n)||0;
  const unit = (n === 1) ? 'кредит' : 'кредита';
  return `${n} Astro ${unit}`;
}
function updateCostUi(){
  const methodsCount = countSelectedMethods();
  const cost = methodsCount * 5;
  if (genBtn) genBtn.dataset.cost = String(cost);
  // Update modal fields for astro-credits.js to read
  if (ccCostA) ccCostA.textContent = String(cost);
  if (ccCostB) ccCostB.textContent = String(cost);
  // Update button label suffix
  if (genBtn && genCostWrap){
    const iconHtml = '<img src="/images/icons/zodiac_circle_money.png" alt="" style="width:18px;height:18px;vertical-align:-3px;margin-left:6px;">';
    genCostWrap.innerHTML = ` ${(cost === 5 || cost === 10 || cost === 15) ? '<span class="gen-cost-number" style="font-size:1.5em;line-height:1;">' + (cost) + '</span>' : '<span class="gen-cost-number">' + (cost || 0) + '</span>'} <img src="/images/icons/zodiac_circle_money.png" alt="" style="width:49px;height:49px;vertical-align:middle;margin-left:6px;">`;
  }
}
methodCbs.forEach(cb => cb && cb.addEventListener('change', updateCostUi));
// also keep it in sync when aspects change (not needed for price, but OK)
aspectCbs.forEach(cb => cb && cb.addEventListener('change', updateCostUi));
// ensure cost is correct on load
updateCostUi();
// ensure we sync right before click as well
genBtn?.addEventListener('click', () => { updateCostUi(); }, { capture:true });




// ---- callApi helper (през server.js към FreeAstrologyAPI Geo) ----
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

// ---- Chat GPT-5 helper (via server /api/chat-gpt5 or /api/chat) ----

  return res.json();
}

async function callGpt5(question){
  try {
    // Единствен предпочитан ендпойнт
    return await callApi('ask', { question });
  } catch (e1) {
    console.error('[chat] /api/ask failed:', e1);
    throw e1;
  }
}

window.callGpt5 = callGpt5; // expose за рендър-„лепенката“

// ------- състояние -------
let profiles = [];       // /users/{uid}/profiles
let firstUser = null;    // първият документ от /users/{uid}/user
let currentSelection = { id: null, source: null }; // 'users-profiles' | 'user-first' | null
let selectedCity = null; // {complete_name, latitude, longitude, timezone, zoneId}
let lastFormSnapshot = null;

// ★ Активно избран профил (запазваме body, за да го ползваме при „ГЕНЕРИРАЙ АНАЛИЗ“)
let activeProfile = null;

// ------- помощни -------
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
function parseTimezone(v){
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s0 = String(v).trim();
  const s  = s0.replace(/^(?:UTC|GMT)\s*/i, '');
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
function mapCityGeo(cg){ if (!cg) return null;
  const tzRaw = (cg.timezone_offset ?? cg.gmtOffset ?? cg.utcOffset ?? cg.tz_offset ?? cg.timezone ?? cg.tz);
  const tzNum = parseTimezone(tzRaw);
  const lat = Number(cg.latitude ?? cg.lat ?? cg.lat_deg);
  const lon = Number(cg.longitude ?? cg.lon ?? cg.lng ?? cg.lon_deg);
  const name = cg.complete_name || cg.name || cg.city || cg.display_name || '';
  const zoneId = (cg.zoneId ?? cg.timeZoneId ?? cg.timezoneId ?? cg.time_zone_id ?? cg.timezone_name ?? cg.timeZone) || null;
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
  o.dataset.fullname = geo.complete_name || geo.name || geo.city || '';
  o.dataset.lat = geo.latitude;
  o.dataset.lon = geo.longitude;
  o.dataset.tz  = geo.timezone;
  if (geo.zoneId) o.dataset.zoneid = geo.zoneId;
  return o;
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

// ------- рендер на списъка с профили -------
function normalizeRecord(d = {}){
  const out = { ...d };
  out.__label = nameFromData(d);

  let birthDate = d.birthDate || d.date || null;
  let birthTime = d.birthTime || d.time || null;
  let birthDST  = (typeof d.birthDST === 'boolean') ? d.birthDST : null;
  let birthCity = d.birthCity || d.city || d.place || null;
  let cityGeo   = d.cityGeo || null;

  const body = d.body || d.astroPayload || null;
  const z = z2;

  if (!birthDate && body && body.year!=null && body.month!=null && body.date!=null){
    birthDate = `${body.year}-${z(body.month)}-${z(body.date)}`;
  }
  if (!birthTime && body && (body.hours!=null || body.minutes!=null)){
    birthTime = `${z(body.hours||0)}:${z(body.minutes||0)}`;
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

  // ★ Първият документ от /users/{uid}/user — първи в списъка
  if (firstUser) {
    const opt0 = document.createElement('option');
    opt0.value = firstUser.id;
    opt0.textContent = `★ ${nameFromData(firstUser)}`;
    opt0.dataset.source = 'user-first';
    profilesSelect.appendChild(opt0);
  }

  // Всички профили
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.__label || nameFromData(p);
    opt.dataset.source = p.source || 'users-profiles';
    profilesSelect.appendChild(opt);
  }

  currentSelection = { id: null, source: null };
  profilesSelect.selectedIndex = 0;
  snapshotForm();
  syncButtons();
}

// ------- попълване на формата -------
function fillForm(recRaw = {}) {
  const d = normalizeRecord(recRaw);
  if (nmEl)   nmEl.value   = d.__label || '';
  if (dtEl)   dtEl.value   = d.birthDate || '';
  if (tmEl)   tmEl.value   = d.birthTime || '';
  if (cityEl) cityEl.value = d.birthCity || '';
  if (dstEl)  dstEl.checked= !!d.birthDST;
  selectedCity = d.cityGeo ? mapCityGeo(d.cityGeo) : selectedCity;
  snapshotForm();
  syncButtons();
}

// ------- форм статус -------
function getCurrentCityGeo(){
  if (selectedCity) return selectedCity;

  if (currentSelection.source === 'users-profiles'){
    const rec = profiles.find(x => x.id === currentSelection.id);
    if (rec?.cityGeo) return mapCityGeo(rec.cityGeo);
    if (rec?.body && (rec.body.latitude!=null) && (rec.body.longitude!=null)) {
      return mapCityGeo({
        complete_name: rec.birthCity || rec.city || rec.place || rec.name || '',
        latitude: rec.body.latitude,
        longitude: rec.body.longitude,
        timezone: rec.body.timezone ?? null,
        zoneId: rec.body.zoneId ?? null
      });
    }
  }
  if (currentSelection.source === 'user-first'){
    if (firstUser?.cityGeo) return mapCityGeo(firstUser.cityGeo);
    if (firstUser?.body && (firstUser.body.latitude!=null) && (firstUser.body.longitude!=null)) {
      return mapCityGeo({
        complete_name: firstUser.birthCity || firstUser.city || firstUser.place || firstUser.name || '',
        latitude: firstUser.body.latitude,
        longitude: firstUser.body.longitude,
        timezone: firstUser.body.timezone ?? null,
        zoneId: firstUser.body.zoneId ?? null
      });
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
  if (btnClear)  btnClear.disabled  = !allFilled;
  const canDelete = currentSelection.source === 'users-profiles' && !!currentSelection.id; // ★ не се трие
  if (btnDelete) btnDelete.disabled = !canDelete;
}

// ------- изграждане на body -------
function buildBodyFromForm(){
  const { name, date, time, dst } = getFormState();
  const [Y,M,D] = (date||'').split('-').map(Number);
  const [h,mn]  = (time||'').split(':').map(Number);

  const geo = getCurrentCityGeo();
  const body = {
    year: Y||0,
    month: M||0,
    date: D||0,
    hours: h||0,
    minutes: mn||0,
    seconds: 0,
    latitude:  geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    timezone:  (typeof geo?.timezone === 'number' ? (geo.timezone + (dst ? 1 : 0)) : null),
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
    cityGeo: geo ? {
      complete_name: geo.complete_name,
      latitude: geo.latitude,
      longitude: geo.longitude,
      timezone: geo.timezone,
      zoneId: geo.zoneId ?? null
    } : null,
  };
}

// ------- зареждане от Firestore -------
async function loadUserFirst(uid) {
  try {
    const q = query(collection(db, 'users', uid, 'user'), limit(1));
    const snap = await getDocs(q);
    let d0 = null; snap.forEach(d => { if (!d0) d0 = d; });
    firstUser = d0 ? { id: `user:${d0.id}`, source: 'user-first', ...d0.data() } : null;
  } catch (e) {
    firstUser = null;
    console.warn(`[profiles] users/{uid}/user блокирано/грешка:`, e);
  }
}
async function loadProfiles(uid) {
  const results = [];
  try {
    const subSnap = await getDocs(collection(db, 'users', uid, 'profiles'));
    subSnap.forEach(docu => results.push(normalizeRecord({ id: docu.id, source: 'users-profiles', ...docu.data() })));
  } catch (e) {
    console.warn(`[profiles] users/${uid}/profiles блокирано/грешка:`, e);
  }
  profiles = results;
}

// ------- събития/UI wiring -------
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

[nmEl, dtEl, tmEl, cityEl, dstEl].forEach(el => el && el.addEventListener('input', () => { syncButtons(); }));

// Търсене на град
function populateCityDropdown(geos){
  if (!cityDropdown) return;
  cityDropdown.classList.remove('hidden');
  cityDropdown.innerHTML = '';
  const ph = document.createElement('option');
  ph.textContent = 'избери град';
  ph.disabled = true; ph.selected = true;
  cityDropdown.appendChild(ph);
  geos.forEach(g => cityDropdown.appendChild(optionFromGeo(g)));
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
  // опит за обогатяване на timezone
  if (!Number.isFinite(selectedCity?.timezone) || selectedCity.zoneId == null){
    try {
      const enrich = await callApi('geo-details', { latitude: selectedCity.latitude, longitude: selectedCity.longitude });
      const arr = Array.isArray(enrich?.data) ? enrich.data : (Array.isArray(enrich) ? enrich : []);
      if (arr.length){
        const r = arr[0];
        const candTz   = r.timezone_offset ?? r.gmtOffset ?? r.utcOffset ?? r.tz_offset ?? r.timezone ?? r.tz ?? null;
        const candZone = r.zoneId ?? r.timeZoneId ?? r.timezoneId ?? r.time_zone_id ?? r.timezone_name ?? r.timeZone ?? null;
        const tzNum = parseTimezone(candTz);
        if (Number.isFinite(tzNum)) selectedCity.timezone = tzNum;
        if (!selectedCity.zoneId && typeof candZone === 'string') selectedCity.zoneId = candZone;
      }
    } catch(e){ console.warn('[geo] enrich timezone failed:', e); }
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
// избор със double-click
cityDropdown?.addEventListener('dblclick', () => { commitCitySelection(); snapshotForm(); });
// избор с Enter
cityDropdown?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitCitySelection(); snapshotForm(); }
});
// избор с единичен клик/тап (или промяна от клавиатурата)
cityDropdown?.addEventListener('change', () => { commitCitySelection(); snapshotForm(); });


// CLEAR
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
btnClear?.addEventListener('click', () => clearForm());

// SAVE & CHOOSE
function printBodyToConsoleOnly(body){
  console.group('[prognostika] ЗАПАЗИ И ИЗБЕРИ → body');
  console.log(JSON.stringify(body, null, 2));
  console.groupEnd();
}
function openMethodsModal(){
  prognostikaModal?.classList.add('hidden');
  methodsModal?.classList.remove('hidden');
}
function updateGenerateState(){
  const anyMethod = methodCbs.some(cb => cb && cb.checked);
  const anyAspect = aspectCbs.some(cb => cb && cb.checked);
  if (generateBtn) generateBtn.disabled = !(anyMethod && anyAspect);
}
methodCbs.forEach(cb => cb && cb.addEventListener('change', updateGenerateState));
aspectCbs.forEach(cb => cb && cb.addEventListener('change', updateGenerateState));
updateGenerateState();

// ==== Secondary Progressions helpers (1 day = 1 year, work in UT) ====
const MS_PER_DAY = 86400000;
const TROPICAL_YEAR = 365.2422;

/** Наталният момент в UTC, като местният час - timezone → UTC */
function utcFromBody(body){
  const y = Number(body.year)||0, m = (Number(body.month)||1)-1, d = Number(body.date)||1;
  const hh = Number(body.hours)||0, mi = Number(body.minutes)||0, ss = Number(body.seconds)||0;
  const tz = Number(body.timezone)||0; // напр. +2, +3, -5.5
  return new Date(Date.UTC(y, m, d, hh - tz, mi, ss));
}

/** t_prog(UTC) = t_birth(UTC) + ( (t_target - t_birth)/365.2422 ) дни */
function progressedUTC(natalUTC, targetUTC){
  const ageYears = (targetUTC.getTime() - natalUTC.getTime()) / MS_PER_DAY / TROPICAL_YEAR;
  return new Date(natalUTC.getTime() + ageYears * MS_PER_DAY);
}

/** Връща календарни полета в "локално за профила" време от UTC + timezone */
function localFieldsFromUTC(dateUTC, tz){
  const shifted = new Date(dateUTC.getTime() + (Number(tz)||0)*3600000);
  return {
    year:    shifted.getUTCFullYear(),
    month:   shifted.getUTCMonth() + 1,
    date:    shifted.getUTCDate(),
    hours:   shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
  };
}

/** Строи body за прогресии, ползвайки профилните geo/часова зона и t_target (по подразб. сега) */
function buildProgressedBody(baseBody, targetUTC = new Date()){
  const natalUTC  = utcFromBody(baseBody);
  const tProgUTC  = progressedUTC(natalUTC, targetUTC);
  const fieldsLoc = localFieldsFromUTC(tProgUTC, baseBody.timezone||0);

  const progBody = {
    ...fieldsLoc,
    latitude:  baseBody.latitude,
    longitude: baseBody.longitude,
    timezone:  baseBody.timezone,
    config:    baseBody.config || {
      observation_point: 'topocentric',
      ayanamsha: 'tropical',
      language: 'en'
    }
  };
  return { progBody, math: { natalUTC, targetUTC, tProgUTC } };
}

// ЗАМЕНИ целия стар слушател за "ГЕНЕРИРАЙ АНАЛИЗ" с този:
generateBtn?.addEventListener('click', async () => {  // Валидация: изискай поне 1 метод и 1 вид аспект
  const __anyMethod__ = methodCbs.some(cb => cb && cb.checked);
  const __anyAspect__ = aspectCbs.some(cb => cb && cb.checked);
  if (!__anyMethod__ || !__anyAspect__) {
    alert('Моля, изберете поне 1 вид аспект и поне един прогностичен метод.');
    return;
  }

  // 1) Прочитаме изборите (методи/аспекти) – само за лог (методи/аспекти) – само за лог
  const selected = {
    methods: {
      transits:    !!methodCbs[0]?.checked,
      progressions:!!methodCbs[1]?.checked,
      directions:  !!methodCbs[2]?.checked,
    },
    aspects: {
      major:   !!aspectCbs[0]?.checked,
      minor:   !!aspectCbs[1]?.checked,
      creative:!!aspectCbs[2]?.checked,
      karmic:  !!aspectCbs[3]?.checked,
    }
  };
  // Build aspect definition list based on selected aspect categories
  const { aspectDefs, nameToCat } = buildAspectDefsFromSelection(selected.aspects);

  console.group('[prognostika] ГЕНЕРИРАЙ АНАЛИЗ → избори');
  console.log(selected);
  console.groupEnd();

  // 2) СКРИЙ МОДАЛ #2 веднага
  methodsModal?.classList.add('hidden');

  // Пусни лоудъра
  window.__natalUI?.showGenerating();
  


  // 3) Първа заявка: с body-то на избрания профил
  // (ако по някаква причина липсва, fallback към текущата форма)
  const baseBody = (activeProfile && activeProfile.body) || buildBodyFromForm().body;
  // === natal-wheel-chart (immediate fetch & render image) ===
  console.group('[natal-wheel-chart] (избран профил)');
  console.log('REQUEST body (WHEEL):', JSON.stringify(baseBody, null, 2));
  let __wheelRes = null;
  let __chartUrl = null;
  try {
    __wheelRes = await callApi('natal-wheel-chart', baseBody);
    console.log('SERVER response (WHEEL):', __wheelRes);
    console.log(__wheelRes.output)
    __chartUrl = __wheelRes.output;
  } catch (e) {
    console.error('[natal-wheel-chart] ERROR:', e);
  } finally {
    console.groupEnd();
  }
  if (__chartUrl) {
    const __titleNow = (typeof nmEl !== 'undefined' && nmEl && nmEl.value) ? nmEl.value : 'Прогностика';
    // Показваме снимката веднага; текстът ще се добави по-късно след GPT-5
    const __pre = new Image(); __pre.src = __chartUrl;
  }


  console.group('[prognostika] planets — natal (избран профил)');
  console.log('REQUEST body:', JSON.stringify(baseBody, null, 2));
  try {
    const natalResp = await callApi('planets', baseBody); // през server.js → /api/planets
    console.log('SERVER response:', natalResp);
    planetsUser=natalResp.output;
    console.log(planetsUser)
  } catch (e) {
    console.error('[prognostika] planets (natal) ERROR:', e);
  } finally {
    console.groupEnd();
  }

  // 4) Ако са отметнати ТРАНЗИТИ → NOW body + още една заявка
  if (selected.methods.transits) {
    const now = new Date();
    const transitBody = {
      year:    now.getFullYear(),
      month:   now.getMonth() + 1,
      date:    now.getDate(),
      hours:   now.getHours(),
      minutes: now.getMinutes(),
      seconds: 0,
      latitude:  baseBody.latitude,
      longitude: baseBody.longitude,
      timezone:  baseBody.timezone, // от профила
      config: {
        observation_point: 'topocentric', // geocentric or topocentric
        ayanamsha: 'tropical',            // tropical | sayana | lahiri
        language: 'en'                    // en , te , es , fr , pt , ru , de , ja
      }
    };

    console.group('[prognostika] planets — transits (NOW @ profile location)');
    console.log('REQUEST body (TRANSITS):', JSON.stringify(transitBody, null, 2));
    try {
      const transitsResp = await callApi('planets', transitBody); // през server.js → /api/planets
      console.log('SERVER response (TRANSITS):', transitsResp);
      planetsTranzits=transitsResp.output;
      console.log(planetsTranzits) 
       aspectsBetweenTranzits = computeAspects(planetsUser, planetsTranzits, aspectDefs);
  console.log(aspectsBetweenTranzits)

    } catch (e) {
      console.error('[prognostika] planets (transits) ERROR:', e);
    } finally {
      console.groupEnd();
    }
  }
  // 5) Ако са отметнати ПРОГРЕСИИ → secondary progressions (1 day = 1 year)
  if (selected.methods.progressions) {
    const { progBody, math } = buildProgressedBody(baseBody, new Date()); // t_target = "сега" (UTC вътрешно)

    console.group('[prognostika] planets — progressions (secondary: 1 day = 1 year)');
    console.log('MATH natalUTC   :', math.natalUTC.toISOString());
    console.log('MATH targetUTC  :', math.targetUTC.toISOString());
    console.log('MATH tProgUTC   :', math.tProgUTC.toISOString());
    console.log('REQUEST body (PROGRESSIONS):', JSON.stringify(progBody, null, 2));
    try {
      const progResp = await callApi('planets', progBody); // през server.js → /api/planets
      console.log('SERVER response (PROGRESSIONS):', progResp);
      planetsProgressions = progResp.output;
      console.log(planetsProgressions);
      aspectsBetweenProgressions = computeAspects(planetsUser, planetsProgressions, aspectDefs);
      console.log(aspectsBetweenProgressions)
    } catch (e) {
      console.error('[prognostika] planets (progressions) ERROR:', e);
    } finally {
      console.groupEnd();
    }
  }

  // 6) Ако са отметнати ДИРЕКЦИИ → Solar Arc (директирани позиции от planetsUser)
  if (selected.methods.directions) {
    // Помощни за извличане на името и градусите
    const mod360 = (d) => ((d % 360) + 360) % 360;
    const extractDeg = (o) => {
      if (!o) return NaN;
      const k = ['fullDegree','fullDegreee','degree','deg','angle','lon','longitude'];
      for (const kk of k) { if (kk in o && Number.isFinite(Number(o[kk]))) return mod360(Number(o[kk])); }
      const nests = [
        o.position?.fullDegree, o.position?.fullDegreee, o.position?.degree, o.position?.deg, o.position?.angle,
        o.ecliptic?.lon, o.ecliptic?.longitude,
        o.coords?.lon, o.coords?.longitude
      ];
      for (const v of nests) { if (Number.isFinite(Number(v))) return mod360(Number(v)); }
      return NaN;
    };
    const extractName = (o) => {
      if (!o) return 'Unknown';
      if (typeof o.name === 'string') return o.name;
      if (typeof o.planet === 'string') return o.planet;
      if (o.planet && typeof o.planet.name === 'string') return o.planet.name;
      if (o.planet && typeof o.planet.en === 'string') return o.planet.en;
      if (typeof o.key === 'string') return o.key;
      return 'Unknown';
    };
    const isSun = (o) => /sun|слънце/i.test(extractName(o));

    // 1) Намираме Δ (слънчева дъга) = λ☉(progressed) - λ☉(natal)
    let arcDeg = null;

    // A) опитай от вече налични прогресии
    try {
      if (Array.isArray(planetsProgressions) && planetsProgressions.length) {
        const natalSun = (planetsUser || []).find(isSun);
        const progSun  = planetsProgressions.find(isSun);
        const natLon = extractDeg(natalSun);
        const progLon = extractDeg(progSun);
        if (Number.isFinite(natLon) && Number.isFinite(progLon)) {
          arcDeg = mod360(progLon - natLon);
        }
      }
    } catch {}

    // B) ако няма прогресии, сметни t_prog и вземи прогресирано Слънце от API
    if (!Number.isFinite(arcDeg)) {
      try {
        const { progBody } = buildProgressedBody(baseBody, new Date());
        const progResp = await callApi('planets', progBody);
        const natalSun = (planetsUser || []).find(isSun);
        const progSun  = (progResp?.output || []).find(isSun);
        const natLon = extractDeg(natalSun);
        const progLon = extractDeg(progSun);
        if (Number.isFinite(natLon) && Number.isFinite(progLon)) {
          arcDeg = mod360(progLon - natLon);
        }
      } catch (e) {
        console.warn('[directions] Прогресии през API неуспешни, ползвам Naibod ключ.', e);
      }
    }

    // C) последен fallback — Naibod ключ (0.985647°/година) от възрастта
    if (!Number.isFinite(arcDeg)) {
      try {
        const natalUTC = utcFromBody(baseBody);
        const targetUTC = new Date();
        const ageYears = (targetUTC - natalUTC) / MS_PER_DAY / TROPICAL_YEAR;
        arcDeg = mod360(ageYears * 0.985647);
      } catch {}
    }

    if (!Number.isFinite(arcDeg)) {
      console.error('[directions] Неуспех при изчисляване на слънчева дъга.');
    } else {
      // 2) Създаваме нов масив от planetsUser с директирани градуси
      const directed = (Array.isArray(planetsUser) ? planetsUser : []).map(p => {
        const nat = extractDeg(p);
        const dirFull = Number.isFinite(nat) ? mod360(nat + arcDeg) : NaN;
        const dirNorm = Number.isFinite(dirFull) ? (dirFull % 30) : NaN;
        return {
          ...p,
          method: 'Solar Arc',
          directionArc: +arcDeg.toFixed(6),
          fullDegree: Number.isFinite(dirFull) ? +dirFull.toFixed(6) : null,
          normDegree: Number.isFinite(dirNorm) ? +dirNorm.toFixed(6) : null,
        };
      });

      console.group('[prognostika] DIRECTIONS — Solar Arc');
      console.log('Δ (arcDegrees):', arcDeg);
      console.log(directed)
            aspectBetweenDirections = computeAspects(planetsUser, directed, aspectDefs);
      console.log(aspectBetweenDirections)
      console.log('Directed planets:', directed);
      console.groupEnd()

    }
  }
  // 7) Събиране на аспекти според избраните методи и изпращане към GPT‑5
  try {
    const forChat = [];
    if (selected.methods.transits && Array.isArray(aspectsBetweenTranzits)) {
      for (const a of aspectsBetweenTranzits) {
        forChat.push({
          aspect: a?.aspect ?? null,
          pl1: a?.pl1 ?? a?.planet1 ?? a?.p1 ?? null,
          pl2: a?.pl2 ?? a?.planet2 ?? a?.p2 ?? null,
          orb: a?.orb ?? null,
          method: 'Transits',
          category: a?.category ?? (typeof categoryOfAspect==='function' ? categoryOfAspect(a?.aspect) : aspectCategory(a?.aspect))
        });
      }
    }
    if (selected.methods.progressions && Array.isArray(aspectsBetweenProgressions)) {
      for (const a of aspectsBetweenProgressions) {
        forChat.push({
          aspect: a?.aspect ?? null,
          pl1: a?.pl1 ?? a?.planet1 ?? a?.p1 ?? null,
          pl2: a?.pl2 ?? a?.planet2 ?? a?.p2 ?? null,
          orb: a?.orb ?? null,
          method: 'Progressions',
          category: a?.category ?? (typeof categoryOfAspect==='function' ? categoryOfAspect(a?.aspect) : aspectCategory(a?.aspect))
        });
      }
    }
    if (selected.methods.directions && Array.isArray(aspectsBetweenDirections)) {
      for (const a of aspectsBetweenDirections) {
        forChat.push({
          aspect: a?.aspect ?? null,
          pl1: a?.pl1 ?? a?.planet1 ?? a?.p1 ?? null,
          pl2: a?.pl2 ?? a?.planet2 ?? a?.p2 ?? null,
          orb: a?.orb ?? null,
          method: 'Directions',
          category: a?.category ?? (typeof categoryOfAspect==='function' ? categoryOfAspect(a?.aspect) : aspectCategory(a?.aspect))
        });
      }
    }
// (допълнително) филтрираме спрямо селектираните групи, ако aspectDefs не е ограничил достатъчно
    const want = {
      major: !!selected.aspects.major,
      minor: !!selected.aspects.minor,
      creative: !!selected.aspects.creative,
      karmic: !!selected.aspects.karmic,
    };
    const noneSelected = !want.major && !want.minor && !want.creative && !want.karmic;
    const filtered = forChat.filter(x => noneSelected || (x.category && want[x.category]));

    console.group('[prognostika] GPT‑5 → ЕДИННА заявка');
console.log('Избрани аспекти за интерпретация (%d):', filtered.length, filtered);
if (!filtered.length) {
  console.warn('[GPT‑5] Няма аспекти след филтриране — заявка няма да бъде изпратена.');
  // Показваме ясно съобщение за потребителя в UI
  const __nameForTitle = (nmEl?.value || (activeProfile && activeProfile.name) || 'избрания профил').trim() || 'избрания профил';
  const __titleNoAspects = `Прогностичен анализ на ${__nameForTitle} за ${formatTodayBG()}`;
  const __msgNoAspects = 'Няма намерени аспекти според избраните филтри. Увеличете орбитите, включете повече видове аспекти или изберете допълнителен прогностичен метод и опитайте отново.';
  window.__natalUI?.showResult(__titleNoAspects, __msgNoAspects, __chartUrl || null);
// Persist prognostika report (no aspects)
__savePrognostikaReport(__titleNoAspects, (__chartUrl || null), __msgNoAspects);
return;
} else {
  const obj = { aspects: filtered };
  const question = 'Интерпретирай и направи прогностика на следните аспекти : ' +
                   JSON.stringify(obj) + '. ' +
                   'Да се направи пълно тълкувание на най-важните аспекти. ';
  console.log('[GPT‑5][единна заявка] изпратен текст:', question);
  try {
    const gpt = await callGpt5(question);
    // Вземи текста на отговора и го покажи с колелото
    const gptAnswerText = (typeof extractAnswer === 'function') ? extractAnswer(gpt) : (gpt?.answer || gpt?.text || (typeof gpt === 'string' ? gpt : JSON.stringify(gpt)));
    let chartUrl = null;
    try {
      const wheelRes = await callApi('natal-wheel-chart', baseBody);
      console.log('SERVER response (WHEEL – post-GPT fallback):', wheelRes);
    chartUrl = wheelRes?.image_url || wheelRes?.url || wheelRes?.output?.url || __chartUrl || null;
    } catch (e) {
      console.warn('[natal-wheel-chart] неуспешно:', e);
    }
    const __nameForTitle = (nmEl?.value || (activeProfile && activeProfile.name) || 'избрания профил').trim() || 'избрания профил';
const title = `Прогностичен анализ на ${__nameForTitle} за ${formatTodayBG()}`;
window.__natalUI?.showResult(title, gptAnswerText, chartUrl);
// Persist prognostika report
__savePrognostikaReport(title, chartUrl, gptAnswerText);
console.log('[GPT‑5][единна заявка] отговор:', gpt);
  } catch (e) {
    console.error('[GPT‑5] грешка при единната заявка:', e);
  }
}
console.groupEnd();
  } catch (e) {
    console.error('[prognostika] GPT‑5 batch error:', e);
  }

});


btnSave?.addEventListener('click', async () => {
  if (!auth.currentUser) return alert('Моля, влезте в профила си.');
  const uid = auth.currentUser.uid;
  const { allFilled } = getFormState();
  if (!allFilled) return;

  const pack = buildBodyFromForm();
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

  try {
    let finalId = currentSelection.id || null;

    // A) Update съществуващ профил
    if ((currentSelection.source === 'users-profiles') && currentSelection.id) {
      const targetRef = doc(db, 'users', uid, 'profiles', currentSelection.id);
      if (isChanged()){
        await setDoc(targetRef, payload, { merge: true });
      }
      finalId = currentSelection.id;
      activeProfile = payload;
      printBodyToConsoleOnly(payload.body);
      openMethodsModal();
    }
    // B) Update основния ★ профил
    else if (currentSelection.source === 'user-first' && currentSelection.id?.startsWith('user:')) {
      const userDocId = currentSelection.id.slice(5);
      const targetRef = doc(db, 'users', uid, 'user', userDocId);
      if (isChanged()){
        await setDoc(targetRef, payload, { merge: true });
      }
      finalId = currentSelection.id;
      activeProfile = payload;
      printBodyToConsoleOnly(payload.body);
      openMethodsModal();
    }
    // C) Нов запис
    else {
      const snap = await getDocs(collection(db, 'users', uid, 'profiles'));
      const key = keyFromRecord(payload);
      let existing = null;
      snap.forEach(d => {
        if (!existing) {
          const k = keyFromRecord({ id: d.id, ...(d.data()||{}) });
          if (k === key) existing = { id: d.id, data: d.data()||{} };
        }
      });

      if (existing){
        await setDoc(doc(db,'users', uid, 'profiles', existing.id), payload, { merge: true });
        currentSelection = { id: existing.id, source: 'users-profiles' };
        finalId = existing.id;
      } else {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, 'users', uid, 'profiles'), payload);
        currentSelection = { id: ref.id, source: 'users-profiles' };
        finalId = ref.id;
      }
      activeProfile = payload;
      printBodyToConsoleOnly(payload.body);
      openMethodsModal();
    }

    // Обновяване (в бекграунд за UI)
    clearForm(true);
    await loadProfiles(uid);
    renderSelect();
  } catch (e) {
    console.error('[profiles] Записът се провали:', e);
    alert('Записът беше отказан от правилата или възникна грешка. Виж конзолата.');
  }

});

// DELETE
btnDelete?.addEventListener('click', async () => {
  if (!auth.currentUser) return alert('Моля, влезте в профила си.');
  if (!currentSelection.id) return;
  if (!confirm('Сигурни ли сте, че искате да изтриете този профил?')) return;
  const uid = auth.currentUser.uid;
  try {
    await deleteDoc(doc(db, 'users', uid, 'profiles', currentSelection.id));
    try { await deleteDoc(doc(db, 'profiles', currentSelection.id)); } catch(_){}

    currentSelection = { id: null, source: null };
    clearForm(true);
    await loadProfiles(uid);
    renderSelect();
  } catch (e) {
    console.error('[profiles] Изтриването се провали:', e);
    alert('Изтриването беше отказано от правилата или възникна грешка.');
  }
});

// Инициализация при login
onAuthStateChanged(auth, (user) => {
  if (!user) {
    profiles = []; firstUser = null; renderSelect();
    return;
  }
  (async () => {
    const uid = user.uid;
    await loadUserFirst(uid);   // ★ първият от /users/{uid}/user
    await loadProfiles(uid);    // всички /users/{uid}/profiles
    renderSelect();             // ★ излиза първи
  })();
});



// Твоят списък с аспекти
const ASPECTS = [
  { name: "Conjunction",    angle: 0,        orb: 5,   sunMoonOrb: 8 },
  { name: "Semi-sextile",   angle: 30,       orb: 1.5, sunMoonOrb: 2 },
  { name: "Decile",         angle: 36,       orb: 1,   sunMoonOrb: 1 },
  { name: "Novile",         angle: 40,       orb: 1.5, sunMoonOrb: 2 },
  { name: "Semi-square",    angle: 45,       orb: 2,   sunMoonOrb: 2 },
  { name: "Sextile",        angle: 60,       orb: 5,   sunMoonOrb: 8 },
  { name: "Quintile",       angle: 72,       orb: 2,   sunMoonOrb: 2 },
  { name: "Tredecile",      angle: 108,      orb: 1.5, sunMoonOrb: 2 },
  { name: "Trine",          angle: 120,      orb: 5,   sunMoonOrb: 8 },
  { name: "Sesqui-square",  angle: 135,      orb: 2,   sunMoonOrb: 3 },
  { name: "Biquintile",     angle: 144,      orb: 1,   sunMoonOrb: 1 },
  { name: "Quincunx",       angle: 150,      orb: 3,   sunMoonOrb: 4 },
  { name: "Opposition",     angle: 180,      orb: 5,   sunMoonOrb: 7 },
  { name: "Semi-novile",    angle: 20,       orb: 0.5, sunMoonOrb: 0.5 },
  { name: "Septile",        angle: 360/7,    orb: 1,   sunMoonOrb: 1 },
  { name: "Biseptile",      angle: 2*360/7,  orb: 1,   sunMoonOrb: 1 },
  { name: "Triseptile",     angle: 3*360/7,  orb: 1,   sunMoonOrb: 1 },
];

// === Aspect categories (Major/Minor/Creative/Karmic) and selection builder ===
const ASPECT_SETS = {
  major: [
    { name: 'Conjunction', angle: 0,   orb: 6, sunMoonOrb: 8 },
    { name: 'Opposition',  angle: 180, orb: 7, sunMoonOrb: 8 },
    { name: 'Trine',       angle: 120, orb: 6, sunMoonOrb: 8 },
    { name: 'Square',      angle: 90,  orb: 6, sunMoonOrb: 8 },
    { name: 'Sextile',     angle: 60,  orb: 5, sunMoonOrb: 6 },
  ],
  minor: [
    { name: 'Semi-square',   angle: 45,  orb: 2, sunMoonOrb: 2 },
    { name: 'Sesqui-square', angle: 135, orb: 2, sunMoonOrb: 2 },
    { name: 'Semi-sextile',  angle: 30,  orb: 2, sunMoonOrb: 2 },
  ],
  creative: [
    { name: 'Decile',      angle: 36,  orb: 1, sunMoonOrb: 1 },
    { name: 'Quintile',    angle: 72,  orb: 2, sunMoonOrb: 2 },
    { name: 'Tredecile',   angle: 108, orb: 1, sunMoonOrb: 1 },
    { name: 'Biquintile',  angle: 144, orb: 2, sunMoonOrb: 2 },
  ],
  karmic: [
    { name: 'Quincunx',    angle: 150,      orb: 3, sunMoonOrb: 3 },
    { name: 'Septile',     angle: 360/7,    orb: 1, sunMoonOrb: 1 },
    { name: 'Biseptile',   angle: 2*360/7,  orb: 1, sunMoonOrb: 1 },
    { name: 'Triseptile',  angle: 3*360/7,  orb: 1, sunMoonOrb: 1 },
    { name: 'Novile',      angle: 40,       orb: 1, sunMoonOrb: 1 },
    { name: 'Binovile',    angle: 80,       orb: 1, sunMoonOrb: 1 },
    { name: 'Quadranovile',angle: 160,      orb: 1, sunMoonOrb: 1 },
    { name: 'Quindecile',  angle: 165,      orb: 2, sunMoonOrb: 2 },
  ]
};

function formatTodayBG(){
  try {
    return new Intl.DateTimeFormat('bg-BG', { day:'numeric', month:'long', year:'numeric' }).format(new Date());
  } catch(_) {
    const d = new Date();
    return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }
}

function buildAspectDefsFromSelection(flags){
  // flags: {major, minor, creative, karmic}
  const useAll = !flags || (!flags.major && !flags.minor && !flags.creative && !flags.karmic);
  const sel = [];
  const nameToCat = {};
  const pushSet = (cat) => {
    for (const a of ASPECT_SETS[cat]) { sel.push(a); nameToCat[a.name] = cat; }
  };
  if (useAll || flags.major)    pushSet('major');
  if (useAll || flags.minor)    pushSet('minor');
  if (useAll || flags.creative) pushSet('creative');
  if (useAll || flags.karmic)   pushSet('karmic');
  return { aspectDefs: sel, nameToCat };
}

function categoryOfAspect(name){
  for (const [cat, arr] of Object.entries(ASPECT_SETS)){
    if (arr.some(a => a.name.toLowerCase() === String(name||'').toLowerCase())) return cat;
  }
  return null;
}



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

// ===== Loader glue (non-invasive): SHOW/HIDE "ГЕНЕРИРАНЕ..." =====
(() => {
  const overlay = document.getElementById('loadingOverlay');
  const dotsEl  = overlay?.querySelector('.dots');

  function showLoader(text = 'ГЕНЕРИРАНЕ...') {
    if (!overlay) return;
    if (dotsEl) dotsEl.textContent = text; // нормализирай на три точки
    overlay.removeAttribute('hidden');
  }
  function hideLoader() {
    overlay?.setAttribute?.('hidden','');
  }

  // Показваме веднага при клика върху "ГЕНЕРИРАЙ АНАЛИЗ" — без да пипаме стария слушател
  let generationGate = false;
  const generateBtn = document.getElementById('generateAnalysis');
 /* generateBtn?.addEventListener('click', () => {
    generationGate = true;
    showLoader();
  }, { capture: true });*/

  // Кръпка на fetch: следим само заявките, свързани с генерирането
  if (!window.__progFetchPatched) {
    window.__progFetchPatched = true;
    const origFetch = window.fetch;
    let inFlight = 0;

    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      // следим само нашите тежки API-та и само докато е активен "generationGate"
      const track = generationGate && (url.includes('/api/planets') || url.includes('/api/ask'));
      if (track) {
        inFlight++;
        showLoader();
      }
      try {
        return await origFetch(input, init);
      } finally {
        if (track) {
          inFlight--;
          // малко забавяне, за да хване верижни заявки
          setTimeout(() => {
            if (inFlight <= 0) {
              generationGate = false;
              hideLoader();
            }
          }, 250);
        }
      }
    };
  }
})();

// ===== Render glue: покажи отговора в "Поле с резултата" =====
(() => {
  const stage = document.getElementById('resultStage');
  const box   = document.getElementById('resultText');
  const title = document.getElementById('resultTitle');

  // Запази оригиналната функция и я "обвий"
  const orig = window.callGpt5;
  if (typeof orig === 'function' && !window.__renderPatched) {
    window.__renderPatched = true;

    window.callGpt5 = async function(question){
      const res = await orig.call(this, question);   // не пипаме логиката, само добавяме рендер
      try {
        const text = extractAnswer(res);
        if (text) {
          if (title && !title.textContent.trim()) title.textContent = 'Готов анализ';
          if (box) {
            // Ако искаш да ДОБАВЯШ, смени innerHTML с insertAdjacentHTML('beforeend', ...)
            box.innerHTML = '<p>' + String(text)
              .replace(/\n{2,}/g, '</p><p>')
              .replace(/\n/g, '<br>') + '</p>';
          }
          stage?.classList?.remove('hidden');
          stage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (e) {
        console.warn('[render] неуспех при рендериране на GPT отговора:', e);
      }
      return res; // върни оригиналния резултат, за да не чупим нищо
    };

    function extractAnswer(g){
      if (!g) return '';
      if (typeof g === 'string') return g;
      if (g.answer) return g.answer;
      if (g.content) return g.content;
      if (g.text) return g.text;
      if (Array.isArray(g.choices)) {
        const c = g.choices[0] || {};
        if (c.message?.content) return c.message.content;
        if (c.text) return c.text;
      }
      if (Array.isArray(g.output)) {
        const o = g.output[0] || {};
        if (o.content) return o.content;
        if (o.text) return o.text;
      }
      // fallback — полезно за диагностика
      try { return JSON.stringify(g, null, 2); } catch { return String(g); }
    }
  }
})();

