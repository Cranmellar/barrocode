# Módulo *Forma* (shaper) — plan de trabajo

Fecha: 2026-10-28 · base: `main` @ `d5202be` · estado: F0–F6 hechas (ver sección 6). Queda abierta D-S4.

---

## 1. Problema y objetivo

Preparar SVGs adecuados para BarroCode se volvió el cuello de botella. Los archivos llegan de Illustrator o Inkscape con escala ambigua, esquinas más cerradas de lo que la onda puede seguir, trazados abiertos, rectángulos de mesa de trabajo y subtrazados sueltos. Buena parte de `parseSVG` y `roundCorners` existe para limpiar eso.

Lo que BarroCode necesita de verdad no es "un SVG", sino una **línea central cerrada, suave y medida en mm, sin curvas más cerradas que el radio que la onda puede seguir** (`cornerRadius` en `waveGenerator.ts`). El objetivo del módulo es **producir formas que cumplan ese contrato desde el origen**, dentro de la misma app, y entregarlas a la parte de impresión sin pasar por otro programa.

## 2. Qué tomamos de cada referente

| Referente | Licencia | Qué tomamos | Qué no tomamos |
|---|---|---|---|
| [SuperformulaSVG](https://github.com/jasonwebb/SuperformulaSVG-for-web) (jasonwebb) | "other", revisar antes de copiar | **Familias de formas con sliders** y el **modo descubrimiento**: una grilla de variaciones aleatorias dentro de rangos, para elegir con el ojo y no con números. | paper.js como dependencia; exportar raster. |
| [SvgPathEditor](https://github.com/Yqnn/svg-path-editor) (Yqnn) | Apache-2.0 | **Edición del trazado** sincronizada en dos vistas: lista de comandos del `d` y puntos arrastrables en el lienzo; insertar, borrar y convertir comandos. Su motor está publicado aparte (`svg-path-editor-lib`). | Su UI y las operaciones que no sirven para cerámica (relativo/absoluto como acción visible, minificar). |
| [Method Draw](https://github.com/methodofaction/Method-Draw) | MIT | **La disciplina de omitir.** Una lista explícita de lo que el módulo no hará (sección 4). | El editor en sí (es SVG-Edit simplificado: rellenos, texto, capas). |

Las ideas no tienen licencia; solo copiar código la tiene. Si se copia código de cualquiera de ellos, antes hay que darle una licencia a BarroCode (decisión D-S4).

## 3. Arquitectura: separado, pero dentro

### 3.1 Dónde vive en la UI

Un selector de **espacio de trabajo**, *Forma* · *Impresión*, como encabezado del panel izquierdo de los dos espacios (igual que *Onda* encabeza el derecho). Es un `useState<'forma' | 'impresion'>` en `App.tsx`, sin router (la convención del proyecto lo prohíbe y no hace falta). Se probó en la barra superior y no cabía: con los dos paneles abiertos esa barra ya recorta el resumen a 1280 y 1440 px, y el selector (≈160 px) dejaba *G-code* y *Descargar* bajo el panel derecho.

- *Impresión* es la app actual, sin cambios.
- *Forma* reemplaza el escenario 3D por `ShaperView`, a pantalla completa, con el mismo sistema de paneles flotantes, tokens y tipografía.
- **Enviar a impresión** pasa el SVG a `doParse(svg, spacing, [], true)`, aplica `keepWaveOnly()` y cambia de espacio. **Editar forma** (en el panel izquierdo de *Impresión*) vuelve al shaper con el documento de forma intacto.

Alternativa descartada: una página aparte (`shaper.html`). Separa más, pero obliga a pasar la forma por `localStorage` o la URL, duplica el armazón de la UI y rompe el ida y vuelta forma ↔ onda, que es justo lo valioso.

### 3.2 Frontera del código

```
src/shaper/
  ShaperView.tsx            único export que App importa
  components/
    ShapeCanvas.tsx         lienzo SVG (DOM, no canvas): forma, asas, costura, regla en mm
    FamilyPanel.tsx         familias + sliders (NumInput)
    DiscoveryGrid.tsx       grilla de variaciones
    PathCommands.tsx        lista de comandos del trazado
    PrintCheck.tsx          avisos de imprimibilidad
  lib/
    families.ts             superfórmula, polígono/estrella redondeados, lóbulos
    pathModel.ts            comandos M/L/C/Z: parsear, serializar, editar, muestrear
    fit.ts                  polilínea densa → béziers cúbicas (Catmull-Rom)
    printability.ts         cerrado, radio mínimo, autointersección, tamaño, sentido
    discovery.ts            PRNG con semilla + variaciones dentro de rangos
    toSvg.ts                ShapeDoc → SVG en mm (viewBox en mm, width/height "…mm")
    __tests__/
```

Reglas de la frontera:

- **Dependencia en un solo sentido.** `App.tsx` importa solo `ShaperView` (y, desde F1, tipos con `import type`, que no pesan). El shaper no importa nada de `src/lib/` ni de `src/components/` salvo `NumInput` e `icons`. El radio que la onda actual puede seguir llega como prop (`waveRadiusMM`, calculado en `App` con `cornerRadius`).
- **El contrato es un string SVG.** Lo que sale del shaper entra por `parseSVG`, igual que un archivo. No se toca `ParsedSVG`, `generateWaveLayers` ni nada aguas abajo. El SVG lleva `width`/`height` en mm, así que `mmPerUnit = 1` y la escala deja de ser ambigua.
- **Estado propio y plano.** Un `ShapeDoc` en `App` (al lado de `parsedSVG`, no dentro de `PrintParams`): `{ source: 'family' | 'path', family, familyParams, seed, commands, sizeMM, seamAngle }`. Se guarda en la sesión (`SavedSession.shape`) para que reabrir permita seguir editando, no solo ver un SVG congelado.
- **Carga diferida.** `ShaperView` con `React.lazy`, para que *Impresión* no pague el peso del shaper. La build ya separa `vendor` en otro chunk, así que no empeora el caso `file://`.
- **Lienzo en SVG DOM**, no en canvas: unos cientos de elementos, *hit-testing* y arrastre gratis, y no compite con las reglas de rendimiento del 3D.

### 3.3 Flujo de una forma

```
Familia + parámetros + semilla ──(families.ts)──▶ polilínea densa (mm)
        │                                              │
        │  "Convertir en trazado editable" (un paso,   ├─(fit.ts)─▶ comandos C
        │   como "expandir" en Illustrator)            │
        ▼                                              ▼
   DiscoveryGrid                               PathCommands + ShapeCanvas
                                                       │
                              printability.ts ◀────────┤
                                                       ▼
                                toSvg.ts ──▶ "Enviar a impresión" ──▶ doParse()
```

Mientras la forma viene de una familia, se edita con sliders. Al convertirla en trazado deja de ser paramétrica (avisarlo en el botón) y se edita punto a punto.

## 4. Lo que el módulo no hará (lección de Method Draw)

- Sin relleno, trazo, color, opacidad, degradados ni texto: solo geometría.
- Sin grupos, capas, símbolos ni transformaciones anidadas: un documento es uno o pocos contornos en mm.
- Sin herramientas de dibujo libre (lápiz, pluma desde cero) en las primeras fases: se parte de una familia o de un SVG importado.
- Sin varios documentos abiertos ni biblioteca de formas en la nube.
- Sin operaciones booleanas en el MVP (vendrían con campos de distancia, fase posterior fuera de este plan).
- Sin exportar raster ni PDF.

Cada pedido nuevo se compara con esta lista antes de entrar.

## 5. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| D-S1 | **Deshacer en el shaper.** El proyecto no tiene undo, pero editar puntos sin deshacer es frustrante. | **Cerrada: sí**, local al shaper: una pila de `ShapeDoc` (son pocos bytes). *Impresión* sigue sin undo. |
| D-S2 | **`svg-path-editor-lib` o modelo propio.** El proyecto no tiene dependencias en runtime aparte de React. | **Cerrada: modelo propio** (F4). La librería (1.0.4, Apache-2.0, ESM, ≈4,8 kB gzip) pasaba el filtro de peso, pero su modelo son comandos mutables cuyas asas pertenecen a comandos distintos: mover un nodo no mueve sus asas, no parte una curva sin cambiarla y convertir a curva pone las asas en tercios. Habría que escribir igual el arrastre con asas, la partición y la simetría, más adaptadores. |
| D-S3 | **Selector de espacio de trabajo o página aparte.** | **Cerrada:** selector, en el encabezado del panel izquierdo (F0). |
| D-S4 | **Licencia de BarroCode.** No tiene. | MIT antes de copiar código de cualquier referente. Si solo se toman ideas, no es urgente. |
| D-S5 | **Familias del MVP.** | **Cerrada:** superfórmula, polígono/estrella con radio de esquina, flor de lóbulos (F1). |
| D-S6 | **Un contorno o varios en el MVP.** | **Cerrada: varios** (F5), porque las muestras 4, 7 y 8 los tienen. La simetría solo con un contorno. |
| D-S7 | **Color del botón *Enviar a impresión*.** `--signal` está reservado a exportar el G-code y añadir keyframe. | **Cerrada:** `.btn-primary` (F0). |

## 6. Fases

Cada fase termina con `npm test` y `npm run build` en verde y algo usable. "Sesión" = una sesión de trabajo con uno a tres commits.

### F0 — Andamio y viaje de ida y vuelta (≈1 sesión)

- Selector *Forma* · *Impresión*; `src/shaper/` con `ShaperView` vacío, cargado con `React.lazy`.
- `toSvg.ts` y un círculo fijo de 80 mm; *Enviar a impresión* lo carga con `doParse` y `scaleFactor = 1`.
- *Editar forma* en *Impresión* vuelve al shaper.
- **Hecho cuando:** el círculo se imprime a 80 mm de diámetro en el visor (cotas) sin tocar la escala, y el chunk inicial de *Impresión* no crece más de 1 kB.
- **Hecho (2026-10-28).** En Chromium: *Enviar a impresión* deja el factor de escala en 1 y, con las amplitudes en 0, el visor mide 80,0 × 80,0 mm (la ruta, 251,4 mm = 80π). `ShaperView` es su propio chunk (≈3 kB) y solo se descarga al abrir *Forma*; el chunk inicial creció ≈2,5 kB sin comprimir, ≈1,0 kB gzip, la mitad del ayudante de carga diferida de Vite. Los atajos de *Impresión* (`K`, `G`, flechas…) no actúan en *Forma*; `?` sí. Con el panel izquierdo plegado el selector no se ve: hay que abrir el panel. El `ShapeDoc` aún vive dentro de `ShaperView` (el círculo es fijo); F1 lo sube a `App`.

### F1 — Familias con sliders (SuperformulaSVG) (1–2 sesiones)

- `families.ts`:
  - **Superfórmula** r(φ) = (|cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3)^(−1/n1), con m entero. Con |·| el período es π, así que solo cierra en 2π si m es par, o si a = b y n2 = n3; el panel restringe m o lo avisa, y hay un test de cierre.
  - **Polígono o estrella redondeados**: lados, profundidad de la estrella, radio de esquina en mm.
  - **Lóbulos**: número, profundidad, agudeza.
- Tamaño en mm (diámetro exterior), rotación, **ángulo de costura** (dónde empieza el trazado), sentido horario o antihorario.
- `FamilyPanel` con `NumInput` y sliders con el patrón de relleno existente; lienzo con regla en mm y una marca en la costura.
- Tests: cierre, tamaño exacto, costura en el ángulo pedido, sentido, número de puntos estable.
- **Hecho cuando:** las tres familias se envían a impresión y salen al tamaño pedido, con la costura donde se marcó.
- **Hecho (2026-10-28).** `families.ts` da cada contorno alrededor de (0, 0); `shapePoints` (`shape.ts`) lo gira, lo escala para que el punto más lejano quede a la mitad del diámetro, corta en la costura (el rayo desde el centro), lo remuestrea cada 0,25 mm desde ahí y lo invierte si es horario. El polígono agranda su radio hasta que, con el redondeo en mm, el vértice queda en el diámetro pedido. Con m impar, n3 sigue a n2 y su slider se desactiva. El `ShapeDoc` es plano (campos `sf*`, `poly*`, `lobe*`) y vive en `App`, así que cambiar de espacio conserva la forma. En el lienzo: círculo discontinuo del diámetro, regla en mm, costura y una flecha con el sentido. En Chromium, un hexágono de 120 mm con radio de esquina 8 y costura a 90° salió de 120 × 106,06 mm (lo esperado) y la primera extrusión arrancó en (0, 53,03) hacia −X, antihorario visto desde arriba. Una punta aguda sin redondeo puede quedar hasta ≈0,03 mm corta, porque cae entre dos muestras.

### F2 — Imprimibilidad (1 sesión)

Esto es lo propio de BarroCode, que ningún referente tiene.

- `printability.ts`: contorno cerrado, **radio de curvatura mínimo** (circunradio de tres muestras consecutivas sobre la polilínea densa), autointersecciones (rejilla, como `findCrossings`), caja en mm, sentido.
- `PrintCheck` compara el radio mínimo con `waveRadiusMM`, que llega de `App` calculado con la onda actual. Aviso del tipo "la onda actual (N 6 mm) plegará esta forma en 4 puntos", con los puntos marcados en el lienzo.
- **Hecho cuando:** una estrella aguda con la onda por defecto marca exactamente las puntas que `roundCorners` redondearía.
- **Hecho (2026-10-28).** `checkShape` (`printability.ts`) mide como `roundCorners`: en cada muestra, el giro entre las cuerdas a las muestras situadas a un `sampleSpacing` de distancia, contra el largo medio de esas cuerdas. Marca los tramos más cerrados que `waveCornerRadius(params, keyframes)` (nueva en `waveGenerator.ts`, también la usa `generateWaveLayers`). `App` le pasa ese radio, `sampleSpacing` y una etiqueta de la onda. En el lienzo los tramos van en rojo con un círculo; el panel *Imprimibilidad* explica el aviso, da un arreglo por familia (con el polígono, si el radio de esquina ya no crece porque lo limita el largo de los lados, lo dice) y muestra la curva más cerrada (medida a 0,25 mm; "esquina viva" por debajo de 0,5 mm) y la caja.
  - **Coincidencia con `roundCorners`.** Un test corre `roundCorners` sobre la forma muestreada como lo hace el parser: en 7 formas de referencia (incluida la estrella aguda: 10 de 10) coinciden exactamente. En 400 formas al azar, `roundCorners` redondea el 91 % de los tramos marcados. Un 3 % son vueltas casi completas que deja a propósito (giro > 3 rad, la onda se pliega allí), y un 6 % son tramos que con su muestreo fijo no llega a ver o agrupa con el vecino. Por eso el aviso dice "la onda no puede seguir", no "se redondeará".
  - **Descartado:** distinguir en el aviso las vueltas que `roundCorners` no redondea. Las cúspides quedan cerca del umbral y el resultado depende de dónde caen las muestras, así que la distinción habría sido falsa en los casos límite.
  - **Pospuesto a F4:** autointersecciones. Las familias de F1 son polares respecto al centro y no pueden cortarse; con la edición libre del trazado sí.

### F3 — Modo descubrimiento (SuperformulaSVG) (1 sesión)

- `discovery.ts`: PRNG con semilla (mulberry32 o similar, sin dependencias); variaciones dentro de rangos por parámetro.
- `DiscoveryGrid`: 3×3 miniaturas de la familia activa. Clic adopta una; *Más como esta* reduce los rangos alrededor de la elegida; *Otra tanda* cambia la semilla. Las que fallan la imprimibilidad se atenúan.
- La semilla y los parámetros se guardan, así que una forma se comparte como unos pocos números.
- **Hecho cuando:** la misma semilla reproduce la misma grilla (test) y la grilla responde en < 50 ms.
- **Hecho (2026-10-28).** *Descubrir* (barra superior de *Forma*) cubre el lienzo con una grilla de 3×3 de la familia activa. Cada miniatura usa el tamaño, el giro y la costura actuales y se atenúa con "N avisos" si la onda no puede seguirla (F2). Un clic la adopta: solo cambian los parámetros de la familia. *Otra tanda* sortea de nuevo en todo el rango; *Más como esta* sortea alrededor de la forma actual con la ventana reducida a 0,4 de la anterior (mínimo 0,05). Los rangos de los sliders y los de exploración (sin los extremos, y en escala logarítmica para agudeza y n1–n3) están en una sola tabla, `FAMILY_PARAMS` en `shape.ts`, que usan el panel y `discovery.ts`. Con m impar, la variante guarda n3 = n2, el valor que usa el contorno. Tests: misma semilla, misma grilla; valores dentro de rango y en el paso del slider; la ventana estrecha queda cerca de la base. En Chromium, de un clic en *Otra tanda* al siguiente fotograma: 13–25 ms en las tres familias.
  - **Cambio respecto al plan:** la semilla no se guarda en la forma. Lo que se comparte es la forma adoptada, que ya son unos pocos números (sus parámetros); la semilla solo reproduce una tanda.

### F4 — Edición del trazado (SvgPathEditor) (2–3 sesiones)

- `pathModel.ts`: parsear y serializar `d` con M, L, C y Z (o `svg-path-editor-lib` según D-S2); insertar un punto en un segmento, borrar, convertir L ↔ C, mover un ancla con sus asas.
- `fit.ts`: familia → comandos C (Catmull-Rom sobre unas 4–8 anclas por lóbulo, no sobre la polilínea densa, para que queden pocos puntos editables).
- `ShapeCanvas`: anclas y asas arrastrables, rejilla en mm con imán opcional, simetría radial opcional (mover un ancla mueve sus N copias: la operación que más usa un ceramista con formas de lóbulos).
- `PathCommands`: lista de comandos sincronizada con el lienzo (seleccionar en uno resalta en el otro), editable con `NumInput`.
- Deshacer local según D-S1 (`Ctrl+Z` / `Ctrl+Shift+Z` solo dentro de *Forma*).
- La imprimibilidad (F2) se recalcula en cada arrastre.
- Tests: ida y vuelta de `d`, insertar o borrar conserva el cierre, el ajuste queda a < 0,2 mm de la familia.
- **Hecho cuando:** se convierte una flor, se mueve un lóbulo con simetría y se envía a impresión sin avisos nuevos.
- **Hecho (2026-10-28).** *Editar puntos* (en el panel de la familia) convierte la forma en nodos (`ShapeDoc.path`); desde entonces el contorno sale de los nodos y la familia queda guardada para *Volver a la familia*.
  - **Modelo** (`pathModel.ts`): nodos con asas en posición absoluta y marca de suave; mover un nodo arrastra sus asas; mover un asa de un nodo suave gira la otra; partir un tramo con de Casteljau sin cambiar la curva; borrar; tramo recto o curvo; invertir el sentido desde la misma costura; costura en otro nodo; `pathD` y `parsePathD` (M, L, C, Z absolutos) de ida y vuelta.
  - **Ajuste** (`fit.ts`): nodos fijos en la costura, las esquinas y la punta y el valle de cada sector; cada tramo se parte donde la cúbica se aleja más hasta quedar a ≤ 0,2 mm; un sector se gira a los demás, así que la simetría es exacta (orden de la familia: lóbulos, lados, o m o m/2 en la superfórmula), y si la forma no resulta tan simétrica se ajusta entera. Los lados rectos salen como `L`. En las formas de prueba: 3 a 8 nodos por sector, desviación 0,04–0,2 mm, 4–80 ms.
  - **Lienzo:** nodos y asas del nodo elegido arrastrables, doble clic en la línea añade un nodo (en cada sector con simetría), Supr borra, Esc deselecciona, imán a milímetros enteros. La imprimibilidad se recalcula en cada movimiento.
  - **Panel:** nodo elegido (X, Y, suave, tramo recto, costura aquí, borrar), simetría, imán, diámetro (escala el trazado), sentido, y la lista de comandos (M, C, L, Z) sincronizada con el lienzo.
  - **Deshacer** (D-S1): pila de `ShapeDoc` en `ShaperView`, botones ↶ ↷ y Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; un arrastre es un paso, y los cambios a menos de 400 ms (un slider) también.
  - **En Chromium:** la flor por defecto da 24 nodos, simetría ×6 y ningún aviso; tirar 3 mm de la punta de un lóbulo hacia fuera mueve las seis puntas, sigue sin avisos (Ø 80 → 86 mm) y se envía a impresión. Deshacer y rehacer, añadir (+6) y borrar (−6) funcionan.
  - **Cambios respecto al plan:** la lista de comandos no tiene campos propios; se edita a través del nodo elegido, porque 6 campos por fila harían que la rueda del ratón cambiara valores al desplazar la lista. El historial vive en *Forma* y se pierde al pasar a *Impresión*. Mover un nodo de flanco varios mm sin tocar sus asas dobla el tramo y da avisos: es lo esperable en un editor de curvas y el aviso lo muestra.

### F5 — Importar y sesión (1 sesión)

- Abrir en *Forma* el SVG cargado en *Impresión* o uno nuevo: tomar los `d` de `<path>`, `<polygon>`, `<circle>`, etc., reutilizando el saneado de `parseSVG` (sin scripts, sin `defs`/`clipPath`, sin `display:none`) y aplanando transformaciones al importar.
- `SavedSession.shape` y restaurar.
- **Hecho cuando:** las ocho muestras se importan, se editan y vuelven a impresión con el mismo tamaño.
- **Hecho (2026-10-28).**
  - **Varios contornos.** Las muestras lo exigían: la 4 tiene un agujero, la 7 una flor y un círculo, la 8 ocho pétalos sueltos. `ShapeDoc.path` pasó a `contours` (una lista de contornos cerrados, cada uno con su costura en el nodo 0 y su propio `<path>` al enviar). El lienzo, el panel y la lista de comandos trabajan por contorno, con *Borrar contorno*; la simetría sigue disponible para un contorno único que viene de una familia.
  - **Importar.** *Abrir en Forma* (en *Impresión*, junto al nombre del archivo) y *Abrir SVG…* / *Traer «…»* (sección *Importar* de *Forma*). `App` muestrea el SVG con `parseSVG`, que ya sanea, salta lo invisible y aplana transformaciones, y pasa a *Forma* los contornos cerrados en mm, Y hacia arriba, centrados como los centra *Impresión* (con su `scaleFactor`; un archivo nuevo, con su tamaño físico o 1 mm por unidad). *Forma* los ajusta a nodos (`fitOutline`) como un cambio que se puede deshacer. Las rutas desactivadas en *Impresión* y los trazados abiertos quedan fuera, y el aviso lo dice.
  - **Coste del muestreo.** `getPointAtLength` cuesta 0,2–0,7 ms por llamada en trazados con arcos y el parser hace tres por muestra. Muestreando cada 0,5 mm, importar tardaba 1,5–12,7 s. Ahora `parseSVG(raw, spacing, false)` omite las dos llamadas de la tangente, que *Forma* no usa, y el paso crece para no pasar de 1500 muestras por trazado (≈2 mm en las muestras de 480 mm, igual que *Impresión*). Resultado: 0,2–1,3 s, menos de lo que tarda *Impresión* en cargar esas mismas muestras (0,05–3,2 s).
  - **Dos fallos de `fitOutline`** que solo aparecían con contornos importados. Un tramo largo sin nodos fijos no podía partirse lo bastante (profundidad 6) y dejaba curvas a 67 mm del original (muestra 4); ahora la profundidad es 12, con un test. Además, los nodos de esquina leían la tangente cruzando la esquina, que casi nunca cae en una muestra, y torcían el lado entero; ahora, si los dos lados son rectos, el nodo va a la intersección de sus rectas.
  - **Sesión.** La forma se guarda en `localStorage` (`barrocode.shape`, 1 s después de cada cambio) junto con el último SVG enviado, y se restaura sola al abrir la app; así *Editar forma* sigue apareciendo tras recargar. Es una clave aparte de `barrocode.session` (cambio respecto al plan, que la ponía en `SavedSession`) porque *Forma* puede tener una forma sin que *Impresión* tenga nada cargado.
  - **En Chromium, las ocho muestras:** misma caja antes y después del viaje (480 × 480, 380 × 380, 386 × 386 mm), editar un nodo y deshacer funciona en todas, y la forma persiste al recargar. Fidelidad del ajuste: 0,10–0,20 mm del contorno importado, con 15 a 141 nodos por contorno (la muestra 1, un polígono de 10 vértices, da 25).

### F6 — Onda fantasma, ayuda y QA (1 sesión)

- Sobre el lienzo, una banda de ±`lissAmpN` alrededor de la línea central, para ver dónde la onda chocará consigo misma antes de enviar.
- Entrada en `HelpDialog`, atajos en la ayuda, revisión con la lista de fase 6 del overhaul.
- Actualizar CLAUDE.md (mapa de archivos, frontera del módulo, decisiones cerradas).
- **Hecho (2026-10-28).**
  - **Onda fantasma:** *Onda*, en la barra superior, dibuja alrededor de cada contorno la franja de ±N que barre la onda actual (la N mayor si hay keyframes; `waveBand` en `printability.ts`), con el color del eje N del panel de onda y sus dos bordes. Donde dos franjas se solapan se ve más oscuro: en la muestra 8 con N = 12 mm, los pétalos vecinos chocan. Un test comprueba que en un círculo los bordes quedan a ±N exactos.
  - **Ayuda:** sección *Forma: crear la pieza*, mención en el paso 1 del flujo y los atajos de *Forma* (deshacer, rehacer, doble clic, `Supr`, `Esc`). De paso se arreglaron dos espacios que faltaban ("usa*Cargar SVG*", "pulsa*Descargar*"). `docs/usage.md` tiene una sección *O crear la forma en Forma*.
  - **Revisión (fase 6 del overhaul):**
    - **Capturas a 1024, 1280 y 1440 px** (familia, *Descubrir*, muestra 8 importada con la franja, ayuda): la barra superior de *Forma* cabe en los tres anchos.
    - **Teclado:** las filas de la lista de comandos eran `<li>` con clic y no se alcanzaban con Tab; ahora son botones con `aria-pressed`, y Enter elige el nodo. Los nodos del lienzo siguen siendo solo de ratón; el teclado llega a ellos por la lista y el panel del nodo.
    - **Rendimiento de *Impresión*, `main` (`d5202be`) frente a esta rama, misma máquina, muestra 4 a 60 capas:** reposo 0,2 % / 0,2 %; tick de slider 54–84 / 51–52 ms; G-code tras editar 119–139 / 113–120 ms; paso de rotación 3,7–4,0 / 3,4–3,8 ms. Sin regresión: *Forma* se carga aparte y no corre nada mientras no está abierta.

## 7. Costo, beneficio y riesgos

| | Estimación |
|---|---|
| Esfuerzo total | ≈ 8–11 sesiones (F0–F3, el núcleo útil: ≈ 4–5) |
| Código nuevo | ≈ 1800–2500 líneas (lib ≈ 800 con tests, componentes ≈ 1000, CSS ≈ 200) |
| Peso | ≈ 20–35 kB sin comprimir, en un chunk diferido; *Impresión* no crece |
| Cambios en el pipeline | Ninguno: el contrato es un string SVG |

**Beneficios:** desaparece el paso por otro programa; las formas generadas cumplen el contrato por construcción; forma y onda se ajustan en la misma app con avisos cruzados; cada pieza se describe y comparte con pocos números; la lógica nueva tiene tests (el parser actual no).

**Riesgos y su control:**

| Riesgo | Control |
|---|---|
| Que crezca hacia un Illustrator. | La lista de la sección 4 y una fase por vez. |
| Edición de trazado (F4) más cara de lo previsto. | F0–F3 ya resuelven el cuello de botella sin F4; F4 se puede posponer. |
| La forma generada y la que imprime BarroCode divergen (muestreo, `roundCorners`). | Test de ida y vuelta: shaper → `toSvg` → `parseSVG` no corre en Node (DOM), así que se verifica en Chromium al cerrar F1 y F4, como hoy con el parser. |
| Dos sistemas de estado (shape y print). | La frontera de la sección 3.2; `ShapeDoc` nunca entra en `PrintParams`. |

## 8. Fuera de este plan (siguientes pasos posibles)

- Composición por campos de distancia: unión suave de círculos (muestras 4, 5, 7 y 8), offset, pared doble.
- Forma que cambia con la altura (parámetros de familia con keyframes). Exige que `generateWaveLayers` acepte una forma por capa, y pierde la reutilización de capas idénticas. Las familias polares lo hacen viable porque cada muestra corresponde a un ángulo.
