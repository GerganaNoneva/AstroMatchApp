


function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* --- houseOf helper (from script1.js) ------------------------------ */
/**
 /* --- houseOf helper (FIXED) ------------------------------ */
/**
 * Връща № на дома (1‑12), в който попада дадена еклиптична дължина.
 * Работи коректно и за диапазона, който „прескача“ 360° → 0°,
 * например: 1‑ви дом = 354°, 2‑ри дом = 24°.
 *
 * @param {number} planetDeg – позиция на планета (0…360)
 * @param {Array<{house:number,deg:number}>} housesArr – куспиди на домовете
 *                 СОРТИРАНИ по дом: 1,2,3…12
 */
export function houseOf(planetDeg, housesArr) {
  if (!Array.isArray(housesArr) || housesArr.length !== 12) return null;

  for (let i = 0; i < 12; i++) {
    // начало и край на дома
    let start = housesArr[i].deg;                   // куспид на текущия дом
    let end   = housesArr[(i + 1) % 12].deg;        // куспид на следващия

    // когато краят е „по‑малък“ от началото, значи обхваща 360°→0°
    if (end < start) end += 360;

    // нормализираме и планетата към същата система
    let p = planetDeg;
    if (p < start) p += 360;

    if (p >= start && p < end) return housesArr[i].house; // попаднахме в този дом
  }
  return null; // не би трябвало да стигне дотук
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



// script.js – v3 (title 70% + real natal wheel img)
// ========================================================
// ▸ Title now max‑width 70vw (visually “свито”)
// ▸ Natal wheel uses actual imgURL (from wheelRes) instead of logo
// --------------------------------------------------------
import {
  auth,
  db
} from "./firebase-init.js";
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  deleteUser
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ---------- 1. Dashboard styles ---------- */
const dashboardCSS = `
body::before{content:'';position:fixed;inset:0;background:url("images/ChatGPT Image Jul 29, 2025, 03_16_12 PM.png") center/cover no-repeat;z-index:-2;}
#bg-video{display:none;}
.profile-wrapper{position:fixed;top:1.5rem;right:2rem;z-index:5;}
.profile-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;cursor:pointer;border:2px solid #fff;}
.profile-menu{position:absolute;top:56px;right:0;background:#ffffff;border-radius:12px;padding:.5rem 0;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none;min-width:180px;}
.profile-menu.show{display:block;}
.profile-menu button{background:none;border:none;width:100%;text-align:left;font-size:.95rem;padding:.6rem 1rem;cursor:pointer;color:#4c1d95;}
.profile-menu button:hover{background:#f3f0ff;}
.profile-menu hr{border:none;border-top:1px solid #e4d8ff;margin:.25rem 0;}
.menu-btns{display:flex;flex-direction:column;gap:1.5rem;}
@media(min-width:640px){.menu-btns{flex-direction:row;flex-wrap:wrap;justify-content:center;}}`;
let dashboardStyleEl;

function applyDashboardStyles() {
  if (dashboardStyleEl) return;
  dashboardStyleEl = document.createElement("style");
  dashboardStyleEl.textContent = dashboardCSS;
  document.head.appendChild(dashboardStyleEl);
}

function removeDashboardStyles() {
  dashboardStyleEl?.remove();
  dashboardStyleEl = null;
}

/* ---------- 2. Birth‑form styles ---------- */
const birthCSS = `
.birth-form{display:flex;flex-direction:column;gap:1rem;margin-top:1rem;}
.birth-form .form-group{display:flex;flex-direction:column;gap:.35rem;}
.birth-form .row-inline{display:flex;gap:.5rem;width:100%;align-items:center;}
.birth-form label{font-weight:600;color:#4c1d95;}
.birth-form input[type="text"],birth-form input[type="date"],birth-form input[type="time"],birth-form select{width:100%;padding:.6rem .8rem;border:1px solid #cbd5e1;border-radius:12px;font-size:1rem;}
.birth-form button.cta.small{padding:.55rem 1.25rem;font-size:.9rem;}
.birth-form select{max-height:140px;overflow:auto;}
.birth-summary{display:flex;flex-direction:column;gap:1.4rem;margin-top:1rem;align-items:center;text-align:center;}
.birth-summary pre{white-space:pre-wrap;font-family:inherit;font-size:1rem;line-height:1.4;color:#4c1d95;}`;
let birthStyleEl;

function injectBirthStyles() {
  if (birthStyleEl) return;
  birthStyleEl = document.createElement("style");
  birthStyleEl.textContent = birthCSS;
  document.head.appendChild(birthStyleEl);
}

/* ---------- 3. Helpers ---------- */
//window.addEventListener("unhandledrejection", e => console.error("[unhandled]", e.reason));

/* ---------- 4. DOM refs ---------- */
const modal = document.getElementById("signupModal");
const signupBtn = document.getElementById("openSignup");
const loginBtn = document.getElementById("loginBtn");
const closeBtn = modal?.querySelector(".modal-close");
const googleBtn = document.getElementById("googleBtn");
const facebookBtn = document.getElementById("facebookBtn");
const loginContainer = document.querySelector(".login");

/* ---------- 5. Profile UI ---------- */
let profileWrapper, avatarImg, profileMenu;

let housesRes;


/* ---------- 5a. Profile UI menu handler (moved up to avoid ReferenceError) ---------- */
async function handleProfileMenu(e) {
  const act = e.target.dataset.act;
  if (!act) return;
  profileMenu.classList.remove("show");
  switch (act) {
    case "data":
      createBirthModal();
      window.openBirthModal();
      break;
    case "logout":
      await signOut(auth);
      break;
    case "delete":
      if (confirm("Сигурни ли сте, че желаете да изтриете профила? Това действие е необратимо.")) {
        try {
          const u = auth.currentUser;
          await deleteDoc(doc(db, "users", u.uid));
          await deleteUser(u);
        } catch (err) {
          alert("Грешка при изтриване: " + err.message);
        }
      }
      break;
    default:
      alert("Функцията предстои.");
  }
}
/* ----------------------------------------------------------------------------- */
function createProfileUI() {
  if (profileWrapper) return;
  profileWrapper = document.createElement("div");
  profileWrapper.className = "profile-wrapper hidden";
  avatarImg = document.createElement("img");
  avatarImg.className = "profile-avatar";
  avatarImg.alt = "Профил";
  profileMenu = document.createElement("div");
  profileMenu.className = "profile-menu";
  profileMenu.innerHTML = `<button data-act="data">Данни</button>
  <button data-act="photos">Снимки</button><button data-act="info">Информация</button><hr/>
  <button data-act="logout">Изход</button><button data-act="delete">Изтрий профила</button>`;
  profileWrapper.append(avatarImg, profileMenu);
  document.body.appendChild(profileWrapper);
  avatarImg.addEventListener("click", () => profileMenu.classList.toggle("show"));
  document.addEventListener("click", e => {
    if (!profileWrapper.contains(e.target)) profileMenu.classList.remove("show");
  });
  profileMenu.addEventListener("click", handleProfileMenu);
}

/* ---------- 5b. UI state handlers ---------- */
function showProfileUI(user) {
  // Ensure minimal profile is stored
  saveUser(user, user.providerData?.[0]?.providerId ?? "google.com")
    .catch(console.warn);

  avatarImg.src = user.photoURL || "images/default-avatar.png";
  profileWrapper.classList.remove("hidden");
  loginContainer?.classList.add("hidden");

  applyDashboardStyles();
  renderDashboard();
}

function showLoggedOutUI() {
  profileWrapper?.classList.add("hidden");
  loginContainer?.classList.remove("hidden");
  removeDashboardStyles();

  // Restore hero section if cleared
  const hero = document.querySelector(".hero");
  if (hero && !hero.querySelector("h1")) {
    hero.innerHTML =
                     '<button id="openSignup" type="button" class="cta">СЪЗДАЙ ПРОФИЛ</button>';
    document.getElementById("openSignup")?.addEventListener("click", () => document.getElementById("signupModal")?.classList.remove("hidden"));
  }
}

createProfileUI();

/* ---------- 6. Login modal helpers ---------- */
const openModal = () => modal?.classList.remove("hidden");
const closeModal = () => modal?.classList.add("hidden");
signupBtn?.addEventListener("click", openModal);
loginBtn?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
modal?.addEventListener("click", e => {
  if (e.target === modal) closeModal();
});

/* ---------- 7. Firestore minimal profile ---------- */
async function saveUser(user, provider) {
  await setDoc(doc(db, "users", user.uid), {
    name: user.displayName ?? "",
    email: user.email ?? "",
    photo: user.photoURL ?? "",
    provider,
    updatedAt: serverTimestamp()
  }, {
    merge: true
  });
}

/* ---------- 8. Auth providers ---------- */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});
const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope("email");

async function providerSignIn(p) {
  try {
    const cred = await signInWithPopup(auth, p);
    await saveUser(cred.user, p.providerId || (cred.providerId ?? "google.com"));
    closeModal();
  } catch (err) {
    if (["auth/popup-blocked", "auth/popup-closed-by-user"].includes(err.code)) {
      await signInWithRedirect(auth, p);
    } else {
      alert("❌ Неуспешен вход – " + err.message);
      throw err;
    }
  }
}
googleBtn?.addEventListener("click", () => providerSignIn(googleProvider));
facebookBtn?.addEventListener("click", () => providerSignIn(facebookProvider));

/* ---------- 9. Dashboard renderer ---------- */
function renderDashboard() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  hero.innerHTML = `<h1>Добре дошли в&nbsp;AstroMatch</h1>
  <div class="menu-btns">



    <button class="cta" data-target="natal">НАТАЛНА АСТРОЛОГИЯ</button>
    <div> 
<video autoplay muted loop id="bg-video">
    <source src="images/spining.mp4" type="video/mp4" />
  </video>

    <button class="cta" data-target="synastry">АСТРОЛОГИЯ НА ВЗАИМООТНОШЕНИЯТА</button>
    </div>
    <button class="cta" data-target="forecast">ПРОГНОСТИКА</button>
    <button id="horaryBtn" class="cta" onclick="location.href='horary.html'">ХОРАРНА АСТРОЛОГИЯ</button>
    <button class="cta" data-target="astromatch">AstroMatch❤️‍🔥</button>
  </div>`;
  hero.querySelector('[data-target="natal"]')?.addEventListener("click", handleNatalClick);
  hero.querySelector('[data-target="synastry"]')
    .addEventListener('click', () => {
      window.location.href = 'synastry.html';
    });
}

/* ---------- 10. Natal click logic ---------- */
async function apiPost(endpoint, body) {
  const r = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const PLANET_BG = {
  Sun: "Слънце",
  Moon: "Луна",
  Mercury: "Меркурий",
  Venus: "Венера",
  Mars: "Марс",
  Jupiter: "Юпитер",
  Saturn: "Сатурн",
  Uranus: "Уран",
  Neptune: "Нептун",
  Pluto: "Плутон",
  NorthNode: "Северен възел"
};
const SIGN_BG = {
  Aries: "Овен",
  Taurus: "Телец",
  Gemini: "Близнаци",
  Cancer: "Рак",
  Leo: "Лъв",
  Virgo: "Дева",
  Libra: "Везни",
  Scorpio: "Скорпион",
  Sagittarius: "Стрелец",
  Capricorn: "Козирог",
  Aquarius: "Водолей",
  Pisces: "Риби"
};
const ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "NorthNode"];

    let planetsOne = [];
    let houses1;
    let planetsAll;


async function handleNatalClick() {
  document.getElementById('backHomeBtn').classList.remove("hidden")
  let flexBox;
  const user = auth.currentUser;
  if (!user) {
    alert("Първо се впишете и запазете рожденни данни.");
    return;
  }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || !snap.data().astroPayload) {
    // Потребителят няма запазени рожденни данни – показваме формата
    createBirthModal();
    window.openBirthModal();
    return;
  }
  const {
    astroPayload,
    birthName,
    birthDate,
    birthTime,
    birthCity
  } = snap.data();

  const hero = document.querySelector(".hero");
  if (hero) hero.innerHTML = "";
  /* --- Loader overlay --- */
  let loader = document.getElementById("loadingOverlay");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "loadingOverlay";
    loader.textContent = "ЗАРЕЖДАНЕ, МОЛЯ ИЗЧАКАЙТЕ…";
    Object.assign(loader.style, {
      position: "fixed",
      inset: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "rgba(0,0,0,.7)",
      color: "#fff",
      fontSize: "1.8rem",
      fontWeight: 700,
      zIndex: 10000
    });
    document.body.appendChild(loader);
  }

  try {
    const [planetsRes, housesRes, wheelRes] = await Promise.all([
      apiPost("planets", astroPayload),
      apiPost("houses", astroPayload),
      apiPost("natal-wheel-chart", astroPayload)
    ]);
    console.log("Planets raw:", planetsRes);
    console.log("Houses raw:", housesRes);
    console.log("Natal chart raw:", wheelRes);

    houses1 = housesRes;
    planetsAll=planetsRes;

      if (interpretBtn) {
    interpretBtn.classList.remove("hidden");
  }


  /* helper – числов градус */
const sanitizeDeg = v =>
  typeof v === "number"
    ? v
    : parseFloat(v.toString().replace(",", ".").replace(/[^\d.+-]/g, "")) || null;
  
/* 0. сурови данни (винаги масив!) */
const housesRaw = (housesRes && housesRes.output && housesRes.output.Houses) || [];
if (!housesRaw.length) {
try {  console.error("housesRaw is empty or invalid ➜", housesRes);
  alert("API-то не върна куспиди на домовете.");
  return;                         // излизаме, за да не хвърля по-късно
} catch (e) { console.error('⚠️ Грешка в try блока:', e); }}

/* 2. масив от планети */
const planetsRaw = Array.isArray(planetsRes?.output)
      ? planetsRes.output                      // ✅ правилният път
      : planetsRes?.output?.Planets || planetsRes?.Planets || [];

/* --- Аспекти (мажорни) --- */
const aspectsObj = getMajorAspects(planetsRaw);
console.log("Аспекти:", aspectsObj);

const planetsArr = planetsRaw
  .filter(p => p.planet)                      // API връща и възли – режем ги
  .map(p => ({
    name : p.planet.en,
    sign : p.zodiac_sign?.name?.en ?? p.zodiac_sign?.en ?? p.sign,                       // "Sun", "Moon"…
    deg  : sanitizeDeg(p.fullDegree ?? p.degree)  // ✅ използвай fullDegree
  }));



/* 1. масив { house, deg } – дефиниран ПРЕДИ всяко използване */
const housesArr = housesRaw.map((h, i) => ({
  house: i + 1,
  deg  : sanitizeDeg(h.degree ?? h.cusp ?? h.fullDegree)
}));

/* 2. използваме го спокойно надолу */
const planetsHouses = planetsArr.reduce((acc, pl) => {
  acc[pl.name] = houseOf(pl.deg, housesArr);
  return acc;
}, {});

/* 0. сурови данни */
/* 0. сурови данни – винаги масиви */

    /* raw data */
  

  //  console.log(planetsRes.output);

  //  console.log(housesRes)
    /* Попълване на planets1 със sign (+ по-късно house) */
    for (let i = 1; i < 11; i++) {

      planetsOne.push({
        [planets_BG[planetsRes.output[i].planet.en]]: {
          знак: signs_BG[planetsRes.output[i].zodiac_sign.name.en],
      дом : planetsHouses[planetsRes.output[i].planet.en] ?? null
        }
      })

    }

    console.log("Обновеният planets1:", planetsOne);

    console.log(planetsOne)
    window.planetsOne= planetsOne;


    

    /* ── Обект: планета → { sign, house } ── */
    const planetsInfo = planetsArr.reduce((acc, pl) => {
      const houseNum = houseOf(pl.deg, housesArr); // № на дома (1‑12)
      acc[PLANET_BG[pl.name] ?? pl.name] = {
        deg: pl.deg,
        sign: SIGN_BG[pl.sign] ?? pl.sign,
        house: houseNum
      };
      return acc;
    }, {});
    console.log('Планети → { градус, знак, дом }:', planetsInfo);

    /* ---- Натално колело + данни ---- */
    const imgURL = (() => {
  if (!wheelRes || !wheelRes.output) return "";
  if (typeof wheelRes.output === "string") return wheelRes.output;
  if (typeof wheelRes.output === "object") {
    if (wheelRes.output.url) return wheelRes.output.url;
    if (wheelRes.output.image_url) return wheelRes.output.image_url;
    if (wheelRes.output.base64) return `data:image/png;base64,${wheelRes.output.base64}`;
  }
  return "";
})();
    if (imgURL) {
      // Създаваме елемент за изображение на наталната карта
      const img = document.createElement("img");
      img.src = imgURL;
      img.alt = "Natal chart";
      Object.assign(img.style, {
        maxWidth: "100%",
        height: "auto",
        borderRadius: "8px"
      });


      /* ---- Таблица с планети / домове ---- */
// Обновяваме глобалния обект planets1
Object.entries(planetsInfo).forEach(([plName, info]) => {
  if (!planets1[plName]) planets1[plName] = {};
  planets1[plName].sign  = info.sign;
  planets1[plName].house = info.house;
});

const tableBox = document.createElement("div");
Object.assign(tableBox.style, {
  display: "flex",
  gap: "2rem",
  alignItems: "center",
  flexWrap: "wrap",
  color: "#ffffff",
  fontSize: "0.9rem",
  lineHeight: "1.4"
});

const colPlanets = document.createElement("div");
const colHouses  = document.createElement("div");

const h1 = document.createElement("h3");
h1.textContent = "Планета – знак";
const h2 = document.createElement("h3");
h2.textContent = "Дом – знак";
[h1,h2].forEach(h=>{
  h.style.margin="0 0 .5rem";
  h.style.fontSize="1.05rem";
  h.style.color="#e0e0ff";
});

colPlanets.appendChild(h1);
colHouses.appendChild(h2);

// Запълване на колона 1 – планети
Object.entries(planets1).forEach(([pl, obj]) => {
  const p = document.createElement("p");
  p.style.margin="0";
  p.textContent = `${pl} – ${obj.sign}`;
  colPlanets.appendChild(p);
});

// Запълване на колона 2 – домове
const ZOD_BG = ["Овен","Телец","Близнаци","Рак","Лъв","Дева","Везни","Скорпион","Стрелец","Козирог","Водолей","Риби"];
housesArr.forEach(h => {
  const signName = ZOD_BG[Math.floor((((h.deg % 360)+360)%360) / 30)];
  const p = document.createElement("p");
  p.style.margin="0";
  p.textContent = `${h.house} дом – ${signName}`;
  colHouses.appendChild(p);
});

tableBox.appendChild(colPlanets);
tableBox.appendChild(colHouses);

/* ---- Flex контейнер (картинка + таблица) ---- */
flexBox = document.createElement("div");
      Object.assign(flexBox.style, {
        display: "flex",
        flexDirection: "row",
        gap: "2rem",
        alignItems: "center",
        justifyContent: "flex-start",
        flexWrap: "nowrap",
        margin: "1rem 0"
      });
      flexBox.appendChild(img);
      flexBox.appendChild(tableBox);

// вмъкваме под заглавието
hero.insertAdjacentElement("afterbegin", flexBox);

/* ---- ChatGPT отговор (placeholder) ---- */
const answerDiv = document.createElement("div");
Object.assign(answerDiv.style,{
    margin:"2rem auto",
    maxWidth:"70vw",
    color: "#ffffff",
    fontSize:"1rem",
    lineHeight:"1.5"
});
flexBox.insertAdjacentElement("afterend", answerDiv);

// махаме loader-а веднага след зареждане/грешка
img.onload = () => loader.remove();
img.onerror = () => loader.remove();

      // вмъкваме под заглавието
      hero.insertAdjacentElement("afterbegin", flexBox);

      // махаме loader-а веднага след като изображението се зареди или върне грешка
      img.onload = () => {
      loader.remove();
      // Заглавие след зареждане
      const title = document.createElement("h2");
      Object.assign(title.style, {
        textAlign: "center",
        fontSize: "1rem",
        fontWeight: "700",
        color: "#ffffff",
        textTransform: "uppercase",
        margin: "1.2rem auto 0",
        maxWidth: "70vw",
        lineHeight: 1.3
      });
      title.textContent = `Натална карта на ${birthName} роден на ${birthDate} в ${birthTime} в ${birthCity}`;
      hero?.insertAdjacentElement("afterbegin", title);
    };
      img.onerror = () => loader.remove();

    } else {
      console.warn("No natal-wheel URL found.");
      loader.remove();
    }

 
  } catch (err) {
    console.error(err);
    alert(err?.message || "Грешка");
    loader.remove();
  }
} // end handleNatalClick

let birthModal;
let lastSavedData = null;

function createBirthModal() {
  if (birthModal) return;
  injectBirthStyles();

  /* HTML skeleton */
  const tmpl = document.createElement("template");
  tmpl.innerHTML = `
  <div id="birthModal" class="modal hidden" aria-modal="true" role="dialog">
    <div class="modal-content">
      <button class="modal-close" aria-label="Затвори">&times;</button>
      <h2 class="modal-title">Въведи рожденни данни</h2>

      <form id="birthForm" class="birth-form">
        <div class="form-group">
          <label for="birthName">Име</label>
          <input type="text" id="birthName" required />
        </div>
        <div class="form-group">
          <label for="birthDate">Дата на раждане</label>
          <input type="date" id="birthDate" required />
        </div>
        <div class="form-group">
          <label for="birthTime">Час на раждане</label>
          <input type="time" id="birthTime" required />
        </div>
        <div class="form-group">
          <label for="birthCity">Град (латиница)</label>
          <div class="row-inline">
            <input type="text" id="birthCity" placeholder="e.g. Sofia" />
            <button type="button" id="searchCityBtn" class="cta small">ТЪРСИ</button>
          </div>
          <select id="cityResults" size="4" class="hidden"></select>
        </div>
        <div class="form-group row-inline">
          <input type="checkbox" id="birthDST" />
          <label for="birthDST">Лятно часово време</label>
        </div>

        <button type="submit" id="saveBirthBtn" class="cta" disabled>ЗАПАЗИ</button>
      </form>

      <div id="birthSummary" class="birth-summary hidden">
        <pre id="summaryContent"></pre>
        <button id="editBirthBtn" class="cta">ПРОМЕНИ</button>
        <button id="summaryHomeBtn" class="cta" type="button">НАЧАЛО</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(tmpl.content);

  /* Refs */
  birthModal = document.getElementById("birthModal");
  const bForm = document.getElementById("birthForm");
  const bName = document.getElementById("birthName");
  const bDate = document.getElementById("birthDate");
  const bTime = document.getElementById("birthTime");
  const bCity = document.getElementById("birthCity");
  const searchBtn = document.getElementById("searchCityBtn");
  const cityResults = document.getElementById("cityResults");
  const bDST = document.getElementById("birthDST");
  const saveBtn = document.getElementById("saveBirthBtn");

  const summaryDiv = document.getElementById("birthSummary");
  const summaryPre = document.getElementById("summaryContent");
  const editBtn = document.getElementById("editBirthBtn");
  const homeBtn = document.getElementById("summaryHomeBtn");
  const closeModalBtn = birthModal.querySelector(".modal-close");

  /* City search state */
  let cityArr = [];
  let selectedCity = null;

  /* Helpers */
  async function proxyPost(endpoint, body) {
    const res = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function toggleViews(showForm) {
    bForm.classList.toggle("hidden", !showForm);
    summaryDiv.classList.toggle("hidden", showForm);
  }

  function updateSave() {
    saveBtn.disabled = !(bName.value.trim() && bDate.value && bTime.value && selectedCity);
  }
  [bName, bDate, bTime].forEach(el =>
    el.addEventListener("input", updateSave)
  );

  /* Search for city */
  searchBtn.addEventListener("click", async () => {
    const query = bCity.value.trim();
    if (!query) return;
    searchBtn.disabled = true;
    try {
try {        const resp = await fetch(`/api/geo-details`, {          method: "POST",          headers: {            "Content-Type": "application/json"          },          body: JSON.stringify({            location: query          })        });        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);        const data = await resp.json();        cityArr = Array.isArray(data) ? data : (data.geonames || []);        console.log("Geo-details:", cityArr);        if (!cityArr.length) {          alert("Няма резултати.");          cityResults.classList.add("hidden");          return;        }        cityResults.innerHTML = "";      } catch (e) {        console.error("⚠️ Грешка при fetch към /api/geo-details:", e);      }      if (!cityArr.length) {
        alert("Няма резултати.");
        cityResults.classList.add("hidden");
        return;
      }
      cityResults.innerHTML = "";
      cityArr.forEach((c, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = c.complete_name;
        cityResults.appendChild(opt);
      });
      cityResults.classList.remove("hidden");
    } catch (e) {
      console.error(e);
      alert("Грешка при търсене.");
    } finally {
      searchBtn.disabled = false;
    }
  });

  cityResults.addEventListener("change", e => {
    selectedCity = cityArr[+e.target.value] || null;
    updateSave();
  });

  /* Optional: log houses */
  async function maybeLogHouses() {
      if (!(selectedCity && bDate.value && bTime.value)) return;
      const [y, m, d] = bDate.value.split("-").map(Number);
      const [hh, mm] = bTime.value.split(":").map(Number);
      try {
        const res = await proxyPost("houses", {
          year: y,
          month: m,
          date: d,
          hours: hh,
          minutes: mm,
          seconds: 0,
          latitude: +selectedCity.latitude,
          longitude: +selectedCity.longitude,
          timezone: Number(selectedCity.timezone_offset ?? -new Date().getTimezoneOffset() / 60),
          config: {
            observation_point: "geocentric",
            ayanamsha: "tropical",
            house_system: "Placidus",
            language: "en"
          }
        });
        console.log("Placidus houses:", res.output?.Houses || res);
      } catch (e) {
        console.warn("houses error:", e);
      }
    }
    [bDate, bTime].forEach(el =>
      el.addEventListener("change", maybeLogHouses)
    );

  /* Close helpers */
  const closeBirth = () => {
    birthModal.classList.add("hidden");
    toggleViews(true); // reset to form next open
  };
  closeModalBtn.addEventListener("click", closeBirth);
  summaryHomeBtn.addEventListener("click", closeBirth);
  birthModal.addEventListener("click", e => {
    if (e.target === birthModal) closeBirth();
  });

  /* Summary display */
  function showSummary(data) {
    summaryPre.textContent =
      `Име:  ${data.birthName}
Дата: ${data.birthDate}
Час:  ${data.birthTime}
Град: ${data.birthCity}
DST:  ${data.birthDST ? "Да" : "Не"}`;
    toggleViews(false);
  }

  /* Edit button */
  editBtn.addEventListener("click", () => {
    toggleViews(true);
    if (lastSavedData) {
      bName.value = lastSavedData.birthName;
      bDate.value = lastSavedData.birthDate;
      bTime.value = lastSavedData.birthTime;
      bDST.checked = lastSavedData.birthDST;
    }
    bCity.value = "";
    cityResults.classList.add("hidden");
    selectedCity = null;
    updateSave();
  });

  /* Submit (SAVE) */
  bForm.addEventListener("submit", async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Трябва да сте вписани.");
      return;
    }
    try {
      const [yy, mm, dd] = bDate.value.split("-").map(Number);
      const [hh, min] = bTime.value.split(":").map(Number);
      const tzBase = Number(selectedCity.timezone_offset ?? -new Date().getTimezoneOffset() / 60);
      const tz = tzBase + (bDST.checked ? 1 : 0);

      const astroPayload = {
        year: yy,
        month: mm,
        date: dd,
        hours: hh,
        minutes: min,
        seconds: 0,
        latitude: +selectedCity.latitude,
        longitude: +selectedCity.longitude,
        timezone: tz,
        config: {
          observation_point: "topocentric",
          ayanamsha: "tropical",
          language: "en"
        }
      };
     // console.log("Astro payload:", astroPayload);

      const dataObj = {
        birthName: bName.value.trim(),
        birthDate: bDate.value,
        birthTime: bTime.value,
        birthDST: bDST.checked,
        birthCity: selectedCity.complete_name,
        latitude: +selectedCity.latitude,
        longitude: +selectedCity.longitude,
        timezone_offset: tzBase,
        astroPayload,
        birthDataUpdatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", user.uid), dataObj, {
        merge: true
      });
      lastSavedData = dataObj;
      showSummary(dataObj);
    } catch (err) {
      console.error(err);
      alert("Грешка при запазване: " + err.message);
    }
  });

  /* Public opener – used from profile menu */
  window.openBirthModal = async () => {
    const u = auth.currentUser;
    if (!u) {
      alert("Трябва да сте вписани.");
      return;
    }

    birthModal.classList.remove("hidden");

    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists() && snap.data().birthDate) {
        lastSavedData = snap.data();
        showSummary(lastSavedData);

        bName.value = lastSavedData.birthName || u.displayName || "";
        bDate.value = lastSavedData.birthDate;
        bTime.value = lastSavedData.birthTime;
        bDST.checked = !!lastSavedData.birthDST;
        bCity.value = "";
        cityResults.classList.add("hidden");
        selectedCity = null;
        updateSave();
        return;
      }
    } catch (err) {
      console.warn("Couldn't fetch saved birth data", err);
    }

    toggleViews(true);
    bName.value = u.displayName || "";
    [bDate, bTime, bCity].forEach(el => el.value = "");
    bDST.checked = false;
    cityResults.classList.add("hidden");
    selectedCity = null;
    updateSave();
  };
}

/*************************************************
 * 11.  Auth state handlers & profile-menu logic
 *************************************************/

/*************************************************
 * 12.  Firebase onAuth listener
 *************************************************/
onAuthStateChanged(auth, async user => {
  if (user) {
    showProfileUI(user);
  } else {
    showLoggedOutUI();
    try {
      const res = await getRedirectResult(auth);
      if (res?.user) await saveUser(res.user, res.providerId);
    } catch (err) {
      console.error("redirectResult", err);
    }
  }
});

// Обект с удобна за работа структура: { планета: { sign: "", house: "" } }
let planets1 = {
  "Слънце": {
    sign: "",
    house: ""
  },
  "Луна": {
    sign: "",
    house: ""
  },
  "Меркурий": {
    sign: "",
    house: ""
  },
  "Венера": {
    sign: "",
    house: ""
  },
  "Марс": {
    sign: "",
    house: ""
  },
  "Юпитер": {
    sign: "",
    house: ""
  },
  "Сатурн": {
    sign: "",
    house: ""
  },
  "Уран": {
    sign: "",
    house: ""
  },
  "Нептун": {
    sign: "",
    house: ""
  },
  "Плутон": {
    sign: "",
    house: ""
  },
  "Северен възел": {
    sign: "",
    house: ""
  }
};



// ========================================
// Връща мажорните аспекти (Conjunction, Sextile, Square, Trine, Opposition)
// между планетите, получени от planetsRaw. Използва вече дефинираните в
// script1.js помощни функции: ASPECTS, angularDist и orbFor.
// ============================================================================

/* --------------------------------------------------------------------------
 * 1. Помощни променливи и функции от script1.js
 * ------------------------------------------------------------------------ */
//const ASPECTS     = window.ASPECTS;      // масив с всички аспекти
//const angularDist = window.angularDist;  // ъглово разстояние между две точки
//const orbFor      = window.orbFor;       // допустим орб за даден аспект/двойка
const ASPECTS = [{
             name: "Conjunction",
             angle: 0,
             orb: 5,
             sunMoonOrb: 8
         },
         {
             name: "Semi‑sextile",
             angle: 30,
             orb: 1,
             sunMoonOrb: 2
         },
         {
             name: "Decile",
             angle: 36,
             orb: 1,
             sunMoonOrb: 1
         },
         {
             name: "Nonagon",
             angle: 40,
             orb: 2,
             sunMoonOrb: 2
         },
         {
             name: "Semi‑square",
             angle: 45,
             orb: 1,
             sunMoonOrb: 1.5
         },
         {
             name: "Sextile",
             angle: 60,
             orb: 5,
             sunMoonOrb: 8
         },
         {
             name: "Quintile",
             angle: 72,
             orb: 2,
             sunMoonOrb: 2
         },
         {
             name: "Bino­nonagon",
             angle: 80,
             orb: 1,
             sunMoonOrb: 1
         },
         {
             name: "Square",
             angle: 90,
             orb: 5,
             sunMoonOrb: 8
         },
         {
             name: "Senta­gon",
             angle: 100,
             orb: 1.5,
             sunMoonOrb: 1.5
         },
         {
             name: "Tridecile",
             angle: 108,
             orb: 1.5,
             sunMoonOrb: 2
         },
         {
             name: "Trine",
             angle: 120,
             orb: 5,
             sunMoonOrb: 8
         },
         {
             name: "Sesqui‑square",
             angle: 135,
             orb: 2,
             sunMoonOrb: 3
         },
         {
             name: "Bi‑quintile",
             angle: 144,
             orb: 1,
             sunMoonOrb: 1
         },
         {
             name: "Quincunx",
             angle: 150,
             orb: 3,
             sunMoonOrb: 4
         },
         {
             name: "Opposition",
             angle: 180,
             orb: 5,
             sunMoonOrb: 7
         },
         {
             name: "Semi‑nonagon",
             angle: 20,
             orb: 0.5,
             sunMoonOrb: 0.5
         }
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


/**
 * Проверява дали между две тела има аспект.
 * @param   {{name:string,deg:number}} p1
 * @param   {{name:string,deg:number}} p2
 * @returns {{aspect:Object,delta:number}|null}
 */
function matchAspect(p1, p2) {
  const diff = angularDist(p1.deg, p2.deg);
  for (const asp of ASPECTS) {
    const delta = Math.abs(diff - asp.angle);
    if (delta <= orbFor(asp, p1.name, p2.name)) return { aspect: asp, delta };
  }
  return null;
}

/**
 * Намира всички аспекти между елементите в масива arr.
 * @param   {Array<{name:string,deg:number}>} arr
 * @returns {Array<{p1:string,p2:string,aspect:string}>}
 */
function aspectsBetween(arr) {
  const hits = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const res = matchAspect(arr[i], arr[j]);
      if (res) hits.push({ p1: arr[i].name, p2: arr[j].name, aspect: res.aspect.name });
    }
  }
  return hits;
}

/* --------------------------------------------------------------------------
 * 2. Мажорни аспекти (☌ ✶ □ △ ☍)
 * ------------------------------------------------------------------------ */
const MAJOR = ["Conjunction", "Sextile", "Square", "Trine", "Opposition"];

/**
 * Нормализира planetsRaw → [{name,deg}]
 * @param   {Object} planetsRaw
 * @returns {Array<{name:string,deg:number}>}
 */
function normalizePlanets(planetsRaw) {
  if (!planetsRaw || !Array.isArray(planetsRaw.output)) return [];
  return planetsRaw.output
    .filter(p => p && p.planet && p.fullDegree != null)   // махаме възли и фиктивни
    .map(p => ({ name: p.planet.en, deg: p.fullDegree }));
}

/* --------------------------------------------------------------------------
 * 3. Главната публична функция
 * ------------------------------------------------------------------------ */
/**
 * Връща обект с мажорните аспекти.
 *
 * @example
 * const aspects = getMajorAspects(planetsRaw);
 * // => { "Sun-Moon": "Conjunction", "Mercury-Mars": "Square", ... }
 *
 * @param   {Object} planetsRaw – резултат от Astro-API
 * @returns {Object}            – ключ: "PlanetA-PlanetB", стойност: име на аспект
 */
export function getMajorAspects(planetsRaw, housesRes) {
  const planetsArr = normalizePlanets(planetsRaw);
  const allHits    = aspectsBetween(planetsArr);

  return allHits
    .filter(a => MAJOR.includes(a.aspect))
    .reduce((acc, a) => {
      acc[`${a.p1}-${a.p2}`] = a.aspect;
      return acc;
    }, {});
}

/* --------------------------------------------------------------------------
 * 4. Бърз локален тест (по избор)
 * ------------------------------------------------------------------------ */
// Ако имаш глобален обект window.planetsRaw, разкоментирай теста по-долу:
//
// const aspects = getMajorAspects(window.planetsRaw);
// console.log(aspects);


// Функция за последователни заявки към ChatGPT
// Последователни заявки към ChatGPT и визуализация
  // Houses
const housesRaw = (housesRes && housesRes.output && housesRes.output.Houses) || [];  housesRaw.forEach(async (house, index) => {
    const question = `${index + 1} дом в ${house}, обясни и интерпретирай с поне 6-7 изречения.`;
    outputDiv.innerHTML += `<p><strong>${index + 1} дом:</strong> ${answer}</p>`;
  });

let img;

async function sendQuestion(question) {
         const res = await fetch("/api/chat", {
             method: "POST",
             headers: {
                 "Content-Type": "application/json"
             },
             body: JSON.stringify({
                 question
             })
         });
         //if (!res.ok) throw new Error("Chat request failed");
         if (!res.ok) {
             const txt = await res.text(); // <- истинското съобщение
             throw new Error(`Chat request failed (${res.status}): ${txt}`);
         }
         const {
             answer
         } = await res.json();
         return answer; // връща STRING
     }
     window.sendQuestion = sendQuestion; 

     /* ---------- универсален fetch (копие от scriptOld.js) ---------- */
     async function callApi(endpoint, body) { // 👉 връща директно JSON
         const res = await fetch(`/api/${endpoint}`, {
             method: "POST",
             headers: {
                 "Content-Type": "application/json"
             },
             body: JSON.stringify(body)
         });
         if (!res.ok) throw new Error(`HTTP ${res.status}`);
         return res.json();
     }

document.getElementById("interpretBtn")?.addEventListener("click", () => {
  console.log("🔮 Интерпретация по карта:");
  console.log("🌞 Планети:", planets1);
  console.log("🏠 Домове:", houses1.output.Houses);

  console.log(planets1)
  window.planets1 = planets1;
  interpretBtn.classList.add("hidden");

  // Извличане и форматиране на планетите от planetsAll
const planetsRaw = Array.isArray(planetsAll?.output)
  ? planetsAll.output
  : planetsAll?.output?.Planets || planetsAll?.Planets || [];

const sanitizeDeg = v =>
  typeof v === "number"
    ? v
    : parseFloat(v.toString().replace(",", ".").replace(/[^\d.+-]/g, "")) || null;

const planetsArr = planetsRaw
  .filter(p => p.planet) // игнорира възли и празни обекти
  .map(p => ({
    name: p.planet.en,
    deg: sanitizeDeg(p.fullDegree ?? p.degree)
  }));

// Изчисляване на аспектите
const aspects = aspectsBetween(planetsArr);

// Принтиране в конзолата във формата на обект
const aspectsByPlanet = {};

aspects.forEach(({ p1, p2, aspect, exactDiff, delta }) => {
  if (!aspectsByPlanet[p1]) aspectsByPlanet[p1] = [];
  if (!aspectsByPlanet[p2]) aspectsByPlanet[p2] = [];
  aspectsByPlanet[p1].push({ with: p2, aspect, exactDiff, delta });
  aspectsByPlanet[p2].push({ with: p1, aspect, exactDiff, delta }); // огледално
});
[]
console.log("Мажорни аспекти:", aspectsByPlanet);

let answers=[];
async function askGpt () {
    document.getElementById('answersGPT').classList.remove("hidden");



     for (const pl in planets1) {
        document.getElementById('answersGPT').innerHTML = "";
                //console.log(planets1)
                 const q = `Какво означава  ${pl} в ${planets1[pl].sign} в ${planets1[pl].house} дом ` +
                     `интерпретирай с 6-7 изречения`;
                 const a = await sendQuestion(q);
                // console.log(a);
                answers.push(a)
  

                document.getElementById("answersGPT").innerHTML+=`${a}<br>`;       
             }

                    for (const house in houses1.output.Houses) {

        let sign=houses1.output.Houses[house].zodiac_sign.name.en;
                const q = `Какво означава  ${houses1.output.Houses[house].House} дом в ${SIGN_BG[sign]} ` +
                    `интерпретирай с 6-7 изречения`;
                 const a = await sendQuestion(q);
                 //console.log(a);
                answers.push(a)
               document.getElementById("answersGPT").innerHTML+=`${a}<br>`;       
             } 
            
  for (const pl in aspectsByPlanet) {
              //  console.log(aspectsByPlanet[pl]);

              for (let i =0;i<aspectsByPlanet[pl].length;i++) {
                console.log(aspectsByPlanet[pl][0]);
                console.log('първа планета: ' + pl)  // Първа вланета
                console.log("втроа планета" + aspectsByPlanet[pl][0].with); //2 планета
                console.log("аспект: " + aspectsByPlanet[pl][0].aspect); 
                const q = `Какво означава  ${pl} в аспект ${aspectsByPlanet[pl][0].aspect} в планета ${aspectsByPlanet[pl][0].with} ` +
                     `интерпретирай с 6-7 изрече.ия`;
                 const a = await sendQuestion(q);
                // console.log(a);
                answers.push(a)
                document.getElementById("answersGPT").innerHTML+=`${a}<br>`;  
              }
               
      
             }
  
}
askGpt();

});

const backHomeBtn = document.getElementById("backHomeBtn");

document.addEventListener("DOMContentLoaded", () => {
  const backHomeBtn = document.getElementById("backHomeBtn");
  if (backHomeBtn) {
    backHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  const horaryBtn = document.getElementById("horaryBtn");
  if (horaryBtn) {
    horaryBtn.addEventListener("click", () => {
      console.log("kur")
  heroSection?.classList.add("hidden");
  horarySection?.classList.remove("hidden");
    });
  }
});


 
