
/**
 * began.patch.js
 * Drop-in, non-destructive enhancements for began.html:
 * 1) Toggle chat on chatbot button click (open/close on the same button).
 * 2) On a user's first registration/sign-in, auto-load the top "Transits" panel.
 *
 * Include on began.html as:
 *   <script type="module" src="./began.patch.js"></script>
 * (Place it just before </body>.)
 */

import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ——— Chat toggle ———
(function chatToggle(){
  function pickLast(sel){
    const all = Array.from(document.querySelectorAll(sel));
    return all.length ? all[all.length-1] : document.querySelector(sel);
  }
  function toggle(open){
    const popup = pickLast('#chatPopup');
    if (!popup) return;
    popup.classList.toggle('open', typeof open === 'boolean' ? open : !popup.classList.contains('open'));
    if (popup.classList.contains('open')) {
      const input = popup.querySelector('#chatInput');
      if (input) setTimeout(() => { try{ input.focus(); }catch(_){ } }, 0);
    }
  }
  function wire(){
    const fab   = pickLast('#chatFab');
    const close = pickLast('#chatClose');
    if (fab)   fab.addEventListener('click', (e)=>{ try{ e.preventDefault(); }catch(_){ } toggle(); });
    if (close) close.addEventListener('click', (e)=>{ try{ e.preventDefault(); }catch(_){ } toggle(false); });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') toggle(false); });
    document.addEventListener('click', (e)=>{
      const popup = pickLast('#chatPopup');
      const fab   = pickLast('#chatFab');
      if (!popup || !popup.classList.contains('open')) return;
      const t = e.target;
      if (!popup.contains(t) && (!fab || !fab.contains(t))) toggle(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();

// ——— First-time Transits loader ———
(function firstTransits(){
  async function markFirstShown(uid){
    try {
      await setDoc(doc(db, 'users', uid), { firstTransitsShown: true, firstTransitsAt: serverTimestamp() }, { merge: true });
    } catch(e){ /* no-op */ }
  }
  function tryLoadTransitsUI(){
    // Call one of the known functions if present
    const fns = ['loadTransitsPanel','loadTransits','renderTransits','showTransits'];
    for (const name of fns){
      const fn = window[name];
      if (typeof fn === 'function'){ try{ fn(); return true; }catch(_){ } }
    }
    // Fire a custom event most scripts can listen for
    try {
      window.dispatchEvent(new Event('began:load-transits'));
      document.dispatchEvent(new Event('began:load-transits'));
    } catch(_){}
    // Click a likely button if present
    const btn = document.querySelector('#transitsBtn, [data-action="transits"], button[name="transits"]');
    if (btn){ try{ btn.click(); return true; }catch(_){ } }
    return false;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      const data = snap.exists() ? (snap.data() || {}) : {};
      // if this is the first time, or flag missing -> trigger transits now
      if (!data.firstTransitsShown) {
        // Give the page a tick to finish layout, then trigger
        setTimeout(() => { tryLoadTransitsUI(); }, 120);
        // Mark as shown to avoid re-triggering next time
        await markFirstShown(user.uid);
      }
    } catch(e){ /* ignore */ }
  });
})();
