// Interfaz: controles, animación del almacén (canvas) y gráficos (Chart.js).
const S = Simulacion;
const $ = (id) => document.getElementById(id);

const INICIAL = { crec: 0, aus: 0, q: 0, margen: 100, hx: Number(S.COSTO_HORA_EXTRA.toFixed(2)) };
const estado = { plan: { ...S.PLANES.rho85.plan }, preset: 'rho85', ...INICIAL };
// q = reducción de los quiebres de stock respecto de 2025 (0 % = como hoy)
const escenario = () => ({ crecimiento: estado.crec / 100, ausentismo: estado.aus / 100, qQuiebre: 1 - estado.q / 100,
  margen: estado.margen / 100, costoHoraExtra: estado.hx });
const totalPersonas = (plan) => Object.values(plan).reduce((a, b) => a + b, 0);

const soles = (v) => (v < 0 ? '−S/ ' : 'S/ ') + Math.abs(Math.round(v)).toLocaleString('es-PE');
const reloj = (min) => {
  const m = Math.floor(min) + 8 * 60;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

let C = {};
function leerColores() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['fondo', 'panel', 'suelo', 'tinta', 'tinta-2', 'linea', 'seguridad', 'carton', 'carton-borde',
    'acero', 'rojo', 'verde', 'serie-plan', 'serie-actual', 'control']) C[k] = cs.getPropertyValue('--' + k).trim();
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

/* ---------- Controles ---------- */

// El horario del turno dibujado: una celda por hora de 8 a 18; el hueco del medio es el almuerzo
function tiraTurno(horas) {
  const primera = Math.min(...horas), ultima = Math.max(...horas);
  const celdas = S.HORAS.map((h) => {
    const clase = horas.includes(h) ? 'on' : h > primera && h < ultima ? 'alm' : '';
    return `<i class="${clase}"></i>`;
  }).join('');
  return `<span class="tira" aria-hidden="true">${celdas}</span>`;
}

$('presets').innerHTML = Object.entries(S.PLANES)
  .map(([k, v]) => `<button type="button" data-preset="${k}">${v.nombre}</button>`).join('');
$('turnos').innerHTML = Object.entries(S.TURNOS).map(([t, d]) => `
  ${t === 'Fijo' ? '<tr class="separador"><td colspan="2">Situación actual</td></tr>' : ''}
  <tr><td><span class="nombre">${t}</span>${tiraTurno(d.horas)}<span class="horario">${d.horario}</span></td>
  <td><div class="paso">
    <button type="button" data-t="${t}" data-d="-1" aria-label="Quitar un despachador ${t}">−</button>
    <output data-t="${t}" aria-live="polite"></output>
    <button type="button" data-t="${t}" data-d="1" aria-label="Agregar un despachador ${t}">+</button>
  </div></td></tr>`).join('');

$('presets').addEventListener('click', (e) => {
  const k = e.target.dataset.preset;
  if (!k) return;
  estado.plan = { ...S.PLANES[k].plan };
  cambioPlan();
});
$('turnos').addEventListener('click', (e) => {
  const { t, d } = e.target.dataset;
  if (!t || !d) return;
  const n = Math.max(0, Math.min(15, (estado.plan[t] || 0) + Number(d)));
  if (n) estado.plan[t] = n; else delete estado.plan[t];
  cambioPlan();
});

const mismoPlan = (a, b) => Object.keys(S.TURNOS).every((t) => (a[t] || 0) === (b[t] || 0));

function cambioPlan() {
  estado.preset = Object.keys(S.PLANES).find((k) => mismoPlan(S.PLANES[k].plan, estado.plan)) || null;
  document.querySelectorAll('#presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === estado.preset));
  document.querySelectorAll('#turnos output').forEach((o) => { o.textContent = estado.plan[o.dataset.t] || 0; });
  $('planElegido').innerHTML = `Plan: <strong>${estado.preset ? S.PLANES[estado.preset].nombre : 'Personalizado'}</strong>`;
  $('costoMes').textContent = soles(S.costoMensual(estado.plan));
  const n = totalPersonas(estado.plan);
  $('totalPersonas').textContent = `${n} despachador${n === 1 ? '' : 'es'}`;
  const pt = Object.entries(estado.plan).reduce((s, [t, c]) => s + (S.TURNOS[t].parcial ? c : 0), 0);
  $('avisoPT').hidden = pt <= 0.4 * n;
  actualizarCobertura();
  nuevoDia();
  programarAnio();
}

// [formato, ¿cambia la simulación del día?]. Margen y hora extra solo cambian la valoración.
const quiebreHoy = 100 * S.P_QUIEBRE;
const deslizadores = {
  crec: [(v) => `+${v} %`, true], aus: [(v) => `${v} %`, true],
  q: [(v) => (v === 0 ? `como hoy (${quiebreHoy.toFixed(1)} %)` : `−${v} % (${(quiebreHoy * (1 - v / 100)).toFixed(1)} %)`), true],
  margen: [(v) => `${v} %`, false], hx: [(v) => `S/ ${Number(v).toFixed(2)}`, false],
};
for (const [id, [fmt, cambiaDia]] of Object.entries(deslizadores)) {
  $(id).addEventListener('input', () => {
    estado[id] = Number($(id).value);
    $('v' + id.charAt(0).toUpperCase() + id.slice(1)).textContent = fmt(estado[id]);
    if (cambiaDia) { actualizarCobertura(); nuevoDia(); }
    programarAnio();
  });
}
$('restaurar').addEventListener('click', () => {
  Object.assign(estado, INICIAL);
  sincronizarDeslizadores();
  actualizarCobertura();
  nuevoDia();
  programarAnio();
});
function sincronizarDeslizadores() {
  for (const [id, [fmt]] of Object.entries(deslizadores)) {
    $(id).value = estado[id];
    $('v' + id.charAt(0).toUpperCase() + id.slice(1)).textContent = fmt(estado[id]);
  }
}

/* ---------- Gráficos ---------- */

const graficos = {};
let resultados = null;
let base = null;                       // situación actual simulada sin estrés, para compararla con 2025

const FUENTE = 'Barlow, system-ui, sans-serif';
function opcionesBase(titulo, extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
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
const etiquetasHora = S.HORAS.map((h) => `${h}h`);
const barra = (label, color, data = []) => ({ label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'bottom', barPercentage: 0.9, categoryPercentage: 0.75 });
const rhoActual = S.LAMBDA.map((l) => l / (S.PLANES.actual.plan.Fijo * S.MU_H));

function crearGraficos() {
  if (!window.Chart) return;
  Object.values(graficos).forEach((g) => g.destroy());

  const cob = opcionesBase('Despachadores por hora');
  cob.scales.y.ticks.stepSize = 1;
  cob.scales.x.ticks.maxRotation = 0;
  graficos.cobertura = new Chart($('gCobertura'), {
    data: {
      labels: etiquetasHora,
      datasets: [
        { type: 'bar', ...barra('En turno', C.acero) },
        { type: 'line', label: 'Mínimo con ρ ≤ 0.85', data: [], borderColor: C.tinta, borderWidth: 2, borderDash: [4, 3], stepped: 'middle', pointRadius: 0 },
      ],
    },
    options: cob,
  });

  const opDia = opcionesBase('Pedidos en cola durante el día');
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

  graficos.espera = new Chart($('gEspera'), {
    type: 'bar',
    data: { labels: etiquetasHora, datasets: [barra('Plan elegido', C['serie-plan']), barra('Situación actual', C['serie-actual'])] },
    options: opcionesBase('Espera media por hora de llegada (min)'),
  });
  graficos.perdida = new Chart($('gPerdida'), {
    type: 'bar',
    data: { labels: etiquetasHora, datasets: [barra('Plan elegido', C['serie-plan']), barra('Situación actual', C['serie-actual'])] },
    options: opcionesBase('Pedidos que pierden su camión por hora de llegada (%)'),
  });

  // Punto de partida: utilización de los 3 despachadores actuales, ajuste del modelo a 2025 y causas de la venta perdida
  const opRho = opcionesBase('Utilización actual por hora (ρ)');
  opRho.plugins.legend.display = false;
  graficos.rho = new Chart($('gRho'), {
    data: {
      labels: etiquetasHora,
      datasets: [
        { type: 'bar', ...barra('ρ con 3 despachadores', rhoActual.map((r) => (r >= 1 ? C.rojo : r > 0.85 ? C.seguridad : C.acero)), rhoActual) },
        { type: 'line', label: 'Objetivo ρ = 0.85', data: rhoActual.map(() => 0.85), borderColor: C.tinta, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0 },
        { type: 'line', label: 'ρ = 1: la cola crece sin límite', data: rhoActual.map(() => 1), borderColor: C.rojo, borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: opRho,
  });
  graficos.valEspera = new Chart($('gValEspera'), {
    type: 'bar',
    data: { labels: etiquetasHora, datasets: [barra('Datos 2025', C.carton, S.HIST_ESPERA), barra('Simulado', C['serie-actual'])] },
    options: opcionesBase('Espera: 2025 y simulada (min)'),
  });
  graficos.valPerdida = new Chart($('gValPerdida'), {
    type: 'bar',
    data: { labels: etiquetasHora, datasets: [barra('Datos 2025', C.carton, S.HIST_PERDIDA_RUTA), barra('Simulado', C['serie-actual'])] },
    options: opcionesBase('Pérdida de camión: 2025 y simulada (%)'),
  });
  const opCausas = opcionesBase('Venta perdida de 2025 por causa');
  opCausas.indexAxis = 'y';
  opCausas.scales.x.stacked = true; opCausas.scales.y.stacked = true;
  opCausas.scales.x.beginAtZero = true; opCausas.scales.x.grid = { color: C.linea }; opCausas.scales.y.display = false;
  opCausas.scales.x.ticks.callback = (v) => `${v / 1000} mil`;
  opCausas.plugins.legend.position = 'bottom';
  opCausas.plugins.tooltip.callbacks = { label: (it) => `${it.dataset.label}: ${soles(it.parsed.x)}` };
  const totalCausas = Object.values(S.CAUSAS_2025).reduce((a, b) => a + b, 0);
  const etiquetaCausa = (nombre, v) => `${nombre} ${Math.round((100 * v) / totalCausas * 10) / 10} %`;
  graficos.causas = new Chart($('gCausas'), {
    type: 'bar',
    data: {
      labels: ['2025'],
      datasets: [
        { label: etiquetaCausa('Quiebre de stock', S.CAUSAS_2025.quiebre), data: [S.CAUSAS_2025.quiebre], backgroundColor: C.seguridad, borderRadius: 2 },
        { label: etiquetaCausa('Calendario', S.CAUSAS_2025.calendario), data: [S.CAUSAS_2025.calendario], backgroundColor: C.carton, borderRadius: 2 },
        { label: etiquetaCausa('Despacho', S.CAUSAS_2025.despacho), data: [S.CAUSAS_2025.despacho], backgroundColor: C.acero, borderRadius: 2 },
      ],
    },
    options: opCausas,
  });

  actualizarCobertura();
  if (dia) graficos.dia.data.datasets.forEach((ds, i) => { ds.data = i ? dia.serie.turno : dia.serie.cola; });
  if (resultados) pintarAnio();
  pintarBase();
}

function actualizarCobertura() {
  if (!graficos.cobertura) return;
  const g = graficos.cobertura;
  g.data.datasets[0].data = S.personalPorHora(estado.plan);
  g.data.datasets[1].data = S.requeridos(0.85, estado.crec / 100);
  g.update();
}

function pintarBase() {
  if (!base || !graficos.valEspera) return;
  graficos.valEspera.data.datasets[1].data = base.porHora.map((h) => h.espera);
  graficos.valPerdida.data.datasets[1].data = base.porHora.map((h) => h.perdida);
  graficos.valEspera.update();
  graficos.valPerdida.update();
}

/* ---------- Año simulado ---------- */

let temporizador = null;
const cacheActual = new Map();
const evaluarActual = (esc) => {
  const clave = JSON.stringify(esc);
  if (!cacheActual.has(clave)) cacheActual.set(clave, S.evaluar(S.PLANES.actual.plan, esc));
  return cacheActual.get(clave);
};

function programarAnio() {
  clearTimeout(temporizador);
  $('resultados').setAttribute('aria-busy', 'true');
  $('kpis').setAttribute('aria-busy', 'true');
  temporizador = setTimeout(() => {
    if (!totalPersonas(estado.plan)) {
      resultados = null;
      $('resultados').innerHTML = '<caption>Agrega al menos un despachador para simular el año.</caption>';
      $('kpis').innerHTML = '';
      $('hallazgo').textContent = 'Sin despachadores no hay operación que simular: agrega uno en Personal.';
      $('roi').textContent = '';
      $('ayuda').textContent = '';
      $('alerta').hidden = true;
      return;
    }
    const esc = escenario();
    resultados = { plan: S.evaluar(estado.plan, esc), actual: evaluarActual(esc) };
    pintarAnio();
  }, 200);
}

function pintarAnio() {
  const { plan, actual } = resultados;
  const pct1 = (v) => v.toFixed(1) + ' %', pct2 = (v) => v.toFixed(2) + ' %', min1 = (v) => v.toFixed(1) + ' min';
  const filas = [
    ['Espera media', 'espera', min1],
    ['Pedidos que pierden su camión', 'perdida', pct1],
    ['Entregas tardías (más de 24 h)', 'tardias', pct1],
    ['Pedidos cancelados', 'cancelados', pct2],
    ['Clientes perdidos', 'clientesPerdidos', pct2],
    ['Horas extra al año', 'horasExtra', (v) => v.toFixed(0) + ' h'],
    ['Venta perdida al año', 'ventaPerdida', soles, 'grupo'],
    ['por quiebre de stock', 'ventaQuiebre', soles, 'sub'],
    ['por calendario de camiones', 'ventaCalendario', soles, 'sub'],
    ['por despacho', 'ventaDespacho', soles, 'sub'],
    // Con margen 100 % el margen perdido es la misma cifra que la venta perdida: no se repite
    ...(estado.margen < 100 ? [[`Margen perdido al año (${estado.margen} %)`, 'margenPerdido', soles]] : []),
    ['Planilla al año', 'planilla', soles],
    ['Costo de horas extra al año', 'costoHorasExtra', soles],
    ['Costo total al año', 'costoTotal', soles, 'total'],
  ];
  const celda = (r, k, fmt) => `<td class="cifra">${fmt(r[k])}${r[k + 'IC'] ? `<span class="ic">± ${fmt(r[k + 'IC'])}</span>` : ''}</td>`;
  const marca = (c) => `<span class="marca-serie" style="background:${c}"></span>`;
  // Si la diferencia se redondea a cero al mostrarla, no lleva signo (evita "−0.0 %")
  const signo = (d, fmt) => { const t = fmt(Math.abs(d)); return `${Number(t.replace(/[^0-9.]/g, '')) === 0 ? '' : d > 0 ? '+' : '−'}${t}`; };
  $('resultados').innerHTML = `
    <thead><tr><th>Indicador</th><th>${marca(C['serie-plan'])}Plan elegido</th><th>${marca(C['serie-actual'])}Situación actual</th><th>Diferencia</th></tr></thead>
    <tbody>${filas.map(([nombre, k, fmt, clase = '']) => {
      const d = plan[k] - actual[k];
      // Solo importa si la diferencia es mayor que el ruido de la simulación (intervalo de confianza)
      const tono = Math.abs(d) < Math.max(1e-9, (plan[k + 'IC'] || 0) * 0.5) ? '' : d < 0 ? 'mejor' : 'peor';
      return `<tr class="${clase}"><td>${nombre}</td>${celda(plan, k, fmt)}${celda(actual, k, fmt)}<td class="cifra ${tono}">${signo(d, fmt)}</td></tr>`;
    }).join('')}</tbody>`;
  $('resultados').setAttribute('aria-busy', 'false');

  // Resumen: la cifra que el personal sí controla (pedidos que pierden su camión) va primero y más grande
  const kpi = (etiqueta, valor, pie, lider = false) =>
    `<div class="${lider ? 'lider' : ''}"><dt>${etiqueta}</dt><dd>${valor}</dd><span class="pie">${pie}</span></div>`;
  const dif = (d, fmt, ruido = 1e-9) => `<span class="${Math.abs(d) < ruido ? '' : d < 0 ? 'bien' : 'mal'}">${signo(d, fmt)}</span>`;
  $('kpis').innerHTML = [
    kpi('Pedidos que pierden su camión', pct1(plan.perdida), `${dif(plan.perdida - actual.perdida, pct1, plan.perdidaIC / 2)} frente a la situación actual (${pct1(actual.perdida)})`, true),
    kpi('Espera promedio de un pedido', min1(plan.espera), `${dif(plan.espera - actual.espera, min1, plan.esperaIC / 2)} frente a la situación actual`),
    kpi('Venta perdida al año', soles(plan.ventaPerdida), `${soles(plan.ventaDespacho)} por despacho; el resto, quiebres y calendario`),
    kpi('Planilla al mes', soles(S.costoMensual(estado.plan)), `${totalPersonas(estado.plan)} despachadores`),
  ].join('');
  $('kpis').setAttribute('aria-busy', 'false');
  $('ayuda').textContent = 'Cada pedido se asigna al primer camión (10:00, 13:00 o 16:00) que alcanza con su tiempo de preparación; si la cola lo retrasa y no está listo a la salida, pierde ese camión. '
    + 'La venta perdida tiene tres causas: quiebres de stock, calendario (pedidos que llegan tarde o en sábado) y despacho. Solo la última depende del personal. Todo se compara con hoy: 3 despachadores fijos.';

  const plural = (n) => `${n} despachador${n === 1 ? '' : 'es'}`;
  $('hallazgo').innerHTML = `Con este plan <strong>${pct1(plan.perdida)}</strong> de los pedidos pierde su camión (hoy ${pct1(actual.perdida)}) `
    + `y cada uno espera <strong>${min1(plan.espera)}</strong> en promedio.`;

  // Aviso: la hora en que el plan elegido pierde más camiones, si es grave
  const peor = plan.porHora.reduce((m, h, i) => (h.perdida > plan.porHora[m].perdida ? i : m), 0);
  const perdida = plan.porHora[peor].perdida, perdidaHoy = actual.porHora[peor].perdida;
  const enTurno = S.personalPorHora(estado.plan)[peor];
  const alerta = $('alerta');
  alerta.hidden = perdida < 8 || perdida < perdidaHoy + 2;
  if (!alerta.hidden) {
    const hoy = S.personalPorHora(S.PLANES.actual.plan)[peor];
    const motivo = enTurno < hoy ? ` Hoy hay ${plural(hoy)} a esa hora; este plan cubre solo lo que pide ρ ≤ 0.85 y la cola se arrastra.` : '';
    alerta.innerHTML = `<strong>A las ${S.HORAS[peor]}:00 el plan pierde más camiones que la situación actual</strong>${perdida.toFixed(0)} % de los pedidos que llegan a esa hora pierde su camión (hoy ${perdidaHoy.toFixed(0)} %) con ${plural(enTurno)} en turno.${motivo}`;
  }

  // Inversión = planilla + horas extra; lo recuperado es la venta perdida por despacho, valorada al margen elegido
  const inversion = plan.planilla + plan.costoHorasExtra - actual.planilla - actual.costoHorasExtra;
  const recuperado = (actual.ventaDespacho - plan.ventaDespacho) * (estado.margen / 100);
  const neto = recuperado - inversion;
  const sinPersonal = ((plan.ventaQuiebre + plan.ventaCalendario) / plan.ventaPerdida) * 100;
  const cola = ` El ${sinPersonal.toFixed(sinPersonal > 99 ? 1 : 0)} % de la venta perdida (${soles(plan.ventaQuiebre + plan.ventaCalendario)}) viene de quiebres de stock y del calendario de camiones: ningún plan de personal la recupera.`;
  $('roi').textContent = Math.abs(inversion) < 1 && Math.abs(recuperado) < 1
    ? 'Es el mismo plan que la situación actual.'
    : inversion > 0
      ? `Este plan cuesta ${soles(inversion)} más al año en planilla y horas extra y recupera ${soles(recuperado)} de venta ligada al despacho: ${neto >= 0 ? 'se paga' : 'no se paga'} (resultado neto ${soles(neto)} al año).${cola}`
      : `Este plan ahorra ${soles(-inversion)} al año en planilla y horas extra y cambia la venta ligada al despacho en ${soles(recuperado)}: efecto neto ${soles(neto)} al año.${cola}`;

  if (!window.Chart) return;
  graficos.espera.data.datasets[0].data = plan.porHora.map((h) => h.espera);
  graficos.espera.data.datasets[1].data = actual.porHora.map((h) => h.espera);
  graficos.perdida.data.datasets[0].data = plan.porHora.map((h) => h.perdida);
  graficos.perdida.data.datasets[1].data = actual.porHora.map((h) => h.perdida);
  graficos.espera.update();
  graficos.perdida.update();
}

/* ---------- Animación de un día ---------- */

const CAJA = 24, CAJA_CHICA = 18, MAX_CARGA = 6;
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
    camion: { x: 812, y0: 52, paso: 98, esc: 1, enFila: false, dir: [1, 0], clip: [792, 0, 168, 430], texto: 12 },
    bahias: [{ x: 812, y: 354, w: 68, h: 46, tipo: 'manana', texto: 'Mañana' }, { x: 888, y: 354, w: 68, h: 46, tipo: 'stock', texto: 'Sin stock' }],
    etiquetas: [['Cola de pedidos', 20, 416], ['Despachadores', 590, 416], ['Camiones', 812, 416]],
    losas: true, flecha: 202, texto: 13,
  },
  angosto: {
    W: 420, H: 600,
    reloj: { x: 12, y: 10, w: 112, h: 50, fuente: 36, textoX: 138, y1: 26, y2: 46, texto: 13 },
    cola: { frenteX: 376, paso: 36, porFila: 9, filasY: [0, 40, 80], y0: 96, xMin: 32, xMax: 408 },
    est: { x: 12, y: 262, w: 396, h: 150, cols: 2, sep: 10, altoMax: 40 },
    franjas: [[0, 222, 420, 8], [0, 424, 420, 8]],
    camion: { x: 12, y0: 490, paso: 102, esc: 0.62, enFila: true, dir: [0, 1], clip: [0, 434, 420, 166], texto: 12 },
    bahias: [{ x: 12, y: 548, w: 196, h: 42, tipo: 'manana', texto: 'Mañana' }, { x: 216, y: 548, w: 192, h: 42, tipo: 'stock', texto: 'Sin stock' }],
    etiquetas: [['Cola de pedidos', 12, 80], ['Despachadores', 12, 250], ['Camiones', 12, 456]],
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
// Cada camión es una salida del día (10:00, 13:00 y 16:00): carga lo que sale listo y se va a su hora.
// Los pedidos que no alcanzan su camión van al siguiente, o a la bahía "Mañana"; los de quiebre esperan en "Sin stock".
const baseCamion = (k) => { const c = G.camion; return c.enFila ? [c.x + k * c.paso, c.y0] : [c.x, c.y0 + k * c.paso]; };
const origenCamion = (k) => {
  const [x, y] = baseCamion(k), d = dia.flota[k].d, [ux, uy] = G.camion.dir;
  return [x + ux * d, y + uy * d];
};
const posCarga = (k, i) => {
  const [ox, oy] = origenCamion(k), e = G.camion.esc;
  return [ox + e * (12 + (i % 3) * 28), oy + e * (18 + Math.floor(i / 3) * 22)];
};
const posBahia = (tipo) => {
  const b = G.bahias.find((x) => x.tipo === tipo);
  return [b.x + b.w / 2 - CAJA_CHICA / 2, b.y + 20];
};
const horaSalida = (k) => reloj(S.SALIDAS[k]);

let dia = null, semillaDia = 1, reproduciendo = false, velocidad = 15, ultimoMs = null;
const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

function nuevoDia() {
  const seguia = reproduciendo;
  const diaSemana = (semillaDia - 1) % 6;                      // lunes a sábado
  const rng = S.crearRng(104729 * semillaDia + 17);
  const presentes = S.presentesDelDia(estado.plan, estado.aus / 100, rng);
  const personal = S.personalPorHora(presentes);
  const log = [];
  if (totalPersonas(estado.plan)) {
    S.simularDia(personal, S.generarDia(rng, diaSemana, estado.crec / 100, 1 - estado.q / 100), diaSemana, log);
  }
  dia = {
    log, i: 0, t: 0, fin: log.length ? log[log.length - 1].t : 0, cap: Math.max(1, ...personal), diaSemana,
    pedidos: new Map(), cola: [], estaciones: Array.from({ length: Math.max(1, ...personal) }, () => ({ activa: true, pedido: null })),
    flota: S.SALIDAS.map(() => ({ carga: 0, enCamino: 0, d: 0, fase: 'carga', salir: false, llevo: 0, vel: 0 })),
    bahia: { manana: 0, stock: 0 }, ultimaSalida: null, faltaron: totalPersonas(estado.plan) - totalPersonas(presentes),
    cont: { llegados: 0, despachados: 0, perdieron: 0, cancelados: 0, clientes: 0, venta: 0, espera: 0, nEspera: 0 },
    serie: { cola: [], turno: [] }, minuto: -1, servicios: log.filter((e) => e.tipo === 'inicio'),
  };
  avanzar(0);
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
    d.pedidos.set(ev.id, { llegada: ev.t, x: -CAJA, y, estado: 'cola', perdio: false, alfa: 1, quiebre: ev.quiebre, holgura: ev.holgura });
    d.cola.push(ev.id);
    d.cont.llegados++;
  } else if (ev.tipo === 'perdio') {
    if (!p.perdio) { p.perdio = true; d.cont.perdieron++; }
  } else if (ev.tipo === 'cancela') {
    sacarDeCola();
    Object.assign(p, { estado: 'cancelado', ty: p.y - 46 });
    d.cont.cancelados++; d.cont.venta += ev.monto;
  } else if (ev.tipo === 'inicio') {
    sacarDeCola();
    Object.assign(p, { estado: 'servicio', est: ev.est, inicio: ev.t, dur: ev.dur });
    d.estaciones[ev.est].pedido = ev.id;
    d.cont.espera += ev.t - p.llegada; d.cont.nEspera++;
  } else if (ev.tipo === 'fin') {
    if (ev.perdio && !p.perdio) { p.perdio = true; d.cont.perdieron++; }
    if (ev.perdido) { d.cont.clientes++; d.cont.venta += 2 * ev.monto; }
    const destino = ev.quiebre ? 'stock' : ev.camion >= 0 ? ev.camion : 'manana';
    let slot = 0;
    if (typeof destino === 'number') { const c = d.flota[destino]; slot = Math.min(MAX_CARGA - 1, c.carga + c.enCamino); c.enCamino++; }
    Object.assign(p, { estado: 'listo', destino, desde: [p.x, p.y], prog: 0, slot });
    d.estaciones[ev.est].pedido = null;
    d.cont.despachados++;
  } else if (ev.tipo === 'salida') {
    d.flota[ev.camion].salir = true;
    d.ultimaSalida = { k: ev.camion, t: ev.t };
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
      // Del puesto al camión (o a la bahía) en un arco (curva cuadrática) con salida rápida y llegada suave
      p.prog = reducirMovimiento ? 1 : Math.min(1, p.prog + dt / 0.65);
      const e = 1 - (1 - p.prog) ** 3;
      const [x0, y0] = p.desde, [x1, y1] = typeof p.destino === 'number' ? posCarga(p.destino, p.slot) : posBahia(p.destino);
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 70;
      p.x = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cx + e ** 2 * x1;
      p.y = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cy + e ** 2 * y1;
      p.escala = 1 - e * (1 - (CAJA_CHICA * (typeof p.destino === 'number' ? G.camion.esc : 1)) / CAJA);
      if (p.prog >= 1) {
        if (typeof p.destino === 'number') { const c = dia.flota[p.destino]; c.enCamino--; c.carga++; }
        else dia.bahia[p.destino]++;
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

// El camión sale a su hora (cuando termina de recibir las cajas que van en camino) y no vuelve ese día
function moverCamiones(dt) {
  for (const c of dia.flota) {
    if (c.fase === 'carga' && c.salir && c.enCamino === 0) { c.fase = 'saliendo'; c.vel = 0; c.llevo = c.carga; }
    if (reducirMovimiento && c.fase === 'saliendo') c.fase = 'ido';
    if (c.fase === 'saliendo') {
      c.vel += 900 * dt; c.d += c.vel * dt;
      if (c.d > 230) c.fase = 'ido';
    }
  }
}

function rect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cajaDibujo(x, y, lado, perdio, quiebre = false) {
  rect(x, y, lado, lado, 3);
  ctx.fillStyle = C.carton; ctx.fill();
  ctx.lineWidth = perdio ? 2.5 : 1;
  ctx.strokeStyle = perdio ? C.rojo : C['carton-borde']; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';               // cinta de embalaje
  ctx.fillRect(x + lado / 2 - lado * 0.1, y + 1, lado * 0.2, lado - 2);
  if (quiebre) { ctx.fillStyle = C.seguridad; ctx.fillRect(x + 2, y + 2, lado - 4, Math.max(3, lado * 0.2)); }   // sin stock
}

function dibujarCaja(p) {
  ctx.globalAlpha = Math.max(0, p.alfa);
  cajaDibujo(p.x, p.y, CAJA * (p.escala || 1), p.perdio, p.quiebre);
  if (p.estado === 'cola' && p.holgura !== null && p.holgura !== undefined) {
    // mecha: cuánto del margen para alcanzar su camión ya se consumió esperando; en rojo, ya no llega
    const f = Math.min(1, (dia.t - p.llegada) / Math.max(1, p.holgura));
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
  const c = dia.flota[k], [bx, by] = baseCamion(k), e = G.camion.esc;
  if (c.fase === 'ido') {                                  // la plaza vacía: el camión ya salió
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C.control; ctx.lineWidth = 1;
    rect(bx, by, 142 * e, 64 * e, 4); ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  const [ox, oy] = origenCamion(k);
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(e, e);
  rect(0, 0, 104, 64, 4); ctx.fillStyle = C.fondo; ctx.fill();
  ctx.strokeStyle = C.linea; ctx.lineWidth = 1.5; ctx.stroke();
  rect(108, 18, 34, 46, 5); ctx.fillStyle = C.acero; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.fillRect(124, 24, 14, 14);
  ctx.fillStyle = C.tinta;
  for (const xr of [18, 84, 126]) { ctx.beginPath(); ctx.arc(xr, 68, 7, 0, 2 * Math.PI); ctx.fill(); }
  for (let i = 0; i < Math.min(c.carga, MAX_CARGA); i++) cajaDibujo(12 + (i % 3) * 28, 18 + Math.floor(i / 3) * 22, CAJA_CHICA, false);
  if (c.carga > MAX_CARGA) {
    ctx.fillStyle = C['tinta-2']; ctx.font = '600 13px Barlow, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`+${c.carga - MAX_CARGA}`, 76, 56);
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
  const factor = S.FACTOR_DIA[dia.diaSemana] * (1 + estado.crec / 100);
  ctx.fillStyle = C.tinta; ctx.font = `500 ${r.texto}px Barlow, sans-serif`;
  ctx.fillText(dia.t >= 600 ? 'Horas extra: se despacha lo pendiente' : `Llegan ~${(S.LAMBDA[h] * factor).toFixed(1)} pedidos por hora`, r.textoX, r.y1);
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

  // Camiones: uno por salida del día. Cargan lo que sale listo y se van a su hora
  ctx.save();
  ctx.beginPath(); ctx.rect(...G.camion.clip); ctx.clip();
  S.SALIDAS.forEach((_, k) => dibujarCamion(k));
  ctx.restore();
  ctx.fillStyle = C['tinta-2']; ctx.font = `500 ${G.camion.texto}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
  dia.flota.forEach((c, k) => {
    const ruta = G.camion.enFila ? horaSalida(k) : `Ruta ${horaSalida(k)}`;           // en el teléfono no cabe la palabra "Ruta"
    const texto = c.fase === 'carga' ? `${ruta}: ${c.carga} listo${c.carga === 1 ? '' : 's'}` : `${ruta}: salió con ${c.llevo}`;
    const [bx, by] = baseCamion(k);
    ctx.fillText(texto, bx, by - 8);
  });
  // Bahías: lo que no sale hoy
  G.bahias.forEach((b) => {
    rect(b.x, b.y, b.w, b.h, 4); ctx.fillStyle = C.fondo; ctx.fill();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C.control; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C['tinta-2']; ctx.font = '500 12px Barlow, sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(b.texto, b.x + 8, b.y + 15);
    ctx.fillStyle = C.tinta; ctx.font = '600 18px Barlow, sans-serif'; ctx.fillText(String(dia.bahia[b.tipo]), b.x + 8, b.y + 36);
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
    ['Perdieron su camión', c.perdieron, c.perdieron > 0],
    ['Cancelados', c.cancelados, c.cancelados > 0],
    ['Venta perdida hoy', soles(c.venta), c.venta > 0],
    ['Espera promedio', c.nEspera ? `${(c.espera / c.nEspera).toFixed(1)} min` : '–'],
    ['Horas extra hoy', `${Math.round(extra)} min <span class="ic">S/ ${((extra / 60) * estado.hx).toFixed(2)}</span>`],
  ];
  $('contadores').innerHTML = datos.map(([dt, dd, malo]) => `<div class="${malo ? 'malo' : ''}"><dt>${dt}</dt><dd>${dd}</dd></div>`).join('');
}

function ponerReproduccion(si) {
  reproduciendo = si;
  $('play').textContent = si ? 'Pausar' : (dia.t > 0 && !terminado() ? 'Continuar' : 'Reproducir');
  const faltas = dia.faltaron ? ` Hoy faltaron ${dia.faltaron} despachador${dia.faltaron > 1 ? 'es' : ''}.` : '';
  const nombre = `Día ${semillaDia}, ${NOMBRES_DIA[dia.diaSemana]}`;
  $('estadoDia').textContent = !dia.log.length ? 'Sin despachadores no hay día que simular.'
    : terminado() ? `${nombre}: terminó a las ${reloj(dia.fin)}.${faltas}` : `${nombre}.${faltas}`;
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
  if (terminado()) return `Terminó el día: se despacharon ${dia.cont.despachados} pedidos, ${dia.cont.perdieron} perdieron su camión y se cancelaron ${dia.cont.cancelados}.`;
  if (dia.t === 0) return 'Pulsa Reproducir: los pedidos entran por la flecha amarilla de la izquierda.';
  if (dia.t >= S.CIERRE) return 'Cerró el almacén (18:00): lo que queda en cola se despacha con horas extra.';
  const u = dia.ultimaSalida;
  if (u && dia.t - u.t < 25) return `Salió el camión de las ${horaSalida(u.k)} con ${dia.flota[u.k].llevo} pedidos; los que no estaban listos esperan al siguiente.`;
  const enCola = dia.cola.length;
  const sinCamion = dia.cola.filter((id) => dia.pedidos.get(id).perdio).length;
  const libres = dia.estaciones.filter((e) => e.activa && e.pedido === null).length;
  if (!enCola) return libres ? `Todo al día: hay ${libres} despachador${libres > 1 ? 'es' : ''} libre${libres > 1 ? 's' : ''} esperando pedidos.` : 'Todos los despachadores están ocupados, pero todavía no hay cola.';
  if (sinCamion) return `Hay cola: ${enCola} pedido${enCola > 1 ? 's' : ''} esperando y ${sinCamion} ya no alcanzará${sinCamion > 1 ? 'n' : ''} su camión (borde rojo).`;
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
sincronizarDeslizadores();
crearGraficos();
cambioPlan();
if (!window.Chart) {
  document.querySelectorAll('.grafico').forEach((g) => { g.innerHTML = '<p>No se pudo cargar Chart.js (vendor/chart.umd.js).</p>'; g.style.height = 'auto'; });
}
// En el teléfono los controles arrancan plegados para que los resultados queden a la vista
if (matchMedia('(max-width: 860px)').matches) document.querySelectorAll('.lateral details').forEach((d) => { d.open = false; });
document.fonts.ready.then(crearGraficos);   // redibuja los gráficos con la tipografía ya cargada
setTimeout(() => { base = evaluarActual({ crecimiento: 0, ausentismo: 0, qQuiebre: 1, margen: 1, costoHoraExtra: INICIAL.hx }); pintarBase(); }, 0);
if (!reducirMovimiento) ponerReproduccion(true);
requestAnimationFrame(cuadro);
