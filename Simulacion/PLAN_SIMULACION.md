# Plan de ejecución: simulación 3D del almacén de DENLU (2025)

Este documento explica cómo está construida la simulación de la página de GitHub
(https://efustion23.github.io/denlu-simulacion/), paso a paso, para poder rehacerla, cambiarla o explicarla.
La simulación usa **los mismos datos y las mismas reglas** que la sección 5 de `Denlu.ipynb`, así que los
totales del año que muestra son iguales a los del notebook.

---

## 1. Qué tiene que mostrar

1. **Que se forma la cola.** Con 2 despachadores, en 6 de las 10 horas llegan más pedidos de los que pueden
   despachar (ρ > 1). Los pedidos se acumulan en el tablero hora tras hora.
2. **Casos arriba de la simulación.** Se elige con qué personal se simula:

   | Caso | Personal | Planilla al mes |
   |---|---|---|
   | Caso 1 | 1 fijo (08:00–18:00) | S/ 1,880.43 |
   | **Caso 2 (hoy)** | **2 fijos (08:00–18:00)** | **S/ 3,760.86** |
   | Caso 3 | 3 fijos | S/ 5,641.29 |
   | Caso 4 | 4 fijos | S/ 7,521.72 |
   | Propuesta 1 | 2 fijos + 5 bloques por horas (09–11, 10–12, 11–13, 14–16, 15–17) | S/ 5,450.86 |
   | Propuesta 2 | 2 fijos + 3 medio turno (2 × 09–13, 1 × 13–17) | S/ 6,081.12 |

3. **Todo el año, rápido.** Velocidades de 1 s = 2, 5, 10, 30 o 60 min de almacén, y **1 s = 1 día** para
   recorrer 2025 completo. Al terminar un día empieza el siguiente sin detenerse. Un botón da el año completo al
   instante.
4. **Días críticos.** Un menú con los 10 días de más pedidos (campaña de Navidad, Fiestas Patrias...) y un
   selector de cualquier fecha.
5. **El dinero en cada caso.** Contadores del día (en cola, despachados, cancelados, venta perdida) y del año
   (cancelados, venta perdida, ganancia perdida, planilla pagada, costo total y ahorro o pérdida frente a hoy),
   más un gráfico de la ganancia perdida acumulada frente a la de hoy.

## 2. El proceso que se simula

```
Ventas recibe el pedido ──► Tablero (COLA) ──► Despachador: alista ──► sube al camión ──► Camión de la ruta
        (sin cola)            espera            (≈ 2/3 del tiempo)      (≈ 1/3)
```

* Un pedido llega a la hora que dice la base de datos (`llegada_min`).
* Ocupa a un despachador durante `tiempo_servicio_min` = alistado + carga (en promedio 29.75 min, μ = 2.017 pedidos/h).
* **Orden de llegada:** cada pedido lo toma la persona que puede empezar antes.
* **Horarios:** el personal por horas y de medio turno solo empieza pedidos dentro de su horario. Quien trabaja a
  las 17 h se queda después de las 18:00 hasta vaciar la cola.
* **Cancelación:** si el pedido tendría que esperar **más de 60 min**, pierde su camión y el cliente cancela.
  Ese pedido no ocupa a nadie. A los 45 min de espera la hoja se marca en rojo (está por perder su camión).

Mientras alistan un pedido llega otro, y otro. Si llegan más rápido de lo que se despachan (λ > c·μ), la cola
crece: eso es lo que se ve en el tablero.

## 3. Parámetros (todos en un solo lugar)

| Parámetro | Valor | Dónde se cambia |
|---|---|---|
| Horario | 08:00–18:00, lunes a sábado (298 días en 2025) | `generar_datos_2025.py` |
| λ por hora (promedio) | 2.33, 4.66, 5.35, 5.59, 4.10, 3.03, 4.45, 4.94, 3.66, 2.39 | sale del CSV |
| Tiempo de servicio | exponencial, media 29.75 min | sale del CSV |
| Tolerancia | 60 min | `TOLERANCIA` en `caso_denlu.py` y en el notebook |
| Margen bruto | 15 % | `MARGEN` |
| Sueldo mínimo | S/ 1,130 | `RMV` |
| Fijo 8 h | S/ 1,546.84 al mes | calculado (EsSalud, gratificaciones, bonificación, CTS) |
| Fijo 08–18 (hoy) | S/ 1,880.43 al mes | + 2 h extra diarias al 25 % |
| Medio turno 4 h | S/ 773.42 al mes | la mitad del fijo de 8 h |
| Por horas | S/ 6.50 por hora (bloque de 2 h = S/ 338 al mes) | `TARIFA_HORA` |
| Nivel de servicio | ρ ≤ 0.85 en cada hora | `RHO_MAX` |

## 4. Archivos

| Archivo | Qué hace |
|---|---|
| `Simulacion/caso_denlu.py` | Parámetros, costos, turnos, M/M/c, simulación de un día y del año, y el MILP. |
| `Simulacion/generar_datos_2025.py` | Crea la base de datos simulada `datos/denlu_2025.csv` y `datos/denlu_2025.xlsx` (semilla fija). |
| `Simulacion/Denlu.ipynb` | El informe: planteamiento, ρ > 1, M/M/c, función objetivo, MILP de las 2 propuestas, simulación por casos, ROI. |
| `Simulacion/exportar_web.py` | Pasa a `web/datos2025.js` los pedidos, los casos y los resultados del notebook. |
| `Simulacion/web/simulacion.js` | La simulación en JavaScript (mismas reglas). Arma también la lista de eventos de la animación. |
| `Simulacion/web/app.js` | Las 4 secciones de la página, los contadores, el modo año y el motor de la animación 2D. |
| `Simulacion/web/almacen3d.js` | El almacén en 3D (Three.js): ventas, tablero, estantes, acopio, mesas, comedor y andén con camiones. |
| `Simulacion/web/cola.js` | La demostración en vivo de la cola de una hora (sección 1). |
| `Simulacion/web/verificar.js` | Comprueba que la página da los mismos resultados que el notebook. |

## 5. Cómo funciona por dentro (pasos de la implementación)

1. **Datos del día.** `datos2025.js` trae, por fecha, la lista `[llegada, servicio, monto, ...]` de cada pedido.
2. **Simular el día** (`simularDia` en `simulacion.js`). Para cada pedido, en orden de llegada:
   * para cada persona se calcula el primer momento en que puede empezar (`enTurno`: libre y dentro de su horario);
   * se elige la de menor tiempo; si la espera pasa de 60 min, el pedido se cancela;
   * si no, esa persona queda ocupada hasta `inicio + servicio`.
3. **Lista de eventos.** El mismo recorrido anota `llegada`, `perdio` (45 min), `cancela`, `inicio`, `fin`, `turno`
   (cada hora, quién está de turno) y `sale` (quien termina fuera de su horario se va al comedor). Se ordena por tiempo.
4. **Animación.** Cada cuadro avanza el reloj según la velocidad (1 s = 2 … 660 min) y aplica los eventos hasta esa
   hora. Las hojas aparecen en el tablero (la cola); cada despachador toma una, va al acopio, recoge en los estantes,
   empaca en su mesa y la sube al camión de su ruta. Las caminatas solo reparten el tiempo de servicio entre esas etapas.
5. **Modo año.** Al terminar un día se suma su resultado (pedidos, cancelados, venta perdida) y se carga el siguiente.
   La planilla pagada se prorratea: `12 × planilla mensual × días simulados / 298`.
6. **Dinero.** Ganancia perdida = 15 % de la venta perdida. Costo total = planilla + ganancia perdida.
   Ahorro frente a hoy = costo total de hoy en los mismos días − costo total del caso.
7. **Casos y días críticos.** Cambiar de caso vuelve a simular el día con otro personal. El menú de días críticos
   salta a esa fecha.

## 6. Cómo actualizar o publicar

```bash
# 1. (Opcional) cambiar parámetros en caso_denlu.py o generar_datos_2025.py y regenerar la base de datos
python Simulacion/generar_datos_2025.py

# 2. Pasar datos y resultados a la página
python Simulacion/exportar_web.py

# 3. Comprobar que la página y el notebook coinciden
node Simulacion/web/verificar.js        # debe imprimir OK

# 4. Ver la página: abrir Simulacion/web/index.html (doble clic o Live Server)

# 5. Publicar: commit + push a main. GitHub Pages publica Simulacion/web/ en unos minutos.
```

Para el notebook en Colab no hace falta nada más: lee `denlu_2025.csv` desde GitHub, o desde el panel de archivos
si lo subes ahí.

## 7. Resultados que debe dar (todo 2025)

| Caso | Cancelados | Espera media | Venta perdida | Costo total al año | Frente a hoy |
|---|---|---|---|---|---|
| Caso 1: 1 fijo | 50.54 % | 33.2 min | S/ 3,162,489 | S/ 496,939 | pierde S/ 294,052 |
| **Caso 2 (hoy): 2 fijos** | **16.71 %** | **21.2 min** | **S/ 1,051,705** | **S/ 202,886** | – |
| Caso 3: 3 fijos | 3.51 % | 9.9 min | S/ 223,825 | S/ 101,269 | ahorra S/ 101,617 |
| Caso 4: 4 fijos | 0.66 % | 3.8 min | S/ 41,049 | S/ 96,418 | ahorra S/ 106,468 |
| Propuesta 1: por horas | 2.01 % | 6.7 min | S/ 123,601 | S/ 83,951 | **ahorra S/ 118,936** |
| Propuesta 2: medio turno | 2.13 % | 6.4 min | S/ 136,414 | S/ 93,435 | **ahorra S/ 109,451** |
