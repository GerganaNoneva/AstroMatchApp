

/** Returns the element used to open the profile menu. Prefers #profileMenuBtn; falls back to #profilePic for backward compatibility. */
function getProfileMenuTrigger() {
  return document.getElementById('profileMenuBtn') || document.getElementById('profilePic');
}



// profile.js — Mobile-friendly profile page logic
// Features:
//  - Avatar + dropdown menu (toggle, outside click, Esc to close)
//  - Three modals: My Data, Add Profile, Saved Data (Manage)
//  - City search via POST ./api/geo-details
//  - Firestore persistence: users/{uid} with 'all' array + subcollections 'profiles' and 'user'
//  - Video tiles hover play + loader overlay
//  - Auth: logout, delete user, guard redirects if not signed in
//  - Accept URL parameter ?open=myData to auto-open the My Data modal
//
// Important: We import { db, auth } from firebase-init.js so we NEVER call getAuth() here.
// This avoids "No Firebase App '[DEFAULT]'" errors when script load order changes.

import { db, auth } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, serverTimestamp, arrayUnion,
  collection, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  onAuthStateChanged, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

/* Cyrillic -> Latin (bg) transliteration for city queries */
function cyrToLat(input=""){
  const map = {
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sht','Ъ':'A','Ь':'','Ю':'Yu','Я':'Ya',
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'','ю':'yu','я':'ya'
  };
  return String(input).split('').map(ch => map[ch] ?? ch).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, "0");
const pad4 = n => String(n).padStart(4, "0");

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Build natal body object from inputs
function makeBodyFrom({ date, time, cityObj, dstChecked }) {
  const [Y, M, D] = (date || "").split("-").map(Number);
  const [HH, MM]  = (time || "").split(":").map(Number);
  return {
    year: Y, month: M, date: D, hours: HH, minutes: MM, seconds: 0,
    latitude:  cityObj.latitude,
    longitude: cityObj.longitude,
    timezone:  cityObj.timezone_offset + (dstChecked ? 1 : 0),
    config: { observation_point: "topocentric", ayanamsha: "tropical", language: "en" }
  };
}

// City search API
async function searchCity(q) {
  const qq = cyrToLat(q || "");
  const res = await fetch("./api/geo-details", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ location: q })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

// Add a small inline style used across modals
function ensureInlineUiStyle() {
  if (document.getElementById("profile-inline-style")) return;
  const style = document.createElement("style");
  style.id = "profile-inline-style";
  style.textContent = `
    .select-with-arrow{
      appearance:none;-webkit-appearance:none;-moz-appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg fill='none' stroke='%235b21b6' stroke-width='2' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right .6rem center;background-size:1rem;padding-right:2rem;
    }
    .form-actions{display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap}
    .anim-fade-in{animation:fadeIn .18s ease-out}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar + menu
// ─────────────────────────────────────────────────────────────────────────────
function initAvatarMenu(user) {
  try { if (typeof window.enableProfileMenu === 'function') window.enableProfileMenu(); } catch(_){}
}

async function deleteUserData(db, uid){
  const userRef = doc(db, "users", uid);
  // known subcollections
  const subcols = ["profiles", "user"];
  for (const name of subcols){
    try{
      const snap = await getDocs(collection(userRef, name));
      for (const d of snap.docs){ try{ await deleteDoc(d.ref); } catch(e){ console.warn("Неуспешно изтриване на", name, d.id, e); } }
    }catch(e){ console.warn("Неуспешно четене на подколекция", name, e); }
  }
  try{ await deleteDoc(userRef); }catch(e){ console.warn("Неуспешно изтриване на users/"+uid, e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth actions
// ─────────────────────────────────────────────────────────────────────────────
function initAuthActions() {
  qs("#logoutBtn")?.addEventListener("click", async () => {
    try { await signOut(auth); location.replace("index.html"); }
    catch (e) { console.error(e); alert("Грешка при излизане."); }
  });

  qs("#deleteBtn")?.addEventListener("click", async () => {
    const u = auth.currentUser;
    if (!u) return alert("Няма вписан потребител");
    if (!confirm("Ще изтриете и акаунта, и всички данни. Сигурни ли сте?")) return;
    try {
      await deleteUserData(db, u.uid);
      await deleteUser(u);
      alert("Потребителят и всички данни са изтрити");
      location.replace("index.html");
    } catch (err) {
      console.error(err);
      alert("Грешка: " + err.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: My Data
// ─────────────────────────────────────────────────────────────────────────────
function initMyDataModal() {
  const modal   = qs("#myDataModal"); if (!modal) return;
  const form    = qs("#myDataForm", modal);
  const nameEl  = qs("#myName", modal);
  const dateEl  = qs("#myDate", modal);
  const timeEl  = qs("#myTime", modal);
  const cityEl  = qs("#myCity", modal);
  const dstEl   = qs("#myDST", modal);
  const searchB = qs("#mySearchCityBtn", modal);
  const citySel = qs("#myCityResults", modal);
  const saveBtn = qs("#mySaveBtn", modal);

  ensureInlineUiStyle();
  prepareCityDropdown(citySel);

  // Add EDIT button (appears when existing data present)
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.id = "myEditBtn";
  editBtn.className = "cta hidden";
  editBtn.textContent = "ПРОМЕНИ";
  saveBtn?.after(editBtn);

  function lockForm() {
    [nameEl, dateEl, timeEl, cityEl, dstEl].forEach(el => el.disabled = true);
    saveBtn?.classList.add("hidden");
    editBtn.classList.remove("hidden");
  }
  function unlockForm() {
    [nameEl, dateEl, timeEl, cityEl, dstEl].forEach(el => el.disabled = false);
    editBtn.classList.add("hidden");
    saveBtn?.classList.remove("hidden");
    cityEl.value = "";
    prepareCityDropdown(citySel);
  }
  editBtn.addEventListener("click", unlockForm);

  let cityArr = []; let selectedCity = null;

  searchB?.addEventListener("click", async () => {
    const q = (cityEl.value || "").trim(); if (!q) return;
    selectedCity = null;
    try {
      cityArr = await searchCity(q);
      prepareCityDropdown(citySel);
      if (!cityArr.length) { alert("Няма резултати"); return; }
      cityArr.forEach((c, i) => {
        const o = document.createElement("option"); o.value = i; o.textContent = c.complete_name;
        citySel.appendChild(o);
      });
      citySel.classList.remove("hidden");
    } catch (e) {
      console.error(e); alert("Грешка: " + e.message);
    }
  });

  citySel?.addEventListener("change", e => {
    selectedCity = cityArr[+e.target.value] || null;
    if (selectedCity?.complete_name) cityEl.value = selectedCity.complete_name;
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nameEl.value.trim() || !dateEl.value || !timeEl.value || !selectedCity) {
      alert("Моля, попълнете Име, Дата, Час и изберете Град от списъка.");
      return;
    }
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    const ref = doc(db, "users", u.uid);
    const nameKey = (nameEl.value || "Unnamed").trim();
    const body = makeBodyFrom({ date: dateEl.value, time: timeEl.value, cityObj: selectedCity, dstChecked: !!dstEl.checked });

    try {
      // sync ALL array
      const snap = await getDoc(ref); const d = snap.data() || {};
      const all  = Array.isArray(d.all) ? d.all.slice() : [];
      const idx  = all.findIndex(o => o && typeof o === "object" && Object.keys(o)[0] === nameKey);
      const newEntry = { [nameKey]: body };
      if (idx >= 0) all[idx] = newEntry; else all.push(newEntry);

      // store myData
      const myData = { nameKey, body, birthCity: cityEl.value.trim(), cityGeo: selectedCity, updatedAt: serverTimestamp() };
      await setDoc(ref, { all, myData, updatedAt: serverTimestamp() }, { merge: true });

      // mirror to subcollections
      const profilesCol = collection(ref, "profiles");
      const userCol     = collection(ref, "user");
      await setDoc(doc(profilesCol, nameKey), { name: nameKey, body, birthCity: myData.birthCity, cityGeo: myData.cityGeo, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(userCol, nameKey),     { name: nameKey, body, birthCity: myData.birthCity, cityGeo: myData.cityGeo, updatedAt: serverTimestamp() }, { merge: true });

      citySel?.classList.add("hidden");
      alert("✅ Запазено!");
      lockForm();
    } catch (err) {
      console.error(err); alert("Грешка при запис: " + err.message);
    }
  });

  async function openMyData() {
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    const snap = await getDoc(doc(db, "users", u.uid));
    const d = snap.exists() ? (snap.data() || {}) : {};

    if (d && (d.myData?.body || (Array.isArray(d.all) && d.all.length))) {
      saveBtn?.classList.add("hidden");
      editBtn.classList.remove("hidden");
    }
    if (d.myData?.body) {
      const b = d.myData.body;
      const n = d.myData.nameKey || Object.keys(b)[0] || "";
      nameEl.value = n;
      dateEl.value = `${pad4(b.year)}-${pad2(b.month)}-${pad2(b.date)}`;
      timeEl.value = `${pad2(b.hours)}:${pad2(b.minutes)}`;
      cityEl.value = d.myData.birthCity || "";
      [nameEl, dateEl, timeEl, cityEl, dstEl].forEach(el => el.disabled = true);
    } else {
      form.classList.remove("hidden");
      form.reset();
      prepareCityDropdown(citySel);
    }
    modal.classList.add("anim-fade-in");
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); }, { once: true });
    modal.classList.remove("hidden");
  }

  qs("#dataBtn")?.addEventListener("click", openMyData);
  modal.querySelector(".modal-close")?.addEventListener("click", () => modal.classList.add("hidden"));
}

// Prepare city select dropdown
function prepareCityDropdown(selectEl) {
  if (!selectEl) return;
  selectEl.classList.add("select-with-arrow");
  selectEl.size = 1;
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = "— избери град —"; ph.disabled = true; ph.selected = true;
  selectEl.appendChild(ph);
  selectEl.classList.add("hidden"); // hidden until first search
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Add Profile
// ─────────────────────────────────────────────────────────────────────────────
function initAddProfileModal() {
  const modal   = qs("#addProfileModal"); if (!modal) return;
  const form    = qs("#addProfileForm", modal);
  const nameEl  = qs("#addName", modal);
  const dateEl  = qs("#addDate", modal);
  const timeEl  = qs("#addTime", modal);
  const cityEl  = qs("#addCity", modal);
  const dstEl   = qs("#addDST", modal);
  const searchB = qs("#addSearchCityBtn", modal);
  const citySel = qs("#addCityResults", modal);
  const saveBtn = qs("#addSaveBtn", modal);

  ensureInlineUiStyle();
  prepareCityDropdown(citySel);

  let cityArr = []; let selectedCity = null;

  function updateSave() {
    saveBtn.disabled = !(nameEl.value.trim() && dateEl.value && timeEl.value && selectedCity);
  }
  [nameEl, dateEl, timeEl, dstEl].forEach(el => el?.addEventListener("input", updateSave));

  searchB?.addEventListener("click", async () => {
    const q = (cityEl.value || "").trim(); if (!q) return;
    selectedCity = null; updateSave();
    try {
      cityArr = await searchCity(q);
      prepareCityDropdown(citySel);
      if (!cityArr.length) { alert("Няма резултати"); return; }
      cityArr.forEach((c, i) => { const o = document.createElement("option"); o.value = i; o.textContent = c.complete_name; citySel.appendChild(o); });
      citySel.classList.remove("hidden");
    } catch (e) {
      console.error(e); alert("Грешка: " + e.message);
    }
  });

  citySel?.addEventListener("change", e => { selectedCity = cityArr[+e.target.value] || null; updateSave(); });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedCity) return alert("Изберете град.");
    const body = makeBodyFrom({ date: dateEl.value, time: timeEl.value, cityObj: selectedCity, dstChecked: !!dstEl.checked });
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    const ref = doc(db, "users", u.uid);
    const nameKey = (nameEl.value || "Unnamed").trim();
    try {
      await setDoc(ref, { all: arrayUnion({ [nameKey]: body }), updatedAt: serverTimestamp() }, { merge: true });
      alert("✅ Запазено!");
      modal.classList.add("hidden");
    } catch (err) {
      console.error(err); alert("Грешка при запис: " + err.message);
    }
  });

  // Optional open hook: if you later add a button with id="addProfileBtn"
  qs("#addProfileBtn")?.addEventListener("click", () => {
    form.classList.remove("hidden"); form.reset(); selectedCity = null; prepareCityDropdown(citySel); updateSave();
    modal.classList.add("anim-fade-in");
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); }, { once: true });
    modal.classList.remove("hidden");
  });

  modal.querySelector(".modal-close")?.addEventListener("click", () => modal.classList.add("hidden"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Saved Data (Manage)
//  - Dropdown with placeholder + arrow; scroll for >10 items
//  - Buttons: SAVE / DELETE (disabled no selection) / CLEAR
//  - Filter out names already in users/{uid}/user collection
// ─────────────────────────────────────────────────────────────────────────────
function initManageModal() {
  const modal   = qs("#manageModal"); if (!modal) return;
  const select  = qs("#manageSelect", modal);
  const form    = qs("#manageForm", modal);
  const nameEl  = qs("#manageName", modal);
  const dateEl  = qs("#manageDate", modal);
  const timeEl  = qs("#manageTime", modal);
  const cityEl  = qs("#manageCity", modal);
  const dstEl   = qs("#manageDST", modal);
  const searchB = qs("#manageSearchCityBtn", modal);
  const citySel = qs("#manageCityResults", modal);
  const saveBtn = qs("#manageSaveBtn", modal);

  ensureInlineUiStyle();
  select?.classList.add("select-with-arrow");
  prepareCityDropdown(citySel);

  // Build DELETE and CLEAR buttons dynamically next to SAVE
  let deleteBtn = document.getElementById("manageDeleteBtn");
  if (!deleteBtn) {
    deleteBtn = document.createElement("button");
    deleteBtn.id = "manageDeleteBtn";
    deleteBtn.type = "button";
    deleteBtn.className = saveBtn.className;
    deleteBtn.textContent = "ИЗТРИЙ";
    deleteBtn.disabled = true;
  }
  let clearBtn = document.getElementById("manageClearBtn");
  if (!clearBtn) {
    clearBtn = document.createElement("button");
    clearBtn.id = "manageClearBtn";
    clearBtn.type = "button";
    clearBtn.className = saveBtn.className;
    clearBtn.textContent = "ИЗЧИСТИ";
  }
  if (!saveBtn.parentElement.classList.contains("form-actions")) {
    const row = document.createElement("div");
    row.className = "form-actions";
    saveBtn.replaceWith(row);
    row.appendChild(saveBtn);
    row.appendChild(deleteBtn);
    row.appendChild(clearBtn);
  }
  saveBtn.textContent = "ЗАПИШИ";

  // State
  let listCache = [];          // [{name, body, birthCity, cityGeo}]
  let cityArr = [];
  let selectedCity = null;
  let currentCityGeo = null;   // geo from selected profile

  function resetForm(){
    form.reset(); selectedCity = null; currentCityGeo = null;
    prepareCityDropdown(citySel); select.value = "";
    deleteBtn.disabled = true; updateSave();
  }
  function updateSave(){
    const hasGeo = !!(selectedCity || currentCityGeo);
    saveBtn.disabled = !(nameEl.value.trim() && dateEl.value && timeEl.value && hasGeo);
  }
  function updateDeleteState(){ deleteBtn.disabled = !select.value; }
  [nameEl, dateEl, timeEl, dstEl, cityEl].forEach(el => el?.addEventListener("input", updateSave));

  // Load profiles from subcollection 'profiles', fallback to 'all'
  async function loadProfilesList(){
    const u = auth.currentUser; if (!u) { alert("Моля, впишете се."); return []; }
    const userRef = doc(db, "users", u.uid);
    const out = [];

    try {
      const snap = await getDocs(collection(userRef, "profiles"));
      snap.forEach(d => {
        const data = d.data();
        if (data?.body) out.push({ name: data.name || d.id, body: data.body, birthCity: data.birthCity || "", cityGeo: data.cityGeo || null });
      });
    } catch {}

    if (!out.length) {
      const s = await getDoc(userRef); const dd = s.data() || {};
      const allArr = Array.isArray(dd.all) ? dd.all : [];
      allArr.forEach(obj => {
        const key = Object.keys(obj||{})[0]; if (!key) return;
        out.push({ name:key, body:obj[key], birthCity:dd.birthCity||"", cityGeo:dd.cityGeo||null });
      });
    }
    return out;
  }

  // Filter out names already in users/{uid}/user
  async function populateSelect(list){
    const u = auth.currentUser;
    let existingNames = [];
    if (u) {
      const userRef = doc(db, "users", u.uid);
      const userCol = collection(userRef, "user");
      const snap = await getDocs(userCol);
      existingNames = snap.docs.map(d => d.id);
    }
    const filtered = list.filter(p => !existingNames.includes(p.name));

    select.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.textContent = "избери профил....";
    select.appendChild(ph);

    filtered.forEach(p => { const o = document.createElement("option"); o.value = p.name; o.textContent = p.name; select.appendChild(o); });

    if (filtered.length > 10) { select.size = 10; select.classList.add("scrollable"); }
    else { select.size = 1; select.classList.remove("scrollable"); }

    select.value = "";
  }

  function fillFromProfile(p){
    const b = p.body;
    nameEl.value = p.name;
    dateEl.value = `${pad4(b.year)}-${pad2(b.month)}-${pad2(b.date)}`;
    timeEl.value = `${pad2(b.hours)}:${pad2(b.minutes)}`;
    cityEl.value = p.birthCity || "";
    currentCityGeo = p.cityGeo || { latitude:b.latitude, longitude:b.longitude, timezone_offset:b.timezone };
    selectedCity = null; prepareCityDropdown(citySel); updateSave();
  }

  select.addEventListener("change", () => {
    const key = select.value;
    const p = listCache.find(x => x.name === key);
    if (p) fillFromProfile(p); else resetForm();
    updateDeleteState();
  });

  // City search
  searchB?.addEventListener("click", async () => {
    const q = (cityEl.value || "").trim(); if (!q) return;
    selectedCity = null; updateSave();
    try {
      const res = await fetch("./api/geo-details", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ location:q }) });
      if (!res.ok) throw new Error(res.status);
      cityArr = await res.json();
      prepareCityDropdown(citySel);
      if (!Array.isArray(cityArr) || !cityArr.length) { alert("Няма резултати"); return; }
      cityArr.forEach((c,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=c.complete_name; citySel.appendChild(o); });
      citySel.classList.remove("hidden");
    } catch(e){ console.error(e); alert("Грешка: " + (e.message||e)); }
  });
  citySel?.addEventListener("change", e => { selectedCity = cityArr[+e.target.value] || null; updateSave(); });

  // SAVE
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    const nameKey = (nameEl.value || "Unnamed").trim();
    if (!nameKey || !dateEl.value || !timeEl.value) { alert("Попълни Име, Дата и Час."); return; }
    const geo = selectedCity || currentCityGeo; if (!geo) { alert("Избери град."); return; }
    citySel?.classList.add("hidden");

    const [Y,M,D] = dateEl.value.split("-").map(Number);
    const [HH,MM] = timeEl.value.split(":").map(Number);
    const tz = (Number(geo.timezone_offset) || 0) + ((dstEl && dstEl.checked) ? 1 : 0);
    const body = {
      year:Y, month:M, date:D, hours:HH, minutes:MM, seconds:0,
      latitude: geo.latitude, longitude: geo.longitude,
      timezone: tz,
      config:{ observation_point:"topocentric", ayanamsha:"tropical", language:"en" }
    };

    try {
      const userRef = doc(db, "users", u.uid);
      const profilesCol = collection(userRef, "profiles");
      await setDoc(doc(profilesCol, nameKey), {
        name:nameKey, body, birthCity:cityEl.value.trim(), cityGeo:geo, updatedAt: serverTimestamp()
      }, { merge:true });

      // sync ALL
      const snap = await getDoc(userRef);
      const d = snap.data() || {};
      const all = Array.isArray(d.all) ? d.all.slice() : [];
      const idx = all.findIndex(o => Object.keys(o||{})[0] === nameKey);
      const entry = { [nameKey]: body };
      if (idx>=0) all[idx]=entry; else all.push(entry);
      await setDoc(userRef, { all, updatedAt: serverTimestamp() }, { merge:true });

      alert("✅ Записано!");
      listCache = await loadProfilesList();
      await populateSelect(listCache);
      resetForm();
    } catch(err){ console.error(err); alert("Грешка при запис: " + err.message); }
  });

  // DELETE
  deleteBtn.addEventListener("click", async () => {
    if (deleteBtn.disabled) return;
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    const nameKey = select.value; if (!nameKey) return;
    if (!confirm(`Да изтрия ли профила „${nameKey}“?`)) return;

    try {
      const userRef = doc(db, "users", u.uid);
      await deleteDoc(doc(collection(userRef, "profiles"), nameKey));
      // Remove from 'all'
      const snap = await getDoc(userRef);
      const d = snap.data() || {};
      const all = Array.isArray(d.all) ? d.all.filter(o => Object.keys(o||{})[0] !== nameKey) : [];
      await setDoc(userRef, { all, updatedAt: serverTimestamp() }, { merge:true });

      alert("🗑️ Изтрито.");
      listCache = await loadProfilesList();
      await populateSelect(listCache);
      resetForm();
    } catch(err){ console.error(err); alert("Грешка при изтриване: " + err.message); }
  });

  // CLEAR
  clearBtn.addEventListener("click", resetForm);

  // Open
  qs("#dataAllBtn")?.addEventListener("click", async () => {
    const u = auth.currentUser; if (!u) return alert("Моля, впишете се.");
    resetForm();
    listCache = await loadProfilesList();
    await populateSelect(listCache);
    modal.classList.add("anim-fade-in");
    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); }, { once:true });
    modal.classList.remove("hidden");
  });

  modal.querySelector(".modal-close")?.addEventListener("click", () => modal.classList.add("hidden"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Videos + loader
// ─────────────────────────────────────────────────────────────────────────────
function initVideoTiles() {
  qsa(".video-item").forEach(item => {
    const v = item.querySelector("video");
    if (!v) return;
    v.muted = true; v.loop = true; v.playsInline = true;
    item.addEventListener("mouseover", () => { try { v.play(); } catch {} });
    item.addEventListener("mouseout",  () => { v.pause(); v.currentTime = 0; });
  });
    // Extra: pointer + keyboard focus support
    qsa(".video-item").forEach(item => {
      const v = item.querySelector("video");
      if (!v) return;
      item.addEventListener("pointerenter", () => { try { v.play(); } catch {} });
      item.addEventListener("pointerleave", () => { try { v.pause(); v.currentTime = 0; } catch {} });
      item.addEventListener("focusin", () => { try { v.play(); } catch {} });
      item.addEventListener("focusout", () => { try { v.pause(); v.currentTime = 0; } catch {} });
      // iOS Safari sometimes requires load() before play()
      v.addEventListener("mouseenter", () => { try { if (v.readyState < 2) v.load(); v.play(); } catch {} });
    });

  const vids = qsa(".video-item video");
  const loader = qs("#videoLoader");
  const vh     = loader?.querySelector("video");
  if (vids.length === 0 && loader) loader.classList.add("hidden");
  else if (loader) {
    let done = 0;
    vids.forEach(v => {
      v.load();
      v.addEventListener("loadeddata", () => {
        if (++done === vids.length && vh) { try { vh.pause(); } catch {} vh.currentTime = 0; loader.classList.add("hidden"); }
      }, { once: true });
    });
    // Safety timeout: never block touches on mobile
    setTimeout(() => loader.classList.add("hidden"), 3000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────────────────────────────────────
function handleQueryIntents() {
  try {
    const sp = new URLSearchParams(location.search);
    if (sp.get("open") === "myData") {
      const targetBtn = qs("#myDataModal") ? qs("#dataBtn") : null;
      if (targetBtn) setTimeout(() => targetBtn.click(), 120);
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  ensureInlineUiStyle();

  onAuthStateChanged(auth, user => {
    if (!user) { location.href = "index.html"; return; }

    // Init UI with user context
    initAvatarMenu(user);
    initAuthActions();

    // Modals
    initMyDataModal();
    initAddProfileModal();
    initManageModal();

    // Videos
    initVideoTiles();

    // Deep links (e.g. began.html -> profile.html?open=myData)
    handleQueryIntents();

    // Menu items linking to under-construction pages (as in earlier versions)
    function goUnderCons(){ window.location.href = "undercons.html"; }
    qsa("#photosBtn").forEach(el => el.addEventListener("click", goUnderCons));
    qs("#infoBtn")?.addEventListener("click", goUnderCons);
  });
});

// === Double-click Zoom (natalDropImg & mdChart) ===
(function(){
  const SCALES = [1, 1.8, 2.5, 3.2];
  function applyZoom(el, idx){
    const s = SCALES[idx] ?? 1;
    el.style.transition = el.style.transition || 'transform .18s ease, box-shadow .18s ease';
    el.style.transformOrigin = el.style.transformOrigin || 'center center';
    el.style.transform = 'scale(' + s + ')';
    el.style.cursor = s > 1 ? 'zoom-out' : 'zoom-in';
    el.style.zIndex = s > 1 ? '10000' : '';
    if (s > 1) { el.style.boxShadow = '0 20px 40px rgba(0,0,0,.35)'; } else { el.style.boxShadow = ''; }
    el.dataset.zoomIdx = String(idx);
  }
  function nextZoom(el){
    const cur = Number(el.dataset.zoomIdx || 0);
    const nx = (cur + 1) % SCALES.length;
    applyZoom(el, nx);
  }
  function initIfPresent(id){
    const el = document.getElementById(id);
    if (el && !el.dataset.zoomWired){
      el.dataset.zoomWired = '1';
      // initial state
      applyZoom(el, Number(el.dataset.zoomIdx || 0));
      el.addEventListener('dblclick', (e)=>{
        try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
        nextZoom(el);
      });
    }
  }
  // Event delegation as fallback (if elements are injected later)
  document.addEventListener('dblclick', (e)=>{
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'natalDropImg' || t.id === 'mdChart'){
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      if (!t.dataset.zoomWired){
        t.dataset.zoomWired = '1';
        applyZoom(t, Number(t.dataset.zoomIdx || 0));
      }
      nextZoom(t);
    }
  }, {capture: true});
  // Try immediately; then observe DOM for late insertion
  initIfPresent('natalDropImg'); initIfPresent('mdChart');
  const mo = new MutationObserver(()=>{ initIfPresent('natalDropImg'); initIfPresent('mdChart'); });
  mo.observe(document.documentElement || document.body, {childList:true, subtree:true});
})();

/* === Hard fallback: ensure "Запазени данни" opens on profile pages too === */
try {
  document.addEventListener('click', (e) => {
    const tgt = e.target && (e.target.id === 'menuSaved' ? e.target : (e.target.closest && e.target.closest('#menuSaved')));
    if (!tgt) return;
    e.preventDefault(); e.stopPropagation();
    try { if (typeof hideProfileMenu === 'function') hideProfileMenu(); } catch(_){}
    try { if (typeof renderProfilesModal === 'function') renderProfilesModal(); else if (typeof window.renderProfilesModal === 'function') window.renderProfilesModal(); } catch(err){ console.error('[profilesModal] hard-fallback:', err); }
  }, true);
} catch(_){}


/* Ensure profile menu works on this page too */
try {
  window.addEventListener('DOMContentLoaded', function(){
    if (typeof window.enableProfileMenu === 'function') {
      window.enableProfileMenu();
    } else {
      // If began.js hasn't loaded yet, try again shortly
      var tries = 0, t = setInterval(function(){
        if (typeof window.enableProfileMenu === 'function') {
          window.enableProfileMenu();
          clearInterval(t);
        } else if (++tries > 60) { // ~3 seconds
          clearInterval(t);
        }
      }, 50);
    }
  });
} catch(_){}


