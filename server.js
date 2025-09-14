// server.js


import 'dotenv/config';
import express    from 'express';
import path       from 'path';
import cors       from 'cors';
import bodyParser from 'body-parser';
import admin      from 'firebase-admin';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import http from 'http';
import astroChat from './astro-chat-router.mjs';



// Еднакъв __dirname в ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Инициализация Firebase Admin (ползва GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const firestore = admin.firestore();

// --- helpers: recursive collection delete + full user data cleanup ---
async function deleteCollectionRecursively(colRef, batchSize = 300) {
  const snap = await colRef.get();
  let batch = firestore.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % batchSize === 0) { await batch.commit(); batch = firestore.batch(); }
  }
  if (count > 0) await batch.commit();
}

async function deleteUserData(uid) {
  const userRef = firestore.collection('users').doc(uid);

  // delete all subcollections under users/{uid}
  const subcols = await userRef.listCollections();
  for (const col of subcols) {
    await deleteCollectionRecursively(col);
  }

  // delete users/{uid}
  await userRef.delete().catch(() => {});

  // Optional: if you also store profiles/{uid} and subcollections
  const profilesDoc = firestore.collection('profiles').doc(uid);
  const profilesSubcols = await profilesDoc.listCollections().catch(() => []);
  for (const col of profilesSubcols) {
    await deleteCollectionRecursively(col);
  }
  await profilesDoc.delete().catch(() => {});

  // Optional: clean Cloud Storage prefixes
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/` });
    await bucket.deleteFiles({ prefix: `profiles/${uid}/` });
  } catch (_) {}
}

const app = express();
app.use('/chat', astroChat); // POST /chat { message: "Луна в Рак в 5 дом" }
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Статични файлове
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// GET /api/users/:id – чете документа от Firestore
app.get('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const docRef = firestore.collection('users').doc(userId);
    const snap   = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(snap.data());
  } catch (err) {
    console.error('Firestore error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/delete-account — verify ID token, purge data, (optionally) delete Auth user
app.post('/api/delete-account', async (req, res) => {
  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = await admin.auth().verifyIdToken(token).catch(() => null);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    const { uid, deleteAuthUser } = req.body || {};
    if (!uid || uid !== decoded.uid) return res.status(403).json({ error: 'UID mismatch' });

    await deleteUserData(uid);

    if (deleteAuthUser) {
      await admin.auth().deleteUser(uid).catch((e) => {
        if (String(e?.errorInfo?.code || '').includes('auth/user-not-found')) return;
        throw e;
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// → Останалите ти проксита към FreeAstrologyAPI и OpenAI остават без промяна ←
const fetchFn = global.fetch || ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args))
);
const API_KEY    = process.env.FREE_ASTROLOGY_KEY;
const ASTRO_BASE = 'https://json.freeastrologyapi.com/western';
const GEO_URL    = 'https://json.freeastrologyapi.com/geo-details';

async function proxy(req, res, url, expectsImage = false) {
  try {
    const apiRes = await fetchFn(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body   : JSON.stringify(req.body)
    });
    if (!apiRes.ok) {
      const txt = await apiRes.text();
      return res.status(apiRes.status).send(txt);
    }
    if (expectsImage) {
      const buffer = await apiRes.arrayBuffer();
      res.set('Content-Type', apiRes.headers.get('content-type'));
      return res.send(Buffer.from(buffer));
    }
    const json = await apiRes.json();
    return res.json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.toString());
  }
}

['planets','houses','aspects','natal','natal-wheel-chart','chart-data']
  .forEach(ep => {
    const expectsImage = ep.includes('chart') && ep !== 'natal-wheel-chart';
    app.post(`/api/${ep}`, (req, res) =>
      proxy(req, res, `${ASTRO_BASE}/${ep}`, expectsImage)
    );
  });

// geo-details: приемай { location } или { city } или { q } и транслирай към FreeAstrologyAPI
app.post('/api/geo-details', (req, res) => {
  const body = req.body || {};
  const location = (body.location || body.city || body.q || '').toString().trim();
  if (!location) {
    return res.status(400).json({ error: 'city/location is required' });
  }
  const payload = { location, city: location };
  fetchFn(GEO_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body   : JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(json => res.json(json))
  .catch(err => {
    console.error(err);
    res.status(500).send(err.toString());
  });
});

if (!process.env.OPENAI_API_KEY) {
console.warn('\n⚠️ Липсва OPENAI_API_KEY в .env. Добавете го преди да стартирате.');
}


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


app.post('/api/ask', async (req, res) => {
try {
const question = (req.body?.question || '').toString().trim();
if (!question) {
return res.status(400).json({ error: 'Моля, въведете въпрос.' });
}


const response = await client.responses.create({
model: 'gpt-5', // виж бележките в README секцията по-долу
instructions: `Ти си професионален астролог (30+ г. опит). Пиши на български ясно, подредено и без фатализъм. Винаги давай практични съвети. Избягвай медицински/правни твърдения.

ФОРМАТ (за всички отговори)
1) Кратко резюме (2–3 изр.). 
2) Основни изводи (3–6 точки).
3) Препоръки/следващи стъпки (конкретни).
4) Финален извод (1 изр.).

ХОРАРЕН ВЪПРОС (без астрологичен жаргон!)
- Карта за момента/мястото на астролога.
- Бърза проверка на валидност: ранен/късен ASC, Сатурн в VII, Луна „без курс“ (само като сигнал, не блокер).
- Сигнификатори: питащият = I дом + Луна; темата = съответният дом.
- Сходящи аспекти = развитие/резултат; разходящи = минало.
- Отговори като за лаик: „Да/Не/Условия/Кога/Какво да направи“. Кратки срокове, ясни причини.

НАТАЛНА КАРТА
- Общ тон: фигура на картата, елементи (огън/земя/въздух/вода), кръст (кардинален/фиксиран/мутабелен).
- Доминанти: Слънце, Луна, Асц., управител на Асц., ъглови планети.
- Ключови домове по темата, най-важни аспекти (особено към светила и ъгли).
- Синтез: силни страни, рискове, конкретни насоки.

СИНАСТРИЯ
- Първо поотделно: водещи теми на двамата.
- После връзката: аспекти между светила, Венера/Марс, контакти към ъглите (I/IV/VII/X), домове на отношенията (1/5/7/11), Сатурн (стабилност/уроци).
- Обобщение: съвместимост, тригери, как да работят като екип.

ПРОГНОСТИКА
- Използвай поне 3 метода: транзити + вторични прогресии + символични дирекции (по желание солар).
- Важни сигнали: аспекти към светила/ъгли/доминанти; ингресии; ретро/стaционарни фази.
- Транзитен цикъл: съвпад = старт; секстил = корекция; квадрат = реализация/криза; тригон = награда; опозиция = кулминация/прелом.
- Дай периоди/месеци, не абсолютни гаранции. Подчертай свободната воля.

СТИЛ
- Стегнато, конкретно, без излишни термини (особено при хорар).
- Ако липсват данни, кажи какво точно е нужно (дата/час/място, контекст на въпроса).
- Дръж отговора в 8–14 изречения за кратки теми и 15–30 за комплексни.
`,
input: question
// По желание: reasoning_effort: 'minimal', verbosity: 'medium'
});


const answer = response.output_text ?? 'Няма отговор.';
res.json({ answer });
} catch (err) {
console.error('OpenAI error:', err);
// Опит за по-четима грешка
const msg = err?.response?.data?.error?.message || err?.message || 'Неуспешна заявка към модела.';
res.status(500).json({ error: msg });
}
});

const ports = [3000, 5000, 8080];

ports.forEach((p) => {
  const server = http.createServer(app);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${p} е зает. Спри процеса на този порт или избери друг.`);
    } else {
      console.error(`❌ Грешка на порт ${p}:`, err);
    }
  });
  server.listen(p, () => {
    console.log(`🚀 Server listening on http://localhost:${p}`);
  });
});