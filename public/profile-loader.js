
// profile-loader.js — тихо зарежда профила и праща глобално събитие "user-profile-loaded"
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore, collection, query, limit, getDocs, doc, getDoc, setLogLevel } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

try { setLogLevel('silent'); } catch(_) {}

const auth = getAuth();
const db   = getFirestore();

function _num(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : Number.NaN;
}
function _extractBalance(data){
  if (!data) return Number.NaN;
  const cands = [
    data.astroCredits, data.credits, data.balance, data.tokens, data.astro_credits,
    data.wallet?.balance, data.wallet?.credits,
    data.data?.balance, data.data?.credits, data.user?.balance, data.user?.credits,
    data.result?.balance, data.meta?.balance
  ];
  for (const c of cands){
    const n = _num(c); if (!Number.isNaN(n)) return n;
  }
  return Number.NaN;
}

async function readFirstUserDoc(uid){
  const q = query(collection(db, 'users', uid, 'user'), limit(1));
  const snap = await getDocs(q);
  let d0 = null; snap.forEach(d => { if (!d0) d0 = d; });
  if (!d0) return null;
  const data = d0.data() || {};
  return { id: d0.id, data, ref: doc(db, 'users', uid, 'user', d0.id) };
}

function notifyLoaded(payload){
  try {
    document.dispatchEvent(new CustomEvent('user-profile-loaded', { detail: payload }));
  } catch(_) {}
}

onAuthStateChanged(auth, async (user) => {
  if (!user){
    notifyLoaded({ loggedIn:false });
    return;
  }
  try {
    const { uid, displayName, email, photoURL } = user;
    let credits = Number.NaN;
    let profile = null;

    const first = await readFirstUserDoc(uid);
    if (first){
      credits = _extractBalance(first.data);
      profile = first.data;
    } else {
      try {
        const rootDoc = await getDoc(doc(db, 'users', uid));
        if (rootDoc.exists()){
          const d = rootDoc.data();
          credits = _extractBalance(d);
          profile = d;
        }
      } catch(_) {}
    }

    const name = (profile && (profile.name || profile.fullName)) || displayName || '';
    notifyLoaded({ loggedIn:true, uid, email, displayName:name, photoURL, credits, profile });
  } catch (e){
    // изпращаме грешка, за да може страница да реагира ако желае
    notifyLoaded({ loggedIn:true, error: String(e && e.message || e) });
  }
});
