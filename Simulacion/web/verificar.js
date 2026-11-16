// Verifica que las cifras de la página son las de Simulacion/Denlu.ipynb y que la animación (situación actual)
// reproduce la pérdida de ruta y la cancelación del CSV de 2025.
// Uso: node verificar.js
const assert = require('assert');
const S = require('./simulacion.js');
const N = S.NOTEBOOK;
const cerca = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
const igualLista = (a, b, tol) => a.length === b.length && a.every((x, i) => cerca(x, b[i], tol));

// Celda 1: ρ = λ / (3 μ) por hora
assert(igualLista(S.LAMBDA.map((l) => l / (3 * S.MU_H)), N.rho, 0.0006), 'ρ por hora');

// Celda 5: despachadores requeridos con ρ ≤ 0.85
assert.deepStrictEqual(S.requeridos(0.85), [2, 4, 4, 3, 2, 2, 3, 4, 3, 2]);

// Celdas 7 y 9: plan MILP, su costo y su cobertura por hora (incluido el tope legal de part-time)
const milp = S.PLANES.milp.plan, cobMilp = S.personalPorHora(milp);
assert(cerca(S.costoMensual(milp), N.costoMilp));
assert(cerca(S.costoMensual(S.PLANES.actual.plan), 4120.50));
assert.deepStrictEqual(cobMilp, [2, 4, 4, 4, 2, 3, 3, 4, 4, 2]);
assert(cobMilp.every((c, i) => c >= S.requeridos(0.85)[i]));
const parcial = (plan) => Object.entries(plan).reduce((s, [t, n]) => s + (S.TURNOS[t].parcial ? n : 0), 0);
const total = (plan) => Object.values(plan).reduce((a, b) => a + b, 0);
assert(parcial(milp) <= 0.4 * total(milp));

// Celda 11: retorno de la inversión
const r = S.roi();
assert(cerca(r.inversion, N.roi.inversion) && cerca(r.recuperado, N.roi.recuperado) && cerca(r.beneficio, N.roi.beneficio) && cerca(r.roi, N.roi.roi));

// Celdas 13, 15 y 17: Wq, ρ y métricas L, W, Lq con el plan MILP
const m = cobMilp.map((c, i) => S.mmc(S.LAMBDA[i], c));
assert(igualLista(m.map((x) => x.Wq), N.wqMilp, 0.006), 'Wq del plan MILP');
assert(igualLista(m.map((x) => x.rho), [0.661, 0.663, 0.714, 0.621, 0.701, 0.360, 0.747, 0.648, 0.472, 0.676], 0.0006), 'ρ del plan MILP');
assert(igualLista(m.map((x) => x.L), [2.350, 3.385, 3.987, 3.002, 2.755, 1.143, 3.909, 3.240, 2.019, 2.490], 0.0006), 'L');
assert(igualLista(m.map((x) => x.W), [79.07, 56.80, 62.08, 53.75, 87.47, 47.05, 77.59, 55.61, 47.61, 81.95], 0.006), 'W');
assert(igualLista(m.map((x) => x.Lq), [1.027, 0.733, 1.129, 0.517, 1.353, 0.062, 1.667, 0.647, 0.132, 1.138], 0.0006), 'Lq');
assert(m.every((x) => x.rho < 0.8));                       // celda 25: todas las horas bajo el 80 %

// Celda 19: tiempo promedio entre llegadas
assert(cerca(S.LAMBDA.reduce((s, l) => s + Math.round((6000 / l)) / 100, 0) / 10, N.entreLlegadas, 0.006));

// Plan alternativo (propuesta, no está en el notebook): mismo MILP con Wq ≤ 15 min en cada hora
const alt = S.PLANES.alternativo.plan, cobAlt = S.personalPorHora(alt);
assert.deepStrictEqual(S.requeridosConEspera(0.85, S.WQ_MAX), [3, 4, 5, 4, 3, 3, 4, 4, 4, 3]);
assert(cobAlt.every((c, i) => c >= S.requeridosConEspera(0.85, S.WQ_MAX)[i]));
assert(cobAlt.every((c, i) => S.mmc(S.LAMBDA[i], c).Wq <= S.WQ_MAX));
assert(parcial(alt) <= 0.4 * total(alt));
assert(cerca(S.costoMensual(alt), 7554.26));

// Sección 6 (optimización realista): el plan recomendado es el de la tabla del notebook, cumple ρ < 1 en cada hora,
// su planilla es la del notebook y el costo real de hoy suma las 2 h extra diarias
const O = S.OPTIMIZACION, rec = O.filas[0], planRec = S.PLANES.recomendado.plan;
assert(cerca(S.costoMensual(planRec), rec.planilla, 0.01));
assert.deepStrictEqual(S.personalPorHora(planRec), rec.cobertura);
assert(S.personalPorHora(planRec).every((c, i) => S.LAMBDA[i] < c * S.MU_H), 'ρ < 1 en cada hora');
assert.deepStrictEqual(O.minimosRho1, S.LAMBDA.map((l) => Math.floor(l / S.MU_H) + 1));
assert(cerca(O.costoHoyReal, O.costoHoyBase + O.costoExtraHoy, 0.01) && cerca(O.costoHoyBase, S.costoMensual(S.PLANES.actual.plan), 0.01));
assert(O.filas.every((f) => cerca(f.total, f.planilla + f.extra, 0.02) && cerca(f.ahorro, O.totalHoy - f.total, 0.02)));
assert(O.filas.every((f, i) => !i || f.total >= O.filas[i - 1].total), 'tabla ordenada por costo');
assert(rec.ahorro > 0 && rec.perdida <= O.hoy.perdida && rec.espera <= O.hoy.espera, 'el recomendado ahorra sin empeorar el servicio');

// Sección 7 (escenarios): cada plan tiene la cobertura del notebook, el escenario base coincide con la sección 6,
// la política flexible conserva el núcleo fijo y la elegida cumple en los 8 escenarios con el menor arrepentimiento
const EC = S.ESCENARIOS_CLIENTE;
assert.strictEqual(EC.escenarios.length, 8);
EC.escenarios.forEach((e) => ['optimo', 'flexible'].forEach((k) => assert.deepStrictEqual(S.personalPorHora(e[k].plan), e[k].cobertura, `${e.nombre} ${k}`)));
EC.escenarios.forEach((e) => Object.entries(EC.nucleo).forEach(([t, n]) => assert.strictEqual(e.flexible.plan[t], n, `núcleo en ${e.nombre}`)));
assert(cerca(EC.escenarios[0].optimo.costo, rec.total, 0.01) && cerca(EC.escenarios[0].hoy.costo, O.totalHoy, 0.01), 'el escenario base es la sección 6');
const elegida = EC.candidatos.find((c) => c.nombre === EC.eleccion);
assert(elegida.cumple.every(Boolean));
assert(EC.candidatos.filter((c) => c.cumple.every(Boolean)).every((c) => c.arrepentimiento >= elegida.arrepentimiento));
EC.candidatos.forEach((c) => assert(cerca(c.promedio, c.costos.reduce((a, b) => a + b, 0) / 8, 0.01)));

// Causas de la venta perdida (CSV): suman la venta perdida del notebook; ROI conservador
assert(cerca(S.CSV.causas.reduce((s, c) => s + c.monto, 0), N.ventaPerdida, 0.01));
assert(cerca(S.roi(milp, S.VENTA_POR_ESPERA).roi, -45.67, 0.01));

// Animación: con 3 despachadores fijos, el modelo repite la pérdida de ruta (5.27 %) y la cancelación (5.82 %) de 2025
const actual = S.evaluar(S.PLANES.actual.plan);
console.log(`Animación, situación actual: pérdida de ruta ${actual.perdida.toFixed(1)} % (2025: 5.3 %), cancelados ${actual.cancelados.toFixed(1)} % (2025: ${N.cancelacionPct} %)`);
assert(Math.abs(actual.perdida - (100 * 422) / 8012) < 1);
assert(Math.abs(actual.cancelados - N.cancelacionPct) < 0.5);
console.log('OK');
