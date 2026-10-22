# Simulación del almacén de DENLU

Trabajo de Investigación de Operaciones 1: optimización de personal en el almacén de la distribuidora mayorista DENLU (Tarma, Junín) con teoría de colas (M/M/c) y programación lineal entera (MILP) bajo la legislación peruana. Todo el trabajo está en `Simulacion/Denlu.ipynb`.

## Ver en línea

- **Página interactiva:** https://efustion23.github.io/denlu-simulacion/
- **Notebook en Google Colab:** [abrir](https://colab.research.google.com/github/Efustion23/denlu-simulacion/blob/main/Simulacion/Denlu.ipynb)

## Contenido

| Ruta | Qué es |
|---|---|
| [`Simulacion/Denlu.ipynb`](Simulacion/Denlu.ipynb) | Diagnóstico con colas M/M/c, modelo MILP con OR-Tools y ROI. Es el notebook original del trabajo, sin cambios. |
| [`Simulacion/web/`](Simulacion/web/) | Página guiada en cuatro pasos que presenta las cifras de `Denlu.ipynb`: 1) diagnóstico por hora (elige una hora y compara lo que llega con lo que se puede atender, con un medidor de ρ), 2) plan MILP como horario por persona frente al de hoy, 3) ROI como cascada de la venta perdida al beneficio y 4) como ilustración, un día animado en el plano del almacén visto desde arriba, con la situación actual o con el plan MILP: los pedidos llegan por teléfono a ventas y esperan en un tablero, y cada despachador camina a recoger la mercadería, la empaca en su mesa y la lleva al camión de su ruta (en el almuerzo o fuera de turno está en el comedor). Funciona sin internet (Chart.js y la tipografía Barlow van incluidos en `vendor/` y `fonts/`). |

## Datos

`Denlu.ipynb` lee `denlu_colab_2025.csv` (8 012 pedidos), que no se publica en este repositorio; para ejecutarlo hay que subir ese archivo junto al notebook (en Colab: panel de archivos → subir).

## Abrir la página en tu computadora

1. Abre esta carpeta en VS Code e instala la extensión **Live Server**.
2. Clic derecho en `Simulacion/web/index.html` → **Open with Live Server**.

También funciona con doble clic en `index.html`.

## Verificar las cifras

Para comprobar que la página muestra exactamente los resultados de `Denlu.ipynb` (ρ por hora, despachadores requeridos, plan y costo del MILP, cobertura y ROI):

```bash
cd Simulacion/web
node verificar.js
```

La animación de un día no forma parte del notebook: simula pedido por pedido con las tasas λ por hora del diagnóstico y μ = 44.5 min. Supone que un pedido que espera más de 20 min pierde su ruta y que el cliente cancela con probabilidad 0.28; con esos valores, la situación actual simulada reproduce la pérdida de ruta (36 %) y la cancelación (10 %) de 2025. `verificar.js` también lo comprueba.
