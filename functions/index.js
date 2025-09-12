const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");

admin.initializeApp();
const db = admin.firestore();
const app = express();
app.use(express.json());

// помощник: рекурсивно триене на колекция
async function deleteCollectionRecursively(colRef, batchSize = 300) {
  const snap = await colRef.get();
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % batchSize === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count > 0) await batch.commit();
}

async function deleteUserData(uid) {
  const userRef = db.collection('users').doc(uid);

  // изтрий всички подколекции под users/{uid}
  const subcols = await userRef.listCollections();
  for (const col of subcols) {
    await deleteCollectionRecursively(col);
  }

  // изтрий самия документ users/{uid}
  await userRef.delete().catch(() => {});

  // ако имате отделни колекции “profiles/{uid}”, “profiles/{uid}/…”
  const profilesDoc = db.collection('profiles').doc(uid);
  const profilesSubcols = await profilesDoc.listCollections().catch(() => []);
  for (const col of profilesSubcols) {
    await deleteCollectionRecursively(col);
  }
  await profilesDoc.delete().catch(() => {});

  // ако пазите файлове в Cloud Storage под users/{uid}/...
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/` });
    await bucket.deleteFiles({ prefix: `profiles/${uid}/` });
  } catch (_) {}
}

// Приемай и двата пътя: /delete-account и /api/delete-account
app.post(["/delete-account","/api/delete-account"], async (req, res) => {
  try {
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await admin.auth().verifyIdToken(token).catch(() => null);
    if (!decoded) return res.status(401).json({ error: "Invalid token" });

    const { uid, deleteAuthUser } = req.body || {};
    if (!uid || uid !== decoded.uid) return res.status(403).json({ error: "UID mismatch" });

    // 1) Изтрий Firestore/Storage данните на потребителя
    await deleteUserData(uid);

    // 2) По желание — изтрий самия Auth акаунт
    if (deleteAuthUser) {
      await admin.auth().deleteUser(uid).catch((e) => {
        // ако е вече изтрит — игнорирай
        if (String(e?.errorInfo?.code || "").includes("auth/user-not-found")) return;
        throw e;
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Експорт като една HTTPS функция "api" с CORS
exports.api = onRequest({ cors: true }, app);
