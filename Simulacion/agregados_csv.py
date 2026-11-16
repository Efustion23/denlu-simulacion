"""Agregados del CSV de 2025 que usa la página para demostrar que se forma una cola.

Uso:  python agregados_csv.py denlu_colab_2025.csv

Reconstruye la cola de cada día con la hora de llegada y la espera de cada pedido (inicio = llegada + espera)
y calcula, por hora, cuántos pedidos esperaron, el percentil 90 de la espera y la cola más larga del año, además
de la cola promedio cada 5 minutos, el peor día y las causas de la venta perdida. El CSV no se publica.
"""
import sys

import numpy as np
import pandas as pd

df = pd.read_csv(sys.argv[1])
HORAS = range(8, 18)

d = df[df.despachador != 'Sin preparar'].copy()          # los 466 "Sin preparar" se cancelan sin pasar por la cola
t = pd.to_datetime(d.fecha + ' ' + d.hora_llegada)
d['llegada'] = (t - pd.to_datetime(d.fecha)).dt.total_seconds() / 60 - 480   # minutos desde las 08:00
d['inicio'] = d.llegada + d.tiempo_espera_min

minutos = np.arange(0, 660)
colas = {}
for fecha, g in d.groupby('fecha'):
    colas[fecha] = ((g.llegada.values[:, None] <= minutos) & (g.inicio.values[:, None] > minutos)).sum(0)
promedio = sum(colas.values()) / len(colas)
peor = max(colas, key=lambda f: (colas[f].max(), colas[f].sum()))

print('pedidos', len(df), 'preparados', len(d), 'esperaron', int((d.tiempo_espera_min > 0).sum()))
print('dias con 3 y 4 despachadores', df.groupby('n_despachadores').fecha.nunique().to_dict())
print('esperaronPct', [round(100 * (d[d.hora_del_dia == h].tiempo_espera_min > 0).mean(), 1) for h in HORAS])
print('p90', [round(d[d.hora_del_dia == h].tiempo_espera_min.quantile(0.9), 1) for h in HORAS])
print('colaMax', [int(max(q[(h - 8) * 60:(h - 7) * 60].max() for q in colas.values())) for h in HORAS])
print('diasCola3', sum(1 for q in colas.values() if q.max() >= 3))
print('colaProm5', [round(float(promedio[i:i + 5].mean()), 3) for i in range(0, 660, 5)])
print('peorDia', peor, 'colaPeor5', [int(colas[peor][i:i + 5].max()) for i in range(0, 660, 5)])
print('rutaPerdidas', int(df.perdio_ruta.sum()), 'con espera', int(((df.perdio_ruta == 1) & (df.tiempo_espera_min > 0)).sum()))

k = df.groupby(['fecha', 'hora_del_dia']).size().values      # como la celda 23 del notebook
print('frecuencias k=1..', [int((k == i).sum()) for i in range(1, k.max() + 1)])

c, p = df[df.cancelado == 1], df[df.cliente_perdido == 1]
causas = {
    'Cancelado por quiebre de stock': c[c.quiebre_stock == 1],
    'Cancelado sin preparar (otras causas)': c[c.quiebre_stock == 0],
    'Cliente perdido tras quiebre de stock': p[p.quiebre_stock == 1],
    'Cliente perdido tras otras entregas tardías': p[(p.quiebre_stock == 0) & (p.perdio_ruta == 0)],
    'Cliente perdido tras perder la ruta (espera)': p[p.perdio_ruta == 1],
}
for causa, filas in causas.items():
    print(causa, len(filas), round(filas.venta_perdida_S.sum(), 2))
