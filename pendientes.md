# Pendientes

Backlog de cambios atómicos para BarroCode, con propuesta priorizada de ejecución.

> Este documento contiene **tickets accionables y priorizados** listos para ejecutar. Para notas de diseño abiertas e ideas de investigación (sin priorizar, en exploración), ver [docs/research-notes.md](docs/research-notes.md).

---

## Tickets

### Bugs

- [X] **Drag-and-drop de SVG no resuelve** — actualmente no funciona; el `onDrop` está cableado en `App.tsx` pero hay un comportamiento que lo está rompiendo.
- [x] **Scrollwheel no actualiza el valor numérico visible** — al tener un field seleccionado y mover la rueda, los parámetros cambian en el visualizador, pero el número en el `NumInput` no se refresca mientras se gira.

### UX — controles

- [x] **Pivot drag en el visualizador** — permitir que el punto que corresponde al centro de escala se pueda desplazar arrastrando con el mouse en el viewport 3D.
- [x] **Shift = ajuste fino** — agregar la opción de mantener Shift apretado para cambios muy leves al variar cualquier parámetro. Rueda = cambio grueso, Shift+rueda = cambio fino.
- [x] **Pivot fields con paso más grueso** — al variar el centro de pivote, el desplazamiento por tick del wheel debiese ser mayor, para ubicar más rápidamente el punto donde quiero.
- [x] **"Añadir keyframe aquí" → "OK" cuando hay keyframe seleccionada** — cuando se está trabajando con una keyframe existente, el botón debe cambiar a un OK para confirmar y evitar crear 2 keyframes en el mismo punto.

### UX — visualización

- [ ] **Estimación de tiempo en el header del visualizador** — a la izquierda del contador de capas y puntos, agregar una estimación del tiempo total considerando velocidad y distancia total de la trayectoria.
- [ ] **Cache periódico del SVG cargado** — guardar el estado del SVG en localStorage cada N segundos para restaurarlo en caso de cierre abrupto del navegador.
- [] **Optimizar rendering con capas altas o muchos keyframes** — el `useEffect([parsedSVG, params, keyframes])` actual recompila todo en cada cambio; con muchas capas o keyframes la edición se siente lenta.

### UI — layout y estilo

- [ ] **Botón "Descargar .gcode" del mismo tamaño que "Copiar"** — manteniendo el resto de sus propiedades visuales.
- [ ] **Color del menú desplegable de keyframe** — igualar al resto del tema y luego oscurecerlo levemente para diferenciarlo del color general.
- [ ] **Alinear ancho de "Carga un SVG" con "Cargar SVG de ejemplo"** — el `upload-area` debiese tener el mismo ancho de bounding box que el botón de sample debajo.
- [ ] **Panel derecho más denso** — valores más pequeños, espaciado más ajustado sin sentirse atestado, permitiendo que se vean más presets sin scroll.
- [ ] **Input fields en panel derecho (Lissajous)** — los parámetros de Lissajous solo tienen slider; agregar también el campo numérico editable como en el panel izquierdo.
- [ ] **Acoplar la previsualización Lissajous con su panel modificador** — actualmente el panel derecho modifica los parámetros y la previsualización está abajo al centro; juntarlos visualmente.

### Contenido / assets

- [ ] **Biblioteca de SVG samples** — actualizar la carpeta de samples y mostrar 12 (o más) pads pequeños con vistas mini de cada sample (tomando el ícono del propio SVG), para elegir visualmente. Alternativa: flechas left/right para navegar entre samples.

### Completado en sesiones previas

- [x] **Eliminar todo lo relacionado con el .exe / Electron** — commit `3b516b7`.
- [x] **Evaluar pros/cons de remover distribución ejecutable** — decidido y ejecutado en commit `3b516b7`. Resumen: la versión Electron era un shell `BrowserWindow` mínimo cargando el mismo `dist/index.html`; mantenerla agregaba ~270 paquetes transitivos, ~93 MB de output binario y dos scripts adicionales sin aportar funcionalidad propia (clay-printer es típicamente offline pero la SPA funciona desde `file://` igual). La pérdida es: instaladores firmados y acceso a APIs nativas (que no se usaban). Ganancia neta clara.

---

## Propuesta priorizada

La estrategia es atacar primero lo que **bloquea uso real** (bugs), luego lo que **mejora la productividad por interacción** (controles, atajos), luego **layout/estilo**, y dejar al final lo que requiere infraestructura nueva (cache, performance, biblioteca de samples).

Cada ola está pensada para ser un commit independiente que pueda mergearse sin esperar al resto.

### Ola 1 — Bugs bloqueantes (P0)

1. **Fix drag-and-drop de SVG.** Diagnóstico mínimo: verificar que `onDragOver` está invocando `preventDefault` en el contenedor padre correcto y que el evento llega al `onDrop`. Probable causa: algún ancestro o el `body.dragging-h/-v` interfiriendo. Ticket pequeño, alto impacto.
2. **NumInput refresca display durante wheel.** En [src/components/NumInput.tsx:53](src/components/NumInput.tsx), el `setRaw(String(out))` ya está pero solo corre cuando `!focusedRef.current`. Si el field está focused, no actualiza. La fix: actualizar el `raw` siempre tras el wheel (el wheel es una acción intencional del usuario, no un commit accidental desde el parent).

**Estimación combinada: 1–2 horas.**

### Ola 2 — Controles y atajos de teclado (P1)

3. **Shift = ajuste fino en NumInput wheel.** Modificar el handler `onWheel` en `NumInput.tsx`: si `e.shiftKey`, dividir `step` por 10. Cero side-effects: el step base de cada input ya está bien calibrado. Cubre todos los fields del proyecto de una sola modificación.
4. **Pivot fields con paso más grueso.** En `CenterScaleParams.tsx` (o donde se renderice el `NumInput` de `centerX`/`centerY`), subir el `step` a `5` o `10`. Con Shift+wheel queda el paso fino preservado.
5. **Toggle "Añadir keyframe" → "OK" cuando hay KF seleccionada.** En `Preview2D.tsx`, ya existe el estado de "kf seleccionada" (highlight en el visualizador). Detectar si `timelineProgress` corresponde a un kf existente dentro de una tolerancia (ej. ±1% en t), y cambiar el label del botón. La acción del botón mantiene el comportamiento normal: si ya hay KF en ese punto, no crear duplicado (devolver al estado seleccionado).

**Estimación: 2–3 horas.** Ola muy ROI-positiva: tres cambios pequeños que multiplican la sensación de control.

### Ola 3 — Pivot drag en el viewport (P1)

6. **Drag del centro de pivote en `Preview2D`.** Es el ticket más vistoso de la lista, pero requiere más diseño:
   - Renderizar un handle visible (cross + ring) en la posición actual del pivote, proyectado al espacio de pantalla.
   - Hit-testing en `onMouseDown`: si el click está cerca del handle (umbral ~8px en pantalla), iniciar drag-pivot en vez de pan.
   - En `onMouseMove`: unproject la posición del mouse al plano XY (z=0 o z=primera capa) y setear `params.centerX/centerY`.
   - Coordinarlo con el `CenterPad` existente — son dos UIs sobre el mismo state, deben quedar consistentes.
   - **Estimación: 3–5 horas.** Aislada al `Preview2D` + un `onChange(params)`.

### Ola 4 — UI polish (P2)

7. **Igualar tamaño botón "Descargar .gcode" y "Copiar".** En `GcodeOutput.tsx`: ambos botones ya usan `btn-small`/`btn-primary`. Unificar a una sola clase o forzar `min-width`/`padding` iguales.
8. **Color del menú de keyframe.** Igualar `background-color` al token de panel existente (`--card` / `--card-2`) y luego aplicar un `filter: brightness(0.96)` o usar una variante nueva tipo `--card-3`.
9. **Alinear ancho upload-area y botón sample.** En `App.tsx`/`index.css`, envolver ambos en un contenedor con `width: 100%` y dejar que ambos elementos hereden ese ancho, o setear el mismo `max-width` explícito.
10. **Tiempo estimado en header del visualizador.** Cálculo: ya tenemos `WaveLayer[]` con coordenadas mm. Sumar distancia total entre puntos consecutivos + transiciones + travel, dividir por `params.printSpeed` (mm/min). Mostrar como `hh:mm:ss`. Un util en `lib/` reusable.

**Estimación combinada: 2–3 horas.**

### Ola 5 — Reorg panel derecho (P2)

11. **Input fields en panel Lissajous.** Reemplazar los sliders solos por slider + `NumInput` lado a lado, igual al panel izquierdo. Reutilizar el componente `Num`/`Slider` ya local a `LissajousParams.tsx`.
12. **Densificar panel derecho.** Bajar `font-size` de los valores, ajustar `padding` de `.param-row` dentro de `.right-sidebar`. Verificar que el grid de presets quepa con más items visibles sin scroll.
13. **Co-localizar previsualización Lissajous con su panel modificador.** Decisión de layout: mover `LissajousPreview` desde la fila inferior central a un slot dentro del panel derecho, o crear un panel "Forma de Lissajous" que contenga ambos. Implica retocar `useResize` y el flex/grid de `App.tsx`. Hacerlo en este orden (11 → 12 → 13) porque cada paso ya cambia el panel.

**Estimación: 3–4 horas.** Una sola PR coherente.

### Ola 6 — Biblioteca de samples (P3)

14. **Ampliar navegador de samples.** Actualmente hay 4 SVGs geométricos embebidos directamente en `App.tsx` con navegación prev/next. El ticket original pedía una grilla de 12+ mini-pads. Lo que queda: agregar más samples y, opcionalmente, presentarlos como grilla (~48×48 px por pad) en vez de carrusel. Los samples adicionales pueden ser SVGs hardcodeados en `App.tsx` o cargados desde `public/samples/` vía `fetch`.

**Estimación: 1–2 horas** (la infraestructura de navegación ya existe).

### Ola 7 — Resiliencia (P3)

15. **Cache periódico del SVG cargado.** Usar `localStorage` con clave única (ej. `barrocode:lastSession`) y guardar `{ raw, filename, params, keyframes }` cada vez que cambian (debounced 1–2 s). En el mount de `App.tsx`, si existe la key, mostrar un banner "Restaurar sesión anterior?" con un botón. Una vez restaurado, comportamiento normal. **Estimación: 2 horas.**

### Ola 8 — Performance (P3)

16. **Optimizar rendering con muchas capas/keyframes.** El cuello de botella es el `useEffect([parsedSVG, params, keyframes])` que recorre todas las capas en cada cambio. Estrategias:
    - Debounce en el `setParams` (no en el useEffect — debounce a nivel de los `onChange` de los panels).
    - Memoizar capas por `(parsedSVG.id, paramsHash, keyframesHash)` con `useMemo`.
    - Mover el cálculo a un Web Worker cuando supere algún umbral (ej. capas × puntos > 50.000).
    - El draw de `Preview2D` puede usar `requestAnimationFrame` throttling.
    - **Estimación: 4–8 horas** según cuánto se quiera abarcar. Idealmente hacer una medición con Performance API antes de optimizar a ciegas.

---

## Resumen

| Ola | Tickets | Estimación | Cuándo |
|---|---|---|---|
| 1 — Bugs P0 | drag-drop, NumInput wheel display | 1–2 h | Inmediato |
| 2 — Atajos | Shift fino, pivot step, KF toggle | 2–3 h | Siguiente |
| 3 — Pivot drag viewport | drag del centro en `Preview2D` | 3–5 h | Aislado |
| 4 — UI polish | botones, color KF menu, upload alignment, tiempo estimado | 2–3 h | Cuando hay aire |
| 5 — Panel derecho | input fields + densidad + co-location | 3–4 h | Una PR |
| 6 — Samples | ampliar navegador (infra ya lista) | 1–2 h | Contenido |
| 7 — Cache | localStorage restore | 2 h | Tranquilo |
| 8 — Performance | memoization / worker / RAF | 4–8 h | Cuando duela |

Total estimado: 19–30 horas para limpiar el backlog completo.

El orden propuesto refleja **dependencias y costo de oportunidad**, no urgencia subjetiva — si querés reordenar (por ejemplo poner samples antes que pivot drag), avísame y reajusto.
