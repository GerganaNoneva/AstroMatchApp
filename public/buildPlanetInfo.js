// Build planetInfo from planets + houses and print it to the console
// Drop-in helper for your horary page. It will use planetsNow & housesNow if present.
(function(){
  'use strict';

  // ===================== Dictionaries =====================
  var PLANET_BG = {
    Sun: 'Слънце', Moon: 'Луна', Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс',
    Jupiter: 'Юпитер', Saturn: 'Сатурн', Uranus: 'Уран', Neptune: 'Нептун', Pluto: 'Плутон',
    TrueNode: 'Лунен възел', MeanNode: 'Лунен възел', Node: 'Лунен възел', Chiron: 'Хирон'
  };

  var SIGNS_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  var SIGNS_BG = {
    Aries:'Овен', Taurus:'Телец', Gemini:'Близнаци', Cancer:'Рак', Leo:'Лъв', Virgo:'Дева',
    Libra:'Везни', Scorpio:'Скорпион', Sagittarius:'Стрелец', Capricorn:'Козирог', Aquarius:'Водолей', Pisces:'Риби'
  };

  var ASPECTS = [
    { name:'conjunction', angle:0,   bg:'Съвпад' },
    { name:'sextile',     angle:60,  bg:'Секстил' },
    { name:'square',      angle:90,  bg:'Квадратура' },
    { name:'trine',       angle:120, bg:'Тригон' },
    { name:'opposition',  angle:180, bg:'Опозиция' }
  ];
  var ORB = { conjunction:8, sextile:4, square:6, trine:6, opposition:7 };

  // ===================== Helpers =====================
  function to360(x){ x = Number(x); return ((x % 360) + 360) % 360; }
  function round3(x){ return Number(x).toFixed(3); }
  function round3n(x){ return Number(Number(x).toFixed(3)); }
  function isNum(v){ return v !== undefined && v !== null && isFinite(Number(v)); }
  function pickFirstNum(arr){ for (var i=0;i<arr.length;i++){ if (isNum(arr[i])) return to360(Number(arr[i])); } return NaN; }
  function get(obj, a, b, c){ // up to 3-level getter without optional chaining
    if (!obj || typeof obj !== 'object') return undefined;
    var cur = obj;
    if (a in cur){ cur = cur[a]; } else { return undefined; }
    if (b === undefined) return cur;
    if (!cur || typeof cur !== 'object') return undefined;
    if (b in cur){ cur = cur[b]; } else { return undefined; }
    if (c === undefined) return cur;
    if (!cur || typeof cur !== 'object') return undefined;
    if (c in cur){ cur = cur[c]; } else { return undefined; }
    return cur;
  }

  function signFromDeg(deg){
    var i = Math.floor(to360(deg) / 30);
    var en = SIGNS_EN[i];
    return { en: en, bg: SIGNS_BG[en] };
  }

  function normDeg(deg){ return to360(deg) % 30; }

  function separation(a, b){
    var da = to360(a), db = to360(b);
    var d = Math.abs(da - db);
    return d > 180 ? 360 - d : d; // 0..180
  }

  function detectAspects(lonA, lonB){
    var sep = separation(lonA, lonB);
    var hits = [];
    for (var i=0;i<ASPECTS.length;i++){
      var asp = ASPECTS[i];
      var diff = Math.abs(sep - asp.angle);
      var orb = ORB[asp.name] || 0;
      if (diff <= orb) hits.push({ asp: asp, sep: sep, diff: diff });
    }
    hits.sort(function(x,y){ return x.diff - y.diff; });
    return hits;
  }

  function canonicalPlanetName(raw){
    if (!raw) return '';
    var m = String(raw).trim();
    if (/^sun$/i.test(m)) return 'Sun';
    if (/^moon$/i.test(m)) return 'Moon';
    if (/^mercury$/i.test(m)) return 'Mercury';
    if (/^venus$/i.test(m)) return 'Venus';
    if (/^mars$/i.test(m)) return 'Mars';
    if (/^jupiter$/i.test(m)) return 'Jupiter';
    if (/^saturn$/i.test(m)) return 'Saturn';
    if (/^uranus$/i.test(m)) return 'Uranus';
    if (/^neptune$/i.test(m)) return 'Neptune';
    if (/^pluto$/i.test(m)) return 'Pluto';
    if (/^(truenode|nnode|north\s*node)$/i.test(m)) return 'TrueNode';
    if (/^(meannode)$/i.test(m)) return 'MeanNode';
    if (/^node$/i.test(m)) return 'Node';
    if (/^chiron$/i.test(m)) return 'Chiron';
    return m.charAt(0).toUpperCase() + m.slice(1);
  }

  function getLon(p){
    // Allow plain numbers (e.g., arrays like [200, 123, ...])
    if (isNum(p)) return to360(Number(p));

    // flat candidates
    var lon = pickFirstNum([
      p && p.value, // <-- support primitives wrapped into { value }
      p && p.lon, p && p.lng, p && p.longitude, p && p.ecliptic_longitude, p && p.long,
      p && p.fullDegree, p && p.degree, p && p.deg,
      p && p.full_degree, p && p.apparent_longitude, p && p.ecl_lon, p && p.lon_deg
    ]);
    if (isFinite(lon)) return lon;

    // nested candidates
    lon = pickFirstNum([
      get(p,'position','lon'), get(p,'position','longitude'), get(p,'position','ecliptic_longitude'), get(p,'position','full_degree'),
      get(p,'coords','lon'), get(p,'coords','longitude'), get(p,'coords','ecliptic_longitude'),
      get(p,'ecliptic','longitude'), get(p,'geo','lon'), get(p,'equatorial','longitude'),
      get(p,'apparent','longitude'), get(p,'apparent','apparent_longitude')
    ]);
    if (isFinite(lon)) return lon;
    return NaN;
  }

  function getSpeed(p){
    var v = p ? (p.speed || p.longitude_speed || p.motion || p.daily_motion) : undefined;
    return isNum(v) ? Number(v) : NaN;
  }

  function getRetro(p){
    if (p && typeof p.isRetro === 'boolean') return p.isRetro;
    if (p && typeof p.retrograde === 'boolean') return p.retrograde;
    if (p && typeof p.is_retrograde === 'boolean') return p.is_retrograde;
    var speed = getSpeed(p);
    if (isFinite(speed)) return speed < 0;
    var flag = p && (p.motion || p.retro || '');
    flag = String(flag).toLowerCase();
    if (flag === 'r' || flag === 'retro' || flag === 'true') return true;
    return false;
  }

  // ===================== Normalizers =====================
  function normalizePlanets(input){
    // Accept only real planet names; avoid swallowing random envelope keys like "StatusCode"
    var ALLOWED = new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','TrueNode','MeanNode','Node','Chiron']);
    var arr = [];

    if (input && Array.isArray(input.planets)) arr = input.planets;
    else if (input && Array.isArray(input.bodies)) arr = input.bodies;
    else if (input && Array.isArray(input.positions)) arr = input.positions;
    else if (Array.isArray(input)) arr = input;
    else if (input && typeof input === 'object'){
      var holders = ['data','result','response','payload','output'];
      var hit = null;
      for (var i=0;i<holders.length;i++){
        var h = holders[i];
        var maybe = input[h];
        if (maybe && Array.isArray(maybe.planets)) { hit = maybe.planets; break; }
        if (maybe && Array.isArray(maybe.bodies)) { hit = maybe.bodies; break; }
        if (maybe && Array.isArray(maybe.positions)) { hit = maybe.positions; break; }
      }
      if (hit) arr = hit; else {
        var keys = Object.keys(input);
        if (keys.length && !('planets' in input)){
          arr = keys.map(function(k){
          var v = input[k];
          var o = (v && typeof v === 'object') ? v : { value: v };
          if (!('name' in o)) o.name = k;
          return o;
        });
        }
      }
    }

    var map = {};
    for (var j=0;j<arr.length;j++){
      var it = arr[j] || {};
      var name = canonicalPlanetName(it.name || it.planet || it.id || it.key || it.body);
      if (!name) continue;
      // Only keep known planets/nodes/chiron
      if (!ALLOWED.has(name)) {
        // If this entry looks like an envelope field with a numeric value, skip it loudly
        var maybeVal = (it && typeof it === 'object' && 'value' in it) ? it.value : it;
        if (!isNaN(Number(maybeVal))) {
          console.warn('[buildPlanetInfo] Пропускам не-планетарен ключ →', name, ' със стойност:', maybeVal);
        }
        continue;
      }
      var lon = getLon(it);
      if (!isFinite(lon)) continue;
      var retro = getRetro(it);
      map[name] = { name:name, lon:lon, retro:retro };
    }

    if (!Object.keys(map).length){
      console.warn('[buildPlanetInfo] Не успях да разчета планетите. Проверете формàта на отговора от /api/planets.', input);
    }
    return map;
  }

  function normalizeHouses(h){
    if (!h) return [];
    if (Array.isArray(h.cusps) && h.cusps.length >= 12) return h.cusps.slice(0,12).map(to360);

    var keys = [];
    for (var i=1;i<=12;i++){ keys.push('house'+i); }
    var allPresent = true;
    for (var k=0;k<keys.length;k++){ if (h[keys[k]] === undefined) { allPresent = false; break; } }
    if (allPresent){
      var outH = [];
      for (var k2=0;k2<12;k2++){ outH.push(to360(h[keys[k2]])); }
      return outH;
    }

    if (Array.isArray(h.houses) && h.houses.length >= 12) return h.houses.slice(0,12).map(to360);
    if (h.data && Array.isArray(h.data.cusps) && h.data.cusps.length >= 12) return h.data.cusps.slice(0,12).map(to360);

    if (h.cusps && typeof h.cusps === 'object' && !Array.isArray(h.cusps)){
      var out = [];
      for (var n=1;n<=12;n++){ out.push(to360(h.cusps[n])); }
      var ok = true; for (var m=0;m<out.length;m++){ if (!isFinite(out[m])) { ok=false; break; } }
      if (ok) return out;
    }
    return [];
  }

  function houseForDegree(cusps, deg){
    if (!cusps || !Array.isArray(cusps) || cusps.length < 12) return null;
    var d = to360(deg);
    for (var i=0;i<12;i++){
      var a = cusps[i];
      var b = cusps[(i+1)%12];
      if (a <= b){ if (d >= a && d < b) return i+1; }
      else { if (d >= a || d < b) return i+1; }
    }
    return 12;
  }

  // ===================== Builder =====================
  function buildPlanetInfo(planets, houses){
    var P = normalizePlanets(planets);
    var cusp = normalizeHouses(houses);

    var names = Object.keys(P);
    var info = {};

    for (var idx=0; idx<names.length; idx++){
      var A = names[idx];
      var pA = P[A];
      var signObj = signFromDeg(pA.lon);
      var aspects = [];

      for (var j=0; j<names.length; j++){
        var B = names[j];
        if (A === B) continue;
        var pB = P[B];
        var hits = detectAspects(pA.lon, pB.lon);
        if (!hits.length) continue;
        var best = hits[0];
        aspects.push({
          aspect: best.asp.name,
          aspectBg: best.asp.bg,
          planet: pB.name,
          planetBg: PLANET_BG[pB.name] || pB.name,
          deg: round3n(best.sep) // numeric degrees between planets
        });
      }

      info[A] = {
        planetBg: PLANET_BG[A] || A,
        sign: signObj.en,
        signBg: signObj.bg,
        fullDegree: round3(pA.lon),
        normDegree: round3(normDeg(pA.lon)),
        isRetro: (!!pA.retro) ? 'True' : 'False',
        house: cusp.length ? String(houseForDegree(cusp, pA.lon)) : '',
        aspects: aspects
      };
    }

    if (!Object.keys(info).length){
      console.warn('[planetInfo] Празен резултат. Вероятни причини: (1) /api/planets връща неочакван формат; (2) липсват числови дължини; (3) ключове с други имена. Вижте предишните логове.', { planets: planets, houses: houses });
    }

    return info;
  }

  // ===================== Export & Auto-run =====================
  window.buildPlanetInfo = buildPlanetInfo;
  if (typeof window !== 'undefined' && window.planetsNow && window.housesNow){
    try {
      var planetInfo = buildPlanetInfo(window.planetsNow, window.housesNow);
      window.planetInfo = planetInfo;
      console.log('%c[planetInfo]', 'color:#9b8cff;font-weight:bold', planetInfo);
    } catch (e){
      console.error('buildPlanetInfo error:', e);
    }
  }
})();