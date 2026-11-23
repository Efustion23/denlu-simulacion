// Modelo de la página: el mismo de Denlu.ipynb (sección 5) y de Simulacion/caso_denlu.py.
// Los pedidos de 2025 (datos2025.js) se repiten con el personal de cada caso: primero en llegar, primero en ser
// atendido; cada pedido lo toma la persona que puede empezar antes; si esperaría más de 60 min, pierde su camión
// y se cancela. La función también arma la lista de eventos que dibuja la animación 2D/3D.
const P_ = DATOS.param;
const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const CIERRE = 600;                              // 18:00 en minutos desde las 08:00
const MU_H = P_.MU, MU_MIN = P_.MU_MIN, TOL = P_.TOL, MARGEN = P_.MARGEN;
const LAMBDA = DATOS.lambda;
const AVISO_CAMION = 45;                         // a los 45 min de espera la hoja se marca: está por perder el camión
const WQ_MAX = 15;
const CASOS = Object.fromEntries(DATOS.casos.map((c) => [c.id, c]));
const DIAS = DATOS.dias.map(([fecha, campana, o, l]) => ({ fecha, campana, o, l, n: o.length / 4 }));
// Secciones del almacén, de la más visitada a la menos (así están ubicadas: la primera, más cerca de empaque)
const SECCIONES = DATOS.secciones.map((x, i) => ({ ...x, i, color: ['#d4a82f', '#3d9b7a', '#4a72b0', '#7fb2d6', '#c77a2c', '#b5524a', '#8c6239', '#a173b5'][i] }));
const CATALOGO = DATOS.productos;
// Productos de cada pedido: por línea, un carácter con el producto y otro con la cantidad (base 36)
const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function lineasDia(d) {
  if (!d.dec) d.dec = d.l.split('|').map((x) => { const r = []; for (let i = 0; i < x.length; i += 2) r.push([CHARS.indexOf(x[i]), parseInt(x[i + 1], 36)]); return r; });
  return d.dec;
}
// Suma por sección (y por producto) lo despachado y lo perdido de un día; `cancel[i]` = 1 si el pedido i se canceló
function contarDia(d, cancel, acum = nuevoConteo()) {
  lineasDia(d).forEach((lineas, i) => sumarPedido(acum, lineas, !cancel[i]));
  return acum;
}
const nuevoConteo = () => ({ sec: SECCIONES.map(() => ({ rec: 0, uni: 0, venta: 0, gan: 0, perd: 0, recPerd: 0 })), prod: CATALOGO.map(() => 0) });
function sumarPedido(acum, lineas, despachado) {
  const vistas = new Set();
  for (const [k, q] of lineas) {
    const p = CATALOGO[k], s = acum.sec[p.seccion];
    vistas.add(p.seccion);
    if (despachado) { s.uni += q; s.venta += q * p.precio; s.gan += q * p.precio * p.margen; acum.prod[k] += q; } else s.perd += q;
  }
  vistas.forEach((i) => { if (despachado) acum.sec[i].rec++; else acum.sec[i].recPerd++; });
}
const PROMEDIO_DIA = DIAS.reduce((s, d) => s + d.n, 0) / DIAS.length;

// M/M/c en régimen estacionario: λ y μ en pedidos/hora; tiempos en minutos. Si ρ >= 1 no hay estado estable.
function mmc(l, c, mu = MU_H) {
  if (c <= 0 || l >= c * mu) return { estable: false, rho: c > 0 ? l / (c * mu) : Infinity, L: Infinity, W: Infinity, Lq: Infinity, Wq: Infinity, Pw: 1 };
  const a = l / mu, r = a / c;
  let suma = 0, f = 1;
  for (let n = 0; n < c; n++) { if (n) f *= n; suma += a ** n / f; }
  const fc = f * c, tc = a ** c / (fc * (1 - r)), p0 = 1 / (suma + tc);
  const pw = tc * p0, lq = (pw * r) / (1 - r), wq = lq / l;
  return { estable: true, rho: r, P0: p0, Pw: pw, Lq: lq, Wq: wq * 60, W: wq * 60 + 60 / mu, L: lq + a };
}

// Generador pseudoaleatorio con semilla (para detalles de la animación: estantes, colores)
function crearRng(semilla) {
  let s = semilla >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Primer instante >= t en que una persona con esas horas de turno puede empezar un pedido.
// Quien trabaja a las 17 h se queda después de las 18:00 hasta vaciar la cola.
function enTurno(horas, t) {
  if (t >= CIERRE) return horas.includes(17) ? t : Infinity;
  for (let h = Math.floor(t / 60) + 8; h < 18; h++) if (horas.includes(h)) return Math.max(t, (h - 8) * 60);
  return Infinity;
}
const deTurno = (horas, t) => (t >= CIERRE ? horas.includes(17) : horas.includes(Math.floor(t / 60) + 8));

const ORDEN = { fin: 0, sale: 1, turno: 2, cancela: 3, perdio: 4, llegada: 5, inicio: 6 };

// Un día: `o` = [llegada (min), servicio (min), monto (S/), ganancia (S/), ...]; `turnos` = horas de cada persona.
function simularDia(o, turnos, conLog = false) {
  const libre = turnos.map(() => 0);
  const r = { pedidos: o.length / 4, cancelados: 0, esperaTotal: 0, venta: 0, ventaPerdida: 0, margen: 0, margenPerdido: 0,
    cancel: new Uint8Array(o.length / 4), log: conLog ? [] : null };
  const ev = (t, tipo, datos) => r.log.push({ t, tipo, ...datos });
  for (let i = 0, id = 0; i < o.length; i += 4, id++) {
    const a = o[i], s = o[i + 1], m = o[i + 2], g = o[i + 3];
    let mejor = Infinity, k = -1;
    turnos.forEach((h, j) => { const t = enTurno(h, Math.max(a, libre[j])); if (t < mejor) { mejor = t; k = j; } });
    r.venta += m; r.margen += g;
    if (conLog) ev(a, 'llegada', { id, monto: m });
    if (mejor - a > TOL) {
      r.cancelados++; r.ventaPerdida += m; r.margenPerdido += g; r.cancel[id] = 1;
      if (conLog) { ev(a + AVISO_CAMION, 'perdio', { id }); ev(a + TOL, 'cancela', { id, monto: m, margen: g }); }
    } else {
      libre[k] = mejor + s;
      r.esperaTotal += mejor - a;
      if (conLog) {
        if (mejor - a > AVISO_CAMION) ev(a + AVISO_CAMION, 'perdio', { id });
        ev(mejor, 'inicio', { id, est: k, dur: s });
        ev(mejor + s, 'fin', { id, est: k });
        if (!deTurno(turnos[k], mejor + s)) ev(mejor + s, 'sale', { est: k });   // terminó fuera de su turno: se va
      }
    }
  }
  if (conLog) {
    for (let h = 0; h <= 10; h++) {
      const t = 60 * h, activas = turnos.map((x) => deTurno(x, t));
      ev(t, 'turno', { n: activas.filter(Boolean).length, activas });
    }
    r.log.sort((x, y) => x.t - y.t || ORDEN[x.tipo] - ORDEN[y.tipo]);
    r.fin = r.log.length ? r.log[r.log.length - 1].t : 0;
  }
  return r;
}

const turnosDe = (caso) => CASOS[caso].turnos.map(([, h]) => h);

// Todo el año con el personal de un caso: un resultado por día, más los totales
function simularAnio(caso) {
  const turnos = turnosDe(caso);
  const dias = DIAS.map((d) => { const r = simularDia(d.o, turnos); return { fecha: d.fecha, pedidos: r.pedidos, cancelados: r.cancelados, esperaTotal: r.esperaTotal,
    ventaPerdida: r.ventaPerdida, margenPerdido: r.margenPerdido, cancel: r.cancel }; });
  const t = { pedidos: 0, cancelados: 0, esperaTotal: 0, ventaPerdida: 0, margenPerdido: 0 };
  dias.forEach((d) => Object.keys(t).forEach((k) => { t[k] += d[k]; }));
  const costoMes = CASOS[caso].costoMes;
  return { dias, ...t, pct: (100 * t.cancelados) / t.pedidos, espera: t.esperaTotal / (t.pedidos - t.cancelados), costoMes, total: 12 * costoMes + t.margenPerdido };
}

const Simulacion = {
  P: P_, HORAS, CIERRE, MU_H, MU_MIN, TOL, MARGEN, LAMBDA, AVISO_CAMION, WQ_MAX, CASOS, DIAS, PROMEDIO_DIA, D: DATOS.D,
  SECCIONES, CATALOGO, mmc, crearRng, enTurno, deTurno, simularDia, simularAnio, turnosDe, lineasDia, contarDia, nuevoConteo, sumarPedido,
};
if (typeof module !== 'undefined') module.exports = Simulacion;
