# Guion de la exposición: DENLU 2025

Guion para la exposición de 4 personas (Expositor 1 a 4). **Cambien "Expositor 1…4" por sus nombres** en la portada, en la diapositiva 2 y en la etiqueta amarilla de cada diapositiva. El mismo texto está en las **notas del orador** de cada diapositiva de `Exposicion_DENLU.pptx`.

## Reparto y tiempos

| Expositor | Parte | Diapositivas | Tiempo aprox. |
|---|---|---|---|
| Expositor 1 | Contexto y problema (y cierre) | 1 a 6 y 22 | 6.6 min |
| Expositor 2 | ¿Cómo sabemos que se forma la cola? | 7 a 11 | 8.1 min |
| Expositor 3 | El modelo y la simulación | 12 a 16 | 8.1 min |
| Expositor 4 | Resultados y decisión | 17 a 21 | 8.1 min |
| Todos | Preguntas | 23 | lo que quede |

**Total: unos 31 minutos** sin contar las preguntas.

**Regla para todos:** si se traban, digan la frase de "Cómo interpretarlo fácil": es la idea que el público tiene que recordar. Si preguntan de dónde sale un número, usen "De dónde salen los números": todas las cifras salen del Colab `Denlu.ipynb` y de la base de datos `denlu_2025.csv`.


## Expositor 1: Contexto y problema

### Diapositiva 1: Portada (30 s)

**Qué decir:** Buenos días. Somos el grupo [nombres]. Nuestro trabajo responde una pregunta concreta: ¿cuántos despachadores necesita el almacén de la distribuidora DENLU, y en qué horario, para dejar de perder ventas por la demora? Usamos teoría de colas, programación entera y una simulación de todo el año 2025.

**Cómo interpretarlo fácil:** La idea central: hoy faltan personas en las horas pico y eso cuesta mucho dinero.

**De dónde salen los números:** Título del trabajo (README y notebook Denlu.ipynb).

### Diapositiva 2: Ruta de la exposición (30 s)

**Qué decir:** Vamos en cuatro partes. Primero el contexto y el problema; luego cómo demostramos que se forma la cola; después el modelo para minimizar costos, sus restricciones y la simulación de todo el año; y al final los resultados y cuál opción le conviene a la empresa.

**Cómo interpretarlo fácil:** Es el mapa de la exposición: problema → prueba → solución → decisión.

**De dónde salen los números:** Orden del notebook: secciones 1 (problema), 2 a 4 (modelo), 5 y 6 (simulación y calidad), 7 y 8 (dinero y conclusiones).

### Diapositiva 3: Sección 1: Contexto y problema (5 s)

**Qué decir:** Empezamos con la empresa y el problema.

**Cómo interpretarlo fácil:** Transición.

**De dónde salen los números:** —

### Diapositiva 4: Contexto de la empresa (1 min)

**Qué decir:** DENLU es una distribuidora mayorista de Tarma. Vende abarrotes, bebidas y productos de limpieza a 220 clientes: bodegas, minimarkets, restaurantes y puestos de mercado, y reparte en 8 rutas. En 2025 recibió 12,070 pedidos por S/ 8.84 millones. Todo eso lo alistan y cargan solo 2 despachadores fijos.

**Cómo interpretarlo fácil:** Es una empresa que vende bastante, pero con muy poca gente en el almacén.

**De dónde salen los números:** denlu_2025.csv (pedidos, clientes, rutas) y denlu_productos.csv (48 productos, 8 secciones). Notebook sección 1 y 1.5. Los datos son simulados con los parámetros del caso: hay que decirlo si preguntan.

### Diapositiva 5: El proceso de un pedido (1.5 min)

**Qué decir:** Un pedido pasa por cuatro pasos. Ventas lo recibe y no hay cola. Luego el pedido espera en el tablero hasta que un despachador esté libre: ahí se forma la cola. El despachador lo alista y lo sube al camión; eso toma 29.8 minutos en promedio. Si un pedido espera más de 60 minutos, su camión ya salió y el cliente cancela la compra.

**Cómo interpretarlo fácil:** La cola está en el almacén, no en ventas. El "servidor" de la cola es el despachador.

**De dónde salen los números:** Planteamiento del notebook (sección 1). El tiempo medio de servicio sale de la columna tiempo_servicio_min del CSV.

### Diapositiva 6: El problema (1.5 min)

**Qué decir:** En 2025 se cancelaron 2,017 pedidos, el 16.7 %, porque esperaron demasiado. Eso es S/ 1,523,311 de venta perdida y S/ 181,730 de ganancia perdida. Un pedido espera en promedio 21 minutos. La causa es que en las horas pico llegan casi 6 pedidos por hora y 2 personas solo despachan 4. Hoy el costo total es S/ 226,860 al año. Ahora mi compañero(a) demostrará que ahí se forma la cola.

**Cómo interpretarlo fácil:** De cada 6 pedidos, 1 se pierde. La ganancia perdida es el margen (lo que la empresa gana) de esos pedidos, no la venta completa.

**De dónde salen los números:** Notebook sección 1.4 (venta y ganancia perdida) y sección 5 (costo total = planilla anual + ganancia perdida). La ganancia por pedido sale del margen de cada producto (denlu_2025_detalle.csv).


## Expositor 2: ¿Cómo sabemos que se forma la cola?

### Diapositiva 7: Sección 2: ¿Cómo sabemos que se forma la cola? (5 s)

**Qué decir:** Ahora demostramos con números que se forma la cola.

**Cómo interpretarlo fácil:** Transición.

**De dónde salen los números:** —

### Diapositiva 8: ρ por hora (2 min)

**Qué decir:** Para saber si se forma una cola usamos la utilización ρ = λ / (c·μ). λ son los pedidos que llegan por hora, sacados de los datos. μ es lo que despacha una persona: 60 entre 29.8 minutos, o sea 2.02 pedidos por hora. Con c = 2, en 6 de las 10 horas ρ es mayor que 1; a las 11:00 llega a 1.39. Eso quiere decir que llegan más pedidos de los que se pueden despachar.

**Cómo interpretarlo fácil:** ρ es "qué tan lleno" está el almacén. ρ = 1.39 significa que llega 39 % más trabajo del que las 2 personas pueden hacer. Con ρ > 1 la cola nunca se vacía.

**De dónde salen los números:** Notebook sección 1.1 (tabla df_diagnostico y gráfico de ρ). λ = pedidos de esa hora / 298 días.

### Diapositiva 9: Cómo se forma la cola (2 min)

**Qué decir:** El balance de flujo dice: lo que queda en cola al final de una hora es lo que ya había, más lo que llegó, menos lo que se pudo despachar. A las 11:00 llegan 5.59 pedidos por hora y solo salen 4.03: la cola crece 1.56 pedidos cada hora. La línea roja es la cola que vemos en los datos de 2025: sube en la mañana y otra vez en la tarde, como predice la teoría. No se vuelve infinita solo porque los clientes que esperan más de 60 minutos se van.

**Cómo interpretarlo fácil:** Es como una tina que se llena más rápido de lo que se vacía. Los picos son de 9 a 12 y de 14 a 16.

**De dónde salen los números:** Notebook sección 1.2 (balance de flujo y cola observada cada 5 min; aquí, el promedio por hora). Página web, paso 1.

### Diapositiva 10: Modelo M/M/c (2 min)

**Qué decir:** Usamos el modelo M/M/c: llegadas de Poisson, tiempos de servicio exponenciales y c despachadores con una sola cola. Comprobamos los supuestos con la prueba chi-cuadrado: en las horas pico no se rechaza Poisson (p mayor que 0.05; a las 10 h queda en el límite). Con las fórmulas de Erlang C calculamos la espera. A las 11:00 con 2 personas no hay solución: la espera es infinita. Con 3 personas baja a 112 minutos y con 4 a 10.

**Cómo interpretarlo fácil:** M/M/c es la "receta" para calcular cuánto se espera con c personas. La tabla muestra que cada persona extra en el pico cambia muchísimo la espera.

**De dónde salen los números:** Notebook secciones 1.3 (fórmulas y tabla con 2, 3 y 4 despachadores) y 6.1 (bondad de ajuste).

### Diapositiva 11: Calidad de servicio hoy (2 min)

**Qué decir:** Medimos la calidad de servicio en cinco dimensiones. Confiabilidad: solo el 83.3 % de los pedidos llega en su camión. Rapidez: se espera 21 minutos en promedio y 1 de cada 10 pedidos espera más de 52. Casi la mitad espera más de 30 minutos o se cancela, cuando la meta es como máximo 10 %. Consistencia: el peor momento es a las 11:00 y el peor mes, diciembre. Impacto: 219 de 220 clientes tuvieron al menos un pedido cancelado. La calidad hoy es mala, y la causa es la falta de personal en los picos.

**Cómo interpretarlo fácil:** De cada 10 pedidos, 8 llegan a tiempo y casi 2 se pierden. Casi todos los clientes ya sufrieron una cancelación: riesgo de que se vayan a la competencia.

**De dónde salen los números:** Notebook secciones 6.4 (análisis de calidad: indicadores, por hora, mes, ruta, cliente) y 6.5 (resumen simple).


## Expositor 3: El modelo y la simulación

### Diapositiva 12: Sección 3: El modelo (5 s)

**Qué decir:** Ahora, cómo decidimos cuántas personas contratar y en qué horario.

**Cómo interpretarlo fácil:** Transición.

**De dónde salen los números:** —

### Diapositiva 13: Variables y función objetivo (2 min)

**Qué decir:** Con el sueldo mínimo de 1,130 soles calculamos el costo real de cada modalidad: un fijo de 8 a 18 cuesta S/ 1,880.43 al mes con beneficios y horas extra; un medio turno, S/ 773.42; una persona por horas, S/ 6.50 la hora. Mantenemos a los 2 fijos y la pregunta es cuánta gente sumar y en qué horario. La función objetivo minimiza la planilla mensual. En la propuesta 1 las variables son bloques por horas de 2 horas; en la propuesta 2, medios turnos de 4 horas.

**Cómo interpretarlo fácil:** La función objetivo es "lo que queremos que sea lo más pequeño posible": el costo de la planilla. Las variables son "cuántas personas pongo en cada horario".

**De dónde salen los números:** Notebook sección 2 (2.2 costos laborales, 2.3 variables, 2.4 función objetivo).

### Diapositiva 14: Las restricciones (2.5 min)

**Qué decir:** Una restricción es una condición que el plan tiene que cumplir. Se escribe: lo que el plan pone, un signo, y lo que se exige. Por ejemplo, a las 10:00 necesitamos al menos 4 personas para que ρ no pase de 0.85. A esa hora trabajan los 2 fijos y los bloques por horas que empiezan a las 9 y a las 10. Por eso: 2 + B9 + B10 ≥ 4. Así se arman las 10 restricciones de cobertura, una por hora. Además, el modelo cumple estabilidad, capacidad física de 6 puestos, un presupuesto de 2,500 soles al mes, el personal disponible, mantiene a los 2 fijos y usa números enteros. La R8 es la meta de calidad, que usamos para la propuesta de alta calidad.

**Cómo interpretarlo fácil:** La función objetivo dice "gasta lo menos posible"; las restricciones dicen "pero sin dejar de atender bien". La que más pesa es R1: en las horas pico obliga a sumar gente.

**De dónde salen los números:** Notebook sección 2.5 (restricciones R1 a R7 explicadas, con las 10 restricciones de cada propuesta) y 6.3 (R8). Ojo: los límites de R3, R4 y R5 son supuestos del caso.

### Diapositiva 15: Solución óptima (2 min)

**Qué decir:** Resolvimos el modelo con OR-Tools (solver SCIP). Propuesta 1: se suman 5 personas por horas, cada una 2 horas al día, en los picos de la mañana y de la tarde. Cuesta S/ 5,450.86 al mes, S/ 1,690.00 más que hoy. Propuesta 2: 3 personas de medio turno, dos de 9 a 13 y una de 13 a 17; cuesta S/ 6,081.12 al mes. En los dos casos hay hasta 4 personas a la vez en las horas pico y todas las horas cumplen ρ ≤ 0.85. Ahora vamos a probarlo con todo el año.

**Cómo interpretarlo fácil:** Cada fila es una persona y cada cuadrito es una hora en que trabaja. Las barras verdes y moradas son la gente extra: aparecen justo donde está la cola.

**De dónde salen los números:** Notebook secciones 3 y 4 (solución de SCIP y tabla de verificación de restricciones). Página web, paso 2 (horario por persona).

### Diapositiva 16: La simulación (1.5 min)

**Qué decir:** La fórmula M/M/c no funciona cuando ρ es mayor que 1, así que simulamos todo el año. Tomamos los 12,070 pedidos de la base de datos de 2025, con su hora de llegada y su tiempo de alistado, y los volvemos a atender con otro personal. Si un pedido tendría que esperar más de 60 minutos, se cancela. Lo hicimos para 1, 2, 3 y 4 fijos y para las dos propuestas. En la página de GitHub se ve en 3D: la gente camina a las secciones del almacén y se ve la cola en el tablero. (Si hay tiempo, mostrar la página en vivo.) Ahora mi compañero(a) presentará los resultados.

**Cómo interpretarlo fácil:** Es como "volver a vivir" el 2025 con otro equipo de trabajo y ver qué habría pasado.

**De dónde salen los números:** Notebook sección 5 (simular_dia y simular_anio). Página web, paso 3 (las 3 simulaciones). El caso de hoy repite exactamente las cancelaciones de la base de datos: así se valida.


## Expositor 4: Resultados y decisión

### Diapositiva 17: Sección 4: Resultados y decisión (5 s)

**Qué decir:** Ahora los resultados de todo el año y cuál opción conviene.

**Cómo interpretarlo fácil:** Transición.

**De dónde salen los números:** —

### Diapositiva 18: Resultados por caso (2 min)

**Qué decir:** El gráfico suma lo que se paga en personal (azul) y lo que se pierde en ganancia por pedidos cancelados (rojo). Con 1 fijo se paga poco, pero se cancela la mitad de los pedidos: S/ 561,507 al año. Hoy, con 2 fijos, el costo total es S/ 226,860. Con 3 y 4 fijos baja mucho porque se cancelan menos pedidos. Pero el más barato es la Propuesta 1, S/ 88,689, y luego la Propuesta 2, S/ 97,400, casi igual que 4 fijos con menos gente.

**Cómo interpretarlo fácil:** No se trata de pagar menos sueldo: se trata de que la suma de sueldo + ventas perdidas sea la menor. Tener poca gente sale carísimo.

**De dónde salen los números:** Notebook sección 5 (tabla df_resultados y gráfico de costo total). Página web, paso 5 (Resultados).

### Diapositiva 19: Cuánto se gana y se pierde (2 min)

**Qué decir:** Comparamos cada plan con hoy. La planilla extra es lo que se invierte; la ganancia recuperada, lo que se deja de perder porque se cancelan menos pedidos. La Propuesta 1 invierte S/ 20,280 al año y recupera S/ 158,450: ahorra S/ 138,170 al año, con un ROI de 681 %. La Propuesta 2 invierte S/ 27,843 y ahorra S/ 129,460. La diferencia entre las dos es de S/ 8,711 al año a favor de por horas. Bajar a 1 fijo haría perder S/ 334,647 al año.

**Cómo interpretarlo fácil:** Cada sol que se pone en personal en las horas pico regresa varias veces en ventas que ya no se pierden. El ROI dice cuántas veces regresa.

**De dónde salen los números:** Notebook sección 7 (tabla df_roi: inversión, ganancia recuperada, beneficio neto y ROI).

### Diapositiva 20: Calidad con cada plan (2 min)

**Qué decir:** Ahora la calidad. Hoy, de cada 100 pedidos, solo 54 llegan rápido, 30 con demora y 17 se cancelan. Con cualquiera de las dos propuestas, 90 llegan rápido y solo 2 se cancelan. Pero la meta, que como máximo 10 % espere más de 30 minutos, se cumple en 2 y 4 de las 10 horas. Si se agrega la meta como restricción R8, sale la propuesta de alta calidad: 2 fijos más 5 de medio turno. Pide S/ 3,867 al mes, más que el presupuesto, pero casi no se cancela nada y el costo total baja a S/ 96,622 al año.

**Cómo interpretarlo fácil:** Verde = llegó rápido, amarillo = llegó tarde, rojo = se perdió. Las propuestas pintan casi toda la barra de verde.

**De dónde salen los números:** Notebook secciones 6.2 (semáforo de calidad), 6.3 (propuesta de alta calidad, R8) y 6.5 (resumen simple).

### Diapositiva 21: Cuál conviene (2 min)

**Qué decir:** Respondemos tres preguntas. ¿Cuál conviene en dinero? La Propuesta 1, por horas: es la de menor costo total y ahorra S/ 138,170 al año, pero tiene riesgo laboral porque esas personas trabajan sin beneficios. ¿Cuál es la más realista? La Propuesta 2, medio turno: contratos formales y ahorra S/ 129,460, apenas S/ 8,711 menos. ¿Cuándo aplicar personal por horas? Como refuerzo en julio, diciembre y la campaña escolar, que son los días más críticos. Y si la gerencia aprueba más presupuesto, la versión de alta calidad con medio turno da el mejor servicio con un costo total aún menor.

**Cómo interpretarlo fácil:** Por horas = lo más barato; medio turno = lo más seguro y formal; por horas en campañas = el complemento; alta calidad = la mejor si hay presupuesto.

**De dónde salen los números:** Notebook secciones 5 (costo total), 6.3 (alta calidad), 7 (ROI) y 8 (conclusiones). Días críticos: sección 5.1.


## Expositor 1: conclusiones y recomendación

### Diapositiva 22: Conclusiones y recomendación (1.5 min)

**Qué decir:** Para cerrar, retomo lo que planteamos al inicio. Primero, demostramos con ρ mayor que 1 que se forma la cola y que eso cuesta mucho dinero. Segundo, el modelo de programación entera pone más gente solo donde hace falta. Tercero, las dos propuestas bajan las cancelaciones de 16.7 % a 2 % y ahorran más de 129 mil soles al año. Recomendamos la Propuesta 2, de medio turno, como plan formal, con personal por horas solo en campañas; y la de alta calidad si la gerencia aprueba más presupuesto. Gracias.

**Cómo interpretarlo fácil:** Mensaje final: con poca inversión en las horas pico, DENLU deja de perder ventas y mejora su servicio.

**De dónde salen los números:** Notebook sección 8 (conclusiones y recomendación).


## Cierre: preguntas (todos)

### Diapositiva 23: Preguntas (según el tiempo)

**Qué decir:** Agradecer y abrir preguntas. Cada uno responde las preguntas de su parte (ver la lista de preguntas probables en el guion).

**Cómo interpretarlo fácil:** —

**De dónde salen los números:** Página web y notebook.


## Glosario para explicar fácil

- **λ (lambda):** pedidos que llegan por hora. Ej.: a las 11:00 llegan 5.59 pedidos por hora.
- **μ (mu):** pedidos que despacha una persona por hora: 60 / 29.8 min = 2.02.
- **c:** número de despachadores trabajando a esa hora.
- **ρ (rho):** "qué tan lleno" está el almacén: ρ = λ / (c·μ). Si es mayor que 1, llega más trabajo del que se puede hacer y la cola crece sin parar.
- **Wq y Lq:** espera promedio en cola (minutos) y pedidos promedio esperando.
- **M/M/c:** modelo de colas con llegadas al azar (Poisson), tiempos de servicio al azar (exponenciales) y c servidores.
- **Función objetivo:** lo que queremos que sea lo más pequeño posible: el costo de la planilla.
- **Restricción:** condición que el plan tiene que cumplir (ej.: al menos 4 personas a las 10:00).
- **MILP:** programación lineal entera: optimización donde las variables son números enteros (personas).
- **Holgura y restricción activa:** la holgura es lo que sobra; una restricción está activa cuando la holgura es 0 (se cumple justo).
- **Costo total:** planilla al año + ganancia perdida por pedidos cancelados.
- **ROI:** beneficio neto / inversión: cuántas veces regresa cada sol invertido en personal.

## Preguntas probables y cómo responderlas

**¿Los datos son reales?**  
Es una base de datos simulada de 2025, construida con los parámetros del caso (horario, tasas de llegada por hora, tiempo de despacho, temporadas y catálogo de productos). El método es el mismo con datos reales de la empresa.

**¿Por qué ρ ≤ 0.85 y no ρ < 1?**  
Con ρ muy cerca de 1 la cola es estable en teoría, pero las esperas son enormes: con 3 personas a las 11:00, ρ = 0.92 y la espera teórica es de 112 min. 0.85 es un nivel de servicio común que deja margen.

**¿Por qué no contratar simplemente 4 fijos?**  
Porque se paga a 2 personas más todo el día, también en horas sin pedidos. 4 fijos cuestan S/ 97,406 al año en total; la Propuesta 1 cuesta S/ 88,689 y la Propuesta 2 S/ 97,400, con casi el mismo servicio y menos personas.

**¿Por qué M/M/c da 112 min con 3 personas y la simulación da unos 10 min?**  
M/M/c da el valor de largo plazo, como si la hora pico durara para siempre. En el almacén cada hora dura 60 min y los pedidos que esperan más de 60 min se cancelan y salen de la cola. Por eso usamos las dos: la teoría para diseñar y la simulación para medir el año real.

**¿Es legal el personal por horas?**  
Es la opción más barata pero la menos realista: si en la práctica trabajan todos los días, la relación laboral podría desnaturalizarse, y hay rotación. Por eso recomendamos el medio turno, que es formal, y personal por horas solo en campañas.

**¿Cómo se calcula la ganancia perdida?**  
Cada producto tiene su margen (de 5 % a 30 %). La ganancia de un pedido es la suma del margen de sus productos; si el pedido se cancela, esa ganancia se pierde. El margen promedio es 11.9 %.

**¿Por qué la alta calidad cuesta menos si paga más planilla?**  
Porque casi no se cancelan pedidos: la ganancia perdida baja tanto que compensa. Alta calidad con medio turno paga S/ 3,867.10 al mes de personal extra, pero su costo total al año es S/ 96,622 frente a S/ 97,400 de la Propuesta 2.

**¿Por qué la R8 sale infactible?**  
Para cumplir la meta de calidad en todas las horas hace falta más personal del que permiten el presupuesto de S/ 2,500 (R4) y el personal disponible (R5). Infactible significa que no existe un plan que cumpla todo a la vez; por eso se le propone a la gerencia subir el presupuesto.

**¿Qué es una restricción activa?**  
La que se cumple justo, sin holgura. En la Propuesta 1 la cobertura está activa en casi todas las horas: el modelo pone exactamente las personas necesarias, ni una más.

**¿Cómo validaron la simulación?**  
El caso de hoy (2 fijos) repite exactamente los 2,017 pedidos cancelados de la base de datos, y la página web da los mismos resultados que el Colab.

