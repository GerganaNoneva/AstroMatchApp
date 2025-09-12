# Gen2 backend (Node.js 22)

Error explained: you're trying to deploy Node.js 22 to **Gen1**, which only supports up to Node 16. This setup uses **Functions Gen2** via the v2 API so Node.js 22 works.

## Files
- `functions/index.js` – uses `firebase-functions/v2/https` (`onRequest`) + Express
- `functions/package.json` – `engines.node: "22"`
- `firebase.json` – `"functions.runtime": "nodejs22"` and Hosting rewrite to `app`

## Deploy
```bash
npm --prefix functions install
firebase use <your-project-id>
firebase deploy --only functions,hosting
```

If you previously deployed a Gen1 function named `app`, and CLI complains about platform mismatch, delete the old one:
```bash
firebase functions:delete app --region us-central1
```
Then deploy again.

## Verify
Open `https://<project-id>.web.app/api/health` — should return JSON with `gen: "v2"`.