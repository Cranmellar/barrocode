# Espacio *Máquina* (G-code) — plan de evaluación

Fecha: 2026-10-31 · base: `main` @ `4fc99b8` · estado: propuesta, nada implementado. Decisiones abiertas en la sección 7.

Este documento evalúa si conviene añadir un tercer espacio de trabajo, después de *Forma* e *Impresión*, dedicado al G-code y a la máquina. Ese espacio reuniría los parámetros de máquina que hoy están repartidos y añadiría los que faltan para imprimir en arcilla y también con filamento (FDM), con la Creality K1 y la Ender-3 V3 como casos de referencia.

---

## 1. Problema

Hoy BarroCode resuelve bien *qué* se imprime (forma, onda, capas) y poco *en qué máquina*. Lo que define la máquina está repartido o escrito a mano en el código:

| Qué | Dónde está hoy |
|---|---|
| Velocidades, extrusión (`generateE`, `extrusionMultiplier`), calibración Z (`nozzleHeightOffset`, `safeZ`), arcilla (pausa, cebado) | Pestaña *Máquina* del panel izquierdo de *Impresión* (`PathParams.tsx`) |
| Origen del G-code (`gcodeOrigin`, `originX/Y`, `marginX/Y`), invertir Y | *Pieza → Escala y posición*, mezclado con la escala de la pieza |
| Z-hop, umbral del arco de desvío, unión de capas | *Trayecto* |
| Texto del G-code, copiar | Cajón sobre el visor 3D (`GcodeOutput`), con 1500 líneas visibles |
| Preámbulo `G21 / G90 / M82 / G92 E0`, subida final `+10 mm`, `M84`, holguras (`TRAVEL_CLEARANCE`, `PRIME_GAP`) | Fijos en `gcodeGenerator.ts`, sin parámetro |
| Tamaño de cama, temperaturas, ventilador, G-code de inicio y fin, diámetro de boquilla y de filamento, retracción, aceleración | No existen |

Consecuencias:

- **Nada impide mandar a la máquina un G-code que no puede ejecutar.** Con el origen por defecto (centro de la pieza en 0, 0) media pieza queda en X/Y negativos, y no hay tamaño de cama con el que comparar (CLAUDE.md, *Next steps* 1 y 9).
- **El G-code no se puede imprimir tal cual en una impresora de filamento.** No calienta, no hace *homing*, no purga, y su E es un multiplicador arbitrario, no un volumen.
- **El panel izquierdo de *Impresión* mezcla dos ritmos.** La pieza y el trayecto cambian con cada diseño; la máquina se configura una vez por impresora. Hoy los dos comparten pestañas.

## 2. Objetivo

Un tercer espacio, provisionalmente **Máquina** (nombre en D-G1), que:

1. Reúna en un sitio lo que depende de la impresora y no del diseño.
2. Ofrezca **perfiles** (arcilla genérica, Creality K1, Ender-3 V3, Ender-3 V3 SE…) que rellenen esos campos de una vez.
3. Emita un G-code **listo para la impresora elegida**: preámbulo, temperaturas, purga, extrusión volumétrica, fin.
4. **Revise el G-code antes de descargarlo**: fuera de cama, coordenadas negativas, caudal por encima de lo que la boquilla funde, tiempo por capa demasiado corto, z-hop desproporcionado.
5. Deje intacto el flujo de arcilla actual: con el perfil de arcilla el G-code sale igual que hoy, byte a byte, salvo el encabezado.

### Por qué tiene sentido el filamento

El G-code de BarroCode ya es, en FDM, un **modo jarrón** (*spiralize*): una sola pared continua, con la costura en rampa (`softJoin`) que sube una capa por vuelta sin cortar el flujo. Lo que BarroCode añade es la textura: la onda N/T/Z a lo largo del trayecto, con keyframes. Los laminadores comunes solo ofrecen *fuzzy skin* (ruido aleatorio) o texturas por desplazamiento de malla. Es un hueco real, y permite a los ceramistas probar una pieza en PLA (barato, rápido, de escritorio) antes de gastar arcilla.

## 3. Arcilla y filamento: qué cambia

| Aspecto | Arcilla (hoy) | Filamento (K1, Ender-3 V3) | Consecuencia para BarroCode |
|---|---|---|---|
| Boquilla | 2–8 mm | 0,4 mm (0,6–0,8 opcional) | Toda la escala baja ×5–×10 (sección 5) |
| Altura de capa | 1–3 mm | 0,1–0,3 mm (≤ 75 % de la boquilla) | Más capas: `MAX_LAYERS = 500` da 100 mm a 0,2 mm |
| Ancho de cordón | Lo que dé la bomba | Parámetro: 1,0–1,5 × boquilla en una pared de jarrón | Nuevo `lineWidth` |
| Extrusión E | `E += d · multiplicador` (unidades de la bomba) | Volumen: `E += d · ancho · alto / (π · (Ø/2)²)`, Ø = 1,75 mm, × flujo % | Modo de extrusión por material (G3) |
| Retracción | Nunca | Sí en cada desplazamiento sin extruir (0,5–0,8 mm en extrusor directo) | Solo con filamento; contradice la regla actual de CLAUDE.md, que es de arcilla (D-G3) |
| Temperaturas | No | Boquilla 200–230 °C (PLA), cama 55–65 °C | `M104/M109/M140/M190` o parámetros de la macro |
| Ventilador | No | Apagado en las primeras capas, luego 100 % (PLA) | `M106 S… / M107` por capa |
| Inicio y fin | Nada (el usuario prepara la máquina) | *Homing*, malla de cama, purga, apagado | Plantillas de inicio y fin con variables |
| Origen | Variable; el centro es habitual en deltas y robots | Esquina delantera izquierda, cama 0–220 | `gcodeOrigin: 'corner'` existe; falta «centrar en la cama» |
| Velocidad | 5–20 mm/s | 50–300 mm/s; limitadas por la aceleración y las esquinas de la onda | La UI usa mm/min; en FDM se piensa en mm/s (D-G5) |
| Aceleración | Irrelevante | 5 000–20 000 mm/s²; Klipper la ajusta en vivo | `M204 S…` o `SET_VELOCITY_LIMIT` |
| Tiempo mínimo por capa | Útil (secado, peso de la pared húmeda) | Imprescindible en piezas pequeñas (el PLA se ablanda) | Común a los dos: ralentiza la capa |
| Z-hop en cruces | 2,5 mm por defecto | ≤ 0,4 mm, o desactivado | Valores del perfil |
| Primera capa | Cebado (`primingMove`) | Más lenta, más caliente, a veces más ancha; *brim* | Velocidad de primera capa; *brim* más adelante |
| Base de la pieza | Opcional, a menudo a mano | Un jarrón sin fondo es un tubo; con fondo necesita relleno | Fuera del plan (sección 4) |

### Las dos máquinas de referencia

«Ender K1» no existe como modelo: se entiende la **Creality K1** (familia K1 / K1C / K1 SE; la K1 Max es más grande). Cifras de catálogo o perfiles de la comunidad: **verificar contra la impresora y su perfil de Creality Print antes de fijarlas** en un perfil.

| | Creality K1 / K1C | Ender-3 V3 | Ender-3 V3 SE | Ender-3 V3 KE |
|---|---|---|---|---|
| Cinemática | CoreXY, cama en Z | CoreXZ (X y Z acoplados) | Cartesiana, cama en Y | Cartesiana, cama en Y |
| Firmware | Creality OS (Klipper) | Creality OS (Klipper) | Marlin | Creality OS (Klipper) |
| Volumen | 220 × 220 × 250 mm | 220 × 220 × 250 mm | 220 × 220 × 250 mm | 220 × 220 × 240 mm (verificar) |
| Inicio típico | `START_PRINT EXTRUDER_TEMP=… BED_TEMP=…` (la macro calienta, hace *homing* y purga) | Probablemente igual (verificar) | `G28`, `M140/M190`, `M104/M109`, línea de purga explícita | Como la K1 (verificar) |
| Fin típico | `END_PRINT` | Probablemente igual | `M104 S0`, `M140 S0`, subir, presentar cama, `M84` | `END_PRINT` |
| Boquilla / filamento | 0,4 mm / 1,75 mm, extrusor directo | 0,4 / 1,75, directo | 0,4 / 1,75, directo | 0,4 / 1,75, directo |
| Notas para BarroCode | Z por husillos: Klipper limita `max_z_velocity`, así que la onda Z y la rampa no son peligrosas pero el tiempo estimado sale corto | Z rápido (CoreXZ): bien para onda Z | Marlin: muchos segmentos cortos a alta velocidad pueden vaciar el *planner*; vigilar segmentos/s | Como la K1 |

Lo que más cambia entre ellas no es la geometría (las cuatro tienen ≈ 220 × 220, origen en la esquina) sino **el inicio y el fin**: en Klipper una macro hace casi todo y el G-code solo le pasa las temperaturas; en Marlin el G-code tiene que hacerlo él. Si a una K1 se le manda el `M104/M109` sin `START_PRINT`, hay informes de que la boquilla se va a la temperatura por defecto de la macro. Por eso el perfil guarda la plantilla entera, no solo los números.

## 4. Lo que el espacio no hará

BarroCode no se convierte en un laminador. Cada pedido nuevo se compara con esta lista:

- Sin relleno, techos, fondos macizos ni soportes. Una pieza es una o varias paredes de un cordón (como hoy). Un fondo para el jarrón de filamento sería una fase aparte, fuera de este plan.
- Sin importar STL ni mallas.
- Sin varias piezas ni varios materiales por archivo.
- Sin envío directo a la impresora (Moonraker, Creality Cloud, OctoPrint) en este plan: requiere red, CORS y credenciales, y la app es estática.
- Sin miniaturas en el G-code ni `EXCLUDE_OBJECT` en las primeras fases.
- Sin retracción ni ventilador en modo arcilla.

## 5. Escala: el riesgo principal

Pasar de arcilla a filamento no es solo cambiar el preámbulo. La onda y el muestreo bajan de escala y el número de puntos se dispara:

| | Arcilla (defaults) | Jarrón PLA de referencia |
|---|---|---|
| Altura de capa | 2,5 mm | 0,2 mm |
| Capas para 100 mm | 40 | 500 (el tope actual) |
| Amplitud N / long. de onda | 3 / 20 mm | 0,5–2 / 3–10 mm |
| `sampleSpacing` | 2 mm | 0,3–0,5 mm (la onda de 4 mm necesita ≥ 8 muestras por ciclo) |
| Puntos por capa (Ø 100 mm, 314 mm de perímetro) | ≈ 160 | ≈ 800 |
| Puntos totales | ≈ 6 400 | ≈ 400 000 (60× más) |
| G-code | ≈ 0,2 MB | ≈ 12–15 MB |

Con las medidas de CLAUDE.md (*Performance*), 68 000 puntos cuestan ≈ 100 ms por tick de slider; 400 000 puntos serían ≈ 0,6 s por tick y más de 1 s de G-code al final de cada edición. Sin trabajo de rendimiento previo, el modo filamento sería usable pero lento. Por eso la fase G-1 (sección 6) mide antes de decidir, y las mejoras pendientes de *Performance* pasan a ser requisito:

- **#4 Capas idénticas** (sin keyframes ni desfase por capa, todas las capas tienen el mismo XY): de ≈ 60 ms a unos pocos a 150 capas. En un jarrón FDM es el caso habitual.
- **#7 G-code en un worker** (`?worker&inline` por `file://`).
- Subir `MAX_LAYERS` (500 → 1 500, D-G6) solo después de medir.

## 6. Arquitectura

### 6.1 Dónde vive en la UI

Tercer botón del selector de espacio (`Workspace = 'forma' | 'impresion' | 'maquina'` en `App.tsx`), en el mismo encabezado del panel izquierdo. El orden de izquierda a derecha es el del trabajo: forma → onda y capas → máquina y archivo.

```
┌ panel izquierdo ──────┐ ┌ barra superior: Encuadrar, vistas, resumen, Descargar ┐ ┌ panel derecho ───────┐
│ Forma·Impresión·Máq.  │ └──────────────────────────────────────────────────────┘ │ Revisión previa      │
│ Perfil ▾ (K1, V3…)    │                                                          │ ✓ dentro de la cama  │
│ Material: arcilla/fil.│      visor 3D con la cama dibujada a escala              │ ⚠ caudal 18 mm³/s    │
│ Cama y origen         │      (el mismo Preview2D)                                │ ⚠ capa 4 s < 8 s     │
│ Boquilla y extrusión  │                                                          │ Tiempo, filamento    │
│ Temperatura, ventil.  │  ┌ G-code (abierto por defecto aquí) ────────────────┐   │ (m, g), caja         │
│ Movimiento            │  │ textarea + Copiar, con secciones plegables:       │   │                      │
│ Inicio y fin (texto)  │  │ inicio · capa N · fin                             │   │                      │
│ Arcilla / Filamento   │  └───────────────────────────────────────────────────┘   │                      │
└───────────────────────┘                                                          └──────────────────────┘
```

- El visor 3D es el mismo `Preview2D`; en *Máquina* dibuja además el rectángulo de la cama y marca en rojo lo que se sale.
- El cajón de G-code deja de ser exclusivo de *Impresión*: en *Máquina* está abierto por defecto. *Impresión* conserva el botón *G-code* y *Descargar*, para no alargar el camino de quien ya tiene la máquina configurada.
- La pestaña *Máquina* del panel izquierdo de *Impresión* desaparece; sus campos se mudan. *Pieza* conserva la escala y el pivote; el origen (*Posición X / Y*, *Margen*) pasa a *Máquina → Cama y origen*, porque depende de la cama, no del diseño. *Trayecto* conserva z-hop y unión de capas (son geometría y se ven en el visor).
- El panel derecho de *Máquina* no tiene onda: muestra la **revisión previa** y el resumen.

Maquetas de baja fidelidad de tres variantes en [`docs/mockups/maquina/`](mockups/maquina/): **A** espacio *Máquina* con el visor y el cajón de G-code (esta propuesta), **B** espacio *Máquina* centrado en el texto del G-code, navegable por secciones, **C** la alternativa mínima de D-G2, solo la pestaña *Máquina* de *Impresión* con perfil y cama.

### 6.2 Estado

Sigue las convenciones: **todo plano dentro de `PrintParams`**, sin objetos anidados.

Campos nuevos (nombres provisionales):

```
material: 'clay' | 'filament'
machineProfile: string            // id del perfil aplicado, solo informativo
firmware: 'marlin' | 'klipper' | 'generic'
bedX, bedY, bedZ: number          // mm
nozzleDiameter: number            // mm
lineWidth: number                 // mm (filamento)
filamentDiameter: number          // mm (1.75)
flowRatio: number                 // 1 = 100 %
nozzleTemp, bedTemp: number       // °C (filamento)
fanSpeed: number                  // 0–100 %
fanFromLayer: number
retractLength, retractSpeed: number
firstLayerSpeed: number           // mm/min
minLayerTime: number              // s (los dos materiales)
accel: number                     // mm/s², 0 = no emitir
maxVolumetricFlow: number         // mm³/s, solo para avisar
startGcode, endGcode: string      // plantillas con {nozzleTemp}, {bedTemp}, {bedX}…
```

- Los **perfiles** son objetos `Partial<PrintParams>` constantes (`MACHINE_PROFILES`), como los preajustes de onda. Aplicar uno hace `setParams({ ...params, ...perfil })`. Un perfil propio del usuario se guarda en `localStorage` (`barrocode.machines`), D-G7.
- Ninguno de estos campos entra en `WAVE_PARAMS` ni en `TOOLPATH_PARAMS`: solo los lee `generateGcode`. Cambiar la temperatura o la retracción no recalcula capas ni trayectoria, solo el G-code (con su espera de 400 ms). `paramDeps.test.ts` lo vigila.
- La sesión (`barrocode.session`) ya guarda `params` entero; los campos nuevos viajan con ella. Una sesión vieja se completa con `{ ...DEFAULT_PARAMS, ...saved }`, como hoy.

### 6.3 Dónde va cada cosa en el pipeline

| Cambio | Archivo | ¿Cambia el visor? |
|---|---|---|
| Plantillas de inicio y fin, temperaturas, ventilador por capa, `M204` | `gcodeGenerator.ts` (`buildHeader`, preámbulo, bucle de capas, fin) | No |
| E volumétrica y E con Z (`Math.hypot(dx, dy, dz)`, NP-0a) | `gcodeGenerator.ts` (`pathToGcode`, `buildTransition`, cebado), una función `eFor(d)` | No |
| Retracción en desplazamientos (solo filamento) | `buildSkirtTravel`: retraer antes de subir, recuperar al bajar | No (marca opcional) |
| Velocidad de primera capa y tiempo mínimo por capa | `gcodeGenerator.ts`: `F` por capa; el resumen (`move`) ya suma el tiempo real | No (sí el tiempo) |
| Cama, caja min/max en el encabezado, avisos | Nuevo `lib/machineCheck.ts` (puro, testeable) sobre el toolpath y las estadísticas | Sí: rectángulo de cama y avisos |
| «Centrar en la cama» | Botón que pone `originX/Y = bedX/2, bedY/2` (modo centro) | Ya se refleja |
| *Brim* (fase posterior) | `toolpath.ts`, porque se imprime y el visor debe verlo | Sí |

Las capas y la trayectoria no cambian con ningún campo de máquina; solo el *brim*, si llega, toca `toolpath.ts`.

### 6.4 Plantillas de inicio y fin

Texto libre con variables entre llaves, sustituidas al emitir: `{nozzleTemp}`, `{bedTemp}`, `{bedX}`, `{bedY}`, `{firstLayerZ}`, `{minX}`, `{maxX}`… Una variable desconocida se deja tal cual y se avisa en la revisión. Ejemplos de partida (a verificar en la máquina):

```gcode
; Klipper (K1, Ender-3 V3, V3 KE)
M140 S0
M104 S0
START_PRINT EXTRUDER_TEMP={nozzleTemp} BED_TEMP={bedTemp}
```

```gcode
; Marlin (Ender-3 V3 SE)
M140 S{bedTemp}
M104 S{nozzleTemp}
G28
M190 S{bedTemp}
M109 S{nozzleTemp}
G92 E0
G1 Z2 F600
G1 X5 Y20 F6000
G1 Z0.3 F600
G1 Y200 E15 F1500   ; línea de purga
G92 E0
```

Con el perfil de arcilla las plantillas están vacías y el preámbulo actual (`G21 / G90 / M82 / G92 E0`) se mantiene. `M82` y `G92 E0` se emiten **después** de la plantilla de inicio en los dos materiales: la macro de la K1 purga y puede dejar E en otro valor.

### 6.5 Revisión previa

Es lo que más valor da por esfuerzo, y sirve también a la arcilla. `machineCheck(toolpath, stats, params)` devuelve avisos con nivel (`ok` / `aviso` / `error`, las mismas notas que ya usa la app):

- Caja fuera de la cama (X, Y < 0 o > `bedX/Y`; Z > `bedZ`). Cierra *Next steps* 1 y 9.
- Caudal volumétrico: `lineWidth · layerHeight · printSpeed/60` > `maxVolumetricFlow`.
- Capa más rápida que `minLayerTime` (si no se ralentiza sola).
- Z-hop o amplitud Z mayores que N alturas de capa.
- Segmentos por segundo (`printSpeed / sampleSpacing`) por encima de lo razonable en Marlin.
- Voladizo por desfase entre capas o giro (`r · Δθ` en el radio máximo) mayor que ≈ 45° con la altura de capa (relacionado con *Next steps* 4).
- Variables sin sustituir en las plantillas.

## 7. Decisiones abiertas

| # | Decisión | Recomendación |
|---|---|---|
| D-G1 | **Nombre del espacio.** *Máquina*, *Salida* o *G-code*. | *Máquina*: describe lo que se configura; *G-code* es el producto, que también está en *Impresión*. |
| D-G2 | **¿Tercer espacio o reorganizar la pestaña *Máquina* actual?** | Tercer espacio si se hace el modo filamento (los campos nuevos no caben en una pestaña de 300 px). Si solo se quiere la revisión y la cama para arcilla, basta la pestaña: G0 y G1 sirven en los dos casos. |
| D-G3 | **Retracción.** CLAUDE.md la prohíbe porque es de arcilla. | Permitirla solo con `material: 'filament'`, y actualizar la regla en CLAUDE.md al hacerlo. |
| D-G4 | **E absoluta o relativa.** | Absoluta (`M82`) en los dos firmwares: es lo que ya hace el emisor y lo que esperan los tests de invariantes. |
| D-G5 | **Unidades de velocidad.** La app usa mm/min. | Mostrar mm/s cuando el material es filamento, guardar siempre mm/min (un solo campo, sin conversión en el pipeline). |
| D-G6 | **Tope de capas.** 500 limita un jarrón de PLA a 100 mm a 0,2 mm. | Subirlo a 1 500 en modo filamento después de G-1 y de *Performance* #4. |
| D-G7 | **Perfiles del usuario.** | Perfiles incorporados + uno «Personalizado» que se guarda en `localStorage`. Exportar/importar perfiles como JSON más adelante. |
| D-G8 | **¿Un perfil cambia también la onda y las capas?** Un jarrón de PLA con la onda de arcilla (N 3 mm, λ 20 mm) se imprime, pero no es lo que se quiere. | No automáticamente. Al pasar a filamento, ofrecer *Adaptar la onda a la boquilla* (escala amplitudes, longitudes de onda, espaciado y altura de capa por el cociente de boquillas) como acción explícita. |

## 8. Fases

Cada fase termina con `npm test` y `npm run build` en verde y algo usable. Las fases G0–G1 sirven solo con arcilla; se pueden hacer aunque el modo filamento no siga.

### G-1 — Medición (½ sesión, sin código que quede)

- Con `vite-node` y en Chromium: jarrón de Ø 100 mm, 0,2 mm de capa, `sampleSpacing` 0,4, 500 y 1 000 capas (subiendo `MAX_LAYERS` en local). Medir tick de slider, G-code, tamaño, memoria.
- **Hecho cuando:** hay cifras para decidir D-G6 y el orden de *Performance* #4 y #7 respecto a G3.

### G0 — Andamio (1 sesión)

- Tercer espacio en el selector; `MaquinaView` (con `React.lazy` si pesa) con el visor y el cajón de G-code abierto.
- Mudar la pestaña *Máquina* de *Impresión* y el origen de *Escala y posición*. Ningún campo nuevo.
- **Hecho cuando:** las snapshots de G-code no cambian, los atajos siguen funcionando en *Impresión*, y la ayuda (`HelpDialog`, `docs/usage.md`) describe los tres espacios.

### G1 — Cama, origen y revisión (1 sesión)

- `bedX/Y/Z`, *Centrar en la cama*, rectángulo de cama en el visor.
- `lib/machineCheck.ts` con los avisos de cama; panel *Revisión previa*; caja min/max en el encabezado del G-code.
- Encabezado completo (*Next steps* 3: onda Z, keyframes, pausa, cebado, `safeZ`, dirección alterna).
- **Hecho cuando:** con el origen por defecto aparece «media pieza en X/Y negativos» y *Centrar en la cama* lo resuelve; test de `machineCheck` con piezas dentro, fuera y en el borde.

### G2 — Material, perfiles y plantillas (1–2 sesiones)

- `material`, `firmware`, `MACHINE_PROFILES` (Arcilla genérica, Creality K1, Ender-3 V3, Ender-3 V3 SE, Personalizado), selector de perfil.
- Plantillas de inicio y fin con variables; emisión antes/después del cuerpo.
- **Hecho cuando:** el perfil de arcilla da el G-code actual byte a byte (salvo encabezado); hay snapshots nuevas para K1 y V3 SE; la plantilla Klipper empieza con `START_PRINT EXTRUDER_TEMP=… BED_TEMP=…`.

### G3 — Extrusión volumétrica (1 sesión)

- E con Z (NP-0a, *Next steps* 2) para los dos materiales; snapshot de arcilla revisada antes de `-u`.
- Modo filamento: `E = d · lineWidth · h / (π · (Ø/2)²) · flowRatio`, con `h` = altura de capa (el grosor local con onda Z queda para después, como en arcilla).
- Estadísticas: filamento en m y g (densidad del PLA 1,24 g/cm³).
- **Hecho cuando:** 100 mm de trayecto a 0,4 × 0,2 dan E ≈ 3,33 mm de filamento (test), y los invariantes de E monótona siguen en verde.

### G4 — Filamento: temperatura, ventilador, retracción, ritmo (1–2 sesiones)

- `M106/M107` por capa; `M204` o `SET_VELOCITY_LIMIT` según firmware.
- Retracción en `buildSkirtTravel`; invariante nuevo: tras recuperar, E vuelve al valor de antes de retraer.
- Velocidad de primera capa; tiempo mínimo por capa (también en arcilla).
- Revisión: caudal volumétrico, tiempo por capa, segmentos/s.
- *Adaptar la onda a la boquilla* (D-G8).
- **Hecho cuando:** un jarrón por defecto en perfil K1 pasa la revisión sin avisos y el G-code se abre limpio en PrusaSlicer/OrcaSlicer (marcadores de capa ya existen).

### G5 — Prueba física (fuera del código)

- Imprimir en una K1 y una Ender-3 V3 (o SE): jarrón de 60 mm con la onda adaptada. Ajustar las plantillas y los valores marcados «verificar» en la sección 3.
- Repetir una pieza de arcilla con el perfil de arcilla para confirmar que no cambió nada.
- **Hecho cuando:** los perfiles incorporados están verificados en máquina, y lo que no se pudo verificar queda dicho en el perfil.

### Después de este plan

- *Brim* para la primera capa (toca `toolpath.ts`).
- Fondo de jarrón (relleno en espiral de la primera capa cerrada).
- Grosor real del cordón con onda Z (E por hueco local).
- Exportar e importar perfiles; miniaturas; `M73` de progreso.

## 9. Esfuerzo y veredicto

| Bloque | Sesiones | Sirve a la arcilla |
|---|---|---|
| G-1 Medición | ½ | — |
| G0 Andamio | 1 | Sí (orden de la UI) |
| G1 Cama y revisión | 1 | **Sí, el mayor beneficio por esfuerzo** |
| G2 Perfiles y plantillas | 1–2 | Poco |
| G3 Extrusión volumétrica | 1 | Sí (E con Z) |
| G4 Filamento | 1–2 | Tiempo mínimo por capa |
| Rendimiento (*Performance* #4, #7) | 1–2 | Sí |

Total: ≈ 7–10 sesiones para un modo filamento usable; ≈ 2 para G0 + G1, que valen por sí solos.

**Recomendación:** hacer G-1, G0 y G1 ya (bajo esfuerzo, impacto alto también en arcilla: es la red de seguridad que hoy falta). Decidir el modo filamento después de G-1, con las cifras de rendimiento delante: el pipeline aguanta el cambio de G-code sin problema; lo que puede fallar es la escala de puntos.

---

Fuentes de las cifras de impresoras (a verificar en máquina):

- [Ender-3 V3, página de Creality](https://www.creality.com/products/creality-ender-3-v3) y [comparativa de la serie V3](https://www.creality.com/pages/compare-ender-3-v3-series)
- [Ender-3 V3 vs SE vs KE, foro de Creality](https://forum.creality.com/t/ender-3-v3-vs-ender-3-v3-se-vs-ender-3-v3-ke/23425)
- [Perfiles K1 / K1C / K1 Max para PrusaSlicer y Cura (Printables)](https://www.printables.com/model/798858-creality-k1-k1c-k1-se-k1-max-prusaslicer-cura-some)
- [Cura y Creality K1: perfiles (All3DP)](https://all3dp.com/es/2/cura-creality-k1-perfil-ajustes-configuracion/)
- [Cura, issue sobre la temperatura de la K1 Max sin `START_PRINT`](https://github.com/Ultimaker/Cura/issues/16573)
- [Slicer y `PRINT_START` (documentación de Voron)](https://docs.vorondesign.com/community/howto/EricZimmerman/SlicerAndPrintStart.html)
