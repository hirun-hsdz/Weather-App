"use strict";
/* ---------- helpers & storage ---------- */
const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => {
    try {
      const v = localStorage.getItem("atm:" + k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem("atm:" + k, JSON.stringify(v));
    } catch {}
  },
};
const DEFAULT = {
  name: "Panadura",
  region: "Western Province",
  country: "Sri Lanka",
  lat: 6.7133,
  lon: 79.9026,
};
const same = (a, b) =>
  Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
const label = (l) => [l.name, l.region, l.country].filter(Boolean).join(", ");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/* ---------- units ---------- */
const temp = (c, u) =>
  c == null ? "—" : Math.round(u === "F" ? (c * 9) / 5 + 32 : c) + "°";
const wind = (k, u) =>
  k == null
    ? "—"
    : u === "mph"
      ? Math.round(k * 0.621371) + " mph"
      : u === "ms"
        ? (k / 3.6).toFixed(1) + " m/s"
        : Math.round(k) + " km/h";
const compass = (d) =>
  d == null
    ? ""
    : [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ][Math.round(d / 22.5) % 16];
const uvRisk = (u) =>
  u == null
    ? "Unavailable"
    : u < 3
      ? "Low"
      : u < 6
        ? "Moderate"
        : u < 8
          ? "High"
          : u < 11
            ? "Very high"
            : "Extreme";
const aqiLabel = (a) =>
  a == null
    ? "Unavailable"
    : a <= 50
      ? "Good"
      : a <= 100
        ? "Moderate"
        : a <= 150
          ? "Unhealthy for sensitive groups"
          : a <= 200
            ? "Unhealthy"
            : "Very unhealthy";
const num = (v, u = "", f = 0) =>
  v == null ? "Unavailable" : Number(v).toFixed(f) + u;

/* ---------- weather codes (WMO, as returned by Open-Meteo) ---------- */
const CODES = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Heavy freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Heavy freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "❄️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "❄️"],
  80: ["Light showers", "🌦️"],
  81: ["Showers", "🌧️"],
  82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Heavy snow showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm, hail", "⛈️"],
  99: ["Severe thunderstorm, hail", "⛈️"],
};
const wx = (code, day = 1) => {
  const [l, i] = CODES[code] || ["Unknown", "☁️"];
  return {
    label: l,
    icon: !day && code <= 1 ? "🌙" : !day && code === 2 ? "☁️" : i,
  };
};
function sky(code, day, dark) {
  const wet = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code);
  if (dark)
    return !day
      ? "linear-gradient(160deg,#050b1a,#0b1a38 60%,#14264d)"
      : wet
        ? "linear-gradient(160deg,#0d1a2c,#1d3350)"
        : "linear-gradient(160deg,#0a1f45,#1c4a8a)";
  return !day
    ? "linear-gradient(160deg,#9fb2d8,#6c84b8)"
    : wet
      ? "linear-gradient(160deg,#b9c6d6,#8ea3bb)"
      : "linear-gradient(160deg,#cfe6ff,#8cc2ff)";
}

/* ---------- API service ---------- */
class ApiError extends Error {}
async function getJson(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Network error. Check your connection and retry.");
  }
  if (res.status === 429)
    throw new ApiError("Rate limit reached. Wait a minute, then refresh.");
  if (!res.ok)
    throw new ApiError(
      "Weather service returned an error (" + res.status + ").",
    );
  return res.json();
}
const cache = new Map();
async function cached(url, signal, force) {
  const h = cache.get(url);
  if (!force && h && Date.now() - h.t < 180000) return h.v;
  const v = await getJson(url, signal);
  cache.set(url, { t: Date.now(), v });
  return v;
}
const API = {
  async search(q, signal) {
    const j = await getJson(
      "https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" +
        encodeURIComponent(q),
      signal,
    );
    return (j.results || []).map((r) => ({
      name: r.name,
      region: r.admin1,
      country: r.country,
      lat: r.latitude,
      lon: r.longitude,
    }));
  },
  async weather(l, signal, force) {
    const j = await cached(
      "https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=7&wind_speed_unit=kmh&latitude=" +
        l.lat +
        "&longitude=" +
        l.lon +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
        "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,visibility,dew_point_2m,uv_index,is_day" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
      signal,
      force,
    );
    if (
      !j ||
      !j.current ||
      !j.hourly ||
      !j.hourly.time ||
      !j.daily ||
      !j.daily.time
    )
      throw new ApiError("Unexpected response from the weather service.");
    return j;
  },
  async air(l, signal) {
    try {
      const j = await cached(
        "https://air-quality-api.open-meteo.com/v1/air-quality?timezone=auto&current=pm10,pm2_5,us_aqi&latitude=" +
          l.lat +
          "&longitude=" +
          l.lon,
        signal,
      );
      return j.current || null;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      return null;
    }
  },
  async radar() {
    try {
      const j = await getJson(
        "https://api.rainviewer.com/public/weather-maps.json",
      );
      const f = j.radar.past[j.radar.past.length - 1];
      return j.host + f.path + "/256/{z}/{x}/{y}/2/1_1.png";
    } catch {
      return null;
    }
  },
};

/* ---------- state ---------- */
const p = new URLSearchParams(location.search);
let loc =
  isFinite(parseFloat(p.get("lat"))) && isFinite(parseFloat(p.get("lon")))
    ? {
        name: p.get("name") || "Shared location",
        region: p.get("region") || undefined,
        country: p.get("country") || undefined,
        lat: +p.get("lat"),
        lon: +p.get("lon"),
      }
    : store.get("loc", DEFAULT);
let S = {
  tu: store.get("tu", "C"),
  wu: store.get("wu", "kmh"),
  dark: store.get("dark", true),
  favs: store.get("favs", []),
  recent: store.get("recent", []),
  w: null,
  air: null,
};
let ctl = null,
  map = null,
  marker = null,
  radarLayer = null,
  radarUrl = null;

/* ---------- render ---------- */
const hourIdx = (w) =>
  Math.max(
    0,
    w.hourly.time.findIndex(
      (t) => t.slice(0, 13) === w.current.time.slice(0, 13),
    ),
  );
function recs(w) {
  const i = hourIdx(w),
    c = w.current,
    out = [];
  const pops = w.hourly.precipitation_probability
    .slice(i, i + 12)
    .filter((v) => v != null);
  const pop = pops.length ? Math.max(...pops) : null;
  const uv = Math.max(
    0,
    ...w.hourly.uv_index.slice(i, i + 12).filter((v) => v != null),
  );
  if (pop != null && pop >= 50)
    out.push(
      "☂️ Carry an umbrella: rain chance reaches " +
        pop +
        "% in the next 12 hours.",
    );
  if (uv >= 6 && c.is_day)
    out.push("🧴 Use sun protection: UV index peaks at " + uv.toFixed(1) + ".");
  if (c.wind_gusts_10m >= 40)
    out.push(
      "💨 Secure loose items: gusts up to " +
        wind(c.wind_gusts_10m, S.wu) +
        ".",
    );
  if (c.apparent_temperature >= 33)
    out.push(
      "🥵 Stay hydrated: it feels like " +
        temp(c.apparent_temperature, S.tu) +
        ".",
    );
  if (c.apparent_temperature <= 5)
    out.push(
      "🧥 Dress warmly: it feels like " +
        temp(c.apparent_temperature, S.tu) +
        ".",
    );
  return out.length ? out : ["✅ No special precautions needed right now."];
}
function render() {
  const w = S.w;
  if (!w) return;
  const c = w.current,
    d = w.daily,
    h = w.hourly,
    i = hourIdx(w),
    x = wx(c.weather_code, c.is_day),
    tu = S.tu,
    wu = S.wu;
  $("bg").style.background = sky(c.weather_code, c.is_day, S.dark);
  $("city").textContent = loc.name;
  const local = new Intl.DateTimeFormat(undefined, {
    timeZone: w.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  $("sub").textContent =
    ([loc.region, loc.country].filter(Boolean).join(", ") ||
      loc.lat + ", " + loc.lon) +
    " · " +
    local +
    " local";

  $("current").innerHTML =
    '<div class="hero"><div><div class="temp">' +
    temp(c.temperature_2m, tu).replace("°", "") +
    "<sup>°" +
    tu +
    "</sup></div>" +
    '<div class="cond">' +
    x.icon +
    " " +
    esc(x.label) +
    "</div>" +
    '<p class="muted">Feels like ' +
    temp(c.apparent_temperature, tu) +
    " · High " +
    temp(d.temperature_2m_max[0], tu) +
    " · Low " +
    temp(d.temperature_2m_min[0], tu) +
    "</p>" +
    '<p class="muted">Wind ' +
    wind(c.wind_speed_10m, wu) +
    " " +
    compass(c.wind_direction_10m) +
    " · Rain today " +
    num(d.precipitation_sum[0], " mm", 1) +
    "</p></div>" +
    '<ul class="recs" aria-label="Recommendations">' +
    recs(w)
      .map((r) => "<li>" + r + "</li>")
      .join("") +
    "</ul></div>";

  $("hourly").innerHTML = Array.from({ length: 24 }, (_, k) => i + k)
    .filter((n) => n < h.time.length)
    .map(
      (n, k) =>
        '<li class="' +
        (k === 0 ? "now" : "") +
        '"><span>' +
        (k === 0 ? "Now" : h.time[n].slice(11, 16)) +
        '</span><span class="ic">' +
        wx(h.weather_code[n], h.is_day[n]).icon +
        "</span><b>" +
        temp(h.temperature_2m[n], tu) +
        "</b><span>" +
        (h.precipitation_probability[n] ?? "—") +
        "% rain</span><span>" +
        wind(h.wind_speed_10m[n], wu) +
        "</span></li>",
    )
    .join("");

  const T = (t, v, s, cls) =>
    '<div class="card tile ' +
    (cls || "") +
    '"><div class="t">' +
    t +
    '</div><div class="v">' +
    v +
    '</div><div class="s">' +
    (s || "&nbsp;") +
    "</div></div>";
  const aq = S.air,
    severe =
      [95, 96, 99].includes(c.weather_code) ||
      (d.precipitation_sum[0] || 0) >= 50 ||
      c.wind_gusts_10m >= 70;
  $("highlights").innerHTML =
    T("☀️ UV index", num(h.uv_index[i], "", 1), uvRisk(h.uv_index[i])) +
    T(
      "💨 Wind",
      wind(c.wind_speed_10m, wu),
      compass(c.wind_direction_10m) + " · gusts " + wind(c.wind_gusts_10m, wu),
    ) +
    T(
      "💧 Humidity",
      num(c.relative_humidity_2m, "%"),
      "Dew point " + temp(h.dew_point_2m[i], tu),
    ) +
    T(
      "🌧️ Rain",
      (h.precipitation_probability[i] ?? "—") + "%",
      c.precipitation +
        " mm now · " +
        num(d.precipitation_sum[0], " mm", 1) +
        " today",
    ) +
    T("🌅 Sunrise", d.sunrise[0].slice(11, 16)) +
    T("🌇 Sunset", d.sunset[0].slice(11, 16)) +
    T("🧭 Pressure", num(c.pressure_msl, " hPa")) +
    T(
      "👁️ Visibility",
      h.visibility[i] == null
        ? "Unavailable"
        : (h.visibility[i] / 1000).toFixed(1) + " km",
      "Cloud cover " + num(c.cloud_cover, "%"),
    ) +
    T(
      "🍃 Air quality",
      aq && aq.us_aqi != null ? "AQI " + aq.us_aqi : "Unavailable",
      aq
        ? aqiLabel(aq.us_aqi) +
            " · PM2.5 " +
            num(aq.pm2_5, " µg/m³", 1) +
            " · PM10 " +
            num(aq.pm10, " µg/m³", 1)
        : "No air-quality data for this location",
      "wide",
    ) +
    T(
      "⚠️ Weather alerts",
      severe ? "Severe conditions" : "No severe conditions",
      "Derived from forecast values, not an official warning. Open-Meteo provides no official alerts.",
      "wide",
    );

  const open = window._open ?? 0;
  $("daily").innerHTML = d.time
    .map((t, n) => {
      const dx = wx(d.weather_code[n]),
        dt = new Date(t + "T12:00"),
        o = n === open;
      const det = [
        ["Condition", dx.label],
        ["Max wind", wind(d.wind_speed_10m_max[n], wu)],
        ["Max gusts", wind(d.wind_gusts_10m_max[n], wu)],
        [
          "UV max",
          num(d.uv_index_max[n], "", 1) +
            " (" +
            uvRisk(d.uv_index_max[n]) +
            ")",
        ],
        ["Sunrise", d.sunrise[n].slice(11, 16)],
        ["Sunset", d.sunset[n].slice(11, 16)],
        ["Rain total", num(d.precipitation_sum[n], " mm", 1)],
        ["Rain chance", num(d.precipitation_probability_max[n], "%")],
      ];
      return (
        '<li><button data-i="' +
        n +
        '" aria-expanded="' +
        o +
        '"><span class="d"><b>' +
        (n ? dt.toLocaleDateString(undefined, { weekday: "short" }) : "Today") +
        '</b> <span class="muted small">' +
        dt.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
        '</span></span><span class="ic">' +
        dx.icon +
        '</span><span class="l">' +
        esc(dx.label) +
        '</span><span class="r">' +
        (d.precipitation_probability_max[n] ?? "—") +
        "% · " +
        num(d.precipitation_sum[n], " mm", 1) +
        '</span><span class="m"><b>' +
        temp(d.temperature_2m_max[n], tu) +
        '</b> <span class="muted">' +
        temp(d.temperature_2m_min[n], tu) +
        "</span></span><span>" +
        (o ? "▴" : "▾") +
        "</span></button>" +
        (o
          ? '<div class="detail">' +
            det
              .map(
                (a) =>
                  "<div><span>" +
                  a[0] +
                  "</span><b>" +
                  esc(a[1]) +
                  "</b></div>",
              )
              .join("") +
            "</div>"
          : "") +
        "</li>"
      );
    })
    .join("");
  renderCompare();
}
async function renderCompare() {
  const el = $("compare");
  if (S.favs.length < 2) {
    el.innerHTML =
      '<p class="muted">Save at least two cities with the Save button to compare them here.</p>';
    return;
  }
  el.textContent = "Loading…";
  const rows = await Promise.all(
    S.favs.map(async (l) => {
      try {
        return { l, c: (await API.weather(l)).current };
      } catch {
        return { l };
      }
    }),
  );
  el.innerHTML =
    "<table><thead><tr><th>City</th><th>Now</th><th>Temp</th><th>Feels</th><th>Humidity</th><th>Wind</th></tr></thead><tbody>" +
    rows
      .map(({ l, c }) =>
        c
          ? "<tr><td><b>" +
            esc(l.name) +
            "</b></td><td>" +
            wx(c.weather_code, c.is_day).icon +
            " " +
            wx(c.weather_code).label +
            "</td><td>" +
            temp(c.temperature_2m, S.tu) +
            "</td><td>" +
            temp(c.apparent_temperature, S.tu) +
            "</td><td>" +
            c.relative_humidity_2m +
            "%</td><td>" +
            wind(c.wind_speed_10m, S.wu) +
            "</td></tr>"
          : "<tr><td><b>" +
            esc(l.name) +
            '</b></td><td colspan="5" class="muted">Unavailable</td></tr>',
      )
      .join("") +
    "</tbody></table>";
}
function renderControls() {
  document.documentElement.classList.toggle("dark", S.dark);
  document
    .querySelectorAll("#tuSeg .btn")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.tu));
  document
    .querySelectorAll("#wuSeg .btn")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === S.wu));
  const isFav = S.favs.some((f) => same(f, loc));
  $("fav").textContent = isFav ? "★ Saved" : "☆ Save";
  $("fav").setAttribute("aria-pressed", isFav);
  $("favSel").innerHTML =
    '<option value="" disabled selected>' +
    (S.favs.length ? "Saved cities" : "No saved cities") +
    "</option>" +
    S.favs
      .map((f, i) => '<option value="' + i + '">' + esc(label(f)) + "</option>")
      .join("");
}

/* ---------- map ---------- */
function updateMap() {
  if (!window.L) {
    $("map").innerHTML = '<p class="pad muted">Map library failed to load.</p>';
    return;
  }
  if (!map) {
    map = L.map("map").setView([loc.lat, loc.lon], 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    marker = L.circleMarker([loc.lat, loc.lon], {
      radius: 9,
      color: "#fff",
      fillColor: "#4f8cff",
      fillOpacity: 1,
    }).addTo(map);
  } else {
    marker.setLatLng([loc.lat, loc.lon]);
    map.setView([loc.lat, loc.lon], Math.max(map.getZoom(), 7));
  }
  setTimeout(() => map.invalidateSize(), 50);
}

/* ---------- data loading ---------- */
async function load(force) {
  if (ctl) ctl.abort();
  const c = (ctl = new AbortController()); // cancel outdated requests
  $("error").hidden = true;
  $("refresh").disabled = true;
  if (!S.w) {
    $("skeleton").hidden = false;
    $("content").hidden = true;
  }
  try {
    const [w, a] = await Promise.all([
      API.weather(loc, c.signal, force),
      API.air(loc, c.signal),
    ]);
    if (c.signal.aborted) return;
    S.w = w;
    S.air = a;
    $("skeleton").hidden = true;
    $("content").hidden = false;
    render();
    updateMap();
    $("status").textContent =
      "Updated " +
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    if (e.name === "AbortError") return;
    $("skeleton").hidden = true;
    $("errMsg").textContent = e.message;
    $("error").hidden = false;
  } finally {
    if (!c.signal.aborted) $("refresh").disabled = false;
  }
}
function setLoc(l) {
  loc = l;
  S.w = null;
  window._open = 0;
  store.set("loc", l);
  S.recent = [l, ...S.recent.filter((r) => !same(r, l))].slice(0, 6);
  store.set("recent", S.recent);
  const q = new URLSearchParams({ lat: l.lat, lon: l.lon, name: l.name });
  if (l.region) q.set("region", l.region);
  if (l.country) q.set("country", l.country);
  history.replaceState(null, "", "?" + q);
  $("city").textContent = l.name;
  $("sub").textContent = "";
  renderControls();
  load(true);
}
const flash = (m) => {
  $("status").textContent = m;
  setTimeout(() => {
    if ($("status").textContent === m) $("status").textContent = "";
  }, 3000);
};

/* ---------- search (debounced, stale-safe) ---------- */
let seq = 0,
  found = [],
  act = -1,
  timer,
  sctl;
const list = $("results"),
  input = $("q");
function showList(items, info) {
  list.innerHTML =
    (info ? '<li class="info">' + esc(info) + "</li>" : "") +
    items
      .map(
        (l, i) =>
          '<li role="option" data-i="' +
          i +
          '" class="' +
          (i === act ? "act" : "") +
          '">' +
          esc(label(l)) +
          "</li>",
      )
      .join("") +
    (!items.length && !info && S.recent.length
      ? S.recent
          .map(
            (l, i) =>
              '<li role="option" data-r="' +
              i +
              '">🕘 ' +
              esc(label(l)) +
              "</li>",
          )
          .join("") +
        '<li class="info" data-clear="1" style="cursor:pointer;text-decoration:underline">Clear recent searches</li>'
      : "");
  list.hidden = !list.innerHTML;
  input.setAttribute("aria-expanded", !list.hidden);
}
input.addEventListener("input", () => {
  clearTimeout(timer);
  act = -1;
  const q = input.value.trim();
  if (q.length < 2) {
    found = [];
    showList([]);
    return;
  }
  timer = setTimeout(async () => {
    if (sctl) sctl.abort();
    sctl = new AbortController();
    const my = ++seq;
    try {
      const r = await API.search(q, sctl.signal);
      if (my !== seq) return;
      found = r;
      showList(
        r,
        r.length ? "" : 'No city found for "' + q + '". Check the spelling.',
      );
    } catch (e) {
      if (e.name !== "AbortError") showList([], e.message);
    }
  }, 300);
});
input.addEventListener("focus", () => {
  if (input.value.trim().length < 2) showList([]);
});
async function submit() {
  if (found[act] || found[0]) return pickFound(found[act] || found[0]);
  const q = input.value.trim();
  if (q.length < 2) return;
  try {
    const r = await API.search(q);
    r[0] ? pickFound(r[0]) : showList([], 'No city found for "' + q + '".');
  } catch (e) {
    showList([], e.message);
  }
}
function pickFound(l) {
  input.value = "";
  found = [];
  list.hidden = true;
  setLoc(l);
}
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
  else if (e.key === "ArrowDown") {
    act = Math.min(act + 1, found.length - 1);
    showList(found);
  } else if (e.key === "ArrowUp") {
    act = Math.max(act - 1, 0);
    showList(found);
  } else if (e.key === "Escape") list.hidden = true;
});
list.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  if (li.dataset.clear) {
    S.recent = [];
    store.set("recent", []);
    list.hidden = true;
  } else if (li.dataset.r) pickFound(S.recent[+li.dataset.r]);
  else if (li.dataset.i) pickFound(found[+li.dataset.i]);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) list.hidden = true;
});
$("go").onclick = submit;

/* ---------- other controls ---------- */
$("tuSeg").onclick = (e) => {
  const b = e.target.closest("[data-v]");
  if (b) {
    S.tu = b.dataset.v;
    store.set("tu", S.tu);
    renderControls();
    render();
  }
};
$("wuSeg").onclick = (e) => {
  const b = e.target.closest("[data-v]");
  if (b) {
    S.wu = b.dataset.v;
    store.set("wu", S.wu);
    renderControls();
    render();
  }
};
$("theme").onclick = () => {
  S.dark = !S.dark;
  store.set("dark", S.dark);
  renderControls();
  render();
};
$("refresh").onclick = () => load(true);
$("retry").onclick = () => load(true);
$("fav").onclick = () => {
  S.favs = S.favs.some((f) => same(f, loc))
    ? S.favs.filter((f) => !same(f, loc))
    : [...S.favs, loc];
  store.set("favs", S.favs);
  renderControls();
  renderCompare();
};
$("favSel").onchange = (e) => {
  const f = S.favs[+e.target.value];
  if (f) setLoc(f);
};
$("share").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    flash("Link copied");
  } catch {
    flash("Copy failed. Copy the address bar URL instead.");
  }
};
$("geo").onclick = () => {
  if (!navigator.geolocation)
    return flash("Geolocation is not supported by this browser.");
  navigator.geolocation.getCurrentPosition(
    (pos) =>
      setLoc({
        name: "Current location",
        lat: +pos.coords.latitude.toFixed(4),
        lon: +pos.coords.longitude.toFixed(4),
      }),
    () => flash("Location permission denied. Search for a city instead."),
  );
};
$("daily").onclick = (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) {
    const n = +b.dataset.i;
    window._open = window._open === n ? -1 : n;
    render();
  }
};
$("recenter").onclick = () => map && map.setView([loc.lat, loc.lon], 8);
$("radar").onclick = async () => {
  const btn = $("radar");
  if (radarLayer && map.hasLayer(radarLayer)) {
    map.removeLayer(radarLayer);
    btn.setAttribute("aria-pressed", "false");
    return;
  }
  radarUrl = radarUrl || (await API.radar());
  if (!radarUrl) {
    $("mapNote").textContent =
      "Radar overlay is unavailable right now. The base map still works.";
    return;
  }
  radarLayer =
    radarLayer ||
    L.tileLayer(radarUrl, {
      opacity: 0.65,
      attribution: "Radar &copy; RainViewer",
    });
  radarLayer.addTo(map);
  btn.setAttribute("aria-pressed", "true");
};
setInterval(() => {
  if (!document.hidden) load(true);
}, 300000); // auto-refresh every 5 minutes

/* ---------- start ---------- */
renderControls();
$("city").textContent = loc.name;
load();
