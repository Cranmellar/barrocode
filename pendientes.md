# Pendientes

Backlog de cambios atómicos para BarroCode, con propuesta priorizada de ejecución.

> Este documento contiene **tickets accionables y priorizados** listos para ejecutar. Para notas de diseño abiertas e ideas de investigación (sin priorizar, en exploración), ver [docs/research-notes.md](docs/research-notes.md).

---

## Tickets

### Bugs

- [X] **Drag-and-drop de SVG no resuelve** — actualmente no funciona; el `onDrop` está cableado en `App.tsx` pero hay un comportamiento que lo está rompiendo.
- [ ] **Scrollwheel no actualiza el valor numérico visible** — al tener un field seleccionado y mover la rueda, los parámetros cambian en el visualizador, pero el número en el `NumInput` no se refresca mientras se gira. *Estaba marcado como hecho, pero `NumInput.tsx` sigue condicionando `setRaw` a `!focusedRef.current` (verificado 2026-10-28).*

### Revisión crítica (oct. 2026)

Hallazgos de una revisión del pipeline SVG → G-code. Los marcados `[x]` están corregidos en `main`; el resto queda abierto, en orden de prioridad.

- [x] **Transición suave en trayectos abiertos extruía un cordón a través de la pieza.** Un trayecto abierto termina en el extremo opuesto a donde empieza la capa siguiente; con `softJoin` (activo por defecto) `buildTransition` unía ambos puntos extruyendo: 160 mm de arcilla por cambio de capa en una línea de 160 mm. Ahora la transición solo se hace si el inicio de la capa siguiente está a ≤ `transitionLength` en XY; si no, viaje elevado normal. El test de invariantes acota el largo de cada transición y cubre una línea abierta.
- [x] **El parser imprimía geometría que no se dibuja.** Se muestreaban las formas de `<clipPath>` y `<mask>`, el contenido de `<defs>` / `<symbol>` / `<marker>` / `<pattern>` y los elementos con `display:none` (capas ocultas de Inkscape). Illustrator exporta a menudo un `clipPath` del tamaño de la mesa de trabajo, que salía impreso como un cuadrado extra. Ahora se omiten. Limitación: `visibility:hidden` no se detecta (el contenedor de medición ya es `visibility:hidden`).
- [x] **Un SVG compartido podía ejecutar código.** `parseSVG` insertaba el texto con `innerHTML`, y los atributos `onerror` / `onload` se ejecutaban al cargar (comprobado en Chromium). Ahora se inserta el documento ya parseado, sin `<script>`, `<foreignObject>`, atributos `on*` ni enlaces `javascript:`, con `importNode`. Los SVG sin `xmlns` se reparsean con el namespace SVG; la salida de las muestras no cambia.
- [ ] **Bajo un `transform` con escala, el muestreo y las longitudes de onda salen mal.** `getTotalLength` / `getPointAtLength` trabajan en longitud local del elemento: dentro de `<g transform="scale(2)">` un trazo de 20 unidades mide 10, así que el espaciado de muestra y las longitudes de onda quedan al doble. Recalcular `arcLength` y `totalLength` a partir de los puntos ya transformados (`svgParser.ts`).
- [ ] **Z-hop: probable acumulación de arcilla en los cruces** (deducido del código; confirmar con una impresión de prueba). El salto solo se aplica en la segunda pasada de cada cruce. En la capa 0 el cruce recibe un cordón a Z 1.0 y otro a Z 3.5; la primera pasada de la capa 1 cruza a Z 3.5, sin hueco sobre ese cordón doble. Cada capa deja un cordón de más en el cruce. Propuesta: reducir o anular E dentro de la ventana del salto en vez de solo levantar la boquilla (`toolpath.ts` / `gcodeGenerator.ts`).
- [x] **"Reiniciar" del panel Lissajous borraba todos los parámetros** (`setParams(DEFAULT_PARAMS)`): capas, velocidades y escala incluidas. Ahora restablece solo los campos que edita el panel (amplitudes y longitudes de onda N/T/Z, delta, fase Z, desfase y desfase por capa); con un keyframe seleccionado, restablece la onda de ese keyframe. Se desactiva mientras los keyframes bloquean la onda global.
- [x] **Los pull requests no pasan por CI.** Ahora `ci.yml` corre `npm test` y `npm run build` en cada pull request.
- [ ] **E no compensa el grosor real del cordón con onda Z.** El hueco con la capa inferior varía entre 0.5× y ≈ 1.6× la altura de capa (con 0.8 mm de amplitud Z), pero E depende solo de la distancia XY. Escalar E por el hueco local (amplía NP-0a). El error por ignorar la componente Z de la distancia es menor (≈ 1.4 %).
- [x] **"Núm. de capas" sin máximo** — escribir 10000 (o una "Altura total" grande con capas finas) congelaba la pestaña. `layerCount()` en `waveGenerator.ts` calcula el número efectivo de capas en un solo sitio, con tope `MAX_LAYERS = 500` (≈ 0,6 s de pipeline y 13 MB de G-code en una curva de 750 puntos); el panel muestra el tope.
- [x] **Nombre por defecto del G-code** — ahora `barrocode.gcode` (antes `curva.de.barro.gcode`, y `clay-wave.gcode` en `downloadGcode`). Las muestras y los SVG subidos siguen usando su propio nombre.
- [x] **Mensajes de error del parser en inglés** (`svgParser.ts`). Traducidos.

### UX — controles

- [ ] **Pivot drag en el visualizador** — *reabierto: estaba marcado pero no existe (`Preview2D` no edita `params`).* Permitir que el punto que corresponde al centro de escala se pueda desplazar arrastrando con el mouse en el viewport 3D.
- [ ] **Shift = ajuste fino** — *reabierto: `NumInput` no lee `shiftKey`.* Agregar la opción de mantener Shift apretado para cambios muy leves al variar cualquier parámetro. Rueda = cambio grueso, Shift+rueda = cambio fino.
- [ ] **Pivot fields con paso más grueso** — *reabierto: los campos de centro siguen con `step={1}`.* Al variar el centro de pivote, el desplazamiento por tick del wheel debiese ser mayor, para ubicar más rápidamente el punto donde quiero.
- [x] **"Añadir keyframe aquí" → "OK" cuando hay keyframe seleccionada** — cuando se está trabajando con una keyframe existente, el botón debe cambiar a un OK para confirmar y evitar crear 2 keyframes en el mismo punto.

### UX — visualización

- [x] **Estimación de tiempo en el header del visualizador** — a la izquierda del contador de capas y puntos, agregar una estimación del tiempo total considerando velocidad y distancia total de la trayectoria.
- [x] **Cache periódico del SVG cargado** — guardar el estado del SVG en localStorage cada N segundos para restaurarlo en caso de cierre abrupto del navegador.
- [ ] **Optimizar rendering con capas altas o muchos keyframes** — en gran parte hecho (memoización por etapa, reuso de cruces, LOD, caché del scrub, textarea truncado). Queda: G-code y estadísticas en un worker, y coalescer el arrastre de keyframes y de `CenterPad` con `requestAnimationFrame`. Detalle y cifras en CLAUDE.md, *Performance — user-side findings* #6 y #7.

### UI — layout y estilo

- [x] ~~**Botón "Descargar .gcode" del mismo tamaño que "Copiar"**~~ — obsoleto: con el overhaul, *Descargar* pasó a la barra superior.
- [x] ~~**Color del menú desplegable de keyframe**~~ — obsoleto: el editor de keyframe es ahora el dock flotante, con la superficie común.
- [x] ~~**Alinear ancho de "Carga un SVG" con "Cargar SVG de ejemplo"**~~ — obsoleto: el `upload-area` ya no existe; se suelta el SVG sobre la ventana.
- [x] **Panel derecho más denso** — valores más pequeños, espaciado más ajustado sin sentirse atestado, permitiendo que se vean más presets sin scroll.
- [x] **Input fields en panel derecho (Lissajous)** — los parámetros de Lissajous solo tienen slider; agregar también el campo numérico editable como en el panel izquierdo.
- [x] **Acoplar la previsualización Lissajous con su panel modificador** — actualmente el panel derecho modifica los parámetros y la previsualización está abajo al centro; juntarlos visualmente.

### UX — flujo de trabajo (propuesta oct. 2026)

Orden de ejecución acordado: UI-1 → UI-2 → UI-3 → UI-4 → UI-5. Absorben varios tickets de las secciones anteriores (indicados en cada uno).

- [x] **UI-1 — Unificar la edición de keyframes.** Hoy un keyframe se edita en tres lugares (timeline del visor, etiquetas + editor de la fila inferior, panel derecho), y el editor inferior no tiene los campos Z. Propuesta:
  - El panel derecho es el único editor de la onda, con un encabezado de contexto claro (*Onda global* / *Keyframe 40 %* con su color). Con keyframes y ninguno seleccionado, los campos que definen los keyframes se bloquean en vez de editar valores globales que no tienen efecto.
  - La fila inferior queda solo con lo propio del keyframe: posición, escala y centro, más navegación anterior/siguiente.
  - Seleccionar un keyframe lleva el extrusor a su posición; el botón *Añadir* pasa a *OK* sobre un keyframe existente (absorbe el ticket "Añadir → OK").
  - `Esc` deselecciona, `Supr` borra el keyframe seleccionado.
- [x] **UI-2 — Reorganizar el panel izquierdo por intención.** Secciones *Pieza* (escala, origen, flip, centro/escala, capas), *Trayecto* (dirección, unión de capas, z-hop, umbral de arco — corrige `skirtThreshold` bajo "Velocidades") y *Máquina* (velocidades, extrusión — hoy en el panel Lissajous —, arcilla, Z de seguridad). Secciones colapsables con estado recordado en `localStorage`.
- [x] **UI-3 — Consecuencias visibles en el visor.** Encabezado con tiempo estimado (absorbe el ticket de "Estimación de tiempo"), caja en mm, altura total, E total y avisos. Vistas predefinidas (Planta / Frente / Iso) y slider de rango de capas (ver solo la capa N o hasta N). Extraer el dibujo de `Preview2D.tsx` a `lib/draw3D.ts` en este paso. Es prerequisito de la validación visual de la no planaridad. Hecho; el detalle al pasar el cursor incluye los cruces con z-hop. Queda pendiente avisar de piezas fuera de la cama, que requiere un parámetro de tamaño de cama. De paso se corrigió la proyección, que dibujaba la pieza espejada.
- [x] **UI-4 — Panel derecho: slider + campo numérico y más densidad.** Ejecuta los tickets "Input fields en panel derecho" y "Panel derecho más denso".
- [x] **UI-5 — Atajos y persistencia.** `K` añadir keyframe, `←/→` mover el extrusor, `G` alternar Trayectoria/G-code, listados en la ayuda. Restaurar la sesión anterior (Ola 7). Reemplazar los estilos inline con colores fijos del carrusel de muestras por tokens CSS.

### Trayectoria — no planaridad

Ya existe no planaridad parcial: oscilación Z por punto (`lissAmpZ`), z-hop parabólico y la rampa del soft join. Estos tickets la extienden. Restricciones transversales que todo ticket de esta sección debe respetar:

- **Altura local de capa:** en cada XY, Δz entre la capa n y n−1 debe quedar en `[hMin, hMax]`. Si una superficie f(x,y) entra gradualmente en K capas, Δz = h + f/K ⇒ K ≥ max|f| / (h − hMin).
- **Pendiente máxima** limitada por la geometría de la boquilla y por el descuelgue de la arcilla fresca.
- **Velocidad en Z:** en cartesianas con husillo, Z es lento; limitar `F` según dz/ds.
- **Muestreo:** el detalle en Z necesita densidad de puntos; remuestrear como `hopSampleArcs` si la superficie tiene más frecuencia que `sampleSpacing`.
- **Ubicación:** el cálculo va en `lib/toolpath.ts` (mm). El escalar interpolado por keyframes se pasa desde `waveGenerator` vía `WavePoint`, como `zOffset`.

- [ ] **NP-0a — E en distancia 3D.** `pathToGcode` y `buildTransition` acumulan E con la distancia XY; un movimiento solo en Z se descarta (`d < 1e-6`). Usar distancia 3D y, opcionalmente, compensar caudal por altura local de capa (`E ∝ largo × h_local / h`). Afecta ya a `lissAmpZ`.
- [x] **NP-0b — Travel con Z real.** `buildSkirtTravel` levantaba a `layer.z + 2` y bajaba a `layer.z`; con z-hop u oscilación Z la boquilla atravesaba la pieza. Ahora levanta 2 mm sobre la Z más alta impresa hasta esa capa y desciende a `start.z`.
- [ ] **NP-0c — Header y tests.** Añadir `lissAmpZ` / `lissWlZ` / `lissPhaseZ` al header del G-code. Redefinir el invariante "no plunging" del test (`maxDz`) como "nunca por debajo de la capa anterior + hMin" para admitir descensos legítimos.
- [ ] **NP-1 — Espiral continua (vase mode).** Parcial: con *Transición Z suave* cada ruta cerrada sube a la capa siguiente en sus últimos `transitionLength` mm (smoothstep, no lineal); con un valor mayor que el perímetro ocupa toda la vuelta. Falta: subida lineal y compensar caudal en la cola de la capa 0. Z sube de forma continua con la longitud de arco dentro de cada capa; sin costura, el soft join deja de ser necesario. Decidir el comportamiento con varias rutas por capa y con `alternateDirection`; primera capa con rampa de entrada y última con rampa de salida.
- [ ] **NP-2 — Superficie Z(x,y).** Domo, rampa, onda radial o heightmap, con entrada gradual desde la capa 0 hasta la K y amplitud keyframeable. Incluye validación de altura local/pendiente con avisos y un modo de color del visor por altura local de capa (requiere UI-3).
- [ ] **NP-3 — Lissajous en el plano normal 3D.** La "versión 2" de [docs/research-notes.md](docs/research-notes.md): evaluar la onda en el plano normal a la tangente 3D para trayectorias helicoidales.

Orden: NP-0a/b/c (corrigen bugs latentes y son base de todo) → NP-1 → NP-2 → NP-3.

### Contenido / assets

- [ ] **Biblioteca de SVG samples** — *parcial: hay 8 muestras en un carrusel ‹ › con miniatura.* Falta la grilla de pads, si se quiere. Actualizar la carpeta de samples y mostrar 12 (o más) pads pequeños con vistas mini de cada sample (tomando el ícono del propio SVG), para elegir visualmente. Alternativa: flechas left/right para navegar entre samples.

### Completado en sesiones previas

- [x] **Eliminar todo lo relacionado con el .exe / Electron** — commit `3b516b7`.
- [x] **Evaluar pros/cons de remover distribución ejecutable** — decidido y ejecutado en commit `3b516b7`. Resumen: la versión Electron era un shell `BrowserWindow` mínimo cargando el mismo `dist/index.html`; mantenerla agregaba ~270 paquetes transitivos, ~93 MB de output binario y dos scripts adicionales sin aportar funcionalidad propia (clay-printer es típicamente offline pero la SPA funciona desde `file://` igual). La pérdida es: instaladores firmados y acceso a APIs nativas (que no se usaban). Ganancia neta clara.

---

## Estado de las olas (revisado 2026-10-28)

El plan original en ocho olas (oct. 2026) está casi cerrado; el detalle quedó en el historial de git. Lo que sigue abierto:

| Ola | Estado |
|---|---|
| 1 — Bugs P0 | Drag-and-drop hecho. **Abierto:** refresco del `NumInput` durante la rueda con el campo enfocado. |
| 2 — Controles | Botón *Añadir → OK* hecho. **Abierto:** Shift = ajuste fino, paso grueso en el pivote. |
| 3 — Pivot drag en el visor | **Abierto**, sin empezar. |
| 4 — UI polish | Absorbida por el overhaul gráfico ([docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md)); tiempo estimado hecho. |
| 5 — Panel derecho | Hecha (UI-4 y overhaul fase 3). |
| 6 — Samples | 8 muestras en carrusel; la grilla queda opcional. |
| 7 — Sesión | Hecha (UI-5). |
| 8 — Performance | En gran parte hecha. **Abierto:** worker para G-code y estadísticas, coalescer arrastres. |

El orden de trabajo vigente (correcciones del G-code primero, luego mejoras rápidas de UX e higiene) está en CLAUDE.md, *Next steps — low effort, high impact*.
