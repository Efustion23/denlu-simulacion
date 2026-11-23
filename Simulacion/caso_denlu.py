"""Modelo del caso DENLU 2025: parámetros, costos, planes de personal, M/M/c, simulación y MILP.

Lo usan generar_datos_2025.py (crea la base de datos simulada) y exportar_web.py (datos de la página).
Las mismas funciones están copiadas en las celdas de Denlu.ipynb, para que el notebook funcione solo en Colab.
"""
import math

import numpy as np

# ---------------------------------------------------------------- Parámetros del almacén
HORAS = list(range(8, 18))            # franjas de 08:00 a 17:00 (el almacén atiende de 08:00 a 18:00)
CIERRE = 600                          # 18:00 en minutos desde las 08:00
MU_MIN = 30.0                         # tiempo medio de servicio: alistar (~2/3) + subir al camión (~1/3)
MU_H = 60 / MU_MIN                    # 2 pedidos por hora por despachador
TOLERANCIA = 60                       # si un pedido espera más de 60 min pierde su camión y el cliente cancela
C_ACTUAL = 2                          # despachadores fijos hoy
# La ganancia de cada pedido sale del margen de cada producto (catálogo de abajo); en promedio es cerca del 13 %.

# ---------------------------------------------------------------- Secciones y productos del almacén
# (nombre, precio de venta S/ por unidad mayorista, margen bruto, popularidad relativa, unidades típicas por línea)
SECCIONES = {
    'Arroz y azúcar': [
        ('Arroz extra, saco 50 kg', 185.00, 0.06, 9, 1.2), ('Arroz superior, bolsa 5 kg', 21.50, 0.08, 7, 4),
        ('Azúcar rubia, saco 50 kg', 172.00, 0.05, 7, 1.1), ('Azúcar rubia, bolsa 5 kg', 19.00, 0.07, 6, 4),
        ('Lenteja, bolsa 1 kg', 7.40, 0.12, 3, 5), ('Frejol canario, bolsa 1 kg', 9.90, 0.12, 2, 4)],
    'Aceites y conservas': [
        ('Aceite vegetal, caja 12 × 1 L', 96.00, 0.09, 8, 1.3), ('Aceite vegetal, botella 1 L', 8.40, 0.11, 5, 6),
        ('Atún en lata, caja 48 u', 165.00, 0.10, 3, 1), ('Atún en lata, unidad', 5.20, 0.13, 4, 8),
        ('Sardina en lata, caja 24 u', 62.00, 0.11, 2, 1), ('Mayonesa, doypack 1 kg', 14.50, 0.14, 2, 2)],
    'Fideos y harinas': [
        ('Fideo spaghetti, fardo 20 × 500 g', 52.00, 0.10, 7, 1.5), ('Fideo canuto, fardo 20 × 500 g', 50.00, 0.10, 4, 1.3),
        ('Harina sin preparar, saco 50 kg', 150.00, 0.07, 2, 1), ('Harina preparada, bolsa 1 kg', 6.20, 0.13, 3, 5),
        ('Avena, bolsa 900 g', 6.80, 0.14, 4, 6), ('Sémola, bolsa 1 kg', 5.90, 0.13, 2, 4)],
    'Lácteos': [
        ('Leche evaporada, caja 48 latas', 168.00, 0.08, 9, 1.3), ('Leche evaporada, lata 400 g', 3.70, 0.11, 6, 12),
        ('Yogurt bebible, 1 L', 7.20, 0.16, 4, 6), ('Mantequilla, 200 g', 7.90, 0.15, 2, 4),
        ('Queso fresco, kg', 18.00, 0.14, 2, 3), ('Leche condensada, lata', 7.50, 0.15, 2, 6)],
    'Bebidas': [
        ('Gaseosa 3 L, paquete 6 u', 46.00, 0.14, 7, 2), ('Gaseosa 500 ml, paquete 12 u', 24.00, 0.16, 5, 2),
        ('Agua mineral 2.5 L, paquete 6 u', 18.00, 0.18, 4, 2), ('Cerveza, caja 12 × 620 ml', 66.00, 0.12, 6, 2),
        ('Rehidratante 500 ml, paquete 12 u', 30.00, 0.18, 2, 1.5), ('Néctar de fruta, 1 L', 4.80, 0.20, 2, 6)],
    'Detergentes y limpieza': [
        ('Detergente en polvo, bolsa 4 kg', 38.00, 0.18, 8, 2), ('Detergente en polvo, bolsa 800 g', 8.90, 0.20, 6, 6),
        ('Lejía, galón 4 L', 9.50, 0.22, 5, 4), ('Jabón de lavar, paquete 6 barras', 13.00, 0.21, 4, 3),
        ('Lavavajilla en pasta, 1 kg', 11.50, 0.22, 3, 3), ('Papel higiénico, paquete 24 rollos', 32.00, 0.17, 5, 2)],
    'Higiene personal': [
        ('Champú, 1 L', 18.50, 0.24, 2, 2), ('Jabón de tocador, paquete 3 u', 8.40, 0.23, 3, 4),
        ('Pasta dental, paquete 3 u', 12.00, 0.22, 3, 3), ('Toallas higiénicas, paquete 10 u', 5.50, 0.25, 2, 6),
        ('Pañales, paquete 40 u', 42.00, 0.18, 3, 2), ('Desodorante, 150 ml', 11.00, 0.26, 1, 3)],
    'Galletas y golosinas': [
        ('Galletas de soda, paquete 6 × 6 u', 9.80, 0.22, 5, 4), ('Galletas dulces, caja 24 u', 18.00, 0.24, 4, 2),
        ('Chocolate en barra, caja 24 u', 26.00, 0.26, 2, 1.5), ('Caramelos, bolsa 100 u', 6.50, 0.30, 3, 4),
        ('Snacks salados, paquete 12 u', 14.00, 0.28, 2, 2), ('Panetón, caja 6 u', 120.00, 0.20, 1, 1.2)],
}
PRODUCTOS = [dict(id=i, seccion=s, producto=p, precio=pr, margen=m, popularidad=w, unidades_tipicas=q)
             for i, (s, p, pr, m, w, q) in enumerate((s, *x) for s, xs in SECCIONES.items() for x in xs)]

# Llegadas promedio por hora (pedidos/h) que se usaron para simular 2025
LAMBDA_BASE = [2.4, 4.4, 5.4, 5.6, 4.2, 3.0, 4.4, 5.0, 3.8, 2.2]

# ---------------------------------------------------------------- Costos laborales (Perú, 2025)
RMV = 1130.00                         # remuneración mínima vital desde enero de 2025
DIAS_MES = 26                         # lunes a sábado
ESSALUD = 0.09
GRATI = 2 * RMV / 12                  # dos gratificaciones al año, provisión mensual
BONIF = 0.09 * GRATI                  # bonificación extraordinaria (Ley 30334)
CTS = (RMV + RMV / 6) / 12            # CTS: sueldo + 1/6 de gratificación, provisión mensual
C_FT = round(RMV + ESSALUD * RMV + GRATI + BONIF + CTS, 2)                  # jornada completa de 8 h
HORA_SIMPLE = RMV / 240                                                      # 30 días x 8 h
HORA_EXTRA = HORA_SIMPLE * 1.25                                              # primeras 2 h extra: +25 %
C_EXTRA_2H = round(2 * DIAS_MES * HORA_EXTRA * (1 + ESSALUD), 2)            # 2 h extra diarias al mes
C_FIJO = round(C_FT + C_EXTRA_2H, 2)                                         # fijo de 08:00 a 18:00 (como hoy)
C_MT = round(C_FT / 2, 2)                                                    # medio turno de 4 h (formal)
TARIFA_HORA = 6.50                                                           # personal por horas (sin beneficios)


# ---------------------------------------------------------------- Turnos y planes
def horas(desde, hasta):
    return list(range(desde, hasta))


TURNOS = {'Fijo 08-18': horas(8, 18)}
for h in range(8, 17):
    TURNOS[f'Por horas {h:02d}-{h + 2:02d}'] = horas(h, h + 2)      # bloques de 2 h
for h in range(8, 15):
    TURNOS[f'Medio turno {h:02d}-{h + 4:02d}'] = horas(h, h + 4)    # medio turno continuo de 4 h


def costo_turno(nombre):
    if nombre.startswith('Fijo'):
        return C_FIJO
    if nombre.startswith('Medio'):
        return C_MT
    return round(TARIFA_HORA * len(TURNOS[nombre]) * DIAS_MES, 2)


def costo_mensual(plan):
    return round(sum(n * costo_turno(t) for t, n in plan.items()), 2)


def personal_por_hora(plan):
    return [sum(n for t, n in plan.items() if h in TURNOS[t]) for h in HORAS]


def trabajadores(plan):
    """Lista de turnos, uno por persona (primero los fijos)."""
    return [TURNOS[t] for t, n in plan.items() for _ in range(n)]


# ---------------------------------------------------------------- Teoría de colas M/M/c
def mmc(lam, c, mu=MU_H):
    """Métricas de M/M/c. Si rho >= 1 la cola crece sin límite (valores infinitos)."""
    rho = lam / (c * mu)
    if c == 0 or rho >= 1:
        return dict(rho=rho, P0=0.0, Pw=1.0, Lq=math.inf, Wq=math.inf, L=math.inf, W=math.inf)
    a = lam / mu
    suma = sum(a ** n / math.factorial(n) for n in range(c))
    ultimo = a ** c / (math.factorial(c) * (1 - rho))
    P0 = 1 / (suma + ultimo)
    Pw = ultimo * P0                                    # probabilidad de esperar (Erlang C)
    Lq = Pw * rho / (1 - rho)
    Wq = Lq / lam * 60                                  # minutos
    return dict(rho=rho, P0=P0, Pw=Pw, Lq=Lq, Wq=Wq, L=Lq + a, W=Wq + 60 / mu)


def requeridos(lambdas, rho_max=0.85, mu=MU_H):
    """D_h: despachadores mínimos por hora para que rho_h <= rho_max."""
    return [max(1, math.ceil(l / (rho_max * mu) - 1e-9)) for l in lambdas]


# ---------------------------------------------------------------- Simulación de un día (pedidos reales)
def _en_turno(turno, t):
    """Primer instante >= t en que la persona puede empezar un pedido.
    Quien trabaja a las 17 h se queda después de las 18:00 hasta vaciar la cola."""
    if t >= CIERRE:
        return t if 17 in turno else math.inf
    for h in range(int(t // 60) + 8, 18):
        if h in turno:
            return max(t, (h - 8) * 60.0)
    return math.inf


def simular_dia(llegadas, servicios, turnos, tolerancia=TOLERANCIA):
    """Primero en llegar, primero en ser atendido. Cada pedido toma a la persona que puede empezar antes.
    Si su espera pasaría de `tolerancia` min, pierde el camión y se cancela (sin ocupar a nadie).
    Devuelve, por pedido: inicio (o NaN), espera, despachador (o -1) y cancelado."""
    libre = [0.0] * len(turnos)
    inicio, espera, quien, cancelado = [], [], [], []
    for a, s in zip(llegadas, servicios):
        mejor, k = math.inf, -1
        for i, turno in enumerate(turnos):
            t = _en_turno(turno, max(a, libre[i]))
            if t < mejor:
                mejor, k = t, i
        if mejor - a > tolerancia:
            inicio.append(math.nan); espera.append(float(tolerancia)); quien.append(-1); cancelado.append(1)
        else:
            libre[k] = mejor + s
            inicio.append(mejor); espera.append(mejor - a); quien.append(k); cancelado.append(0)
    return inicio, espera, quien, cancelado


def simular_anio(df, plan, tolerancia=TOLERANCIA):
    """Repite los pedidos de 2025 (llegadas, tiempos de servicio y montos) con otro plan de personal."""
    turnos = trabajadores(plan)
    filas = []
    for fecha, g in df.groupby('fecha', sort=True):
        ini, esp, _, can = simular_dia(g['llegada_min'].values, g['tiempo_servicio_min'].values, turnos, tolerancia)
        filas.append(dict(fecha=fecha, pedidos=len(g), cancelados=int(sum(can)),
                          espera_total=float(sum(e for e, c in zip(esp, can) if not c)),
                          venta=float(g['monto_pedido_S'].sum()),
                          venta_perdida=float(g['monto_pedido_S'].values[np.array(can, bool)].sum()),
                          margen_perdido=float(g['margen_pedido_S'].values[np.array(can, bool)].sum())))
    return filas


# ---------------------------------------------------------------- Programación entera (MILP)
def optimizar(D, opciones, fijos=None, lambdas=LAMBDA_BASE):
    """Minimiza el costo mensual de los turnos en `opciones` para que, sumando los `fijos`,
    haya al menos D_h despachadores en cada hora.   min Z = sum_j c_j x_j   s.a.   sum_j a_hj x_j >= D_h - F_h.
    Entre planes del mismo costo prefiere el que pone la gente extra en las horas con más pedidos
    (término de desempate de 0.0001 x lambda_h por persona-hora), así la solución es siempre la misma."""
    from ortools.linear_solver import pywraplp
    fijos = fijos or {}
    F = personal_por_hora(fijos)
    solver = pywraplp.Solver.CreateSolver('SCIP')
    x = {t: solver.IntVar(0, 10, t) for t in opciones}
    for i, h in enumerate(HORAS):
        solver.Add(sum(x[t] for t in opciones if h in TURNOS[t]) >= D[i] - F[i], f'cobertura_{h}')
    desempate = sum(1e-4 * lambdas[i] * x[t] for t in opciones for i, h in enumerate(HORAS) if h in TURNOS[t])
    solver.Minimize(sum(costo_turno(t) * x[t] for t in opciones) - desempate)
    assert solver.Solve() == pywraplp.Solver.OPTIMAL
    plan = dict(fijos)
    plan.update({t: int(round(v.solution_value())) for t, v in x.items() if v.solution_value() > 0.5})
    return plan


# ---------------------------------------------------------------- Calidad de servicio
def p_espera_mas(lam, c, t=30, mu=MU_H):
    """P(Wq > t) en M/M/c: probabilidad de que un pedido espere más de t minutos. Si rho >= 1, es 1."""
    m = mmc(lam, c, mu)
    return 1.0 if m['rho'] >= 1 else m['Pw'] * math.exp(-(c * mu - lam) * t / 60)


def requeridos_calidad(lambdas, mu=MU_H, t=30, meta=0.10):
    """Personas mínimas por hora para que como máximo `meta` de los pedidos espere más de t minutos."""
    req = []
    for lam in lambdas:
        c = 1
        while p_espera_mas(lam, c, t, mu) > meta:
            c += 1
        req.append(c)
    return req
