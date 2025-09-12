async function __saveHoraryReport(answer, chartUrl, question){
  try{
    let user = undefined;
    if (typeof ensureSignedIn === 'function') {
      user = await ensureSignedIn();
    } else if (auth && !auth.currentUser) {
      await signInAnonymously(auth);
      user = auth.currentUser;
    } else {
      user = auth.currentUser;
    }
    if (!user) throw new Error("No authenticated user");

    await ensureReportsShape(user.uid);
    const firstLine = (answer || '').split('\n')[0] || (question || '');
    const heading = firstLine.slice(0, 120).trim();
    const reportObj = {
      heading,
      chart: chartUrl || '',
      report: answer || '',
      question: question || '',
      createdAt: new Date().toISOString()
    };
    await addReport(user.uid, 'horary', reportObj);
    console.log('[Firestore] Saved horary report for', user.uid, reportObj);
  } catch(err){
    console.warn('Failed to save horary report:', err);
  }
}

import { auth, ensureReportsShape, addReport, ensureSignedIn } from './firebase-init.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

/* horary.js — фикс за 404 към /api/chat + чиста логика за ЗАДАЙ ВЪПРОС
   - Поддържа търсене на град през /api/geo-details
   - При „ЗАДАЙ ВЪПРОС“: праща { question } към /api/ask (има и fallback към /api/chat)
   - Печата payload-а и отговора в конзолата
*/


let planetsNow;
let housesNow;
// ===== URL safety mini-patch =====
(() => {
  if (window.__urlSafetyPatchInstalled__) return;
  window.__urlSafetyPatchInstalled__ = true;

  function dedupe(u) {
    if (typeof u !== 'string') return u;
    const m = u.match(/^(https?:\/\/[^/]+)\1(\/.*|$)/i);
    if (m) return m[1] + (m[2] || '/');
    u = u.replace(/^(https?:\/\/[^/]+)\/{2,}/i, '$1/');
    return u.replace(/([^:])\/{2,}/g, '$1/');
  }
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (typeof input === 'string') input = dedupe(input);
      else if (input && input.url) input = new Request(dedupe(input.url), input);
    } catch {}
    return orig(input, init);
  };
})();

// ===== Generic POST helper (pretty console logs) =====
async function callApi(endpoint, body){
  const bases = [];
  if (window.__API_BASE__) bases.push(String(window.__API_BASE__).replace(/\/+$/, ''));
  try {
    const origin = window.location.origin;
    if (origin && !origin.startsWith('file:')) bases.push(origin);
  } catch {}
  bases.push('http://localhost:5000','http://127.0.0.1:5000');
  const uniq = Array.from(new Set(bases));

  const reqBody = body || {};
  let lastErr;
  for (const base of uniq){
    const url = `${base}/api/${endpoint}`;
    console.groupCollapsed('%c[API →] ' + url, 'color:#0a0;font-weight:bold');
    console.log('Body:', reqBody);
    console.groupEnd();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      const raw = await res.text();
      console.groupCollapsed('%c[API ←] ' + url, 'color:#07c;font-weight:bold');
      console.log('Status:', res.status);
      console.log('Raw:', raw);
      console.groupEnd();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
      try { return JSON.parse(raw); } catch { return raw; }
    } catch(e){
      console.warn('[API ✗]', base, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error('API unreachable');
}

// ===== City search using /api/geo-details (accepts { location } or { city }) =====
function toLatin(s){ try { return (typeof cyrToLat === 'function') ? cyrToLat(String(s||'')) : String(s||''); } catch { return String(s||''); } }

async function searchCity(q) {
  const x = toLatin(q);
  const resp = await callApi('geo-details', { location: x, city: x, q: x });
  const arr = Array.isArray(resp?.results) ? resp.results : (Array.isArray(resp) ? resp : []);
  return arr.map(c => ({
    complete_name: c.complete_name || c.name || [c.city,c.state,c.country].filter(Boolean).join(', '),
    latitude: Number(c.latitude ?? c.lat),
    longitude: Number(c.longitude ?? c.lon ?? c.lng),
    timezone_offset: Number(c.timezone_offset ?? c.gmtOffset ?? c.utcOffset ?? 0)
  })).filter(c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

// ===== Wire UI =====
(function init(){
  const qText   = document.getElementById('qText');
  const cityInp = document.getElementById('qCity');
  const btnSrch = document.getElementById('qSearchBtn');
  const citySel = document.getElementById('qCityResults');
  const askBtn  = document.getElementById('askBtn');
  const dst     = document.getElementById('dstCheck');
  // === Credits confirmation modal logic ===
  let creditsApproved = false;
  const creditsModal   = document.getElementById('creditsModal');
  const creditsConfirm = document.getElementById('creditsConfirm');
  const creditsCancel  = document.getElementById('creditsCancel');
  const userCreditsEl  = document.getElementById('userCredits');

  async function getUserCredits(){
    try{
      // Try a global helper from astro-credits.js if available
      if (window.AstroCredits && typeof window.AstroCredits.getBalance === 'function'){
        const v = await window.AstroCredits.getBalance();
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }catch(_){}
    try{
      if (window.astroCredits && typeof window.astroCredits.balance === 'number') return window.astroCredits.balance;
      if (window.astroCredits && typeof window.astroCredits.getBalance === 'function'){
        const v = await window.astroCredits.getBalance();
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }catch(_){}
    try{
      const res = await callApi('credits-balance', {});
      const n = Number(res?.balance ?? res?.credits ?? res);
      if (Number.isFinite(n)) return n;
    }catch(_){}
    return null; // unknown
  }

  function openCreditsModal(){
    if (!creditsModal) return proceedAskFlow(); // fallback
    creditsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Load user credits asynchronously and update UI
    getUserCredits().then(n => {
      if (userCreditsEl){
        userCreditsEl.textContent = (n == null) ? '—' : String(n);
      }
    }).catch(()=>{
      if (userCreditsEl) userCreditsEl.textContent = '—';
    });
  }
  function closeCreditsModal(){
    if (!creditsModal) return;
    creditsModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (creditsModal){
    creditsModal.addEventListener('click', (e)=>{
      if (e.target && e.target.getAttribute('data-close') === 'true'){
        closeCreditsModal();
      }
    });
  }
  if (creditsCancel){
    creditsCancel.addEventListener('click', ()=>{
      closeCreditsModal();
    });
  }
  if (creditsConfirm){
    creditsConfirm.addEventListener('click', async ()=>{
      creditsApproved = true;
      closeCreditsModal();
      await proceedAskFlow();
    });
  }

  // === UI controls for loading/result and background video ===
  const bgVideo         = document.getElementById('bg-video');
  const scrimEl         = document.querySelector('.scrim');
  const mainStage       = document.querySelector('main.stage');
  const panelEl         = document.querySelector('.panel');
  const revealStageEl   = document.getElementById('revealStage');
  const resultStageEl   = document.getElementById('resultStage');
  const resultQEl       = document.getElementById('resultQuestion');
  const resultImgEl     = document.getElementById('resultNatalImg');
  const resultTextEl    = document.getElementById('resultText');
  const loadingOverlay  = document.getElementById('loadingOverlay');

  async function ensureVideoPlays(){
    try {
      if (bgVideo && bgVideo.paused) {
        await bgVideo.play();
      }
    } catch(e) {
      // ignore autoplay rejections; video might already be playing
      console.debug('[bg-video] play() blocked or not necessary:', e?.message || e);
    }
  }

  function pauseVideo(){
    try {
      if (bgVideo && !bgVideo.paused) {
        bgVideo.pause();
      }
    } catch(e){
      console.debug('[bg-video] pause() failed:', e?.message || e);
    }
  }

  function showGenerating(){
    // Keep background video visible and playing
    if (bgVideo) { bgVideo.style.display = ''; }
    ensureVideoPlays();

    // Hide everything else
    if (scrimEl)       scrimEl.style.display = 'none';
    if (mainStage)     mainStage.style.display = 'none';
    if (panelEl)       panelEl.classList.add('hidden');
    if (revealStageEl) revealStageEl.classList.add('hidden');
    if (resultStageEl) resultStageEl.classList.add('hidden');

    // Show loading overlay
    if (loadingOverlay) loadingOverlay.hidden = false;

    document.body?.setAttribute('aria-busy', 'true');

    const chatContainer = document.querySelector("#answersGPT");
if (chatContainer && !chatContainer.dataset.greeted) {
  const greetMsg = document.createElement("div");
  greetMsg.className = "bot-message";
  greetMsg.textContent = "Здравейте, аз съм вашият личен астролог. Може да ме питате всичко.";
  chatContainer.appendChild(greetMsg);
  chatContainer.dataset.greeted = "true"; // за да не се повтаря при всяко отваряне
}

  }

  function showResult(answer, chartUrl, question){
    // Hide loading overlay
    if (loadingOverlay) loadingOverlay.hidden = true;

    // Pause background video so it stays as a still background
    pauseVideo();
    if (bgVideo) bgVideo.style.display = '';

    // Show results (main structure visible, but keep form hidden)
    if (mainStage)     mainStage.style.display = '';
    if (panelEl)       panelEl.classList.add('hidden');
    if (revealStageEl) revealStageEl.classList.add('hidden');
    if (resultStageEl) resultStageEl.classList.remove('hidden');

    if (resultQEl)    resultQEl.textContent = question || '';
    if (resultImgEl) {
      resultImgEl.src = chartUrl || '';
      resultImgEl.removeAttribute('hidden');
      resultImgEl.alt = 'Natal Wheel Chart';
    // Persist report for the current user
    __saveHoraryReport(answer, chartUrl, question);
  }
    if (resultTextEl) resultTextEl.textContent = answer || '';

    document.body?.removeAttribute('aria-busy');
  }

  function restoreUIOnError(){
    if (loadingOverlay) loadingOverlay.hidden = true;
    if (mainStage)      mainStage.style.display = '';
    if (panelEl)        panelEl.classList.remove('hidden');
    if (revealStageEl)  revealStageEl.classList.add('hidden');
    if (resultStageEl)  resultStageEl.classList.add('hidden');

    // Resume background video for the home screen
    if (bgVideo) bgVideo.style.display = '';
    ensureVideoPlays();

    document.body?.removeAttribute('aria-busy');
  }
let cities = [];
  let selected = null;

  function updateAskDisabled(){
    askBtn.disabled = !(qText.value.trim() && selected);
  }

  // Transliterate while typing
  cityInp.addEventListener('input', () => {
    const cur = cityInp.value;
    const lat = toLatin(cur);
    if (lat !== cur) {
      cityInp.value = lat;
      try { cityInp.setSelectionRange(lat.length, lat.length); } catch {}
    }
  });

  // Search
  btnSrch.addEventListener('click', async () => {
    const q = cityInp.value.trim();
    if (!q) return;
    btnSrch.disabled = true;
    citySel.style.display = 'none';
    citySel.innerHTML = '';
    try {
      cities = await searchCity(q);
      if (!cities.length) { alert('Няма резултати'); return; }
      const ph = document.createElement('option');
      ph.value=''; ph.textContent='— избери град —'; ph.disabled = true; ph.selected = true;
      citySel.appendChild(ph);
      cities.forEach((c,i)=>{
        const o = document.createElement('option');
        o.value = i; o.textContent = c.complete_name; citySel.appendChild(o);
      });
      citySel.style.display = 'block';
      citySel.focus();
    } catch (e) {
      console.error(e);
      alert('Грешка при търсене: ' + (e.message || e));
    } finally {
      btnSrch.disabled = false;
    }
  });

  citySel.addEventListener('change', (e) => {
    selected = cities[+e.target.value] || null;
    if (selected?.complete_name) cityInp.value = selected.complete_name;
    updateAskDisabled();
  });

  // Потвърждаване на избора + затваряне на списъка
  function commitCitySelection() {
    if (citySel.value === '') return; // placeholder
    const idx = parseInt(citySel.value, 10);
    if (!Number.isFinite(idx) || !cities[idx]) return;
    selected = cities[idx];
    if (selected?.complete_name) cityInp.value = selected.complete_name;
    // затвори списъка и върни фокуса към инпута
    citySel.style.display = 'none';
    cityInp.focus();
    updateAskDisabled();
  }

  // Двоен клик върху опция -> избира и затваря
  citySel.addEventListener('dblclick', (e) => {
    commitCitySelection();
  });

  // Enter при фокусиран списък -> избира и затваря; Escape -> само затваря
  citySel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCitySelection();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      citySel.style.display = 'none';
      cityInp.focus();
    }
  });

  qText.addEventListener('input', updateAskDisabled);

  function buildContext(){
    if (!selected) return null;
    const now = new Date();
    return {
      question: qText.value.trim(),
      city: selected.complete_name,
      latitude: selected.latitude,
      longitude: selected.longitude,
      timezone: (selected.timezone_offset || 0) + (dst?.checked ? 1 : 0),
      asked_at_iso: now.toISOString()
    };
  }

  
  // === Western Payload helper ===
  function buildWesternPayload(sel, isDstChecked){
    if (!sel) return null;

    const tz = Number(sel.timezone_offset || 0) + (isDstChecked ? 1 : 0);

    // current date/time for chosen timezone
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const localMs = utcMs + tz * 3600000;
    const d = new Date(localMs);

    const payload = {
      year:    d.getUTCFullYear(),
      month:   d.getUTCMonth() + 1,
      date:    d.getUTCDate(),
      hours:   d.getUTCHours(),
      minutes: d.getUTCMinutes(),
      seconds: d.getUTCSeconds(),
      latitude:  Number(sel.latitude),
      longitude: Number(sel.longitude),
      timezone:  Number(tz),
      config: {
        observation_point: 'topocentric',  // 'geocentric' or 'topocentric'
        ayanamsha: 'tropical',              // 'tropical' | 'sayana' | 'lahiri'
        language: 'en'                      // 'en','te','es','fr','pt','ru','de','ja'
      }
    };
    return payload;
  }

  // === Call 3 Western endpoints & log ===
  async function callWesternApis(payload){
    console.groupCollapsed('%c[Western →] Payload', 'color:#a0f;font-weight:bold');
    console.log(payload);
    console.groupEnd();

    const [planets, houses, wheel] = await Promise.all([
  callApi('planets',           payload),
  callApi('houses',            payload),
  callApi('natal-wheel-chart', payload),
]);

    console.group('%c[Western ←] Responses', 'color:#0bf;font-weight:bold');
    console.log('Planets:', planets);
    console.log('Houses:', houses);
    console.log('Natal Wheel Chart:', wheel);
    console.groupEnd();

    planetsNow=planets;
    housesNow=houses;

    console.log(planetsNow);
    console.log(housesNow);
/* === ⬇️ Injected astro logic (from old.js) — planets → house/sign + aspects === */

// --- Helpers from old.js (guarded once) ---
;(function(){
  if (window._astroUtilsInjected) return;
  window._astroUtilsInjected = true;

  // Bulgarian names
  window.planets_BG = window.planets_BG || {
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
    "True Node": "Северен възел",
    "NorthNode": "Северен възел"
  };
  window.signs_BG = window.signs_BG || {
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
    "Pisces": "Риби"
  };

  // houseOf (supports wrap-around 360→0)
  window.houseOf = function(planetDeg, housesArr) {
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
  };

  // Aspect definitions & helpers (from old.js)
  const ASPECTS = [
    { name:"Conjunction", angle:0,   orb:5, sunMoonOrb:8 },
    { name:"Semi‑sextile", angle:30, orb:1, sunMoonOrb:2 },
    { name:"Decile", angle:36, orb:1, sunMoonOrb:1 },
    { name:"Nonagon", angle:40, orb:2, sunMoonOrb:2 },
    { name:"Semi‑square", angle:45, orb:1, sunMoonOrb:1.5 },
    { name:"Sextile", angle:60, orb:5, sunMoonOrb:8 },
    { name:"Quintile", angle:72, orb:2, sunMoonOrb:2 },
    { name:"Bino­nonagon", angle:80, orb:1, sunMoonOrb:1 },
    { name:"Square", angle:90, orb:5, sunMoonOrb:8 },
    { name:"Senta­gon", angle:100, orb:1.5, sunMoonOrb:1.5 },
    { name:"Tridecile", angle:108, orb:1.5, sunMoonOrb:2 },
    { name:"Trine", angle:120, orb:5, sunMoonOrb:8 },
    { name:"Sesqui‑square", angle:135, orb:2, sunMoonOrb:3 },
    { name:"Bi‑quintile", angle:144, orb:1, sunMoonOrb:1 },
    { name:"Quincunx", angle:150, orb:3, sunMoonOrb:4 },
    { name:"Opposition", angle:180, orb:5, sunMoonOrb:7 },
    { name:"Semi‑nonagon", angle:20, orb:0.5, sunMoonOrb:0.5 }
  ];
  const norm = deg => ((deg % 360) + 360) % 360;
  const angularDist = (a, b) => {
    const d = Math.abs(norm(a) - norm(b));
    return d > 180 ? 360 - d : d;
  };
  const orbFor = (asp, p1, p2) => {
    const isLum = n => n === "Sun" || n === "Moon";
    return isLum(p1) || isLum(p2) ? (asp.sunMoonOrb ?? asp.orb) : asp.orb;
  };
  window._ASPECTS = ASPECTS; // expose for debugging

  window.matchAspect = function(p1, p2){
    const diff = angularDist(p1.deg, p2.deg);
    for (const asp of ASPECTS) {
      const delta = Math.abs(diff - asp.angle);
      if (delta <= orbFor(asp, p1.name, p2.name)) return { aspect: asp, delta, exactDiff: diff };
    }
    return null;
  };

  window.aspectsBetween = function(arr){
    const hits = [];
    for (let i=0;i<arr.length;i++){
      for (let j=i+1;j<arr.length;j++){
        const res = matchAspect(arr[i], arr[j]);
        if (res) hits.push({ p1: arr[i].name, p2: arr[j].name, aspect: res.aspect.name, exactDiff: res.exactDiff, delta: res.delta });
      }
    }
    return hits;
  };

  window.getMajorAspects = function(planetsRaw){
    const MAJOR = ["Conjunction","Sextile","Square","Trine","Opposition"];
    const arr = normalizePlanets(planetsRaw);
    const allHits = aspectsBetween(arr);
    return allHits.filter(a=>MAJOR.includes(a.aspect))
                  .reduce((acc,a)=>{ acc[`${a.p1}-${a.p2}`]=a.aspect; return acc; },{});
  };

  window.normalizePlanets = function(planetsRaw){
    if (!planetsRaw) return [];
    const list = Array.isArray(planetsRaw?.output) ? planetsRaw.output
                : planetsRaw?.output?.Planets || planetsRaw?.Planets || [];
    return list
      .filter(p => p && p.planet && p.fullDegree != null)
      .map(p => ({ name: p.planet.en, deg: (+p.fullDegree) }));
  };

})(); // end once-guard

// --- Build houses array from housesNow ---
const sanitizeDeg = v => typeof v === "number"
  ? v
  : parseFloat(String(v).replace(",", ".").replace(/[^\d.+-]/g, "")) || null;

const _housesRaw = (housesNow && housesNow.output && housesNow.output.Houses) || [];
const housesArr = _housesRaw.map((h, i) => ({
  house: i + 1,
  deg: sanitizeDeg(h.degree ?? h.cusp ?? h.fullDegree)
}));

// --- Build planets list from planetsNow ---
const _planetsRaw = Array.isArray(planetsNow?.output)
  ? planetsNow.output
  : planetsNow?.output?.Planets || planetsNow?.Planets || [];

const planetsArrNow = _planetsRaw
  .filter(p => p && p.planet) // keep real planets
  .map(p => ({
    nameEn: p.planet.en,
    nameBg: window.planets_BG[p.planet.en] || p.planet.en,
    signEn: p.zodiac_sign?.name?.en ?? p.zodiac_sign?.en ?? p.sign,
    signBg: window.signs_BG[p.zodiac_sign?.name?.en ?? p.zodiac_sign?.en ?? p.sign] || (p.zodiac_sign?.name?.en ?? p.zodiac_sign?.en ?? p.sign),
    deg: sanitizeDeg(p.fullDegree ?? p.degree)
  }));

// --- Compose requested object: { "Sun": { name:"Слънце", house:5, sign:"Рак" }, ... } ---
const planetMapBG = planetsArrNow.reduce((acc, pl) => {
  const houseNum = typeof window.houseOf === "function" ? window.houseOf(pl.deg, housesArr) : null;
  acc[pl.nameEn] = { name: pl.nameBg, house: houseNum, sign: pl.signBg };
  return acc;
}, {});

// --- Compute aspects between current-sky planets ---
const aspectsInput = planetsArrNow.map(p => ({ name: p.nameEn, deg: p.deg }));
const aspectsAll   = typeof window.aspectsBetween === "function" ? window.aspectsBetween(aspectsInput) : [];

// Expose and log
window.planetMapBG = planetMapBG;
window.aspectsNow  = aspectsAll;

//console.log('%c[planetMapBG]', 'color:#b58cff;font-weight:bold', planetMapBG);
//console.table(Object.entries(planetMapBG).map(([k,v]) => ({ Planet:k, Name:v.name, House:v.house, Sign:v.sign })));

//console.log('%c[aspectsNow]', 'color:#8fbf00;font-weight:bold', aspectsAll);
//console.table(aspectsAll.map(x => ({ A:x.p1, Aspect:x.aspect, B:x.p2, 'Δ°': x.exactDiff, '±orb': x.delta })));

/* === ⬆️ End injected astro logic === */

return { planets, houses, wheel };
  }

  

  // === Main: „ЗАДАЙ ВЪПРОС“ ===
  
  async function proceedAskFlow(){
    try{ event?.preventDefault?.(); event?.stopPropagation?.(); }catch(_){/* noop */}
    if (askBtn.disabled) return;
        const q = qText.value.trim();
        if (!q || !selected) { alert('Въведи въпрос и избери град от списъка.'); return; }
    
        
        
        showGenerating();
    // During generation: hide all and show global 'ГЕНЕРИРАНЕ...'
        showGenerating();
    const ctx = buildContext();
        console.group('%c[GPT-5 REQUEST]', 'color:#9cf;font-weight:bold');
        console.log('Payload:', ctx);
        console.log('POST /api/ask', { question: q });
        console.groupEnd();
    
        // --- Western API calls ---
        
        try {
          const westernPayload = buildWesternPayload(selected, !!dst?.checked);
          if (westernPayload) { await callWesternApis(westernPayload); }
        } catch (e) {
          console.group('%c[Western ERROR]', 'color:#f55;font-weight:bold');
          console.error(e);
          console.groupEnd();
        }
    
        let planets = '';
        for (let pl in planetMapBG) {
          let text=`${planetMapBG[pl].name} е в ${planetMapBG[pl].sign} в ${planetMapBG[pl].house} дом. `
          planets+=text;
        }
    
        let aspects = '';
        for (let asp of aspectsNow) {
          let text = `${asp.p1} ${asp.aspect} ${asp.p2} - ${asp.exactDiff}.`;
          aspects+=text;
        }
    
        let prompt=`Отговори на следният хорарен въпрос: ${q}.Към момента на задаване на въпроса планетите, купсидите на домовете имат следният вид планети - ${planets} и аспекти ${aspects}.`;
        console.log(prompt)
        askBtn.disabled = true;
        try {
          // Пробвай /api/ask, после /api/chat за съвместимост
          let data;
          try {
            data = await callApi('ask', { question: prompt });
          } catch (e) {
            // ако /api/ask липсва, опитай /api/chat
            data = await callApi('chat', { question: prompt });
          }
          console.group('%c[GPT-5 RESPONSE]', 'color:#8f8;font-weight:bold');
          showResult(
            data?.answer ?? '',
            'https://western-astrology.s3.ap-south-1.amazonaws.com/Chart_1756406511212.svg',
            q
          );
          console.log(data);
          console.log('Answer:', data?.answer ?? '(празен отговор)');
          console.groupEnd();
        } catch (e) {
          console.group('%c[GPT-5 ERROR]', 'color:#f88;font-weight:bold');
          console.error(e);
          console.groupEnd();
          restoreUIOnError();
          alert('Грешка при заявката: ' + (e.message || e));
        } finally {
          askBtn.disabled = false;
        }
  }

  askBtn.addEventListener('click', async (e) => {
    e?.preventDefault?.();
    if (askBtn.disabled) return;
    // Wait for astro-credits gate to confirm and set flag
    if (!window.__acBypassOnce){
      return; // gate will re-dispatch click when ready
    }
    window.__acBypassOnce = false;
    await proceedAskFlow();
  });
})();/* CHATBOT WIDGET */

;(function(){
  const root   = document.getElementById('chatbot');
  if (!root) return;
  const toggle = document.getElementById('chatbotToggle');
  const win    = document.getElementById('chatbotWindow');
  const log    = document.getElementById('chatLog');
  const form   = document.getElementById('chatForm');
  const input  = document.getElementById('chatInput');
  const send   = document.getElementById('chatSendBtn');

  function append(type, text){
    const div = document.createElement('div');
    div.className = 'msg ' + type;
    div.textContent = String(text || '');
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function openChat(){
    root.classList.add('open');
    win.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    setTimeout(()=> input?.focus(), 50);
  }
  function closeChat(){
    root.classList.remove('open');
    win.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle?.addEventListener('click', () => {
    if (root.classList.contains('open')) closeChat();
    else openChat();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = (input?.value || '').trim();
    if (!msg){ input?.focus(); return; }
    append('user', msg);
    input.value = '';
    send.disabled = true;
    try{
      // Prefer /api/chat with {message}; fall back to /api/ask {question}
      let data;
      try {
        data = await callApi('chat', { message: msg });
      } catch (e) {
        data = await callApi('ask', { question: msg });
      }
      const reply = data?.reply || data?.answer || '(празен отговор)';
      append('bot', reply);
    } catch(err){
      append('bot', 'Грешка при заявката: ' + (err?.message || err));
    } finally {
      send.disabled = false;
    }
  });
})();

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
