# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: simulación de eventos discretos del despacho de pedidos en la distribuidora mayorista DENLU (Tarma, Junín). Valida el plan de personal obtenido con programación lineal entera (MILP) y mide su robustez ante crecimiento de la demanda, ausentismo, horas extra y margen bruto.

## Contenido

| Archivo | Qué es |
|---|---|
| [`Simulacion/Denlu_Simulacion.ipynb`](Simulacion/Denlu_Simulacion.ipynb) | Notebook con el modelo en SimPy, la calibración, los escenarios y las conclusiones. Usa OR-Tools para re-optimizar el MILP. |
| [`Simulacion/web/`](Simulacion/web/) | Simulador interactivo en el navegador: animación de un día en el almacén y comparación del año completo contra la situación actual. |

## Abrir el simulador en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`. Los gráficos y la tipografía se cargan de internet.

## Verificar el modelo

El modelo del simulador web está reescrito en JavaScript. Para comprobar que da los mismos resultados que el notebook:

```bash
cd Simulacion/web
node verificar.js
```
