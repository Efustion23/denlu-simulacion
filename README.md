# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: diagnóstico con teoría de colas, plan de personal con programación lineal entera (MILP) y simulación de eventos discretos del despacho de pedidos en la distribuidora mayorista DENLU (Tarma, Junín). La simulación valida el plan y mide su robustez ante crecimiento de la demanda, ausentismo, horas extra y margen bruto.

## Ver en línea

- **Simulador interactivo:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | Notebook único, en dos partes. **I. Diagnóstico y optimización:** colas M/M/c, modelo MILP con OR-Tools y ROI analítico. **II. Simulación:** modelo en SimPy, calibración, validación contra 2025, cuatro escenarios y conclusiones calculadas. La Parte II usa las variables de la Parte I (λ, μ, turnos, plan óptimo, costos), no copias. |
| [`Simulacion/web/`](Simulacion/web/) | Simulador interactivo en el navegador: animación de un día en el almacén, comparación del año completo contra la situación actual y validación con los datos de 2025. Funciona sin internet (Chart.js y la tipografía Barlow van incluidos en `vendor/` y `fonts/`). |

## Datos

El notebook parte del diagnóstico de 2025 (8 012 pedidos). Si el archivo `denlu_colab_2025.csv` está junto al notebook (en Colab: panel de archivos → subir) se usa completo. Si no, el notebook usa la tabla resumen del diagnóstico y el resultado es el mismo. El CSV no se publica en este repositorio.

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

Los parámetros compartidos entre ambos son: T = 20 min y p = 0.28 (calibrados en el capítulo 6 del notebook), μ = 44.5 min, 299 días y 10 réplicas. El anexo del notebook lista los planes del MILP para ρ = 0.85, 0.75 y 0.65 y comprueba que coinciden con los del simulador.
