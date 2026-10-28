# Módulo *Forma* (shaper) — plan de trabajo

Fecha: 2026-10-28 · base: `main` @ `d5202be` · estado: F0, F1 y F2 hechas (ver sección 6); el resto, propuesta.

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
| D-S1 | **Deshacer en el shaper.** El proyecto no tiene undo, pero editar puntos sin deshacer es frustrante. | Sí, local al shaper: una pila de `ShapeDoc` (son pocos bytes). *Impresión* sigue sin undo. |
| D-S2 | **`svg-path-editor-lib` o modelo propio.** El proyecto no tiene dependencias en runtime aparte de React. | Una hora de prueba: adoptarla solo si es ESM, se puede *tree-shake* y pesa < 15 kB gzip. Si no, modelo propio con M/L/C/Z (convertir Q, A, H, V a C al importar). |
| D-S3 | **Selector de espacio de trabajo o página aparte.** | Selector (sección 3.1). |
| D-S4 | **Licencia de BarroCode.** No tiene. | MIT antes de copiar código de cualquier referente. Si solo se toman ideas, no es urgente. |
| D-S5 | **Familias del MVP.** | Superfórmula, polígono/estrella con radio de esquina, flor de lóbulos (cubren las muestras 1, 4, 6 y 7). |
| D-S6 | **Un contorno o varios en el MVP.** | Uno cerrado. Varios (pared doble, agujeros) cuando haya offset. |
| D-S7 | **Color del botón *Enviar a impresión*.** `--signal` está reservado a exportar el G-code y añadir keyframe. | `.btn-primary`: dentro del flujo completo, la exportación final sigue siendo el G-code. |

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

### F4 — Edición del trazado (SvgPathEditor) (2–3 sesiones)

- `pathModel.ts`: parsear y serializar `d` con M, L, C y Z (o `svg-path-editor-lib` según D-S2); insertar un punto en un segmento, borrar, convertir L ↔ C, mover un ancla con sus asas.
- `fit.ts`: familia → comandos C (Catmull-Rom sobre unas 4–8 anclas por lóbulo, no sobre la polilínea densa, para que queden pocos puntos editables).
- `ShapeCanvas`: anclas y asas arrastrables, rejilla en mm con imán opcional, simetría radial opcional (mover un ancla mueve sus N copias: la operación que más usa un ceramista con formas de lóbulos).
- `PathCommands`: lista de comandos sincronizada con el lienzo (seleccionar en uno resalta en el otro), editable con `NumInput`.
- Deshacer local según D-S1 (`Ctrl+Z` / `Ctrl+Shift+Z` solo dentro de *Forma*).
- La imprimibilidad (F2) se recalcula en cada arrastre.
- Tests: ida y vuelta de `d`, insertar o borrar conserva el cierre, el ajuste queda a < 0,2 mm de la familia.
- **Hecho cuando:** se convierte una flor, se mueve un lóbulo con simetría y se envía a impresión sin avisos nuevos.

### F5 — Importar y sesión (1 sesión)

- Abrir en *Forma* el SVG cargado en *Impresión* o uno nuevo: tomar los `d` de `<path>`, `<polygon>`, `<circle>`, etc., reutilizando el saneado de `parseSVG` (sin scripts, sin `defs`/`clipPath`, sin `display:none`) y aplanando transformaciones al importar.
- `SavedSession.shape` y restaurar.
- **Hecho cuando:** las ocho muestras se importan, se editan y vuelven a impresión con el mismo tamaño.

### F6 — Onda fantasma, ayuda y QA (1 sesión)

- Sobre el lienzo, una banda de ±`lissAmpN` alrededor de la línea central, para ver dónde la onda chocará consigo misma antes de enviar.
- Entrada en `HelpDialog`, atajos en la ayuda, revisión con la lista de fase 6 del overhaul.
- Actualizar CLAUDE.md (mapa de archivos, frontera del módulo, decisiones cerradas).

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
