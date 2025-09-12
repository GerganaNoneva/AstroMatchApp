import { Router } from 'express';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = Router();

// OpenAI client (used for GPT‑4 in chat); relies on process.env.OPENAI_API_KEY
const oaClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4.1-mini'; // use a GPT‑4 family model



// Load KB once on startup
const KB_PATH = path.join(__dirname, 'astro_kb.bg.json');
if (!fs.existsSync(KB_PATH)) {
  console.warn('⚠️  Missing astro_kb.bg.json next to astro-chat-router.mjs. Using minimal fallback.');
}

const KB = fs.existsSync(KB_PATH)
  ? JSON.parse(fs.readFileSync(KB_PATH, 'utf-8'))
  : {
      planets: { "луна":"Емоции и базови нужди.", "меркурий":"Мислене и общуване." },
      signs: { "рак":"Грижа и емоционалност.", "овен":"Инициатива и смелост." },
      houses: { "5":"Творчество, радост, деца." },
      aspects: { "квадрат": { angle: 90, orb: 6, meaning: "Напрежение и предизвикателство." } },
      aliases: { planets:{}, signs:{}, aspects:{} }
    };

const { planets: PLANETS, signs: SIGNS, houses: HOUSES, aspects: ASPECTS, aliases: ALIASES } = KB;

function norm(t){
  const s = (t||'').toString().trim().toLowerCase();
  if (ALIASES?.planets?.[s]) return ALIASES.planets[s];
  if (ALIASES?.signs?.[s])   return ALIASES.signs[s];
  if (ALIASES?.aspects?.[s]) return ALIASES.aspects[s];
  return s;
}

const RE_ASPECT = new RegExp(
  String.raw`\\b(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\\b\\s+` +
  String.raw`(съединение|съвпад|секстил|квадрат|квадратура|тригон|опозиция|conjunction|conj|sextile|square|sq|trine|opp|opposition)\\s+` +
  String.raw`(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\\b`, 'iu'
);

const RE_P_IN_S = new RegExp(
  String.raw`\\b(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\\b\\s+в\\s+` +
  String.raw`(овен|телец|близнаци|рак|лъв|дева|везни|скорпион|стрелец|козирог|водолей|риби|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)`, 'iu'
);

const RE_HOUSE = new RegExp(String.raw`(дом|house)\\s*(\\d{1,2})`, 'iu');

const planetDef  = (p)=> `**${cap(p)}** — ${PLANETS[p]}`;
const signDef    = (s)=> `**${cap(s)}** — ${SIGNS[s]}`;
const houseDef   = (h)=> HOUSES[h] ? `**Дом ${h}** — ${HOUSES[h]}` : `Домовете са 1–12. Пример: '5 дом'.`;
const aspectDef  = (a)=> {
  const A = ASPECTS[norm(a)];
  return A ? `**${cap(norm(a))} (${A.angle}°)** — ${A.meaning} (орб ~${A.orb}°).` : `Неподдържан аспект.`;
};

const cap = (s)=> s.charAt(0).toUpperCase()+s.slice(1);

const combinePlanetInSign = (p,s)=>
  `**${cap(p)} в ${cap(s)}** — ${PLANETS[p]} В ${cap(s)} проявата е оцветена от качествата на знака: ${SIGNS[s]}`;

const combinePlanetInSignHouse = (p,s,h)=>
  `**${cap(p)} в ${cap(s)} в ${h} дом**\\n• Планета: ${PLANETS[p]}\\n• Знак: ${SIGNS[s]}\\n• Дом ${h}: ${HOUSES[h]}\\n→ Резюме: Темите на ${p} действат в стил ${s} и се проявяват най-силно през сферите на ${h} дом.`;

function parseIntent(text){
  const low = (text||'').toString();
  const a = RE_ASPECT.exec(low);
  if (a){ return { intent: 'aspect_pair', planet1: norm(a[1]), aspect: norm(a[2]), planet2: norm(a[3]) }; }
  const ps = RE_P_IN_S.exec(low);
  if (ps){
    const p = norm(ps[1]); const s = norm(ps[2]);
    const hm = RE_HOUSE.exec(low);
    if (hm) return { intent: 'planet_sign_house', planet: p, sign: s, house: hm[2] };
    return { intent: 'planet_sign', planet: p, sign: s };
  }
  const h = RE_HOUSE.exec(low);
  if (h && !/\\bв\\b/i.test(low)) return { intent: 'house_def', house: h[2] };

  const words = (low.match(/[\\wА-Яа-я]+/g) || []).map(norm);
  for (const w of words){ if (PLANETS[w]) return { intent:'planet_def', planet:w }; }
  for (const w of words){ if (SIGNS[w])   return { intent:'sign_def',   sign:w   }; }
  for (const w of words){ if (ASPECTS[w]) return { intent:'aspect_def', aspect:w }; }
  return { intent: 'fallback' };
}

function answer(parsed){
  switch(parsed.intent){
    case 'planet_def': return planetDef(parsed.planet);
    case 'sign_def':   return signDef(parsed.sign);
    case 'house_def':  return houseDef(parsed.house);
    case 'aspect_def': return aspectDef(parsed.aspect);
    case 'planet_sign': return combinePlanetInSign(parsed.planet, parsed.sign);
    case 'planet_sign_house': return combinePlanetInSignHouse(parsed.planet, parsed.sign, parsed.house);
    case 'aspect_pair': {
      const A = ASPECTS[parsed.aspect];
      return `**${cap(parsed.planet1)} ${parsed.aspect} ${cap(parsed.planet2)}** (${A.angle}°, орб ~${A.orb}°)\\n• ${cap(parsed.planet1)}: ${PLANETS[parsed.planet1]}\\n• ${cap(parsed.planet2)}: ${PLANETS[parsed.planet2]}\\n• Аспект: ${A.meaning}\\n→ Резюме: напрежение/синергия между темите на ${parsed.planet1} и ${parsed.planet2} според естеството на аспекта.`;
    }
    default:
      return "Мога да обясня планети, знаци, домове и аспекти, както и комбинации като\\n• 'Луна в Рак в 5 дом'\\n• 'Меркурий квадрат Венера'\\nОпитай с тази форма.";
  }
}

// POST /chat
router.post('/', async (req, res) => {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'Празно съобщение' });

  // If API key is available, send to GPT‑4 family first
  if (process.env.OPENAI_API_KEY) {
    try {
      const instructions = `Ти си астрологичен асистент. Отговаряй кратко и ясно на български.
Обяснявай планети, знаци, домове, аспекти и комбинации (напр. "Луна в Рак в 5 дом", "Меркурий квадрат Венера").
Ако въпросът е неясен, помагай с примери с български термини.`;

      const resp = await oaClient.responses.create({
        model: CHAT_MODEL,          // GPT‑4 family (по подразбиране gpt‑4.1‑mini)
        instructions,
        input: message
      });

      const reply = resp.output_text || '—';
      return res.json({ reply, intent: 'llm', parsed: {} });
    } catch (e) {
      console.error('OpenAI chat error:', e?.response?.data || e);
      // fall through to KB-based reply below
    }
  }

  // Fallback: local KB parser/answers
  const parsed = parseIntent(message);
  return res.json({ reply: answer(parsed), intent: parsed.intent, parsed });
});

export default router;

