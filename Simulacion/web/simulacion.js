// Modelo de simulación de eventos discretos del andén de DENLU.
// Es el mismo modelo de Denlu_Simulacion.ipynb (SimPy), reescrito en JavaScript para el navegador.

const MU_MIN = 44.5;                       // tiempo medio de despacho (min), exponencial
const MU_H = 60 / MU_MIN;
const DIAS = 299;                          // días operativos por año
const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const LAMBDA = [1.599, 6.742, 6.268, 3.064, 1.324, 1.836, 2.786, 1.505, 1.107, 0.565];
// Observado en 2025 con 3 despachadores, por hora de llegada (diagnóstico de Denlu.ipynb)
const HIST_ESPERA = [4.54, 40.77, 39.46, 4.62, 4.85, 4.55, 4.75, 4.40, 4.53, 4.77];   // min
const HIST_PERDIDA = [0, 75.15, 74.81, 0, 0, 0, 0, 0, 0, 0];                            // % de pedidos que pierden la ruta
const TICKET = 620042.58 / 801;            // venta perdida 2025 / pedidos cancelados 2025
const C_FT = 1373.50, C_PT = 686.76;       // costo mensual por trabajador (S/)
const COSTO_HORA_EXTRA = (1025 / 240) * 1.25;   // hora simple del sueldo base + 25 % (D.S. 007-2002-TR)
const CIERRE = 600;                        // 18:00, en minutos desde las 08:00
const T_CAL = 20, P_CAL = 0.28;            // calibrados en el notebook
const REPLICAS = 10, T_STUDENT = 2.262;    // t(0.975, 9)

const TURNOS = {
  'FT-1': { horario: '08–17, almuerzo 12–13', horas: [8, 9, 10, 11, 13, 14, 15, 16] },
  'FT-2': { horario: '08–17, almuerzo 13–14', horas: [8, 9, 10, 11, 12, 14, 15, 16] },
  'FT-3': { horario: '09–18, almuerzo 14–15', horas: [9, 10, 11, 12, 13, 15, 16, 17] },
  'PT-1': { horario: '09–13', horas: [9, 10, 11, 12], parcial: true },
  'PT-2': { horario: '10–14', horas: [10, 11, 12, 13], parcial: true },
  'PT-3': { horario: '14–18', horas: [14, 15, 16, 17], parcial: true },
  'Fijo': { horario: '08–18 sin almuerzo (situación actual)', horas: HORAS },
};

const PLANES = {
  actual: { nombre: 'Situación actual', plan: { Fijo: 3 } },
  rho85: { nombre: 'MILP ρ 0.85', plan: { 'FT-1': 3, 'FT-3': 1, 'PT-1': 2 } },
  rho75: { nombre: 'MILP ρ 0.75', plan: { 'FT-1': 4, 'FT-3': 1, 'PT-1': 2 } },
  rho65: { nombre: 'MILP ρ 0.65', plan: { 'FT-1': 4, 'FT-3': 1, 'PT-1': 3 } },
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
const exponencial = (rng, media) => -Math.log(1 - rng()) * media;
function poisson(rng, l) {
  const L = Math.exp(-l);
  let k = 0, prod = 1;
  do { k++; prod *= rng(); } while (prod > L);
  return k - 1;
}

const costoMensual = (plan) =>
  Object.entries(plan).reduce((s, [t, n]) => s + n * (TURNOS[t].parcial ? C_PT : C_FT), 0);

const personalPorHora = (plan) =>
  HORAS.map((h) => Object.entries(plan).reduce((s, [t, n]) => s + (TURNOS[t].horas.includes(h) ? n : 0), 0));

const requeridos = (rho, crecimiento = 0) =>
  LAMBDA.map((l) => Math.max(1, Math.ceil((l * (1 + crecimiento)) / (rho * MU_H))));

// Simula una jornada. personal[i] = despachadores en turno en la hora HORAS[i].
// Devuelve `registros` (una fila por pedido: [hora de llegada, espera (min), perdió ruta, cancelado])
// y `extraMin`: minutos-persona trabajados después del cierre de las 18:00 (horas extra).
// Si se pasa `log`, anota cada evento para reproducir la animación.
function simularDia(personal, lam, T, p, rng, log = null) {
  const cap = Math.max(1, ...personal);
  const estaciones = Array.from({ length: cap }, () => ({ activa: true, pedido: null }));
  let porSalir = 0;                        // despachadores que dejan el turno apenas terminan su pedido
  const cola = [], registros = [], agenda = [];
  let ahora = 0, seq = 0, extraMin = 0;

  const agendar = (t, tipo, dato) => {
    let i = agenda.length;
    while (i > 0 && agenda[i - 1].t > t) i--;   // agenda ordenada por tiempo; empates en orden de llegada
    agenda.splice(i, 0, { t, tipo, dato });
  };
  const anotar = (tipo, datos) => log && log.push({ t: ahora, tipo, ...datos });

  HORAS.forEach((h, i) => {
    for (let k = poisson(rng, lam[i]); k > 0; k--) agendar(60 * i + 60 * rng(), 'llegada', h);
  });
  // Cambios de turno cada hora; desde las 18:00 se despacha lo pendiente con horas extra
  [...personal, Math.max(1, personal[personal.length - 1])].forEach((n, i) => agendar(60 * i, 'turno', n));

  const despachar = () => {
    estaciones.forEach((est, idx) => {
      if (!cola.length || !est.activa || est.pedido) return;
      const ped = cola.shift();
      ped.inicio = ahora;
      est.pedido = ped;
      registros.push([ped.hora, ahora - ped.llegada, ped.perdio, false]);
      const dur = exponencial(rng, MU_MIN);
      extraMin += Math.max(0, ahora + dur - Math.max(ahora, CIERRE));
      agendar(ahora + dur, 'fin', idx);
      anotar('inicio', { id: ped.id, est: idx, dur });
    });
  };

  while (agenda.length) {
    const { t, tipo, dato } = agenda.shift();
    ahora = t;
    if (tipo === 'llegada') {
      const ped = { id: seq++, hora: dato, llegada: ahora, perdio: false };
      cola.push(ped);
      agendar(ahora + T, 'paciencia', ped);
      anotar('llegada', { id: ped.id, hora: dato });
      despachar();
    } else if (tipo === 'paciencia') {
      const ped = dato;
      if (ped.inicio !== undefined) continue;
      ped.perdio = true;
      anotar('perdio', { id: ped.id });
      if (rng() < p) {
        cola.splice(cola.indexOf(ped), 1);
        registros.push([ped.hora, T, true, true]);
        anotar('cancela', { id: ped.id });
      }
    } else if (tipo === 'fin') {
      const est = estaciones[dato];
      anotar('fin', { id: est.pedido.id, est: dato });
      est.pedido = null;
      if (porSalir > 0) { est.activa = false; porSalir--; anotar('sale', { est: dato }); }
      despachar();
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
  return { registros, extraMin };
}

const presentesDelDia = (plan, ausentismo, rng) => Object.fromEntries(
  Object.entries(plan).map(([t, n]) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (rng() >= ausentismo) k++;
    return [t, k];
  }));

// Un año (299 jornadas). Devuelve acumulados por hora de llegada.
function simularAnio(plan, { T = T_CAL, p = P_CAL, crecimiento = 0, ausentismo = 0, semilla = 0 } = {}) {
  const rng = crearRng(7919 * semilla + 1);
  const lam = LAMBDA.map((l) => l * (1 + crecimiento));
  const porHora = HORAS.map(() => ({ n: 0, espera: 0, perdio: 0, cancel: 0 }));
  let extraMin = 0;
  for (let d = 0; d < DIAS; d++) {
    const personal = personalPorHora(presentesDelDia(plan, ausentismo, rng));
    const dia = simularDia(personal, lam, T, p, rng);
    extraMin += dia.extraMin;
    for (const [h, espera, perdio, cancel] of dia.registros) {
      const s = porHora[h - 8];
      s.n++; s.espera += espera; s.perdio += perdio; s.cancel += cancel;
    }
  }
  return { porHora, horasExtra: extraMin / 60 };
}

// Indicadores con intervalo de confianza al 95 % sobre REPLICAS años simulados.
// Mismas semillas para todos los planes = números aleatorios comunes.
// La venta perdida se valora al margen bruto (margen = 1 equivale a precio de venta).
function evaluar(plan, escenario = {}) {
  const { margen = 1, costoHoraExtra = COSTO_HORA_EXTRA } = escenario;
  const suma = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const anios = Array.from({ length: REPLICAS }, (_, s) => simularAnio(plan, { ...escenario, semilla: s }));
  const metricas = anios.map(({ porHora: ph, horasExtra }) => {
    const n = suma(ph, 'n'), cancel = suma(ph, 'cancel');
    return {
      pedidos: n,
      espera: suma(ph, 'espera') / n,
      perdida: (100 * suma(ph, 'perdio')) / n,
      cancelados: (100 * cancel) / n,
      ventaPerdida: cancel * TICKET,
      margenPerdido: cancel * TICKET * margen,
      horasExtra,
      costoHorasExtra: horasExtra * costoHoraExtra,
      planilla: 12 * costoMensual(plan),
    };
  });
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
    return {
      espera: anios.reduce((s, a) => s + a.porHora[i].espera, 0) / n,
      perdida: (100 * anios.reduce((s, a) => s + a.porHora[i].perdio, 0)) / n,
    };
  });
  return res;
}

const Simulacion = {
  MU_MIN, MU_H, DIAS, HORAS, LAMBDA, HIST_ESPERA, HIST_PERDIDA, TICKET, C_FT, C_PT, COSTO_HORA_EXTRA, CIERRE, T_CAL, P_CAL, TURNOS, PLANES,
  crearRng, costoMensual, personalPorHora, requeridos, simularDia, presentesDelDia, simularAnio, evaluar,
};
if (typeof module !== 'undefined') module.exports = Simulacion;
