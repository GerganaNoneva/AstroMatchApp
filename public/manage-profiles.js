// manage-profiles.js — избор, редакция и запис на профили
import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const pad2 = n => String(n).padStart(2, "0");
const pad4 = n => String(n).padStart(4, "0");

document.addEventListener("DOMContentLoaded", () => {
  const select    = document.getElementById("profileSelect");
  const form      = document.getElementById("manageForm");
  const mName     = document.getElementById("mName");
  const mDate     = document.getElementById("mDate");
  const mTime     = document.getElementById("mTime");
  const mCity     = document.getElementById("mCity");
  const mDST      = document.getElementById("mDST");
  const mSaveBtn  = document.getElementById("mSaveBtn");
  const mSearchBtn= document.getElementById("mSearchBtn");
  const mCitySel  = document.getElementById("mCityResults");

  let cache = [];             // [{name, body, birthCity, cityGeo}]
  let cityArr = [];
  let selectedCity = null;

  function updateSave(){
    mSaveBtn.disabled = !(mName.value.trim() && mDate.value && mTime.value && selectedCity);
  }

  function fillFromProfile(p){
    const nameKey = p.name;
    const b = p.body;
    mName.value = nameKey;
    mDate.value = `${pad4(b.year)}-${pad2(b.month)}-${pad2(b.date)}`;
    mTime.value = `${pad2(b.hours)}:${pad2(b.minutes)}`;
    mCity.value = p.birthCity || "";
    selectedCity = p.cityGeo || { latitude: b.latitude, longitude: b.longitude, timezone_offset: b.timezone };
    mCitySel.classList.add("hidden");
    updateSave();
  }

  function buildBody(){
    const [Y, M, D] = mDate.value.split("-").map(Number);
    const [HH, MM]  = mTime.value.split(":").map(Number);
    return {
      year: Y, month: M, date: D, hours: HH, minutes: MM, seconds: 0,
      latitude:  selectedCity.latitude,
      longitude: selectedCity.longitude,
      timezone:  selectedCity.timezone_offset + (mDST.checked ? 1 : 0),
      config: { observation_point: "topocentric", ayanamsha: "tropical", language: "en" }
    };
  }

  async function loadProfiles(){
    const u = auth.currentUser;
    if (!u) { alert("Моля, впишете се."); window.location.href = "index.html"; return []; }

    const ref  = doc(db, "users", u.uid);
    const col  = collection(ref, "profiles");
    const out  = [];

    // 1) опитай от под-колекцията
    try {
      const snap = await getDocs(col);
      snap.forEach(d => {
        const data = d.data();
        if (data?.body) out.push({
          name: data.name || d.id,
          body: data.body,
          birthCity: data.birthCity || "",
          cityGeo: data.cityGeo || null
        });
      });
    } catch(e){
      console.warn("Не успях да прочета под-колекцията:", e);
    }

    // 2) ако празно – fallback към масива all
    if (out.length === 0) {
      const s = await getDoc(ref);
      const d = s.data() || {};
      const allArr = Array.isArray(d.all) ? d.all : [];
      allArr.forEach(obj => {
        const key = Object.keys(obj || {})[0];
        if (!key) return;
        out.push({
          name: key,
          body: obj[key],
          birthCity: d.birthCity || "",
          cityGeo: d.cityGeo || null
        });
      });
    }
    return out;
  }

  function populate(list){
    select.innerHTML = "";
    if (!list.length){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "(няма профили)";
      select.appendChild(o);
      form.classList.add("hidden");
      return;
    }
    list.forEach(p => {
      const o = document.createElement("option");
      o.value = p.name;
      o.textContent = p.name;
      select.appendChild(o);
    });
    form.classList.remove("hidden");
  }

  select.addEventListener("change", () => {
    const key = select.value;
    const p = cache.find(x => x.name === key);
    if (p) fillFromProfile(p);
  });

  // търсене на град
  mSearchBtn.addEventListener("click", async () => {
    const q = mCity.value.trim();
    if (!q) return;

    selectedCity = null;
    updateSave();
    mCitySel.classList.add("hidden");
    mSearchBtn.disabled = true;

    try {
      const res = await fetch("./api/geo-details", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ location: q })
      });
      if (!res.ok) throw new Error(res.status);
      cityArr = await res.json();
      if (!cityArr.length) { alert("Няма резултати"); return; }

      mCitySel.innerHTML = "";
      cityArr.forEach((c, i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = c.complete_name;
        mCitySel.appendChild(o);
      });
      mCitySel.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      alert("Грешка: " + (err.message || err));
    } finally {
      mSearchBtn.disabled = false;
    }
  });

  mCitySel.addEventListener("change", e => {
    selectedCity = cityArr[+e.target.value] || null;
    updateSave();
  });

  [mName, mDate, mTime, mDST].forEach(el => el.addEventListener("input", updateSave));

  // запис
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const u = auth.currentUser;
    if (!u) { alert("Моля, впишете се."); window.location.href = "index.html"; return; }
    if (!selectedCity) { alert("Изберете град."); return; }

    const body    = buildBody();
    const nameKey = (mName.value || "Unnamed").trim();

    try {
      const userRef     = doc(db, "users", u.uid);
      const profilesCol = collection(userRef, "profiles");

      // overwrite в под-колекцията
      await setDoc(
        doc(profilesCol, nameKey),
        {
          name: nameKey,
          body,
          birthCity: mCity.value.trim(),
          cityGeo: selectedCity,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      // синхронизирай масива 'all' (replace или push)
      const snap = await getDoc(userRef);
      const d    = snap.data() || {};
      const all  = Array.isArray(d.all) ? d.all.slice() : [];
      const idx  = all.findIndex(o => o && typeof o === "object" && Object.keys(o)[0] === nameKey);
      const newEntry = { [nameKey]: body };
      if (idx >= 0) all[idx] = newEntry; else all.push(newEntry);
      await setDoc(userRef, { all, updatedAt: serverTimestamp() }, { merge: true });

      console.log("ALL (след запис):", all);
      alert("✅ Запазено!");

      // обнови селекта
      cache = await loadProfiles();
      populate(cache);
      select.value = nameKey;
      const p = cache.find(x => x.name === nameKey);
      if (p) fillFromProfile(p);

    } catch (err) {
      console.error("Грешка при запис:", err);
      alert("Грешка при запис: " + err.message);
    }
  });

  // init
  (async () => {
    // изискваме логнат потребител
    if (!auth.currentUser) {
      // изчакай малко onAuthStateChanged, ако още не е готов
      await new Promise(r => setTimeout(r, 200));
    }
    if (!auth.currentUser) {
      alert("Моля, впишете се.");
      window.location.href = "index.html";
      return;
    }
    cache = await loadProfiles();
    populate(cache);
    if (cache.length) fillFromProfile(cache[0]);
  })();
});
