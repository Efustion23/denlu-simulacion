// Interfaz: las cifras de Denlu.ipynb contadas paso a paso (diagnóstico, plan MILP y ROI) y una animación ilustrativa de un día.
const S = Simulacion;
const $ = (id) => document.getElementById(id);

// La animación muestra la situación actual o el plan MILP; T y p son los supuestos del modelo de simulación
const estado = { plan: { ...S.PLANES.milp.plan }, preset: 'milp', crec: 0, aus: 0, T: S.T_CAL, p: S.P_CAL, hx: S.COSTO_HORA_EXTRA };
const totalPersonas = (plan) => Object.values(plan).reduce((a, b) => a + b, 0);
const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

const numero = (v, dec = 0) => v.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const soles = (v, dec = 0) => 'S/ ' + numero(v, dec);
const reloj = (min) => {
  const m = Math.floor(min) + 8 * 60;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const horaTexto = (h) => `${String(h).padStart(2, '0')}:00`;

let C = {};
function leerColores() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['fondo', 'panel', 'suelo', 'tinta', 'tinta-2', 'linea', 'seguridad', 'carton', 'carton-borde',
    'acero', 'rojo', 'verde', 'serie-plan', 'serie-actual', 'control']) C[k] = cs.getPropertyValue('--' + k).trim();
}

// Cuenta un número desde 0 (o desde donde estaba) hasta su valor, con salida rápida y llegada suave
function contar(el, valor, formato, ms = 1100) {
  const desde = Number(el.dataset.valor || 0);
  el.dataset.valor = valor;
  if (reducirMovimiento) { el.textContent = formato(valor); return; }
  const t0 = performance.now();
  const paso = (t) => {
    const f = Math.min(1, (t - t0) / ms), e = 1 - (1 - f) ** 3;
    el.textContent = formato(desde + (valor - desde) * e);
    if (f < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* ---------- Tema claro / oscuro ---------- */

const raiz = document.documentElement;
const sistemaOscuro = matchMedia('(prefers-color-scheme: dark)');
const esOscuro = () => (raiz.dataset.theme ? raiz.dataset.theme === 'dark' : sistemaOscuro.matches);
function pintarBotonTema() { $('tema').setAttribute('aria-pressed', esOscuro()); }
function cambioTema() { leerColores(); crearGraficos(); pintarBotonTema(); }
$('tema').addEventListener('click', () => {
  raiz.dataset.theme = esOscuro() ? 'light' : 'dark';
  try { localStorage.setItem('denlu-tema', raiz.dataset.theme); } catch (e) { /* sin almacenamiento: no se recuerda */ }
  cambioTema();
});
sistemaOscuro.addEventListener('change', cambioTema);

/* ---------- Portada ---------- */

const N = S.NOTEBOOK, R = S.roi();
const CAPACIDAD = 3 * S.MU_H;                              // pedidos por hora que atienden los 3 despachadores de hoy
const requerido = S.requeridos(N.rhoObjetivo);
const asignado = S.personalPorHora(S.PLANES.milp.plan);

function pintarPortada() {
  const pico = N.rho.indexOf(Math.max(...N.rho));
  const kpis = [
    ['Utilización máxima (ρ)', N.rho[pico], (v) => numero(v, 3), `a las ${horaTexto(S.HORAS[pico])} con 3 despachadores; el objetivo es ${N.rhoObjetivo}`, true],
    ['Pedidos que pierden su ruta', S.HIST_PERDIDA[1], (v) => `${numero(v, 0)} %`, `a las 9 y 10 h, con ${numero(S.HIST_ESPERA[1], 1)} min de espera media`],
    ['Planilla óptima al mes', R.planillaOptima / 12, (v) => soles(v, 2), `hoy ${soles(R.planillaActual / 12, 2)} con 3 fijos`],
    ['Retorno de la inversión', R.roi, (v) => `${numero(v, 2)} %`, `beneficio neto de ${soles(R.beneficio, 2)} al año`],
  ];
  $('kpis').innerHTML = kpis.map(([et, , , pie, lider]) =>
    `<div class="${lider ? 'lider' : ''}"><dt>${et}</dt><dd>0</dd><span class="pie">${pie}</span></div>`).join('');
  $('kpis').querySelectorAll('dd').forEach((dd, i) => contar(dd, kpis[i][1], kpis[i][2], 1400));
}

/* ---------- 1. Diagnóstico: explorador por hora ---------- */

let horaElegida = 1;                                       // arranca en las 9 h, la más saturada
$('horas').innerHTML = S.HORAS.map((h, i) =>
  `<button type="button" role="tab" data-i="${i}" class="${N.rho[i] >= 1 ? 'critica' : ''}">${h}h</button>`).join('');
$('horas').addEventListener('click', (e) => {
  if (e.target.dataset.i === undefined) return;
  detenerRecorrido();
  elegirHora(Number(e.target.dataset.i));
});

// Medidor de 0 a 2: el arco se llena según ρ y la aguja gira de -90° (0) a +90° (2)
const ARCO = 251.33, RHO_MAX = 2;
const anguloRho = (r) => -90 + (180 * Math.min(r, RHO_MAX)) / RHO_MAX;
(() => {
  const a = ((anguloRho(N.rhoObjetivo) - 90) * Math.PI) / 180, m = $('marca085');
  m.setAttribute('x1', 100 + 66 * Math.cos(a)); m.setAttribute('y1', 100 + 66 * Math.sin(a));
  m.setAttribute('x2', 100 + 94 * Math.cos(a)); m.setAttribute('y2', 100 + 94 * Math.sin(a));
})();

function elegirHora(i) {
  horaElegida = i;
  document.querySelectorAll('#horas button').forEach((b) => b.setAttribute('aria-selected', Number(b.dataset.i) === i));
  const lambda = S.LAMBDA[i], rho = N.rho[i], escala = 7.2;
  const llegan = $('barraLlegan');
  llegan.style.width = `${(100 * lambda) / escala}%`;
  llegan.classList.toggle('excede', lambda > CAPACIDAD);
  $('barraCap').style.width = `${(100 * CAPACIDAD) / escala}%`;
  contar($('vLlegan'), lambda, (v) => `${numero(v, 2)} ped/h`, 700);
  $('vCap').textContent = `${numero(CAPACIDAD, 2)} ped/h`;
  contar($('vEspera'), S.HIST_ESPERA[i], (v) => `${numero(v, 1)} min`, 700);
  contar($('vPerdida'), S.HIST_PERDIDA[i], (v) => `${numero(v, 0)} %`, 700);
  contar($('vRho'), rho, (v) => numero(v, 3), 700);
  const arco = $('arcoRho');
  arco.style.strokeDashoffset = ARCO * (1 - Math.min(rho, RHO_MAX) / RHO_MAX);
  arco.style.stroke = rho >= 1 ? C.rojo : rho > N.rhoObjetivo ? C.seguridad : C.acero;
  $('aguja').style.transform = `rotate(${anguloRho(rho)}deg)`;
  const v = $('veredicto');
  v.classList.toggle('mal', rho >= 1);
  v.textContent = rho >= 1
    ? `A las ${horaTexto(S.HORAS[i])} llegan ${numero(rho, 1)} veces más pedidos de los que se pueden atender: la cola crece toda la hora y ${numero(S.HIST_PERDIDA[i], 0)} % de los pedidos pierde su ruta.`
    : rho > N.rhoObjetivo
      ? `A las ${horaTexto(S.HORAS[i])} se alcanza a atender, pero con poco margen: los despachadores están ocupados el ${numero(100 * rho, 0)} % del tiempo.`
      : `A las ${horaTexto(S.HORAS[i])} sobra capacidad: los despachadores están ocupados el ${numero(100 * rho, 0)} % del tiempo.`;
  if (graficos.rho) {
    graficos.rho.data.datasets[0].borderWidth = S.HORAS.map((_, k) => (k === i ? 3 : 0));
    graficos.rho.update('none');
  }
}

let recorrido = null;
function detenerRecorrido() {
  clearInterval(recorrido); recorrido = null;
  $('recorrer').textContent = '▶ Recorrer el día hora por hora';
}
$('recorrer').addEventListener('click', () => {
  if (recorrido) { detenerRecorrido(); return; }
  let i = 0;
  elegirHora(i);
  $('recorrer').textContent = '⏸ Detener el recorrido';
  recorrido = setInterval(() => { if (++i >= S.HORAS.length) detenerRecorrido(); else elegirHora(i); }, 1600);
});

/* ---------- 2. Plan: horario por persona ---------- */

// Una fila por persona: el plan MILP tiene 6 (3 FT-1, 1 FT-3 y 2 PT-1); hoy son 3 fijos de 8 a 18 h
function personas(plan) {
  return Object.entries(plan).flatMap(([t, n]) => Array.from({ length: n }, () => t));
}
function pintarGantt(vista) {
  document.querySelectorAll('#vistaGantt button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.vista === vista));
  const plan = S.PLANES[vista].plan, enTurno = S.personalPorHora(plan);
  let k = 0;
  const filas = personas(plan).map((t) => {
    const horas = S.TURNOS[t].horas, primera = Math.min(...horas), ultima = Math.max(...horas);
    const celdas = S.HORAS.map((h) => {
      const clase = horas.includes(h) ? 'on' : h > primera && h < ultima ? 'alm' : '';
      return `<i class="celda ${clase}" style="--i:${k++}" title="${clase === 'alm' ? 'Almuerzo' : ''}"></i>`;
    }).join('');
    return `<div class="persona"><strong>${t}</strong><span>${S.TURNOS[t].horario.replace(' (situación actual)', '')}</span></div>${celdas}`;
  }).join('');
  $('gantt').innerHTML = `<span></span>${S.HORAS.map((h) => `<span class="cab">${h}h</span>`).join('')}${filas}
    <i class="sep"></i>
    <span class="fila-et">Mínimo requerido</span>${requerido.map((n, i) => `<span class="n req" style="--i:${i}">${n}</span>`).join('')}
    <span class="fila-et">En turno</span>${enTurno.map((n, i) => `<span class="n ${n >= requerido[i] ? 'ok' : 'falta'}" style="--i:${i}" title="${n >= requerido[i] ? 'Cubre el mínimo' : `Faltan ${requerido[i] - n}`}">${n}</span>`).join('')}`;
}
$('vistaGantt').addEventListener('click', (e) => { if (e.target.dataset.vista) pintarGantt(e.target.dataset.vista); });

/* ---------- 3. ROI: de la venta perdida al beneficio ---------- */

function pintarCascada() {
  const max = N.ventaPerdida, alto = (v) => `${(100 * v) / max}%`;
  const columnas = [
    { et: 'Venta perdida hoy', v: N.ventaPerdida, color: C['serie-actual'] },
    { et: `Ventas recuperadas (${numero(100 * N.recuperacion, 0)} %)`, v: R.recuperado, color: C.verde },
    { et: 'Inversión adicional de planilla', v: -R.inversion, color: C.rojo, base: R.beneficio },
    { et: 'Beneficio neto anual', v: R.beneficio, color: C.acero },
  ];
  $('cascada').innerHTML = columnas.map((c, i) => `
    <div class="columna">
      <span class="valor" data-v="${c.v}">S/ 0</span>
      <i class="bar ${c.base ? 'flota' : ''}" style="height:${alto(Math.abs(c.v))};background:${c.color};transition-delay:${i * 250}ms"></i>
      ${c.base ? `<i style="height:${alto(c.base)}"></i>` : ''}
    </div>`).join('');
  $('cascada').insertAdjacentHTML('afterend', `<div class="cascada-et">${columnas.map((c) => `<span>${c.et}</span>`).join('')}</div>`);
}
function animarCascada() {
  $('cascada').classList.add('visible');
  $('cascada').querySelectorAll('.valor').forEach((el, i) => {
    const v = Number(el.dataset.v);
    setTimeout(() => contar(el, Math.abs(v), (x) => `${v < 0 ? '−' : ''}${soles(x, 2)}`, 900), reducirMovimiento ? 0 : i * 250);
  });
  setTimeout(() => contar($('vRoi'), R.roi, (x) => `${numero(x, 2)} %`, 1200), reducirMovimiento ? 0 : 1000);
}

/* ---------- Tablas completas (plegadas) ---------- */

function pintarTablas() {
  $('tablaDiag').innerHTML = `
    <thead><tr><th>Hora</th><th>λ (pedidos/h)</th><th>ρ (utilización)</th><th>Espera media</th><th>Pérdida de ruta</th></tr></thead>
    <tbody>${S.HORAS.map((h, i) => `<tr class="${N.rho[i] >= 1 ? 'critica' : ''}"><td>${horaTexto(h)}</td>
      <td class="cifra">${S.LAMBDA[i].toFixed(3)}</td><td class="cifra">${N.rho[i].toFixed(3)}</td>
      <td class="cifra">${S.HIST_ESPERA[i].toFixed(2)} min</td><td class="cifra">${S.HIST_PERDIDA[i].toFixed(2)} %</td></tr>`).join('')}</tbody>`;

  $('tablaCobertura').innerHTML = `
    <thead><tr><th>Hora</th><th>Mín. requerido</th><th>Asignado óptimo</th><th>Diferencia</th></tr></thead>
    <tbody>${S.HORAS.map((h, i) => `<tr><td>${horaTexto(h)}</td><td class="cifra">${requerido[i]}</td>
      <td class="cifra">${asignado[i]}</td><td class="cifra">${asignado[i] - requerido[i] > 0 ? '+' : ''}${asignado[i] - requerido[i]}</td></tr>`).join('')}</tbody>`;

  const plan = S.PLANES.milp.plan, total = totalPersonas(plan);
  const pt = Object.entries(plan).reduce((s, [t, n]) => s + (S.TURNOS[t].parcial ? n : 0), 0);
  $('planMilp').innerHTML = `${Object.entries(plan).map(([t, n]) => `<strong>${n} ${t}</strong> (${S.TURNOS[t].horario})`).join(', ')}: `
    + `${total} despachadores por <strong>${soles(R.planillaOptima / 12, 2)}</strong> al mes, frente a ${soles(R.planillaActual / 12, 2)} de hoy. `
    + `Cubre el mínimo de cada hora y respeta el tope legal de part-time (${pt} de ${total}, ${Math.round((100 * pt) / total)} % ≤ 40 %).`;

  const filas = [
    ['Tasa de cancelación de pedidos hoy', `${N.cancelacionPct.toFixed(2)} %`],
    ['Venta perdida anual por cancelación', soles(N.ventaPerdida, 2)],
    ['Planilla actual al año (3 × S/ 1,373.50 × 12)', soles(R.planillaActual, 2)],
    ['Planilla óptima al año', soles(R.planillaOptima, 2)],
    ['Inversión adicional de planilla', soles(R.inversion, 2)],
    [`Ventas recuperadas (${Math.round(100 * N.recuperacion)} %)`, soles(R.recuperado, 2)],
    ['Beneficio neto anual', soles(R.beneficio, 2), 'total'],
    ['Retorno de la inversión (ROI)', `${numero(R.roi, 2)} %`, 'total'],
  ];
  $('tablaRoi').innerHTML = `<tbody>${filas.map(([a, b, c = '']) => `<tr class="${c}"><td>${a}</td><td class="cifra">${b}</td></tr>`).join('')}</tbody>`;
}

/* ---------- 4. Un día: quién atiende ---------- */

$('presets').innerHTML = Object.entries(S.PLANES)
  .map(([k, v]) => `<button type="button" data-preset="${k}">${k === 'actual' ? 'Hoy: 3 fijos' : v.nombre}</button>`).join('');
$('presets').addEventListener('click', (e) => {
  const k = e.target.dataset.preset;
  if (!k) return;
  estado.plan = { ...S.PLANES[k].plan };
  estado.preset = k;
  cambioPlan();
});
function cambioPlan() {
  document.querySelectorAll('#presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === estado.preset));
  $('costoMes').textContent = soles(S.costoMensual(estado.plan), 2);
  const n = totalPersonas(estado.plan);
  $('totalPersonas').textContent = `${n} despachador${n === 1 ? '' : 'es'}`;
  nuevoDia();
}

/* ---------- Gráficos ---------- */

const graficos = {};
const graficosVisibles = new Set();                       // los gráficos se crean al llegar a su sección, para que se animen a la vista
const FUENTE = 'Barlow, system-ui, sans-serif';
function opcionesBase(titulo, extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false, animation: reducirMovimiento ? false : { duration: 900, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: true, text: titulo, align: 'start', color: C.tinta, font: { family: FUENTE, size: 14, weight: '600' } },
      legend: { align: 'start', labels: { color: C['tinta-2'], boxWidth: 10, boxHeight: 10, font: { family: FUENTE } } },
      tooltip: { titleFont: { family: FUENTE }, bodyFont: { family: FUENTE } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: C['tinta-2'], font: { family: FUENTE } }, border: { color: C.linea } },
      y: { beginAtZero: true, grid: { color: C.linea }, ticks: { color: C['tinta-2'], font: { family: FUENTE } }, border: { display: false } },
    },
    ...extra,
  };
}
const etiquetasHora = S.HORAS.map((h) => horaTexto(h));
const barra = (label, color, data = []) => ({ label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'bottom', barPercentage: 0.9, categoryPercentage: 0.75 });

const CREAR = {
  rho: () => {
    const rho = N.rho, op = opcionesBase('Utilización actual por hora (ρ): en rojo, las horas en que la cola crece sin límite');
    op.plugins.legend.display = false;
    op.onClick = (_, el) => { if (el.length) { detenerRecorrido(); elegirHora(el[0].index); } };
    graficos.rho = new Chart($('gRho'), {
      data: {
        labels: etiquetasHora,
        datasets: [
          { type: 'bar', ...barra('ρ por hora', rho.map((r) => (r >= 1 ? C.rojo : r > 0.85 ? C.seguridad : C.acero)), rho),
            borderColor: C.tinta, borderWidth: S.HORAS.map((_, k) => (k === horaElegida ? 3 : 0)) },
          { type: 'line', label: 'Objetivo ρ = 0.85', data: rho.map(() => 0.85), borderColor: C.tinta, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0 },
          { type: 'line', label: 'ρ = 1', data: rho.map(() => 1), borderColor: C.rojo, borderWidth: 1.5, pointRadius: 0 },
        ],
      },
      options: op,
    });
  },
  cobertura: () => {
    const cob = opcionesBase('Despachadores por hora: mínimo requerido y asignados por el MILP');
    cob.scales.y.ticks.stepSize = 1;
    graficos.cobertura = new Chart($('gCobertura'), {
      type: 'bar',
      data: { labels: etiquetasHora, datasets: [barra('Mín. requerido (ρ ≤ 0.85)', C['serie-actual'], requerido), barra('Asignado por el MILP', C['serie-plan'], asignado)] },
      options: cob,
    });
  },
};

function crearGraficos() {
  if (!window.Chart) return;
  Object.values(graficos).forEach((g) => g.destroy());
  graficosVisibles.forEach((k) => CREAR[k]());

  const opDia = opcionesBase('Pedidos en cola durante el día');
  opDia.animation = false;
  opDia.scales.x = { ...opDia.scales.x, type: 'linear', min: 0, max: 660, ticks: { ...opDia.scales.x.ticks, stepSize: 60, callback: (v) => reloj(v).slice(0, 2) + 'h' } };
  opDia.scales.y.ticks.precision = 0;
  opDia.plugins.tooltip.callbacks = { title: (it) => reloj(it[0].parsed.x) };
  graficos.dia = new Chart($('gDia'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Pedidos en cola', data: [], borderColor: C['carton-borde'], backgroundColor: C.carton, borderWidth: 2, pointRadius: 0 },
        { label: 'Despachadores en turno', data: [], borderColor: C.acero, borderWidth: 2, pointRadius: 0, stepped: true },
      ],
    },
    options: { ...opDia, parsing: false },
  });
  if (dia) {
    graficos.dia.options.scales.x.max = Math.max(660, Math.ceil(dia.fin / 60) * 60);
    graficos.dia.data.datasets.forEach((ds, i) => { ds.data = i ? dia.serie.turno : dia.serie.cola; });
    graficos.dia.update();
  }
}

/* ---------- Aparición por pasos ---------- */

// Cada sección se anima la primera vez que entra en pantalla
const alVer = {
  diagnostico: () => { graficosVisibles.add('rho'); if (window.Chart) CREAR.rho(); elegirHora(horaElegida); },
  plan: () => { graficosVisibles.add('cobertura'); if (window.Chart) CREAR.cobertura(); pintarGantt('milp'); },
  roi: animarCascada,
  dia: () => { if (!reducirMovimiento && dia.log.length && dia.t === 0) ponerReproduccion(true); },
};
const vistos = new Set();
const observador = new IntersectionObserver((entradas) => entradas.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('visible');
  const id = e.target.id;
  if (alVer[id] && !vistos.has(id)) { vistos.add(id); alVer[id](); }
}), { threshold: 0.15 });
document.querySelectorAll('.revelar').forEach((s) => observador.observe(s));

// Paso actual en la barra superior
const enlaces = [...document.querySelectorAll('.pasos a')];
const espia = new IntersectionObserver((entradas) => entradas.forEach((e) => {
  if (e.isIntersecting) enlaces.forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#${e.target.id}`));
}), { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('.paso-seccion').forEach((s) => espia.observe(s));

/* ---------- Animación de un día ---------- */

const CAJA = 24, CARGA_VIAJE = 6, CAJA_CHICA = 18;
const lienzo = $('lienzo'), ctx = lienzo.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const pantallaChica = matchMedia('(max-width: 700px)');

// Dos composiciones del mismo almacén. En pantalla ancha: cola → despachadores → andén, de izquierda a derecha.
// En pantalla chica el lienzo se apila en vertical para que el texto siga legible al reducirlo al ancho del teléfono.
const GEOMETRIAS = {
  ancho: {
    W: 960, H: 430,
    reloj: { x: 18, y: 16, w: 132, h: 60, fuente: 44, textoX: 166, y1: 36, y2: 58, texto: 15 },
    cola: { frenteX: 520, paso: 34, porFila: 14, filasY: [0, 40, -40, 80, -80], y0: 190, xMin: 28, xMax: 548 },
    est: { x: 590, y: 40, w: 170, h: 345, cols: 1, sep: 0, altoMax: 46 },
    franjas: [[566, 0, 8, 430], [784, 0, 8, 430]],
    camion: { x: 812, y0: 62, paso: 110, esc: 1, enFila: false, dir: [1, 0], clip: [792, 0, 168, 430], texto: 13 },
    etiquetas: [['Cola de pedidos', 20, 416], ['Despachadores', 590, 416], ['Andén de carga', 812, 416]],
    losas: true, flecha: 202, texto: 13,
  },
  angosto: {
    W: 420, H: 560,
    reloj: { x: 12, y: 10, w: 112, h: 50, fuente: 36, textoX: 138, y1: 26, y2: 46, texto: 13 },
    cola: { frenteX: 376, paso: 36, porFila: 9, filasY: [0, 40, 80], y0: 96, xMin: 32, xMax: 408 },
    est: { x: 12, y: 262, w: 396, h: 150, cols: 2, sep: 10, altoMax: 40 },
    franjas: [[0, 222, 420, 8], [0, 424, 420, 8]],
    camion: { x: 12, y0: 490, paso: 102, esc: 0.62, enFila: true, dir: [0, 1], clip: [0, 434, 420, 126], texto: 12 },
    etiquetas: [['Cola de pedidos', 12, 80], ['Despachadores', 12, 250], ['Andén de carga', 12, 456]],
    losas: false, flecha: 108, texto: 13,
  },
};
let G = GEOMETRIAS.ancho;

function configurarLienzo() {
  G = pantallaChica.matches ? GEOMETRIAS.angosto : GEOMETRIAS.ancho;
  lienzo.width = G.W * dpr; lienzo.height = G.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
configurarLienzo();

const capacidadCola = () => G.cola.porFila * G.cola.filasY.length;
// Cada fila de la cola es una cinta que avanza hacia los despachadores; el primero en llegar queda junto a ellos
const posCola = (i) => {
  const c = G.cola, n = Math.min(i, capacidadCola() - 1);
  return [c.frenteX - (n % c.porFila) * c.paso, c.y0 + c.filasY[Math.floor(n / c.porFila)]];
};
const tarjeta = (k) => {
  const e = G.est, filas = Math.ceil(dia.cap / e.cols), alto = Math.min(e.altoMax, e.h / filas);
  const w = (e.w - (e.cols - 1) * e.sep) / e.cols;
  return { x: e.x + (k % e.cols) * (w + e.sep), y: e.y + Math.floor(k / e.cols) * alto, w, alto };
};
const posEstacion = (k) => {
  const t = tarjeta(k);
  return [t.x + t.w - CAJA - 10, t.y + (t.alto - 6 - CAJA) / 2];
};
// Cada camión lleva 6 cajas por viaje (3 × 2 en la tolva): al llenarse sale, se vacía y vuelve.
// Es solo visual: la pérdida de ruta del modelo depende de la espera máxima T, no de estos viajes.
const baseCamion = (k) => { const c = G.camion; return c.enFila ? [c.x + k * c.paso, c.y0] : [c.x, c.y0 + k * c.paso]; };
const origenCamion = (k) => {
  const [x, y] = baseCamion(k), d = dia.flota[k].d, [ux, uy] = G.camion.dir;
  return [x + ux * d, y + uy * d];
};
const posCarga = (k, i) => {
  const [ox, oy] = origenCamion(k), e = G.camion.esc;
  return [ox + e * (12 + (i % 3) * 28), oy + e * (18 + Math.floor(i / 3) * 22)];
};

let dia = null, semillaDia = 1, reproduciendo = false, velocidad = 15, ultimoMs = null;

function nuevoDia() {
  const seguia = reproduciendo;
  const rng = S.crearRng(104729 * semillaDia + 17);
  const presentes = S.presentesDelDia(estado.plan, estado.aus / 100, rng);
  const personal = S.personalPorHora(presentes);
  const log = [];
  if (totalPersonas(estado.plan)) {
    S.simularDia(personal, S.LAMBDA.map((l) => l * (1 + estado.crec / 100)), estado.T, estado.p, rng, log);
  }
  dia = {
    log, i: 0, t: 0, fin: log.length ? log[log.length - 1].t : 0, cap: Math.max(1, ...personal),
    pedidos: new Map(), cola: [], estaciones: Array.from({ length: Math.max(1, ...personal) }, () => ({ activa: true, pedido: null })),
    flota: [0, 1, 2].map(() => ({ carga: 0, enCamino: 0, d: 0, fase: 'anden', viajes: 0 })), faltaron: totalPersonas(estado.plan) - totalPersonas(presentes),
    cont: { llegados: 0, despachados: 0, perdieron: 0, cancelados: 0, espera: 0, nEspera: 0 },
    serie: { cola: [], turno: [] }, minuto: -1, servicios: log.filter((e) => e.tipo === 'inicio'),
  };
  avanzar(0);
  $('leyendaT').textContent = estado.T;
  ponerReproduccion(seguia && log.length > 0);
  if (graficos.dia) {
    graficos.dia.options.scales.x.max = Math.max(660, Math.ceil(dia.fin / 60) * 60);
    graficos.dia.data.datasets[0].data = dia.serie.cola;
    graficos.dia.data.datasets[1].data = dia.serie.turno;
    graficos.dia.update();
  }
  pintarContadores();
}

function aplicar(ev) {
  const d = dia, p = d.pedidos.get(ev.id);
  const sacarDeCola = () => d.cola.splice(d.cola.indexOf(ev.id), 1);
  if (ev.tipo === 'llegada') {
    const [, y] = posCola(d.cola.length);
    d.pedidos.set(ev.id, { llegada: ev.t, x: -CAJA, y, estado: 'cola', perdio: false, alfa: 1 });
    d.cola.push(ev.id);
    d.cont.llegados++;
  } else if (ev.tipo === 'perdio') {
    p.perdio = true; d.cont.perdieron++;
  } else if (ev.tipo === 'cancela') {
    sacarDeCola();
    Object.assign(p, { estado: 'cancelado', ty: p.y - 46 });
    d.cont.cancelados++; d.cont.espera += ev.t - p.llegada; d.cont.nEspera++;
  } else if (ev.tipo === 'inicio') {
    sacarDeCola();
    Object.assign(p, { estado: 'servicio', est: ev.est, inicio: ev.t, dur: ev.dur });
    d.estaciones[ev.est].pedido = ev.id;
    d.cont.espera += ev.t - p.llegada; d.cont.nEspera++;
  } else if (ev.tipo === 'fin') {
    // Se llena un camión a la vez: el del andén con más carga que todavía tiene espacio
    const ocupado = (k) => d.flota[k].carga + d.flota[k].enCamino;
    const conEspacio = [0, 1, 2].filter((k) => d.flota[k].fase === 'anden' && ocupado(k) < CARGA_VIAJE);
    const k = conEspacio.length
      ? conEspacio.reduce((a, b) => (ocupado(b) > ocupado(a) ? b : a))
      : [0, 1, 2].reduce((a, b) => (ocupado(b) < ocupado(a) ? b : a));
    Object.assign(p, { estado: 'listo', camion: k, desde: [p.x, p.y], prog: 0, slot: Math.min(CARGA_VIAJE - 1, d.flota[k].carga + d.flota[k].enCamino) });
    d.flota[k].enCamino++;
    d.estaciones[ev.est].pedido = null;
    d.cont.despachados++;
  } else if (ev.tipo === 'sale') {
    d.estaciones[ev.est].activa = false;
  } else if (ev.tipo === 'turno') {
    ev.activas.forEach((a, k) => { d.estaciones[k].activa = a; });
  }
}

function avanzar(hasta) {
  while (dia.i < dia.log.length && dia.log[dia.i].t <= hasta) aplicar(dia.log[dia.i++]);
  const minuto = Math.floor(hasta);
  if (minuto > dia.minuto) {
    dia.minuto = minuto;
    dia.serie.cola.push({ x: hasta, y: dia.cola.length });
    dia.serie.turno.push({ x: hasta, y: dia.estaciones.filter((e) => e.activa).length });
  }
}

function mover(dt) {
  // Seguimiento exponencial (sin rebote): la caja se mueve hacia su lugar y frena al llegar.
  // Con movimiento reducido salta directo a su lugar y solo se desvanece.
  const k = reducirMovimiento ? 1 : 1 - Math.exp(-dt * 9);
  dia.cola.forEach((id, i) => { const p = dia.pedidos.get(id); [p.tx, p.ty] = posCola(i); });
  for (const [id, p] of dia.pedidos) {
    if (p.estado === 'listo') {
      // Del puesto al camión en un arco (curva cuadrática) con salida rápida y llegada suave
      p.prog = reducirMovimiento ? 1 : Math.min(1, p.prog + dt / 0.65);
      const e = 1 - (1 - p.prog) ** 3;
      const [x0, y0] = p.desde, [x1, y1] = posCarga(p.camion, p.slot);
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 70;
      p.x = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e ** 2 * x1;
      p.y = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e ** 2 * y1;
      p.escala = 1 - e * (1 - (CAJA_CHICA * G.camion.esc) / CAJA);
      if (p.prog >= 1) {
        const c = dia.flota[p.camion];
        c.enCamino--; c.carga++;
        dia.pedidos.delete(id);
      }
      continue;
    }
    if (p.estado === 'servicio') [p.tx, p.ty] = posEstacion(p.est);
    if (p.estado === 'cancelado') p.tx = p.x;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    if (p.estado === 'cancelado') p.alfa -= dt * 1.6;
    if (p.alfa <= 0) dia.pedidos.delete(id);
  }
  moverCamiones(dt);
}

// El camión lleno arranca (acelera), se vacía fuera de la vista y vuelve frenando al andén
function moverCamiones(dt) {
  for (const c of dia.flota) {
    if (c.fase === 'anden' && c.carga >= CARGA_VIAJE && c.enCamino === 0) {
      c.fase = 'saliendo'; c.vel = 0; c.viajes++;
    }
    if (reducirMovimiento && c.fase !== 'anden') { c.fase = 'anden'; c.d = 0; c.carga = Math.max(0, c.carga - CARGA_VIAJE); continue; }
    if (c.fase === 'saliendo') {
      c.vel += 900 * dt; c.d += c.vel * dt;
      if (c.d > 200) { c.fase = 'volviendo'; c.carga = Math.max(0, c.carga - CARGA_VIAJE); }   // lo que sobró espera el próximo viaje
    } else if (c.fase === 'volviendo') {
      c.d *= Math.exp(-dt * 5);
      if (c.d < 0.5) { c.d = 0; c.fase = 'anden'; }
    }
  }
}

function rect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cajaDibujo(x, y, lado, perdio) {
  rect(x, y, lado, lado, 3);
  ctx.fillStyle = C.carton; ctx.fill();
  ctx.lineWidth = perdio ? 2.5 : 1;
  ctx.strokeStyle = perdio ? C.rojo : C['carton-borde']; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';               // cinta de embalaje
  ctx.fillRect(x + lado / 2 - lado * 0.1, y + 1, lado * 0.2, lado - 2);
}

function dibujarCaja(p) {
  ctx.globalAlpha = Math.max(0, p.alfa);
  cajaDibujo(p.x, p.y, CAJA * (p.escala || 1), p.perdio);
  if (p.estado === 'cola') {                               // mecha: cuánto de la espera máxima lleva
    const f = Math.min(1, (dia.t - p.llegada) / estado.T);
    ctx.fillStyle = C.linea; ctx.fillRect(p.x, p.y + CAJA + 3, CAJA, 3);
    ctx.fillStyle = f >= 1 ? C.rojo : C.seguridad; ctx.fillRect(p.x, p.y + CAJA + 3, CAJA * f, 3);
  }
  if (p.estado === 'cancelado') {
    ctx.strokeStyle = C.rojo; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + 4, p.y + 4); ctx.lineTo(p.x + CAJA - 4, p.y + CAJA - 4);
    ctx.moveTo(p.x + CAJA - 4, p.y + 4); ctx.lineTo(p.x + 4, p.y + CAJA - 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function franjaSeguridad(x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = C.tinta; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.seguridad; ctx.lineWidth = 5;
  for (let i = -w - h; i < h + w; i += 14) {
    ctx.beginPath(); ctx.moveTo(x - 5, y + i); ctx.lineTo(x + w + 5, y + i + w + 10); ctx.stroke();
  }
  ctx.restore();
}

function dibujarCintas() {
  const c = G.cola, filas = Math.max(1, Math.min(c.filasY.length, Math.ceil(dia.cola.length / c.porFila)));
  for (let j = 0; j < filas; j++) {
    const y = c.y0 + c.filasY[j] - 6;
    ctx.globalAlpha = 0.5; rect(c.xMin, y, c.xMax - c.xMin, 38, 6); ctx.fillStyle = C.control; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = C.control; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = c.xMin + 20; x < c.xMax - 12; x += 62) { ctx.moveTo(x, y + 13); ctx.lineTo(x + 6, y + 19); ctx.lineTo(x, y + 25); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function dibujarCamion(k) {
  const [ox, oy] = origenCamion(k), e = G.camion.esc, c = dia.flota[k];
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(e, e);
  rect(0, 0, 104, 64, 4); ctx.fillStyle = C.fondo; ctx.fill();
  ctx.strokeStyle = C.linea; ctx.lineWidth = 1.5; ctx.stroke();
  rect(108, 18, 34, 46, 5); ctx.fillStyle = C.acero; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.fillRect(124, 24, 14, 14);
  ctx.fillStyle = C.tinta;
  for (const xr of [18, 84, 126]) { ctx.beginPath(); ctx.arc(xr, 68, 7, 0, 2 * Math.PI); ctx.fill(); }
  if (c.fase !== 'volviendo') {
    for (let i = 0; i < Math.min(c.carga, CARGA_VIAJE); i++) cajaDibujo(12 + (i % 3) * 28, 18 + Math.floor(i / 3) * 22, CAJA_CHICA, false);
  }
  ctx.restore();
}

function dibujar() {
  ctx.clearRect(0, 0, G.W, G.H);
  ctx.fillStyle = C.suelo; ctx.fillRect(0, 0, G.W, G.H);
  if (G.losas) {                                           // juntas de las losas del piso de concreto
    ctx.strokeStyle = C.linea; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 140; x < 566; x += 140) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, G.H); }
    for (let y = 140; y < G.H; y += 140) { ctx.moveTo(0, y + 0.5); ctx.lineTo(566, y + 0.5); }
    ctx.stroke();
  }
  dibujarCintas();
  // Entrada de pedidos: flecha pintada en el piso
  ctx.fillStyle = C.seguridad; ctx.beginPath();
  ctx.moveTo(4, G.flecha - 12); ctx.lineTo(22, G.flecha); ctx.lineTo(4, G.flecha + 12); ctx.closePath(); ctx.fill();
  G.franjas.forEach((f) => franjaSeguridad(...f));

  ctx.font = `500 ${G.texto}px Barlow, sans-serif`; ctx.fillStyle = C['tinta-2']; ctx.textBaseline = 'alphabetic';
  G.etiquetas.forEach(([texto, x, y]) => ctx.fillText(texto, x, y));

  // Reloj de pared
  const r = G.reloj;
  rect(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.tinta; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.font = `700 ${r.fuente}px "Barlow Condensed", sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText(reloj(dia.t), r.x + 12, r.y + r.h / 2 + 1);
  const h = Math.min(9, Math.floor(dia.t / 60));
  ctx.fillStyle = C.tinta; ctx.font = `500 ${r.texto}px Barlow, sans-serif`;
  ctx.fillText(dia.t >= 600 ? 'Horas extra: se despacha lo pendiente' : `Llegan ~${(S.LAMBDA[h] * (1 + estado.crec / 100)).toFixed(1)} pedidos por hora`, r.textoX, r.y1);
  ctx.fillStyle = C['tinta-2'];
  ctx.fillText(`${dia.cola.length} en cola` + (dia.cola.length > capacidadCola() ? ' (no todos se ven)' : ''), r.textoX, r.y2);

  // Despachadores
  dia.estaciones.forEach((e, k) => {
    const t = tarjeta(k), ah = t.alto;
    rect(t.x, t.y, t.w, ah - 6, 4);
    ctx.fillStyle = e.activa ? C.fondo : C.suelo; ctx.fill();
    // Puesto vacío: contorno punteado, como una marca en el piso
    ctx.setLineDash(e.activa ? [] : [4, 3]);
    ctx.strokeStyle = e.activa ? C.linea : C.control; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    const cy = t.y + (ah - 6) / 2, rd = Math.min(8, (ah - 10) / 2);
    ctx.beginPath(); ctx.arc(t.x + 14, cy, rd, 0, 2 * Math.PI);
    ctx.fillStyle = e.activa ? C.acero : C.linea; ctx.fill();
    ctx.fillStyle = e.activa ? C.tinta : C['tinta-2']; ctx.font = `500 ${Math.max(9, Math.min(14, ah - 10))}px Barlow, sans-serif`;
    ctx.fillText(e.activa ? `D${k + 1}` : (G.est.cols > 1 ? `D${k + 1} fuera` : `D${k + 1} fuera de turno`), t.x + 28, cy);
    if (e.pedido !== null) {
      // Anillo de progreso alrededor de la caja que se está despachando
      const p = dia.pedidos.get(e.pedido);
      const f = Math.min(1, (dia.t - p.inicio) / p.dur);
      const [bx, by] = posEstacion(k), rc = Math.min(CAJA / 2 + 5, ah / 2 - 2);
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.strokeStyle = C.linea; ctx.beginPath(); ctx.arc(bx + CAJA / 2, by + CAJA / 2, rc, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = C.acero; ctx.beginPath();
      ctx.arc(bx + CAJA / 2, by + CAJA / 2, rc, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * f); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  });

  // Camiones: se llenan de a 6 cajas, salen y vuelven
  ctx.save();
  ctx.beginPath(); ctx.rect(...G.camion.clip); ctx.clip();
  [0, 1, 2].forEach(dibujarCamion);
  ctx.restore();
  ctx.fillStyle = C['tinta-2']; ctx.font = `500 ${G.camion.texto}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
  dia.flota.forEach((c, k) => {
    const texto = c.fase === 'anden' ? `Camión ${k + 1}: ${Math.min(c.carga, CARGA_VIAJE)} de ${CARGA_VIAJE}` : `Camión ${k + 1}: en ruta`;
    const [bx, by] = baseCamion(k);
    ctx.fillText(texto, bx, by - 8);
  });

  for (const p of dia.pedidos.values()) dibujarCaja(p);
}

function pintarContadores() {
  const c = dia.cont;
  // Minutos-persona trabajados después de las 18:00 hasta el momento actual de la animación
  const extra = dia.servicios.reduce((s, e) => s + Math.max(0, Math.min(dia.t, e.t + e.dur) - Math.max(e.t, S.CIERRE)), 0);
  const datos = [
    // La hora y el personal en turno ya se ven en el reloj y en los puestos del almacén
    ['En cola', dia.cola.length],
    ['Pedidos que llegaron', c.llegados],
    ['Despachados', c.despachados],
    ['Perdieron su ruta', c.perdieron, c.perdieron > 0],
    ['Cancelados', c.cancelados, c.cancelados > 0],
    ['Venta perdida hoy', soles(c.cancelados * S.TICKET), c.cancelados > 0],
    ['Espera promedio', c.nEspera ? `${(c.espera / c.nEspera).toFixed(1)} min` : '–'],
    ['Horas extra hoy', `${Math.round(extra)} min <span class="ic">S/ ${((extra / 60) * estado.hx).toFixed(2)}</span>`],
  ];
  $('contadores').innerHTML = datos.map(([dt, dd, malo]) => `<div class="${malo ? 'malo' : ''}"><dt>${dt}</dt><dd>${dd}</dd></div>`).join('');
}

function ponerReproduccion(si) {
  reproduciendo = si;
  $('play').textContent = si ? 'Pausar' : (dia.t > 0 && !terminado() ? 'Continuar' : 'Reproducir');
  const faltas = dia.faltaron ? ` Hoy faltaron ${dia.faltaron} despachador${dia.faltaron > 1 ? 'es' : ''}.` : '';
  $('estadoDia').textContent = !dia.log.length ? 'Sin despachadores no hay día que simular.'
    : terminado() ? `Día terminado a las ${reloj(dia.fin)}.${faltas}` : `Día ${semillaDia}.${faltas}`;
}
const terminado = () => dia.i >= dia.log.length && dia.t >= dia.fin;

$('play').addEventListener('click', () => {
  if (!dia.log.length) return;
  if (terminado()) nuevoDia();
  ponerReproduccion(!reproduciendo);
});
$('reiniciar').addEventListener('click', () => nuevoDia());
$('otroDia').addEventListener('click', () => { semillaDia++; nuevoDia(); ponerReproduccion(true); });
$('velocidad').addEventListener('change', (e) => { velocidad = Number(e.target.value); });
pantallaChica.addEventListener('change', () => { configurarLienzo(); nuevoDia(); });

// Una frase que cuenta en palabras lo que se ve en el almacén
function narrar() {
  if (!dia.log.length) return 'Agrega al menos un despachador para ver el día.';
  if (terminado()) return `Terminó el día: se despacharon ${dia.cont.despachados} pedidos y se cancelaron ${dia.cont.cancelados}.`;
  if (dia.t === 0) return 'Pulsa Reproducir: los pedidos entran por la flecha amarilla de la izquierda.';
  if (dia.t >= S.CIERRE) return 'Cerró el almacén (18:00): lo que queda en cola se despacha con horas extra.';
  const enCola = dia.cola.length;
  const sinCamion = dia.cola.filter((id) => dia.pedidos.get(id).perdio).length;
  const libres = dia.estaciones.filter((e) => e.activa && e.pedido === null).length;
  if (!enCola) return libres ? `Todo al día: hay ${libres} despachador${libres > 1 ? 'es' : ''} libre${libres > 1 ? 's' : ''} esperando pedidos.` : 'Todos los despachadores están ocupados, pero todavía no hay cola.';
  if (sinCamion) return `Hay cola: ${enCola} pedido${enCola > 1 ? 's' : ''} esperando y ${sinCamion} ya perdi${sinCamion > 1 ? 'eron' : 'ó'} su camión (borde rojo).`;
  return `Se forma cola: ${enCola} pedido${enCola > 1 ? 's' : ''} esperando porque no hay despachadores libres.`;
}

let ultimoGrafico = 0;
function cuadro(ms) {
  const dt = ultimoMs === null ? 0 : Math.min(0.1, (ms - ultimoMs) / 1000);
  ultimoMs = ms;
  if (reproduciendo) {
    dia.t = Math.min(dia.fin, dia.t + dt * velocidad);
    avanzar(dia.t);
    if (terminado()) ponerReproduccion(false);
    pintarContadores();
    if (graficos.dia && ms - ultimoGrafico > 150) { graficos.dia.update(); ultimoGrafico = ms; }
  }
  mover(dt);
  dibujar();
  const frase = narrar();
  if ($('narracion').textContent !== frase) $('narracion').textContent = frase;
  requestAnimationFrame(cuadro);
}

/* ---------- Inicio ---------- */

leerColores();
pintarBotonTema();
pintarPortada();
pintarTablas();
pintarCascada();
crearGraficos();
cambioPlan();
if (!window.Chart) {
  document.querySelectorAll('.grafico').forEach((g) => { g.innerHTML = '<p>No se pudo cargar Chart.js (vendor/chart.umd.js).</p>'; g.style.height = 'auto'; });
}
document.fonts.ready.then(crearGraficos);   // redibuja los gráficos con la tipografía ya cargada
requestAnimationFrame(cuadro);
