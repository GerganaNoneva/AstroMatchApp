# Backend for `/api/delete-account`

This adds a Firebase Cloud Function (Express app) that handles account deletion:
- Verifies the caller's Firebase ID token
- Recursively deletes Firestore data under `/users/{uid}`
- Optionally deletes the Firebase Auth user (`deleteAuthUser: true`)

## Files
- `functions/index.js` — function source
- `functions/package.json` — dependencies
- `firebase.json` — Hosting rewrite so `/api/**` routes go to the function

## Deploy
```bash
npm i -g firebase-tools    # if needed
firebase login             # once
firebase use <your-project-id>
cd <project-root>          # the directory with firebase.json
npm --prefix functions install
firebase deploy --only functions,hosting
```

Make sure your frontend calls:
```js
const token = await auth.currentUser.getIdToken(true);
await fetch("/api/delete-account", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
  body: JSON.stringify({ uid: auth.currentUser.uid, deleteAuthUser: true })
});
```# AstroMatchApp
