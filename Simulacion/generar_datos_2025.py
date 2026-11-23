"""Genera la base de datos SIMULADA de pedidos de DENLU en 2025 (situación actual: 2 despachadores fijos).

Uso:  python generar_datos_2025.py   -> datos/denlu_2025.csv (pedidos), denlu_2025_detalle.csv (productos de cada
      pedido), denlu_productos.csv (catálogo) y denlu_2025.xlsx (todo, con resúmenes)

Los datos son sintéticos: se generan con los parámetros del caso (llegadas de Poisson por hora con
estacionalidad, tiempos de servicio exponenciales de 30 min en promedio y productos de un catálogo de 48 en
8 secciones, elegidos por popularidad; el monto del pedido es la suma de sus productos) y se
"despachan" con el modelo de cola de caso_denlu.py. La semilla es fija: siempre sale el mismo archivo.
"""
import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

import caso_denlu as C

rng = np.random.default_rng(2025)
SALIDA = Path(__file__).parent / 'datos'

# ---------------------------------------------------------------- Calendario 2025 (lunes a sábado)
FERIADOS = {'2025-01-01', '2025-04-17', '2025-04-18', '2025-05-01', '2025-06-07', '2025-06-29', '2025-07-23',
            '2025-07-28', '2025-07-29', '2025-08-06', '2025-08-30', '2025-10-08', '2025-11-01', '2025-12-08',
            '2025-12-09', '2025-12-25'}
DIAS = [d for d in (dt.date(2025, 1, 1) + dt.timedelta(i) for i in range(365))
        if d.weekday() < 6 and d.isoformat() not in FERIADOS]

MES = {1: .92, 2: .85, 3: 1.06, 4: .94, 5: 1.00, 6: .95, 7: 1.10, 8: .97, 9: .95, 10: 1.00, 11: 1.04, 12: 1.25}
SEMANA = [1.12, .96, .95, .98, 1.04, .95]                 # lunes ... sábado
CAMPANAS = [((3, 1), (3, 8), 1.15, 'Campaña escolar'), ((5, 8), (5, 10), 1.15, 'Día de la Madre'),
            ((6, 12), (6, 14), 1.10, 'Día del Padre'), ((7, 21), (7, 26), 1.25, 'Fiestas Patrias'),
            ((10, 29), (10, 31), 1.12, 'Canción Criolla / Todos los Santos'), ((12, 15), (12, 19), 1.15, 'Campaña navideña'),
            ((12, 20), (12, 24), 1.30, 'Víspera de Navidad'), ((12, 26), (12, 31), 1.12, 'Año Nuevo')]


def factor(d):
    f, campana = MES[d.month] * SEMANA[d.weekday()], ''
    for (m1, d1), (m2, d2), k, nombre in CAMPANAS:
        if (m1, d1) <= (d.month, d.day) <= (m2, d2):
            f, campana = f * k, nombre
    if (d + dt.timedelta(1)).isoformat() in FERIADOS:
        f, campana = f * 1.10, campana or 'Víspera de feriado'
    return f, campana


factores = np.array([factor(d)[0] for d in DIAS])
factores /= factores.mean()                                 # el día promedio tiene exactamente las tasas LAMBDA_BASE

# ---------------------------------------------------------------- Clientes y rutas
RUTAS = ['R1 Tarma Centro', 'R2 Acobamba', 'R3 Palcamayo', 'R4 La Unión-Leticia', 'R5 Huasahuasi',
         'R6 Tarmatambo', 'R7 San Pedro de Cajas', 'R8 Huaricolca']
N_CLI = 220
peso_cli = 1 / np.arange(1, N_CLI + 1) ** 0.7
peso_cli /= peso_cli.sum()
ruta_cli = rng.choice(len(RUTAS), N_CLI, p=[.30, .16, .12, .12, .09, .08, .07, .06])
TIPO = ['Bodega', 'Minimarket', 'Restaurante', 'Bodega', 'Mercado (puesto)']
tipo_cli = rng.choice(len(TIPO), N_CLI)

# ---------------------------------------------------------------- Pedidos
filas = []
for d, f in zip(DIAS, factores):
    for i, h in enumerate(C.HORAS):
        for _ in range(rng.poisson(C.LAMBDA_BASE[i] * f)):
            seg = int((h - 8) * 3600 + rng.uniform(0, 3600))
            servicio = max(0.5, round(rng.exponential(C.MU_MIN), 1))
            alistado = round(servicio * rng.uniform(0.62, 0.72), 1)
            cli = rng.choice(N_CLI, p=peso_cli)
            monto = rng.lognormal(np.log(520) - 0.55 ** 2 / 2, 0.55) * (1.10 if d.month == 12 else 1)
            filas.append(dict(fecha=d.isoformat(), seg=seg, servicio=servicio, alistado=alistado, cli=cli,
                              monto=round(min(monto, 4500), 2)))

df = pd.DataFrame(filas).sort_values(['fecha', 'seg'], kind='stable').reset_index(drop=True)
df['llegada_min'] = (df.seg / 60).round(4)            # el mismo valor que queda en el CSV

# Despacho con la situación actual: 2 despachadores fijos de 08:00 a 18:00
turnos = C.trabajadores({'Fijo 08-18': C.C_ACTUAL})
ini, esp, quien, can = [], [], [], []
for _, g in df.groupby('fecha', sort=True):
    r = C.simular_dia(g.llegada_min.values, g.servicio.values, turnos)
    for lst, v in zip((ini, esp, quien, can), r):
        lst.extend(v)

DIAS_SEM = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre',
         'Noviembre', 'Diciembre']
reloj = lambda m: '' if np.isnan(m) else f'{8 + int(m // 60):02d}:{int(m % 60):02d}:{int(round(m * 60)) % 60:02d}'
fechas = pd.to_datetime(df.fecha)
camp = {d.isoformat(): factor(d)[1] for d in DIAS}
inicio = np.array(ini)
cancel = np.array(can)

# ---------------------------------------------------------------- Detalle de cada pedido (productos)
# Cuantas más líneas tiene un pedido, más tarda en alistarse: n_productos sale del tiempo de alistado.
# Los productos se eligen por popularidad (con temporadas) y el monto del pedido es la suma de sus líneas.
rng2 = np.random.default_rng(4096)
CAT = pd.DataFrame(C.PRODUCTOS)
TEMPORADA = {'Panetón, caja 6 u': {12: 12, 11: 3}, 'Chocolate en barra, caja 24 u': {12: 3, 11: 1.5},
             'Cerveza, caja 12 × 620 ml': {7: 2, 12: 2, 10: 1.5}, 'Gaseosa 3 L, paquete 6 u': {12: 1.6, 7: 1.4},
             'Galletas de soda, paquete 6 × 6 u': {3: 1.6}, 'Galletas dulces, caja 24 u': {3: 1.6},
             'Leche condensada, lata': {5: 2, 12: 1.5}, 'Rehidratante 500 ml, paquete 12 u': {1: 1.5, 2: 1.5, 3: 1.3}}
pesos = {m: np.array([w * TEMPORADA.get(p, {}).get(m, 1) for p, w in zip(CAT.producto, CAT.popularidad)], float) for m in range(1, 13)}
for m in pesos:
    pesos[m] /= pesos[m].sum()
n_lineas = np.minimum(25, np.maximum(1, np.round(df.alistado / 2.2).astype(int) + 1)).values
meses = pd.to_datetime(df.fecha).dt.month.values
lineas, montos, margenes, unidades, secciones = [], [], [], [], []
for i in range(len(df)):
    elegidos = np.sort(rng2.choice(len(CAT), size=n_lineas[i], replace=False, p=pesos[meses[i]]))
    total = gan = uni = 0.0
    for k in elegidos:
        q = 1 + rng2.poisson(CAT.unidades_tipicas[k] - 1)
        sub = round(q * CAT.precio[k], 2)
        lineas.append((i, k, q, sub, round(sub * CAT.margen[k], 2)))
        total += sub; gan += sub * CAT.margen[k]; uni += q
    montos.append(round(total, 2)); margenes.append(round(gan, 2)); unidades.append(int(uni))
    secciones.append(CAT.seccion[elegidos].nunique())
df['monto'] = montos
df['margen'] = margenes

out = pd.DataFrame({
    'id_pedido': [f'P25-{i + 1:05d}' for i in range(len(df))],
    'fecha': df.fecha,
    'dia_semana': [DIAS_SEM[d] for d in fechas.dt.weekday],
    'mes': [MESES[m - 1] for m in fechas.dt.month],
    'campana': df.fecha.map(camp),
    'hora_llegada': [f'{8 + s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}' for s in df.seg],
    'hora_del_dia': 8 + df.seg // 3600,
    'llegada_min': df.llegada_min,
    'cliente': [f'CLI-{c + 1:03d}' for c in df.cli],
    'tipo_cliente': [TIPO[tipo_cli[c]] for c in df.cli],
    'ruta': [RUTAS[ruta_cli[c]] for c in df.cli],
    'n_productos': n_lineas,
    'unidades': unidades,
    'secciones_visitadas': secciones,
    'monto_pedido_S': df.monto,
    'margen_pedido_S': df.margen,
    'n_despachadores': C.C_ACTUAL,
    'tiempo_alistado_min': df.alistado,
    'tiempo_carga_min': (df.servicio - df.alistado).round(1),
    'tiempo_servicio_min': df.servicio,
    'hora_inicio_despacho': [reloj(m) for m in inicio],
    'tiempo_espera_min': np.round(esp, 2),
    'hora_fin_despacho': [reloj(m) for m in inicio + df.servicio.values],
    'tiempo_en_sistema_min': np.where(cancel == 1, np.nan, np.round(np.array(esp) + df.servicio.values, 2)),
    'despachador': ['' if q < 0 else f'Despachador {q + 1}' for q in quien],
    'estado': np.where(cancel == 1, 'Cancelado por demora', 'Entregado'),
    'cancelado': cancel,
    'venta_perdida_S': np.where(cancel == 1, df.monto, 0.0),
    'margen_perdido_S': np.where(cancel == 1, df.margen, 0.0),
})
detalle = pd.DataFrame(lineas, columns=['fila', 'id_producto', 'cantidad', 'subtotal_S', 'margen_S'])
detalle.insert(0, 'id_pedido', out.id_pedido.values[detalle.fila])
detalle.insert(1, 'fecha', out.fecha.values[detalle.fila])
detalle.insert(3, 'seccion', CAT.seccion.values[detalle.id_producto])
detalle.insert(4, 'producto', CAT.producto.values[detalle.id_producto])
detalle.insert(5, 'precio_S', CAT.precio.values[detalle.id_producto])
detalle['margen_pct'] = CAT.margen.values[detalle.id_producto]
detalle['estado'] = out.estado.values[detalle.fila]
detalle = detalle.drop(columns='fila')
productos = CAT.rename(columns={'id': 'id_producto', 'precio': 'precio_S', 'margen': 'margen_pct'})[
    ['id_producto', 'seccion', 'producto', 'precio_S', 'margen_pct']]

if __name__ == '__main__':
    SALIDA.mkdir(exist_ok=True)
    out.to_csv(SALIDA / 'denlu_2025.csv', index=False, encoding='utf-8')
    detalle.to_csv(SALIDA / 'denlu_2025_detalle.csv', index=False, encoding='utf-8')
    productos.to_csv(SALIDA / 'denlu_productos.csv', index=False, encoding='utf-8')
    top = detalle.groupby(['seccion', 'producto']).agg(veces_pedido=('id_pedido', 'size'), unidades=('cantidad', 'sum'),
                                                       venta_S=('subtotal_S', 'sum'), ganancia_S=('margen_S', 'sum'))
    top = top.sort_values('veces_pedido', ascending=False).reset_index()
    top['margen_pct'] = (top.ganancia_S / top.venta_S).round(3)
    por_seccion = detalle.groupby('seccion').agg(recorridos=('id_pedido', 'nunique'), lineas=('id_pedido', 'size'),
                                                 unidades=('cantidad', 'sum'), venta_S=('subtotal_S', 'sum'),
                                                 ganancia_S=('margen_S', 'sum')).sort_values('recorridos', ascending=False)
    por_seccion['margen_pct'] = (por_seccion.ganancia_S / por_seccion.venta_S).round(3)

    por_hora = out.groupby('hora_del_dia').agg(pedidos=('id_pedido', 'size'), espera_media_min=('tiempo_espera_min', 'mean'),
                                               cancelados=('cancelado', 'sum'), venta_perdida_S=('venta_perdida_S', 'sum'))
    por_hora.insert(1, 'lambda_ped_h', (por_hora.pedidos / len(DIAS)).round(3))
    por_hora.insert(2, 'rho_con_2', (por_hora.lambda_ped_h / (C.C_ACTUAL * C.MU_H)).round(3))
    por_mes = out.groupby(fechas.dt.month).agg(pedidos=('id_pedido', 'size'), venta_S=('monto_pedido_S', 'sum'),
                                               cancelados=('cancelado', 'sum'), venta_perdida_S=('venta_perdida_S', 'sum'))
    por_mes.index = MESES
    por_dia = out.groupby('fecha').agg(pedidos=('id_pedido', 'size'), cancelados=('cancelado', 'sum'),
                                       venta_perdida_S=('venta_perdida_S', 'sum')).sort_values('pedidos', ascending=False)
    diccionario = pd.DataFrame([
        ('id_pedido', 'Código del pedido'), ('fecha', 'Fecha (lunes a sábado, sin feriados)'),
        ('campana', 'Campaña o temporada del día, si la hay'), ('hora_llegada', 'Hora en que ventas recibe el pedido'),
        ('hora_del_dia', 'Franja horaria (8 = 08:00-08:59)'), ('llegada_min', 'Minutos desde las 08:00'),
        ('n_productos', 'Productos distintos del pedido (líneas)'), ('unidades', 'Unidades pedidas en total'),
        ('secciones_visitadas', 'Secciones del almacén que hay que recorrer para alistarlo'),
        ('monto_pedido_S', 'Valor del pedido en soles (suma de sus líneas)'),
        ('margen_pedido_S', 'Ganancia del pedido: suma del margen de cada producto'),
        ('n_despachadores', 'Despachadores en turno (situación actual)'),
        ('tiempo_alistado_min', 'Tiempo estándar para alistar el pedido'),
        ('tiempo_carga_min', 'Tiempo estándar para subirlo al camión'),
        ('tiempo_servicio_min', 'Alistado + carga (lo que ocupa a un despachador)'),
        ('tiempo_espera_min', 'Espera en cola hasta que un despachador lo toma'),
        ('estado', 'Entregado o Cancelado por demora (esperó más de 60 min y perdió su camión)'),
        ('venta_perdida_S', 'Monto del pedido si se canceló'),
        ('margen_perdido_S', 'Ganancia perdida si se canceló'),
        ('denlu_2025_detalle.csv', 'Una fila por producto de cada pedido: sección, producto, cantidad, subtotal y margen'),
        ('denlu_productos.csv', 'Catálogo: 48 productos en 8 secciones, con precio y margen'),
    ], columns=['columna', 'descripción'])
    with pd.ExcelWriter(SALIDA / 'denlu_2025.xlsx') as xl:
        out.to_excel(xl, sheet_name='Pedidos', index=False)
        detalle.to_excel(xl, sheet_name='Detalle de pedidos', index=False)
        productos.to_excel(xl, sheet_name='Productos', index=False)
        top.to_excel(xl, sheet_name='Productos más pedidos', index=False)
        por_seccion.to_excel(xl, sheet_name='Por sección')
        por_hora.to_excel(xl, sheet_name='Resumen por hora')
        por_mes.to_excel(xl, sheet_name='Resumen por mes')
        por_dia.head(30).to_excel(xl, sheet_name='Días más críticos')
        diccionario.to_excel(xl, sheet_name='Diccionario', index=False)
    print(len(out), 'pedidos en', len(DIAS), 'días')
