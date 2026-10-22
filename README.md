# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: diagnóstico con teoría de colas, plan de personal con programación lineal entera (MILP) y simulación de eventos discretos del despacho de pedidos en la distribuidora mayorista DENLU (Tarma, Junín). El modelo se construyó sobre los 8 012 pedidos reales de 2025.

## Qué muestran los datos

- Con 3 despachadores **ninguna hora llega a ρ = 1** (el máximo es 0.95 a las 10 h). El almacén no está saturado, aunque la cola del pico de las 9–10 h se arrastra y la espera máxima (20 min) cae a las 11 h.
- De **S/ 1,820,721** de venta perdida en 2025, solo **S/ 9,426 (0.5 %)** se debe a pedidos que perdieron su camión. El 72 % viene de **quiebres de stock** y el 28 % del **calendario de camiones** (pedidos que llegan después de las 15 h o en sábado).
- El plan del MILP baja la espera media de 11.7 a 6.1 min y la pérdida de camión de 5.6 % a 3.1 %, pero cuesta S/ 16 mil más al año y recupera solo S/ 3 mil de venta: **no se paga con la venta recuperada**. Reducir los quiebres de stock un 25 % ahorraría ≈ S/ 300 mil al año.

## Ver en línea

- **Simulador interactivo:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | Notebook único, en dos partes. **I. Diagnóstico y optimización:** colas M/M/c, causas de la venta perdida, modelo MILP con OR-Tools y ROI analítico. **II. Simulación:** modelo en SimPy con las reglas observadas en los datos (cola FIFO, camiones a las 10:00, 13:00 y 16:00, quiebres de stock, clientes perdidos), validación, cinco escenarios y conclusiones calculadas. La Parte II usa las variables de la Parte I, no copias. |
| [`Simulacion/web/`](Simulacion/web/) | Simulador interactivo en el navegador: animación de un día (cola, despachadores y tres camiones que salen a su hora), comparación del año completo contra la situación actual y los datos de 2025. Funciona sin internet (Chart.js y la tipografía Barlow van incluidos en `vendor/` y `fonts/`). |

## Datos

El notebook parte de `denlu_colab_2025.csv` (8 012 pedidos). **Ese archivo no se publica en este repositorio.** Si está junto al notebook (en Colab: panel de archivos → subir), se usa completo y el capítulo 7 repite cada pedido real por el simulador: las esperas y las rutas perdidas salen idénticas a las del archivo. Si no está, el notebook usa los parámetros que se estimaron de él (incluidos en la celda de datos) y todo lo demás se calcula igual.

## Abrir el simulador en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`.

## Verificar el modelo

El modelo del simulador web está reescrito en JavaScript. Para comprobar que coincide con el notebook (requerimiento por hora, planes y planilla del MILP, reglas del camión, cola FIFO y los indicadores simulados):

```bash
cd Simulacion/web
node verificar.js
```

Los generadores aleatorios de Python y JavaScript son distintos, así que los indicadores simulados se comparan dentro de un margen. El anexo del notebook lista los planes del MILP que ofrece el simulador (ρ = 0.85, 0.70 y 0.50).
