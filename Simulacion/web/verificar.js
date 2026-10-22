// Verifica que el modelo en JavaScript da los mismos resultados que Simulacion/Denlu.ipynb (diagnóstico, MILP y SimPy).
// Uso: node verificar.js
const assert = require('assert');
const S = require('./simulacion.js');

const cerca = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
const dentro = (nombre, valor, esperado, tol) => assert(Math.abs(valor - esperado) <= tol, `${nombre}: ${valor.toFixed(2)} (notebook ${esperado}, tolerancia ±${tol})`);

// 1. Parte I del notebook: requerimiento por hora, planes del MILP y su planilla
assert.deepStrictEqual(S.requeridos(0.85), [2, 4, 4, 3, 2, 2, 3, 4, 3, 2]);
assert.deepStrictEqual(S.personalPorHora(S.PLANES.rho85.plan), [2, 4, 4, 4, 2, 3, 3, 4, 4, 2]);
assert.deepStrictEqual(S.personalPorHora(S.PLANES.rho70.plan), [3, 4, 5, 5, 4, 3, 4, 5, 5, 2]);
assert.deepStrictEqual(S.personalPorHora(S.PLANES.rho50.plan), [4, 6, 6, 6, 4, 4, 5, 7, 7, 3]);
assert(cerca(S.costoMensual(S.PLANES.actual.plan), 4120.5));
assert(cerca(S.costoMensual(S.PLANES.rho85.plan), 5494.02));
assert(cerca(S.costoMensual(S.PLANES.rho70.plan), 6867.52));
assert(cerca(S.costoMensual(S.PLANES.rho50.plan), 8927.76));
for (const [k, rho] of [['rho85', 0.85], ['rho70', 0.70], ['rho50', 0.50]]) {
  const cobertura = S.personalPorHora(S.PLANES[k].plan), minimo = S.requeridos(rho);
  assert(cobertura.every((n, i) => n >= minimo[i]), `${k} no cubre el requerimiento por hora`);
}

// 2. Datos de 2025: los totales que el notebook usa para validar
const lambdaTotal = S.LAMBDA.reduce((a, b) => a + b, 0);
assert(cerca(lambdaTotal, 26.8, 0.05));
const ponderado = (v) => S.LAMBDA.reduce((s, l, i) => s + l * v[i], 0) / lambdaTotal;
dentro('espera histórica', ponderado(S.HIST_ESPERA), 11.38, 0.1);
dentro('pérdida de camión histórica', ponderado(S.HIST_PERDIDA_RUTA), 5.27, 0.1);
dentro('cancelados históricos', ponderado(S.HIST_CANCELADOS), 5.82, 0.1);
assert(cerca(Object.values(S.CAUSAS_2025).reduce((a, b) => a + b, 0), 1820720.93, 0.01));

// 3. Reglas del camión (capítulo 6 del notebook). Tiempos en minutos desde las 08:00; salidas a los 120, 300 y 480
let r = S.evaluarRuta(30, 40, 0, 1, 0);                    // llega 08:30, prepara 40 min: alcanza el camión de las 10:00
assert(r.k0 === 0 && !r.perdio && r.destino === 0 && !r.tardia);
r = S.evaluarRuta(30, 40, 60, 1, 0);                        // espera 60 min: no está listo a las 10:00 y sale a las 13:00
assert(r.perdio && r.destino === 1 && !r.tardia);
r = S.evaluarRuta(300, 150, 40, 1, 0);                      // llega 13:00, prepara 150 min: apunta al de las 16:00 y, si espera 40, pierde el camión y sale mañana
assert(r.k0 === 2 && r.perdio && r.destino === -1);
r = S.evaluarRuta(440, 60, 0, 1, 0);                        // llega 15:20 y ya no hay camión hoy: sale mañana, no es tardío
assert(r.k0 === -1 && !r.perdio && !r.tardia);
r = S.evaluarRuta(440, 60, 0, 1, 5);                        // en sábado sale el lunes: entrega tardía
assert(r.k0 === -1 && !r.perdio && r.tardia);

// 4. Cola FIFO con un despachador: la espera de cada pedido es la que deja el anterior
const pedido = (id, t) => ({ id, t, hora: 0, quiebre: false, cancela: false, prep: 50, monto: 1000, uCliente: 1, transito: 1 });
const { filas } = S.simularDia(Array(10).fill(1), [pedido(0, 0), pedido(1, 10), pedido(2, 20)], 0);
const esperas = filas.map((f) => f[1]);
assert(cerca(esperas[0], 0) && cerca(esperas[1], 40) && cerca(esperas[2], 80), `esperas FIFO: ${esperas}`);

// 5. Un año simulado frente a los resultados del notebook (generadores aleatorios distintos: se compara dentro del intervalo)
const actual = S.evaluar(S.PLANES.actual.plan);
const optimo = S.evaluar(S.PLANES.rho85.plan);
const fmt = (x) => `espera ${x.espera.toFixed(1)} min, pérdida de camión ${x.perdida.toFixed(1)} %, tardías ${x.tardias.toFixed(1)} %, cancelados ${x.cancelados.toFixed(1)} %, venta perdida S/ ${Math.round(x.ventaPerdida).toLocaleString('es-PE')}`;
console.log('Actual:', fmt(actual), '\n   notebook: espera 11.7 min, pérdida 5.6 %, tardías 8.8 %, cancelados 5.9 %, venta perdida S/ 1,741,048');
console.log('Plan  :', fmt(optimo), '\n   notebook: espera 6.1 min, pérdida 3.1 %, tardías 8.7 %, cancelados 5.9 %, venta perdida S/ 1,737,914');

dentro('espera actual', actual.espera, 11.7, 1.5);
dentro('pérdida de camión actual', actual.perdida, 5.6, 1.0);
dentro('tardías actual', actual.tardias, 8.8, 1.0);
dentro('cancelados actual', actual.cancelados, 5.9, 0.8);
dentro('clientes perdidos actual', actual.clientesPerdidos, 1.4, 0.3);
dentro('venta perdida actual', actual.ventaPerdida, 1741048, 160000);
dentro('espera plan', optimo.espera, 6.1, 1.2);
dentro('pérdida de camión plan', optimo.perdida, 3.1, 0.8);
assert(optimo.espera < actual.espera && optimo.perdida < actual.perdida && optimo.ventaDespacho <= actual.ventaDespacho);
// la causa dominante de la venta perdida no depende del personal
assert(actual.ventaQuiebre > 0.6 * actual.ventaPerdida && actual.ventaDespacho < 0.02 * actual.ventaPerdida);

// 6. Invariantes: costo total, margen y causas; menos quiebres, menos venta perdida
assert(Math.abs(optimo.costoTotal - (optimo.planilla + optimo.costoHorasExtra + optimo.ventaPerdida)) < 1e-6);
const medio = S.evaluar(S.PLANES.rho85.plan, { margen: 0.5 });
assert(Math.abs(medio.margenPerdido - optimo.ventaPerdida / 2) < 1e-6);
assert(Math.abs(optimo.ventaQuiebre + optimo.ventaCalendario + optimo.ventaDespacho - optimo.ventaPerdida) < 1e-3);
const menosQuiebres = S.evaluar(S.PLANES.actual.plan, { qQuiebre: 0.5 });
assert(menosQuiebres.ventaQuiebre < 0.7 * actual.ventaQuiebre && menosQuiebres.ventaPerdida < actual.ventaPerdida);
console.log('OK');
