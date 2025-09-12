
/** Robust redirect to natal.html, working under subpaths too */
function __goToNatal(){
  try {
    const base = document.baseURI || window.location.href;
    const url = new URL('natal.html', base).href;
    window.location.href = url;
    return;
  } catch(_){}
  try { window.location.assign('natal.html'); } catch(_) {}
}


// Ensure profileMenu is at <body> level to avoid header stacking context issues
(function(){
  function relocateProfileMenu(){
    try{
      var menu = document.getElementById('profileMenu');
      if (menu && menu.parentElement && menu.parentElement !== document.body){
        document.body.appendChild(menu);
        menu.style.position = 'fixed';
      }
    }catch(_){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', relocateProfileMenu, {once:true});
  } else {
    relocateProfileMenu();
  }
})();

console.info('[AstroMatch] build 1756031912: cityDropdow active');
console.info('[AstroMatch] began.js build: 2025-08-24 10:13:20');

/* Ensure began.css is loaded (cache-busted if needed) */
function ensureBeganCssLoaded(){
  return new Promise((resolve) => {
    try{
      const hrefMatch = (lnk)=> lnk && lnk.href && /began\.css(\?|$)/.test(lnk.getAttribute("href")||lnk.href);
      let linkEl = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(hrefMatch);
      if (!linkEl){
        linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        linkEl.href = "began.css?v=" + Date.now();
        linkEl.onload = () => resolve(true);
        linkEl.onerror = () => resolve(false);
        document.head.appendChild(linkEl);
      } else {
        // nudge cache: add a version param (without duplicating)
        const url = new URL(linkEl.href, window.location.origin);
        url.searchParams.set("v", Date.now());
        linkEl.href = url.toString();
        linkEl.onload = () => resolve(true);
        // if already loaded, resolve soon
        setTimeout(()=>resolve(true), 0);
      }
    }catch(_){ resolve(false); }
  });
}

import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup, GoogleAuthProvider, FacebookAuthProvider, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp, collection, getDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
/* ===== Astro Credits helpers ===== */
async function ensureAndLoadCredits(user){
  try{
    if (!user) return 0;
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    let credits = 0;
    if (!snap.exists()){
      await setDoc(userRef, { credits: 100, createdAt: serverTimestamp() }, { merge: true });
      credits = 100;
    } else {
      credits = Number(snap.data()?.credits ?? 0);
      if (!credits){
        await setDoc(userRef, { credits: 100 }, { merge: true });
        credits = 100;
      }
    }
    window.__astroCredits = credits;
    const el = document.getElementById('pmCredits');
    if (el) el.textContent = String(credits);
    return credits;
  }catch(err){
    console.warn('[credits] failed:', err);
    return 0;
  }
}

function setCreditsUI(value){
  window.__astroCredits = Number(value) || 0;
  const el = document.getElementById('pmCredits');
  if (el) el.textContent = String(window.__astroCredits);
}

// Helper: delete all user data (same as in profile.js)
async function deleteUserData(db, uid){
  const userRef = doc(db, "users", uid);
  const subcols = ["profiles", "user"];
  for (const name of subcols){
    try{
      const snap = await getDocs(collection(userRef, name));
      for (const d of snap.docs){
        try{ await deleteDoc(d.ref); }catch(e){ console.warn("Неуспешно изтриване на", name, d.id, e); }
      }
    }catch(e){ console.warn("Неуспешно четене на подколекция", name, e); }
  }
  try{ await deleteDoc(userRef); }catch(e){ console.warn("Неуспешно изтриване на users/"+uid, e); }
}
// Ensure user has a recent login for sensitive operations (delete, password/email change)
async function ensureRecentLogin(u){
  try{
    const providerIds = (u?.providerData || []).map(p=>p.providerId);
    // Prefer the first linked provider
    const primary = providerIds[0] || u?.providerId || null;

    // Email/password
    if (primary === "password" || (!primary && u?.email)){
      const pwd = prompt("За да продължите, въведете паролата си за потвърждение:");
      if (!pwd) throw new Error("Операцията е прекъсната.");
      const cred = EmailAuthProvider.credential(u.email, pwd);
      await reauthenticateWithCredential(u, cred);
      return true;
    }

    // Google
    if (primary === "google.com"){
      await reauthenticateWithPopup(u, new GoogleAuthProvider());
      return true;
    }

    // Facebook
    if (primary === "facebook.com"){
      await reauthenticateWithPopup(u, new FacebookAuthProvider());
      return true;
    }

    // Fallback: try Google popup if nothing else known
    await reauthenticateWithPopup(u, new GoogleAuthProvider());
    return true;
  }catch(e){
    console.warn("Ре-автентикация неуспешна:", e);
    alert("Трябва да потвърдите самоличността си преди изтриване на акаунта.");
    return false;
  }
}

/* Safe shim: ensure dropdown can be positioned even if positionCityDropdown is scoped elsewhere */
function _safePositionCityDropdown(){
  try{
    if (typeof positionCityDropdown === 'function'){ positionCityDropdown(); return; }
    // Fallback inline positioning
    try{
      const searchRow = document.querySelector(".search-row");
      if (!searchRow || (typeof dd === 'undefined')) return;
      const top = (searchRow.offsetHeight || 0) + 8;
      dd.style.top = top + "px";
      dd.style.left = '0px'; dd.style.right = 'auto'; }catch(_){}
  }catch(_){}
}

/* Fullscreen loading overlay with video */
function showLoading(show){
  try{
    let ov = document.getElementById('loadingOverlay');
    if (show){
      if (!ov){
        ov = document.createElement('div');
        ov.id = 'loadingOverlay';
        // Create video element and set attributes
        const v = document.createElement('video');
        v.src = '/videos/loading.mp4';
        v.autoplay = true;
        v.loop = true;
        v.muted = true;
        try {
    console.log('[NOW] Sending API calls: planets & natal-wheel-chart'); v.playsInline = true; } catch(_) {}
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        // Style overlay to cover the whole screen and center contents
        Object.assign(ov.style, {
          position: 'fixed',
          inset: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          zIndex: '999999'
        });
        // Style video to fill the viewport and stay centered
        Object.assign(v.style, {
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
          outline: 'none',
          maxWidth: 'none',
          maxHeight: 'none'
        });
        ov.appendChild(v);
        document.body.appendChild(ov);
      }
      ov.style.display = 'flex';
      try{ ov.querySelector('video')?.play?.(); }catch(_){}
    } else {
      if (ov) ov.style.display = 'none';
    }
      }catch(_){}
}
/* =========================
   Dictionaries (BG labels)
   ========================= */
const planets_BG = {
  "Sun": "Слънце", "Moon": "Луна", "Mercury": "Меркурий",
  "Venus": "Венера", "Mars": "Марс", "Jupiter": "Юпитер",
  "Saturn": "Сатурн", "Uranus": "Уран", "Neptune": "Нептун",
  "Pluto": "Плутон", "Chiron": "Хирон", "Lilith": "Лилит",
  "True Node": "Северен възел"
};
const signs_BG = {
  "Aries":"Овен","Taurus":"Телец","Gemini":"Близнаци","Cancer":"Рак",
  "Leo":"Лъв","Virgo":"Дева","Libra":"Везни","Scorpio":"Скорпион",
  "Sagittarius":"Стрелец","Capricorn":"Козирог","Aquarius":"Водолей","Pisces":"Риби"
};

/* === Placements (third column) helpers === */
const ORDER_EN = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","True Node"];
function getPlacementsFromMyData(){
  try{ if (window["MY DATA"] && window["MY DATA"].placements && typeof window["MY DATA"].placements === "object") return window["MY DATA"].placements; }catch(_){}
  try{ if (window.MY_DATA && window.MY_DATA.placements && typeof window.MY_DATA.placements === "object") return window.MY_DATA.placements; }catch(_){}
  try{ if (window.__planetsHousesBG && typeof window.__planetsHousesBG === "object") return window.__planetsHousesBG; }catch(_){}
  return null;
}
function findPlacementItem(placements, enName){
  if (!placements) return null;
  if (placements[enName]) return placements[enName];
  try{
    const bg = planets_BG?.[enName];
    if (bg){
      const key = Object.keys(placements).find(k => (k===bg) || (placements[k]?.name===bg));
      if (key) return placements[key];
    }
  }catch(_){}
  const norm = s => String(s||"").toLowerCase().replace(/\s+/g,"").trim();
  const want = norm(enName);
  for (const [k,v] of Object.entries(placements)){
    if (norm(k)===want || norm(v?.name)===norm(planets_BG?.[enName]||"")) return v;
  }
  return null;
}
function renderPlacementsList(container, placements){
  if (!container) return;
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "md-placements-title";
  title.textContent = "Планети в знаци и домове";
  container.appendChild(title);

  const listWrap = document.createElement("div");
  listWrap.setAttribute("role","list");
  container.appendChild(listWrap);

  let idx = 0;
  const ORDER = (typeof ORDER_EN !== "undefined" && Array.isArray(ORDER_EN))
    ? ORDER_EN
    : ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","True Node"];

  ORDER.forEach((enName) => {
    const it = findPlacementItem(placements, enName);
    if (!it) return;

    const row = document.createElement("div");
    row.className = "md-pl-row zoom";
    row.style.setProperty("--delay", (idx*0.08).toFixed(2) + "s");

    // PLANET: <video> ако е .mp4, иначе <img>
    let mediaP;
    if (/\.mp4(\?|$)/i.test(String(it.planetImg||""))){
      const v = document.createElement("video");
      v.src = it.planetImg || "";
      v.muted = true; v.autoplay = true; v.loop = true;
      try { v.playsInline = true; } catch(_){}
      v.setAttribute("preload","metadata");
      v.setAttribute("aria-label", it.name || enName);
      v.classList.add("md-pl-planet");
      mediaP = v;
    } else {
      const img = document.createElement("img");
      img.src = it.planetImg || "";
      img.alt = it.name || enName;
      img.classList.add("md-pl-planet");
      mediaP = img;
    }

    const name = document.createElement("span");
    name.textContent = it.name || (planets_BG?.[enName] || enName);

    const sep1 = document.createElement("span");
    sep1.textContent = "в";
    sep1.className = "md-pl-sep";

    const imgS = document.createElement("img");
    imgS.src = it.signImg || "";
    imgS.alt = it.sign || "";

    const sign = document.createElement("span");
    sign.textContent = it.sign || "";

    const sep2 = document.createElement("span");
    sep2.textContent = "в";
    sep2.className = "md-pl-sep";

    const houseWrap = document.createElement("span");
    houseWrap.className = "md-pl-house";

    const imgH = document.createElement("img");
    imgH.src = it.houseImg || "";
    imgH.alt = (it.house ? (it.house + " дом") : "дом");

    const dom = document.createElement("span");
    dom.textContent = "дом";
    dom.title = it.house ? String(it.house) : "";

    houseWrap.appendChild(imgH);
    houseWrap.appendChild(dom);

    row.appendChild(mediaP);
    row.appendChild(name);
    row.appendChild(sep1);
    row.appendChild(imgS);
    row.appendChild(sign);
    row.appendChild(sep2);
    row.appendChild(houseWrap);

    listWrap.appendChild(row);
    idx += 1;
  });

  // Бутон долу вдясно
  const more = document.createElement("div");
  more.className = "md-more";
  const btnMore = document.createElement("button");
  btnMore.type = "button";
  btnMore.className = "md-more-btn";
  btnMore.textContent = "Разбери повече";
  btnMore.addEventListener('click', (ev) => { try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){} __goToNatal(); });
  more.appendChild(btnMore);
  container.appendChild(more);
}

/* =========================
   API proxy (server.js)
   ========================= */
const GEO_DETAILS = "/api/geo-details"; // kept for clarity

/* 👉 Помощна функция: POST към /api/* и връща JSON */
async function callApi(endpoint, body){
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body||{})
  });
  if (!res.ok){
    const txt = await res.text().catch(()=>String(res.status));
    throw new Error(`[${endpoint}] HTTP ${res.status}: ${txt}`);
  }
  // natal-wheel-chart връща JSON в нашия proxy
  return res.json();
}

/* =========================
   Utilities
   ========================= */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const toNum = (v) => (v==null || v==="") ? null : Number(v);

function parseTimezone(v){
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s0 = String(v).trim();
  const s  = s0.replace(/^(?:UTC|GMT)\s*/i, '');
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
const titleCase = (s="") => s.toLowerCase().replace(/\b\w/g, m=>m.toUpperCase());
function formatCity(item){ return [item.name, item.state, item.country].filter(Boolean).join(", "); }

/* Default embedded avatar (SVG) to avoid 404s */
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect fill='%23e5e7eb' width='100%25' height='100%25'/><circle cx='128' cy='96' r='56' fill='%239ca3af'/><rect x='56' y='164' width='144' height='64' rx='32' fill='%239ca3af'/></svg>";

/* Safe avatar setter: tries URL and falls back */
function setAvatar(url){
  const el = $("#profilePic");
  if (!el) return;
  if (!url){ el.style.backgroundImage = `url("${DEFAULT_AVATAR}")`; return; }
  const img = new Image();
  img.onload  = () => { el.style.backgroundImage = `url("${url}")`; };
  img.onerror = () => { el.style.backgroundImage = `url("${DEFAULT_AVATAR}")`; };
  img.src = url;
}
/* Кирилица → Латиница (за удобство при търсене на градове) */
function cyrToLat(input=""){
  const map = {'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sht','Ъ':'A','Ь':'','Ю':'Yu','Я':'Ya',
               'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'','ю':'yu','я':'ya'};
  return String(input).split('').map(ch => map[ch] ?? ch).join('');
}

/* Нормализиране на резултати от geo-details */
function normalizeGeoList(payload){
  if (payload?.locations) payload = payload.locations;
  if (payload?.list) payload = payload.list;
  if (payload?.items) payload = payload.items;
  if (payload?.data?.cities) payload = payload.data.cities;
  const raw = Array.isArray(payload) ? payload : (payload?.results || payload?.data || payload?.geonames || []);
  return (raw || []).map((it)=>{
    const name = it.name || it.city || it.place || it.town || "";
    const state = it.state || it.admin || it.adminName || it.adminName1 || "";
    const country = it.country || it.countryName || "";
    const lat = toNum(it.latitude ?? it.lat);
    const lon = toNum(it.longitude ?? it.lng ?? it.lon);
    const tzOffset = toNum(it.timezone_offset ?? it.gmtOffset ?? it.gmt_offset ?? it.utcOffset ?? it.offset) ?? 0;
    return {
      id: [name,state,country,lat,lon].filter(Boolean).join("|"),
      name: titleCase(name), state: titleCase(state), country: titleCase(country),
      latitude: lat, longitude: lon, timezone_offset: tzOffset,
      complete_name: [titleCase(name), titleCase(state), titleCase(country)].filter(Boolean).join(", ")
    };
  }).filter(x => x.name && x.country && x.latitude!=null && x.longitude!=null);
}

/* =========================
   Profile Menu (built + gated by allowMenu)
   ========================= */
let allowMenu = false;

function ensureProfileMenu(){
  const menu = $("#profileMenu");
  if (!menu) return null;
  if (!menu.dataset.built){
    menu.dataset.built = "true";
    menu.classList.add("pmenu");
    menu.innerHTML = `
      <div class="pmenu-arrow"></div>
      <ul class="pmenu-list" role="menu" aria-label="Профилно меню">
        <li id="menuCreditsRow" class="pmenu-item credits-row" role="menuitem" tabindex="-1" aria-disabled="true" style="cursor: default;">
          <span id="pmCredits" class="credits-amount">0</span>
          <img class="pmenu-icon" src="/images/icons/zodiac_circle_money.png" alt="" />
          <span class="pmenu-label">Astro кредита</span>
        </li>
        <div class="pmenu-sep" aria-hidden="true"></div>

        <li id="menuMyData" class="pmenu-item" role="menuitem" tabindex="0">
          <img class="pmenu-icon" src="/images/icons/sun.webp" alt="" />
          <span class="pmenu-label">Моите данни</span>
        </li>
        <li id="menuSaved" class="pmenu-item" role="menuitem" tabindex="0">
          <img class="pmenu-icon" src="/images/icons/moon.webp" alt="" />
          <span class="pmenu-label">Запазени данни</span>
        </li>
        <li id="menuAstroProfile" class="pmenu-item" role="menuitem" tabindex="0">
          <img class="pmenu-icon" src="/images/icons/venus.webp" alt="" />
          <span class="pmenu-label">AstroMatch профил</span>
        </li>
        <div class="pmenu-sep" aria-hidden="true"></div>
        <li id="menuLogout" class="pmenu-item" role="menuitem" tabindex="0">
          <img class="pmenu-icon" src="/images/icons/exit.webp" alt="" />
          <span class="pmenu-label">Изход</span>
        </li>
        <li id="menuDelete" class="pmenu-item danger" role="menuitem" tabindex="0">
          <img class="pmenu-icon" src="/images/icons/trash.webp" alt="" />
          <span class="pmenu-label">Изтрий профил</span>
        </li>
      </ul>`;
    // Sync credits text if preloaded
    try{ 
      const c = (window.__astroCredits != null) ? window.__astroCredits : 0;
      const ce = document.getElementById('pmCredits');
      if (ce) ce.textContent = String(c);
    }catch(_){}


    // Ripple effect
    menu.addEventListener("click", (e) => {
      const it = e.target.closest(".pmenu-item");
      if (!it) return;
      const r = document.createElement("span");
      r.className = "pmenu-ripple";
      const rect = it.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + "px";
      r.style.left = (e.clientX - rect.left - size/2) + "px";
      r.style.top  = (e.clientY - rect.top  - size/2) + "px";
      it.appendChild(r);
      setTimeout(() => r.remove(), 460);
    }, { passive:true });

    // Actions
    const go = (u) => { try { window.location.href = u; } catch(_){} };

    
// Guard: neutralize default anchor navigation for #menuMyData
(() => {
  const el = $("#menuMyData");
  if (!el) return;
  try {
    const tag = (el.tagName||"").toUpperCase();
    if (tag === "A") {
      el.setAttribute("data-orig-href", el.getAttribute("href") || "");
      el.setAttribute("href", "javascript:void(0)");
      el.removeAttribute("target");
    }
  } catch(_) {}
})();

$("#menuMyData")?.addEventListener("click", async (e) => { e?.preventDefault?.(); e?.stopPropagation?.();
      if (typeof allowMenu !== "undefined" && !allowMenu) return;
      try { if (typeof hideProfileMenu === "function") hideProfileMenu(); } catch(_) {}
      try { await renderMyDataUI(); } catch (e) {
        console.warn("[MyData] render failed, fallback to profile page:", e);
        
      }
    });
    $("#menuSaved")?.addEventListener("click", async (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); if (!allowMenu) return; try { hideProfileMenu(); } catch(_){} try { await renderProfilesModal(); } catch(err){ console.error(err); } });
    $("#menuAstroProfile")?.addEventListener("click", () => { if (allowMenu) go("undercons.html"); });

    $("#menuLogout")?.addEventListener("click", async () => {
      if (!allowMenu) return;
      try { await signOut(auth); } catch(_){}
      try { sessionStorage.setItem("skipAutoLogin","1"); } catch(_){}
      go("index.html?logout=1");
    });

    $("#menuDelete")?.addEventListener("click", async () => {
  if (typeof allowMenu !== "undefined" && !allowMenu) return;
  const u = auth.currentUser;
  if (!u) return alert("Няма вписан потребител");
  if (!confirm("Ще изтриете и акаунта, и всички данни. Сигурни ли сте?")) return;

  try {
    // 1) Ensure recent login BEFORE destructive ops
    const ok = await ensureRecentLogin(u);
    if (!ok) return;

    // 2) Delete Firestore user data (still authenticated)
    await deleteUserData(db, u.uid);

    // 3) Delete Auth user
    try{
      await deleteUser(u);
    }catch(err){
      // If session aged meanwhile, reauth once more and retry
      if (err && (err.code === "auth/requires-recent-login" || /requires-recent-login/.test(err.message||""))) {
        const ok2 = await ensureRecentLogin(u);
        if (ok2) await deleteUser(u);
      } else {
        throw err;
      }
    }

    alert("Потребителят и всички данни са изтрити");
    location.replace("index.html");
  } catch (err) {
    console.error(err);
    alert("Грешка: " + (err?.message || err));
  }
});}
  return menu;
}
function positionProfileMenu(){
  const avatar = $("#profilePic");
  const menu   = $("#profileMenu");
  if (!avatar || !menu) return;
  const rect = avatar.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - menu.offsetWidth - 8);
  const left = Math.min(maxLeft, Math.max(8, rect.left));
  menu.style.left = Math.round(left) + "px";
  menu.style.top  = Math.round(rect.bottom + 8) + "px";
}
function showProfileMenu(){
  if (typeof allowMenu !== 'undefined' && !allowMenu) return;

    try{
    var p = (location && (location.pathname||'')) || '';
    if (/loading\.html$/i.test(p) || p.toLowerCase().endswith('/loading.html')) return;
  }catch(_){/* no-op */}
try{ if (auth?.currentUser) ensureAndLoadCredits(auth.currentUser); }catch(_){}
const menu = ensureProfileMenu();
  if (!menu) return;
  menu.classList.remove("hidden");
  positionProfileMenu();
  menu.classList.add("open");
}
function hideProfileMenu(){ $("#profileMenu")?.classList.remove("open"); }
function toggleProfileMenu(){
  if (!allowMenu) return; // gate
  const menu = ensureProfileMenu();
  if (!menu) return;
  const isOpen = menu.classList.contains("open") && menu.style.visibility !== "hidden";
  if (isOpen) hideProfileMenu(); else { try{ if (auth?.currentUser) ensureAndLoadCredits(auth.currentUser); }catch(_){} showProfileMenu(); }
}

window.addEventListener("resize", positionProfileMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideProfileMenu(); });
document.addEventListener("click", (e) => {
  const menu   = $("#profileMenu");
  const avatar = $("#profilePic");
  if (!menu || !menu.classList.contains("open")) return;
  if (menu.contains(e.target) || e.target === avatar) return;
  hideProfileMenu();
});

/* =========================
   Blur helpers
   ========================= */
function applyBlur2px(on=true){
  try{
    const avatar = $("#profilePic");
    if (avatar) avatar.style.filter = on ? "blur(2px)" : "none";
    let ov = document.getElementById("bgBlurOverlay");
    if (!ov){
      ov = document.createElement("div");
      ov.id = "bgBlurOverlay";
      ov.style.position = "fixed";
      ov.style.inset = "0";
      ov.style.backdropFilter = "blur(2px)";
      ov.style.webkitBackdropFilter = "blur(2px)";
      ov.style.pointerEvents = "none";
      ov.style.zIndex = "4"; // modal content uses default stacking; overlay stays beneath
      document.body.prepend(ov);
    }
    ov.style.display = on ? "block" : "none";
  }catch(_){}
}

/* =========================
   Wizard (modal flow)
   ========================= */
let cities = [];

function startWizard(modalContent){
  if (!modalContent) return;
  // Скриваме текущото съдържание; ще го върнем при exitWizard()
  const hidden = [];
  [...modalContent.children].forEach(el => { hidden.push([el, el.style.display]); el.style.display = "none"; });

  const wizard = document.createElement("div");
  wizard.className = "wizard";
  wizard.innerHTML = `
    <div class="wizard-header" id="wizTitle">Кога сте родени?</div>

    <div class="wizard-step active" data-step="date">
      <div class="wizard-field">
        <input id="birthDate" type="date" aria-label="Дата на раждане" required/>
      </div>
    </div>

    <div class="wizard-step" data-step="time">
      <div class="wizard-field">
        <input id="birthTime" type="time" step="60" aria-label="Час на раждане" required/>
      </div>
    </div>

    <div class="wizard-step" data-step="dst">
      <label class="wizard-checkbox">
        <input id="dst" type="checkbox" aria-label="Било ли е лятно часово време?"/> лятно часово време
      </label>
    </div>

    <div class="wizard-step" data-step="place">
      <div class="search-row">
        <input id="placeInput" type="text" inputmode="latin" placeholder="Place of birth (Latin)" aria-label="Място на раждане (латиница)"/>
        <button class="search-btn" id="searchBtn" aria-label="Търси град">ТЪРСИ</button>
      </div>
      <div class="dropdown cityDropdow" id="cityDropdow" hidden>
        <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="label">избери град</span>
          <span class="chev">▾</span>
        </button>
        <div class="dropdown-menu" role="listbox"></div>
      </div>
    </div>

    <div class="wizard-actions">
      <button class="nav-btn nav-back" id="btnBack" title="Назад"><img src="images/marsBack.svg" alt="Назад"/></button>
      <button class="nav-btn nav-next" id="btnNext" title="Напред"><img src="images/venusNext.svg" alt="Напред"/></button>
    </div>
  `;
  modalContent.appendChild(wizard);

  function exitWizard(){
    try{
      wizard.remove();
      hidden.forEach(([el,display]) => el.style.display = display || "");
    }catch(_){}
  }

  const steps   = $$(".wizard-step", wizard);
  const title   = $("#wizTitle", wizard);
  const btnBack = $("#btnBack", wizard);
  const btnNext = $("#btnNext", wizard);
  const titles  = ["Кога сте родени?", "В колко часа сте родени?", "Било ли е лятно часово време?", "Къде сте родени?"];

  const state = { idx:0, date:null, time:null, dst:false, city:null };
  try{ console.info('[PATCH 2025-08-23] cityDropdown align active'); }catch(_){}

  function showStep(i){
    state.idx = i;
    steps.forEach((s,ix) => s.classList.toggle("active", ix===i));
    title.textContent = titles[i];
    btnBack.disabled = false;
    // визуална подсветка на NEXT при последната стъпка ако има избор
    if (i===3){
      btnNext.style.filter = state.city ? "drop-shadow(0 0 18px rgba(74,222,128,.85))" : "none";
    } else {
      btnNext.style.filter = "none";
    }
  }
  function spinOnce(btn){ btn.classList.add("spin"); setTimeout(()=>btn.classList.remove("spin"), 520); }
  function validateCurrent(){
    if (state.idx===0){ state.date = $("#birthDate", wizard).value; return !!state.date; }
    if (state.idx===1){ state.time = $("#birthTime", wizard).value; return !!state.time; }
    if (state.idx===2){ state.dst  = $("#dst", wizard).checked; return true; }
    if (state.idx===3){ return !!state.city; }
    return false;
  }
  function shakeCurrent(){
    const active = steps[state.idx];
    active.style.animation = "shakeX .4s both";
    active.addEventListener("animationend", ()=> active.style.animation = "", {once:true});
  }
  function toggleNextGlow(){
    btnNext.style.filter = validateCurrent() ? "drop-shadow(0 0 18px rgba(74,222,128,.85))" : "none";
  }
  wizard.addEventListener("input", toggleNextGlow); toggleNextGlow();

  btnNext.addEventListener("click", () => {
    spinOnce(btnNext);
    if (!validateCurrent()) return shakeCurrent();
    if (state.idx < steps.length-1) showStep(state.idx+1);
    else { 
      try{
        const modal = $("#welcomeModal");
        if (modal) modal.classList.add("hidden");
      }catch(_){}
      showLoading(true);
      Promise.resolve(finishFlow()).finally(()=> showLoading(false));
    }
  });
  btnBack.addEventListener("click", () => {
    spinOnce(btnBack);
    if (state.idx>0) showStep(state.idx-1); else exitWizard();
  });

  /* === GEO SEARCH === */

  const placeInput = $("#placeInput", wizard);
  const searchBtn  = $("#searchBtn", wizard);
  const dd         = $("#cityDropdow", wizard) || $("#cityDropdown", wizard);
  // Транслитерация в реално време: кирилица → латиница
  placeInput?.addEventListener('input', () => {
    const cur = placeInput.value;
    const lat = cyrToLat(cur);
    if (lat !== cur){
      const atEnd = document.activeElement === placeInput;
      placeInput.value = lat;
      if (atEnd) {
        const len = lat.length;
        try { placeInput.setSelectionRange(len, len); } catch(_){ }
      }
    }
  });
  const ddToggle   = $(".dropdown-toggle", dd);
  const ddMenu     = $(".dropdown-menu", dd);
  const ddLabel    = $(".dropdown-toggle .label", dd);

// Reposition dropdown under the city input & sync its width (DOWNWARD, left-aligned to #placeInput)
(function(){
  const searchRow = $(".search-row", wizard);
  if (searchRow && dd && searchRow !== dd.parentElement){
    try { searchRow.appendChild(dd); } catch(_){}
    try { searchRow.style.position = 'relative'; } catch(_){}
    try {
      dd.classList.remove('up');             // force downward opening
      dd.style.position = 'absolute';
      dd.style.right = 'auto';
    } catch(_){}
  }
  function syncCityDropdownWidth(){
    try{
      const r = placeInput?.getBoundingClientRect?.();
      const w = Math.round((r?.width || placeInput?.offsetWidth || 0));
      if (w) dd.style.width = w + "px";
    }catch(_){}
  }
  function positionCityDropdown(){
    try{
      if (!searchRow || !dd || !placeInput) return;
      const rInput = placeInput.getBoundingClientRect();
      const rRow   = searchRow.getBoundingClientRect();
      dd.style.left = Math.max(0, rInput.left - rRow.left) + "px"; // align left edge
      dd.style.top  = Math.max(0, Math.round(placeInput.getBoundingClientRect().bottom - searchRow.getBoundingClientRect().top + 6)) + "px"; // just below input
      dd.style.right = 'auto';
    }catch(_){}
  }
  const apply = ()=>{ syncCityDropdownWidth(); positionCityDropdown(); };
  apply();
  window.addEventListener("resize", apply);
})();

  function populateCitySelect(){
    ddMenu.innerHTML = "";
    const list = Array.isArray(cities) ? cities : [];
    if (!list.length){
      const empty = document.createElement("div");
      empty.className = "dropdown-item";
      empty.style.opacity = ".75";
      empty.style.pointerEvents = "none";
      empty.textContent = "няма намерени резултати";
      ddMenu.appendChild(empty);
      try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    dd.hidden = false; dd.classList.add("open"); _safePositionCityDropdown();
      ddToggle.setAttribute("aria-expanded","true");
      return;
    }
    list.forEach((c) => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.setAttribute("role","option");
      item.setAttribute("tabindex","0");
      const label = c.complete_name || formatCity(c) || (c.name || "");
      item.textContent = label;
      item.addEventListener("click", () => {
        ddMenu.querySelectorAll(".dropdown-item").forEach(el=>el.classList.remove("active"));
        item.classList.add("active");
      });
      const select = () => {
        state.city = c;
        if (ddLabel) ddLabel.textContent = label || "избери град";
        dd.classList.remove("open");
        ddToggle.setAttribute("aria-expanded","false");
      };
      item.addEventListener("dblclick", select);
      item.addEventListener("keydown", (e)=>{ if (e.key === "Enter") select(); });
      ddMenu.appendChild(item);
    });
    try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    dd.hidden = false; dd.classList.add("open"); _safePositionCityDropdown();
    ddToggle.setAttribute("aria-expanded","true");
  }

  searchBtn.addEventListener('click', async () => {
    const query = placeInput.value.trim(); if (!query) return;
    const queryLatin = cyrToLat(query);
    console.log('[GEO][CLIENT REQUEST]', { url: GEO_DETAILS, body: { city: queryLatin, q: queryLatin, location: queryLatin } });
    searchBtn.disabled = true;
    try {
      const res = await fetch(GEO_DETAILS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: queryLatin, q: queryLatin, location: queryLatin })
      });
      const txt = await res.text();
console.groupCollapsed("[GEO] /api/geo-details ◀ response");
try { console.log("status:", res.status, "ok:", res.ok); } catch(_){}
try { console.log("raw:", txt); } catch(_){}
console.groupEnd();
if (!res.ok) throw new Error(`Geo API ${res.status}: ${txt}`);
      let data; try { data = JSON.parse(txt); } catch { data = txt; }
try { console.log("[GEO] parsed:", data); } catch(_){}
      cities = data;
      console.log(data);
      console.log(cities);
      populateCitySelect();
    } catch (err) {
      console.error(err);
      alert('Грешка при търсене на град.');
    } finally {
      searchBtn.disabled = false;
    }
  });

  ddToggle.addEventListener("click", () => {
    // Expand visually even if there are no results; show menu only when there are items
    const visualOpen = dd.classList.toggle("open");
    const hasItems = !!(cities && cities.length);
    ddToggle.setAttribute("aria-expanded", (visualOpen && hasItems) ? "true" : "false");
    const menu = dd.querySelector(".dropdown-menu");
    if (menu && !hasItems) { menu.style.display = "none"; }
  });
  dd.addEventListener("keydown", (e) => {
    if (!dd.classList.contains("open")) return;
    const items = Array.from(ddMenu.querySelectorAll(".dropdown-item"));
    if (!items.length) return;
    let idx = items.findIndex(el => el.classList.contains("active"));
    if (idx < 0) idx = 0;
    if (e.key === "ArrowDown"){ e.preventDefault(); idx = Math.min(idx+1, items.length-1); }
    if (e.key === "ArrowUp"){   e.preventDefault(); idx = Math.max(idx-1, 0); }
    items.forEach(el => el.classList.remove("active"));
    items[idx].classList.add("active");
    items[idx].scrollIntoView({ block:"nearest" });
    if (e.key === "Enter"){ e.preventDefault(); items[idx].dispatchEvent(new Event("dblclick")); }
    if (e.key === "Escape"){ e.preventDefault(); dd.classList.remove("open"); ddToggle.setAttribute("aria-expanded","false"); }
  });

  async function finishFlow(){
    if (!validateCurrent()) return shakeCurrent();
    const user = auth.currentUser;
    if (!user){ alert("Сесията е изтекла. Впишете се отново."); return; }

    const [Y,M,D]   = String($("#birthDate", wizard).value).split("-").map(Number);
    const [HH,MM]   = String($("#birthTime", wizard).value).split(":").map(Number);
    const city      = state.city || {};
    const tzBase    = Number(city.timezone_offset ?? -new Date().getTimezoneOffset()/60);
    const astroBody = {
      year: Y, month: M, date: D, hours: HH, minutes: MM, seconds: 0,
      latitude: Number(city.latitude), longitude: Number(city.longitude),
      timezone: tzBase + (state.dst ? 1 : 0),
      config: { observation_point: "topocentric", ayanamsha: "tropical", language: "en" }
    };

    try{
      // 1) Запис в базата
      const userRef = doc(db, "users", user.uid);
      const userCol = collection(userRef, "user");
      const nameKey = (user.displayName || "main").trim() || "main";
      const payload = {
        astroPayload: astroBody,
        birthDate: $("#birthDate", wizard).value,
        birthTime: $("#birthTime", wizard).value,
        birthDST: !!state.dst,
        birthCity: city.complete_name || formatCity(city),
        cityGeo: city,
        updatedAt: serverTimestamp()
      };
      try{ const prev = await getDoc(userRef); const prevCredits = Number(prev.data()?.credits ?? 0); const credits = prev.exists() ? (prevCredits || 100) : 100; await setDoc(userRef, Object.assign({ credits }, payload), { merge:true }); }catch(e){ await setDoc(userRef, Object.assign({ credits: 100 }, payload), { merge:true }); }
      await setDoc(doc(userCol, "main"), { name: nameKey, body: astroBody, birthCity: payload.birthCity, cityGeo: city, updatedAt: serverTimestamp() }, { merge:true });

      // 2) 3 заявки към FreeAstrologyAPI през server.js / callApi
      console.log("[ASTRO REQUEST BODY]", astroBody);
      try {
        const planets = await callApi("planets", astroBody);
        console.log("[RESPONSE] planets:", planets);
        try { window.__NATAL_PLANETS_RAW = planets; window.__tryComputeTransitAspects?.(); } catch(_){ }
      } catch(e){ console.error("[ERROR] planets:", e); }
      try { const houses  = await callApi("houses", astroBody);  console.log("[RESPONSE] houses:", houses); }  catch(e){ console.error("[ERROR] houses:", e); }
      try { const wheel   = await callApi("natal-wheel-chart", astroBody); console.log("[RESPONSE] natal-wheel-chart:", wheel); } catch(e){ console.error("[ERROR] natal-wheel-chart:", e); }

      //alert("✅ Готово! Данните са записани и изчисленията са стартирани.");

      // 3) Затваряме модала, махаме blur и разрешаваме менюто
      const modal = $("#welcomeModal");
      if (modal) modal.classList.add("hidden");
      applyBlur2px(false);
      allowMenu = true;
      // showProfileMenu(); // по желание: отворено след завършване  // disabled: open only on avatar click
      try { await runStoredBodyCalls(auth.currentUser); } catch(e){ console.error("[after finishFlow] runStoredBodyCalls", e); }
      try { await runNowCallsUsingUserLocation(auth.currentUser); } catch(e){ console.error("[after finishFlow] runNowCallsUsingUserLocation", e); }
    
      try { window.__tryComputeTransitAspects?.(); } catch(_){ }
      try { sessionStorage.setItem("justRegistered","1"); } catch(_){ }
      setTimeout(function(){ try{ window.location.reload(); }catch(_){ location.href = location.href; } }, 150);
}catch(e){
      console.error(e);
      alert("Възникна грешка при запис.");
    }
  
  // Wizard completed; ensure chat is visible now that user subdoc exists
  try {
    var _fab = document.getElementById('chatFab'); if (_fab) _fab.classList.remove('hidden');
    var _pop = document.getElementById('chatPopup'); if (_pop) _pop.classList.remove('hidden');
  } catch(e){}
}
}

/* =========================
   App bootstrap
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
    try{ sessionStorage.removeItem("justRegistered"); }catch(_){ }
// Avatar click → gated by allowMenu
  $("#profilePic")?.addEventListener("click", (e) => { e.stopPropagation(); toggleProfileMenu(); });

  onAuthStateChanged(auth, async (user) => {
    if (!user){
      try { sessionStorage.setItem("skipAutoLogin","1"); } catch(_){}
      window.location.href = "index.html?logout=1";
      return;
    }

    setAvatar(user.photoURL);
    // Ensure credits exist and update UI
    try{ await ensureAndLoadCredits(user); }catch(_){}


    /* NOW trigger after login (best-effort, runs regardless of hasUserData) */
    try { runNowCallsUsingUserLocation(user); } catch(e){ console.error('[NOW bootstrap]', e); }

    // Проверяваме дали има данни в колекцията "user"
    let hasUserData = false;
    try {
      const mainDoc = await getDoc(doc(db, "users", user.uid, "user", "main"));
      if (mainDoc.exists()) hasUserData = true;
      else {
        const snap = await getDocs(collection(db, "users", user.uid, "user"));
        hasUserData = !snap.empty;
      }
    } catch (err) {
      console.error("Грешка при проверка на колекция user:", err);
    }

    const modal = $("#welcomeModal");
    const modalContent = modal?.querySelector(".modal-content");

    if (hasUserData){
    // User subdoc present: show chat
    try {
      var _fab = document.getElementById('chatFab'); if (_fab) _fab.classList.remove('hidden');
      var _pop = document.getElementById('chatPopup'); if (_pop) _pop.classList.remove('hidden');
    } catch(e){}

  // 🔸 STORED BODY requests (saved birth-data body from user profile)
  try { await runStoredBodyCalls(user); } 
  catch(e){ console.error("[STORED CALLS]", e); }

  // 🔸 NOW requests (current date/time + user's location)
  try { await runNowCallsUsingUserLocation(user); } 
  catch(e){ console.error("[NOW CALLS]", e); }

      // Вариант 2: има данни → няма blur и менюто работи
      allowMenu = true;
      applyBlur2px(false);
      modal?.classList.add("hidden");
      // [DISABLED 2025-08-19] Auto-loading natal chart on site entry is turned off per user request.
// try { await runInitialAstroCallsIfUserData(user); } catch(e){ console.error("[ASTRO INIT]", e); }
      return;
    }

    // Вариант 1: първи вход → blur + модален въпрос
    allowMenu = false;
    applyBlur2px(true);
    modal?.classList.remove("hidden");

    $("#btnNo")?.addEventListener("click", async () => {
      try { await signOut(auth); } catch(_){}
      window.location.href = "index.html";
    });
    $("#btnYes")?.addEventListener("click", () => startWizard(modalContent));
  });
});

/* Close helper for My Data modal */
function closeMyDataModal(){
  try{
    const modal = document.getElementById('myDataModal');
    const content = document.getElementById('myDataContent');
    if (content) content.innerHTML = '';
    if (modal) modal.classList.add('hidden');
    
    document.body.classList.remove('mydata-open');
// also re-enable avatar/menu blur if needed
    applyBlur2px(false);
  }catch(_){}
}
/* =========================
   Render 3-column "My Data" modal UI
   ========================= */
async function renderMyDataUI(){
  await ensureBeganCssLoaded(); // Ensure modal exists & is empty
  let modal = document.getElementById('myDataModal');
  let content = document.getElementById('myDataContent');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'myDataModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" id="myDataContent" aria-label="Моите данни"></div>';
    document.body.appendChild(modal);
    content = document.getElementById('myDataContent');
  }
  content.innerHTML = "";
  modal.classList.remove("hidden");
  document.body.classList.add("mydata-open");
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label','Затвори');
  closeBtn.addEventListener('click', () => closeMyDataModal());
  content.appendChild(closeBtn);

  // Columns wrapper
  const wrap = document.createElement('div');
  wrap.className = 'md-grid';
  content.appendChild(wrap);

  
try{ content.addEventListener('click', function(e){ e.stopPropagation(); }); }catch(_){}
// === LEFT ===
  const left = document.createElement('section');
  left.className = 'md-left';
  const titleEl = document.createElement('h3');
  titleEl.id = 'mdTitle';
  titleEl.className = 'md-title';
  titleEl.textContent = 'Натална карта';
  
const wrapChart = document.createElement('div');
wrapChart.id = 'mdChartWrap';
wrapChart.className = 'md-chart-wrap loading';

const vid = document.createElement('video');
vid.id = 'mdChartSpinner';
vid.className = 'md-chart-spinner';
vid.muted = true;
vid.autoplay = true;
vid.loop = true;
try { vid.setAttribute('playsinline',''); vid.setAttribute('muted',''); vid.setAttribute('autoplay',''); vid.setAttribute('loop',''); } catch(_){}
try { vid.setAttribute('webkit-playsinline',''); } catch(_){}
vid.preload = 'auto';

// Provide multiple <source> paths so one will load even under subpath hosting
const srcAbs = document.createElement('source');
srcAbs.src = '/videos/spiningChartWheel.mp4';
srcAbs.type = 'video/mp4';
const srcRel = document.createElement('source');
srcRel.src = 'videos/spiningChartWheel.mp4';
srcRel.type = 'video/mp4';
vid.appendChild(srcAbs);
vid.appendChild(srcRel);

const img = document.createElement('img');
img.id = 'mdChart';
img.className = 'md-chart';
img.alt = 'Natal chart';

img.addEventListener('load', () => wrapChart.classList.remove('loading'));
img.addEventListener('error', () => wrapChart.classList.add('loading'));
img.addEventListener('dblclick', () => img.classList.toggle('zoom2x'));

wrapChart.appendChild(vid);
wrapChart.appendChild(img);

// attempt autoplay now and once on first user interaction
try { vid.play().catch(()=>{}); } catch(_){}
try {
  const attemptPlay = () => { try { vid.play().catch(()=>{}); } catch(_){} };
  document.addEventListener('pointerdown', attemptPlay, { once: true });
  document.addEventListener('keydown', attemptPlay, { once: true });
} catch(_){}

left.appendChild(titleEl);
left.appendChild(wrapChart);

  wrap.appendChild(left);

  // === MIDDLE (form) ===
  const mid = document.createElement('section');
  mid.className = 'md-middle';
  mid.innerHTML = `
    <form id="mdForm" class="md-form smallForm" autocomplete="off">
      <div class="title">Вашите рожденни данни са:</div>
      <div class="md-row">
        <label for="mdDate">дата</label>
        <input id="mdDate" type="date" required />
      </div>
      <div class="md-row">
        <label for="mdTime">час</label>
        <input id="mdTime" type="time" step="60" required />
        <label class="md-dst">
          <input id="mdDST" type="checkbox" />
          <small>лятно часово време</small>
        </label>
      </div>
      <div class="md-row">
        <label for="mdCity">град</label>
        <input id="mdCity" type="text" placeholder="e.g. Sofia" />
        <button type="button" id="mdSearch" class="md-search">ТЪРСИ</button>
      </div>
      <div id="mdDropdown" class="dropdown select-with-arrow" hidden>
        <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="label">избери град</span>
          <span class="chev">▾</span>
        </button>
        <div class="dropdown-menu" role="listbox" id="mdCityMenu"></div>
      </div>
      <div class="md-actions">
        <button type="button" id="mdEdit"  class="md-save"  >ПРОМЕНИ</button>
        <button type="submit" id="mdSave"  class="md-save"  hidden>ЗАПАЗИ</button>
      </div>
    </form>`;
  wrap.appendChild(mid);

  // === RIGHT ===
  const right = document.createElement('section');
  right.className = 'md-right';
  const cols = document.createElement('div');
  cols.className = 'md-cols';
  cols.innerHTML = ``;
  right.appendChild(cols);
  // Placements panel (black)
  const placementsBox = document.createElement('div');
  placementsBox.className = 'md-placements';
  right.appendChild(placementsBox);
  wrap.appendChild(right);

  // === Prefill from first doc in subcollection "user" ===
  const u = (typeof auth !== "undefined") ? auth.currentUser : null;
  let body = null, dispName = (u && u.displayName) ? u.displayName : "Потребител", cityGeo = null, docId = "main";
  try{
    if (!u) throw new Error("No user");
    const mainRef  = doc(db, "users", u.uid, "user", "main");
    const mainSnap = await getDoc(mainRef);
    if (mainSnap.exists()){
      const d = mainSnap.data() || {};
      body    = d.body || d.astroPayload || null;
      dispName= d.name || dispName;
      cityGeo = d.cityGeo || null;
    } else {
      const colRef = collection(db, "users", u.uid, "user");
      const snap   = await getDocs(colRef);
      const first  = snap.docs && snap.docs[0];
      if (first){
        const d = first.data() || {};
        body    = d.body || d.astroPayload || null;
        dispName= d.name || dispName;
        cityGeo = d.cityGeo || null;
        docId   = first.id;
      }
    }
  }catch(e){ console.warn("[MyData] Can't load first doc:", e); }

  const dateEl = document.getElementById('mdDate');
  const timeEl = document.getElementById('mdTime');
  const dstEl  = document.getElementById('mdDST');
  const cityEl = document.getElementById('mdCity');
  const editB  = document.getElementById('mdEdit');
  const saveB  = document.getElementById('mdSave');
  const formEl = document.getElementById('mdForm');
  const dd     = document.getElementById('mdDropdown');
  // === Ensure the dropdown sits under the city input ===
  (function(){
    try{
      const row = cityEl ? cityEl.closest('.md-row') : null;
      if (row && dd && dd.parentElement !== row){ row.appendChild(dd); }
      function positionMdCityDropdown(){
        if (!row || !cityEl || !dd) return;
        const rInput = cityEl.getBoundingClientRect();
        const rRow   = row.getBoundingClientRect();
        dd.style.position = 'absolute';
        dd.style.width = (cityEl.offsetWidth || 0) + 'px';
        dd.style.left  = Math.max(0, rInput.left - rRow.left) + 'px';
        dd.style.top   = Math.max(0, (rInput.top - rRow.top) + cityEl.offsetHeight + 8) + 'px';
      }
      positionMdCityDropdown();
      window.addEventListener('resize', positionMdCityDropdown);
    }catch(_){}
  })();

  const ddToggle = dd?.querySelector('.dropdown-toggle');
  const ddMenu = document.getElementById('mdCityMenu');
  const ddLabel= dd?.querySelector('.label');

  // Helper: reset the My Data city dropdown UI
  function resetMdCityDropdown(){
    try{
      // clear chosen city state and UI label/menu
      if (typeof selectedCity !== 'undefined') selectedCity = null;
      if (typeof ddMenu !== 'undefined' && ddMenu) ddMenu.innerHTML = '';
      if (typeof ddLabel !== 'undefined' && ddLabel) ddLabel.textContent = 'избери град';
      if (typeof dd !== 'undefined' && dd) { dd.classList.remove('open','show'); dd.hidden = true; }
      if (typeof ddToggle !== 'undefined' && ddToggle) ddToggle.setAttribute('aria-expanded','false');
    }catch(_){ /* no-op */ }
  }

  let cityList = [], selectedCity = null;

  function setDisabled(dis){
    formEl.classList.toggle('disabled', dis);
    [dateEl,timeEl,dstEl,cityEl].forEach(el=> el.disabled = dis);
    document.getElementById('mdSearch').disabled = dis;
    editB.hidden = !dis;
    saveB.hidden = dis;
  }

  // Prefill if we have a saved body
  if (body){
    try {
      const pad = (n)=> String(n).padStart(2,'0');
      const yyyy = body.year || body.Y || body.y || null;
      const mm   = body.month || body.M || null;
      const ddn  = body.date || body.D || null;
      const hh   = body.hours ?? body.H ?? null;
      const mi   = body.minutes ?? body.m ?? 0;
      if (yyyy && mm && ddn){
        dateEl.value = `${yyyy}-${pad(mm)}-${pad(ddn)}`;
      }
      if (hh!=null){
        timeEl.value = `${pad(hh)}:${pad(mi)}`;
      }
      dstEl.checked = false; // unknown; leave false by default
      selectedCity  = cityGeo || null;
    }catch(_){}
  }
  setDisabled(true);

  // Initial chart (if we have body)
  try{
    if (body){
      console.log("[ASTRO BODY (from first user doc)]", body);
      // Show spinner while loading
      try { document.getElementById('mdChartWrap')?.classList.add('loading'); } catch(_){}

      // Fetch all three in parallel
      const [plRes, hsRes, wheel] = await Promise.all([
        callApi("planets", body),
        callApi("houses",  body),
        callApi("natal-wheel-chart", body)
      ]);

      try { console.log("[RESPONSE] planets:", plRes); } catch(_){}
      try { console.log("[RESPONSE] houses:",  hsRes); } catch(_){}
      try { console.log("[RESPONSE] natal-wheel-chart:", wheel); } catch(_){}

      // Update wheel image
      try {
        const img = document.getElementById("mdChart");
        if (wheel && wheel.output && img) img.src = wheel.output;
      } catch (e) {
        console.error("[ERROR] set wheel img:", e);
      }

      // Update placements (right column)
      try {
        const summary = _buildPlanetSummary(plRes, hsRes);
        try { window.__planetsHousesBG = summary; } catch(_){}
        renderPlacementsList(
          document.querySelector('#myDataContent .md-placements'),
          getPlacementsFromMyData() || summary
        );
      } catch (e) {
        console.warn("[MyData] placements render skipped on open:", e);
      }
    }
  }catch(e){ console.error(e); }
// CITY SEARCH
  document.getElementById('mdSearch')?.addEventListener('click', async () => {
    const q = cityEl.value.trim(); if (!q) return;
    try{
      const queryLatin = cyrToLat(q);
      const res = await fetch("/api/geo-details", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ city: queryLatin, q: queryLatin, location: queryLatin }) });
      const txt = await res.text();
console.groupCollapsed("[GEO] /api/geo-details ◀ response");
try { console.log("status:", res.status, "ok:", res.ok); } catch(_){}
try { console.log("raw:", txt); } catch(_){}
console.groupEnd();
      if (!res.ok) throw new Error(`Geo API ${res.status}: ${txt}`);
      let data; try { data = JSON.parse(txt); } catch { data = txt; }
try { console.log("[GEO] parsed:", data); } catch(_){}
      cityList = data;
      ddMenu.innerHTML = "";
      if (!Array.isArray(cityList) || !cityList.length){
        try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    dd.hidden = false; dd.classList.add("open"); _safePositionCityDropdown();
        ddToggle?.setAttribute("aria-expanded","true");
        const empty = document.createElement("div"); empty.className="dropdown-item"; empty.textContent="Няма резултати"; ddMenu.appendChild(empty);
        return;
      }
      cityList.forEach((c, i) => {
        const item = document.createElement("div");
        item.className = "dropdown-item";
        const label = c.complete_name || [c.name,c.state,c.country].filter(Boolean).join(", ");
        item.textContent = label;
        item.tabIndex = 0;
        const select = () => {
          selectedCity = c;
          if (ddLabel) ddLabel.textContent = label || "избери град";
          dd.classList.remove("open");
          ddToggle?.setAttribute("aria-expanded","false");
          cityEl.value = label;
          saveB.disabled = !(dateEl.value && timeEl.value && selectedCity);
        };
        item.addEventListener("dblclick", select);
        item.addEventListener("keydown", (e) => { if (e.key === "Enter") select(); });
        item.addEventListener("click", () => {
          const all = Array.from(ddMenu.querySelectorAll(".dropdown-item"));
          all.forEach(el=>el.classList.remove("active"));
          item.classList.add("active");
        });
        ddMenu.appendChild(item);
      });
      try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    try{ syncCityDropdownWidth(); _safePositionCityDropdown(); }catch(_){}
    dd.hidden = false; dd.classList.add("open"); _safePositionCityDropdown();
      ddToggle?.setAttribute("aria-expanded","true");
      ddToggle?.focus();
    }catch(err){
      console.error(err); alert("Грешка при търсене на град.");
    }
  });
  ddToggle?.addEventListener("click", () => {
    if (!cityList.length) return;
    const isOpen = dd.classList.toggle("open");
    ddToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
  dd.addEventListener("keydown", (e) => {
    if (!dd.classList.contains("open")) return;
    const items = Array.from(ddMenu.querySelectorAll(".dropdown-item"));
    if (!items.length) return;
    let idx = items.findIndex(el => el.classList.contains("active"));
    if (idx < 0) idx = 0;
    if (e.key === "ArrowDown"){ e.preventDefault(); idx = Math.min(idx+1, items.length-1); }
    if (e.key === "ArrowUp"){   e.preventDefault(); idx = Math.max(idx-1, 0); }
    items.forEach(el => el.classList.remove("active"));
    items[idx].classList.add("active");
    items[idx].scrollIntoView({ block:"nearest" });
    if (e.key === "Enter"){ e.preventDefault(); items[idx].dispatchEvent(new Event("dblclick")); }
    if (e.key === "Escape"){ e.preventDefault(); dd.classList.remove("open"); ddToggle.setAttribute("aria-expanded","false"); }
  });

  // EDIT/SAVE
  function updateSaveState(){
    saveB.disabled = !(dateEl.value && timeEl.value && (selectedCity || cityGeo));
  }
  [dateEl, timeEl, dstEl].forEach(el => el.addEventListener("input", updateSaveState));
  editB.addEventListener("click", () => setDisabled(false));

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u2 = auth.currentUser; if (!u2){ alert("Моля, впишете се."); return; }
    const [Y,M,D] = String(dateEl.value).split("-").map(Number);
    const [HH,MM] = String(timeEl.value).split(":").map(Number);
    const geo = selectedCity || cityGeo;
    if (!geo){ alert("Моля, изберете град от списъка."); return; }
    const bodyNew = {
      year:Y, month:M, date:D, hours:HH, minutes:MM, seconds:0,
      latitude: Number(geo.latitude), longitude: Number(geo.longitude),
      timezone: Number(geo.timezone_offset) + (dstEl.checked ? 1 : 0),
      config:{ observation_point:"topocentric", ayanamsha:"tropical", language:"en" }
    };

    try{
      await setDoc(doc(db, "users", u2.uid, "user", docId||"main"), {
        name: dispName, body: bodyNew, cityGeo: geo, updatedAt: serverTimestamp()
      }, { merge:true });

      console.log("[ASTRO BODY (on save)]", bodyNew);

// Show spinner while loading
try { document.getElementById('mdChartWrap')?.classList.add('loading'); } catch(_){}

// Fetch all three in parallel
let plRes, hsRes, wh;
try {
  [plRes, hsRes, wh] = await Promise.all([
    callApi("planets", bodyNew),
    callApi("houses",  bodyNew),
    callApi("natal-wheel-chart", bodyNew)
  ]);
  try { console.log("[RESPONSE] planets:", plRes); } catch(_){}
  try { console.log("[RESPONSE] houses:",  hsRes); } catch(_){}
  try { console.log("[RESPONSE] natal-wheel-chart:", wh); } catch(_){}
} catch (e) {
  console.error("[ERROR] astro API on save:", e);
}

// Update wheel image
try {
  const img = document.getElementById("mdChart");
  if (wh && wh.output && img) img.src = wh.output;
} catch (e) {
  console.error("[ERROR] set wheel img:", e);
}

// Update placements (right column)
try {
  const summaryObj2 = _buildPlanetSummary(plRes, hsRes);
  try { window.__planetsHousesBG = summaryObj2; } catch(_){}
  renderPlacementsList(
    document.querySelector('#myDataContent .md-placements'),
    getPlacementsFromMyData() || summaryObj2
  );
} catch (e) {
  console.warn("[MyData] placements render skipped after save:", e);
}
setDisabled(true);
      // clear city dropdown after saving
      try{ resetMdCityDropdown(); }catch(_){}

      alert("✅ Данните са записани.");
    }catch(err){
      console.error(err);
      alert("Възникна грешка при запис.");
    }
  });

  // Start state: disabled
  updateSaveState();
}

// Auto open My Data modal if URL hash is #my-data
(function(){
  const openIfHash = () => {
    try{
      if (String(location.hash) === "#my-data") {
        renderMyDataUI();
      }
    }catch(_){}
  };
  window.addEventListener("hashchange", openIfHash);
  // run once on load
  try { openIfHash(); } catch(_){}
})();

/* =========================
   Legacy GEO UI (compatible with jsGeo.js structure)
   - Activates only if elements #qCity (text input) and #qCityResults (select) exist
   - Mirrors the UX in jsGeo.js: search button, select placeholder, double‑click / Enter to confirm
   - Exposes window.__geoSelectedCity and dispatches "geo:citySelected" on selection
   ========================= */
(function setupLegacyGeoUI(){
  if (window.__legacyGeoReady) return;
  const boot = () => {
    let cityInput   = document.getElementById('qCity');
    let citySel     = document.getElementById('qCityResults');
    // Auto-detect a city input if #qCity is missing
    if (!cityInput) {
      cityInput = document.querySelector('input[name="city"], input[name="qCity"], input[data-role="city"], input[placeholder*="Град"], input[placeholder*="City"], input[placeholder*="Location"]');
    }
    // If select is missing but we have an input, create it and insert after input
    if (!citySel && cityInput) {
      citySel = document.createElement("select");
      citySel.id = "qCityResults";
      citySel.style.display = "none";
      citySel.size = 6;
      cityInput.insertAdjacentElement("afterend", citySel);
    }
    const syncDropdownWidth = () => {
      try {
        if (!cityInput || !citySel) return;
        const width = cityInput.offsetWidth || cityInput.getBoundingClientRect().width || 0;
        const target = Math.max(160, Math.floor(width - 6)); // малко по-малко от полето
        citySel.style.boxSizing = 'border-box';
        citySel.style.width = target + 'px';
      } catch(_){}}

    
// Build a wizard-like dropdown under the small city input
let qCityDropdown = document.getElementById('qCityDropdown');
if (!qCityDropdown && cityInput){
  qCityDropdown = document.createElement('div');
  qCityDropdown.id = 'qCityDropdown';
  qCityDropdown.className = 'dropdown';
  qCityDropdown.innerHTML = `
    <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="label">избери град</span>
      <span class="chev">▾</span>
    </button>
    <div class="dropdown-menu" role="listbox"></div>`;
  // place right after the input
  cityInput.insertAdjacentElement('afterend', qCityDropdown);
}
const ddToggleSmall = qCityDropdown?.querySelector('.dropdown-toggle');
const ddMenuSmall   = qCityDropdown?.querySelector('.dropdown-menu');
// === small dropdown dblclick delegation ===
if (ddMenuSmall) {
  ddMenuSmall.addEventListener('dblclick', function(e) {
    var it = e.target && (e.target.closest ? e.target.closest('.dropdown-item') : null);
    if (!it) return;
    try { it.dispatchEvent(new Event('click', { bubbles: true })); } catch(_){
      // Fallback: synthesize selection if click handler is not attached
      var idx = Number(it.dataset && it.dataset.index || -1);
      var items = Array.from(ddMenuSmall.querySelectorAll('.dropdown-item'));
      if (idx >= 0 && idx < items.length) { items[idx].click?.(); }
    }
  });
}
// === END small dropdown dblclick delegation ===

// Sync dropdown width with the input width (and align left)
function syncSmallDropdownWidth(){
  try{
    if (!cityInput || !qCityDropdown) return;
    const rect = cityInput.getBoundingClientRect();
    const width = rect.width || cityInput.offsetWidth || 0;
    if (width) qCityDropdown.style.width = Math.max(160, Math.floor(width)) + 'px';
  }catch(_){}
}
syncSmallDropdownWidth();
window.addEventListener('resize', syncSmallDropdownWidth);
window.addEventListener('orientationchange', syncSmallDropdownWidth);

// Render search results into the dropdown menu
function renderSmallMenu(list){
  if (!qCityDropdown || !ddMenuSmall) return;
  ddMenuSmall.innerHTML = "";
  if (!Array.isArray(list) || !list.length){
    qCityDropdown.classList.remove('open');
    ddToggleSmall?.setAttribute('aria-expanded','false');
    return;
  }
  list.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.setAttribute('role','option');
    item.tabIndex = 0;
    item.dataset.index = String(i);
    item.textContent = c.complete_name || [c.name,c.state,c.country].filter(Boolean).join(", ");
    const choose = () => {
      selectedCity = list[i] || null;
      if (selectedCity?.complete_name || selectedCity?.name) {
        cityInput.value = selectedCity.complete_name || selectedCity.name;
      }
      qCityDropdown.classList.remove('open');
      ddToggleSmall?.setAttribute('aria-expanded','false');
      try { cityInput.focus(); } catch(_){}
      updateAsk();
    };
    item.addEventListener('click', choose);
    item.addEventListener('dblclick', choose);
    item.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') choose(); });
    ddMenuSmall.appendChild(item);
  });
  qCityDropdown.hidden = false;
  qCityDropdown.classList.add('open');
  ddToggleSmall?.setAttribute('aria-expanded','true');
  // focus the first item for quick Enter
  try { ddMenuSmall.firstElementChild?.focus(); } catch(_){}
}

// Toggle open/close by button
ddToggleSmall?.addEventListener('click', () => {
/* open on input click/focus for small UI */
  try{
    if (cityInput){
      const openSmall = () => {
        if (!qCityDropdown) return;
        if (ddMenuSmall && ddMenuSmall.children.length){
          qCityDropdown.classList.add('open');
          ddToggleSmall?.setAttribute('aria-expanded','true');
          try { ddMenuSmall.firstElementChild?.focus(); } catch(_){}
        } else {
          const val = String(cityInput.value||'').trim();
          if (val.length >= 2) { try { doSearch(); } catch(_){} }
        }
      };
      cityInput.addEventListener('focus', openSmall);
      cityInput.addEventListener('click', openSmall);
    }
  }catch(_){}

  if (!qCityDropdown) return;
  const open = qCityDropdown.classList.toggle('open');
  ddToggleSmall.setAttribute('aria-expanded', open ? 'true' : 'false');
});

        const askBtn      = document.getElementById('askBtn');
    // prefer a dedicated button if present (e.g. #qCitySearchBtn), otherwise fall back to a nearby button with data-role, then a global #searchBtn
    const searchBtn   = document.getElementById('qCitySearchBtn')
                        || (cityInput ? cityInput.closest('form')?.querySelector('[data-role="searchCityBtn"]') : null)
                        || document.getElementById('searchBtn');

    if (!cityInput || !citySel) return; // nothing to do if we still lack elements
    syncDropdownWidth();
    window.addEventListener('resize', syncDropdownWidth);
    window.addEventListener('orientationchange', syncDropdownWidth);
    window.__legacyGeoReady = true;

    /** Internal state (scoped) */
    let cityArr = [];
    let selectedCity = null;

    /** Helper: enable/disable related actions if page provides such hooks */
    const updateAsk = () => {
      try {
        // If page defines a global updater (kept from old code), call it
        if (typeof window.updateAsk === "function") window.updateAsk();
      } catch(_){}
    };

    /** Normalize various payload shapes to our unified structure (reuse app helpers if present) */
    const normList = (data) => {
      try {
        if (typeof normalizeGeoList === "function") return normalizeGeoList(data);
      } catch(_){}
      const raw = Array.isArray(data) ? data : (data?.results || data?.data || data?.geonames || []);
      return (raw || []).map((it)=> {
        const name = it.name || it.city || it.place || it.location_name || "";
        const state = it.state || it.admin || it.adminName || it.region || it.province || "";
        const country = it.country || it.countryName || it.country_code || it.countryCode || it.cc || "";
        const lat = Number(it.latitude ?? it.lat);
        const lon = Number(it.longitude ?? it.lng ?? it.lon);
        const tz = it.timezone || it.tz || it.timezone_name || "";
        const complete = [name, state, country,tz].filter(Boolean).join(", ");
        return {
          name,
          state,
          country,
          latitude: lat,
          longitude: lon,
          timezone_offset: Number(it.timezone_offset ?? it.gmtOffset ?? it.utcOffset ?? 0),
          timezone: tz,
          complete_name: complete
        };
      }).filter(x => x.name && !Number.isNaN(x.latitude) && !Number.isNaN(x.longitude));
    };

    /** Transliterate on the fly (reuse app helper if present) */
    const toLatin = (s) => {
      try { if (typeof cyrToLat === "function") return cyrToLat(s); } catch(_){}
      return s;
    };

    /** Perform search */
    const doSearch = async () => {
      const qRaw = String(cityInput.value||"").trim();
      if (!qRaw) return;
      selectedCity = null;
      updateAsk();
      if (searchBtn) searchBtn.disabled = true;
      try{
        const q = toLatin(qRaw);
        const res = await (() => { 
  const __payload = { location: q };
  console.groupCollapsed("[GEO] /api/geo-details ▶ request");
  try { console.log("body:", __payload); } catch(_){}
  console.groupEnd();
  return fetch("/api/geo-details", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(__payload)
  });
})();
        const txt = await res.text();
console.groupCollapsed("[GEO] /api/geo-details ◀ response");
try { console.log("status:", res.status, "ok:", res.ok); } catch(_){}
try { console.log("raw:", txt); } catch(_){}
console.groupEnd();
        if (!res.ok) throw new Error(`Geo API ${res.status}: ${txt}`);
        let data; try { data = JSON.parse(txt); } catch { data = txt; }
try { console.log("[GEO] parsed:", data); } catch(_){}
       // cityArr = normList(data);
        cityArr = data;
        console.log(cityArr)

        try { console.log('[GEO] normalized length:', cityArr.length, cityArr); } catch(_){}
                renderSmallMenu(cityArr);
}catch(err){
        console.error(err);
        alert('Грешка при търсене на град.');
      }finally{
        if (searchBtn) searchBtn.disabled = false;
      }
    };

    /** Confirm selection helper */
    const confirmSelection = () => {
      if (citySel.selectedIndex <= 0) return;
      selectedCity = cityArr[+citySel.value] || null;
      if (selectedCity?.complete_name || selectedCity?.name) {
        cityInput.value = selectedCity.complete_name || selectedCity.name;
      }
      // Expose for other scripts
      try { window.__geoSelectedCity = selectedCity; } catch(_){}
      // Dispatch event for observers
      try {
        const ev = new CustomEvent("geo:citySelected", { detail: { city: selectedCity }});
        window.dispatchEvent(ev);
      } catch(_){}
      updateAsk();
    };

    /** Wire UX events (match jsGeo.js behavior) */
    // Transliterate on input (if helper exists)
    cityInput.addEventListener('input', () => {
      const cur = cityInput.value;
      const lat = toLatin(cur);
      if (lat !== cur){
        const atEnd = document.activeElement === cityInput;
        cityInput.value = lat;
        if (atEnd){
          try { cityInput.setSelectionRange(lat.length, lat.length); } catch(_){}
        }
      }
    });

    // Search via button
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    // Enter in input triggers confirm if dropdown is open and something selected, else performs a search
    
cityInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const isOpen = !!document.getElementById('qCityDropdown')?.classList.contains('open');
  const firstItem = document.querySelector('#qCityDropdown .dropdown-menu .dropdown-item');
  if (isOpen && firstItem){
    e.preventDefault();
    firstItem.click();
  } else {
    e.preventDefault();
    doSearch();
  }
});
// Double click to confirm selection and close
    citySel.addEventListener('dblclick', () => {
      if (citySel.selectedIndex <= 0) return;
      confirmSelection();
      citySel.style.display = 'none';
      askBtn?.focus();
    });

    // Press Enter to confirm selection and close
    citySel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (citySel.selectedIndex <= 0) return;
        confirmSelection();
        citySel.style.display = 'none';
        askBtn?.focus();
      }
    });

    // Change event updates selected city
    citySel.addEventListener('change', (e) => {
      selectedCity = cityArr[+e.target.value] || null;
      if (selectedCity?.complete_name || selectedCity?.name) cityInput.value = selectedCity.complete_name || selectedCity.name;
      updateAsk();
    });
  };
  if (document.readyState === "loading") document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ================================================================
   🔧 Initial astro calls on login (if first doc exists in subcol "user")
   - Uses server.js proxy via callApi()
   - Computes planet→house mapping (using houseOf from old.js)
   - Builds summary object { "Sun": { name, house, sign, planetImg, signImg, houseImg }, ... }
   - Prints everything to the console
   ================================================================ */

/* houseOf (adapted from old.js) – returns the house number (1..12) for a given ecliptic longitude */
function houseOf(planetDeg, housesArr){
  if (!Array.isArray(housesArr) || housesArr.length !== 12) return null;
  for (let i = 0; i < 12; i++) {
    let start = Number(housesArr[i].deg);
    let end   = Number(housesArr[(i + 1) % 12].deg);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end < start) end += 360;
    let p = Number(planetDeg);
    if (p < start) p += 360;
    if (p >= start && p < end) return housesArr[i].house;
  }
  return null;
}

function _pad2(n){ n = Number(n)||0; return (n<10 ? "0"+n : String(n)); }
function _slugLetters(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function _sanitizeDeg(v){
  if (typeof v === "number") return v;
  const num = parseFloat(String(v||"").replace(",", ".").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

/** Build { house, deg }[] from houses API response */
function _buildHousesArr(housesRes){
  const raw = (housesRes && housesRes.output && housesRes.output.Houses) || [];
  return raw.map((h, i) => ({
    house: i+1,
    deg: _sanitizeDeg(h.degree ?? h.cusp ?? h.fullDegree)
  }));
}

/** Normalize planets array from planets API response */
function _iterPlanets(planetsRes){
  const arr = Array.isArray(planetsRes?.output) ? planetsRes.output
            : planetsRes?.output?.Planets || planetsRes?.Planets || [];
  return arr.filter(p => p && p.planet && (p.fullDegree!=null || p.degree!=null));
}

/** Compute final object per spec */
function _buildPlanetSummary(planetsRes, housesRes){
  const housesArr = _buildHousesArr(housesRes);
  if (!housesArr || housesArr.length !== 12){
    console.warn("[ASTRO INIT] houses array invalid:", housesArr);
  }
  const planetObjs = {};
  const items = _iterPlanets(planetsRes);
  items.forEach(p => {
    const enName  = p.planet?.en || p.planet || "";
    const fullDeg = _sanitizeDeg(p.fullDegree ?? p.degree);
    const signEn  = p.zodiac_sign?.name?.en ?? p.zodiac_sign?.en ?? p.sign ?? "";
    const house   = (housesArr && housesArr.length===12) ? houseOf(fullDeg, housesArr) : null;
    planetObjs[enName] = {
      name: (planets_BG && planets_BG[enName]) ? planets_BG[enName] : enName,
      house: house,
      sign: (signs_BG && signs_BG[signEn]) ? signs_BG[signEn] : signEn,
      planetImg: `/images/planets_video/${_slugLetters(enName)}.mp4`,
      signImg: `/images/signs/white_svg/${_slugLetters(signEn)}.svg`,
      houseImg: house ? `/images/houses/houses_white/${house}.svg` : ""
    };
  });
  return planetObjs;
}

async function runInitialAstroCallsIfUserData(user){
  if (!user) return;
  // Load first doc from subcollection "user" (prefer "main")
  let body = null;
  try{
    const mainSnap = await getDoc(doc(db, "users", user.uid, "user", "main"));
    if (mainSnap.exists()){
      const d = mainSnap.data() || {};
      body = d.body || d.astroPayload || null;
    } else {
      const snap = await getDocs(collection(doc(db,"users",user.uid),"user"));
      if (!snap.empty){
        const first = snap.docs[0];
        const d = first.data() || {};
        body = d.body || d.astroPayload || null;
      }
    }
  }catch(e){
    console.warn("[ASTRO INIT] Can't fetch first subdoc:", e);
  }
  if (!body){
    console.warn("[ASTRO INIT] Missing astro payload body – skipping.");
    return;
  }
  console.log("[ASTRO INIT][BODY]", body);
  // 3 API requests via server proxy
  let planetsRes=null, housesRes=null, wheelRes=null;
  try { planetsRes = await callApi("planets", body); console.log("[RESPONSE] planets:", planetsRes); } catch(e){ console.error("[ERROR] planets:", e); }
  try { housesRes  = await callApi("houses",  body);  console.log("[RESPONSE] houses:",  housesRes);  } catch(e){ console.error("[ERROR] houses:", e); }
  try { wheelRes   = await callApi("natal-wheel-chart", body); console.log("[RESPONSE] natal-wheel-chart:", wheelRes); } catch(e){ console.error("[ERROR] natal-wheel-chart:", e); }

  // Build and print the requested object
  try{
    const summaryObj = _buildPlanetSummary(planetsRes, housesRes);
    console.log("[ПЛАНЕТИ → ДОМОВЕ (BG обект)]", summaryObj);
    try { window.__planetsHousesBG = summaryObj; } catch(_){}
    const placementsBox = document.querySelector('#myDataContent .md-placements');
    try { renderPlacementsList(placementsBox, getPlacementsFromMyData() || summaryObj || (window.__planetsHousesBG||null)); } catch(e){ console.warn('[MyData] placements render skipped:', e); }
  }catch(e){
    console.error("[ASTRO INIT] build summary error:", e);
  }
}

/* ==== PATCH: Swap planets panel with birth data form + button behavior (2025-08-19) ==== */
async function __applyMyDataLayoutTweaks(){
  try{
    const root = document.getElementById('myDataContent');
    if (!root) return;
    const mid = root.querySelector('.md-middle');
    const right = root.querySelector('.md-right');
    if (!mid || !right) return;

    const placements = right.querySelector('.md-placements');
    const form = mid.querySelector('#mdForm');
    // Move placements to the middle, form to the right (swap)
    if (placements && placements.parentElement !== mid){
      mid.prepend(placements);
    }
    if (form && form.parentElement !== right){
      right.prepend(form);
    }
    // Remove the title if present (visual only, also enforced by CSS)
    root.querySelectorAll('.md-placements-title').forEach(el => { el.style.display = 'none'; });
    // Right-align the CTA container just in case CSS hasn't loaded yet
    root.querySelectorAll('.md-placements .md-more').forEach(el => {
      el.style.display = 'flex';
      el.style.justifyContent = 'flex-end';
    });
  }catch(e){ console.warn('[PATCH] layout tweaks failed:', e); }
}

// Hook into My Data renderer without editing original code
try{
  const __renderMyDataUI_old = renderMyDataUI;
  renderMyDataUI = async function(...args){
    await __renderMyDataUI_old.apply(this, args);
    await __applyMyDataLayoutTweaks();
  };
}catch(e){
  // If renderMyDataUI is not yet defined (unlikely here), attempt after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof renderMyDataUI === 'function'){
      const __renderMyDataUI_old = renderMyDataUI;
      renderMyDataUI = async function(...args){
        await __renderMyDataUI_old.apply(this, args);
        await __applyMyDataLayoutTweaks();
      };
    }
  });
}

// Global click handler (scoped to #myDataContent) for "Разбери повече" → natal.html
document.addEventListener('click', (ev) => {
  const btn = ev.target && (ev.target.closest ? ev.target.closest('.md-more-btn') : null);
  if (btn){
    const modalContent = document.getElementById('myDataContent');
    if (modalContent && modalContent.contains(btn)){
      try{ ev.preventDefault(); ev.stopPropagation(); }catch(_){ }
      __goToNatal();
    }
  }
}, { passive: true });
/* ==== PATCH v2: Empty-state + ensure visibility for placements ==== */
function __ensurePlacementsVisible(){
  const root = document.getElementById('myDataContent');
  if (!root) return;
  const box = root.querySelector('.md-placements');
  if (!box) return;
  const update = () => {
    const hasList = !!box.querySelector('[role="list"]') && (box.querySelector('[role="list"]').children.length > 0);
    const hasRows = !!box.querySelector('.md-pl-row');
    const any = hasList || hasRows;
    let empty = box.querySelector('.md-empty');
    if (any){
      if (empty) empty.remove();
    } else {
      if (!empty){
        empty = document.createElement('div');
        empty.className = 'md-empty';
        empty.innerHTML = 'Няма данни за показване.<br>Въведете рождените данни и натиснете „ЗАПАЗИ“, за да се зареди списъкът с планети в знаци и домове.';
        box.appendChild(empty);
      }
    }
  };
  update();
  try{
    const mo = new MutationObserver(update);
    mo.observe(box, { childList:true, subtree:true });
  }catch(_){}
}

// call after layout tweaks and also on DOM ready
document.addEventListener('DOMContentLoaded', __ensurePlacementsVisible);
try{
  const __renderPlacementsList_old = renderPlacementsList;
  renderPlacementsList = function(...args){
    const out = __renderPlacementsList_old.apply(this, args);
    try{ __ensurePlacementsVisible(); }catch(_){}
    return out;
  };
}catch(_){
  // no-op
}

/* =====================================================================
   MYDATA_CLOSE_BUTTON_PATCH (2025-08-19)
   Adds a "ЗАТВОРИ" button below #mdForm that closes the modal.
   We don't modify existing renderers; we hook after render.
   ===================================================================== */
(function addCloseButtonToMyData(){
  try{
    if (window.__myDataCloseBtnReady) return;
    window.__myDataCloseBtnReady = true;

    function insertClose(){
      try{
        const root = document.getElementById('myDataContent');
        if (!root) return;
        const form = root.querySelector('#mdForm');
        if (!form) return;

        // If already there, don't add again
        if (root.querySelector('.md-close-wrap')) return;

        const wrap = document.createElement('div');
        wrap.className = 'md-close-wrap';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'md-close-btn';
        btn.textContent = 'ЗАТВОРИ';
        wrap.appendChild(btn);
        // Insert after form
        form.parentElement.insertBefore(wrap, form.nextSibling);

        btn.addEventListener('click', () => {
          // Close the modal window (support both overlay and programmatic close)
          try{
            const modal = document.getElementById('myDataModal') || root.closest('.modal') || document.querySelector('.modal.open');
            if (modal){
              // Common patterns: hide class or remove open class
              modal.classList.remove('open', 'show');
              modal.style.display = 'none';
            }
            // Also try known close helpers if they exist
            if (typeof closeMyDataModal === 'function') closeMyDataModal();
            if (typeof hideModal === 'function') hideModal('myData');
            if (typeof toggleMyData === 'function') toggleMyData(false);
          }catch(e){}
        }, { passive: true });
      }catch(e){ console.warn('[MyDataCloseBtn] insert failed', e); }
    }

    // Hook after MyData UI render
    try{
      const __old = renderMyDataUI;
      renderMyDataUI = async function(...args){
        await __old.apply(this, args);
        insertClose();
      };
    }catch(e){
      // If renderMyDataUI not defined yet, try after DOM ready and when opening via hash
      const safeInsert = ()=> { try{ insertClose(); }catch(_){}};
      document.addEventListener('DOMContentLoaded', safeInsert);
      window.addEventListener('hashchange', () => {
        if (location.hash.includes('myData')) safeInsert();
      });
    }
  }catch(e){ console.warn('[MyDataCloseBtn] setup failed:', e); }
})();

/* =====================================================================
   CLOSE_FIX_CAPTURE_PATCH (2025-08-19)
   - Ensure clicking "ЗАТВОРИ" only calls closeMyDataModal()
   - Prevent any prior listeners from setting display:none permanently
   - Make sure renderMyDataUI can always reopen the modal
   ===================================================================== */
(function closeFixCapturePatch(){
  try{
    if (window.__closeFixCaptureReady) return;
    window.__closeFixCaptureReady = true;

    // 1) Capture-phase listener to override any bubble handlers on the same button
    function handleClose(e){
      const btn = e.target && (e.target.closest ? e.target.closest('.md-close-btn') : null);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      try{
        if (typeof closeMyDataModal === "function"){
          closeMyDataModal();
        } else {
          // Fallback: hide via 'hidden' class only
          const modal = document.getElementById('myDataModal');
          const content = document.getElementById('myDataContent');
          if (content) content.innerHTML = '';
          if (modal){
            modal.classList.add('hidden');
            modal.style.removeProperty('display');
          }
          try { (window.applyBlur2px||function(){})(false); } catch(_){}
        }
      }catch(_){}
    }
    document.addEventListener('click', handleClose, true /* capture */);

    // 2) Wrap renderMyDataUI to reset any stale inline styles and ensure it opens cleanly
    try{
      const __oldRenderMyDataUI = renderMyDataUI;
      renderMyDataUI = async function(...args){
        // reset before
        try{
          const modal = document.getElementById('myDataModal');
          if (modal){
            modal.classList.remove('hidden');
            modal.style.removeProperty('display'); // clear display:none from any legacy handler
          }
        }catch(_){}
        await __oldRenderMyDataUI.apply(this, args);
        // reset after, in case underlying code toggled things
        try{
          const modal = document.getElementById('myDataModal');
          if (modal){
            modal.classList.remove('hidden');
            modal.style.removeProperty('display');
          }
        }catch(_){}
      };
    }catch(_){/* if not defined yet, no-op */}
  }catch(e){ console.warn("[closeFix] setup failed:", e); }
})();

// === Profiles Modal ===
// Opens a modal to pick existing profile or create a new one (top-level 'profiles' collection)
async function renderProfilesModal(){
  try{ await ensureBeganCssLoaded?.(); }catch(_){}
  // Create modal container if absent
  let modal = document.getElementById('profilesModal');
  let content;
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'profilesModal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" id="profilesContent"></div>`;
    document.body.appendChild(modal);
  }
  content = document.getElementById('profilesContent');
  content.innerHTML = '';

  // Blur background + avatar
  try{ applyBlur2px?.(true); }catch(_){}

  const close = () => {
    try{ content.innerHTML = ''; modal.classList.add('hidden'); }catch(_){}
    try{ applyBlur2px?.(false); }catch(_){}
  };
  modal.classList.remove('hidden');
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');

  // Backdrop click closes; stop inside
  content.addEventListener('click', (e)=> e.stopPropagation(), { once:true, capture:true });
  modal.addEventListener('click', (e)=>{ if (e.target === modal) close(); }, { once:true });
  document.addEventListener('keydown', function onEsc(e){ if (e.key==='Escape'){ close(); document.removeEventListener('keydown', onEsc);} });

  // Build UI
  const wrap = document.createElement('div');
  wrap.className = 'pm-wrap';
  wrap.innerHTML = `
    <button type="button" class="modal-close" aria-label="Затвори">×</button>
    <h2 class="pm-title">ИЗБЕРИ ПРОФИЛ</h2>

    <div class="pm-row pm-row-profiles">
      <label>профил</label>
      <div id="pmProfilesDD" class="dropdown select-with-arrow" aria-label="Списък с профили">
        <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="label">избери профил</span>
          <span class="chev">▾</span>
        </button>
        <div class="dropdown-menu" role="listbox" id="pmProfilesMenu"></div>
      </div>
    </div>

    <div class="pm-or">или</div>
    <div class="pm-sep">--- създай нов ---</div>

    <form id="pmForm" autocomplete="off">
      <div class="pm-row pm-row-name">
        <label for="pmName">име</label>
        <input id="pmName" type="text" placeholder="напр. Моят профил" required />
      </div>
      <div class="pm-row pm-row-date">
        <label for="pmDate">дата</label>
        <input id="pmDate" type="date" required />
      </div>
      <div class="pm-row pm-row-time">
        <label for="pmTime">час</label>
        <div class="pm-time-row">
          <input id="pmTime" type="time" step="60" required />
          <label class="pm-dst"><input id="pmDST" type="checkbox" /> <small>лятно часово време</small></label>
        </div>
      </div>
      <div class="pm-row pm-row-city">
        <label for="pmCity">град</label>
        <div class="pm-city-search">
          <input id="pmCity" type="text" placeholder="напр. Sofia" />
          <button type="button" id="pmSearch" class="pm-btn ghost" data-role="searchCityBtn">ТЪРСИ</button>
        </div>
        <div id="pmCityDropdown" class="dropdown select-with-arrow pm-city-dropdown" hidden>
          <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="label">избери град</span>
            <span class="chev">▾</span>
          </button>
          <div class="dropdown-menu" role="listbox" id="pmCityMenu"></div>
        </div>
      </div>

      <div class="pm-actions">
        <button type="submit" id="pmSave" class="pm-btn primary" disabled>ЗАПАЗИ</button>
        <button type="button" id="pmDelete" class="pm-btn danger" disabled>ИЗТРИЙ</button>
        <button type="reset"  id="pmClear" class="pm-btn">ИЗЧИСТИ</button>
      </div>
    </form>
  `;
  content.appendChild(wrap);
  wrap.querySelector('.modal-close')?.addEventListener('click', close);

  // State
  const state = {
    list: [],
    selectedId: null,
    selectedCity: null
  };

  // Elements
  const ddProfiles   = document.getElementById('pmProfilesDD');
  const ddProfToggle = ddProfiles.querySelector('.dropdown-toggle');
  const ddProfMenu   = document.getElementById('pmProfilesMenu');
  const ddProfLabel  = ddProfiles.querySelector('.dropdown-toggle .label');

  const formEl = document.getElementById('pmForm');
  const nameEl = document.getElementById('pmName');
  const dateEl = document.getElementById('pmDate');
  const timeEl = document.getElementById('pmTime');
  const dstEl  = document.getElementById('pmDST');
  const cityEl = document.getElementById('pmCity');
  const searchBtn = document.getElementById('pmSearch');
  const saveBtn   = document.getElementById('pmSave');
  const delBtn    = document.getElementById('pmDelete');
  const clearBtn  = document.getElementById('pmClear');

  const ddCity        = document.getElementById('pmCityDropdown');
  try{ ddCity && ddCity.classList.add('up'); }catch(_){}
  // === Position the city dropdown under the #pmCity input ===
  (function(){
    try{
      const row = cityEl ? cityEl.closest('.pm-row-city') : null;
      if (!row || !ddCity || !cityEl) return;
      function positionPmCityDropdown(){
        const rInput = cityEl.getBoundingClientRect();
        const rRow   = row.getBoundingClientRect();
        ddCity.style.position = 'absolute';
        ddCity.style.width = (cityEl.offsetWidth || 0) + 'px';
        ddCity.style.left  = Math.max(0, rInput.left - rRow.left) + 'px';
        ddCity.style.top   = Math.max(0, (rInput.top - rRow.top) + cityEl.offsetHeight + 8) + 'px';
      }
      positionPmCityDropdown();
      window.addEventListener('resize', positionPmCityDropdown);
    }catch(_){}
  })();

  const ddCityToggle  = ddCity.querySelector('.dropdown-toggle');
  // Ensure the dropdown repositions when toggled
  try{
    if (ddCityToggle && !ddCityToggle.__posBound){
      ddCityToggle.__posBound = true
      ddCityToggle.addEventListener('click', () => {
        try{
          const row = cityEl ? cityEl.closest('.pm-row-city') : null;
          if (!row || !ddCity || !cityEl) return;
          const rInput = cityEl.getBoundingClientRect();
          const rRow   = row.getBoundingClientRect();
          ddCity.style.position = 'absolute';
          ddCity.style.width = (cityEl.offsetWidth || 0) + 'px';
          ddCity.style.left  = Math.max(0, rInput.left - rRow.left) + 'px';
          ddCity.style.top   = Math.max(0, (rInput.top - rRow.top) + cityEl.offsetHeight + 8) + 'px';
        }catch(_){}
      }, { passive: true });
    }
  }catch(_){}

  const ddCityMenu    = document.getElementById('pmCityMenu');
  const ddCityLabel   = ddCity.querySelector('.dropdown-toggle .label');

  // Helpers
  const slug = (s)=> (String(s||'')
    .trim().toLowerCase()
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}]+/gu,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,64) || 'profile');

  // User-scoped collection 'users/{uid}/profiles'
  const pathProfiles = ()=>{
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('NO_AUTH');
    return collection(db,'users', uid, 'profiles');
  };
  const profDoc      = (id)=>{
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('NO_AUTH');
    return doc(db,'users', uid, 'profiles', id);
  };

  const valid = ()=> !!(nameEl.value.trim() && dateEl.value && timeEl.value && (state.selectedCity));
  const updateSave  = ()=> { saveBtn.disabled = !valid(); };
  const resetCityUI = ()=>{
    state.selectedCity = null;
    ddCityLabel.textContent = 'избери град'; if (typeof ddCityMenu !== 'undefined' && ddCityMenu) { ddCityMenu.innerHTML = ''; }
    ddCity.hidden = true; ddCity.classList.remove('open'); ddCityToggle.setAttribute('aria-expanded','false');
  };

  // Load profiles
  async function loadProfiles(){
    ddProfMenu.innerHTML = '';
    try{
      const snap = await getDocs(pathProfiles());
      state.list = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }))
                            .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'bg'));
    }catch(e){ console.warn('[profiles] fetch error:', e); state.list = []; }

    if (!state.list.length){
      const empty = document.createElement('div');
      empty.className = 'dropdown-item';
      empty.style.opacity = '.75';
      empty.style.pointerEvents = 'none';
      empty.textContent = 'няма запазени профили';
      ddProfMenu.appendChild(empty);
      return;
    }

    state.list.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.setAttribute('role','option');
      item.tabIndex = 0;
      item.dataset.id = p.id;
      const label = p.name || `профил ${idx+1}`;
      item.textContent = label;
      const choose = () => selectProfile(p);
      item.addEventListener('click', choose);
      item.addEventListener('dblclick', choose);
      item.addEventListener('keydown', (e)=>{ if (e.key==='Enter') choose(); });
      ddProfMenu.appendChild(item);
    });
  }

  function openProfilesDD(){
    const isOpen = ddProfiles.classList.toggle('open');
    ddProfToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  ddProfToggle.addEventListener('click', openProfilesDD);

  function fillForm(p){
    nameEl.value = p?.name || '';
    dateEl.value = p?.birthDate || '';
    timeEl.value = p?.birthTime || '';
    dstEl.checked = !!p?.birthDST;
    const cityLabel = p?.birthCity || p?.cityGeo?.complete_name || '';
    cityEl.value = cityLabel;
    state.selectedCity = p?.cityGeo || null;
    updateSave();
  }

  function selectProfile(p){
    state.selectedId = p?.id || null;
    ddProfiles.classList.remove('open');
    ddProfToggle.setAttribute('aria-expanded','false');
    ddProfLabel.textContent = p?.name || 'избери профил';
    delBtn.disabled = !state.selectedId;
    fillForm(p);
  }

  await loadProfiles();

  // City search
  const syncCityWidth = ()=> { try{ const w = cityEl?.offsetWidth||0; if (w) ddCity.style.width = w + 'px'; }catch(_){}};
  syncCityWidth(); window.addEventListener('resize', syncCityWidth);

  cityEl.addEventListener('input', ()=>{
    const cur=cityEl.value; const lat=cyrToLat?.(cur) ?? cur;
    if (lat!==cur){
      const end = document.activeElement===cityEl;
      cityEl.value = lat;
      if (end){ const L = lat.length; try{ cityEl.setSelectionRange(L,L);}catch(_){ } }
    }
    resetCityUI(); updateSave();
  });

  async function doGeoSearch(){
    const qRaw = String(cityEl.value||'').trim(); if (!qRaw) return;
    searchBtn.disabled = true;
    try {
      const q = cyrToLat?.(qRaw) ?? qRaw;
      const res = await fetch('/api/geo-details', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ city: q, q, location: q }) });
      const txt = await res.text();
      if (!res.ok) throw new Error(`Geo API ${res.status}: ${txt}`);
      let data; try{ data = JSON.parse(txt); } catch { data = txt; }
      const list = Array.isArray(data) ? data : (normalizeGeoList?.(data) || []);
      ddCityMenu.innerHTML = '';
      if (!list.length){
        ddCity.hidden = false; ddCity.classList.add('open'); ddCityToggle.setAttribute('aria-expanded','true');
        const empty = document.createElement('div'); empty.className='dropdown-item'; empty.textContent='Няма резултати'; ddCityMenu.appendChild(empty);
        return;
      }
      list.forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.setAttribute('role','option');
        item.tabIndex = 0;
        const label = c.complete_name || [c.name,c.state,c.country].filter(Boolean).join(', ');
        item.textContent = label;
        const choose = () => {
          state.selectedCity = c;
          ddCityLabel.textContent = label || 'избери град';
          ddCity.classList.remove('open'); ddCityToggle.setAttribute('aria-expanded','false');
          cityEl.value = label;
          updateSave();
        };
        item.addEventListener('click', choose);
        item.addEventListener('dblclick', choose);
        item.addEventListener('keydown', (e)=>{ if (e.key==='Enter') choose(); });
        ddCityMenu.appendChild(item);
      });
      ddCity.hidden = false; ddCity.classList.add('open'); ddCityToggle.setAttribute('aria-expanded','true');
      try{ ddCityMenu.firstElementChild?.focus(); }catch(_){}
    } catch(err){
      console.error(err); alert('Грешка при търсене на град.');
    } finally { searchBtn.disabled = false; }
  }
  searchBtn.addEventListener('click', doGeoSearch);
  ddCityToggle.addEventListener('click', ()=>{
    if (ddCityMenu.children.length){ const isOpen = ddCity.classList.toggle('open'); ddCityToggle.setAttribute('aria-expanded', isOpen ? 'true':'false'); }
  });

  ddCity.addEventListener('keydown', (e) => {
    if (!ddCity.classList.contains('open')) return;
    const items = Array.from(ddCityMenu.querySelectorAll('.dropdown-item'));
    if (!items.length) return;
    let idx = items.findIndex(el => el.classList.contains('active'));
    if (idx < 0) idx = 0;
    if (e.key === 'ArrowDown'){ e.preventDefault(); idx = Math.min(idx+1, items.length-1); }
    if (e.key === 'ArrowUp'){   e.preventDefault(); idx = Math.max(idx-1, 0); }
    items.forEach(el => el.classList.remove('active'));
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block:'nearest' });
    if (e.key === 'Enter'){ e.preventDefault(); items[idx].dispatchEvent(new Event('dblclick')); }
    if (e.key === 'Escape'){ e.preventDefault(); ddCity.classList.remove('open'); ddCityToggle.setAttribute('aria-expanded','false'); }
  });

  // Save/Delete/Clear
  function buildBody(){
    const [hh,mm] = String(timeEl.value||'00:00').split(':').map(x=>parseInt(x,10)||0);
    // Try multiple sources for timezone and parse robustly
    const city = state.selectedCity || {};
    const tzRaw = city.timezone_offset ?? city.gmtOffset ?? city.gmt_offset ?? city.utcOffset ?? city.offset ?? city.timezone ?? city.tz;
    const tzBase = parseTimezone(tzRaw) ?? 0;
    const tzOffset = tzBase + (dstEl.checked ? 1 : 0);
    return {
      year:  Number(String(dateEl.value).slice(0,4)),
      month: Number(String(dateEl.value).slice(5,7)),
      date:  Number(String(dateEl.value).slice(8,10)),
      hours: hh,
      minutes: mm,
      seconds: 0,
      latitude: Number(city.latitude ?? 0),
      longitude: Number(city.longitude ?? 0),
      timezone: tzOffset,
      config: {
        observation_point: "topocentric",
        ayanamsha: "tropical",
        language: "en"
      }
    };
  }

  formEl.addEventListener('input', updateSave);

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!valid()) return;
    if (!auth.currentUser){ alert('Сесията е изтекла. Впишете се отново.'); return; }
    const id = state.selectedId || slug(nameEl.value);
    const data = {
      name: nameEl.value.trim(),
      birthDate: dateEl.value,
      birthTime: timeEl.value,
      birthDST: !!dstEl.checked,
      birthCity: cityEl.value.trim(),
      cityGeo: state.selectedCity || null,
      body: buildBody(),
      updatedAt: serverTimestamp()
    };
    try{
      await setDoc(profDoc(id), data, { merge:true });
      try{ await loadProfiles(); }catch(_){}
      state.selectedId = null;
      ddProfLabel.textContent = 'избери профил';
      delBtn.disabled = true;
      formEl.reset();
      resetCityUI();
      updateSave();
      alert('✅ Данните са записани.');}catch(err){ console.error(err); alert('Възникна грешка при запис.'); }
  });

  delBtn.addEventListener('click', async ()=>{
    if (!state.selectedId) return;
    if (!confirm('Сигурни ли сте, че искате да изтриете този профил?')) return;
    try{
      await deleteDoc(profDoc(state.selectedId));
      state.list = state.list.filter(x=> x.id !== state.selectedId);
      ddProfLabel.textContent = 'избери профил';
      state.selectedId = null; delBtn.disabled = true;
      formEl.reset(); resetCityUI(); updateSave();
      await loadProfiles();
    }catch(err){ console.error(err); alert('Грешка при изтриване.'); }
  });

  clearBtn.addEventListener('click', () => { state.selectedId = null; delBtn.disabled = true; resetCityUI(); updateSave(); });
}

try{ window.renderProfilesModal = renderProfilesModal; }catch(_){}

// --- Robust delegation: open Profiles Modal when clicking "Запазени данни"
(function setupProfilesMenuDelegation(){
  try{
    document.addEventListener('click', async (e) => {
      const target = e.target;
      const item = target && (target.id === 'menuSaved' ? target : target.closest && target.closest('#menuSaved'));
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      try { hideProfileMenu(); } catch(_){}
      try { await renderProfilesModal(); } catch(err){ console.error(err); }
    }, true); // capture to run early
  }catch(err){ console.warn('[profiles modal] delegate setup failed:', err); }
})();

// ===============================================
// Enhancer patch (2025-08-20)
// - Dropdown под полето за град.
// - Двоен клик върху град = селекция.
// - Enter: ако менюто е отворено -> избира активния град;
//          иначе -> стартира търсене.
// - ArrowUp/Down: навигация в списъка.
// (Additive wrapper; оригиналният код остава непокътнат.)
// ===============================================
(function(){
  if (typeof startWizard !== 'function') return;

  // не дублирай ако вече е добавено
  if (startWizard.__isEnhanced_20250820) return;

  const __origStartWizard = startWizard;
  function enhancedStartWizard(modalContent){
    __origStartWizard.apply(this, arguments);

    try{
      const wizard     = document.querySelector('.wizard');
      if (!wizard) return;

      const placeInput = wizard.querySelector('#placeInput');
      const searchBtn  = wizard.querySelector('#searchBtn');
      const dropdown   = wizard.querySelector('#cityDropdown');
      const menu       = dropdown ? dropdown.querySelector('.dropdown-menu') : null;

      const isOpen = () => !!(menu && (menu.classList.contains('show') || menu.classList.contains('open') || menu.style.display === 'block' || menu.offsetParent));
      const closeMenu = () => {
        if (!menu) return;
        menu.classList.remove('show','open');
        if (dropdown) dropdown.classList.remove('show','open');
        menu.style.display = '';
      };

      const getItems = () => menu ? Array.from(menu.querySelectorAll('.dropdown-item')) : [];
      const setActiveIndex = (idx) => {
        const items = getItems();
        items.forEach(el => el.classList.remove('active'));
        if (items[idx]) items[idx].classList.add('active');
      };
      const getActiveIndex = () => getItems().findIndex(el => el.classList.contains('active'));

      // Делегирай hover за визуална активност
      if (menu){
        menu.addEventListener('mouseover', (e) => {
          const it = e.target.closest('.dropdown-item'); if (!it) return;
          getItems().forEach(el => el.classList.remove('active'));
          it.classList.add('active');
        });

        // Двоен клик = избор и попълване
        menu.addEventListener('dblclick', (e) => {
          const it = e.target.closest('.dropdown-item'); if (!it || !placeInput) return;
          const val = (it.dataset && it.dataset.value) ? it.dataset.value : it.textContent.trim();
          placeInput.value = val;
          placeInput.dispatchEvent(new Event('input', {bubbles:true}));
          placeInput.dispatchEvent(new Event('change', {bubbles:true}));
          closeMenu();
          placeInput.focus();
        });
      }

      if (placeInput){
        placeInput.addEventListener('keydown', function(e){
          // стрелки за навигация
          if (e.key === 'ArrowDown' && isOpen()){
            e.preventDefault();
            const items = getItems();
            const i = Math.max(0, getActiveIndex() + 1);
            setActiveIndex(Math.min(i, items.length - 1));
            return;
          }
          if (e.key === 'ArrowUp' && isOpen()){
            e.preventDefault();
            const i = Math.max(0, getActiveIndex() - 1);
            setActiveIndex(i);
            return;
          }

          // Enter: избери активен или търси
          if (e.key === 'Enter'){
            e.preventDefault();
            if (isOpen()){
              const active = menu ? menu.querySelector('.dropdown-item.active') : null;
              if (active){
                // симулирай двойно кликване върху активния елемент
                active.dispatchEvent(new Event('dblclick', {bubbles:true}));
                return;
              }
            }
            if (searchBtn) searchBtn.click();
          }
        });
      }
    }catch(_){}
  }

  enhancedStartWizard.__isEnhanced_20250820 = true;
  startWizard = enhancedStartWizard;
})();

// ===================================================
// Wizard Enhancer v2 (2025-08-20-b) — additive only
// ===================================================
(function(){
  if (typeof startWizard !== 'function') return;
  if (startWizard.__enhanced_20250820_b) return;

  const __orig = startWizard;
  startWizard = function(modalContent){
    __orig.apply(this, arguments);

    try{
      const wizard = document.querySelector('.wizard');
      if (!wizard) return;

      // 1) Title "Избери профил": tighten spacing
      const titleCand = Array.from(wizard.querySelectorAll('h1,h2,h3,.pmenu-label,.profile-title,.welcome-title,.wizard-header'))
        .find(el => (el.textContent || '').trim().toLowerCase() === 'избери профил');
      if (titleCand){
        titleCand.style.marginTop = '6px';
        titleCand.style.marginBottom = '6px';
      }

      // 2) "или" + "--- създай нов ---": inline, bold-ish, no gap
      const textMatch = (el, t) => el && (el.textContent || '').trim().toLowerCase() === t;
      const nodes = Array.from(wizard.querySelectorAll('span,div,button,a,em,strong,b,i,p,small,label'));
      const iliEl = nodes.find(el => textMatch(el, 'или'));
      const createEl = nodes.find(el => textMatch(el, '--- създай нов ---'));
      if (iliEl){ iliEl.classList.add('profile-or'); }
      if (createEl){ createEl.classList.add('profile-create-new'); }
      if (iliEl && createEl){
        const wrap = document.createElement('span');
        wrap.className = 'profile-inline-chooser';
        const first = (iliEl.compareDocumentPosition(createEl) & Node.DOCUMENT_POSITION_FOLLOWING) ? iliEl : createEl;
        first.parentNode.insertBefore(wrap, first);
        wrap.appendChild(iliEl);
        wrap.appendChild(createEl);
      }

      // 3) Less space under profile select
      const profileSelect = wizard.querySelector('#profileDropdown, .profile-select, #profileSelect');
      if (profileSelect){ profileSelect.style.marginBottom = '4px'; }

      // 4) Close "X" top-right
      const modalRoot = (typeof modalContent === 'object' && modalContent && modalContent.nodeType === 1) ? modalContent : wizard.closest('.modal') || document.querySelector('.modal');
      if (modalRoot){
        const modalContentEl = modalRoot.querySelector('.modal-content') || modalRoot;
        let closeBtn = modalContentEl.querySelector('.btn-close, .modal-close, .close');
        if (!closeBtn){
          closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'btn-close';
          closeBtn.innerHTML = '&times;';
          closeBtn.style.fontSize = '1.25rem';
          closeBtn.style.lineHeight = '1';
          closeBtn.style.background = 'transparent';
          closeBtn.style.border = '0';
          modalContentEl.appendChild(closeBtn);
        }
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '8px';
        closeBtn.style.right = '8px';
        closeBtn.addEventListener('click', () => {
          try { if (typeof closeWizard === 'function') { closeWizard(); return; } } catch(_){}
          const modal = modalContentEl.closest('.modal');
          if (modal){
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
          }
        });
      }

      // 5) Search results dropdown left-under the city input
      const placeInput = wizard.querySelector('#placeInput');
      const searchBtn  = wizard.querySelector('#searchBtn');
      const searchRow  = wizard.querySelector('.search-row');
      if (searchBtn && placeInput && searchRow){
        const alignResults = () => {
          const menus = Array.from(document.querySelectorAll('.dropdown-menu'));
          const openMenu = menus.find(m => (m.classList.contains('show') || m.classList.contains('open') || m.style.display === 'block') && !m.closest('#cityDropdown'));
          if (!openMenu) return;
          if (openMenu.parentNode !== searchRow){ searchRow.appendChild(openMenu); }
          openMenu.classList.add('search-results');
          openMenu.style.position = 'absolute';
          openMenu.style.left = '0px';
          openMenu.style.top = (placeInput.offsetTop + placeInput.offsetHeight + 4) + 'px';
        };
        searchBtn.addEventListener('click', () => setTimeout(alignResults, 50));
      }

    }catch(_){}
  };

  startWizard.__enhanced_20250820_b = true;
})();
// ===================================================
// Wizard Enhancer v3 (2025-08-20-c) — additive only
// ===================================================
(function(){
  if (typeof startWizard !== 'function') return;
  if (startWizard.__enhanced_20250820_c) return;
  const __orig = startWizard;
  startWizard = function(modalContent){
    __orig.apply(this, arguments);
    try{
      const wizard = document.querySelector('.wizard');
      if (!wizard) return;

      // Actions inside the flow
      const actions = wizard.querySelector('.wizard-actions');
      if (actions){ actions.style.position = 'static'; actions.style.marginTop = '8px'; actions.style.padding = '0'; }

      // Compact nav buttons
      wizard.querySelectorAll('.nav-btn').forEach(btn => { btn.style.width = '48px'; btn.style.height = '48px'; });

      // Align search results menu under left of city input
      const placeInput = wizard.querySelector('#placeInput');
      const searchBtn  = wizard.querySelector('#searchBtn');
      const searchRow  = wizard.querySelector('.search-row');
      const realign = () => {
        if (!placeInput || !searchRow) return;
        const openMenus = Array.from(document.querySelectorAll('.dropdown-menu'))
          .filter(m => (m.classList.contains('show') || m.classList.contains('open') || m.style.display === 'block'));
        const menu = openMenus.find(m => !m.closest('#cityDropdown'));
        if (!menu) return;
        if (menu.parentNode !== searchRow){ searchRow.appendChild(menu); }
        menu.classList.add('search-results');
        menu.style.position = 'absolute';
        menu.style.left = '0px';
        menu.style.top  = (placeInput.offsetTop + placeInput.offsetHeight + 4) + 'px';
      };
      if (searchBtn){ searchBtn.addEventListener('click', () => setTimeout(realign, 40)); }
    }catch(_){}
  };
  startWizard.__enhanced_20250820_c = true;
})();

// ===================================================
// Compact NUCLEAR patch (2025-08-20-d) — additive only
// Инжектира свои стилове най-накрая + следи DOM промените,
// за да се приложат промените дори при динамични екрани.
// ===================================================
(function(){
  if (window.__compact_nuclear_20250820d) return;
  window.__compact_nuclear_20250820d = true;

  function injectStyle(){
    if (document.getElementById('compact-overrides-style-d')) return;
    const css = `
:root, body, body * { font-weight: 400 !important; }
.modal .modal-content{ margin:0.1vh auto 0 !important; padding:8px 10px 20px !important; }
.wizard{ gap:4px !important; padding:8px 10px !important; }
.wizard-actions{ position:static !important; margin-top:6px !important; padding:0 !important; }
.nav-btn{ width:44px !important; height:44px !important; }
.wizard-header,.welcome-title,.profile-title,.pmenu-label{ margin-top:1px !important; margin-bottom:1px !important; }
.wizard-field label{ margin-bottom:1px !important; }
.wizard-field input[type="text"], .wizard-field input[type="date"], .wizard-field input[type="time"]{
  padding:0.25rem 0.45rem !important; font-size:0.82rem !important; border-radius:8px !important;
}
/* Профил */
#profileDropdown, .profile-select, #profileSelect{ margin-bottom:2px !important; }
#profileDropdown .dropdown-toggle, .profile-select .dropdown-toggle{ padding-top:0.25rem !important; padding-bottom:0.25rem !important; }
#profileDropdown .dropdown-menu .dropdown-item, .profile-select .dropdown-menu .dropdown-item{ padding-top:3px !important; padding-bottom:3px !important; }
.profile-inline-chooser{ display:inline-flex !important; gap:0 !important; align-items:baseline !important; }
.profile-inline-chooser>*{ margin:0 !important; }
.profile-or, .profile-create-new{ font-weight:600 !important; }

/* Търсене */
.search-row{ position:relative !important; gap:0.25rem !important; margin:2px 0 4px !important; width:min(440px,92%) !important; }
.search-row .search-btn{ padding:0.35rem 0.55rem !important; font-size:0.78rem !important; border-radius:8px !important; }
.search-row .dropdown-menu.search-results{
  position:absolute !important; left:0 !important; right:auto !important; transform:none !important;
}

/* X горе вдясно */
.modal .btn-close, .modal .modal-close, .modal .close{ position:absolute !important; top:4px !important; right:4px !important; z-index:50 !important; }
    `;
    const st = document.createElement('style');
    st.id = 'compact-overrides-style-d';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function tweakDOM(){
    const wizard = document.querySelector('.wizard');
    if (!wizard) return;

    // Заглавие "Избери профил" — минимални отстояния
    const t = Array.from(wizard.querySelectorAll('h1,h2,h3,.pmenu-label,.profile-title,.wizard-header'))
      .find(el => (el.textContent||'').trim().toLowerCase() === 'избери профил');
    if (t){ t.style.marginTop='1px'; t.style.marginBottom='1px'; }

    // "или" + "--- създай нов ---" — едно до друго, без празнина, леко bold
    const nodes = Array.from(wizard.querySelectorAll('span,div,button,a,em,strong,b,i,p,small,label'));
    const ili = nodes.find(el => (el.textContent||'').trim().toLowerCase() === 'или');
    const create = nodes.find(el => (el.textContent||'').trim().toLowerCase() === '--- създай нов ---');
    if (ili && create){
      if (!ili.parentElement.classList.contains('profile-inline-chooser') &&
          !create.parentElement.classList.contains('profile-inline-chooser')){
        const wrap = document.createElement('span');
        wrap.className = 'profile-inline-chooser';
        const first = (ili.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING) ? ili : create;
        first.parentNode.insertBefore(wrap, first);
        wrap.appendChild(ili);
        wrap.appendChild(create);
      }
      ili.classList.add('profile-or'); create.classList.add('profile-create-new');
    }

    // Бутоните да са "вътре" във формата
    const actions = wizard.querySelector('.wizard-actions');
    if (actions){
      actions.style.position='static';
      actions.style.marginTop='6px';
      actions.style.padding='0';
    }
    wizard.querySelectorAll('.nav-btn').forEach(btn => { btn.style.width='44px'; btn.style.height='44px'; });

    // X горе вдясно
    const modal = wizard.closest('.modal') || document.querySelector('.modal');
    if (modal){
      const content = modal.querySelector('.modal-content') || modal;
      let closeBtn = content.querySelector('.btn-close, .modal-close, .close');
      if (!closeBtn){
        closeBtn = document.createElement('button');
        closeBtn.type='button';
        closeBtn.className='btn-close';
        closeBtn.innerHTML='&times;';
        content.appendChild(closeBtn);
      }
      closeBtn.style.position='absolute';
      closeBtn.style.top='4px';
      closeBtn.style.right='4px';
      if (!closeBtn.__bound){
        closeBtn.__bound = true;
        closeBtn.addEventListener('click', () => {
          const m = content.closest('.modal');
          if (m){ m.style.display='none'; m.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
        });
      }
    }

    // Менюто след "ТЪРСИ" да е вляво под полето за град
    const placeInput = wizard.querySelector('#placeInput');
    const searchBtn  = wizard.querySelector('#searchBtn');
    const searchRow  = wizard.querySelector('.search-row') || placeInput?.parentElement;
    const align = () => {
      if (!placeInput || !searchRow) return;
      const openMenus = Array.from(document.querySelectorAll('.dropdown-menu'))
        .filter(m => (m.classList.contains('show') || m.classList.contains('open') || getComputedStyle(m).display === 'block') && !m.closest('#cityDropdown'));
      const menu = openMenus[0];
      if (!menu) return;
      if (menu.parentNode !== searchRow) searchRow.appendChild(menu);
      menu.classList.add('search-results');

      // По-точно позициониране по ляв ръб на input
      const rect = placeInput.getBoundingClientRect();
      const host = searchRow.getBoundingClientRect();
      menu.style.position = 'absolute';
      menu.style.left = (rect.left - host.left) + 'px';
      menu.style.top  = (placeInput.offsetTop + placeInput.offsetHeight + 4) + 'px';
    };
    if (searchBtn && !searchBtn.__aligned_d){ searchBtn.__aligned_d = true; searchBtn.addEventListener('click', () => setTimeout(align, 30)); }
  }

  function boot(){ injectStyle(); tweakDOM(); }
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', boot);
  new MutationObserver(boot).observe(document.documentElement, {childList:true, subtree:true});
  console.log('Compact overrides v2025-08-20-d applied');
})();

// Enter on #mdCity selects first dropdown item or triggers search
try{
  const mdCityEl = document.getElementById('mdCity');
  if (mdCityEl){
    mdCityEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const menu = document.getElementById('mdCityMenu');
      const dd   = document.getElementById('mdDropdown');
      const first = menu?.querySelector('.dropdown-item');
      if (dd?.classList.contains('open') && first){
        e.preventDefault();
        first.click();
      }else{
        e.preventDefault();
        document.getElementById('mdSearch')?.click();
      }
    });
  }
}catch(_){}

// === Open city dropdown on input focus if there are items (wizard + My Data + Profiles) ===
(function(){
  try{
    function openIfHasItems(rootSel, ddSel){
      const root = document.querySelector(rootSel);
      if (!root) return;
      const dd = root.querySelector(ddSel);
      if (!dd) return;
      const menu = dd.querySelector('.dropdown-menu');
      const toggle = dd.querySelector('.dropdown-toggle');
      if (menu && menu.children.length){
        dd.classList.add('open');
        if (toggle) toggle.setAttribute('aria-expanded','true');
      }
    }
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === 'placeInput'){ openIfHasItems('.wizard', '#cityDropdown'); }
      if (t.id === 'mdCity'){     openIfHasItems('#myDataContent', '#mdDropdown'); }
      if (t.id === 'pmCity'){     openIfHasItems('#profilesContent', '#pmCityDropdown'); }
    });
  }catch(_){}
})();

/* ======================================================================
   [2025-08-24] First-registration hook:
   - When the user confirms the wizard (clicks #btnYes), set a local flag.
   - After the wizard saves data (finishFlow → calls showProfileMenu),
     intercept showProfileMenu once to open My Data and show a pale-pink
     intro message with an OK button.
   - The message is shown only once per browser (localStorage).
   - Additive only: doesn't modify existing functions; wraps them safely.
   ====================================================================== */

(function setupFirstRegistrationMyDataIntro(){
  try{
    // 1) Mark that we are entering the first-registration flow
    document.addEventListener('click', function(e){
      try{
        const yes = e.target && (e.target.id === 'btnYes' ? e.target : (e.target.closest && e.target.closest('#btnYes')));
        if (yes){
          try{ localStorage.setItem('pendingMyDataIntro','1'); }catch(_){}
        }
      }catch(_){}
    }, true);

    // 2) Helper: build and show the pale-pink intro overlay inside #myDataContent
    /*
    window.showMyDataIntro = function(){
      try{
        const root = document.getElementById('myDataContent');
        if (!root || root.querySelector('.md-intro')) return;
        const overlay = document.createElement('div');
        overlay.className = 'md-intro';
        overlay.innerHTML = `
          <div class="md-intro-card" role="alertdialog" aria-describedby="mdIntroText">
            <p id="mdIntroText">
              Това е вашата натална карта и вашите данни, ако искате може да ги промените тук.
              Наслаждвайте се на сайта.
            </p>
            <button type="button" class="md-intro-ok">ОК</button>
          </div>`;
        root.appendChild(overlay);
        // Backdrop click closes if user clicks outside the card
        try{
          overlay.addEventListener('click', function(ev){
            if (ev.target === overlay){ try{ overlay.remove(); }catch(_){ } }
          }, { passive: true });
        }catch(_){}
        // Auto-close after 4 seconds so it never blocks interaction
        try{
          setTimeout(function(){ try{ overlay.remove(); }catch(_){ } }, 4000);
        }catch(_){}

        const btn = overlay.querySelector('.md-intro-ok');
        btn?.addEventListener('click', () => { try{ overlay.remove(); }catch(_){}});
        // Esc also closes
        document.addEventListener('keydown', function onEsc(ev){
          if (ev.key === 'Escape'){ try{ overlay.remove(); }catch(_){} document.removeEventListener('keydown', onEsc); }
        });
      }catch(_){}
    };
*/
    // 3) Wrap showProfileMenu to trigger only after data-saving is done
    if (typeof showProfileMenu === 'function' && !showProfileMenu.__introWrapped){
      const __origShowProfileMenu = showProfileMenu;
      showProfileMenu = async function(){
        const ret = __origShowProfileMenu.apply(this, arguments);
        try{
          const pending = (localStorage.getItem('pendingMyDataIntro') === '1');
          const seen    = (localStorage.getItem('myDataIntroSeen') === '1');
          if (pending && !seen){
            try{ await renderMyDataUI(); }catch(_){}
            try{ window.showMyDataIntro?.(); }catch(_){}
            try{ localStorage.setItem('myDataIntroSeen','1'); }catch(_){}
            try{ localStorage.removeItem('pendingMyDataIntro'); }catch(_){}
          }
        }catch(_){}
        return ret;
      };
      showProfileMenu.__introWrapped = true;
    }
  }catch(err){ console.warn('[first-reg intro] setup failed:', err); }
})();

/* =====================================================================
   First-registration: reliably open "Моите данни" + pink intro overlay
   (non-invasive wrapper; does NOT modify existing functions)
   ===================================================================== */
(function(){
  try{
    // Helper you can call manually from console for testing
    window.openMyDataWithIntro = async function(){
      try{
        await renderMyDataUI();
        window.showMyDataIntro?.();
      }catch(err){ console.warn("[openMyDataWithIntro] failed:", err); }
    };

    // Mark start of first registration when user clicks "Да" (btnYes)
    document.addEventListener("click", function(e){
      try{
        const yes = e.target && (e.target.id === "btnYes" ? e.target : (e.target.closest && e.target.closest("#btnYes")));
        if (yes){ localStorage.setItem("pendingMyDataIntro","1"); }
      }catch(_){}
    }, true);

    // 1) Wrap finishFlow so that right after successful save we open the modal + intro
    if (!window.finishFlow__wrapped && typeof window.finishFlow === "function"){
      const __origFinish = window.finishFlow;
      window.finishFlow = async function(...args){
        const result = await __origFinish.apply(this, args);
        try{
          const pending = (localStorage.getItem("pendingMyDataIntro") === "1");
          const seen    = (localStorage.getItem("myDataIntroSeen") === "1");
          if (pending && !seen){
            await renderMyDataUI();
            window.showMyDataIntro?.();
            localStorage.setItem("myDataIntroSeen","1");
            localStorage.removeItem("pendingMyDataIntro");
          }
        }catch(err){ console.warn("[first-reg intro via finishFlow] err:", err); }
        return result;
      };
      window.finishFlow__wrapped = true;
    }

    // 2) Also keep the guard on showProfileMenu (in case other flows call it)
    if (!window.showProfileMenu__wrapped && typeof window.showProfileMenu === "function"){
      const __origShow = window.showProfileMenu;
      window.showProfileMenu = async function(...args){
        const ret = __origShow.apply(this, args);
        try{
          const pending = (localStorage.getItem("pendingMyDataIntro") === "1");
          const seen    = (localStorage.getItem("myDataIntroSeen") === "1");
          if (pending && !seen){
            await renderMyDataUI();
            window.showMyDataIntro?.();
            localStorage.setItem("myDataIntroSeen","1");
            localStorage.removeItem("pendingMyDataIntro");
          }
        }catch(err){ console.warn("[first-reg intro via showProfileMenu] err:", err); }
        return ret;
      };
      window.showProfileMenu__wrapped = true;
    }
  }catch(err){ console.warn("[first-reg intro bootstrap] failed:", err); }
})();

// ========================= NOW (current moment) helpers =========================
async function __getUserCityGeoOrBody(user){
  let cityGeo = null, body = null;
  try {
    // try users/<uid>/user/main
    const mainRef = doc(db, "users", user.uid, "user", "main");
    const main = await getDoc(mainRef);
    if (main.exists()){
      const d = main.data() || {};
      cityGeo = d.cityGeo || null;
      body    = d.body || d.astroPayload || null;
    } else {
      // fallback: first subdoc under users/<uid>/user
      const colSnap = await getDocs(collection(doc(db,"users",user.uid),"user"));
      if (!colSnap.empty){
        const d = (colSnap.docs[0].data() || {});
        cityGeo = d.cityGeo || null;
        body    = body || d.body || d.astroPayload || null;
      }
    }
    // last resort: root user doc
    if (!cityGeo){
      const rootRef = doc(db, "users", user.uid);
      const root = await getDoc(rootRef);
      if (root.exists()){
        const d = root.data() || {};
        cityGeo = d.cityGeo || null;
        body    = body || d.body || d.astroPayload || null;
      }
    }
    // very last: extract from a body-like object
    if (!cityGeo && body){
      cityGeo = {
        latitude:  Number(body.latitude),
        longitude: Number(body.longitude),
        timezone_offset: Number(body.timezone)
      };
    }
  } catch(e){ console.warn("[NOW] fetch user city/body failed:", e); }
  return { cityGeo, body };
}

async function runNowCallsUsingUserLocation(user){
  console.log('[NOW] runNowCallsUsingUserLocation start for user:', user?.uid);
  const { cityGeo, body } = await __getUserCityGeoOrBody(user);
  let lat=null, lon=null, tz=null;
  if (cityGeo && cityGeo.latitude!=null && cityGeo.longitude!=null){
    lat = Number(cityGeo.latitude);
    lon = Number(cityGeo.longitude);
    tz  = Number(cityGeo.timezone_offset!=null ? cityGeo.timezone_offset : -new Date().getTimezoneOffset()/60);
  } else if (body){
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    tz  = Number(body.timezone!=null ? body.timezone : -new Date().getTimezoneOffset()/60);
    console.warn('[NOW] cityGeo липсва, ползвам координати от body:', {lat, lon, tz});
  } else {
    console.warn('[NOW] Локация липсва и няма body → пропускам NOW заявките.');
    return;
  }
  const now = new Date();
  const nowBody = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    date: now.getDate(),
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: 0,
    latitude: lat,
    longitude: lon,
    timezone: tz,
    config: { observation_point: "topocentric", ayanamsha: "tropical", language: "en" }
  };

  // 1) Print request body
  console.log("[NOW][ASTRO REQUEST BODY]", nowBody);

  // 2) Two API calls: planets + natal chart (wheel). Print responses.
  try {
    const [plNow, wheelNow] = await Promise.all([
      callApi("planets", nowBody),
      // if your API expects "natal chart" under another path, adjust here:
      callApi("natal-wheel-chart", nowBody)
    ]);
    console.log("[NOW][RESPONSE] planets:", plNow);
    console.log("[NOW][RESPONSE] natal-wheel-chart:", wheelNow);
      // Show top-left natal wheel drop-in using NOW response
      try {
        var __nw = (typeof wheelNow !== 'undefined') ? wheelNow : null;
        var __srcNow = __nw && (__nw.output || __nw.url || __nw.image || __nw.src);
        if (__srcNow){
          (function(){
            var container = document.getElementById('natalDrop');
            var img = document.getElementById('natalDropImg');
            if (container && img){
              try{
                container.classList.add('loading');
                var v = container.querySelector('#natalSpinner');
                if(v){ v.play && v.play().catch(function(){}); }
              }catch(_){}
              document.getElementById('natalRight').classList.remove('hidden')
              img.src = __srcNow;
              container.classList.remove('show'); void container.offsetWidth;
              container.classList.add('show');
              container.dataset.shown = '1';
              container.removeAttribute('aria-hidden');
            }
          })();
        }
      } catch(_){}
    
  try { window.__NOW_PLANETS_RAW = plNow; __tryComputeTransitAspects(); } catch(_){}
} catch (e){
    console.error("[NOW][ERROR]", e);
  }
}
// ======================= END NOW helpers

// ========================= STORED BODY helpers =========================
async function runStoredBodyCalls(user){
  console.log('[STORED] runStoredBodyCalls start for user:', user?.uid);
  const { body } = await __getUserCityGeoOrBody(user);
  if (!body){
    console.warn("[STORED] Няма запазено body за потребителя – пропускам 3-те заявки.");
    return;
  }
  // 1) Принтирай body-то
  console.log("[STORED][ASTRO REQUEST BODY]", body);

  // 2) Пусни 3-те заявки: planets, houses, natal chart (wheel)
  try {
    console.log("[STORED] Sending API calls: planets, houses & natal-wheel-chart");
    const [plRes, housesRes, wheelRes] = await Promise.all([
      callApi("planets", body),
      // Ако endpoint-ът за домове при теб е различен, коригирай:
      callApi("houses", body),
      callApi("natal-wheel-chart", body)
    ]);
    console.log("[STORED][RESPONSE] planets:", plRes);
    console.log("[STORED][RESPONSE] houses:", housesRes);
    console.log("[STORED][RESPONSE] natal-wheel-chart:", wheelRes);
  try { window.__NATAL_PLANETS_RAW = plRes; __tryComputeTransitAspects(); } catch(_){}
} catch (e){
    console.error("[STORED][ERROR]", e);
  }
}
// ======================= END STORED BODY helpers =======================

/* ================================================================
   ASPECTS (адаптирано от old.js): дефиниции + сметки
   ================================================================= */
const __ASPECTS = [
  { key: "conjunction", nameBG: "Съединение", angle: 0,   orb: 8 },
  { key: "semi-sextile",nameBG: "Полусекстил", angle: 30,  orb: 2 },
  { key: "sextile",     nameBG: "Секстил",     angle: 60,  orb: 4 },
  { key: "square",      nameBG: "Квадрат",     angle: 90,  orb: 6 },
  { key: "trine",       nameBG: "Тригон",      angle: 120, orb: 6 },
  { key: "quincunx",    nameBG: "Квинконс",    angle: 150, orb: 3 },
  { key: "opposition",  nameBG: "Опозиция",    angle: 180, orb: 8 }
];

const __ALLOWED = new Set([
  "Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn",
  "Uranus","Neptune","Pluto","True Node","Chiron","Lilith"
]);

function __degNorm(d){ d = Number(d)||0; return ((d % 360) + 360) % 360; }
function __angleDiff(a,b){
  const d = Math.abs(__degNorm(a) - __degNorm(b));
  return d > 180 ? 360 - d : d;
}
function __closestAspect(a,b){
  const diff = __angleDiff(a,b);
  let best = null;
  for (const asp of __ASPECTS){
    const delta = Math.abs(diff - asp.angle);
    if (delta <= asp.orb){
      const hit = { ...asp, delta, diff };
      best = (!best || delta < best.delta) ? hit : best;
    }
  }
  return best;
}

/* Извлича карта { "Sun": 123.45, ... } от planets отговора (ползва наличното _iterPlanets/_sanitizeDeg) */
function __extractPlanetMap(planetsRes){
  const items = _iterPlanets(planetsRes);
  const map = {};
  for (const p of items){
    const name = p?.planet?.en || p?.planet || "";
    const deg  = _sanitizeDeg(p?.fullDegree ?? p?.degree);
    if (name && deg!=null && (!__ALLOWED.size || __ALLOWED.has(name))){
      map[name] = deg;
    }
  }
  return map;
}

/* Главна функция: ако имаме и натални, и NOW планети – печата аспектите в конзолата */
function __tryComputeTransitAspects(){
  const natalRes = window.__NATAL_PLANETS_RAW;
  const nowRes   = window.__NOW_PLANETS_RAW;
  if (!natalRes || !nowRes) return;

  const natal  = __extractPlanetMap(natalRes);
  const trans  = __extractPlanetMap(nowRes);
  const natalK = Object.keys(natal);
  const transK = Object.keys(trans);

  const pairs = [];
  for (const nName of natalK){
    for (const tName of transK){
      const a = natal[nName], b = trans[tName];
      const asp = __closestAspect(a,b);
      if (asp){
        pairs.push({
          natal:   { name: nName, deg: a },
          transit: { name: tName, deg: b },
          aspect:  asp
        });
      }
    }
  }

  // Принт в конзолата
  try{
    console.groupCollapsed("%c[ASPECTS] Транзити (натал ↔ небе сега)","color:#7c3aed;font-weight:900");
  }catch(_){ console.log("[ASPECTS] Транзити (натал ↔ небе сега)"); }
  for (const r of pairs){
    const nBG = (typeof planets_BG !== "undefined" && planets_BG && planets_BG[r.natal.name]) ? planets_BG[r.natal.name] : r.natal.name;
    const tBG = (typeof planets_BG !== "undefined" && planets_BG && planets_BG[r.transit.name]) ? planets_BG[r.transit.name] : r.transit.name;
    console.log(
      `${nBG} ${r.natal.deg.toFixed(2)}°  —  ${r.aspect.nameBG} (${r.aspect.angle}°) —  ${tBG} ${r.transit.deg.toFixed(2)}°   | орбис ${r.aspect.delta.toFixed(2)}°`
    );
  }
  try{
    console.table(pairs.map(r => ({
      Natal: r.natal.name, NatalDeg: r.natal.deg.toFixed(2),
      Aspect: r.aspect.key, Angle: r.aspect.angle, Orb: r.aspect.delta.toFixed(2),
      Transit: r.transit.name, TransitDeg: r.transit.deg.toFixed(2)
    })));
    console.groupEnd();
  }catch(_){}

  /* ===== Build 'cards' array per requested format and print to console ===== */
  try {
    const ALLOWED_11 = new Set(["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","True Node"]);
    const slug = (typeof _slugLetters === "function") ? _slugLetters : (s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,""));
    const getSignBG = (res, enName) => {
      try {
        const arr = Array.isArray(res?.output) ? res.output
                  : (res?.output?.Planets || res?.Planets || []);
        for (const p of arr) {
          const name = p?.planet?.en || p?.planet;
          if (name === enName) {
            const signEn = p?.zodiac_sign?.name?.en ?? p?.zodiac_sign?.en ?? p?.sign;
            return (typeof signs_BG !== "undefined" && signs_BG && signs_BG[signEn]) ? signs_BG[signEn] : (signEn || "");
          }
        }
      } catch(_) {}
      return "";
    };

    const cards = [];
    for (const r of pairs) {
      if (!ALLOWED_11.has(r.natal.name) || !ALLOWED_11.has(r.transit.name)) continue;
      const p1 = r.natal.name, p2 = r.transit.name;
      const pl1BG = (typeof planets_BG !== "undefined" && planets_BG && planets_BG[p1]) ? planets_BG[p1] : p1;
      const pl2BG = (typeof planets_BG !== "undefined" && planets_BG && planets_BG[p2]) ? planets_BG[p2] : p2;
      const sign1BG = getSignBG(natalRes, p1);
      const sign2BG = getSignBG(nowRes, p2);
      cards.push({
        p1Img: `/images/planets_video/${slug(p1)}.mp4`,
        pl1: pl1BG,
        sign1: sign1BG,
        aspect: r.aspect?.nameBG || "",
        p2Img: `/images/planets_video/${slug(p2)}.mp4`,
        pl2: pl2BG,
        sign2: sign2BG
      });
    }

    // Print and expose
    console.log("[ASPECT CARDS]", cards);
    try { console.table(cards); } catch(_) {}
    try { 
  window.aspectCards = cards; 
  window.dispatchEvent(new CustomEvent("aspectCards:updated", { detail:{ cards } }));
} catch(_){}
  } catch (e) {
    console.warn("[ASPECT CARDS] build failed:", e);
  }

}

/* === qCityResults enhancements (auto-generated) === */
// 2025-08-24T09:45:18
// Make #qCityResults behave as a themed dropdown below #qCity with dblclick/Enter selection & close.
(function(){ 
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  ready(function(){ 
    try{ 
      var input = document.getElementById('qCity');
      var results = document.getElementById('qCityResults');
      if(!input || !results) return;

      // Keep a few pixels below input and same width
      function position(){
        try{ results.style.marginTop = '6px'; results.style.width = (input.getBoundingClientRect().width||input.offsetWidth)+'px'; }catch(_ ){}
        if(results.parentNode !== input.parentNode){
          try{ input.parentNode.insertBefore(results, input.nextSibling); }catch(_ ){}
        }
      }
      position();
      window.addEventListener('resize', position);

      function isOpen(){
        return results.style.display !== 'none';
      }
      function openList(){
        results.style.display = 'block';
        results.setAttribute('data-open','1');
      }
      function closeList(){
        results.style.display = 'none';
        results.removeAttribute('data-open');
      }
      // If there are options, show on input focus
      input.addEventListener('focus', function(){
        if(results.options && results.options.length>0) openList();
      });

      // Double-click selection
      results.addEventListener('dblclick', function(){
        var opt = results.options[results.selectedIndex];
        if(opt){
          input.value = opt.textContent || opt.value || '';
          input.dispatchEvent(new Event('input', {bubbles:true}));
          input.dispatchEvent(new Event('change', {bubbles:true}));
        }
        closeList();
        input.focus();
      });

      // Enter key on input confirms current/first option when open
      input.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && isOpen()){ 
          e.preventDefault();
          var idx = results.selectedIndex >= 0 ? results.selectedIndex : 0;
          var opt = results.options[idx];
          if(opt){
            results.selectedIndex = idx;
            results.dispatchEvent(new Event('dblclick', {bubbles:true}));
          } else {
            closeList();
          }
        }
      });

      // Click outside closes
      document.addEventListener('click', function(e){
        if(!results.contains(e.target) && e.target!==input) closeList();
      });

      // If code elsewhere populates results, auto-open when it gains children
      const obs = new MutationObserver(function(){ 
        if(results.options && results.options.length>0) openList();
        else closeList();
        position();
      });
      try{ obs.observe(results, {childList:true, subtree:false}); }catch(_ ){}
    }catch(err){ console.warn('qCityResults enhancement error:', err); }
  });
})();
/* === END qCityResults enhancements === */

/* === cityDropdown enhancements (auto-generated) === */
// 2025-08-24T09:49:32
// Double-click or Enter selects a city and closes the dropdown; keep dropdown a few px below #placeInput.
(function(){ 
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  ready(function(){ 
    try{ 
      var dd = document.getElementById('cityDropdown');
      var placeInput = document.getElementById('placeInput');
      if(!dd || !placeInput) return;
      var menu = dd.querySelector('.dropdown-menu');
      if(!menu) return;

      function isOpen(){ return dd.classList.contains('open') || menu.style.display==='block' || !!menu.offsetParent; }
      function openMenu(){ dd.classList.add('open'); menu.style.display='block'; dd.setAttribute('aria-expanded','true'); }
      function closeMenu(){ dd.classList.remove('open'); dd.classList.remove('show'); menu.style.display='none'; dd.setAttribute('aria-expanded','false'); }

      // Ensure sits a few pixels below input if any external code fails to call positionCityDropdown
      try{ dd.style.top = (placeInput.offsetTop + placeInput.offsetHeight + 6) + 'px'; }catch(_ ){}

      // Double-click to choose
      menu.addEventListener('dblclick', function(e){
        var item = e.target && (e.target.closest ? e.target.closest('.dropdown-item') : null);
        if(!item) return;
        var value = (item.dataset && item.dataset.value) ? item.dataset.value : (item.textContent||'').trim();
        if(value){
          placeInput.value = value;
          placeInput.dispatchEvent(new Event('input', {bubbles:true}));
          placeInput.dispatchEvent(new Event('change', {bubbles:true}));
        }
        closeMenu();
        placeInput.focus();
      });

      // Enter key: select active/first item when open
      placeInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && isOpen()){ 
          e.preventDefault();
          var active = menu.querySelector('.dropdown-item.active') || menu.querySelector('.dropdown-item');
          if(active) active.dispatchEvent(new Event('dblclick', {bubbles:true}));
          else closeMenu();
        }
      });

      // Close on outside click
      document.addEventListener('click', function(e){
        if(!dd.contains(e.target) && e.target!==placeInput) closeMenu();
      });
    }catch(err){ console.warn('cityDropdown enhancement error:', err); }
  });
})();
/* === END cityDropdown enhancements === */

/* === wizard city dropdown fixes (auto-generated) === */
// 2025-08-24T09:57:46
// Ensures: 
// - #cityDropdown is a child of the .search-row and aligned just under #placeInput
// - Double-click or Enter selects and closes
// - Robust positioning using bounding rects (no overlay on the input)
(function(){ 
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  ready(function(){
    try{ 
      var wizard = document.querySelector('.wizard');
      if(!wizard) return;
      var placeInput = wizard.querySelector('#placeInput');
      var dd = wizard.querySelector('#cityDropdown');
      if(!placeInput || !dd) return;
      var searchRow = placeInput.closest('.search-row') || placeInput.parentElement;
      if(!searchRow) return;
      // Move dropdown as a child of .search-row
      if(dd.parentElement !== searchRow){ try{ searchRow.appendChild(dd); }catch(_ ){} }
      try{ searchRow.style.position = 'relative'; }catch(_ ){}
      // Positioner: align to input using viewport rects converted to row-local coords
      function positionDD(){
        try{
          var rInput = placeInput.getBoundingClientRect();
          var rRow   = searchRow.getBoundingClientRect();
          var topPx  = Math.max(0, Math.round(rInput.bottom - rRow.top + 6));
          var leftPx = Math.max(0, Math.round(rInput.left   - rRow.left));
          dd.style.position = 'absolute';
          dd.style.left = leftPx + 'px';
          dd.style.top  = topPx  + 'px';
          dd.style.right = 'auto';
          // match width
          var w = Math.round(rInput.width || placeInput.offsetWidth || 0);
          if(w) dd.style.width = w + 'px';
        }catch(_ ){}
      }
      // Expose override
      try{ window.positionCityDropdown = positionDD; }catch(_ ){}
      positionDD();
      window.addEventListener('resize', positionDD);
      window.addEventListener('orientationchange', positionDD);
      
      // Delegated dblclick on items as a safety net
      var menu = dd.querySelector('.dropdown-menu');
      var ddToggle = dd.querySelector('.dropdown-toggle');
      function closeMenu(){ dd.classList.remove('open'); ddToggle?.setAttribute('aria-expanded','false'); }
      function selectItem(el){
        try{ 
          var value = (el.dataset && el.dataset.value) ? el.dataset.value : (el.textContent||'').trim();
          var lbl = dd.querySelector('.dropdown-toggle .label');
          if(lbl) lbl.textContent = value || 'избери град';
        }catch(_ ){}
        closeMenu();
        placeInput?.focus();
      }
      if(menu){
        menu.addEventListener('dblclick', function(e){
          var item = e.target && (e.target.closest ? e.target.closest('.dropdown-item') : null);
          if(item) selectItem(item);
        });
        // Keyboard: Enter selects active/first item when menu open
        placeInput.addEventListener('keydown', function(e){
          if(e.key !== 'Enter') return;
          if(!dd.classList.contains('open')) return;
          e.preventDefault();
          var active = menu.querySelector('.dropdown-item.active') || menu.querySelector('.dropdown-item');
          if(active) selectItem(active); else closeMenu();
        });
      }
    }catch(err){ console.warn('wizard city dropdown fixes error:', err); }
  });
})();
/* === END wizard city dropdown fixes === */

/* === natal drop-in hook (auto-generated) === */
// 2025-08-24T10:59:50
// Show a top-left natal chart that "drops in" once the chart image is available.
(function(){ 
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  ready(function(){
    var container = document.getElementById('natalDrop');
    var img = document.getElementById('natalDropImg');
    if(!container || !img) return;

    
    // Spinner video overlay
    (function(){
      try{
        var spWrap = container.querySelector('.spinner');
        if(!spWrap){
          spWrap = document.createElement('div');
          spWrap.className = 'spinner';
          var vid = document.createElement('video');
          vid.id = 'natalSpinner';
          vid.src = '/videos/spiningChart.mp4';
          vid.autoplay = true;
          vid.loop = true;
          vid.muted = true;
          vid.playsInline = true;
          vid.setAttribute('playsinline', '');
          spWrap.appendChild(vid);
          container.appendChild(spWrap);
        }
      }catch(_){}
    })();
    // Hide spinner when image finishes loading or errors
    try{
      img.addEventListener('load', function(){ container.classList.remove('loading'); }, { passive:true });
      img.addEventListener('error', function(){ container.classList.remove('loading'); }, { passive:true });
    }catch(_){}
function show(src){
      if(!src) return;
      if(container.dataset.shown === '1') return;
      
      try{
        container.classList.add('loading');
        var v = container.querySelector('#natalSpinner');
        if(v){ v.play && v.play().catch(function(){}); }
      }catch(_){}
img.src = src;
      // restart animation if repeated
      container.classList.remove('show');
      void container.offsetWidth;
      container.classList.add('show');
      container.dataset.shown = '1';
      container.removeAttribute('aria-hidden');
    }

    // 1) If #mdChart exists and has a src already, show immediately
    var md = document.getElementById('mdChart');
    if(md && md.src) show(md.src);

    // 2) When #mdChart loads or its src changes, show
    if(md){
      md.addEventListener('load', function(){ try{ show(md.src); }catch(_ ){} }, {once:true});
      // Attribute observer for src changes
      try{
        var mo = new MutationObserver(function(muts){
          muts.forEach(function(m){ if(m.attributeName==='src') show(md.src); });
        });
        mo.observe(md, {attributes:true, attributeFilter:['src']});
      }catch(_ ){}
    }

    // 3) Fallback: if global wheel image is exposed (wh.output) later
    setTimeout(function(){
      try{ if(window.wh && window.wh.output) show(window.wh.output); }catch(_ ){}
    }, 1500);
  });
})();
/* === END natal drop-in hook === */

/* === Natal Right Container: wrap and center natal chart === */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  function el(id){ return document.getElementById(id); }

  function ensureNestingAndCenter(){
    var right = el('natalRight');
    var drop  = el('natalDrop');
    if(!right || !drop) return;

    // Ensure drop is inside right
    if(drop.parentElement !== right){
      try{ right.appendChild(drop); }catch(_){}
    }

    // Accessibility: ensure visible
    right.removeAttribute('aria-hidden');

    // Mobile: clear fixed heights, keep natural flow
    var img = el('natalDropImg');
    var isMobile = (window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
    if(isMobile){
      try{ right.style.height = ''; }catch(_){}
      try{ drop.style.height  = ''; }catch(_){}
      return;
    }

    // Desktop: match container height to image
    if(img){
      var h = (img.clientHeight || img.naturalHeight || 0);
      if(h){
        try{ right.style.height = h + 'px'; }catch(_){}
        try{ drop.style.height  = h + 'px'; }catch(_){}
      }
    }
  }

  // Init + listeners
  ready(function(){
    ensureNestingAndCenter();
    window.addEventListener('resize', ensureNestingAndCenter, {passive:true});
    var img = el('natalDropImg');
    if(img){ img.addEventListener('load', ensureNestingAndCenter, {passive:true}); }
    setTimeout(ensureNestingAndCenter, 300);
    setTimeout(ensureNestingAndCenter, 600);
  });
})();

/* === Aspect Credits: build & loop like movie credits === */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }

  function makeRow(card){
    const row = document.createElement('div');
    row.className = 'aspect-row';
    row.innerHTML = [
      '<span class="kw">Транзитен/а</span>',
      `<video class="icon-planet" src="${card.p2Img}" autoplay muted loop playsinline></video>`,
      `<span class="pl2">${card.pl2}</span>`,
      '<span class="kw">в</span>',
      `<span class="sign2">${card.sign2}</span>`,
      '<span class="kw">прави</span>',
      `<span class="asp">${card.aspect}</span>`,
      '<span class="kw">с</span>',
      `<video class="icon-planet" src="${card.p1Img}" autoplay muted loop playsinline></video>`,
      `<span class="pl1">${card.pl1}</span>`,
      '<span class="kw">в</span>',
      `<span class="sign1">${card.sign1}</span>`
    ].join(' ');
    return row;
  }

  function ensureContainer(){
    const right = document.getElementById('natalRight');
    if(!right) return null;
    let box = document.getElementById('aspectCredits');
    if(!box){
      box = document.createElement('div');
      box.id = 'aspectCredits';
      box.className = 'aspect-credits';
      box.setAttribute('aria-live','polite');
      box.innerHTML = `<div class="credits-mask"><div class="credits-track"></div></div>`;
      right.appendChild(box);
    }
    return box;
  }

  function positionBox(box){
  try{
    var isMobile = (window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
    if (isMobile){
      // On mobile the info panel is in normal flow; clear inline overrides and bail.
      box.style.left = '';
      box.style.height = '';
      return;
    }
    const img  = document.getElementById('natalDropImg');
    const w    = (img?.getBoundingClientRect().width || img?.clientWidth || 0);
    const h    = (img?.getBoundingClientRect().height || img?.clientHeight || 0);
    if (w) box.style.left = `calc(${Math.round(w)}px + 16px)`;
    if (h) box.style.height = `${Math.round(h)}px`;
  }catch(_){}
}



  function render(cards){
    const box = ensureContainer();
    if(!box) return;
    if(!Array.isArray(cards) || !cards.length){ box.style.display = 'none'; return; }
    box.style.display = '';

    const track = box.querySelector('.credits-track');
    track.innerHTML = '';

    // група 1
    const g1 = document.createElement('div'); g1.className = 'credits-group';
    cards.forEach(c => g1.appendChild(makeRow(c)));
    // група 2 (клонинг за безкраен луп)
    const g2 = g1.cloneNode(true);
    track.append(g1, g2);

    // скорост – 2.2 сек/ред (минимум 18 s)
    const dur = Math.max(18, cards.length * 2.2);
    box.style.setProperty('--dur', `${dur}s`);

    positionBox(box);
  }

  function boot(){
    const tried = render(window.aspectCards || []);
    // ако данните дойдат по-късно – слушай и евентуално опитай на интервал
    let attempts = 0, timer = null;

    const tryPoll = () => {
      attempts++;
      if (Array.isArray(window.aspectCards) && window.aspectCards.length){
        render(window.aspectCards);
        clearInterval(timer);
      }
      if (attempts > 40) clearInterval(timer); // ~20 сек макс.
    };

    if (!Array.isArray(window.aspectCards) || !window.aspectCards.length){
      timer = setInterval(tryPoll, 500);
    }

    // ресайз → подравняване спрямо колелото
    window.addEventListener('resize', () => {
      const box = document.getElementById('aspectCredits'); if (box) positionBox(box);
    });
  }

  ready(boot);
})();

document.addEventListener('DOMContentLoaded', function(){
  try{
    var right = document.getElementById('natalRight');
    if(!right) return;
    if(!document.getElementById('learnMoreBtn')){
      var a = document.createElement('a');
      a.id = 'learnMoreBtn';
      a.className = 'learn-more-btn';
      a.href = 'prognostika.html';
      a.title = 'Разбери повече';
      a.textContent = 'Разбери повече';
      right.appendChild(a);
    }
  }catch(_){}
});

// === Home video tiles (hover to play) ===
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn, {once:true}); }
  ready(function initHomeVideos(){
    document.querySelectorAll('.home-video-grid .video-item').forEach(function(item){
      var v = item.querySelector('video'); if(!v) return;
      try{ v.muted = true; v.loop = true; v.playsInline = true; }catch(_){}
      item.addEventListener('mouseover', function(){ try{ v.play(); }catch(_){}});
      item.addEventListener('mouseout', function(){ try{ v.pause(); v.currentTime = 0; }catch(_){}});
      // Touch support (tap to play/pause)
      item.addEventListener('touchstart', function(){ try{ v.play(); }catch(_){} }, {passive:true});
      item.addEventListener('touchend', function(){ try{ v.pause(); }catch(_){} }, {passive:true});
    });
  });
})();

document.addEventListener("click", (e) => {
  const btn = e.target?.closest("#myDataContent .md-more-btn");
  if (btn) window.location.assign("natal.html");
}, { passive: true });




/* === PATCH v3: overlay zoom (viewport centered), per-image factor (#mdChart x2; #natalDropImg x4) === */
(function(){
  function ensureOverlay(){
    var ov = document.getElementById('zoomOverlay');
    if (!ov){
      ov = document.createElement('div');
      ov.id = 'zoomOverlay';
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('role', 'dialog');
      document.body.appendChild(ov);
      // close on click or dblclick
      ov.addEventListener('click', closeOverlay);
      ov.addEventListener('dblclick', function(e){ e.preventDefault(); closeOverlay(); }, true);
    }
    return ov;
  }

  function openOverlay(imgEl, factor){
    var ov = ensureOverlay();
    ov.innerHTML = '';
    var clone = imgEl.cloneNode(false);
    try{ clone.removeAttribute('id'); }catch(_){}
    clone.removeAttribute('style'); // clean inline transforms from previous patches
    clone.className = '';
    clone.draggable = false;
    // Make sure we copy the current src
    if (imgEl.currentSrc) clone.src = imgEl.currentSrc;
    else clone.src = imgEl.src;

    ov.appendChild(clone);
    document.documentElement.classList.add('has-zoom');
    document.body.classList.add('has-zoom');
    ov.classList.add('show');
    // scale after attach
    requestAnimationFrame(function(){
      clone.style.transform = 'scale(' + (factor || 2) + ')';
    });

    // ESC handler
    function onEsc(e){
      if (e.key === 'Escape'){ closeOverlay(); }
    }
    document.addEventListener('keydown', onEsc, { once: true });
    ov._escOnce = onEsc;
  }

  function closeOverlay(){
    var ov = document.getElementById('zoomOverlay');
    if (!ov) return;
    ov.classList.remove('show');
    ov.innerHTML = '';
    document.documentElement.classList.remove('has-zoom');
    document.body.classList.remove('has-zoom');
    if (ov._escOnce){
      try{ document.removeEventListener('keydown', ov._escOnce); }catch(_){}
      ov._escOnce = null;
    }
  }

  // Delegated dblclick to support dynamically created #mdChart
  document.addEventListener('dblclick', function(e){
    var t = e.target;
    if (!(t instanceof Element)) return;
    var img = t.closest && t.closest('img#mdChart, img#natalDropImg');
    if (!img) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // toggle: if overlay open -> close; else open with specific factor
    var ov = document.getElementById('zoomOverlay');
    var open = ov && ov.classList.contains('show');
    if (open){ closeOverlay(); return; }

    var factor = (img.id === 'mdChart') ? 1.4 : 1.5; // mdChart x2; natalDropImg x4
    openOverlay(img, factor);
  }, true);
})();





/* === Auto-show transits panel on first compute (non-breaking add-on) === */
(function(){
  function showRight(){
    try{
      var box = document.getElementById('natalRight');
      if (box && box.classList && box.classList.contains('hidden')){
        box.classList.remove('hidden');
        box.classList.add('show');
        box.removeAttribute('aria-hidden');
      }
    }catch(_){}
  }
  // 1) When aspect cards are computed for the first time
  try{
    window.addEventListener('aspectCards:updated', function(){
      showRight();
    });
  }catch(_){}

  // 2) If the natal/now wheel image loads into the small drop slot
  document.addEventListener('DOMContentLoaded', function(){
    try{
      var img = document.getElementById('natalDropImg');
      if (img){
        img.addEventListener('load', showRight, { once:false, passive:true });
        if (img.complete && img.naturalWidth > 0) showRight();
      }
    }catch(_){}

    // 3) Fallback: if aspect cards are already present on load
    try{
      if (window.aspectCards && window.aspectCards.length) showRight();
    }catch(_){}

    // 4) Final safety: check again shortly after load
    setTimeout(function(){
      try{
        if (window.aspectCards && window.aspectCards.length) showRight();
      }catch(_){}
    }, 1200);
  });
})();
/* === END auto-show add-on === */

// === Expose minimal Profile Menu API for other pages (e.g., profile.html) ===
try {
  window.enableProfileMenu = function(){
    try { allowMenu = true; } catch(_){}
  };
  window.showProfileMenu = function(){
    try { allowMenu = true; } catch(_){}
    try { showProfileMenu(); } catch(_){}
  };
  window.hideProfileMenu = function(){
    try { hideProfileMenu(); } catch(_){}
  };
} catch(_){}

