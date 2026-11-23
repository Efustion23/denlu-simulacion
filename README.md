# Simulación del almacén de DENLU (2025)

Trabajo de Investigación de Operaciones 1 sobre la distribuidora mayorista DENLU (Tarma, Junín). El objetivo es **minimizar el costo** del almacén: la planilla más la ganancia que se pierde por pedidos cancelados. Se usan teoría de colas (M/M/c), programación entera (MILP) y una simulación de todo el año por casos.

## Ver en línea

- **Página interactiva con la simulación 3D:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## El caso

Ventas recibe el pedido y un despachador lo **alista** y lo **sube al camión**: ahí se forma la cola. Hoy hay **2 despachadores fijos** de 08:00 a 18:00:

- En 6 de las 10 horas llegan más pedidos de los que pueden despachar: ρ > 1, con un máximo de 1.39 a las 11:00.
- La cola crece sin límite, y un pedido que espera más de 60 min pierde su camión y se cancela.
- En 2025 se cancelaron el **16.7 %** de los pedidos: **S/ 1,523,311** de venta perdida y **S/ 181,730** de ganancia perdida.

Dos propuestas mantienen a los 2 fijos y suman gente solo en las horas pico. Las dos salen de un MILP con OR-Tools que pide ρ ≤ 0.85 en cada hora:

| Propuesta | Personal | Planilla al mes | Cancelados | Ahorro al año (costo total) |
|---|---|---|---|---|
| **1. Por horas** (la más barata) | 2 fijos + 5 bloques de 2 h en los picos | S/ 5,450.86 | 2.0 % | **S/ 138,170** |
| **2. Medio turno** (la realista) | 2 fijos + 3 medio turno de 4 h | S/ 6,081.12 | 2.1 % | **S/ 129,460** |

**Recomendación:** adoptar la Propuesta 2 como plan formal y usar personal por horas solo como refuerzo en las campañas de julio y diciembre.

### Productos y secciones del almacén

El almacén tiene **8 secciones** y 48 productos. Para alistar un pedido, el despachador camina a cada sección donde están sus productos; en promedio recorre 5 secciones por pedido. Por eso las secciones más pedidas van más cerca de empaque:

| Ubicación | Sección | Pedidos que la recorren |
|---|---|---|
| 1 | Arroz y azúcar | 8,544 (71 %) |
| 2 | Detergentes y limpieza | 8,329 (69 %) |
| 3 | Bebidas | 8,056 (67 %) |
| 4 | Lácteos | 7,582 (63 %) |
| 5 | Aceites y conservas | 7,521 (62 %) |
| 6 | Fideos y harinas | 7,249 (60 %) |
| 7 | Galletas y golosinas | 6,767 (56 %) |
| 8 | Higiene personal | 5,772 (48 %) |

- El producto más pedido es la leche evaporada en caja de 48 latas: aparece en 4,453 pedidos.
- El margen de ganancia promedio es de 11.9 %. Va de 6 % en arroz y azúcar a 30 % en golosinas.

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | El informe, sección por sección: planteamiento, ρ > 1 y cómo se forma la cola, M/M/c, costo de la cola, demanda por producto y sección (productos más pedidos, veces pedido, margen y clasificación ABC), costos laborales 2025 (sueldo mínimo S/ 1,130), función objetivo y MILP de las 2 propuestas, simulación de todo 2025 por casos (1, 2, 3 y 4 fijos y las 2 propuestas), días críticos, métricas L, W, L<sub>q</sub>, W<sub>q</sub>, bondad de ajuste, ROI y conclusiones. |
| [`Simulacion/datos/`](Simulacion/datos/) | La base de datos **simulada** de 2025: <ul><li>`denlu_2025.csv`: los 12,070 pedidos.</li><li>`denlu_2025_detalle.csv`: los productos de cada pedido, con sección, cantidad, subtotal y margen.</li><li>`denlu_productos.csv`: el catálogo de 48 productos en 8 secciones.</li><li>`denlu_2025.xlsx`: todo lo anterior, más los productos más pedidos, el resumen por sección, por hora y por mes, los días críticos y un diccionario de columnas.</li></ul> |
| [`Simulacion/PLAN_SIMULACION.md`](Simulacion/PLAN_SIMULACION.md) | El plan de ejecución de la simulación 3D: qué muestra, las reglas, los parámetros, los archivos, cómo funciona por dentro y cómo actualizarla. |
| [`Simulacion/web/`](Simulacion/web/) | La página, en 5 pasos (ver abajo). Funciona sin internet: Chart.js, Three.js y la tipografía Barlow van incluidos. |
| [`Simulacion/caso_denlu.py`](Simulacion/caso_denlu.py) | El modelo en Python: parámetros, costos, M/M/c, simulación y MILP. |
| [`Simulacion/generar_datos_2025.py`](Simulacion/generar_datos_2025.py) | Genera la base de datos simulada. Usa una semilla fija, así que siempre sale el mismo archivo. |
| [`Simulacion/exportar_web.py`](Simulacion/exportar_web.py) | Pasa los pedidos y los resultados del notebook a `web/datos2025.js`. |

### Los 5 pasos de la página

1. **El problema:**
   - ρ por hora con 2 despachadores (en rojo, ρ ≥ 1) y lo que cuesta en 2025.
   - Una demostración en vivo de la cola de cualquier hora.
   - *Ver más:* las fórmulas, cómo crece la cola durante el día y la tabla por hora.
2. **El modelo:**
   - La función objetivo y las restricciones de las 2 propuestas.
   - El horario de cada persona frente al requerido D<sub>h</sub>.
   - *Ver más:* los costos laborales y la cobertura por hora.
3. **Las 3 simulaciones:**
   - Se elige una de tres con un botón: **solo personal fijo** (1, 2 = hoy, 3 o 4 fijos), **medio turno** (Propuesta 2) o **por horas** (Propuesta 1).
   - Cada simulación muestra a cada persona real (D1, D2…): si es fija, de medio turno o por horas, su horario, sus horas al día y su costo al mes. También explica por qué el caso ahorra o pierde al año.
   - Una franja del día muestra cuántas personas trabajan en cada hora y de qué tipo, con un contador en vivo de las que trabajan ahora y el ρ de ese momento.
   - Se puede simular todo 2025 día por día, uno de los 10 días más críticos o cualquier fecha.
   - Velocidades de 1 s = 2, 5, 10, 30 o 60 min, o 1 s = 1 día. Un botón da el año completo al instante.
   - El almacén en 3D o en plano 2D, dividido en 8 secciones: cada despachador camina a las secciones de su pedido.
   - Contadores del día y del año: cancelados, venta perdida, ganancia perdida, planilla, costo total y ahorro frente a hoy.
   - La tabla de productos por sección, del día o del año: recorridos, unidades despachadas, venta, ganancia, unidades perdidas y el producto con más unidades.
4. **Productos:**
   - El producto más pedido, la sección más recorrida y el margen promedio.
   - Los 12 productos más pedidos.
   - La tabla por sección.
   - *Ver más:* los 48 productos con su margen y su clase ABC.
5. **Resultados:**
   - La recomendación.
   - El costo total al año de cada caso.
   - *Ver más:* el ROI, los días críticos y las pérdidas por mes.

## Datos

`denlu_2025.csv` es una base **simulada** (sintética), construida con los parámetros del caso:

- llegadas de Poisson por hora, con estacionalidad por mes, día de la semana y campañas;
- tiempos de alistado y carga exponenciales, con media de 30 min;
- productos de un catálogo de 48, elegidos por popularidad y temporada (por ejemplo, el panetón se vende en diciembre). El monto de cada pedido es la suma de sus productos, y su ganancia es la suma del margen de cada uno.

Después se "despacha" con los 2 despachadores de hoy. El notebook la lee desde GitHub, o desde el panel de archivos de Colab si la subes ahí.

## Verificar y actualizar

```bash
python Simulacion/generar_datos_2025.py   # (opcional) regenerar la base de datos
python Simulacion/exportar_web.py         # pasar datos y resultados a la página
node Simulacion/web/verificar.js          # la página debe dar lo mismo que el notebook: imprime OK
```

Para abrir la página en tu computadora, haz doble clic en `Simulacion/web/index.html`, o usa Live Server en VS Code.
