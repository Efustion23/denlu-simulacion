// Verifica que las cifras de la página son las de Simulacion/Denlu.ipynb
// y que la animación (situación actual) reproduce la pérdida de ruta y la cancelación de 2025.
// Uso: node verificar.js
const assert = require('assert');
const S = require('./simulacion.js');
const cerca = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// Celda 1: diagnóstico por hora (ρ = λ / (3 μ); el notebook lo calcula con λ sin redondear)
assert(S.NOTEBOOK.rho.every((r, i) => cerca(r, S.LAMBDA[i] / (3 * S.MU_H), 0.0011)));
assert(cerca(Math.max(...S.NOTEBOOK.rho), 1.667));

// Celda 5: despachadores requeridos por hora con ρ ≤ 0.85
assert.deepStrictEqual(S.requeridos(0.85), [2, 6, 6, 3, 2, 2, 3, 2, 1, 1]);

// Celdas 7 y 9: plan MILP, su costo y su cobertura por hora
assert(cerca(S.costoMensual(S.PLANES.milp.plan), 6867.52));
assert(cerca(S.costoMensual(S.PLANES.actual.plan), 4120.50));
assert.deepStrictEqual(S.personalPorHora(S.PLANES.milp.plan), [3, 6, 6, 6, 3, 4, 3, 4, 4, 1]);

// Celda 11: retorno de la inversión
const r = S.roi();
assert(cerca(r.inversion, 32964.24));
assert(cerca(r.recuperado, 589040.45));
assert(cerca(r.beneficio, 556076.21));
assert(cerca(r.roi, 1686.91));

// Animación: con 3 despachadores fijos, el modelo reproduce los totales de 2025 (36.4 % de pérdida de ruta, 10 % de cancelación)
const perdidaHist = S.LAMBDA.reduce((s, l, i) => s + l * S.HIST_PERDIDA[i], 0) / S.LAMBDA.reduce((a, b) => a + b, 0);
const actual = S.evaluar(S.PLANES.actual.plan);
console.log(`Animación, situación actual: pérdida de ruta ${actual.perdida.toFixed(1)} % (2025: ${perdidaHist.toFixed(1)} %), cancelados ${actual.cancelados.toFixed(1)} % (2025: 10.0 %)`);
assert(Math.abs(actual.perdida - perdidaHist) < 2);
assert(Math.abs(actual.cancelados - S.NOTEBOOK.cancelacionPct) < 1);
console.log('OK');
