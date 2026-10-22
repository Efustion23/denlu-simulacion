# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: diagnóstico con teoría de colas, plan de personal con programación lineal entera (MILP) y simulación de eventos discretos del despacho de pedidos en la distribuidora mayorista DENLU (Tarma, Junín). La simulación valida el plan y mide su robustez ante crecimiento de la demanda, ausentismo, horas extra y margen bruto.

## Ver en línea

- **Simulador interactivo:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | Diagnóstico con colas M/M/c, modelo MILP con OR-Tools y ROI. Es el notebook original del trabajo, sin cambios. |
| [`Simulacion/web/`](Simulacion/web/) | Simulador interactivo en el navegador: animación de un día en el almacén, comparación del año completo contra la situación actual y validación con los datos de 2025. Funciona sin internet (Chart.js y la tipografía Barlow van incluidos en `vendor/` y `fonts/`). |

## Datos

`Denlu.ipynb` lee `denlu_colab_2025.csv` (8 012 pedidos), que no se publica en este repositorio; para ejecutarlo hay que subir ese archivo junto al notebook (en Colab: panel de archivos → subir).

## Abrir el simulador en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`.

## Verificar el modelo

El modelo del simulador web está reescrito en JavaScript. Para comprobar que coincide con `Denlu.ipynb` (requerimiento por hora, planes y planilla del MILP) y que los indicadores simulados reproducen los de 2025:

```bash
cd Simulacion/web
node verificar.js
```

El simulador usa μ = 44.5 min, 299 días y 10 réplicas, como `Denlu.ipynb`. Además usa dos parámetros calibrados para que la situación actual simulada reproduzca la pérdida de ruta y la cancelación de 2025: T = 20 min de espera máxima antes de perder la ruta y p = 0.28 de probabilidad de cancelar tras perderla.
