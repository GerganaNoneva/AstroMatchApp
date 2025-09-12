// astro-credits.js (horary) — cc-scrim modal with credits fetched like natal/synastry
// Uses Firestore doc `users/{uid}` with field `credits`, and shows #creditConfirm modal.

import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, runTransaction, collection, query, limit, getDocs, setLogLevel
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

try { setLogLevel('silent'); } catch(_) {}

const auth = getAuth();
const db   = getFirestore();

// Button that triggers generation on horary.html
const generateBtn =
  document.getElementById('askBtn') ||
  document.getElementById('generateAnalysis') ||
    document.getElementById('generateAnalysisBtn') ||
  document.getElementById('analyzeBtn') ||
  document.getElementById('generatePrognostika') ||   // ← добави това
  document.querySelector('[data-role="generate"], .generate-btn');

// ===== helpers =====

let __ccBodyHtml = null;


// Wait until auth state is settled (or timeout)
async function waitForAuthReady(auth, timeoutMs = 1500){
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve) => {
    let settled = false;
    const to = setTimeout(() => { if (!settled){ settled = true; try{ unsub(); }catch(_){} resolve(null); } }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      try { unsub(); } catch(_) {}
      resolve(user || null);
    }, { onlyCurrentState: true });
  });
}

// Parse number safely
function parseNumber(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

// Extract credits from a plain object; prefer fields used on natal/synastry
function extractCredits(data){
  if (!data || typeof data !== 'object') return 0;
  const cands = [
    data.credits, data.balance,
    data.wallet?.credits, data.wallet?.balance,
    data.data?.credits, data.data?.balance,
  ];
  for (const c of cands){
    const n = parseNumber(c);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

// Optional backend fallback
async function fetchCreditsFromApi(){
  try{
    const res = await fetch('/api/credits-balance', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({}) });
    if (!res.ok) return null;
    const data = await res.json().catch(()=>null);
    const n = Number(data?.balance ?? data?.credits ?? data);
    return Number.isFinite(n) ? n : null;
  }catch(_){ return null; }
}

// Locate a user doc to read/write credits, mirroring synastry first
async function findUserDocRef(uid){
  // 1) Prefer top-level /users/{uid} (this is what synastry/natal use)
  try {
    const topRef = doc(db, 'users', uid);
    const topSnap = await getDoc(topRef);
    if (topSnap.exists()) return topRef;
  } catch(_) {}

  // 2) Fallback: /users/{uid}/credits subdocument if present
  try {
    const creditsDocRef = doc(db, 'users', uid, 'credits');
    const creditsSnap = await getDoc(creditsDocRef);
    if (creditsSnap.exists()) return creditsDocRef;
  } catch(_) {}

  // 3) Fallback: first doc in /users/{uid}/user/*
  try {
    const qRef = query(collection(db, 'users', uid, 'user'), limit(1));
    const snap = await getDocs(qRef);
    let d0 = null; snap.forEach(d => { if (!d0) d0 = d; });
    if (d0) return doc(db, 'users', uid, 'user', d0.id);
  } catch(_) {}

  // 4) Last resort: /users/{uid}
  return doc(db, 'users', uid);
}

// ===== cc-scrim modal =====
function openCreditConfirmSyn(cost, have){
  const scrim = document.getElementById('creditConfirm');
  const ccTitle2 = document.getElementById('cc-title');
  const ccCost2A = document.getElementById('cc-cost');
  const ccCost2B = document.getElementById('cc-cost2');
  const ccBal2   = document.getElementById('cc-balance');
  const ok2      = document.getElementById('cc-confirm');
  const no2      = document.getElementById('cc-cancel');
  if (!scrim || !ok2 || !no2) return null;

  if (ccTitle2) ccTitle2.textContent = 'Потвърдете покупката';
  if (ccCost2A) ccCost2A.textContent = String(cost);
  if (ccCost2B) ccCost2B.textContent = String(cost);
  if (ccBal2)   ccBal2.textContent   = String(Number.isFinite(have) ? have : 0);

  scrim.hidden = false;
  return new Promise((resolve) => {
    const cleanup = () => {
      try { ok2.removeEventListener('click', onOk); } catch(_){}
      try { no2.removeEventListener('click', onNo); } catch(_){}
      try { scrim.removeEventListener('click', onScrim); } catch(_){}
      scrim.hidden = true;
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };
    const onScrim = (e) => { if (e.target === scrim) { onNo(); } };

    ok2.addEventListener('click', onOk, { once:true });
    no2.addEventListener('click', onNo, { once:true });
    scrim.addEventListener('click', onScrim, { once:true });
  });
}

// Legacy fallback modal (if present); otherwise return null so we use cc-scrim
function openConfirm(cost, have){
  const modal = document.getElementById('creditsModal');
  if (!modal) return null;
  const balEl = document.getElementById('userCredits');
  const btnOk = document.getElementById('creditsConfirm');
  const btnNo = document.getElementById('creditsCancel');

  if (balEl) balEl.textContent = String(Number.isFinite(have) ? have : 0);

  modal.classList.remove('hidden'); document.body.style.overflow='hidden';
  return new Promise((resolve) => {
    const cleanup = () => { modal.classList.add('hidden'); document.body.style.overflow=''; };
    const onOk = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };
    btnOk?.addEventListener('click', onOk, { once:true });
    btnNo?.addEventListener('click', onNo, { once:true });
    modal.addEventListener('click', (e)=>{ if (e.target?.getAttribute?.('data-close')==='true'){ onNo(); } }, { once:true });
  });
}

/** Show dedicated "Недостатъчно кредити" modal (same look as natal) */
function showInsufficientCredits(){
  const ccScrim = document.getElementById('creditConfirm');
  const ccTitle = document.getElementById('cc-title');
  if (!ccScrim){ alert('Нямате достатъчни кредити'); return; }
  const body = ccScrim.querySelector('.cc-body');
  if (!__ccBodyHtml && body) __ccBodyHtml = body.innerHTML; // кешни оригинала

  ccScrim.classList.add('cc-insufficient');
  if (ccTitle) ccTitle.textContent = 'Недостатъчно кредити';
  if (body){
    body.innerHTML =
      '<p class="cc-line" style="justify-content:center; font-weight:800; font-size:16px;">Нямате достатъчни кредити</p>' +
      '<div class="cc-actions" style="justify-content:center;">' +
      '  <button id="cc-close-only" class="cta primary" type="button">Разбрах</button>' +
      '</div>';
    const btn = body.querySelector('#cc-close-only');
    if (btn) btn.addEventListener('click', ()=> {
      // ВЪЗСТАНОВЯВАНЕ
      try {
        if (body && __ccBodyHtml) body.innerHTML = __ccBodyHtml;
        ccScrim.classList.remove('cc-insufficient');
        ccScrim.hidden = true;
      } catch(_){}
    }, { once:true });
  }
  ccScrim.hidden = false;
}


// ===== Gate on ask button =====
let gateActive = false;

generateBtn?.addEventListener('click', async (ev) => {
  try{
    if (gateActive) return;
    // prevent double-run unless explicitly bypassed
    if (window.__acBypassOnce) { window.__acBypassOnce = false; return; }

    // Prepare and stop the default click until we confirm
    ev?.preventDefault?.();
    ev?.stopImmediatePropagation?.();
    ev?.stopPropagation?.();

    gateActive = true;

    // Reset cc-scrim if previously shown "Недостатъчно кредити"
    try {
      const scrim = document.getElementById('creditConfirm');
      if (scrim?.classList?.contains('cc-insufficient')) {
        scrim.classList.remove('cc-insufficient');
        const body = scrim.querySelector('.cc-body');
        if (body && window.__ccBodyHtml) body.innerHTML = window.__ccBodyHtml;
      }
    } catch(_){}

    // Cost: prefer button dataset, then modal DOM, then default 10
    const btnCost = Number(generateBtn?.dataset?.cost);
    const domCost = Number(document.getElementById('cc-cost')?.textContent?.trim());
    const cost = Number.isFinite(btnCost) ? btnCost : (Number.isFinite(domCost) ? domCost : 10);

    // Wait auth settle
    const user = await waitForAuthReady(auth);
    if (!user){
      const ok = await (openCreditConfirmSyn(cost, 0) ?? openConfirm(cost, 0));
      if (!ok) { gateActive = false; return; }
      // proceed without deduct (no auth)
      window.__acBypassOnce = true;
      generateBtn.click();
      return;
    }

    const uid = user.uid;

    // Get current balance like natal/synastry: users/{uid}.credits
    let have = 0;
    try {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      have = snap.exists() ? extractCredits(snap.data()) : 0;
    } catch(_){ have = 0; }

    // fallback to API if still 0/NaN
    if (!Number.isFinite(have) || have === 0){
      const apiHave = await fetchCreditsFromApi();
      if (Number.isFinite(apiHave)) have = apiHave;
    }

    if (Number.isFinite(have) && have < cost){
      showInsufficientCredits();
      gateActive = false; return;
    }
const ok = await (openCreditConfirmSyn(cost, have) ?? openConfirm(cost, have));
    if (!ok) { gateActive = false; return; }

    // Deduct credits with a transaction on /users/{uid} (synastry-style)
    try {
      const ref = await findUserDocRef(uid);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists() ? (snap.data() || {}) : {};
        const bal  = extractCredits(data);
        if (!Number.isFinite(bal) || bal < cost){ throw new Error('INSUFFICIENT_CREDITS'); }
        const next = { ...(data || {}) };
        if (typeof next.credits === 'number')       next.credits = Math.max(0, Number(next.credits) - cost);
        else if (typeof next.balance === 'number')  next.balance = Math.max(0, Number(next.balance) - cost);
        else next.credits = Math.max(0, bal - cost);
        tx.set(ref, next, { merge: true });
      });
    } catch(e){
      const msg = String(e?.message || e);
      if (msg.includes('INSUFFICIENT')){
        showInsufficientCredits();
        gateActive = false; return;
      }
      console.warn('[credits] deduct failed:', e);
      // allow flow even if deduct fails
    }

    // proceed
    window.__acBypassOnce = true;
    generateBtn.click();
  } finally {
    setTimeout(()=>{ gateActive = false; }, 50);
  }
}, true); // capture so we run before other listeners
