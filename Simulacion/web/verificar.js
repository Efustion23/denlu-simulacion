// Verifica que el modelo en JavaScript da los mismos resultados que Simulacion/Denlu.ipynb (diagnóstico, MILP y SimPy).
// Uso: node verificar.js
const assert = require('assert');
const S = require('./simulacion.js');

// 1. Parte I del notebook: requerimiento por hora, planes del MILP y su planilla
assert.deepStrictEqual(S.requeridos(0.85), [2, 6, 6, 3, 2, 2, 3, 2, 1, 1]);
assert.deepStrictEqual(S.personalPorHora(S.PLANES.rho85.plan), [3, 6, 6, 6, 3, 4, 3, 4, 4, 1]);
const cerca = (a, b) => Math.abs(a - b) < 0.005;
assert(cerca(S.costoMensual(S.PLANES.rho85.plan), 6867.52));
assert(cerca(S.costoMensual(S.PLANES.rho75.plan), 8241.02));
assert(cerca(S.costoMensual(S.PLANES.rho65.plan), 8927.78));
for (const [k, rho] of [['rho85', 0.85], ['rho75', 0.75], ['rho65', 0.65]]) {
  const cobertura = S.personalPorHora(S.PLANES[k].plan), minimo = S.requeridos(rho);
  assert(cobertura.every((n, i) => n >= minimo[i]), `${k} no cubre el requerimiento por hora`);
}

// 2. Datos de 2025: totales que el notebook usa para calibrar
const lambdaTotal = S.LAMBDA.reduce((a, b) => a + b, 0);
assert(Math.abs(lambdaTotal - 26.8) < 0.05);
const perdidaHist = S.LAMBDA.reduce((s, l, i) => s + l * S.HIST_PERDIDA[i], 0) / lambdaTotal;
assert(Math.abs(perdidaHist - 36.4) < 0.1, `pérdida histórica ${perdidaHist}`);

// 3. Parte II: indicadores simulados frente a los del notebook
const actual = S.evaluar(S.PLANES.actual.plan);
const optimo = S.evaluar(S.PLANES.rho85.plan);
const fmt = (r) => `pérdida ${r.perdida.toFixed(1)} %, cancelados ${r.cancelados.toFixed(2)} %, espera ${r.espera.toFixed(1)} min, horas extra ${r.horasExtra.toFixed(0)} h`;
console.log('Actual:', fmt(actual), '| notebook: 36.6 %, 10.25 %, 20.3 min');
console.log('Óptimo:', fmt(optimo), '| notebook: 5.9 %, 1.61 %, 3.1 min');

assert(Math.abs(actual.perdida - 36.6) < 2.0);
assert(Math.abs(actual.cancelados - 10.25) < 1.0);
assert(Math.abs(actual.espera - 20.3) < 2.0);
assert(Math.abs(optimo.perdida - 5.9) < 1.0);
assert(Math.abs(optimo.cancelados - 1.61) < 0.4);
assert(Math.abs(optimo.espera - 3.1) < 1.0);

// 4. Horas extra y margen: costo total = planilla + horas extra + margen perdido
assert(optimo.horasExtra > 0);
assert(Math.abs(optimo.costoTotal - (optimo.planilla + optimo.costoHorasExtra + optimo.ventaPerdida)) < 1e-6);
const medio = S.evaluar(S.PLANES.rho85.plan, { margen: 0.5 });
assert(Math.abs(medio.margenPerdido - optimo.ventaPerdida / 2) < 1e-6);
console.log('OK');
