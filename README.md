# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: diagnóstico con teoría de colas, plan de personal con programación lineal entera (MILP) y simulación de eventos discretos del despacho de pedidos en la distribuidora mayorista DENLU (Tarma, Junín). La simulación valida el plan y mide su robustez ante crecimiento de la demanda, ausentismo, horas extra y margen bruto.

## Ver en línea

- **Simulador interactivo:** https://efustion23.github.io/denlu-simulacion/
- **Notebooks en Google Colab:** [diagnóstico y MILP](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb) · [simulación](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu_Simulacion.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | Diagnóstico con colas M/M/c, modelo MILP con OR-Tools y ROI. Es el notebook original del trabajo, sin cambios. |
| [`Simulacion/Denlu_Simulacion.ipynb`](Simulacion/Denlu_Simulacion.ipynb) | Simulación de eventos discretos en SimPy que parte de los resultados de `Denlu.ipynb`: reproduce su diagnóstico, su MILP y su ROI, y luego calibra el modelo, lo valida contra 2025, corre cuatro escenarios y calcula las conclusiones. |
| [`Simulacion/web/`](Simulacion/web/) | Simulador interactivo en el navegador: animación de un día en el almacén, comparación del año completo contra la situación actual y validación con los datos de 2025. Funciona sin internet (Chart.js y la tipografía Barlow van incluidos en `vendor/` y `fonts/`). |

## Datos

`Denlu.ipynb` lee `denlu_colab_2025.csv` (8 012 pedidos), que no se publica en este repositorio; para ejecutarlo hay que subir ese archivo junto al notebook (en Colab: panel de archivos → subir). `Denlu_Simulacion.ipynb` no lo necesita: parte de la tabla por hora y los totales que `Denlu.ipynb` ya calculó.

## Abrir el simulador en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`.

## Verificar el modelo

El modelo del simulador web está reescrito en JavaScript. Para comprobar que coincide con el notebook (requerimiento por hora, planes y planilla del MILP, y los indicadores simulados):

```bash
cd Simulacion/web
node verificar.js
```

Los parámetros compartidos entre ambos son: T = 20 min y p = 0.28 (calibrados en el capítulo 5 de `Denlu_Simulacion.ipynb`), μ = 44.5 min, 299 días y 10 réplicas. El anexo de `Denlu_Simulacion.ipynb` lista los planes del MILP para ρ = 0.85, 0.75 y 0.65 y comprueba que coinciden con los del simulador.
