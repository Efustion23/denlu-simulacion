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

/* ---------- Animación de un día: el almacén visto desde arriba, con su gente ---------- */

// Los pedidos llegan por teléfono y vendedores a la oficina de ventas, se imprimen y esperan en el tablero
// (la cola). Cada despachador toma una hoja, recoge la mercadería en los estantes, la empaca en su mesa y
// la lleva al camión de su ruta; en el almuerzo o fuera de turno está en el comedor. Los momentos en que
// empieza y termina cada despacho salen del modelo de eventos (simularDia); las caminatas solo reparten
// ese tiempo entre las etapas del trabajo.
const CARGA_VIAJE = 6;
const VEL_CAMINAR = 70;                                   // px por minuto simulado cuando no despacha
const lienzo = $('lienzo'), ctx = lienzo.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const pantallaChica = matchMedia('(max-width: 700px)');

// Dos planos del mismo almacén: apaisado en pantalla ancha y apilado en el teléfono.
// `red` son los pasillos (segmentos horizontales o verticales) por donde camina la gente.
const PLANOS = {
  ancho: {
    W: 960, H: 560, esc: 1.2, escCamion: 1, texto: 13, aviso: [555, 38],
    reloj: { x: 16, y: 14, w: 116, h: 48, fuente: 36, textoX: 146, y1: 30, y2: 50 },
    oficina: { x: 16, y: 76, w: 230, h: 120, escritorio: [30, 102, 156, 20], vendedores: [[60, 140], [160, 140]], impresora: [200, 102, 32, 24] },
    tablero: { x: 16, y: 210, w: 230, h: 200, gx: 26, gy: 238, cols: 5, filas: 4, cw: 38, ch: 42, bandeja: [220, 282], bandejaRect: [216, 270, 26, 56] },
    comedor: { x: 16, y: 424, w: 230, h: 122, mesa: [60, 474, 142, 30],
      asientos: [[82, 460, Math.PI / 2], [131, 460, Math.PI / 2], [180, 460, Math.PI / 2], [82, 518, -Math.PI / 2], [131, 518, -Math.PI / 2], [180, 518, -Math.PI / 2]],
      puerta: [[236, 492], [268, 492]] },
    estantes: { x: 290, w: 380, alto: 26, filas: [92, 172, 252, 332], pasillos: [145, 225, 305] },
    mesas: { x: 290, w: 380, y: 414, alto: 26, pie: 398, ang: Math.PI / 2 },
    recoger: { punto: [268, 300], ang: Math.PI },
    anden: { franja: [712, 66, 8, 400], ang: 0, dir: 0, clip: [720, 0, 240, 560],
      bahias: [110, 260, 410].map((y) => ({ pie: [702, y], red: [688, y], camion: [728, y], texto: [728, y - 36], pila: [692, y + 30] })) },
    red: [[268, 145, 268, 492], [268, 398, 688, 398], [688, 110, 688, 410], [268, 145, 688, 145], [268, 225, 688, 225], [268, 305, 688, 305]],
    etiquetas: [['Estantería', 290, 80], ['Mesas de empaque', 290, 462], ['Andén de carga', 728, 52]],
  },
  angosto: {
    W: 420, H: 736, esc: 1, escCamion: 0.85, texto: 12, aviso: [210, 240],
    reloj: { x: 12, y: 10, w: 100, h: 42, fuente: 30, textoX: 124, y1: 24, y2: 44 },
    oficina: { x: 12, y: 62, w: 396, h: 96, escritorio: [30, 84, 250, 18], vendedores: [[96, 122], [214, 122]], impresora: [330, 96, 40, 26] },
    tablero: { x: 12, y: 168, w: 396, h: 116, gx: 22, gy: 194, cols: 9, filas: 2, cw: 37, ch: 44, bandeja: [372, 210], bandejaRect: [364, 196, 28, 74] },
    comedor: { x: 12, y: 316, w: 84, h: 160, mesa: [42, 346, 24, 112],
      asientos: [[28, 364, 0], [28, 400, 0], [28, 436, 0], [80, 364, Math.PI], [80, 400, Math.PI], [80, 436, Math.PI]],
      puerta: [[88, 462], [110, 462]] },
    estantes: { x: 126, w: 278, alto: 22, filas: [318, 378, 438], pasillos: [359, 419] },
    mesas: { x: 126, w: 278, y: 496, alto: 22, pie: 484, ang: Math.PI / 2 },
    recoger: { punto: [381, 300], ang: -Math.PI / 2 },
    anden: { franja: [12, 566, 396, 8], ang: Math.PI / 2, dir: 1, clip: [0, 574, 420, 146],
      bahias: [76, 210, 344].map((x) => ({ pie: [x, 558], red: [x, 550], camion: [x, 582], texto: [x, 730], pila: [x + 26, 548] })) },
    red: [[20, 300, 400, 300], [110, 300, 110, 550], [110, 359, 404, 359], [110, 419, 404, 419], [110, 484, 404, 484], [30, 550, 390, 550]],
    etiquetas: [['Estantería', 126, 312], ['Mesas de empaque', 126, 530]],
  },
};
let P = PLANOS.ancho;

const entre = (v, a, b) => v >= Math.min(a, b) - 0.5 && v <= Math.max(a, b) + 0.5;
const enSegmento = (p, s) => (s[0] === s[2]
  ? Math.abs(p[0] - s[0]) < 0.5 && entre(p[1], s[1], s[3])
  : Math.abs(p[1] - s[1]) < 0.5 && entre(p[0], s[0], s[2]));
const sobreRed = (p) => P.red.some((s) => enSegmento(p, s));
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const largo = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

// Nodos de la red de pasillos: extremos y cruces de los segmentos
function prepararRed() {
  const nodos = [];
  P.red.forEach(([x1, y1, x2, y2]) => nodos.push([x1, y1], [x2, y2]));
  for (const v of P.red) for (const h of P.red) {
    if (v[0] === v[2] && h[1] === h[3] && entre(v[0], h[0], h[2]) && entre(h[1], v[1], v[3])) nodos.push([v[0], h[1]]);
  }
  P.nodos = nodos.filter((p, i) => nodos.findIndex((q) => dist(p, q) < 0.5) === i);
}

// Camino más corto por los pasillos entre dos puntos que están sobre la red (Dijkstra con pocos nodos)
function rutaRed(a, b) {
  const nodos = [a, b, ...P.nodos], n = nodos.length;
  const segs = nodos.map((p) => P.red.map((s, i) => (enSegmento(p, s) ? i : -1)).filter((i) => i >= 0));
  const d = Array(n).fill(Infinity), prev = Array(n).fill(-1), hecho = Array(n).fill(false);
  d[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!hecho[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === 1) break;
    hecho[u] = true;
    for (let v = 0; v < n; v++) {
      if (hecho[v] || !segs[u].some((s) => segs[v].includes(s))) continue;
      const nd = d[u] + dist(nodos[u], nodos[v]);
      if (nd < d[v]) { d[v] = nd; prev[v] = u; }
    }
  }
  if (d[1] === Infinity) return [a, b];
  const ruta = [];
  for (let i = 1; ; i = prev[i]) { ruta.unshift(nodos[i]); if (i === 0) break; }
  return ruta;
}

const limpiar = (pts) => pts.filter((p, i) => !i || dist(pts[i - 1], p) > 0.5);
// Lugares donde se para una persona: punto, hacia dónde mira y el tramo que la une a los pasillos
const mesaRect = (k) => {
  const m = P.mesas, w = m.w / dia.cap, cx = m.x + (k + 0.5) * w, tw = Math.min(64, w - 12);
  return { x: cx - tw / 2, y: m.y, w: tw, h: m.alto, cx };
};
const lugarMesa = (k) => ({ punto: [mesaRect(k).cx, P.mesas.pie], ang: P.mesas.ang, salida: [] });
const lugarTablero = () => ({ punto: P.recoger.punto, ang: P.recoger.ang, salida: [] });
const lugarAsiento = (k) => { const a = P.comedor.asientos[k % 6]; return { punto: [a[0], a[1]], ang: a[2], salida: P.comedor.puerta, sentado: true }; };
const lugarBahia = (k) => { const b = P.anden.bahias[k]; return { punto: b.pie, ang: P.anden.ang, salida: [b.red] }; };
// El pedido `id` está en un estante al azar (fijo para ese pedido): pasillo, posición y lado
function lugarEstante(id) {
  const r = S.crearRng(9973 * id + 7), e = P.estantes;
  const y = e.pasillos[Math.floor(r() * e.pasillos.length)];
  return { punto: [Math.round(e.x + 16 + r() * (e.w - 32)), y], ang: r() < 0.5 ? -Math.PI / 2 : Math.PI / 2, salida: [] };
}
const desdeLugar = (l) => [l.punto, ...l.salida];
// Desde donde está la persona hasta el primer punto de los pasillos que tiene por delante
function desdePersona(per) {
  const pts = [[per.x, per.y]];
  if (!sobreRed(pts[0])) for (const w of (per.ruta.length ? per.ruta : per.lugar.salida)) { pts.push(w); if (sobreRed(w)) break; }
  return pts;
}
function camino(desde, lugar) {
  const llegada = [...lugar.salida].reverse().concat([lugar.punto]);
  return limpiar([...desde, ...rutaRed(desde[desde.length - 1], llegada[0]).slice(1), ...llegada.slice(1)]);
}
function puntoEn(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) {
      const f = l ? Math.min(1, d / l) : 1;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
        Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
    }
    d -= l;
  }
  return [pts[0][0], pts[0][1], null];
}

function configurarLienzo() {
  P = pantallaChica.matches ? PLANOS.angosto : PLANOS.ancho;
  if (!P.nodos) prepararRed();
  lienzo.width = P.W * dpr; lienzo.height = P.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
configurarLienzo();

const capacidadTablero = () => P.tablero.cols * P.tablero.filas;
const posHoja = (i) => {
  const t = P.tablero, n = Math.min(i, capacidadTablero() - 1);
  return [t.gx + (n % t.cols) * t.cw, t.gy + Math.floor(n / t.cols) * t.ch];
};
const baseCamion = (k) => P.anden.bahias[k].camion;
const origenCamion = (k) => {
  const [x, y] = baseCamion(k), d = dia.flota[k].d;
  return P.anden.dir ? [x, y + d] : [x + d, y];
};

let dia = null, semillaDia = 1, reproduciendo = false, velocidad = 5, ultimoMs = null;
const PIEL = ['#8d5a3b', '#c68a5e', '#6b4429', '#b07850', '#9c6644', '#d19a6c'];
const PELO = ['#1d1612', '#3a2618', '#120f0e', '#4a3020', '#2b1d14', '#1a1a1a'];

function nuevoDia() {
  const seguia = reproduciendo;
  const rng = S.crearRng(104729 * semillaDia + 17);
  const presentes = S.presentesDelDia(estado.plan, estado.aus / 100, rng);
  const personal = S.personalPorHora(presentes);
  const log = [];
  if (totalPersonas(estado.plan)) {
    S.simularDia(personal, S.LAMBDA.map((l) => l * (1 + estado.crec / 100)), estado.T, estado.p, rng, log);
  }
  const cap = Math.max(1, ...personal);
  dia = {
    log, i: 0, t: 0, fin: log.length ? log[log.length - 1].t : 0, cap,
    pedidos: new Map(), cola: [], estaciones: Array.from({ length: cap }, (_, k) => ({ activa: k < personal[0], pedido: null })),
    flota: [0, 1, 2].map(() => ({ carga: 0, enCamino: 0, d: 0, fase: 'anden', viajes: 0, puerta: 1, pop: 0, humoT: 0 })), faltaron: totalPersonas(estado.plan) - totalPersonas(presentes),
    cont: { llegados: 0, despachados: 0, perdieron: 0, cancelados: 0, espera: 0, nEspera: 0 },
    serie: { cola: [], turno: [] }, minuto: -1, servicios: log.filter((e) => e.tipo === 'inicio'), burbujas: [],
    humo: [], avisos: [], hora: 0, sel: null, hover: null,
  };
  // Al empezar el día cada despachador en turno está en su mesa; los demás, en el comedor y vestuario
  dia.personas = dia.estaciones.map((e, k) => {
    const lugar = e.activa ? lugarMesa(k) : lugarAsiento(k);
    return { x: lugar.punto[0], y: lugar.punto[1], ang: lugar.ang, angVis: lugar.ang, paso: 0, despachados: 0, lugar, destino: lugar, ruta: [], activo: e.activa,
      trabajo: null, carga: null, piel: PIEL[k % PIEL.length], pelo: PELO[k % PELO.length] };
  });
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

function irA(per, lugar) {
  per.ruta = camino(desdePersona(per), lugar).slice(1);
  per.destino = lugar;
  if (!per.ruta.length) per.lugar = lugar;
}

// Reparte el tiempo de despacho del modelo entre las etapas: 40 % caminando (según la distancia)
// y el resto en tomar la hoja, recoger en el estante y empacar en la mesa.
function asignar(per, ev) {
  const k = ev.est, tablero = lugarTablero(), estante = lugarEstante(ev.id), mesa = lugarMesa(k);
  const c = [camino(desdePersona(per), tablero), camino(desdeLugar(tablero), estante), camino(desdeLugar(estante), mesa),
    camino(desdeLugar(mesa), lugarBahia(1))];
  const L = c.map(largo), total = L.reduce((a, b) => a + b, 0);
  const caminar = total > 0 ? 0.4 : 0, quieto = (1 - caminar) / 0.6;
  const partes = [['camino', c[0], L[0]], ['hoja', tablero, 0.04 * quieto], ['camino', c[1], L[1]], ['recoger', estante, 0.26 * quieto],
    ['camino', c[2], L[2]], ['empacar', mesa, 0.30 * quieto], ['camino', c[3], L[3]]];
  let t = ev.t;
  const tramos = partes.map(([tipo, dato, x]) => {
    const t0 = t;
    t += ev.dur * (tipo === 'camino' ? (total ? (caminar * x) / total : 0) : x);
    return { tipo, dato, t0, t1: t };
  });
  per.trabajo = { id: ev.id, mesa: k, tramos, fase: -1, camion: null };
  per.ruta = [];
}

// Se llena un camión a la vez: el del andén con más carga que todavía tiene espacio
function elegirCamion() {
  const d = dia, ocupado = (k) => d.flota[k].carga + d.flota[k].enCamino;
  const conEspacio = [0, 1, 2].filter((k) => d.flota[k].fase === 'anden' && ocupado(k) < CARGA_VIAJE);
  const k = conEspacio.length
    ? conEspacio.reduce((a, b) => (ocupado(b) > ocupado(a) ? b : a))
    : [0, 1, 2].reduce((a, b) => (ocupado(b) < ocupado(a) ? b : a));
  d.flota[k].enCamino++;
  return k;
}

function entrarEtapa(per, i) {
  const tr = per.trabajo, tramo = tr.tramos[i];
  if (tramo.tipo === 'hoja') {
    const p = dia.pedidos.get(tr.id);
    if (p) Object.assign(p, { estado: 'tomando', x0: p.x, y0: p.y });
  } else if (i === 2) { dia.pedidos.delete(tr.id); per.carga = 'hoja'; }
  else if (i === 4) per.carga = 'caja';                    // sale del estante con la mercadería
  else if (tramo.tipo === 'empacar') per.carga = null;      // la caja queda en la mesa
  else if (i === 6) {
    per.carga = 'caja';
    tr.camion = elegirCamion();
    tramo.dato = camino(desdeLugar(lugarMesa(tr.mesa)), lugarBahia(tr.camion));
  }
}
function seguirTrabajo(per, t) {
  const tr = per.trabajo;
  while (tr.fase < tr.tramos.length - 1 && t >= tr.tramos[tr.fase + 1].t0) entrarEtapa(per, ++tr.fase);
}

function aplicar(ev) {
  const d = dia, p = d.pedidos.get(ev.id);
  const sacarDeCola = () => d.cola.splice(d.cola.indexOf(ev.id), 1);
  const avisar = (texto, malo) => {                       // un solo globo por vendedor: el nuevo reemplaza al anterior
    const v = ev.id % P.oficina.vendedores.length;
    d.burbujas = d.burbujas.filter((b) => b.v !== v).concat({ v, texto, malo, vida: 1.6 });
  };
  if (ev.tipo === 'llegada') {
    // Se imprime en la oficina de ventas y vuela al tablero de pendientes
    const [x, y] = P.oficina.impresora;
    d.pedidos.set(ev.id, { llegada: ev.t, x: x + 6, y: y + 2, estado: 'cola', perdio: false, alfa: 1, escala: 0.4, nace: reducirMovimiento ? 0 : 0.45 });
    d.cola.push(ev.id);
    d.cont.llegados++;
    avisar('Pedido nuevo', false);
  } else if (ev.tipo === 'perdio') {
    p.perdio = true; p.sacude = 0.7; d.cont.perdieron++;
  } else if (ev.tipo === 'cancela') {
    sacarDeCola();
    p.estado = 'cancelado';
    d.cont.cancelados++; d.cont.espera += ev.t - p.llegada; d.cont.nEspera++;
    avisar('Canceló', true);
  } else if (ev.tipo === 'inicio') {
    sacarDeCola();
    Object.assign(p, { estado: 'asignado', est: ev.est });
    d.estaciones[ev.est].pedido = ev.id;
    d.cont.espera += ev.t - p.llegada; d.cont.nEspera++;
    asignar(d.personas[ev.est], ev);
    d.personas[ev.est].trabajo.espera = ev.t - p.llegada;
  } else if (ev.tipo === 'fin') {
    const per = d.personas[ev.est];
    seguirTrabajo(per, Infinity);
    const c = d.flota[per.trabajo.camion];
    c.enCamino--; c.carga++; c.pop = 1;                      // la caja queda en el camión (o en el andén si salió)
    const bahia = lugarBahia(per.trabajo.camion);
    Object.assign(per, { x: bahia.punto[0], y: bahia.punto[1], ang: bahia.ang, lugar: bahia, destino: bahia, trabajo: null, carga: null, ruta: [] });
    d.pedidos.delete(ev.id);
    d.estaciones[ev.est].pedido = null;
    d.cont.despachados++; per.despachados++;
    irA(per, lugarMesa(ev.est));
  } else if (ev.tipo === 'sale') {
    d.estaciones[ev.est].activa = false;
    d.personas[ev.est].activo = false;
    irA(d.personas[ev.est], lugarAsiento(ev.est));
  } else if (ev.tipo === 'turno') {
    ev.activas.forEach((a, k) => {
      d.estaciones[k].activa = a;
      const per = d.personas[k];
      if (per.activo === a) return;
      per.activo = a;
      if (!per.trabajo) irA(per, a ? lugarMesa(k) : lugarAsiento(k));
    });
  }
}

// Aviso que entra por arriba del plano y se desvanece
const aviso = (texto, malo = false) => { dia.avisos.push({ texto, malo, vida: 2.6 }); dia.avisos = dia.avisos.slice(-2); };
function avisoHora(h) {
  if (h >= 10) { aviso('18:00 · Cierra el almacén: horas extra', dia.cola.length > 0); return; }
  const lam = S.LAMBDA[h] * (1 + estado.crec / 100), n = dia.estaciones.filter((e) => e.activa).length;
  const punta = lam > n * S.MU_H;                           // llegan más pedidos de los que se pueden atender
  aviso(`${horaTexto(8 + h)} · llegan ~${lam.toFixed(1)} pedidos/h · ${n} en turno${punta ? ' · no alcanzan' : ''}`, punta);
}

function avanzar(hasta) {
  while (dia.i < dia.log.length && dia.log[dia.i].t <= hasta) aplicar(dia.log[dia.i++]);
  const hora = Math.floor(hasta / 60);
  if (hora > dia.hora) { dia.hora = hora; avisoHora(hora); }
  const minuto = Math.floor(hasta);
  if (minuto > dia.minuto) {
    dia.minuto = minuto;
    dia.serie.cola.push({ x: hasta, y: dia.cola.length });
    dia.serie.turno.push({ x: hasta, y: dia.estaciones.filter((e) => e.activa).length });
  }
}

// dt: segundos reales (hojas, camiones, avisos); dtSim: minutos simulados (personas que no despachan)
function mover(dt, dtSim) {
  const k = reducirMovimiento ? 1 : 1 - Math.exp(-dt * 9);
  dia.cola.forEach((id, i) => { const p = dia.pedidos.get(id); [p.tx, p.ty] = posHoja(i); });
  let enBandeja = 0;
  for (const [id, p] of dia.pedidos) {
    p.sacude = Math.max(0, (p.sacude || 0) - dt);
    if (p.nace > 0) {                                       // la hoja sale de la impresora
      p.nace -= dt;
      const [ix, iy, iw, ih] = P.oficina.impresora, f = 1 - Math.max(0, p.nace) / 0.45;
      p.x = ix + iw / 2 - 11; p.y = iy + ih / 2 - 14 + 16 * f; p.escala = 0.4 + 0.3 * f;
      continue;
    }
    if (p.estado === 'tomando') {                           // el despachador la saca de la bandeja
      const per = dia.personas[p.est], tramo = per.trabajo && per.trabajo.tramos[1];
      if (!tramo) continue;
      const f = suave(Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0)));
      const hx = per.x + Math.cos(per.angVis) * 11 * P.esc - 11, hy = per.y + Math.sin(per.angVis) * 11 * P.esc - 14;
      p.x = p.x0 + (hx - p.x0) * f; p.y = p.y0 + (hy - p.y0) * f; p.escala = 1 - 0.65 * f;
      continue;
    }
    if (p.estado === 'asignado') { p.tx = P.tablero.bandeja[0]; p.ty = P.tablero.bandeja[1] + 6 * enBandeja++; }
    if (p.estado === 'cancelado') { p.tx = p.x; p.ty = p.y + 10; p.alfa -= dt * 1.2; p.rot = (p.rot || 0) + dt * 5; p.escala = Math.max(0.2, p.alfa); }
    else p.escala += (1 - p.escala) * k;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    if (p.alfa <= 0) dia.pedidos.delete(id);
  }
  for (const per of dia.personas) {
    const x0 = per.x, y0 = per.y;
    if (per.trabajo) {
      seguirTrabajo(per, dia.t);
      const tramo = per.trabajo.tramos[per.trabajo.fase];
      if (tramo.tipo === 'camino') {
        const f = tramo.t1 > tramo.t0 ? Math.min(1, (dia.t - tramo.t0) / (tramo.t1 - tramo.t0)) : 1;
        const [x, y, a] = puntoEn(tramo.dato, perfil(f) * largo(tramo.dato));
        per.x = x; per.y = y;
        if (a !== null && (x !== x0 || y !== y0)) per.ang = a;
      } else {
        [per.x, per.y] = tramo.dato.punto; per.ang = tramo.dato.ang;
      }
    } else if (per.ruta.length) {
      let resto = reducirMovimiento ? Infinity : VEL_CAMINAR * dtSim;
      while (resto > 0 && per.ruta.length) {
        const [tx, ty] = per.ruta[0], l = dist([per.x, per.y], [tx, ty]);
        if (l > 0.01) per.ang = Math.atan2(ty - per.y, tx - per.x);
        if (l <= resto) { per.x = tx; per.y = ty; resto -= l; per.ruta.shift(); }
        else { per.x += ((tx - per.x) * resto) / l; per.y += ((ty - per.y) * resto) / l; resto = 0; }
      }
      if (!per.ruta.length) { per.lugar = per.destino; per.ang = per.lugar.ang; }
    }
    const paso = dist([x0, y0], [per.x, per.y]);
    per.camina = paso > 0.05;
    per.paso += Math.min(paso * 0.35, dt * 13);             // a velocidades altas el paso no se vuelve un temblor
    // Gira de a poco hacia donde va, por el lado más corto
    const giro = Math.atan2(Math.sin(per.ang - per.angVis), Math.cos(per.ang - per.angVis));
    per.angVis += giro * (reducirMovimiento ? 1 : 1 - Math.exp(-dt * 14));
  }
  dia.humo.forEach((h) => { h.vida -= dt; h.x += h.vx * dt; h.y += h.vy * dt; });
  dia.humo = dia.humo.filter((h) => h.vida > 0);
  dia.avisos.forEach((a) => { a.vida -= dt; });
  dia.avisos = dia.avisos.filter((a) => a.vida > 0);
  dia.burbujas.forEach((b) => { b.vida -= dt; });
  dia.burbujas = dia.burbujas.filter((b) => b.vida > 0).slice(-3);
  moverCamiones(dt);
}

// El camión lleno arranca (acelera), se vacía fuera de la vista y vuelve frenando al andén
function moverCamiones(dt) {
  dia.flota.forEach((c, k) => {
    c.pop = Math.max(0, c.pop - dt * 3);
    if (c.fase === 'anden' && c.carga >= CARGA_VIAJE && c.enCamino === 0) { c.fase = 'cerrando'; c.viajes++; }
    if (reducirMovimiento && c.fase !== 'anden') { c.fase = 'anden'; c.d = 0; c.carga = Math.max(0, c.carga - CARGA_VIAJE); return; }
    if (c.fase === 'anden') c.puerta = Math.min(1, c.puerta + dt * 2.5);
    if (c.fase === 'cerrando') {
      c.puerta -= dt * 3;
      if (c.puerta <= 0) { c.puerta = 0; c.fase = 'saliendo'; c.vel = 0; aviso(`Sale el camión de la ruta ${k + 1} con ${CARGA_VIAJE} pedidos`); }
    } else if (c.fase === 'saliendo') {
      c.humoT -= dt;
      if (c.humoT <= 0 && c.d < 200) {                      // humo del escape, hacia atrás del camión
        c.humoT = 0.05;
        const [ox, oy] = origenCamion(k), a = P.anden.ang, e = P.escCamion, lx = 112 * e, ly = -22 * e;
        dia.humo.push({ x: ox + Math.cos(a) * lx - Math.sin(a) * ly, y: oy + Math.sin(a) * lx + Math.cos(a) * ly,
          vx: -Math.cos(a) * 25 + (Math.random() - 0.5) * 14, vy: -Math.sin(a) * 25 + (Math.random() - 0.5) * 14, vida: 0.9 });
      }
      c.vel += 700 * dt; c.d += c.vel * dt;
      if (c.d > 260) { c.fase = 'volviendo'; c.carga = Math.max(0, c.carga - CARGA_VIAJE); }   // lo que sobró espera el próximo viaje
    } else if (c.fase === 'volviendo') {
      c.d *= Math.exp(-dt * 4);
      if (c.d < 0.5) { c.d = 0; c.fase = 'anden'; }
    }
  });
}

// Velocidad al caminar: arranca, va parejo y frena al llegar (perfil trapezoidal, 12 % en cada punta)
function perfil(f, a = 0.12) {
  const v = 1 / (1 - a);
  if (f < a) return (v * f * f) / (2 * a);
  if (f > 1 - a) return 1 - (v * (1 - f) ** 2) / (2 * a);
  return v * (f - a / 2);
}
const suave = (f) => f * f * (3 - 2 * f);

/* --- Dibujo --- */

function rect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circulo(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
function elipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI); ctx.fill(); }

function cajaDibujo(x, y, w, h) {
  rect(x, y, w, h, 2);
  ctx.fillStyle = C.carton; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C['carton-borde']; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';               // cinta de embalaje
  ctx.fillRect(x + w / 2 - 1.5, y + 1, 3, h - 2);
}

// Hoja de pedido clavada en el tablero; la barra de abajo es cuánto de la espera máxima lleva.
// Se sacude al perder su camión y, si el cliente cancela, se arruga (gira y se achica) mientras se desvanece.
function dibujarHoja(p) {
  const w = 22, h = 28;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alfa));
  ctx.translate(p.x + w / 2 + (p.sacude > 0 ? Math.sin(p.sacude * 60) * 2.5 * p.sacude : 0), p.y + h / 2);
  if (p.rot) ctx.rotate(p.rot);
  ctx.scale(p.escala ?? 1, p.escala ?? 1);
  ctx.translate(-w / 2, -h / 2);
  const roja = p.perdio || p.estado === 'cancelado';
  rect(0, 0, w, h, 2);
  ctx.fillStyle = '#fbfaf6'; ctx.fill();
  ctx.lineWidth = roja ? 2.2 : 1;
  ctx.strokeStyle = roja ? C.rojo : 'rgba(0,0,0,0.25)'; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 0; i < 4; i++) ctx.fillRect(4, 7 + i * 5, i === 3 ? 8 : 14, 1.5);
  if (p.estado === 'cola' || p.estado === 'asignado') { ctx.fillStyle = C.rojo; circulo(w / 2, 2, 2.2); }   // chinche
  if (p.estado === 'cola' && !(p.nace > 0)) {
    const f = Math.min(1, (dia.t - p.llegada) / estado.T);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, h + 3, w, 3);
    ctx.fillStyle = f >= 1 ? C.rojo : C.seguridad; ctx.fillRect(0, h + 3, w * f, 3);
  }
  if (p.estado === 'cancelado') {
    ctx.strokeStyle = C.rojo; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, 4); ctx.lineTo(w - 3, h - 4);
    ctx.moveTo(w - 3, 4); ctx.lineTo(3, h - 4);
    ctx.stroke();
  }
  ctx.restore();
}

// Persona vista desde arriba: hombros, cabeza, brazos y pies que se mueven al caminar.
// En el eje local, x apunta hacia adelante (hacia donde mira) e y hacia el costado.
function dibujarPersona(x, y, ang, o) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(P.esc, P.esc);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; elipse(1.5, 2.5, 12, 10);
  ctx.rotate(ang);
  const s = o.camina ? Math.sin(o.paso) : 0;
  if (o.sentado) { rect(-12, -9, 8, 18, 3); ctx.fillStyle = C.control; ctx.fill(); }   // respaldo de la silla
  if (o.camina) {
    ctx.fillStyle = '#2c2a28';
    elipse(s * 6, -4.5, 3.8, 2.4); elipse(-s * 6, 4.5, 3.8, 2.4);
  }
  const balanceo = o.camina ? 1 + 0.05 * Math.abs(s) : 1;   // los hombros se mecen con cada paso
  ctx.fillStyle = o.ropa; elipse(0, 0, 6.5 * balanceo, 10.5);
  if (o.chaleco) {                                          // chaleco de seguridad con cinta reflectiva
    ctx.fillStyle = '#ffe7a6'; ctx.fillRect(-1.3, -9.5, 2.6, 19);
  }
  let brazos;
  if (o.carga === 'caja') { cajaDibujo(5, -8, 13, 16); brazos = [[9, -8.5], [9, 8.5]]; }
  else if (o.accion) brazos = [[5 + 3 * Math.sin(o.t), -8], [5 + 3 * Math.sin(o.t + Math.PI), 8]];
  else if (o.telefono) brazos = [[3, -8], [6, 6]];
  else if (o.come) brazos = [[6, -7], [4 + 3 * Math.max(0, Math.sin(o.t)), 7 - 4 * Math.max(0, Math.sin(o.t))]];
  else brazos = [[-s * 4.5, -9.5], [s * 4.5, 9.5]];
  ctx.fillStyle = o.piel; brazos.forEach(([bx, by]) => circulo(bx, by, 2.9));
  if (o.carga === 'hoja') { ctx.fillStyle = '#fbfaf6'; ctx.fillRect(8, 3, 6, 8); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8; ctx.strokeRect(8, 3, 6, 8); }
  ctx.fillStyle = o.pelo; circulo(-0.5, 0, 5.8);
  ctx.fillStyle = o.piel; elipse(2.8, 0, 2.6, 3.8);       // la cara, hacia adelante
  if (o.telefono) { ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6.6, -2.2, 2.2, true); ctx.stroke(); }
  ctx.restore();
  if (o.etiqueta) {
    ctx.font = `600 ${Math.round(10 * P.esc + 1)}px Barlow, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const w = ctx.measureText(o.etiqueta).width + 8, ey = y - 19 * P.esc;
    rect(x - w / 2, ey - 7, w, 14, 7); ctx.fillStyle = o.etiquetaFondo; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(o.etiqueta, x, ey + 0.5);
    ctx.textAlign = 'left';
  }
}

function franjaSeguridad(x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#1b1b1b'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.seguridad; ctx.lineWidth = 5;
  for (let i = -w - h; i < h + w; i += 14) {
    ctx.beginPath(); ctx.moveTo(x - 5, y + i); ctx.lineTo(x + w + 5, y + i + w + 10); ctx.stroke();
  }
  ctx.restore();
}

function sala(r, titulo) {
  rect(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.fondo; ctx.fill();
  ctx.strokeStyle = C.control; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C['tinta-2']; ctx.font = `600 ${P.texto - 1}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
  ctx.fillText(titulo, r.x + 10, r.y + 17);
}

const PRODUCTOS = ['#b5524a', '#3f7f5f', '#c9a227', '#4a6fa5', '#c19463', '#7a5c99'];
function dibujarEstantes() {
  const e = P.estantes, r = S.crearRng(31);
  e.filas.forEach((y) => {
    rect(e.x, y, e.w, e.alto, 3); ctx.fillStyle = C.control; ctx.fill();
    for (let x = e.x + 4; x < e.x + e.w - 12; x += 15) {
      const c = PRODUCTOS[Math.floor(r() * PRODUCTOS.length)];
      if (r() < 0.12) continue;                             // hueco en la estantería
      ctx.fillStyle = c; ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y + 3, 12, e.alto / 2 - 4); ctx.fillRect(x + 1, y + e.alto / 2 + 1, 11, e.alto / 2 - 4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C['tinta-2'];
    for (let x = e.x; x <= e.x + e.w; x += e.w / 6) ctx.fillRect(Math.min(x, e.x + e.w - 3), y, 3, e.alto);   // parantes
  });
}

function dibujarMesas() {
  for (let k = 0; k < dia.cap; k++) {
    const m = mesaRect(k);
    rect(m.x, m.y, m.w, m.h, 3); ctx.fillStyle = C.fondo; ctx.fill();
    ctx.strokeStyle = C['tinta-2']; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = C['tinta-2']; ctx.font = `500 ${P.texto - 2}px Barlow, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(`D${k + 1}`, m.x + 4, m.y + m.h / 2 + 0.5);
    const per = dia.personas[k], tr = per.trabajo;
    if (tr && tr.tramos[tr.fase].tipo === 'empacar') {
      // La caja que se está armando, con un anillo de avance
      const tramo = tr.tramos[tr.fase], f = Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0));
      const bx = m.cx - 7, by = m.y + m.h / 2 - 7;
      rect(bx, by, 14, 14, 2); ctx.fillStyle = C.carton; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = C['carton-borde']; ctx.stroke();
      const abierta = Math.max(0, 1 - f / 0.55);              // las solapas se van cerrando
      if (abierta > 0) {
        ctx.fillStyle = C.carton; ctx.strokeStyle = C['carton-borde'];
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const l = 6 * abierta, cx = m.cx + dx * 7, cy = m.y + m.h / 2 + dy * 7;
          ctx.beginPath();
          ctx.moveTo(cx - dy * 6, cy - dx * 6); ctx.lineTo(cx + dy * 6, cy + dx * 6);
          ctx.lineTo(cx + dy * 4 + dx * l, cy + dx * 4 + dy * l); ctx.lineTo(cx - dy * 4 + dx * l, cy - dx * 4 + dy * l);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 1, m.y + m.h / 2 - 0.5, 12, 1);
        const cinta = Math.min(1, Math.max(0, (f - 0.6) / 0.25)); // la cinta corre de punta a punta
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(m.cx - 1.5, by + 1, 3, 12 * cinta);
      }
      if (f > 0.9) {                                         // lista: un visto verde
        ctx.strokeStyle = C.verde; ctx.lineWidth = 2.2; ctx.beginPath();
        ctx.moveTo(m.cx + 9, m.y + 2); ctx.lineTo(m.cx + 12, m.y + 5); ctx.lineTo(m.cx + 17, m.y - 1); ctx.stroke();
      }
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.strokeStyle = C.acero; ctx.beginPath();
      ctx.arc(m.cx, m.y + m.h / 2, 11, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * f); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
}

function dibujarCamion(k) {
  const [ox, oy] = origenCamion(k), c = dia.flota[k];
  ctx.save();
  ctx.translate(ox, oy); ctx.rotate(P.anden.ang); ctx.scale(P.escCamion, P.escCamion);
  ctx.fillStyle = '#1b1b1b';
  for (const xr of [14, 88, 128]) { ctx.fillRect(xr, -31, 14, 5); ctx.fillRect(xr, 26, 14, 5); }   // llantas
  rect(0, -28, 110, 56, 3); ctx.fillStyle = C.fondo; ctx.fill();
  ctx.strokeStyle = C['tinta-2']; ctx.lineWidth = 2; ctx.stroke();
  rect(114, -25, 34, 50, 6); ctx.fillStyle = C.acero; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(138, -19, 6, 38);   // parabrisas
  if (c.fase !== 'volviendo') {
    const n = Math.min(c.carga, CARGA_VIAJE);
    for (let i = 0; i < n; i++) {
      const x = 10 + (i % 3) * 32, y = -23 + Math.floor(i / 3) * 24, e = i === n - 1 ? 1 + 0.45 * c.pop : 1;
      ctx.save(); ctx.translate(x + 13, y + 10.5); ctx.scale(e, e); cajaDibujo(-13, -10.5, 26, 21); ctx.restore();
    }
  }
  // Puertas traseras: abiertas en el andén, se cierran antes de salir
  ctx.strokeStyle = C['tinta-2']; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const giro = (Math.PI / 2 + 0.35) * c.puerta;
  for (const lado of [-1, 1]) {                             // bisagra en cada esquina; cerrada apunta al centro
    ctx.beginPath(); ctx.moveTo(0, lado * 28); ctx.lineTo(-26 * Math.sin(giro), lado * (28 - 26 * Math.cos(giro))); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
}

function dibujarBurbuja(b) {
  const [vx, vy] = P.oficina.vendedores[b.v];
  ctx.globalAlpha = Math.min(1, b.vida * 2);
  ctx.font = `600 ${P.texto - 1}px Barlow, sans-serif`; ctx.textBaseline = 'middle';
  // Globo debajo de quien atiende el teléfono
  const w = ctx.measureText(b.texto).width + 14, x = vx - w / 2, y = vy + 16 * P.esc;
  rect(x, y, w, 20, 10); ctx.fillStyle = b.malo ? C.rojo : C.tinta; ctx.fill();
  ctx.beginPath(); ctx.moveTo(vx - 5, y + 1); ctx.lineTo(vx, y - 6); ctx.lineTo(vx + 5, y + 1); ctx.fill();
  ctx.fillStyle = b.malo ? '#fff' : C.fondo; ctx.fillText(b.texto, x + 7, y + 10.5);
  ctx.globalAlpha = 1;
}

// Mientras recoge, tres productos saltan del estante a sus brazos
function dibujarRecogida(per, tramo, id) {
  const f = Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0)), a = per.angVis, e = P.esc;
  const sx = per.x + Math.cos(a) * 24 * e, sy = per.y + Math.sin(a) * 24 * e;
  const hx = per.x + Math.cos(a) * 8 * e, hy = per.y + Math.sin(a) * 8 * e;
  const caja = (x, y, i) => {
    ctx.fillStyle = PRODUCTOS[(id + i) % PRODUCTOS.length]; ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
  };
  for (let i = 0; i < 3; i++) {
    const g = (f - (0.1 + i * 0.28)) / 0.22;
    if (g >= 1) caja(hx + (i - 1) * 5 * Math.sin(a), hy - (i - 1) * 5 * Math.cos(a), i);   // ya en los brazos
    else if (g > 0) { const q = suave(g); caja(sx + (hx - sx) * q, sy + (hy - sy) * q - Math.sin(q * Math.PI) * 9, i); }
  }
}

// Lo que le queda por caminar a una persona, para dibujar su recorrido
function rutaPendiente(per) {
  if (!per.trabajo) return [[per.x, per.y], ...per.ruta];
  const tr = per.trabajo, pts = [[per.x, per.y]];
  tr.tramos.forEach((tm, i) => {
    if (i < tr.fase || tm.tipo !== 'camino') return;
    if (i > tr.fase) { pts.push(...tm.dato); return; }
    const f = tm.t1 > tm.t0 ? Math.min(1, (dia.t - tm.t0) / (tm.t1 - tm.t0)) : 1;
    let d = perfil(f) * largo(tm.dato);
    tm.dato.forEach((q, j) => { if (j) d -= dist(tm.dato[j - 1], q); if (d < 0) pts.push(q); });
  });
  return pts;
}

const ETAPAS = ['Va al tablero por la hoja del pedido', 'Toma la hoja del pedido', 'Camina al estante', 'Recoge la mercadería',
  'Lleva la mercadería a su mesa', 'Empaca el pedido', 'Lleva la caja al camión'];
function queHace(per) {
  if (per.trabajo) {
    const tr = per.trabajo;
    return [ETAPAS[tr.fase] + (tr.fase === 6 ? ` de la ruta ${tr.camion + 1}` : ''), `Pedido n.º ${tr.id + 1} · esperó ${Math.round(tr.espera)} min en el tablero`];
  }
  if (!per.activo) return [per.ruta.length ? 'Va al comedor' : 'En el comedor: almuerzo o fuera de turno'];
  return [per.ruta.length ? 'Vuelve a su mesa' : 'Libre: espera el próximo pedido'];
}

// Ficha de la persona señalada, con su recorrido pendiente marcado en el piso
function dibujarFoco(k) {
  const per = dia.personas[k], ruta = rutaPendiente(per);
  if (ruta.length > 1) {
    ctx.strokeStyle = C.acero; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = reducirMovimiento ? 0 : -performance.now() / 40;   // la línea avanza en el sentido de la marcha
    ctx.beginPath(); ruta.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);
    const [fx, fy] = ruta[ruta.length - 1];
    ctx.fillStyle = C.acero; circulo(fx, fy, 4);
  }
  ctx.strokeStyle = C.acero; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(per.x, per.y, 17 * P.esc, 0, 2 * Math.PI); ctx.stroke();
}
function dibujarFicha(k) {
  const per = dia.personas[k];
  const lineas = [`D${k + 1} · ${per.activo || per.trabajo ? 'en turno' : 'fuera de turno'}`, ...queHace(per),
    `Despachó ${per.despachados} pedido${per.despachados === 1 ? '' : 's'} hoy`];
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${P.texto}px Barlow, sans-serif`;
  const w = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 22, h = lineas.length * 18 + 12;
  let x = per.x + 22, y = per.y - h - 10;
  if (x + w > P.W - 6) x = per.x - 22 - w;
  if (y < 6) y = per.y + 22;
  x = Math.max(6, x); y = Math.min(P.H - h - 6, y);
  rect(x, y, w, h, 8); ctx.fillStyle = C.tinta; ctx.globalAlpha = 0.95; ctx.fill(); ctx.globalAlpha = 1;
  lineas.forEach((l, i) => {
    ctx.font = `${i ? 500 : 700} ${P.texto}px Barlow, sans-serif`;
    ctx.fillStyle = C.fondo; ctx.globalAlpha = i === 0 || i === 1 ? 1 : 0.75;
    ctx.fillText(l, x + 11, y + 15 + i * 18);
  });
  ctx.globalAlpha = 1;
}

// Avisos de la hora y de los camiones que salen: entran deslizándose y se desvanecen
function dibujarAvisos() {
  dia.avisos.forEach((a, i) => {
    const entra = Math.min(1, (2.6 - a.vida) / 0.3), sale = Math.min(1, a.vida / 0.5);
    ctx.font = `600 ${P.texto}px Barlow, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const w = Math.min(P.W - 24, ctx.measureText(a.texto).width + 24), [cx, cy] = P.aviso;
    const y = cy + i * 28 - (reducirMovimiento ? 0 : 10 * (1 - suave(entra)));
    ctx.globalAlpha = Math.min(entra, sale);
    rect(cx - w / 2, y - 12, w, 24, 12); ctx.fillStyle = a.malo ? C.rojo : C.tinta; ctx.fill();
    ctx.fillStyle = a.malo ? '#fff' : C.fondo; ctx.fillText(a.texto, cx, y + 0.5, w - 16);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  });
}

function dibujar() {
  ctx.clearRect(0, 0, P.W, P.H);
  ctx.fillStyle = C.suelo; ctx.fillRect(0, 0, P.W, P.H);
  ctx.strokeStyle = C.linea; ctx.lineWidth = 1; ctx.beginPath();   // juntas del piso de concreto
  for (let x = 120; x < P.W; x += 120) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, P.H); }
  for (let y = 120; y < P.H; y += 120) { ctx.moveTo(0, y + 0.5); ctx.lineTo(P.W, y + 0.5); }
  ctx.stroke();
  // Pasillos pintados en el piso
  ctx.globalAlpha = 0.5; ctx.strokeStyle = C.fondo; ctx.lineWidth = 22 * P.esc; ctx.lineCap = 'round';
  ctx.beginPath(); P.red.forEach(([x1, y1, x2, y2]) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';

  // Oficina de ventas
  const o = P.oficina;
  sala(o, 'Ventas · teléfono y vendedores');
  rect(...o.escritorio, 3); ctx.fillStyle = C.carton; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  o.vendedores.forEach(([vx]) => { ctx.fillStyle = C.tinta; ctx.fillRect(vx - 12, o.escritorio[1] + 4, 9, 12); ctx.fillStyle = C['tinta-2']; ctx.fillRect(vx + 2, o.escritorio[1] + 5, 14, 9); });
  const [ix, iy, iw, ih] = o.impresora;
  rect(ix, iy, iw, ih, 3); ctx.fillStyle = C['tinta-2']; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.fillRect(ix + 5, iy + 4, iw - 10, 4);
  o.vendedores.forEach(([vx, vy], i) => {
    const habla = dia.burbujas.some((b) => b.v === i);
    dibujarPersona(vx, vy, -Math.PI / 2 + (habla ? 0.12 * Math.sin(performance.now() / 120) : 0), {
      ropa: C.acero, piel: PIEL[(i + 3) % PIEL.length], pelo: PELO[(i + 2) % PELO.length], sentado: true, telefono: true });
    if (habla && !reducirMovimiento) {                      // ondas del teléfono que suena
      const f = (performance.now() / 600) % 1;
      ctx.strokeStyle = C.acero; ctx.lineWidth = 1.6; ctx.globalAlpha = 1 - f;
      ctx.beginPath(); ctx.arc(vx, vy, (13 + f * 9) * P.esc, -2.5, -0.65); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });

  // Tablero de pedidos pendientes (la cola) y bandeja de hojas por recoger
  const t = P.tablero;
  sala(t, 'Pedidos pendientes');
  if (dia.cola.some((id) => dia.pedidos.get(id).perdio)) {
    rect(t.x, t.y, t.w, t.h, 6); ctx.strokeStyle = C.rojo; ctx.lineWidth = 2.5;
    ctx.globalAlpha = reducirMovimiento ? 1 : 0.55 + 0.45 * Math.sin(performance.now() / 260); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const [bx, by, bw, bh] = t.bandejaRect;
  rect(bx, by, bw, bh, 3); ctx.fillStyle = C.suelo; ctx.fill(); ctx.strokeStyle = C.control; ctx.lineWidth = 1; ctx.stroke();
  const fuera = dia.cola.length - capacidadTablero();
  if (fuera > 0) {
    ctx.fillStyle = C.rojo; ctx.font = `600 ${P.texto}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`+${fuera} más`, t.x + t.w - 64, t.y + 17);
  }

  // Comedor y vestuario
  const cm = P.comedor;
  sala(cm, cm.w < 120 ? 'Comedor' : 'Comedor y vestuario');
  rect(...cm.mesa, 4); ctx.fillStyle = C.carton; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#f4f3ef'; ctx.strokeStyle = C.control; ctx.lineWidth = 1;
  cm.asientos.forEach(([x, y, a]) => { ctx.beginPath(); ctx.arc(x + Math.cos(a) * 17 * P.esc, y + Math.sin(a) * 17 * P.esc, 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); });
  const [pa, pb] = cm.puerta;                               // vano de la puerta
  ctx.strokeStyle = C.fondo; ctx.lineWidth = 4; ctx.beginPath();
  if (pa[0] !== pb[0]) { ctx.moveTo(cm.x + cm.w, pa[1] - 10); ctx.lineTo(cm.x + cm.w, pa[1] + 10); }
  ctx.stroke();

  dibujarEstantes();
  dibujarMesas();
  ctx.fillStyle = C['tinta-2']; ctx.font = `500 ${P.texto}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
  P.etiquetas.forEach(([texto, x, y]) => ctx.fillText(texto, x, y));

  // Andén: camiones (de a 6 cajas) y cajas que esperan en el piso si su camión está en ruta
  franjaSeguridad(...P.anden.franja);
  ctx.save();
  ctx.beginPath(); ctx.rect(...P.anden.clip); ctx.clip();
  [0, 1, 2].forEach(dibujarCamion);
  ctx.fillStyle = '#8a8f8c';
  dia.humo.forEach((h) => { ctx.globalAlpha = (h.vida / 0.9) * 0.35; circulo(h.x, h.y, 3 + (0.9 - h.vida) * 12); });
  ctx.globalAlpha = 1;
  ctx.restore();
  dia.flota.forEach((c, k) => {
    const b = P.anden.bahias[k], enCamion = c.fase === 'volviendo' ? 0 : Math.min(c.carga, CARGA_VIAJE);
    for (let i = 0; i < c.carga - enCamion; i++) cajaDibujo(b.pila[0] + (i % 3) * 11 - 6, b.pila[1] + Math.floor(i / 3) * 11, 10, 10);
    ctx.fillStyle = C['tinta-2']; ctx.font = `500 ${P.texto}px Barlow, sans-serif`; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = P.anden.dir ? 'center' : 'left';
    ctx.fillText(c.fase === 'anden' ? `Ruta ${k + 1}: ${Math.min(c.carga, CARGA_VIAJE)} de ${CARGA_VIAJE}` : `Ruta ${k + 1}: en camino`, ...b.texto);
    ctx.textAlign = 'left';
  });

  for (const p of dia.pedidos.values()) dibujarHoja(p);

  const foco = dia.hover ?? dia.sel;
  if (foco !== null && foco < dia.personas.length) dibujarFoco(foco);
  // Despachadores, de arriba hacia abajo para que se superpongan bien
  [...dia.personas.keys()].sort((a, b) => dia.personas[a].y - dia.personas[b].y).forEach((k) => {
    const per = dia.personas[k], tr = per.trabajo, tramo = tr && tr.tramos[tr.fase];
    const accion = tramo && (tramo.tipo === 'recoger' || tramo.tipo === 'empacar');
    const sentado = !per.activo && !per.ruta.length && per.lugar.sentado;
    const libre = per.activo && !tr && !per.ruta.length;     // libre en su mesa: mira a su alrededor
    dibujarPersona(per.x, per.y, per.angVis + (libre ? 0.4 * Math.sin(dia.t * 0.2 + k * 1.7) : 0), {
      ropa: '#ec7a1c', chaleco: true, piel: per.piel, pelo: per.pelo, camina: per.camina, paso: per.paso,
      carga: per.carga, accion, sentado, come: sentado, t: sentado ? dia.t * 0.7 + k : dia.t * 0.8,
      etiqueta: sentado ? null : `D${k + 1}`, etiquetaFondo: per.activo || tr ? C.acero : C['tinta-2'],
    });
    if (tramo && tramo.tipo === 'recoger') dibujarRecogida(per, tramo, tr.id);
  });
  dia.burbujas.forEach(dibujarBurbuja);
  // Después de las 18:00 baja la luz: son horas extra
  if (dia.t > S.CIERRE) {
    ctx.fillStyle = '#0b1630'; ctx.globalAlpha = Math.min(1, (dia.t - S.CIERRE) / 20) * 0.2;
    ctx.fillRect(0, 0, P.W, P.H); ctx.globalAlpha = 1;
  }

  // Reloj de pared
  const r = P.reloj;
  rect(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.tinta; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.font = `700 ${r.fuente}px "Barlow Condensed", sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText(reloj(dia.t), r.x + 10, r.y + r.h / 2 + 1);
  const h = Math.min(9, Math.floor(dia.t / 60));
  ctx.fillStyle = C.tinta; ctx.font = `500 ${P.texto + 1}px Barlow, sans-serif`;
  ctx.fillText(dia.t >= 600 ? 'Horas extra: se despacha lo pendiente' : `Llegan ~${(S.LAMBDA[h] * (1 + estado.crec / 100)).toFixed(1)} pedidos por hora`, r.textoX, r.y1);
  ctx.fillStyle = C['tinta-2'];
  ctx.fillText(`${dia.cola.length} pendiente${dia.cola.length === 1 ? '' : 's'} en el tablero`, r.textoX, r.y2);
  dibujarAvisos();
  if (foco !== null && foco < dia.personas.length) dibujarFicha(foco);
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
function personaEn(e) {
  const r = lienzo.getBoundingClientRect(), x = ((e.clientX - r.left) * P.W) / r.width, y = ((e.clientY - r.top) * P.H) / r.height;
  let elegida = null, dmin = 22 * P.esc;
  dia.personas.forEach((p, k) => { const d = Math.hypot(p.x - x, p.y - y); if (d < dmin) { dmin = d; elegida = k; } });
  return elegida;
}
lienzo.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  dia.hover = personaEn(e);
  lienzo.style.cursor = dia.hover === null ? '' : 'pointer';
});
lienzo.addEventListener('pointerleave', () => { dia.hover = null; lienzo.style.cursor = ''; });
lienzo.addEventListener('click', (e) => { const k = personaEn(e); dia.sel = k === dia.sel ? null : k; });

// Una frase que cuenta en palabras lo que se ve en el almacén
function narrar() {
  if (!dia.log.length) return 'Agrega al menos un despachador para ver el día.';
  if (terminado()) return `Terminó el día: se despacharon ${dia.cont.despachados} pedidos y se cancelaron ${dia.cont.cancelados}.`;
  if (dia.t === 0) return 'Pulsa Reproducir: los pedidos llegan por teléfono a ventas, se imprimen y esperan en el tablero.';
  if (dia.t >= S.CIERRE) return 'Son más de las 18:00: lo que queda en el tablero se despacha con horas extra.';
  const enCola = dia.cola.length;
  const sinCamion = dia.cola.filter((id) => dia.pedidos.get(id).perdio).length;
  const libres = dia.estaciones.filter((e) => e.activa && e.pedido === null).length;
  const comedor = dia.personas.filter((p) => !p.activo).length;
  const enComedor = comedor ? ` ${comedor} en el comedor (almuerzo o fuera de turno).` : '';
  if (!enCola) return (libres ? `Todo al día: ${libres} despachador${libres > 1 ? 'es' : ''} libre${libres > 1 ? 's' : ''} en su mesa.` : 'Todos los despachadores están trabajando y no hay pedidos esperando.') + enComedor;
  if (sinCamion) return `Hay cola: ${enCola} hoja${enCola > 1 ? 's' : ''} en el tablero y ${sinCamion} ya perdi${sinCamion > 1 ? 'eron' : 'ó'} su camión (borde rojo).` + enComedor;
  return `Se forma cola: ${enCola} hoja${enCola > 1 ? 's' : ''} en el tablero porque todos los despachadores están ocupados.` + enComedor;
}

let ultimoGrafico = 0;
function cuadro(ms) {
  const dt = ultimoMs === null ? 0 : Math.min(0.1, (ms - ultimoMs) / 1000);
  ultimoMs = ms;
  const antes = dia.t, corre = reproduciendo;
  if (reproduciendo) {
    dia.t = Math.min(dia.fin, dia.t + dt * velocidad);
    avanzar(dia.t);
    if (terminado()) ponerReproduccion(false);
    pintarContadores();
    if (graficos.dia && ms - ultimoGrafico > 150) { graficos.dia.update(); ultimoGrafico = ms; }
  }
  mover(corre ? dt : 0, dia.t - antes);
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
