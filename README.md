# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: optimización de personal en el almacén de la distribuidora mayorista DENLU (Tarma, Junín) con teoría de colas (M/M/c) y programación lineal entera (MILP) bajo la legislación peruana. Todo el trabajo está en `Simulacion/Denlu.ipynb`.

## Ver en línea

- **Página interactiva:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | El notebook del trabajo, sin cambios: diagnóstico con colas M/M/c, requerimiento por hora, modelo MILP con OR-Tools, cobertura, ROI, métricas L, W, L<sub>q</sub>, W<sub>q</sub>, tiempo entre llegadas, bondad de ajuste y utilización frente al 80 %. |
| [`Simulacion/web/`](Simulacion/web/) | Página guiada en siete pasos con las cifras del notebook (ver abajo). Funciona sin internet: Chart.js, Three.js r147 y la tipografía Barlow van incluidos en `vendor/` y `fonts/`. |
| [`Simulacion/agregados_csv.py`](Simulacion/agregados_csv.py) | Calcula, a partir del CSV, los agregados que usa la página para demostrar la cola (no publica el CSV). |

### Los siete pasos de la página

1. **La cola.** Demostración de que se forma una cola:
   - Las fórmulas M/M/c.
   - Una simulación en vivo de la hora y la cantidad de despachadores que elijas, junto a ρ, P(esperar), L<sub>q</sub> y W<sub>q</sub> teóricos.
   - La evidencia del CSV de 2025: el 41 % de los pedidos esperó, en 178 de los 299 días hubo 3 o más pedidos en cola a la vez, hubo hasta 10 pedidos en cola, y los 422 pedidos que perdieron su ruta habían esperado.
2. **Diagnóstico.** λ frente a la capacidad de los 3 despachadores en cada hora, con un medidor de ρ y la espera real.
3. **Despachadores por hora.**
   - Compara hoy (3; 4 en diciembre según el CSV), el requerido D<sub>h</sub>, el plan MILP y un plan alternativo.
   - Incluye un simulador para cambiar los despachadores de cada hora y ver ρ y W<sub>q</sub> al instante.
4. **Plan.** La formulación del MILP, el horario por persona y la cobertura frente al mínimo.
5. **Métricas.** L, W, L<sub>q</sub>, W<sub>q</sub>; el tiempo entre llegadas; la bondad de ajuste a Poisson; y la utilización frente al 80 %.
6. **ROI.** El cálculo del notebook y, al lado, uno conservador, con las causas de la venta perdida.
7. **Un día en el almacén.** Animación ilustrativa en 3D o en plano 2D, con la situación actual, el plan MILP o el plan alternativo.

### Lo que la página agrega al notebook (y lo dice en cada caso)

- **Plan alternativo.** El plan MILP deja 2 despachadores a las 8, 12 y 17 h, donde la espera teórica sube a 34–43 min. El plan alternativo es el mismo modelo con la condición extra W<sub>q</sub> ≤ 15 min en cada hora: 2 FT-1, 1 FT-2, 2 FT-3 y 1 PT-3, por S/ 7,554.26 al mes.
- **Dos soluciones con el mismo costo.** El MILP del notebook tiene otra solución de S/ 5,494.02: 1 FT-1, 1 FT-2, 1 FT-3, 1 PT-1 y 1 PT-3. La página usa la que eligió SCIP.
- **ROI conservador.** Según el CSV, los 466 pedidos cancelados son "Sin preparar" (353 por quiebre de stock), y solo S/ 9,426.28 de la venta perdida viene de pedidos que perdieron su ruta por esperar. Si el plan recupera el 95 % de eso, el ROI es −45.67 %: el beneficio del plan es de servicio, no de ventas recuperadas.

## Datos

`Denlu.ipynb` lee `denlu_colab_2025.csv` (8 012 pedidos) desde Google Drive (`Mi unidad/Final_Investigacion_Operativa/`). El CSV no se publica en este repositorio. Para recalcular los agregados de la página:

```bash
python Simulacion/agregados_csv.py ruta/a/denlu_colab_2025.csv
```

## Abrir la página en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`.

## Verificar las cifras

Para comprobar que la página muestra exactamente los resultados de `Denlu.ipynb` (ρ por hora, despachadores requeridos, plan y costo del MILP, cobertura, ROI, W<sub>q</sub>, L, W, L<sub>q</sub>, tiempo entre llegadas y utilización bajo el 80 %), además del plan alternativo y el ROI conservador:

```bash
cd Simulacion/web
node verificar.js
```

La animación de un día no forma parte del notebook: simula pedido por pedido con las tasas λ por hora del diagnóstico y μ = 44.5 min. Supone, como en los datos de 2025, que el 5.82 % de los pedidos llega sin stock y se cancela sin entrar a la cola, y que un pedido que espera más de 72 min pierde su ruta. Con esos valores, la situación actual simulada repite la pérdida de ruta (5.3 %) y la cancelación (5.82 %) del CSV, y sus esperas por hora se parecen a las reales. En la animación, hacer la lista y revisar en el acopio toman cerca del 15 % del tiempo de despacho cada uno: es un reparto de esos 44.5 min, así que no cambia ninguna cifra. `verificar.js` también lo comprueba.
