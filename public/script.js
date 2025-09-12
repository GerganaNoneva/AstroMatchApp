// App entry for index.html
import { signInWithGoogle, handleRedirectResult, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// Modal open/close
const signupModal = document.getElementById("signupModal");
const openSignup  = () => signupModal.classList.remove("hidden");
const closeSignup = () => signupModal.classList.add("hidden");

document.getElementById("openSignup").addEventListener("click", openSignup);
document.getElementById("loginBtn").addEventListener("click", openSignup);
document.querySelector(".modal-close").addEventListener("click", closeSignup);
signupModal.addEventListener("click", e => { if (e.target === signupModal) closeSignup(); });

// Google sign-in button
document.getElementById("googleBtn").addEventListener("click", async () => {
  try {
    await signInWithGoogle();
    // If popup works, onAuthStateChanged below will redirect.
    // If popup is blocked, signInWithGoogle() falls back to redirect and navigates away.
  } catch (e) {
    console.error(e);
    alert("Неуспешен вход с Google. Виж логовете в конзолата.");
  }
});

// Optional FB placeholder
const fbBtn = document.getElementById("facebookBtn");
if (fbBtn) fbBtn.addEventListener("click", () => alert("Facebook вход – добавете реализация."));

// 1) If we returned from a redirect on mobile, complete the sign-in and redirect to profile.html
handleRedirectResult((user) => {
  if (user) window.location.href = "began.html";
});

// 2) If popup succeeded (or user was already signed in), redirect as well
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "began.html";
});

