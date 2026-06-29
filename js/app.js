/* =================================================================
   POLLA MUNDIAL 2026 · app.js
   Carga datos (JSON), calcula puntajes y renderiza todo el dashboard.
   Reglas (fase de grupos): 3 pts marcador exacto · 1 pt acertar signo.
   ================================================================= */

const MESES = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Carga de datos ---------- */
async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(path);
  return res.json();
}

async function loadData() {
  // Para la vista previa, los datos pueden venir embebidos en window.__POLLA_DATA__
  if (window.__POLLA_DATA__) return window.__POLLA_DATA__;
  const [participantes, pronosticos, resultados] = await Promise.all([
    loadJSON("data/participantes.json"),
    loadJSON("data/pronosticos.json"),
    loadJSON("data/resultados.json"),
  ]);
  return { participantes, pronosticos, resultados };
}

/* ---------- Utilidades ---------- */
const parseFecha = (f) => {
  // "Thu, Jun 11" -> Date(2026, 5, 11)
  const m = String(f).match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!m) return new Date(2026, 5, 11);
  return new Date(2026, MESES[m[1]] ?? 5, +m[2]);
};

const fechaHora = (m) => {
  // fecha + hora ("3:00 PM") -> timestamp, para ordenar cronológicamente
  const d = parseFecha(m.fecha);
  const t = String(m.hora || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (t) { let h = (+t[1]) % 12; if (/PM/i.test(t[3])) h += 12; d.setHours(h, +t[2]); }
  return d.getTime();
};

const hasResult = (p) => p.golesLocal != null && p.golesVisitante != null;
const hasPred = (p) => p && p.golesLocal != null && p.golesVisitante != null;
const sign = (a, b) => Math.sign(a - b);

/* ---------- Puntuación de un partido ---------- */
function scoreMatch(pred, real) {
  if (!hasPred(pred) || !hasResult(real)) return null;
  // Marcador exacto
  if (pred.golesLocal === real.golesLocal && pred.golesVisitante === real.golesVisitante)
    return { pts: 4, tipo: "exacto" };
  // Acertó ganador/empate
  if (sign(pred.golesLocal, pred.golesVisitante) === sign(real.golesLocal, real.golesVisitante)) {
    const esEmpate = real.golesLocal === real.golesVisitante;
    const difOk = (pred.golesLocal - pred.golesVisitante) === (real.golesLocal - real.golesVisitante);
    return (difOk && !esEmpate) ? { pts: 3, tipo: "acierto" } : { pts: 2, tipo: "acierto" };
  }
  return { pts: 0, tipo: "fallo" };
}

/* ---------- Puntaje fase de eliminación ---------- */
const KO_PTS = {
  "16vos":      { exacto: 6,  inexacto: 3, bonus: 1 },
  "octavos":    { exacto: 6,  inexacto: 3, bonus: 1 },
  "cuartos":    { exacto: 8,  inexacto: 5, bonus: 1 },
  "semis":      { exacto: 8,  inexacto: 5, bonus: 1 },
  "3er puesto": { exacto: 10, inexacto: 6, bonus: 2 },
  "final":      { exacto: 10, inexacto: 6, bonus: 2 },
};

function scoreKnockout(pred, real) {
  if (!hasPred(pred) || !hasResult(real)) return null;
  const tab = KO_PTS[real.ronda];
  if (!tab) return null;
  const empReal = real.golesLocal === real.golesVisitante;
  const empPred = pred.golesLocal === pred.golesVisitante;
  const exacto = pred.golesLocal === real.golesLocal && pred.golesVisitante === real.golesVisitante;
  // marcador (a los 90'): exacto / tipo correcto inexacto / 0
  let marc = 0;
  if (exacto) marc = tab.exacto;
  else if ((empReal && empPred) ||
           (!empReal && !empPred && sign(pred.golesLocal, pred.golesVisitante) === sign(real.golesLocal, real.golesVisitante)))
    marc = tab.inexacto;
  // bonus "avanza": solo si hay empate en la apuesta o en el resultado
  let bonus = 0;
  if ((empPred || empReal) && pred.avanza && real.avanza && pred.avanza === real.avanza) bonus = tab.bonus;
  const pts = marc + bonus;
  const tipo = exacto ? "exacto" : (pts > 0 ? "acierto" : "fallo");
  return { pts, tipo };
}

/* Despacha al puntaje que corresponde según la fase del partido */
function scorePartido(pred, real) {
  return real.fase === "eliminacion" ? scoreKnockout(pred, real) : scoreMatch(pred, real);
}

/* ---------- Tabla de posiciones ---------- */
function computeStandings(DATA) {
  const { participantes, pronosticos, resultados } = DATA;
  const tabla = participantes.participantes.map((p) => {
    const picks = pronosticos.participantes[p.id] || {};
    let pts = 0, exactos = 0, aciertos = 0, pj = 0;
    for (const match of resultados.partidos) {
      if (!hasResult(match)) continue;
      const r = scorePartido(picks[match.id], match);
      if (!r) continue;
      pj++; pts += r.pts;
      if (r.tipo === "exacto") exactos++;
      else if (r.tipo === "acierto") aciertos++;
    }
    return { ...p, pts, exactos, aciertos, pj };
  });
  tabla.sort((a, b) => b.pts - a.pts || b.exactos - a.exactos || a.nombre.localeCompare(b.nombre));
  return tabla;
}

/* ---------- Render: hero líder + última actualización ---------- */
function renderHero(tabla, DATA) {
  const lider = tabla[0];
  const box = $("#heroLeader");
  if (lider && lider.pts > 0) {
    box.innerHTML = `<span class="lbl">Puntero</span>
      <span class="who"><img src="${lider.foto}" alt=""> ${lider.nombre}
      <span class="pts">${lider.pts} pts</span></span>`;
  } else {
    box.innerHTML = `<span class="lbl">Arranca</span>
      <span class="who">Jueves 11 de junio · ¡que comience la polla!</span>`;
  }
  const f = DATA.resultados.actualizado;
  $("#lastUpdate").textContent = f ? new Date(f + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

/* ---------- Render: tabla de posiciones ---------- */
function renderStandings(tabla) {
  const cont = $("#standings");
  cont.innerHTML = `<div class="standings__headrow">
      <span>#</span><span>Crack</span><span>PJ</span><span>Exactos</span><span>Puntos</span>
    </div>` +
    tabla.map((p, i) => `
      <article class="srow ${i === 0 && p.pts > 0 ? "srow--leader" : ""}">
        <span class="srow__rank">${i + 1}</span>
        <div class="srow__player">
          <img src="${p.foto}" alt="">
          <span>
            <span class="srow__name">${p.nombre}</span>
            <span class="srow__pos">${p.posicion}</span>
            <span class="srow__metamobile">PJ <b>${p.pj}</b> · Exactos <b>${p.exactos}</b></span>
          </span>
        </div>
        <span class="srow__stat">${p.pj}</span>
        <span class="srow__stat">${p.exactos}</span>
        <span class="srow__pts">${p.pts}</span>
      </article>`).join("");
}

/* ---------- Render: cartas FUT ---------- */
function overall(skills) {
  const v = Object.values(skills);
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
const ABREV = { Ritmo: "RIT", Pases: "PAS", Gambeta: "GAM", Defensa: "DEF", Pegada: "PEG" };

function renderCards(DATA) {
  const cont = $("#cards");
  cont.innerHTML = DATA.participantes.participantes.map((p) => `
    <article class="card" tabindex="0" role="button" data-id="${p.id}" aria-label="Ver pronósticos de ${p.nombre}">
      <div class="card__photo">
        <img src="${p.foto}" alt="Foto de ${p.nombre}">
        <div class="card__rating"><b>${overall(p.skills)}</b><span>OVR</span></div>
        <div class="card__pos">${p.posicion}</div>
      </div>
      <div class="card__body">
        <h3 class="card__name">${p.nombre}</h3>
        <p class="card__resena">${p.resena}</p>
        <div class="card__skills">
          ${Object.entries(p.skills).map(([k, v]) => `
            <div class="skill">
              <span class="skill__lbl">${ABREV[k]}</span>
              <span class="skill__bar"><span class="skill__fill" data-w="${v}"></span></span>
              <span class="skill__val">${v}</span>
            </div>`).join("")}
        </div>
        <p class="card__cta">Ver pronósticos →</p>
      </div>
    </article>`).join("");

  // Animación de barras al entrar en viewport
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        $$(".skill__fill", e.target).forEach((f) => (f.style.width = (100 - f.dataset.w) + "%"));
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  $$(".card").forEach((c) => io.observe(c));

  // Click / teclado -> modal
  $$(".card").forEach((c) => {
    const open = () => openModal(c.dataset.id, DATA);
    c.addEventListener("click", open);
    c.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });
  });
}

/* ---------- Render: próximos partidos ---------- */
function renderFixtures(DATA) {
  const prox = DATA.resultados.partidos
    .filter((p) => !hasResult(p) && p.local && p.visitante)
    .sort((a, b) => fechaHora(a) - fechaHora(b))
    .slice(0, 8);
  const cont = $("#fixtures");
  if (!prox.length) { cont.innerHTML = `<p class="chart__empty">No quedan partidos por jugar.</p>`; return; }
  cont.innerHTML = prox.map((p) => {
    const etiqueta = p.grupo ? `Grupo ${p.grupo}` : (p.llave || "Eliminación");
    const venue = p.sede ? `<p class="fx__venue">📍 ${p.sede}</p>` : "";
    return `
    <article class="fx">
      <div class="fx__top">
        <span class="fx__grp">${etiqueta}</span>
        <span class="fx__date">${p.fecha} · ${p.hora || ""}</span>
      </div>
      <div class="fx__teams">
        <span class="fx__team">${flagImg(p.local)}${p.local}</span>
        <span class="fx__vs">VS</span>
        <span class="fx__team">${flagImg(p.visitante)}${p.visitante}</span>
      </div>
      ${venue}
    </article>`;
  }).join("");
}

/* ---------- Render: gráfico de evolución ---------- */
function renderChart(DATA) {
  const { participantes, pronosticos, resultados } = DATA;
  const jugados = resultados.partidos.filter(hasResult).sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));
  const cont = $("#chart"), legend = $("#chartLegend");

  if (jugados.length < 1) {
    cont.innerHTML = `<p class="chart__empty">El gráfico se irá dibujando a medida que se carguen resultados.</p>`;
    legend.innerHTML = "";
    return;
  }

  // Fechas distintas con resultados, en orden
  const fechas = [...new Set(jugados.map((m) => m.fecha))];
  const acumulado = {};
  participantes.participantes.forEach((p) => (acumulado[p.id] = 0));

  // series[pid] = [puntos tras fecha0, fecha1, ...]
  const series = {};
  participantes.participantes.forEach((p) => (series[p.id] = [0]));
  fechas.forEach((f) => {
    jugados.filter((m) => m.fecha === f).forEach((m) => {
      participantes.participantes.forEach((p) => {
        const r = scorePartido((pronosticos.participantes[p.id] || {})[m.id], m);
        if (r) acumulado[p.id] += r.pts;
      });
    });
    participantes.participantes.forEach((p) => series[p.id].push(acumulado[p.id]));
  });

  // Geometría
  const W = 720, H = 320, PL = 38, PR = 16, PT = 18, PB = 34;
  const xs = ["Inicio", ...fechas];
  const maxY = Math.max(4, ...Object.values(acumulado));
  const x = (i) => PL + (i * (W - PL - PR)) / (xs.length - 1);
  const y = (v) => H - PB - (v * (H - PT - PB)) / maxY;

  const gridY = [];
  const step = Math.max(1, Math.ceil(maxY / 4));
  for (let v = 0; v <= maxY; v += step) gridY.push(v);

  const grid = gridY.map((v) => `
    <line x1="${PL}" y1="${y(v)}" x2="${W - PR}" y2="${y(v)}" stroke="rgba(255,255,255,.07)"/>
    <text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" fill="#6a6a86" font-size="11" font-family="Montserrat">${v}</text>`).join("");

  const xlabels = xs.map((lbl, i) => `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" fill="#6a6a86" font-size="10" font-family="Montserrat">${lbl.replace(/^[A-Z][a-z]{2},\s*/, "")}</text>`).join("");

  const paths = participantes.participantes.map((p) => {
    const pts = series[p.id].map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const dots = series[p.id].map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${p.color}"/>`).join("");
    const hits = series[p.id].map((v, i) => `<circle class="chart__hit" cx="${x(i)}" cy="${y(v)}" r="11" fill="transparent" data-name="${p.nombre}" data-val="${v}" data-color="${p.color}"/>`).join("");
    return `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}${hits}`;
  }).join("");

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
    ${grid}${xlabels}${paths}</svg>`;

  // Tooltip: muestra el número al hacer hover (desktop) o touch (celular)
  cont.style.position = "relative";
  const tip = document.createElement("div");
  tip.className = "chart__tip"; tip.hidden = true; cont.appendChild(tip);
  let hideT;
  const showTip = (node) => {
    clearTimeout(hideT);
    const r = node.getBoundingClientRect(), c = cont.getBoundingClientRect();
    tip.innerHTML = `<span class="dot" style="background:${node.dataset.color}"></span>${node.dataset.name} · <b>${node.dataset.val}</b> pts`;
    tip.style.left = (r.left - c.left + r.width / 2) + "px";
    tip.style.top = (r.top - c.top) + "px";
    tip.hidden = false;
  };
  cont.querySelectorAll(".chart__hit").forEach((node) => {
    node.style.cursor = "pointer";
    node.addEventListener("mouseenter", () => showTip(node));
    node.addEventListener("mouseleave", () => (tip.hidden = true));
    node.addEventListener("touchstart", () => { showTip(node); hideT = setTimeout(() => (tip.hidden = true), 2200); }, { passive: true });
  });

  legend.innerHTML = participantes.participantes
    .slice().sort((a, b) => acumulado[b.id] - acumulado[a.id])
    .map((p) => `<span class="lg"><span class="dot" style="background:${p.color}"></span>${p.nombre} · ${acumulado[p.id]}</span>`).join("");
}

/* ---------- Modal: detalle de pronósticos ---------- */
let MODAL_STATE = { id: null, filter: "todos", DATA: null };

function buildPredRows(pid, DATA, filter) {
  const picks = DATA.pronosticos.participantes[pid] || {};
   const rows = [];
  const partidos = [...DATA.resultados.partidos].sort((a, b) => fechaHora(a) - fechaHora(b));
  for (const m of partidos) {
    const pred = picks[m.id];
    if (!hasPred(pred)) continue;
    const r = scoreMatch(pred, m);
    const pendiente = !hasResult(m);
    let cls, txt;
    if (pendiente) { cls = "pend"; txt = "—"; }
    else { cls = "p" + r.pts; txt = "+" + r.pts; }

    if (filter === "exactos" && !(r && r.tipo === "exacto")) continue;
    if (filter === "aciertos" && !(r && r.tipo === "acierto")) continue;
    if (filter === "pendientes" && !pendiente) continue;

    const real = hasResult(m) ? `${m.golesLocal}–${m.golesVisitante}` : `<small>por jugar</small>`;
    rows.push(`<div class="pred">
      <span class="pred__match">${m.local} vs ${m.visitante} <small>· G${m.grupo}</small></span>
      <span class="pred__score">${pred.golesLocal}–${pred.golesVisitante} <em>/</em> ${real}</span>
      <span class="pred__pts pred__pts--${cls}">${txt}</span>
    </div>`);
  }
  return rows.length ? rows.join("") : `<p class="chart__empty">Sin pronósticos en esta categoría todavía.</p>`;
}

function renderModalBody() {
  const { id, filter, DATA } = MODAL_STATE;
  $("#modalBody").innerHTML = `
    <div class="preds__filter">
      ${["todos", "exactos", "aciertos", "pendientes"].map((f) =>
        `<button class="${f === filter ? "is-active" : ""}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}
    </div>
    <div class="preds">${buildPredRows(id, DATA, filter)}</div>`;
  $$("#modalBody [data-filter]").forEach((b) =>
    b.addEventListener("click", () => { MODAL_STATE.filter = b.dataset.filter; renderModalBody(); }));
}

function openModal(id, DATA) {
  const tabla = computeStandings(DATA);
  const p = tabla.find((x) => x.id === id);
  MODAL_STATE = { id, filter: "todos", DATA };
  $("#modalHead").innerHTML = `
    <img src="${p.foto}" alt="">
    <div>
      <h3>${p.nombre}</h3>
      <span class="sub">${p.posicion} · ${p.exactos} exactos · ${p.aciertos} aciertos</span>
    </div>
    <div class="modal__tot"><b>${p.pts}</b><span>Puntos</span></div>`;
  renderModalBody();
  const modal = $("#modal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}

/* ---------- Grupos: tabla real del Mundial ---------- */
const FLAGS = {
  "Algeria": "dz", "Argentina": "ar", "Australia": "au", "Austria": "at", "Belgium": "be",
  "Bosnia and Herzegovina": "ba", "Brazil": "br", "Canada": "ca", "Cape Verde": "cv",
  "Colombia": "co", "Croatia": "hr", "Curaçao": "cw", "Czechia": "cz", "DR Congo": "cd",
  "Ecuador": "ec", "Egypt": "eg", "England": "gb-eng", "France": "fr", "Germany": "de",
  "Ghana": "gh", "Haiti": "ht", "Iran": "ir", "Iraq": "iq", "Ivory Coast": "ci", "Japan": "jp",
  "Jordan": "jo", "Korea Republic": "kr", "Mexico": "mx", "Morocco": "ma", "Netherlands": "nl",
  "New Zealand": "nz", "Norway": "no", "Panama": "pa", "Paraguay": "py", "Portugal": "pt",
  "Qatar": "qa", "Saudi Arabia": "sa", "Scotland": "gb-sct", "Senegal": "sn", "South Africa": "za",
  "Spain": "es", "Sweden": "se", "Switzerland": "ch", "Tunisia": "tn", "Türkiye": "tr",
  "United States": "us", "Uruguay": "uy", "Uzbekistan": "uz"
};
const flagImg = (team) => {
  const code = FLAGS[team];
  return code
    ? `<img class="gflag" src="https://flagcdn.com/w80/${code}.png" alt="" loading="lazy">`
    : `<span class="gflag gflag--none"></span>`;
};

const flagBig = (team) => {
  const code = FLAGS[team];
  return code
    ? `<img class="next__flag" src="https://flagcdn.com/w160/${code}.png" alt="">`
    : `<span class="next__flag next__flag--none"></span>`;
};

function computeGrupos(DATA) {
  const grupos = {};
  for (const m of DATA.resultados.partidos) {
    if (!m.grupo) continue; // ignora partidos de eliminación (no tienen grupo)
    const g = m.grupo;
    if (!grupos[g]) grupos[g] = {};
    for (const t of [m.local, m.visitante]) {
      if (!grupos[g][t]) grupos[g][t] = { equipo: t, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
    }
    if (!hasResult(m)) continue;
    const L = grupos[g][m.local], V = grupos[g][m.visitante];
    const gl = m.golesLocal, gv = m.golesVisitante;
    L.pj++; V.pj++; L.gf += gl; L.gc += gv; V.gf += gv; V.gc += gl;
    if (gl > gv) { L.g++; L.pts += 3; V.p++; }
    else if (gl < gv) { V.g++; V.pts += 3; L.p++; }
    else { L.e++; V.e++; L.pts++; V.pts++; }
  }
  const out = {};
  for (const g in grupos) {
    const arr = Object.values(grupos[g]);
    arr.forEach((t) => (t.dg = t.gf - t.gc));
    arr.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipo.localeCompare(b.equipo));
    out[g] = arr;
  }
  return out;
}

function renderGrupos(DATA) {
  const tabsEl = $("#gruposTabs"), tablaEl = $("#gruposTabla");
  if (!tabsEl || !tablaEl) return;
  const grupos = computeGrupos(DATA);
  const letras = Object.keys(grupos).sort();
  let activo = letras[0];

  const pintar = () => {
    tabsEl.innerHTML = letras.map((L) =>
      `<button class="grupos__tab ${L === activo ? "is-active" : ""}" data-g="${L}">${L}</button>`).join("");
    const filas = grupos[activo];
    tablaEl.innerHTML = `
      <table class="gtab">
        <thead><tr>
          <th class="gtab__pos">#</th>
          <th class="gtab__team">Grupo ${activo}</th>
          <th>PJ</th>
          <th class="gtab__opt">G</th><th class="gtab__opt">E</th><th class="gtab__opt">P</th>
          <th class="gtab__opt">GF</th><th class="gtab__opt">GC</th>
          <th>DG</th><th>Pts</th>
        </tr></thead>
        <tbody>
          ${filas.map((t, i) => `
            <tr class="${i < 2 ? "gtab__clasifica" : ""}">
              <td class="gtab__pos">${i + 1}</td>
              <td class="gtab__team"><div class="gteam">${flagImg(t.equipo)}<span class="gname">${t.equipo}</span></div></td>
              <td>${t.pj}</td>
              <td class="gtab__opt">${t.g}</td><td class="gtab__opt">${t.e}</td><td class="gtab__opt">${t.p}</td>
              <td class="gtab__opt">${t.gf}</td><td class="gtab__opt">${t.gc}</td>
              <td>${t.dg > 0 ? "+" : ""}${t.dg}</td>
              <td class="gtab__pts">${t.pts}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    tabsEl.querySelectorAll(".grupos__tab").forEach((b) =>
      b.addEventListener("click", () => { activo = b.dataset.g; pintar(); }));
  };
  pintar();
}

/* ---------- Siguiente apuesta: pronósticos del próximo partido ---------- */
function renderSiguiente(DATA) {
  const cont = $("#next");
  if (!cont) return;
  const prox = [...DATA.resultados.partidos]
    .filter((m) => !hasResult(m))
    .sort((a, b) => fechaHora(a) - fechaHora(b))[0];
  if (!prox) { cont.innerHTML = `<p class="chart__empty">No quedan partidos por jugar.</p>`; return; }

  const picks = DATA.participantes.participantes.map((p) => {
    const pr = (DATA.pronosticos.participantes[p.id] || {})[prox.id];
    const score = pr && pr.golesLocal != null
      ? `${pr.golesLocal} <em>-</em> ${pr.golesVisitante}` : "—";
    return `<div class="next__pick">
        <img src="${p.foto}" alt="${p.nombre}">
        <span class="next__name">${p.nombre}</span>
        <span class="next__score">${score}</span>
      </div>`;
  }).join("");

  const etiqueta = prox.grupo ? `Grupo ${prox.grupo}` : (prox.llave || "Eliminación");
  cont.innerHTML = `
    <div class="next__match">
      <span class="next__grp">${etiqueta}</span>
      <div class="next__teams">${flagBig(prox.local)}<span>${prox.local}</span><span class="next__vs">VS</span><span>${prox.visitante}</span>${flagBig(prox.visitante)}</div>
      <span class="next__date">${prox.fecha} · ${prox.hora || ""}</span>
    </div>
    <div class="next__picks">${picks}</div>`;
}

function renderAnterior(DATA) {
  const cont = $("#prev");
  if (!cont) return;
  const ant = [...DATA.resultados.partidos]
    .filter((m) => hasResult(m))
    .sort((a, b) => fechaHora(b) - fechaHora(a))[0];
  if (!ant) { cont.innerHTML = `<p class="chart__empty">Aún no hay partidos jugados.</p>`; return; }

  const picks = DATA.participantes.participantes.map((p) => {
    const pr = (DATA.pronosticos.participantes[p.id] || {})[ant.id];
    const sc = pr && pr.golesLocal != null
      ? `${pr.golesLocal} <em>-</em> ${pr.golesVisitante}` : "—";
    const res = scorePartido(pr, ant);
    const pts = res ? res.pts : 0;
    const tipo = res ? res.tipo : "fallo";
    return `<div class="next__pick">
        <img src="${p.foto}" alt="${p.nombre}">
        <span class="next__name">${p.nombre}</span>
        <span class="next__score">${sc}</span>
        <span class="next__pts next__pts--${tipo}">+${pts}</span>
      </div>`;
  }).join("");

  const etiqueta = ant.grupo ? `Grupo ${ant.grupo}` : (ant.llave || "Eliminación");
  cont.innerHTML = `
    <div class="next__match next__match--done">
      <span class="next__grp">${etiqueta} · Finalizado</span>
      <div class="next__teams">${flagBig(ant.local)}<span>${ant.local}</span><span class="prev__result">${ant.golesLocal} <em>-</em> ${ant.golesVisitante}</span><span>${ant.visitante}</span>${flagBig(ant.visitante)}</div>
      <span class="next__date">${ant.fecha} · ${ant.hora || ""}</span>
    </div>
    <div class="next__picks">${picks}</div>`;
}

/* ---------- Última actualización automática (fecha del último commit) ---------- */
async function renderLastUpdate(DATA) {
  const el = $("#lastUpdate");
  if (!el) return;
  let cuando = null;
  try {
    const res = await fetch("data/resultados.json", { method: "HEAD", cache: "no-store" });
    const lm = res.headers.get("Last-Modified");
    if (lm) cuando = new Date(lm);
  } catch (e) { /* preview o sin servidor: usa el respaldo */ }
  if (!cuando && DATA.resultados.actualizado) cuando = new Date(DATA.resultados.actualizado + "T12:00:00");
  el.textContent = cuando
    ? cuando.toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })
    : "—";
}

/* ---------- Init ---------- */
/* ---------- Bracket / Fase de eliminación ---------- */
const BR_TABS = [
  { key: "16vos",   label: "16vos",   rondas: ["16vos"] },
  { key: "octavos", label: "8vos",    rondas: ["octavos"] },
  { key: "cuartos", label: "4tos",    rondas: ["cuartos"] },
  { key: "semis",   label: "SF",      rondas: ["semis"] },
  { key: "final",   label: "FN",      rondas: ["3er puesto", "final"] },
];
const ROUND_SIZE = { "16vos": 16, octavos: 8, cuartos: 4, semis: 2, "3er puesto": 1, final: 1 };

function brColorClass(m) {
  if (!m.alimenta) return "";
  if (/FN/i.test(m.alimenta)) return "bx__key--final";
  const mt = String(m.alimenta).match(/-(\d+)/);
  return mt ? `bx__key--c${((+mt[1] - 1) % 8) + 1}` : "";
}
function bracketCard(m, isFinal) {
  const side = (team, goles, win) => {
    const flag = team ? flagImg(team) : `<span class="gflag gflag--none"></span>`;
    const name = team ? team : "Por definir";
    const score = (goles != null) ? `<span class="bx__score">${goles}</span>` : "";
    return `<div class="bx__team ${win ? "bx__team--win" : ""} ${team ? "" : "bx__team--tbd"}">${flag}<span class="bx__name">${name}</span>${score}</div>`;
  };
  const winL = m.avanza && m.local && m.avanza === m.local;
  const winV = m.avanza && m.visitante && m.avanza === m.visitante;
  const fecha = (m.fecha || m.hora) ? `${m.fecha || ""}${m.hora ? " · " + m.hora : ""}` : "Por definir";
  const tag = m.definicion
    ? `<span class="bx__tag">${m.definicion === "penales" ? "av. penales" : "tras alargue"}</span>` : "";
  const cc = brColorClass(m);
  const key = m.llave
    ? `<span class="bx__key ${cc}"><b>${m.llave}</b>${m.alimenta ? `<span class="bx__arrow">\u2192</span><span class="bx__dest">${m.alimenta}</span>` : ""}</span>`
    : "";
  return `<article class="bx ${isFinal ? "bx--final" : ""}">
      <div class="bx__top">${key}<span class="bx__date">${fecha}</span>${tag}</div>
      ${side(m.local, m.golesLocal, winL)}
      ${side(m.visitante, m.golesVisitante, winV)}
    </article>`;
}

function renderBracket(DATA) {
  const tabsEl = $("#bracketTabs"), gridEl = $("#bracketGrid");
  if (!tabsEl || !gridEl) return;
  const ko = DATA.resultados.partidos.filter((p) => p.fase === "eliminacion");

  let activo = "16vos";
  const prox = ko.filter((m) => m.local && m.visitante && !hasResult(m))
                 .sort((a, b) => fechaHora(a) - fechaHora(b))[0];
  if (prox) {
    const t = BR_TABS.find((tb) => tb.rondas.includes(prox.ronda));
    if (t) activo = t.key;
  }

  const numLlave = (m) => { const x = String(m.llave || "").match(/-(\d+)/); return x ? +x[1] : 999; };
  const getRonda = (ronda) => {
    const arr = ko.filter((m) => m.ronda === ronda).sort((a, b) => numLlave(a) - numLlave(b));
    return arr.length ? arr : Array.from({ length: ROUND_SIZE[ronda] }, () => ({ ronda }));
  };

  const pintar = () => {
    tabsEl.innerHTML = BR_TABS.map((t) =>
      `<button class="bracket__tab ${t.key === activo ? "is-active" : ""}" data-k="${t.key}">${t.label}</button>`).join("");
    const tab = BR_TABS.find((t) => t.key === activo);
    let cards;
    if (tab.key === "final") {
      const tercero = getRonda("3er puesto").map((m) => ({ ...m, llave: m.llave || "3er" }));
      const finalM = getRonda("final").map((m) => ({ ...m, llave: m.llave || "FN" }));
      cards = tercero.map((m) => bracketCard(m, false)).join("") + finalM.map((m) => bracketCard(m, true)).join("");
    } else {
      cards = tab.rondas.flatMap((r) => getRonda(r)).map((m) => bracketCard(m, false)).join("");
    }
    gridEl.innerHTML = cards;
    tabsEl.querySelectorAll(".bracket__tab").forEach((b) =>
      b.addEventListener("click", () => { activo = b.dataset.k; pintar(); }));
  };
  pintar();
}

async function init() {
  let DATA;
  try {
    DATA = await loadData();
  } catch (e) {
    $("#standings").innerHTML = `<p class="chart__empty">No se pudieron cargar los datos. Si abriste el archivo directamente, súbelo a GitHub Pages o usa un servidor local.</p>`;
    return;
  }
  const tabla = computeStandings(DATA);
  renderHero(tabla, DATA);
  renderStandings(tabla);
  renderBracket(DATA);
  renderSiguiente(DATA);
  renderAnterior(DATA);
  renderCards(DATA);
  renderGrupos(DATA);
  renderFixtures(DATA);
  renderChart(DATA);
  renderLastUpdate(DATA);

  // Modal listeners
  $$("#modal [data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

document.addEventListener("DOMContentLoaded", init);

/* ===== Reveal de secciones al hacer scroll ===== */
document.documentElement.classList.add("js");
(function () {
  const reveal = () => {
    const obs = new IntersectionObserver((entries, o) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); o.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -15% 0px" });
    document.querySelectorAll(".section").forEach((s) => obs.observe(s));
  };
  if (document.readyState !== "loading") reveal();
  else document.addEventListener("DOMContentLoaded", reveal);
})();

/* ===== Menú hamburguesa (mobile) ===== */
(function () {
  const btn = document.querySelector("#navToggle");
  const menu = document.querySelector("#navLinks");
  if (!btn || !menu) return;
  const setOpen = (open) => {
    menu.classList.toggle("is-open", open);
    btn.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  };
  btn.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();

