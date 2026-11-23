"""Escribe web/datos2025.js con lo que necesita la página: los 12,070 pedidos de datos/denlu_2025.csv, los casos
y propuestas (MILP) y los resultados de la simulación de todo el año, iguales a los de Denlu.ipynb.

Uso:  python exportar_web.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

import caso_denlu as C

AQUI = Path(__file__).parent
df = pd.read_csv(AQUI / 'datos/denlu_2025.csv')
dias = df.fecha.nunique()
MU = 60 / df.tiempo_servicio_min.mean()
LAMBDA = [round(len(df[df.hora_del_dia == h]) / dias, 3) for h in C.HORAS]
D = C.requeridos(LAMBDA, 0.85, MU)
P1 = C.optimizar(D, [t for t in C.TURNOS if t.startswith('Por horas')], {'Fijo 08-18': 2}, LAMBDA)
P2 = C.optimizar(D, [t for t in C.TURNOS if t.startswith('Medio')], {'Fijo 08-18': 2}, LAMBDA)

CASOS = [
    ('c1', 'Caso 1: 1 fijo', '1 fijo', {'Fijo 08-18': 1}),
    ('c2', 'Caso 2 (hoy): 2 fijos', 'Hoy: 2 fijos', {'Fijo 08-18': 2}),
    ('c3', 'Caso 3: 3 fijos', '3 fijos', {'Fijo 08-18': 3}),
    ('c4', 'Caso 4: 4 fijos', '4 fijos', {'Fijo 08-18': 4}),
    ('p1', 'Propuesta 1: 2 fijos + por horas', 'Propuesta 1: por horas', P1),
    ('p2', 'Propuesta 2: 2 fijos + medio turno', 'Propuesta 2: medio turno', P2),
]
mes = pd.to_datetime(df.fecha).dt.month
# Calidad de servicio: meta P(Wq > 30 min) <= 10 % en cada hora y planes de alta calidad (restricción R8 del notebook)
Q = C.requeridos_calidad(LAMBDA, MU)
CALIDAD = {'t': 30, 'meta': 0.10, 'Q': Q}
for k, ops in (('ac1', [t for t in C.TURNOS if t.startswith('Por horas')]), ('ac2', [t for t in C.TURNOS if t.startswith('Medio')])):
    plan = C.optimizar(Q, ops, {'Fijo 08-18': 2}, LAMBDA)
    f = pd.DataFrame(C.simular_anio(df, plan)); c = int(f.cancelados.sum()); cm = C.costo_mensual(plan)
    CALIDAD[k] = dict(plan=plan, costoMes=cm, extra=round(cm - 2 * C.C_FIJO, 2), pct=round(100 * c / len(df), 2),
                      total=round(12 * cm + f.margen_perdido.sum(), 2), personas=sum(plan.values()))
resultados, por_mes, por_dia = {}, {}, {}
for cid, nombre, corto, plan in CASOS:
    f = pd.DataFrame(C.simular_anio(df, plan))
    c = int(f.cancelados.sum()); vp = f.venta_perdida.sum(); cm = C.costo_mensual(plan)
    mp = f.margen_perdido.sum()
    resultados[cid] = dict(cancelados=c, pct=round(100 * c / len(df), 2), espera=round(f.espera_total.sum() / (len(df) - c), 2),
                           ventaPerdida=round(vp, 2), margenPerdido=round(mp, 2), costoMes=cm, total=round(12 * cm + mp, 2))
    f['mes'] = pd.to_datetime(f.fecha).dt.month
    por_mes[cid] = [round(v, 2) for v in f.groupby('mes').margen_perdido.sum()]
    por_dia[cid] = f.set_index('fecha').cancelados
hoy = resultados['c2']
for r in resultados.values():
    r['ahorro'] = round(hoy['total'] - r['total'], 2)
    r['inversion'] = round(12 * (r['costoMes'] - hoy['costoMes']), 2)
    r['ventaRecuperada'] = round(hoy['ventaPerdida'] - r['ventaPerdida'], 2)
    r['gananciaRecuperada'] = round(hoy['margenPerdido'] - r['margenPerdido'], 2)
    r['beneficio'] = round(r['gananciaRecuperada'] - r['inversion'], 2)
    r['roi'] = round(100 * r['beneficio'] / r['inversion'], 1) if r['inversion'] > 0 else None

# Cola promedio observada cada 5 min (pedidos que llegaron y aún no empiezan, ni se cancelaron)
a_min = lambda x: (int(x[:2]) - 8) * 60 + int(x[3:5]) + int(x[6:8]) / 60
llegada = df.llegada_min.values
sale = np.where(df.cancelado == 1, llegada + C.TOLERANCIA, df.hora_inicio_despacho.fillna('08:00:00').map(a_min).values)
minutos = np.arange(0, 660, 5)
cola5 = ((llegada[:, None] <= minutos) & (sale[:, None] > minutos)).sum(0) / dias
Q, flujo = 0.0, []
for lam in LAMBDA:
    Q = max(0.0, Q + lam - 2 * MU)
    flujo.append(round(Q, 3))

# Productos de cada pedido, compactos: por línea, el producto (un carácter) y la cantidad (base 36)
det = pd.read_csv(AQUI / 'datos/denlu_2025_detalle.csv')
CAT = pd.read_csv(AQUI / 'datos/denlu_productos.csv')
CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
assert len(CAT) <= len(CHARS) and det.cantidad.max() < 36
fila = {p: i for i, p in enumerate(df.id_pedido)}
LINEAS = [''] * len(df)
for pid, g in det.groupby('id_pedido', sort=False):
    LINEAS[fila[pid]] = ''.join(CHARS[k] + np.base_repr(q, 36).lower() for k, q in zip(g.id_producto, g.cantidad))
# Secciones ordenadas por demanda (pedidos que pasan por ellas): la más visitada va más cerca de empaque y acopio
visitas = det.groupby('seccion').id_pedido.nunique().sort_values(ascending=False)
SECC = list(visitas.index)
por_producto = det.groupby('id_producto').agg(veces=('id_pedido', 'size'), unidades=('cantidad', 'sum'),
                                              venta=('subtotal_S', 'sum'), ganancia=('margen_S', 'sum'))

por_fecha = df.groupby('fecha')
top = por_fecha.size().sort_values(ascending=False, kind='stable').head(10)
dias_js = [[fecha, g.campana.iloc[0] if isinstance(g.campana.iloc[0], str) else '',
            [v for a, s, m, gm in zip(g.llegada_min, g.tiempo_servicio_min, g.monto_pedido_S, g.margen_pedido_S) for v in (a, s, m, gm)],
            '|'.join(LINEAS[i] for i in g.index)]
           for fecha, g in por_fecha]

datos = {
    'param': dict(MU=round(MU, 6), MU_MIN=round(60 / MU, 4), TOL=C.TOLERANCIA, MARGEN=round(df.margen_pedido_S.sum() / df.monto_pedido_S.sum(), 4), RMV=C.RMV, C_FT=C.C_FT,
                  C_FIJO=C.C_FIJO, C_MT=C.C_MT, C_EXTRA_2H=C.C_EXTRA_2H, TARIFA_HORA=C.TARIFA_HORA, DIAS_MES=C.DIAS_MES,
                  RHO_MAX=0.85, dias=dias, pedidos=len(df), venta=round(df.monto_pedido_S.sum(), 2)),
    'lambda': LAMBDA, 'D': D,
    'casos': [dict(id=cid, nombre=n, corto=k, plan=plan, costoMes=C.costo_mensual(plan), cobertura=C.personal_por_hora(plan),
                   turnos=[[t, C.TURNOS[t]] for t, x in plan.items() for _ in range(x)]) for cid, n, k, plan in CASOS],
    'resultados': resultados, 'porMes': por_mes,
    'diag': dict(espera=[round(df[df.hora_del_dia == h].tiempo_espera_min.mean(), 2) for h in C.HORAS],
                 cancelPct=[round(100 * df[df.hora_del_dia == h].cancelado.mean(), 2) for h in C.HORAS],
                 ventaPerdida=[round(df[df.hora_del_dia == h].venta_perdida_S.sum(), 2) for h in C.HORAS]),
    'cola5': [round(float(v), 3) for v in cola5], 'flujo': flujo,
    'criticos': [dict(fecha=f, pedidos=int(n), campana=dias_js[[d[0] for d in dias_js].index(f)][1],
                      cancelados={cid: int(por_dia[cid][f]) for cid in por_dia}) for f, n in top.items()],
    'calidad': CALIDAD,
    'dias': dias_js,
    'secciones': [dict(nombre=sec, visitas=int(visitas[sec])) for sec in SECC],
    'productos': [dict(nombre=r.producto, seccion=SECC.index(r.seccion), precio=r.precio_S, margen=r.margen_pct,
                       veces=int(por_producto.veces[r.id_producto]), unidades=int(por_producto.unidades[r.id_producto]),
                       venta=round(por_producto.venta[r.id_producto], 2), ganancia=round(por_producto.ganancia[r.id_producto], 2))
                  for r in CAT.itertuples()],
}
texto = json.dumps(datos, ensure_ascii=False, separators=(',', ':'))
(AQUI / 'web/datos2025.js').write_text(
    '// Generado por Simulacion/exportar_web.py a partir de datos/denlu_2025.csv (base simulada de 2025). No editar a mano.\n'
    f'const DATOS = {texto};\n', encoding='utf-8')
print('web/datos2025.js', round(len(texto) / 1024), 'KB |', {k: (v['pct'], v['total']) for k, v in resultados.items()})
