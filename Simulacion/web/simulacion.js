// Datos de Denlu.ipynb (diagnóstico, MILP, métricas de colas y ROI), agregados del CSV de 2025 que lee el
// notebook y el modelo de eventos discretos que anima un día en el almacén.

const MU_MIN = 44.5;                       // tiempo medio de despacho (min), exponencial
const MU_H = 60 / MU_MIN;
const DIAS = 299;                          // días operativos por año
const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
// Celda 1 de Denlu.ipynb: llegadas por hora (pedidos de la hora / 299 días), con 3 despachadores
const LAMBDA = [1.783, 3.575, 3.853, 3.351, 1.890, 1.458, 3.023, 3.495, 2.545, 1.823];
const HIST_ESPERA = [1.40, 7.33, 15.56, 20.49, 14.07, 7.78, 7.99, 11.19, 12.99, 7.34];   // min
const HIST_PERDIDA = [1.31, 4.68, 2.17, 15.67, 8.85, 0.00, 7.52, 6.22, 0.00, 0.00];     // % de pedidos que pierden la ruta
const C_FT = 1373.50, C_PT = 686.76;       // costo mensual por trabajador (S/)
const COSTO_HORA_EXTRA = (1025 / 240) * 1.25;   // hora simple del sueldo base + 25 % (D.S. 007-2002-TR)
const CIERRE = 600;                        // 18:00, en minutos desde las 08:00
// Animación: el 5.82 % de los pedidos llega sin stock y se cancela sin entrar a la cola (466 "Sin preparar" en el CSV);
// un pedido que espera más de T_CAL min pierde su ruta (calibrado para repetir el 5.27 % de rutas perdidas de 2025).
const P_QUIEBRE = 466 / 8012;
const T_CAL = 72, P_CAL = 0;
const TICKET = 1200779.61 / 466;           // venta media de un pedido cancelado en 2025 (S/)
const REPLICAS = 10, T_STUDENT = 2.262;    // t(0.975, 9)

const TURNOS = {
  'FT-1': { horario: '08–17, almuerzo 12–13', horas: [8, 9, 10, 11, 13, 14, 15, 16] },
  'FT-2': { horario: '08–17, almuerzo 13–14', horas: [8, 9, 10, 11, 12, 14, 15, 16] },
  'FT-3': { horario: '09–18, almuerzo 14–15', horas: [9, 10, 11, 12, 13, 15, 16, 17] },
  'PT-1': { horario: '09–13', horas: [9, 10, 11, 12], parcial: true },
  'PT-2': { horario: '10–14', horas: [10, 11, 12, 13], parcial: true },
  'PT-3': { horario: '14–18', horas: [14, 15, 16, 17], parcial: true },
  'Fijo': { horario: '08–18 sin almuerzo (situación actual)', horas: HORAS },
  // Sección 6 del notebook: jornada de 10 h como la de hoy (2 h extra) y personal por horas (mismo costo por hora que el medio tiempo)
  'FT 10 h': { horario: '08–18, 2 h extra diarias', horas: HORAS, costo: 1663.48 },
  'H 09-12': { horario: 'por horas 09–12', horas: [9, 10, 11], parcial: true, porHoras: true, costo: 3 * C_PT / 4 },
  'H 11-13': { horario: 'por horas 11–13', horas: [11, 12], parcial: true, porHoras: true, costo: 2 * C_PT / 4 },
  'H 14-16': { horario: 'por horas 14–16', horas: [14, 15], parcial: true, porHoras: true, costo: 2 * C_PT / 4 },
  'H 15-18': { horario: 'por horas 15–18', horas: [15, 16, 17], parcial: true, porHoras: true, costo: 3 * C_PT / 4 },
};

const WQ_MAX = 15;                         // plan alternativo: espera media en cola de a lo más 15 min en cada hora
const PLANES = {
  actual: { nombre: 'Hoy: 3 fijos', plan: { Fijo: 3 } },
  milp: { nombre: 'Plan MILP', plan: { 'FT-1': 2, 'FT-3': 1, 'PT-1': 1, 'PT-3': 1 } },   // solución de la celda 7 (SCIP)
  // Propuesta adicional (no está en el notebook): el mismo MILP con la condición extra Wq ≤ 15 min en cada hora
  alternativo: { nombre: `Plan con espera ≤ ${WQ_MAX} min`, plan: { 'FT-1': 2, 'FT-2': 1, 'FT-3': 2, 'PT-3': 1 } },
  // Sección 6 del notebook: el más barato con ρ < 1 que no empeora el servicio de hoy (MILP + simulación, sin tope de part-time)
  recomendado: { nombre: 'Plan recomendado (ρ < 1)', plan: { 'FT 10 h': 1, 'FT-1': 1, 'H 09-12': 1, 'H 11-13': 1, 'H 14-16': 1, 'H 15-18': 1 } },
};

// Salidas de Denlu.ipynb que no dependen del modelo de simulación
const NOTEBOOK = {
  rho: [0.441, 0.884, 0.953, 0.828, 0.467, 0.360, 0.747, 0.864, 0.629, 0.451],   // celda 1
  rhoObjetivo: 0.85,
  limiteSeguridad: 0.80,                   // celda 25
  costoMilp: 5494.02,                      // celda 7
  wqMilp: [34.57, 12.30, 17.58, 9.25, 42.97, 2.55, 33.09, 11.11, 3.11, 37.45],   // celda 13
  entreLlegadas: 25.03,                    // celda 19: promedio de 60/λ de las 10 horas (min)
  poisson: { media: 2.981, varianza: 3.143, razon: 1.055 },                     // celda 23
  cancelacionPct: 5.82,                    // celda 11
  ventaPerdida: 1820720.93,                // celda 11: venta perdida anual (S/)
  recuperacion: 0.95,                      // celda 10: supuesto de ventas recuperadas con el plan óptimo
  roi: { inversion: 16482.24, recuperado: 1729684.88, beneficio: 1713202.64, roi: 10394.23 },   // celda 11
};

// Agregados del CSV de 2025 que lee el notebook (8 012 pedidos, 299 días), para demostrar que se forma una cola.
// Se calculan con agregados_csv.py; el CSV no se publica.
const CSV = {
  pedidos: 8012, preparados: 7546, esperaron: 3103, diasCola3: 178,
  diasPor: { 3: 275, 4: 24 },              // días con 3 despachadores y con 4 (diciembre)
  esperaronPct: [7.6, 34.2, 54.1, 59.2, 43.1, 29.1, 31.9, 46.4, 47.2, 32.3],      // % de pedidos que esperaron
  p90: [0.0, 29.6, 51.2, 62.6, 48.3, 32.6, 31.1, 40.8, 43.8, 27.1],               // min: el 10 % que más espera
  colaMax: [4, 6, 9, 9, 10, 10, 8, 8, 9, 8],                                      // pedidos en cola, máximo del año
  rutaPerdidas: 422, rutaConEspera: 422,
  // Pedidos en cola cada 5 min (08:00 a 19:00): promedio de los 299 días y el peor día (martes 25-11-2025)
  colaProm5: [0, 0, 0, 0, 0.001, 0.011, 0.018, 0.038, 0.045, 0.05, 0.065, 0.072, 0.072, 0.092, 0.109, 0.153, 0.228, 0.288, 0.31, 0.37, 0.405, 0.437, 0.468, 0.485, 0.496, 0.538, 0.613, 0.667, 0.731, 0.77, 0.795, 0.817, 0.833, 0.866, 0.872, 0.922, 0.967, 1.01, 1.022, 1.062, 1.055, 1.043, 1.055, 1.055, 1.047, 1.054, 1.035, 1.024, 1.001, 0.95, 0.892, 0.837, 0.787, 0.752, 0.691, 0.686, 0.649, 0.591, 0.563, 0.525, 0.5, 0.461, 0.437, 0.427, 0.381, 0.337, 0.324, 0.287, 0.267, 0.26, 0.25, 0.219, 0.217, 0.219, 0.225, 0.255, 0.266, 0.274, 0.27, 0.298, 0.34, 0.36, 0.419, 0.43, 0.45, 0.495, 0.48, 0.471, 0.5, 0.492, 0.513, 0.561, 0.597, 0.632, 0.668, 0.694, 0.693, 0.66, 0.632, 0.573, 0.572, 0.585, 0.603, 0.579, 0.561, 0.575, 0.599, 0.591, 0.546, 0.494, 0.472, 0.438, 0.379, 0.335, 0.31, 0.295, 0.3, 0.3, 0.294, 0.276, 0.237, 0.181, 0.151, 0.119, 0.102, 0.076, 0.058, 0.041, 0.03, 0.03, 0.029, 0.014],
  colaPeor5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 2, 2, 4, 3, 4, 3, 2, 2, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 7, 6, 6, 7, 8, 8, 8, 8, 8, 8, 9, 9, 8, 8, 8, 7, 7, 7, 8, 8, 10, 10, 10, 10, 10, 10, 10, 9, 10, 9, 9, 9, 7, 7, 7, 7, 7, 6, 5, 6, 6, 7, 7, 6, 6, 6, 6, 5, 5, 5, 3, 3, 5, 5, 5, 4, 5, 5, 7, 8, 7, 7, 7, 7, 6, 7, 8, 8, 9, 9, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 5, 5, 4, 3, 3, 3, 3, 2, 1, 1, 1, 1],
  peorDia: { fecha: 'martes 25 de noviembre de 2025', pedidos: 43, rutaPerdida: 15, esperaMedia: 81.3 },
  // Llegadas por hora (horas con al menos un pedido, como en la celda 23): cuántas horas tuvieron k pedidos
  frecuencias: [608, 665, 544, 384, 229, 129, 73, 33, 20, 2, 0, 1],               // k = 1 … 12
  // Causas de la venta perdida de 2025 (S/)
  causas: [
    { causa: 'Cancelado por quiebre de stock', pedidos: 353, monto: 917940.25 },
    { causa: 'Cancelado sin preparar (otras causas)', pedidos: 113, monto: 282839.36 },
    { causa: 'Cliente perdido tras quiebre de stock', pedidos: 72, monto: 388621.06 },
    { causa: 'Cliente perdido tras otras entregas tardías', pedidos: 41, monto: 221893.98 },
    { causa: 'Cliente perdido tras perder la ruta (espera)', pedidos: 2, monto: 9426.28, espera: true },
  ],
};

// Sección 6 de Denlu.ipynb: optimización realista (MILP + simulación de 5 años por plan). costoHoyReal suma las 2 h extra
// diarias de hoy; totalHoy y total de cada plan suman además las horas extra después de las 18:00 que da la simulación.
const OPTIMIZACION = {"costoHoyBase": 4120.5, "costoExtraHoy": 869.94, "costoHoyReal": 4990.44, "totalHoy": 5208.46, "totalMilp": 5693.91, "costo10h": 1663.48, "equilibrioPct": 13.6, "horasPorHoras": 10, "minimosRho1": [2, 3, 3, 3, 2, 2, 3, 3, 2, 2], "hoy": {"espera": 14.03, "perdida": 5.67, "ocio_h": 12.81, "utilizacion": 57.31, "extra_h_mes": 37.47}, "milp": {"espera": 8.4, "perdida": 2.78, "ocio_h": 14.53, "utilizacion": 54.6, "extra_h_mes": 34.35}, "filas": [
    {"modalidad": "Jornada de 10 h (como hoy) + medio tiempo + por horas", "tope": false, "conPT": true, "plan": {"FT 10 h (08-18, 2 h extra)": 1, "FT-1 (08-17, alm. 12-13)": 1, "Por horas 11-13": 1, "Por horas 14-16": 1, "Por horas 09-12": 1, "Por horas 15-18": 1}, "personas": 6, "cobertura": [2, 3, 3, 4, 2, 2, 3, 4, 3, 2], "planilla": 4753.88, "extra": 221.55, "total": 4975.43, "ahorro": 233.02, "espera": 13.92, "perdida": 5.59, "utilizacion": 61.0, "ocio": 10.9},
    {"modalidad": "Full-time + medio tiempo + por horas", "tope": false, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 1, "FT-3 (09-18, alm. 14-15)": 1, "PT 08-12": 1, "PT 14-18": 1, "Por horas 11-13": 1, "Por horas 14-16": 1}, "personas": 6, "cobertura": [2, 3, 3, 4, 2, 2, 3, 4, 3, 2], "planilla": 4807.28, "extra": 221.55, "total": 5028.83, "ahorro": 179.63, "espera": 13.92, "perdida": 5.59, "utilizacion": 61.0, "ocio": 10.9},
    {"modalidad": "Jornada de 10 h (como hoy) + medio tiempo + por horas", "tope": true, "conPT": true, "plan": {"FT 10 h (08-18, 2 h extra)": 1, "FT-1 (08-17, alm. 12-13)": 1, "FT-3 (09-18, alm. 14-15)": 1, "Por horas 09-11": 1, "Por horas 14-16": 1}, "personas": 5, "cobertura": [2, 4, 4, 3, 2, 3, 3, 4, 3, 2], "planilla": 5097.24, "extra": 225.9, "total": 5323.14, "ahorro": -114.69, "espera": 12.3, "perdida": 5.18, "utilizacion": 57.2, "ocio": 12.8},
    {"modalidad": "Full-time + medio tiempo + por horas", "tope": true, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 1, "FT-2 (08-17, alm. 13-14)": 1, "FT-3 (09-18, alm. 14-15)": 1, "PT 14-18": 1, "Por horas 10-12": 1}, "personas": 5, "cobertura": [2, 3, 4, 4, 2, 2, 3, 4, 4, 2], "planilla": 5150.64, "extra": 207.27, "total": 5357.91, "ahorro": -149.46, "espera": 10.88, "perdida": 4.28, "utilizacion": 57.8, "ocio": 12.6},
    {"modalidad": "Jornada de 10 h (como hoy) + medio tiempo", "tope": true, "conPT": true, "plan": {"FT 10 h (08-18, 2 h extra)": 2, "FT-2 (08-17, alm. 13-14)": 1, "PT 08-12": 1}, "personas": 4, "cobertura": [4, 4, 4, 4, 3, 2, 3, 3, 3, 2], "planilla": 5387.22, "extra": 245.85, "total": 5633.07, "ahorro": -424.61, "espera": 12.01, "perdida": 5.02, "utilizacion": 53.2, "ocio": 15.0},
    {"modalidad": "Full-time + medio tiempo a cualquier hora", "tope": true, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 1, "FT-2 (08-17, alm. 13-14)": 1, "FT-3 (09-18, alm. 14-15)": 1, "PT 08-12": 1, "PT 14-18": 1}, "personas": 5, "cobertura": [3, 4, 4, 4, 2, 2, 3, 4, 4, 2], "planilla": 5494.02, "extra": 198.35, "total": 5692.37, "ahorro": -483.91, "espera": 9.89, "perdida": 3.78, "utilizacion": 54.0, "ocio": 14.7},
    {"modalidad": "Full-time + medio tiempo del notebook", "tope": false, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 2, "FT-3 (09-18, alm. 14-15)": 1, "PT-1 (09-13)": 1, "PT-3 (14-18)": 1}, "personas": 5, "cobertura": [2, 4, 4, 4, 2, 3, 3, 4, 4, 2], "planilla": 5494.02, "extra": 199.89, "total": 5693.91, "ahorro": -485.45, "espera": 8.4, "perdida": 2.78, "utilizacion": 54.6, "ocio": 14.5},
    {"modalidad": "Full-time + medio tiempo a cualquier hora", "tope": false, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 2, "FT-3 (09-18, alm. 14-15)": 1, "PT 09-13": 1, "PT 14-18": 1}, "personas": 5, "cobertura": [2, 4, 4, 4, 2, 3, 3, 4, 4, 2], "planilla": 5494.02, "extra": 199.89, "total": 5693.91, "ahorro": -485.45, "espera": 8.4, "perdida": 2.78, "utilizacion": 54.6, "ocio": 14.5},
    {"modalidad": "Full-time + medio tiempo del notebook", "tope": true, "conPT": true, "plan": {"FT-1 (08-17, alm. 12-13)": 2, "FT-3 (09-18, alm. 14-15)": 1, "PT-2 (10-14)": 1, "PT-3 (14-18)": 1}, "personas": 5, "cobertura": [2, 3, 4, 4, 2, 4, 3, 4, 4, 2], "planilla": 5494.02, "extra": 213.22, "total": 5707.24, "ahorro": -498.78, "espera": 8.51, "perdida": 2.68, "utilizacion": 55.0, "ocio": 14.4},
    {"modalidad": "Jornada de 10 h (como hoy) + medio tiempo", "tope": false, "conPT": true, "plan": {"PT 08-12": 2, "PT 09-13": 2, "PT 12-16": 2, "PT 14-18": 2}, "personas": 8, "cobertura": [2, 4, 4, 4, 4, 2, 4, 4, 2, 2], "planilla": 5494.08, "extra": 248.72, "total": 5742.8, "ahorro": -534.34, "espera": 9.94, "perdida": 3.99, "utilizacion": 53.3, "ocio": 15.0},
    {"modalidad": "Solo full-time", "tope": false, "conPT": false, "plan": {"FT-2 (08-17, alm. 13-14)": 3, "FT-3 (09-18, alm. 14-15)": 2}, "personas": 5, "cobertura": [3, 5, 5, 5, 5, 2, 3, 5, 5, 2], "planilla": 6867.5, "extra": 181.66, "total": 7049.16, "ahorro": -1840.7, "espera": 3.4, "perdida": 0.83, "utilizacion": 43.4, "ocio": 22.6}]};

// M/M/c en régimen estacionario (celdas 13 y 17): λ y μ en pedidos/hora; tiempos en minutos
function mmc(l, c, mu = MU_H) {
  if (c <= 0 || l >= c * mu) return { estable: false, rho: c > 0 ? l / (c * mu) : Infinity, L: Infinity, W: Infinity, Lq: Infinity, Wq: Infinity, Pw: 1 };
  const a = l / mu, r = a / c;
  let suma = 0, f = 1;
  for (let n = 0; n < c; n++) { if (n) f *= n; suma += a ** n / f; }
  const fc = f * c, tc = a ** c / (fc * (1 - r)), p0 = 1 / (suma + tc);
  const lq = (p0 * a ** c * r) / (fc * (1 - r) ** 2), wq = lq / l, w = wq + 1 / mu;
  return { estable: true, rho: r, P0: p0, Pw: tc * p0, Lq: lq, Wq: wq * 60, W: w * 60, L: l * w };
}

// Celda 11 de Denlu.ipynb: ROI de un plan frente a los 3 despachadores fijos. `base` es la venta perdida que se
// supone recuperable: la del notebook (toda la venta perdida) o la que el CSV atribuye a la espera (ROI conservador).
function roi(plan = PLANES.milp.plan, base = NOTEBOOK.ventaPerdida) {
  const planillaActual = 12 * costoMensual(PLANES.actual.plan), planillaOptima = 12 * costoMensual(plan);
  const inversion = planillaOptima - planillaActual;
  const recuperado = base * NOTEBOOK.recuperacion;
  const beneficio = recuperado - inversion;
  return { planillaActual, planillaOptima, inversion, recuperado, beneficio, roi: (100 * beneficio) / inversion };
}
const VENTA_POR_ESPERA = CSV.causas.filter((c) => c.espera).reduce((s, c) => s + c.monto, 0);

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
  Object.entries(plan).reduce((s, [t, n]) => s + n * (TURNOS[t].costo ?? (TURNOS[t].parcial ? C_PT : C_FT)), 0);

const personalPorHora = (plan) =>
  HORAS.map((h) => Object.entries(plan).reduce((s, [t, n]) => s + (TURNOS[t].horas.includes(h) ? n : 0), 0));

const requeridos = (rho, crecimiento = 0) =>
  LAMBDA.map((l) => Math.max(1, Math.ceil((l * (1 + crecimiento)) / (rho * MU_H))));
// Mínimo de despachadores por hora para ρ ≤ rho y, además, Wq ≤ wqMax min (plan alternativo)
const requeridosConEspera = (rho, wqMax) => requeridos(rho).map((c, i) => { while (mmc(LAMBDA[i], c).Wq > wqMax) c++; return c; });

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
    if (tipo === 'llegada' && rng() < P_QUIEBRE) {
      // Sin stock: se cancela en ventas, sin pasar por la cola (466 "Sin preparar" en el CSV)
      const id = seq++;
      registros.push([dato, 0, false, true]);
      anotar('llegada', { id, hora: dato });
      anotar('cancela', { id, motivo: 'stock' });
    } else if (tipo === 'llegada') {
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
      if (p > 0 && rng() < p) {
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
  MU_MIN, MU_H, DIAS, HORAS, LAMBDA, HIST_ESPERA, HIST_PERDIDA, TICKET, C_FT, C_PT, COSTO_HORA_EXTRA, CIERRE, T_CAL, P_CAL, P_QUIEBRE, TURNOS, PLANES,
  WQ_MAX, NOTEBOOK, CSV, OPTIMIZACION, VENTA_POR_ESPERA, mmc, roi, crearRng, costoMensual, personalPorHora, requeridos, requeridosConEspera, simularDia,
  presentesDelDia, simularAnio, evaluar,
};
if (typeof module !== 'undefined') module.exports = Simulacion;
