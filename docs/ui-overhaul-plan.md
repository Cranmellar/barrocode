# Overhaul gráfico — diagnóstico y plan de trabajo

Fecha: 2026-10-27 · base: `main` @ `883e209` · evidencia: capturas Playwright a 1440×900, 1280×720, 1024×768 y 390×844, más métricas de `src/index.css`.

---

## 1. Diagnóstico

### 1.1 Lo que funciona y hay que conservar

- **Identidad propia.** La fuente GSCode, el logotipo bicolor (terracota + índigo) y la dirección "suiza neutra" ya dan carácter. El overhaul debe pulirla, no reemplazarla.
- **La vista 3D es buena.** Proyección limpia, keyframes numerados y coloreados igual en todos los lugares, extrusor distinguible, cotas opcionales.
- **Un solo acento**, tokens en `:root`, sliders con relleno dinámico, diálogo de ayuda con diagramas claros.

### 1.2 Problemas, por orden de impacto

| # | Problema | Evidencia | Impacto |
|---|---|---|---|
| D1 | **La pieza ocupa poco de la pantalla.** El 3D, que es el producto, recibe ≈ 60 % del ancho y ≈ 70 % del alto a 1440 px; a 1280 px aún menos. | 5 regiones, 4 barras de arrastre grises de 4 px (`useResize` ×4 en `App.tsx`). | Alto |
| D2 | **Cero responsive.** No hay ni un `@media` en el CSS. En móvil la vista 3D desaparece (ancho 0) y los paneles se cortan; a 1280 px la barra superior se trunca ("Plant…", "Tiempo estimado ≈ 21 min (F 600…"). | captura 390×844 y 1280×720. | Alto |
| D3 | **Espacio muerto permanente.** El panel de keyframes (200 px) muestra solo un texto cuando no hay keyframes; la vista Lissajous arriba a la derecha es una línea vertical en un rectángulo de 200 px con la onda por defecto; carga + muestras ocupan ≈ 180 px del panel izquierdo aunque ya haya un SVG cargado. | capturas desktop. | Alto |
| D4 | **Controles duplicados.** Pivote y escala están en el panel izquierdo (*Centro de pivote*, *Escala*) **y** en la franja de keyframes (*Centro X/Y*, *Escala X/Y*, `CenterPad`). En el izquierdo, "Escala" aparece dos veces (campo + slider "ESCALA 1.00×"). | `CenterScaleParams.tsx`, franja en `App.tsx`. | Alto (confunde: ¿cuál manda?) |
| D5 | **Jerarquía tipográfica plana.** 11 tamaños (9–22 px), 5 pesos, 13 valores de *letter-spacing*. Casi todo es MAYÚSCULA espaciada en negrita: títulos de sección, etiquetas de campo del panel derecho, títulos de barra, checkboxes del visor. Cuando todo grita, nada destaca. | métricas CSS. | Medio-alto |
| D6 | **Estilos inconsistentes entre paneles.** Etiquetas en minúscula a la izquierda ("Altura de capa mm"), MAYÚSCULA a la derecha ("AMPLITUD N") y en la franja ("POSICIÓN"). Campos numéricos con 3 anchos distintos. | capturas. | Medio |
| D7 | **Botones sin sistema.** ≥ 6 variantes: contorno ("Ajustar"), segmentado con fondo tenue (Iso/Planta), pestaña rellena (Trayectoria/G-code), MAYÚSCULA pequeña ("RESETEAR CENTRO"), **verde** ("⊕ Añadir en 0%", usa `--ok` como color de acción), contorno índigo ("✓ OK"), rojo (papelera). | capturas. | Medio |
| D8 | **Rampa de capas arcoíris.** `layerColor` interpola el tono 218 → 20 en HSL y pasa por cian, verde y amarillo. CLAUDE.md dice "cobalto → terracota", pero en pantalla es un arcoíris que choca con la dirección suiza. | `draw3D.ts:25`. | Medio (es lo más visible de la app) |
| D9 | **Ruido en el visor.** "AZ 325° EL 28°" (dato de depuración), leyenda de capas diminuta arriba a la izquierda, marcador "C (0.0, 0.0)", checkboxes en mayúscula sobre el canvas, gizmo de ejes. | capturas. | Medio |
| D10 | **Mensajes inconsistentes.** "1 ruta(s) cargadas", "CARGA UN SVG PARA COMENZAR" en gris de 9 px, "G-CODE" repetido dos veces en la pestaña G-code, "Trayectoria" como título de barra y como pestaña, errores del parser en inglés, mezcla de "Resetear" y "Reiniciar". | código + capturas. | Medio-bajo |
| D11 | **Sin feedback.** Ninguna `@keyframes`; las 20 `transition` son *hover*. No hay señal de que el G-code se está regenerando (debounce 400 ms), ni confirmación al copiar/descargar, ni respuesta visible al elegir un preajuste. | métricas CSS. | Medio |
| D12 | **Colores fuera del sistema.** 38 colores hardcodeados en canvas (`draw3D.ts` 24, `LissajousPreview` 9, `CenterPad` 5) más 9 en CSS fuera de `:root`. Un cambio de paleta hoy no llega al 3D. | grep. | Bajo ahora, bloqueante para el overhaul |
| D13 | **Densidad desigual.** El panel derecho gasta ≈ 65 px por parámetro (etiqueta + valor en una fila, slider en otra); el izquierdo es compacto. 43 *paddings* distintos. | capturas + métricas. | Bajo-medio |
| D14 | **Interacción solo con ratón.** `Preview2D` usa `onMouse*`; sin *pointer/touch* la cámara no se mueve en tablet ni móvil. | `Preview2D.tsx:302`. | Alto si se quiere móvil |

### 1.3 Lectura general

La app está **bien construida pero organizada como herramienta de escritorio de los 2000**: muchos paneles redimensionables, todo visible siempre, cada panel con su propio dialecto visual. Los problemas de fondo son tres: **(a)** la pieza no es protagonista, **(b)** no hay un sistema de diseño explícito (escala tipográfica, espaciado, componentes), y **(c)** la información no es contextual (lo que solo sirve con keyframes, o antes de cargar un SVG, está siempre en pantalla).

---

## 2. Tu propuesta: una gran vista 3D con contenedores encima

**Veredicto: sí, es la dirección correcta, con reglas.** Es el patrón de Figma, Spline, Bambu/Orca Studio o Shapr3D, y encaja con lo que BarroCode es: un visor de una pieza con parámetros alrededor.

**A favor**
- La pieza pasa a ocupar el 100 % de la ventana; los paneles flotan en los bordes y la pieza se centra en el hueco libre.
- Desaparecen las 4 barras de arrastre y el ruido que generan.
- Escala de forma natural a móvil: los mismos contenedores se convierten en hojas inferiores (*bottom sheets*).
- Permite contenedores contextuales: la franja de keyframes solo aparece cuando hay uno seleccionado.

**Riesgos y cómo evitarlos**

| Riesgo | Regla |
|---|---|
| Los paneles tapan la pieza. | El *auto-fit* de cámara usa los márgenes de los paneles abiertos (zona segura), y cada panel se colapsa a un icono. |
| Texto ilegible sobre el 3D. | Paneles **opacos** (`--card` sólido + borde + una sombra suave). Nada de transparencia ni `backdrop-filter`: el canvas se redibuja en cada frame y el desenfoque costaría rendimiento (ver CLAUDE.md, "Performance"). |
| ≈ 50 parámetros no caben en tarjetas flotantes. | Panel izquierdo con **pestañas** Pieza / Trayecto / Máquina en lugar de acordeones apilados; scroll interno por pestaña. |
| Choca con la convención "border only, no shadows". | Decisión explícita (D-2 abajo): introducir **un** nivel de elevación solo para contenedores flotantes. |
| Se pierde el ancho ajustable. | Anchos fijos por *breakpoint* (280 / 320 px). Si se echa de menos, se reintroduce después; hoy pocos usuarios lo necesitan. |

**Esquema propuesto (escritorio)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ barrocode   [Archivo ▾] [‹ Muestra ›]     Iso Planta Frente  ⤢   21 min · 120×80×15 mm   [Exportar ▾] ? │  ← barra superior fina
│ ┌─ Pieza│Trayecto│Máquina ─┐                                    ┌─ Onda ─────────────┐ │
│ │ Capas                    │                                    │ [mini Lissajous]   │ │
│ │  Altura de capa   2.5 mm │            VISTA 3D A PANTALLA      │ Preajustes ○ ∞ ⌇   │ │
│ │  Núm. de capas      6    │                 COMPLETA            │ N  amplitud ──●─ 3 │ │
│ │ Escala y posición        │                                    │    longitud ─●── 20│ │
│ │  …                       │                                    │ T  …               │ │
│ └──────────────────────────┘                                    │ Z  …               │ │
│                                                                 └────────────────────┘ │
│ ┌─ Línea de tiempo ──────────────────────────────────────────────────────────────┐ │
│ │ ◆1      ◆2            ◆3     ──────●────────────────     35 %   [+ Keyframe]   │ │
│ │ (al seleccionar un keyframe se despliega: posición · giro · escala · pivote)  │ │
│ └────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sin SVG cargado:** el centro muestra un *estado vacío* grande (zona de arrastre + las 4 muestras como miniaturas). La carga desaparece del panel izquierdo.
- **G-code:** deja de ser pestaña; pasa a un cajón "Exportar" (descargar, copiar, ver las primeras líneas). La mayoría solo descarga.
- **Pivote y escala:** una sola ubicación. Valores globales en Pieza; al seleccionar un keyframe, la franja de la línea de tiempo edita esos mismos campos para ese keyframe (como ya hace el panel de onda).
- **Capas visibles (slider vertical):** se mantiene pegado al borde derecho del visor, junto al panel de onda.

**Alternativa conservadora** (si no quieres flotantes): mantener 3 columnas pero fijas, sin barras de arrastre, fusionar línea de tiempo + keyframes en un único dock contextual, y quitar la vista Lissajous como panel propio. Gana ≈ 60 % de lo mismo con la mitad del esfuerzo, pero no resuelve bien el móvil.

---

## 3. Decisiones (cerradas el 2026-10-27)

| ID | Decisión | Resultado |
|---|---|---|
| D-1 | Layout | **Vista 3D completa + contenedores flotantes.** |
| D-2 | Elevación | **Una sombra suave**, solo en contenedores flotantes y menús. |
| D-3 | Tipografía | **GSCode en todo**, con un tratamiento "como Claude": limpio, pensado para mucho texto (ver 3.1). |
| D-4 | Paleta | **Neutros limpios + un color de señal estridente, high-tech, reservado a muy pocas acciones** (como usa el color Claude Code). Se descarta el dúo terracota/índigo actual. |
| D-5 | Móvil | **Fuera de alcance.** Objetivo: escritorio y portátil, de 1024 a 1920 px de ancho. |
| D-6 | Modo oscuro | **No.** |

### 3.1 Dirección de diseño

**Tipografía (GSCode, tratamiento "Claude")**
- Todo en minúscula de frase. **Sin MAYÚSCULAS espaciadas** (hoy hay 13 *trackings* distintos; pasan a 0).
- La jerarquía la dan el **peso** y el **color**, no el tamaño ni las mayúsculas: dos pesos (450 texto, 600 títulos y valores) y tres tintas (`--ink` principal, `--ink-2` etiquetas, `--muted` unidades y ayudas).
- Cinco tamaños: 10 (pies, unidades) · 11 (secundario) · 12 (etiquetas, cuerpo) · 14 (títulos de grupo, valores destacados) · 18 (raro).
- Interlineado generoso (1.5 en cuerpo, 1.6 en texto largo), cifras tabulares en todos los valores.

**Color**
- **Neutros** (escala gris limpia, apenas fría): fondo del visor `--bg`, superficies blancas `--surface`, rellenos sutiles `--surface-2`, bordes `--border` / `--border-strong`.
- **Interacción normal en tinta** (`--accent` = casi negro): sliders, casillas, botón primario, selección en segmentados. Limpio y sobrio, como Claude.
- **`--signal` naranja eléctrico (`#FF5A1F`)**, con texto en tinta encima. Solo para:
  1. la acción final (Descargar `.gcode` / Exportar);
  2. añadir keyframe;
  3. el anillo de foco del teclado;
  4. más adelante: barra de "recalculando" y la parte "barro" del logotipo.
  Nada más usa este color; si aparece en otro sitio, es un error.
- **Rampa de capas** en OKLCH: índigo eléctrico → magenta → naranja de señal (tipo *plasma*), perceptualmente uniforme y sin el verde/amarillo del arcoíris actual. Los keyframes toman el color de la rampa en su posición.
- Ejes N / T: los extremos fríos de la rampa (azul eléctrico y magenta), solo en diagramas y en la vista Lissajous.

**Forma**
- Radios 4 / 6 / 10 px (el mayor, para contenedores flotantes). Thumb de slider redondo con sombra mínima.
- Botones de 28 px de alto, segmentados tipo "píldora" (fondo `--surface-2`, opción activa blanca con sombra).

---

## 4. Plan de trabajo

Ordenado por impacto ÷ esfuerzo, con la filosofía del repo: commits pequeños y verificables. Cada fase deja la app desplegable. Las Fases 1–2 valen para cualquier decisión de layout y pueden empezar ya.

### ✅ Fase 1 — Fundaciones del sistema visual (≈ 1–2 sesiones · riesgo bajo · sin cambio de layout)

> **Hecha (2026-10-27).** Las primitivas se aplicaron sobre las clases existentes (`.btn-small`, `.btn-primary`, `.btn-reset`, `.seg-switch`, `.view-presets`…) más `.btn-signal`, para no tocar el JSX. Pendiente para la Fase 2: los textos pequeños del canvas (7–9 px) y la leyenda de capas.

1. **Tokens nuevos en `:root`:** escala tipográfica (`--fs-1…5`: 10/11/12/14/18), pesos (450/600), *tracking* 0, espaciado (`--sp-1…6`: 4/8/12/16/24/32), dos radios, `--shadow-float`, movimiento (`--dur-fast 120ms`, `--dur 200ms`, `--dur-slow 320ms`, `--ease`). Sustituir los 11 tamaños / 13 *trackings* / 43 *paddings* por los tokens.
2. **Paleta de canvas desde CSS:** leer los tokens una vez con `getComputedStyle` y pasarlos a `draw3D`, `LissajousPreview` y `CenterPad` (cierra la higiene #10 de CLAUDE.md y es requisito de todo lo demás).
3. **Rampa de capas sin arcoíris:** índigo eléctrico → magenta → naranja de señal en OKLCH (ver 3.1). Un cambio en `layerColor`; se nota en toda la app.
4. **Primitivas CSS** (clases, no componentes compartidos, respetando la convención #3): `.btn` + `--primary / --secondary / --ghost / --danger / --signal`, `.seg` (segmentado), `.field` (etiqueta + entrada + unidad), `.sec-title`, `.chip`. Migrar las 6 variantes de botón. "Añadir keyframe" y "Descargar" pasan a `--signal`; el resto, a tinta o neutro.
5. **Una sola regla de etiquetas:** minúscula de frase en todas partes; títulos con peso 600 y tinta principal, etiquetas en `--ink-2`, unidades en `--muted`. Aplica a los tres paneles y al visor.

*Entregable verificable:* capturas antes/después a 1024, 1280 y 1440 px; `npm test` y `npm run build` verdes; sin cambio de G-code.

### Fase 2 — Limpieza de ruido y mensajes (≈ 1 sesión · riesgo bajo)

1. Quitar "AZ/EL" del visor (o mostrarlo solo mientras se rota). Mover *Color por capa* y *Cotas* a un menú "Vista" de la barra.
2. Leyenda de capas: integrarla al slider vertical de capas (el color ya está ahí), quitar la de la esquina.
3. Eliminar la duplicación de escala en Pieza (campo **o** slider, no ambos).
4. Copy: "1 trayecto cargado / N trayectos"; estado vacío del visor con frase normal y tamaño legible; un solo verbo para restaurar valores ("Restablecer"); quitar el título "G-CODE" duplicado; traducir los errores de `svgParser.ts` (higiene #7).
5. Revisión con la skill `design:ux-copy` de todos los textos y *tooltips*.

### Fase 3 — Nuevo layout (≈ 3–4 sesiones · riesgo medio · el cambio grande)

Requiere D-1. En pasos desplegables por separado:

1. **Lienzo a pantalla completa + barra superior.** Visor como fondo de `.app-layout`; barra superior con logo, archivo/muestras, vistas, resumen (tiempo · tamaño), exportar, ayuda. Los paneles actuales pasan a contenedores flotantes con sus contenidos tal cual. Quitar `useResize` y las 4 barras.
2. **Zona segura de cámara:** "Ajustar" y el *auto-fit* centran la pieza en el hueco entre paneles abiertos.
3. **Panel izquierdo con pestañas** Pieza / Trayecto / Máquina (sustituye los acordeones; se conserva `barrocode.leftGroups` como pestaña activa).
4. **Panel de onda:** la vista Lissajous se integra como cabecera compacta (≈ 120 px) del panel; preajustes en fila de iconos; cada parámetro en una sola fila (etiqueta · slider · número) → la mitad de alto.
5. **Dock de línea de tiempo:** fusiona "Extrusor" y "Keyframes" en una franja; el editor del keyframe se despliega solo con uno seleccionado. Pivote/escala por keyframe viven solo ahí (resuelve D4).
6. **Estado vacío y exportar:** carga + muestras como estado vacío central; G-code en cajón "Exportar".
7. Colapsar cada contenedor a icono; recordar estado en `localStorage` (con try/catch, como el resto).

### Fase 4 — Anchos de escritorio (≈ 0,5 sesión · riesgo bajo)

Móvil queda fuera (D-5). Solo asegurar que todo se ve bien entre 1024 y 1920 px:

1. ≥ 1280: los dos paneles laterales abiertos. 1024–1279: abrir un panel lateral colapsa el otro.
2. La barra superior no se trunca: el resumen se compacta antes de cortar botones.
3. Verificar a 1024, 1280, 1440 y 1920 px.

### Fase 5 — Feedback animado, simple (≈ 1–2 sesiones · riesgo bajo)

Todo con los tokens de movimiento y desactivado con `prefers-reduced-motion`. Solo CSS o una interpolación corta; nada que redibuje el 3D en bucle.

| Interacción | Feedback |
|---|---|
| Abrir / colapsar contenedor, pestañas | deslizamiento + *fade* 200 ms |
| Elegir un preajuste de onda | la figura Lissajous se transforma (*morph*) en 250 ms; los números cambiados parpadean en acento |
| G-code regenerándose (debounce) | barra de progreso fina e indeterminada bajo la barra superior |
| Copiar / descargar / restaurar sesión | *toast* breve abajo |
| Añadir keyframe | el diamante aparece con un "pop" en la línea de tiempo y en el 3D |
| Arrastrar SVG sobre la ventana | toda la vista se resalta como zona de soltar |
| Vistas Iso / Planta / Frente | la cámara interpola 300 ms (con LOD activo, como al rotar) |
| *Hover* / *focus* | estados consistentes en todas las primitivas (anillo de foco visible) |

### Fase 6 — QA y documentación (continua)

1. Script de capturas Playwright a 1024, 1280 y 1440 px como comprobación visual antes de cada commit de UI (en `scratchpad`, o en `scripts/` si lo quieres versionado).
2. Auditoría de contraste y teclado con `design:accessibility-review` al cerrar la Fase 3.
3. Comprobar que no se pierde rendimiento frente a las cifras de CLAUDE.md (rotación, *scrub*, tick de slider).
4. Actualizar CLAUDE.md (layout, convención de sombras, tokens, mapa de archivos) y `docs/usage.md`.

---

## 5. Resumen ejecutivo

| Fase | Qué consigue | Esfuerzo | Riesgo | Depende de |
|---|---|---|---|---|
| 1 Fundaciones | Coherencia visual inmediata, rampa de capas limpia, base para todo | Bajo | Bajo | — |
| 2 Ruido y copy | Interfaz más tranquila, mensajes consistentes | Bajo | Bajo | — |
| 3 Layout | La pieza protagonista, sin duplicados, información contextual | Alto | Medio | D-1 |
| 4 Anchos de escritorio | Bien de 1024 a 1920 px | Bajo | Bajo | Fase 3 |
| 5 Animación | Sensación de producto pulido, feedback claro | Bajo-medio | Bajo | Fase 1 |
| 6 QA / docs | Sin regresiones, CLAUDE.md al día | Bajo | — | cada fase |

**Estado:** decisiones cerradas; Fase 1 hecha; siguiente, Fase 2.
