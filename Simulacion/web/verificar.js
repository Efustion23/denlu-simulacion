// Verifica que el modelo en JavaScript da los mismos resultados que el notebook (SimPy).
// Uso: node verificar.js
const assert = require('assert');
const S = require('./simulacion.js');

const actual = S.evaluar(S.PLANES.actual.plan);
const optimo = S.evaluar(S.PLANES.rho85.plan);
const fmt = (r) => `pérdida ${r.perdida.toFixed(1)} %, cancelados ${r.cancelados.toFixed(2)} %, espera ${r.espera.toFixed(1)} min, horas extra ${r.horasExtra.toFixed(0)} h`;
console.log('Actual:', fmt(actual), '| notebook: 36.6 %, 10.25 %, 20.3 min');
console.log('Óptimo:', fmt(optimo), '| notebook: 5.9 %, 1.61 %, 3.1 min');

assert(Math.abs(actual.perdida - 36.6) < 2.0);
assert(Math.abs(actual.cancelados - 10.25) < 1.0);
assert(Math.abs(optimo.perdida - 5.9) < 1.0);
assert(Math.abs(optimo.cancelados - 1.61) < 0.4);
assert.strictEqual(S.costoMensual(S.PLANES.rho85.plan), 6867.52);

// Horas extra y margen: costo total = planilla + horas extra + margen perdido
assert(optimo.horasExtra > 0);
assert(Math.abs(optimo.costoTotal - (optimo.planilla + optimo.costoHorasExtra + optimo.ventaPerdida)) < 1e-6);
const medio = S.evaluar(S.PLANES.rho85.plan, { margen: 0.5 });
assert(Math.abs(medio.margenPerdido - optimo.ventaPerdida / 2) < 1e-6);
console.log('OK');
