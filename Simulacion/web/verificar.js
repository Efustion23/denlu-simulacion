// Comprueba que la simulación de la página (simulacion.js) da exactamente los resultados de Denlu.ipynb
// (exportados en datos2025.js por Simulacion/exportar_web.py) y que el registro de eventos de la animación
// es coherente con el modelo.   Uso: node verificar.js
const fs = require('fs');
const vm = require('vm');
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
for (const f of ['datos2025.js', 'simulacion.js']) vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8').replace(/^const (DATOS|Simulacion) =/m, 'var $1 ='), ctx);
const S = ctx.Simulacion, R = ctx.DATOS.resultados;
let fallas = 0;
const igual = (nombre, a, b, tol = 0.01) => {
  if (Math.abs(a - b) > tol) { fallas++; console.log(`FALLA ${nombre}: página ${a} / notebook ${b}`); }
};

for (const id of Object.keys(S.CASOS)) {
  const a = S.simularAnio(id), r = R[id];
  igual(`${id} cancelados`, a.cancelados, r.cancelados, 0);
  igual(`${id} % cancelados`, Math.round(a.pct * 100) / 100, r.pct);
  igual(`${id} espera media`, Math.round(a.espera * 100) / 100, r.espera);
  igual(`${id} venta perdida`, a.ventaPerdida, r.ventaPerdida, 0.05);
  igual(`${id} costo total`, a.total, r.total, 0.05);
  igual(`${id} cobertura`, JSON.stringify(S.HORAS.map((h) => S.turnosDe(id).filter((t) => t.includes(h)).length)) === JSON.stringify(S.CASOS[id].cobertura) ? 1 : 0, 1, 0);
}
// Hoy (caso 2) repite la base de datos
igual('cancelados del CSV', R.c2.cancelados, 2017, 0);

// El registro de eventos: cada pedido llega una vez, termina despachado o cancelado, y nadie atiende dos a la vez
for (const id of Object.keys(S.CASOS)) {
  for (const d of [S.DIAS[0], S.DIAS[150], ...S.DIAS.filter((x) => x.n > 75)]) {
    const r = S.simularDia(d.o, S.turnosDe(id), true);
    const cuenta = (t) => r.log.filter((e) => e.tipo === t).length;
    igual(`${id} ${d.fecha} llegadas`, cuenta('llegada'), d.n, 0);
    igual(`${id} ${d.fecha} inicio+cancela`, cuenta('inicio') + cuenta('cancela'), d.n, 0);
    igual(`${id} ${d.fecha} cancela`, cuenta('cancela'), r.cancelados, 0);
    const ocupado = {};
    for (const e of r.log) {
      if (e.tipo === 'inicio') { if (ocupado[e.est]) { fallas++; console.log('FALLA doble pedido', id, d.fecha, e); } ocupado[e.est] = true; }
      if (e.tipo === 'fin') ocupado[e.est] = false;
    }
    for (let i = 1; i < r.log.length; i++) if (r.log[i].t < r.log[i - 1].t) { fallas++; console.log('FALLA orden', id, d.fecha); break; }
  }
}
// M/M/c: con 2 despachadores hay horas con ρ >= 1 y con las propuestas todas quedan con ρ < 1
igual('horas con ρ ≥ 1 hoy', S.LAMBDA.filter((l) => !S.mmc(l, 2).estable).length, 6, 0);
for (const id of ['p1', 'p2']) igual(`${id} ρ < 1`, S.LAMBDA.every((l, i) => S.mmc(l, S.CASOS[id].cobertura[i]).rho <= 0.85) ? 1 : 0, 1, 0);
console.log(fallas ? `${fallas} diferencias` : 'OK');
process.exitCode = fallas ? 1 : 0;
