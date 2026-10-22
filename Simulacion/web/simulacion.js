// Modelo de simulación de eventos discretos del andén de DENLU.
// Es el mismo modelo de Denlu.ipynb (Parte II, SimPy), reescrito en JavaScript para el navegador.
// Todos los parámetros se estimaron de los 8 012 pedidos de 2025 (capítulo 1 del notebook).

const MU_MIN = 44.5;                       // preparación media de un pedido (min)
const MU_H = 60 / MU_MIN;
const DIAS = 299;                          // días operativos por año
const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const LAMBDA = [1.783, 3.575, 3.853, 3.351, 1.89, 1.458, 3.023, 3.495, 2.545, 1.823];   // pedidos por hora de llegada
const FACTOR_DIA = [1.116, 0.962, 0.997, 1.004, 1.096, 0.819];                           // lunes a sábado
const K_SERVICIO = (44.47 / 17.87) ** 2;   // la preparación es Gamma (CV 0.40), no exponencial
const K_MONTO = (2475.0 / 1414.0) ** 2;
const TICKET = 2475.0;                     // S/ promedio de un pedido
const SALIDAS = [120, 300, 480];           // camiones de las 10:00, 13:00 y 16:00, en minutos desde las 08:00
const LLEGADA_TARDE = 420;                 // 15:00: desde aquí ya no sale camión ese día
const CIERRE = 600;                        // 18:00
const P_QUIEBRE = 0.1033;                  // pedidos que encuentran un quiebre de stock
// Probabilidad de cancelar: con quiebre, según los días de reposición (1 a 4); sin quiebre solo si llega tarde
const CANCELA = { quiebre: { temprano: [0.082, 0.331, 0.51, 0.733], tarde: [0.204, 0.41, 0.579, 0.833] }, sinQuiebre: { temprano: 0, tarde: 0.0533 } };
const P_CLIENTE_PERDIDO = 0.1608;          // tras una entrega tardía (más de 24 h) se pierde el cliente: 2 pedidos futuros
const TRANSITO_H = [0.33, 1.98];
const REPLICAS = 10, T_STUDENT = 2.262;    // t(0.975, 9)

// Observado en 2025 con 3 despachadores, por hora de llegada (diagnóstico de Denlu.ipynb)
const HIST_ESPERA = [1.4, 7.33, 15.56, 20.49, 14.07, 7.78, 7.99, 11.19, 12.99, 7.34];     // min
const HIST_PERDIDA_RUTA = [1.31, 4.68, 2.17, 15.67, 8.85, 0, 7.52, 6.22, 0, 0];             // % de pedidos que pierden su camión
const HIST_CANCELADOS = [3.19, 4.12, 4.77, 4.69, 3.19, 3.9, 3.98, 10.43, 9.33, 9.54];       // %
const CAUSAS_2025 = { quiebre: 1306561.31, calendario: 504733.34, despacho: 9426.28 };       // venta perdida de 2025 (S/)

const C_FT = 1373.50, C_PT = 686.76;       // costo mensual por trabajador (S/)
const COSTO_HORA_EXTRA = (1025 / 240) * 1.25;   // hora simple del sueldo base + 25 % (D.S. 007-2002-TR)

const TURNOS = {
  'FT-1': { horario: '08–17, almuerzo 12–13', horas: [8, 9, 10, 11, 13, 14, 15, 16] },
  'FT-2': { horario: '08–17, almuerzo 13–14', horas: [8, 9, 10, 11, 12, 14, 15, 16] },
  'FT-3': { horario: '09–18, almuerzo 14–15', horas: [9, 10, 11, 12, 13, 15, 16, 17] },
  'PT-1': { horario: '09–13', horas: [9, 10, 11, 12], parcial: true },
  'PT-2': { horario: '10–14', horas: [10, 11, 12, 13], parcial: true },
  'PT-3': { horario: '14–18', horas: [14, 15, 16, 17], parcial: true },
  'Fijo': { horario: '08–18 sin almuerzo (situación actual)', horas: HORAS },
};

// Planes que entrega el MILP del notebook (anexo): el mínimo costo que cumple ρ ≤ objetivo en cada hora
const PLANES = {
  actual: { nombre: 'Situación actual', plan: { Fijo: 3 } },
  rho85: { nombre: 'MILP ρ 0.85', plan: { 'FT-1': 2, 'FT-3': 1, 'PT-1': 1, 'PT-3': 1 } },
  rho70: { nombre: 'MILP ρ 0.70', plan: { 'FT-1': 1, 'FT-2': 2, 'FT-3': 1, 'PT-2': 1, 'PT-3': 1 } },
  rho50: { nombre: 'MILP ρ 0.50', plan: { 'FT-1': 2, 'FT-2': 2, 'FT-3': 2, 'PT-3': 1 } },
};

// Generador pseudoaleatorio con semilla (mulberry32), para que cada día sea reproducible
function crearRng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(rng, l) {
  const L = Math.exp(-l);
  let k = 0, prod = 1;
  do { k++; prod *= rng(); } while (prod > L);
  return k - 1;
}
function normal(rng) {                     // Box–Muller
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}
function gamma(rng, k, escala) {           // Marsaglia–Tsang (k ≥ 1)
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng), v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = rng();
    if (Math.log(1 - u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * escala;
  }
}

const costoMensual = (plan) =>
  Object.entries(plan).reduce((s, [t, n]) => s + n * (TURNOS[t].parcial ? C_PT : C_FT), 0);

const personalPorHora = (plan) =>
  HORAS.map((h) => Object.entries(plan).reduce((s, [t, n]) => s + (TURNOS[t].horas.includes(h) ? n : 0), 0));

const requeridos = (rho, crecimiento = 0) =>
  LAMBDA.map((l) => Math.max(1, Math.ceil((l * (1 + crecimiento)) / (rho * MU_H))));

// Los pedidos de una jornada. No dependen del personal: con la misma semilla todos los planes ven los mismos pedidos.
// Cada pedido consume siempre las mismas variables aleatorias, así que cambiar un parámetro no desordena el resto.
function generarDia(rng, dia, crecimiento = 0, qQuiebre = 1) {
  const factor = FACTOR_DIA[dia % 6] * (1 + crecimiento);
  const pedidos = [];
  HORAS.forEach((h, i) => {
    const n = poisson(rng, LAMBDA[i] * factor);
    const llegadas = Array.from({ length: n }, () => 60 * i + 60 * rng());
    for (const t of llegadas) {
      const uQ = rng(), diasRep = 1 + Math.floor(4 * rng()), uC = rng();
      const prep = gamma(rng, K_SERVICIO, MU_MIN / K_SERVICIO), monto = gamma(rng, K_MONTO, TICKET / K_MONTO);
      const uCliente = rng(), transito = TRANSITO_H[0] + (TRANSITO_H[1] - TRANSITO_H[0]) * rng();
      const quiebre = uQ < P_QUIEBRE * qQuiebre, tarde = t >= LLEGADA_TARDE ? 'tarde' : 'temprano';
      const pCancela = quiebre ? CANCELA.quiebre[tarde][diasRep - 1] : CANCELA.sinQuiebre[tarde];
      pedidos.push({ t, hora: i, quiebre, cancela: uC < pCancela, prep, monto, uCliente, transito });
    }
  });
  return pedidos.sort((a, b) => a.t - b.t).map((p, id) => ({ ...p, id }));
}

// Cada pedido se asigna a la primera salida que alcanza con su preparación y pierde la ruta si no está listo a la salida.
// destino = índice del camión que se lo lleva (-1 = el primero del día hábil siguiente; el sábado, el del lunes).
function evaluarRuta(t, prep, espera, transito, dia) {
  const manana = SALIDAS[0] + 1440 * (dia % 6 === 5 ? 2 : 1);
  const k0 = SALIDAS.findIndex((s) => s >= t + prep);
  if (k0 < 0) return { k0, destino: -1, perdio: false, tardia: manana + 60 * transito - t > 1440 };
  const perdio = t + espera + prep > SALIDAS[k0];
  const destino = perdio ? (k0 + 1 < SALIDAS.length ? k0 + 1 : -1) : k0;
  const salida = destino >= 0 ? SALIDAS[destino] : manana;
  return { k0, destino, perdio, tardia: salida + 60 * transito - t > 1440 };
}

// Simula una jornada. personal[i] = despachadores en turno en la hora HORAS[i].
// Devuelve `filas` (una por pedido: [hora, espera, perdió ruta, tardía, cancelado, cliente perdido, quiebre, monto, venta perdida, causa])
// y `extraMin`: minutos-persona trabajados después del cierre de las 18:00 (horas extra).
// Si se pasa `log`, anota cada evento para reproducir la animación.
function simularDia(personal, pedidos, dia, log = null) {
  const cap = Math.max(1, ...personal);
  const estaciones = Array.from({ length: cap }, () => ({ activa: true, pedido: null }));
  let porSalir = 0;                        // despachadores que dejan el turno apenas terminan su pedido
  const cola = [], filas = [], agenda = [];
  let ahora = 0, extraMin = 0;

  const agendar = (t, tipo, dato) => {
    let i = agenda.length;
    while (i > 0 && agenda[i - 1].t > t) i--;   // agenda ordenada por tiempo; empates en orden de llegada
    agenda.splice(i, 0, { t, tipo, dato });
  };
  const anotar = (tipo, datos) => log && log.push({ t: ahora, tipo, ...datos });

  pedidos.forEach((p) => agendar(p.t, 'llegada', p));
  // Cambios de turno cada hora; desde las 18:00 se despacha lo pendiente con horas extra
  [...personal, Math.max(1, personal[personal.length - 1])].forEach((n, i) => agendar(60 * i, 'turno', n));
  if (log) SALIDAS.forEach((s, k) => agendar(s, 'salida', k));

  const despachar = () => {
    estaciones.forEach((est, idx) => {
      if (!cola.length || !est.activa || est.pedido) return;
      const p = cola.shift();
      p.inicio = ahora;
      est.pedido = p;
      const espera = ahora - p.t;
      const ruta = p.quiebre ? { destino: 'stock', perdio: false, tardia: true } : evaluarRuta(p.t, p.prep, espera, p.transito, dia);
      const perdido = ruta.tardia && p.uCliente < P_CLIENTE_PERDIDO;
      const causa = p.quiebre ? 'quiebre' : ruta.perdio ? 'despacho' : 'calendario';
      filas.push([p.hora, espera, ruta.perdio, ruta.tardia, false, perdido, p.quiebre, p.monto, perdido ? 2 * p.monto : 0, causa]);
      extraMin += Math.max(0, ahora + p.prep - Math.max(ahora, CIERRE));
      p.ruta = { ...ruta, perdido };
      agendar(ahora + p.prep, 'fin', idx);
      anotar('inicio', { id: p.id, est: idx, dur: p.prep });
    });
  };

  while (agenda.length) {
    const { t, tipo, dato } = agenda.shift();
    ahora = t;
    if (tipo === 'llegada') {
      const p = dato;
      p.inicio = undefined;                  // los pedidos se reutilizan entre planes: se limpia el estado de la simulación anterior
      const k0 = p.quiebre ? -1 : SALIDAS.findIndex((s) => s >= p.t + p.prep);
      anotar('llegada', { id: p.id, hora: p.hora, quiebre: p.quiebre, holgura: k0 >= 0 ? SALIDAS[k0] - p.prep - p.t : null });
      if (p.cancela) {                       // un pedido cancelado no entra a la cola
        filas.push([p.hora, 0, false, false, true, false, p.quiebre, p.monto, p.monto, p.quiebre ? 'quiebre' : 'calendario']);
        anotar('cancela', { id: p.id, monto: p.monto, quiebre: p.quiebre });
        continue;
      }
      cola.push(p);
      if (k0 >= 0) agendar(SALIDAS[k0] - p.prep, 'umbral', p);   // desde aquí, si no empezó, ya no llega a su camión
      despachar();
    } else if (tipo === 'umbral') {
      if (dato.inicio === undefined) anotar('perdio', { id: dato.id });
    } else if (tipo === 'fin') {
      const est = estaciones[dato], p = est.pedido;
      // El camión que se lleva el pedido puede haber salido ya mientras terminaba: va al siguiente que quede
      let camion = p.ruta.destino;
      if (typeof camion === 'number' && camion >= 0 && SALIDAS[camion] < ahora) camion = SALIDAS.findIndex((s) => s >= ahora);
      anotar('fin', { id: p.id, est: dato, camion, perdio: p.ruta.perdio, perdido: p.ruta.perdido, monto: p.monto, quiebre: p.quiebre });
      est.pedido = null;
      if (porSalir > 0) { est.activa = false; porSalir--; anotar('sale', { est: dato }); }
      despachar();
    } else if (tipo === 'salida') {
      anotar('salida', { camion: dato });
    } else if (tipo === 'turno') {
      const objetivo = cap - dato;          // puestos que deben quedar sin despachador
      let bloqueados = estaciones.filter((e) => !e.activa).length + porSalir;
      while (bloqueados > objetivo && porSalir > 0) { porSalir--; bloqueados--; }
      for (let i = 0; i < cap && bloqueados > objetivo; i++)
        if (!estaciones[i].activa) { estaciones[i].activa = true; bloqueados--; }
      for (let i = cap - 1; i >= 0 && bloqueados < objetivo; i--)
        if (estaciones[i].activa && !estaciones[i].pedido) { estaciones[i].activa = false; bloqueados++; }
      porSalir += objetivo - bloqueados;    // los que están ocupados salen al terminar
      anotar('turno', { n: dato, activas: estaciones.map((e) => e.activa) });
      despachar();
    }
  }
  return { filas, extraMin };
}

const presentesDelDia = (plan, ausentismo, rng) => Object.fromEntries(
  Object.entries(plan).map(([t, n]) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (rng() >= ausentismo) k++;
    return [t, k];
  }));

// Los pedidos de un año no dependen del plan: se generan una vez por escenario y se reutilizan al comparar planes
const cachePedidos = new Map();
function pedidosDelAnio(semilla, crecimiento, qQuiebre) {
  const clave = `${semilla}|${crecimiento}|${qQuiebre}`;
  if (!cachePedidos.has(clave)) {
    if (cachePedidos.size >= 30) cachePedidos.clear();       // 10 años por escenario: caben unos tres escenarios
    const rng = crearRng(7919 * semilla + 1);
    cachePedidos.set(clave, Array.from({ length: DIAS }, (_, d) => generarDia(rng, d, crecimiento, qQuiebre)));
  }
  return cachePedidos.get(clave);
}

// Un año (299 jornadas). Devuelve acumulados por hora de llegada y totales.
function simularAnio(plan, { crecimiento = 0, ausentismo = 0, qQuiebre = 1, semilla = 0 } = {}) {
  const dias = pedidosDelAnio(semilla, crecimiento, qQuiebre), rngAus = crearRng(104729 * semilla + 2);
  const porHora = HORAS.map(() => ({ n: 0, espera: 0, perdio: 0, cancel: 0 }));
  const t = { pedidos: 0, perdio: 0, tardia: 0, cancel: 0, cliente: 0, espera: 0, venta: 0, quiebre: 0, calendario: 0, despacho: 0 };
  let extraMin = 0;
  for (let d = 0; d < DIAS; d++) {
    const personal = personalPorHora(presentesDelDia(plan, ausentismo, rngAus));
    const dia = simularDia(personal, dias[d], d);
    extraMin += dia.extraMin;
    for (const [h, espera, perdio, tardia, cancel, cliente, , , venta, causa] of dia.filas) {
      const s = porHora[h];
      s.n++; s.espera += espera; s.perdio += perdio; s.cancel += cancel;
      t.pedidos++; t.espera += espera; t.perdio += perdio; t.tardia += tardia; t.cancel += cancel; t.cliente += cliente;
      t.venta += venta; t[causa] += venta;
    }
  }
  return { porHora, t, horasExtra: extraMin / 60 };
}

// Indicadores con intervalo de confianza al 95 % sobre REPLICAS años simulados.
// Mismas semillas para todos los planes = números aleatorios comunes.
// La venta perdida se valora al margen bruto (margen = 1 equivale a precio de venta).
function evaluar(plan, escenario = {}) {
  const { margen = 1, costoHoraExtra = COSTO_HORA_EXTRA } = escenario;
  const anios = Array.from({ length: REPLICAS }, (_, s) => simularAnio(plan, { ...escenario, semilla: s }));
  const metricas = anios.map(({ t, horasExtra }) => ({
    pedidos: t.pedidos,
    espera: t.espera / t.pedidos,
    perdida: (100 * t.perdio) / t.pedidos,
    tardias: (100 * t.tardia) / t.pedidos,
    cancelados: (100 * t.cancel) / t.pedidos,
    clientesPerdidos: (100 * t.cliente) / t.pedidos,
    ventaPerdida: t.venta,
    ventaQuiebre: t.quiebre,
    ventaCalendario: t.calendario,
    ventaDespacho: t.despacho,
    margenPerdido: t.venta * margen,
    horasExtra,
    costoHorasExtra: horasExtra * costoHoraExtra,
    planilla: 12 * costoMensual(plan),
  }));
  const res = {};
  for (const k of Object.keys(metricas[0])) {
    const v = metricas.map((m) => m[k]);
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / (v.length - 1));
    res[k] = media;
    res[k + 'IC'] = (T_STUDENT * sd) / Math.sqrt(v.length);
  }
  res.costoTotal = res.planilla + res.costoHorasExtra + res.margenPerdido;
  res.porHora = HORAS.map((_, i) => {
    const n = anios.reduce((s, a) => s + a.porHora[i].n, 0);
    const suma = (k) => anios.reduce((s, a) => s + a.porHora[i][k], 0);
    return { espera: suma('espera') / n, perdida: (100 * suma('perdio')) / n, cancelados: (100 * suma('cancel')) / n };
  });
  return res;
}

const Simulacion = {
  MU_MIN, MU_H, DIAS, HORAS, LAMBDA, FACTOR_DIA, SALIDAS, LLEGADA_TARDE, CIERRE, P_QUIEBRE, P_CLIENTE_PERDIDO, TICKET,
  HIST_ESPERA, HIST_PERDIDA_RUTA, HIST_CANCELADOS, CAUSAS_2025, C_FT, C_PT, COSTO_HORA_EXTRA, TURNOS, PLANES,
  crearRng, costoMensual, personalPorHora, requeridos, generarDia, evaluarRuta, simularDia, presentesDelDia, simularAnio, evaluar,
};
if (typeof module !== 'undefined') module.exports = Simulacion;
