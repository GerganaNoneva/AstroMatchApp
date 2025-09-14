import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js"; 
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { 
  getAuth, GoogleAuthProvider, FacebookAuthProvider,
  signInWithPopup, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithRedirect, getRedirectResult, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDykv1NMDM1oI-zw1lItXb6mzuj0wvNnHY",
  authDomain: "matchastro-94253.firebaseapp.com",
  projectId: "matchastro-94253",
  storageBucket: "matchastro-94253.firebasestorage.app",
  messagingSenderId: "1053875853232",
  appId: "1:1053875853232:web:fb5c36d2bf552306c76875",
  measurementId: "G-V3QL030PZ5"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.warn);

// OAuth Providers
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const facebookProvider = new FacebookAuthProvider();

// Гарантираме вход (анонимен, ако няма активен потребител)
export async function ensureSignedIn() {
  try {
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    await createUserRecord(cred.user, "anonymous");
    return cred.user;
  } catch (e) {
    console.warn("ensureSignedIn error:", e);
    throw e;
  }
}

async function createUserRecord(user, provider) {
  const ref = doc(db, "users", user.uid);
  await setDoc(ref, {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    provider,

    reports: { natal: [], synastry: [], prognostika: [], horary: [] }
  }, { merge: true });
}

export async function signInWithFacebook() {
  const result = await signInWithPopup(auth, facebookProvider);
  await createUserRecord(result.user, "facebook");
  window.location.href = "profile.html";
}

// Device/Browser helpers
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandaloneSafariPWA() {
  return window.navigator.standalone === true;
}
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /(FBAN|FBAV|Instagram|Line|Twitter|Snapchat|LinkedIn|TikTok|Pinterest)/i.test(ua);
}

export async function signInWithGoogle() {
  // On iOS/Safari PWA and many in-app browsers, popups are blocked -> use redirect
  const useRedirect = isIos() || isStandaloneSafariPWA() || isInAppBrowser();
  try {
    if (useRedirect) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    const result = await signInWithPopup(auth, googleProvider);
    if (result && result.user) {
      await createUserRecord(result.user, "google");
    }
  } catch (err) {
    // Fallback if popup is blocked
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user")) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      console.error("Google sign-in error:", err);
      throw err;
    }
  }
}

// Complete redirect flow on mobile/in-app browsers
export async function handleRedirectResult(onSuccess) {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await createUserRecord(result.user, "google");
      if (typeof onSuccess === "function") onSuccess(result.user);
    }
  } catch (err) {
    console.error("getRedirectResult error:", err);
  }
}

// Optional central auth listener (no redirects here)
onAuthStateChanged(auth, () => {});

// === Reports helpers ===
export async function ensureReportsShape(uid){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const hasReports = snap.exists() && snap.data() && snap.data().reports;
  if (!hasReports) {
    await setDoc(ref, {
      reports: { natal: [], synastry: [], prognostika: [], horary: [] }
    }, { merge: true });
  }
}
export async function addReport(uid, kind, reportObj){
  const allowed = new Set(["natal", "synastry", "prognostika", "horary"]);
  if (!allowed.has(kind)) throw new Error("Unknown report kind: " + kind);
  const ref = doc(db, "users", uid);
  const data = {};
  data["reports."+kind] = arrayUnion(reportObj);
  await updateDoc(ref, data);
}