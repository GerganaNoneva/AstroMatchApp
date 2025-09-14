from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json, re, os
from dotenv import load_dotenv
load_dotenv()


import os
openai_key = os.getenv("OPENAI_API_KEY")
app = FastAPI(title="AstroChat BG")

# Enable CORS (adjust origins in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load knowledge base
KB_PATH = os.path.join(os.path.dirname(__file__), "astro_kb.bg.json")
if not os.path.exists(KB_PATH):
    raise RuntimeError(
        "Missing astro_kb.bg.json next to app.py. "
        "Create it using the example from the setup guide."
    )

with open(KB_PATH, "r", encoding="utf-8") as f:
    KB = json.load(f)

PLANETS = KB["planets"]
SIGNS = KB["signs"]
HOUSES = KB["houses"]
ASPECTS = KB["aspects"]
ALIASES = KB["aliases"]

class ChatIn(BaseModel):
    message: str

class ChatOut(BaseModel):
    reply: str
    intent: str
    parsed: dict

# ---- Helpers ----

def norm(token: str) -> str:
    t = token.strip().lower()
    # Aliases EN->BG
    if t in ALIASES["planets"]:
        return ALIASES["planets"][t]
    if t in ALIASES["signs"]:
        return ALIASES["signs"][t]
    if t in ALIASES["aspects"]:
        return ALIASES["aspects"][t]
    return t

# Regexes
RE_ASPECT = re.compile(
    r"\b(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\b\s+"
    r"(съединение|съвпад|секстил|квадрат|квадратура|тригон|опозиция|conjunction|conj|sextile|square|sq|trine|opp|opposition)\s+"
    r"(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_P_IN_S = re.compile(
    r"\b(слънце|луна|меркурий|венера|марс|юпитер|сатурн|уран|нептун|плутон)\b\s+в\s+"
    r"(овен|телец|близнаци|рак|лъв|дева|везни|скорпион|стрелец|козирог|водолей|риби|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)",
    re.IGNORECASE | re.UNICODE,
)

RE_HOUSE = re.compile(r"(дом|house)\s*(\d{1,2})", re.IGNORECASE)

# ---- Generators ----

def planet_def(p):
    return f"**{p.capitalize()}** — {PLANETS[p]}"

def sign_def(s):
    return f"**{s.capitalize()}** — {SIGNS[s]}"

def house_def(h):
    if h not in HOUSES:
        return "Домовете са 1–12. Пример: '5 дом'."
    return f"**Дом {h}** — {HOUSES[h]}"

def aspect_def(a):
    a_key = norm(a)
    a_data = ASPECTS.get(a_key)
    if not a_data:
        return "Неподдържан аспект. Пример: съединение, секстил, квадрат, тригон, опозиция."
    return f"**{a_key.capitalize()} ({a_data['angle']}°)** — {a_data['meaning']} (орб ~{a_data['orb']}°)."

def combine_planet_in_sign(planet, sign):
    return (
        f"**{planet.capitalize()} в {sign.capitalize()}** — "
        f"{PLANETS[planet]} В {sign.capitalize()} проявата е оцветена от качествата на знака: {SIGNS[sign]}"
    )

def combine_planet_in_house(planet, house):
    return (
        f"**{planet.capitalize()} в {house} дом** — "
        f"{PLANETS[planet]} Фокусът се насочва към темите на дома: {HOUSES[house]}"
    )

def combine_planet_in_sign_house(planet, sign, house):
    return (
        f"**{planet.capitalize()} в {sign.capitalize()} в {house} дом**\n"
        f"• Планета: {PLANETS[planet]}\n"
        f"• Знак: {SIGNS[sign]}\n"
        f"• Дом {house}: {HOUSES[house]}\n"
        f"→ Резюме: Темите на {planet} действат в стил {sign} и се проявяват най-силно през сферите на {house} дом."
    )

def combine_aspect(p1, aspect, p2):
    a = ASPECTS[norm(aspect)]
    return (
        f"**{p1.capitalize()} {norm(aspect)} {p2.capitalize()}** ({a['angle']}°, орб ~{a['orb']}°)\n"
        f"• {p1.capitalize()}: {PLANETS[p1]}\n"
        f"• {p2.capitalize()}: {PLANETS[p2]}\n"
        f"• Аспект: {a['meaning']}\n"
        f"→ Резюме: напрежение/синергия между темите на {p1} и {p2} според естеството на аспекта."
    )

# ---- Parser ----

def parse_intent(text: str):
    t = text.strip()
    low = t.lower()

    m = RE_ASPECT.search(t)
    if m:
        p1, a, p2 = m.group(1), m.group(2), m.group(3)
        p1, a, p2 = norm(p1), norm(a), norm(p2)
        return {"intent": "aspect_pair", "planet1": p1, "aspect": a, "planet2": p2}

    m2 = RE_P_IN_S.search(t)
    if m2:
        p, s = norm(m2.group(1)), norm(m2.group(2))
        h_match = RE_HOUSE.search(t)
        if h_match:
            h = h_match.group(2)
            return {"intent": "planet_sign_house", "planet": p, "sign": s, "house": h}
        return {"intent": "planet_sign", "planet": p, "sign": s}

    h_match2 = RE_HOUSE.search(t)
    if h_match2 and not any(w in low for w in ["в "]):
        return {"intent": "house_def", "house": h_match2.group(2)}

    words = [norm(w) for w in re.findall(r"[\\wА-Яа-я]+", low)]

    for w in words:
        if w in PLANETS:
            return {"intent": "planet_def", "planet": w}
    for w in words:
        if w in SIGNS:
            return {"intent": "sign_def", "sign": w}
    for w in words:
        if w in ASPECTS:
            return {"intent": "aspect_def", "aspect": w}

    return {"intent": "fallback"}

# ---- Router ----

def answer(parsed):
    intent = parsed["intent"]
    if intent == "planet_def":
        return planet_def(parsed["planet"])
    if intent == "sign_def":
        return sign_def(parsed["sign"])
    if intent == "house_def":
        return house_def(parsed["house"])
    if intent == "aspect_def":
        return aspect_def(parsed["aspect"])
    if intent == "planet_sign":
        return combine_planet_in_sign(parsed["planet"], parsed["sign"])
    if intent == "planet_sign_house":
        return combine_planet_in_sign_house(parsed["planet"], parsed["sign"], parsed["house"])
    if intent == "aspect_pair":
        return combine_aspect(parsed["planet1"], parsed["aspect"], parsed["planet2"])
    return (
        "Мога да обясня планети, знаци, домове и аспекти, както и комбинации като \n"
        "• 'Луна в Рак в 5 дом'\n• 'Меркурий квадрат Венера'\nОпитай с тази форма."
    )

# ---- API ----

@app.post("/chat", response_model=ChatOut)
async def chat(inp: ChatIn):
    if not inp.message or not inp.message.strip():
        raise HTTPException(status_code=400, detail="Празно съобщение")
    parsed = parse_intent(inp.message)
    return ChatOut(reply=answer(parsed), intent=parsed["intent"], parsed=parsed)

# Run with: uvicorn app:app --reload --port 8000
