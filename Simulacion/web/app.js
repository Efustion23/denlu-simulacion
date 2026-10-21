// Interfaz: controles, animación del almacén (canvas) y gráficos (Chart.js).
const S = Simulacion;
const $ = (id) => document.getElementById(id);

const INICIAL = { crec: 0, aus: 0, T: S.T_CAL, p: S.P_CAL, margen: 100, hx: Number(S.COSTO_HORA_EXTRA.toFixed(2)) };
const estado = { plan: { ...S.PLANES.rho85.plan }, preset: 'rho85', ...INICIAL };
const escenario = () => ({ crecimiento: estado.crec / 100, ausentismo: estado.aus / 100, T: estado.T, p: estado.p,
  margen: estado.margen / 100, costoHoraExtra: estado.hx });
const totalPersonas = (plan) => Object.values(plan).reduce((a, b) => a + b, 0);

const soles = (v) => 'S/ ' + Math.round(v).toLocaleString('es-PE');
const reloj = (min) => {
  const m = Math.floor(min) + 8 * 60;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

let C = {};
function leerColores() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['fondo', 'panel', 'suelo', 'tinta', 'tinta-2', 'linea', 'seguridad', 'carton', 'carton-borde',
    'acero', 'rojo', 'verde', 'serie-plan', 'serie-actual', 'control']) C[k] = cs.getPropertyValue('--' + k).trim();
}

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
  const pt = Object.entries(estado.plan).reduce((s, [t, n]) => s + (S.TURNOS[t].parcial ? n : 0), 0);
  $('avisoPT').hidden = pt <= 0.4 * totalPersonas(estado.plan);
  actualizarCobertura();
  nuevoDia();
  programarAnio();
}

// [formato, ¿cambia la simulación del día?]. Margen y hora extra solo cambian la valoración.
const deslizadores = {
  crec: [(v) => `+${v} %`, true], aus: [(v) => `${v} %`, true], T: [(v) => `${v} min`, true],
  p: [(v) => Number(v).toFixed(2), true], margen: [(v) => `${v} %`, false], hx: [(v) => `S/ ${Number(v).toFixed(2)}`, false],
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
    options: opcionesBase('Pedidos que pierden su ruta por hora de llegada (%)'),
  });

  actualizarCobertura();
  if (dia) graficos.dia.data.datasets.forEach((ds, i) => { ds.data = i ? dia.serie.turno : dia.serie.cola; });
  if (resultados) pintarAnio();
}

function actualizarCobertura() {
  if (!graficos.cobertura) return;
  const g = graficos.cobertura;
  g.data.datasets[0].data = S.personalPorHora(estado.plan);
  g.data.datasets[1].data = S.requeridos(0.85, estado.crec / 100);
  g.update();
}

/* ---------- Año simulado ---------- */

let temporizador = null;
const cacheActual = new Map();
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
      return;
    }
    const esc = escenario();
    const clave = JSON.stringify(esc);
    if (!cacheActual.has(clave)) cacheActual.set(clave, S.evaluar(S.PLANES.actual.plan, esc));
    resultados = { plan: S.evaluar(estado.plan, esc), actual: cacheActual.get(clave) };
    pintarAnio();
  }, 200);
}

function pintarAnio() {
  const { plan, actual } = resultados;
  const filas = [
    ['Espera media', 'espera', (v) => v.toFixed(1) + ' min'],
    ['Pedidos que pierden su ruta', 'perdida', (v) => v.toFixed(1) + ' %'],
    ['Pedidos cancelados', 'cancelados', (v) => v.toFixed(2) + ' %'],
    ['Horas extra al año', 'horasExtra', (v) => v.toFixed(0) + ' h'],
    ['Venta perdida al año (precio de venta)', 'ventaPerdida', soles],
    // Con margen 100 % el margen perdido es la misma cifra que la venta perdida: no se repite
    ...(estado.margen < 100 ? [[`Margen perdido al año (${estado.margen} %)`, 'margenPerdido', soles]] : []),
    ['Planilla al año', 'planilla', soles],
    ['Costo de horas extra al año', 'costoHorasExtra', soles],
    ['Costo total al año', 'costoTotal', soles, 'total'],
  ];
  const celda = (r, k, fmt) => `<td class="cifra">${fmt(r[k])}${r[k + 'IC'] ? `<span class="ic">± ${fmt(r[k + 'IC'])}</span>` : ''}</td>`;
  const marca = (c) => `<span class="marca-serie" style="background:${c}"></span>`;
  const signo = (d, fmt) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d))}`;
  $('resultados').innerHTML = `
    <thead><tr><th>Indicador</th><th>${marca(C['serie-plan'])}Plan elegido</th><th>${marca(C['serie-actual'])}Situación actual</th><th>Diferencia</th></tr></thead>
    <tbody>${filas.map(([nombre, k, fmt, clase = '']) => {
      const d = plan[k] - actual[k];
      const tono = Math.abs(d) < 1e-9 ? '' : d < 0 ? 'mejor' : 'peor';
      return `<tr class="${clase}"><td>${nombre}</td>${celda(plan, k, fmt)}${celda(actual, k, fmt)}<td class="cifra ${tono}">${signo(d, fmt)}</td></tr>`;
    }).join('')}</tbody>`;
  $('resultados').setAttribute('aria-busy', 'false');

  // Resumen: la cifra que responde la pregunta de la pantalla (¿cuántos pedidos se cancelan?) va primero y más grande
  const kpi = (etiqueta, valor, pie, lider = false) =>
    `<div class="${lider ? 'lider' : ''}"><dt>${etiqueta}</dt><dd>${valor}</dd><span class="pie">${pie}</span></div>`;
  const dif = (d, fmt) => `<span class="${Math.abs(d) < 1e-9 ? '' : d < 0 ? 'bien' : 'mal'}">${signo(d, fmt)}</span>`;
  const pct2 = (v) => v.toFixed(2) + ' %', min1 = (v) => v.toFixed(1) + ' min';
  $('kpis').innerHTML = [
    kpi('Pedidos que se cancelan', pct2(plan.cancelados), `${dif(plan.cancelados - actual.cancelados, pct2)} frente a la situación actual (${pct2(actual.cancelados)})`, true),
    kpi('Espera promedio de un pedido', min1(plan.espera), `${dif(plan.espera - actual.espera, min1)} frente a la situación actual`),
    kpi('Costo total al año', soles(plan.costoTotal), `${dif(plan.costoTotal - actual.costoTotal, soles)} frente a la situación actual`),
    kpi('Planilla al mes', soles(S.costoMensual(estado.plan)), `${totalPersonas(estado.plan)} despachadores`),
  ].join('');
  $('kpis').setAttribute('aria-busy', 'false');
  $('ayuda').textContent = `Cómo leerlo: un pedido que espera más de ${estado.T} min pierde su camión y, a veces, el cliente cancela. `
    + `El costo total suma la planilla, las horas extra y lo que se deja de vender. Todo se compara con hoy: 3 despachadores fijos.`;

  // Hallazgo: la hora en que el plan elegido pierde más rutas
  const peor = plan.porHora.reduce((m, h, i) => (h.perdida > plan.porHora[m].perdida ? i : m), 0);
  const horaPeor = `${S.HORAS[peor]}:00`;
  $('hallazgo').innerHTML = plan.porHora[peor].perdida < 5
    ? `Ninguna hora pierde más del 5 % de sus rutas con este plan.`
    : `Hora más débil: <strong>${horaPeor}</strong>, donde ${plan.porHora[peor].perdida.toFixed(0)} % de los pedidos pierde su ruta con ${S.personalPorHora(estado.plan)[peor]} despachador${S.personalPorHora(estado.plan)[peor] === 1 ? '' : 'es'} en turno.`;

  // Inversión = planilla + horas extra; lo recuperado se valora al margen bruto elegido
  const inversion = plan.planilla + plan.costoHorasExtra - actual.planilla - actual.costoHorasExtra;
  const recuperado = actual.margenPerdido - plan.margenPerdido;
  const beneficio = recuperado - inversion;
  const pctRec = (100 * recuperado) / actual.margenPerdido;
  const que = estado.margen === 100 ? 'en ventas' : `de margen bruto (margen de ${estado.margen} %)`;
  $('roi').textContent = Math.abs(inversion) < 1 && Math.abs(recuperado) < 1
    ? 'Es el mismo plan que la situación actual.'
    : inversion > 0
      ? `Este plan cuesta ${soles(inversion)} más al año en planilla y horas extra, y recupera ${soles(recuperado)} ${que}, el ${pctRec.toFixed(0)} % de lo que hoy se pierde. Beneficio neto: ${soles(beneficio)} al año, un retorno de ${Math.round((100 * beneficio) / inversion).toLocaleString('es-PE')} %.`
      : `Este plan ahorra ${soles(-inversion)} al año en planilla y horas extra, y cambia lo perdido ${que} en ${soles(-recuperado)}. Efecto neto: ${soles(beneficio)} al año.`;

  if (!window.Chart) return;
  graficos.espera.data.datasets[0].data = plan.porHora.map((h) => h.espera);
  graficos.espera.data.datasets[1].data = actual.porHora.map((h) => h.espera);
  graficos.perdida.data.datasets[0].data = plan.porHora.map((h) => h.perdida);
  graficos.perdida.data.datasets[1].data = actual.porHora.map((h) => h.perdida);
  graficos.espera.update();
  graficos.perdida.update();
}

/* ---------- Animación de un día ---------- */

const W = 960, H = 430, CAJA = 24, CELDA = 34, FILAS = 7, COLUMNAS = 12;
const lienzo = $('lienzo'), ctx = lienzo.getContext('2d');
const dpr = window.devicePixelRatio || 1;
lienzo.width = W * dpr; lienzo.height = H * dpr;
ctx.scale(dpr, dpr);

const ZONA = { colaX: 520, colaY: 112, estX: 590, estW: 170, estY: 40, estH: 345, camionX: 812 };
const posCola = (i) => {
  const col = Math.min(COLUMNAS, Math.floor(i / FILAS));
  return [ZONA.colaX - col * CELDA, ZONA.colaY + (i % FILAS) * CELDA];
};
const altoEstacion = () => Math.min(46, ZONA.estH / dia.cap);
const posEstacion = (k) => [ZONA.estX + ZONA.estW - CAJA - 10, ZONA.estY + k * altoEstacion() + (altoEstacion() - 6 - CAJA) / 2];
// Cada camión lleva 6 cajas por viaje (3 × 2 en la tolva): al llenarse sale, se vacía y vuelve.
// Es solo visual: la pérdida de ruta del modelo depende de la espera máxima T, no de estos viajes.
const CARGA_VIAJE = 6, CAJA_CHICA = 18;
const yCamion = (k) => 62 + k * 110;
const posCarga = (k, i) => [ZONA.camionX + 12 + (i % 3) * 28 + dia.flota[k].dx, yCamion(k) + 18 + Math.floor(i / 3) * 22];

let dia = null, semillaDia = 1, reproduciendo = false, velocidad = 15, ultimoMs = null;
const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    flota: [0, 1, 2].map(() => ({ carga: 0, enCamino: 0, dx: 0, fase: 'anden', viajes: 0 })), faltaron: totalPersonas(estado.plan) - totalPersonas(presentes),
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
      p.escala = 1 - e * (1 - CAJA_CHICA / CAJA);
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

// El camión lleno arranca (acelera hacia la derecha), se vacía fuera de la vista y vuelve frenando al andén
function moverCamiones(dt) {
  for (const c of dia.flota) {
    if (c.fase === 'anden' && c.carga >= CARGA_VIAJE && c.enCamino === 0) {
      c.fase = 'saliendo'; c.vel = 0; c.viajes++;
    }
    if (reducirMovimiento && c.fase !== 'anden') { c.fase = 'anden'; c.dx = 0; c.carga = Math.max(0, c.carga - CARGA_VIAJE); continue; }
    if (c.fase === 'saliendo') {
      c.vel += 900 * dt; c.dx += c.vel * dt;
      if (c.dx > 200) { c.fase = 'volviendo'; c.carga = Math.max(0, c.carga - CARGA_VIAJE); }   // lo que sobró espera el próximo viaje
    } else if (c.fase === 'volviendo') {
      c.dx *= Math.exp(-dt * 5);
      if (c.dx < 0.5) { c.dx = 0; c.fase = 'anden'; }
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

function dibujar() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.suelo; ctx.fillRect(0, 0, W, H);
  // Juntas de las losas del piso de concreto
  ctx.strokeStyle = C.linea; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 140; x < 566; x += 140) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 140; y < H; y += 140) { ctx.moveTo(0, y + 0.5); ctx.lineTo(566, y + 0.5); }
  ctx.stroke();
  // Entrada de pedidos: flecha pintada en el piso
  ctx.fillStyle = C.seguridad; ctx.beginPath();
  ctx.moveTo(4, 212); ctx.lineTo(22, 224); ctx.lineTo(4, 236); ctx.closePath(); ctx.fill();
  franjaSeguridad(566, 0, 8, H);
  franjaSeguridad(784, 0, 8, H);

  ctx.font = '500 13px Barlow, sans-serif'; ctx.fillStyle = C['tinta-2']; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Cola de pedidos', 20, H - 14);
  ctx.fillText('Despachadores', ZONA.estX, H - 14);
  ctx.fillText('Andén de carga', ZONA.camionX, H - 14);

  // Reloj de pared
  rect(18, 16, 132, 60, 6); ctx.fillStyle = C.tinta; ctx.fill();
  ctx.fillStyle = C.fondo; ctx.font = '700 44px "Barlow Condensed", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(reloj(dia.t), 30, 47);
  const h = Math.min(9, Math.floor(dia.t / 60));
  ctx.fillStyle = C.tinta; ctx.font = '500 15px Barlow, sans-serif';
  ctx.fillText(dia.t >= 600 ? 'Horas extra: se despacha lo pendiente' : `Llegan ~${(S.LAMBDA[h] * (1 + estado.crec / 100)).toFixed(1)} pedidos por hora`, 166, 36);
  ctx.fillStyle = C['tinta-2'];
  ctx.fillText(`${dia.cola.length} en cola` + (dia.cola.length > FILAS * (COLUMNAS + 1) ? ' (no todos se ven)' : ''), 166, 58);

  // Despachadores
  const ah = altoEstacion();
  dia.estaciones.forEach((e, k) => {
    const y = ZONA.estY + k * ah;
    rect(ZONA.estX, y, ZONA.estW, ah - 6, 4);
    ctx.fillStyle = e.activa ? C.fondo : C.suelo; ctx.fill();
    // Puesto vacío: contorno punteado, como una marca en el piso
    ctx.setLineDash(e.activa ? [] : [4, 3]);
    ctx.strokeStyle = e.activa ? C.linea : C.control; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    const cy = y + (ah - 6) / 2, r = Math.min(8, (ah - 10) / 2);
    ctx.beginPath(); ctx.arc(ZONA.estX + 14, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = e.activa ? C.acero : C.linea; ctx.fill();
    ctx.fillStyle = e.activa ? C.tinta : C['tinta-2']; ctx.font = `500 ${Math.min(14, ah - 10)}px Barlow, sans-serif`;
    ctx.fillText(e.activa ? `D${k + 1}` : `D${k + 1} fuera de turno`, ZONA.estX + 28, cy);
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
  ctx.beginPath(); ctx.rect(792, 0, W - 792, H); ctx.clip();
  dia.flota.forEach((c, k) => {
    const x = ZONA.camionX + c.dx, y = yCamion(k);
    rect(x, y, 104, 64, 4); ctx.fillStyle = C.fondo; ctx.fill();
    ctx.strokeStyle = C.linea; ctx.lineWidth = 1.5; ctx.stroke();
    rect(x + 108, y + 18, 34, 46, 5); ctx.fillStyle = C.acero; ctx.fill();
    ctx.fillStyle = C.fondo; ctx.fillRect(x + 124, y + 24, 14, 14);
    ctx.fillStyle = C.tinta;
    for (const xr of [x + 18, x + 84, x + 126]) { ctx.beginPath(); ctx.arc(xr, y + 68, 7, 0, 2 * Math.PI); ctx.fill(); }
    if (c.fase !== 'volviendo') {
      for (let i = 0; i < Math.min(c.carga, CARGA_VIAJE); i++) {
        const [cx, cy] = posCarga(k, i);
        cajaDibujo(cx, cy, CAJA_CHICA, false);
      }
    }
  });
  ctx.restore();
  ctx.fillStyle = C['tinta-2']; ctx.font = '500 13px Barlow, sans-serif'; ctx.textBaseline = 'alphabetic';
  dia.flota.forEach((c, k) => {
    const texto = c.fase === 'anden' ? `Camión ${k + 1}: ${Math.min(c.carga, CARGA_VIAJE)} de ${CARGA_VIAJE}` : `Camión ${k + 1}: en ruta`;
    ctx.fillText(texto, ZONA.camionX, yCamion(k) - 8);
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
sincronizarDeslizadores();
crearGraficos();
cambioPlan();
if (!window.Chart) {
  document.querySelectorAll('.grafico').forEach((g) => { g.innerHTML = '<p>Los gráficos necesitan conexión a internet (Chart.js).</p>'; g.style.height = 'auto'; });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { leerColores(); crearGraficos(); });
document.fonts.ready.then(crearGraficos);   // redibuja los gráficos con la tipografía ya cargada
if (!reducirMovimiento) ponerReproduccion(true);
requestAnimationFrame(cuadro);
