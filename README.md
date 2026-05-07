# CurvaBarro

Herramienta web local para convertir curvas SVG en trayectorias oscilantes para impresión 3D en arcilla, exportadas como G-code.

Diseñada para ceramistas, artistas y educadores que trabajan con extrusoras de arcilla controladas por máquina CNC o impresora 3D.

---

## Inicio rápido

```bash
npm install
npm run dev
```

Abre la URL que aparece en la terminal (normalmente `http://localhost:5173`).

### Versión portable (USB)

El repo incluye un build precompilado en `dist/`. En cualquier computador con Node.js instalado:

```bash
node dist/server.js
```

O simplemente haz doble clic en `dist/Abrir CurvaBarro.bat` (Windows).

---

## Cómo funciona

El trayecto de impresión es la **suma de dos movimientos independientes**:

```
punto_final(s) = línea_central(s)                      ← trayecto global del SVG
               + N(s) · ampN · sin(2π·s/λN + δ)        ← oscilación lateral (normal)
               + T(s) · ampT · sin(2π·s/λT)            ← oscilación adelante/atrás (tangente)
```

- `s` = longitud de arco acumulada a lo largo del camino SVG (en mm)
- `N(s)` = vector normal unitario en `s` (perpendicular al trayecto, apunta a la izquierda del sentido de avance)
- `T(s)` = vector tangente unitario en `s` (sentido de avance)
- Las longitudes de onda (`λN`, `λT`) se miden **sobre el arco**, no sobre un eje recto, por lo que el patrón es consistente sin importar la curvatura del camino
- `δ` (delta) es la diferencia de fase entre N y T — controla la **forma de Lissajous** (0° = línea, 90° = elipse cuando λN = λT, etc.)

La previsualización **Marco del extrusor** en el panel inferior izquierdo muestra únicamente la figura de Lissajous en coordenadas locales (T, N), desacoplada completamente de la forma del trayecto global. Úsala para afinar la figura antes de preocuparte por el camino.

---

## Flujo de uso

### 1. Cargar un SVG

Arrastra un archivo SVG al área de carga o haz clic en ella.

El sistema lee elementos `<path>`, `<polyline>`, `<polygon>`, `<line>`, `<circle>`, `<ellipse>` y `<rect>`.

Si no tienes un archivo a mano, haz clic en **"Cargar SVG de ejemplo"** — incluye una curva en S, una elipse y una línea diagonal.

### 2. Revisar la lista de trayectos

Cada elemento geométrico detectado aparece en la lista **Trayectos SVG**:

- Activa o desactiva trayectos individualmente.
- Sobreescribe la **amplitud** o la **longitud de onda** por trayecto (si lo dejas en blanco, se usa el valor global).

### 3. Ajustar parámetros

#### Panel izquierdo — parámetros de impresión

| Parámetro | Efecto |
|---|---|
| **Espaciado de muestras** | Densidad de muestreo del camino (unidades SVG). Menor valor = onda más suave, más puntos. |
| **Altura de capa** | Incremento Z entre capas apiladas (mm). |
| **Número de capas / Altura total** | Controla cuántas capas se generan. Puedes definirlo por cantidad de capas o por altura total. |
| **Offset Z de boquilla** | Se suma al Z de cada capa (calibración de primera capa). |
| **Z seguro** | Altura a la que se mueve la boquilla durante los desplazamientos entre trayectos. |
| **Factor de escala** | Convierte unidades SVG a mm. Usá `1` si tu SVG está dibujado en mm; `0.2645` para píxeles a 96 dpi. |
| **Origen X / Y** | Desplaza toda la impresión sobre la cama (mm). |
| **Invertir Y** | Espeja el eje Y (el eje Y de SVG crece hacia abajo; la mayoría de las impresoras lo quieren hacia arriba). |
| **Velocidad de impresión / desplazamiento** | mm/min para movimientos de extrusión y de viaje. |
| **Generar valores E** | Incluye la columna E en el G-code. Desactivalo para una salida de solo movimiento. |
| **Multiplicador de extrusión** | Unidades E por mm de desplazamiento. Ajustalo a tu sistema de bomba o tornillo sin fin (típico: 0.02–0.1). |
| **Transición suave entre capas** | Conecta el final de la capa N con el inicio de la capa N+1 con un movimiento continuo (interpola XY con smoothstep y Z linealmente). Sin retracción ni levantamiento — ideal para arcilla. |
| **Longitud de transición** | Longitud en mm del tramo de unión entre capas. |
| **Dirección alternada** | Las capas impares imprimen en sentido inverso, lo que reduce la deriva direccional en arcilla. |
| **Cerrar trayecto** | Agrega un movimiento de regreso al inicio de cada trayecto (útil para elipses y formas cerradas). |
| **Pausa al inicio** | Pausa G4 (ms) en la primera posición de impresión, dándole tiempo a la arcilla para comenzar a fluir. |
| **Movimiento de cebado** | Extrude una línea corta antes de la impresión principal para cebar la boquilla. |

#### Panel derecho — parámetros de Lissajous

| Parámetro | Efecto |
|---|---|
| **Amplitud N** | Semi-amplitud de la oscilación lateral (mm). El trayecto se desvía esta distancia hacia los lados del centro. |
| **Amplitud T** | Semi-amplitud de la oscilación adelante/atrás (mm). |
| **Longitud de onda N / T** | Longitud de arco de un ciclo completo de onda (mm). Se mide sobre la curva. |
| **Delta (δ)** | Diferencia de fase entre N y T. Controla la forma: 0° = línea, 90° = elipse (si λN = λT), valores intermedios = formas de Lissajous. |
| **Offset de fase** | Fase inicial de la onda (radianes). |
| **Desfase de fase por capa** | Fase extra que se suma por cada capa — crea una apariencia helicoidal o en espiral. |

Los **preajustes** en la parte superior del panel derecho aplican configuraciones predefinidas de Lissajous con una miniatura visual de la figura resultante.

### 4. Sistema de keyframes

La barra de línea de tiempo debajo de la previsualización 3D permite **anclar valores de Lissajous en puntos específicos del trayecto**:

1. Mové el slider de la línea de tiempo al punto deseado (0% = inicio, 100% = fin).
2. Ajustá los parámetros de Lissajous al valor que querés en ese punto.
3. Hacé clic en **⊕ KF** para crear un keyframe.
4. Entre keyframes, los valores se interpolan linealmente.

Hacé clic en un keyframe (diamante naranja) para seleccionarlo y editar sus valores. El botón **✕** elimina el keyframe seleccionado; el ícono de papelera elimina todos.

### 5. Previsualización 3D

- **Líneas coloreadas** = trayecto generado, una tonalidad por capa (azul pizarra en la base → terracota en la cima).
- **Líneas punteadas** = transiciones entre capas.
- **Punto animado** = posición del extrusor virtual según la línea de tiempo.
- **Cubo de orientación** (esquina inferior derecha) = muestra los ejes X/Y/Z en tiempo real.

| Control | Acción |
|---|---|
| Arrastrar (botón izquierdo) | Desplazar (pan) |
| Arrastrar (botón derecho) | Rotar (azimut / elevación) |
| Rueda del mouse | Zoom |
| Botón **Ajustar** | Encuadre automático |

### 6. Exportar G-code

Hacé clic en **↓ Descargar .gcode** para guardar el archivo.  
El nombre del archivo coincide con el SVG cargado (ej. `mi-vasija.gcode`).

---

## Estructura del G-code generado

```gcode
; Encabezado con todos los valores de parámetros
G21        ; unidades en mm
G90        ; posicionamiento absoluto
G92 E0     ; resetear extrusión
G1 Z20     ; Z seguro

; --- Capa 1  Z=1.000 ---
G1 X.. Y.. F1500     ; desplazamiento
G1 Z1.000 F1500      ; descenso
G1 X.. Y.. E.. F600  ; impresión
...
```

---

## Geometría de la onda

```
fase    = 2π × arcoLongitud / longitudDeOnda + offsetFase + índiceCapa × desfasePorCapa
offsetN = amplitudN × sin(fase + delta)
offsetT = amplitudT × sin(fase)
punto   = puntoCentral + normal × offsetN + tangente × offsetT
```

- `normal` es el vector perpendicular al trayecto en cada muestra.
- `arcoLongitud` es la distancia acumulada a lo largo de la curva — la longitud de onda siempre se mide sobre el camino, independientemente de su forma.
- Para curvas cerradas (círculos, elipses), la onda cierra sin discontinuidades.

---

## Optimización de desplazamientos

Al cambiar de capa, la herramienta aplica una estrategia **nearest-neighbor** para ordenar los trayectos de forma que minimice la distancia total de los saltos entre ellos. Esto reduce el tiempo de impresión y la cantidad de movimientos que cruzan el área ya impresa.

---

## Limitaciones conocidas

- **Transforms anidadas complejas en SVG**: los transforms simples (traslación, rotación) sobre elementos individuales funcionan bien. Transforms sobre grupos `<g>` profundamente anidados pueden no resolverse completamente.
- **Unidades SVG ≠ mm por defecto**: ajustá el factor de escala según el sistema de coordenadas de tu SVG.
- **Sin retracción**: el G-code generado no incluye movimientos de retracción (la impresión en arcilla raramente los requiere).
- **Modelo de extrusión lineal**: `E += distancia × multiplicador`. Adecuado para extrusoras de arcilla por presión de aire o tornillo sin fin.
- **Sin malla de nivelación de cama**.

---

## Estructura del proyecto

```
src/
  types/index.ts              tipos TypeScript compartidos
  lib/
    svgParser.ts              parseo de SVG y muestreo de trayectos (usa el DOM SVG del navegador)
    waveGenerator.ts          matemática de la onda de Lissajous, apilado de capas y keyframes
    gcodeGenerator.ts         formato de G-code, optimización nearest-neighbor y descarga
  components/
    App.tsx                   estado principal y flujo de datos
    PathParams.tsx            UI de parámetros de impresión (panel izquierdo)
    LissajousParams.tsx       UI de parámetros de Lissajous y preajustes (panel derecho)
    PathList.tsx              lista de trayectos con activación y sobreescritura por trayecto
    Preview2D.tsx             previsualización 3D ortográfica con línea de tiempo y keyframes
    LissajousPreview.tsx      previsualización animada de la figura de Lissajous
    GcodeOutput.tsx           visualización y descarga del G-code
    NumInput.tsx              input numérico con soporte de scroll para cambiar valores
public/
  sample.svg                  archivo de prueba incluido
  logo.png                    logotipo completo
  isotype.png                 isotipo (ícono cuadrado)
  fonts/                      GSCode variable font
dist/
  server.js                   servidor Node.js portátil para uso sin conexión
  Abrir CurvaBarro.bat        lanzador para Windows
```

---

## Tecnologías

- [Vite 5](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript (strict)
- Canvas API para previsualización (sin WebGL)
- Sin dependencias de UI externas — todo el sistema de diseño está en `src/index.css`
