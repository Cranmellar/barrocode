# Arquitectura

BarroCode está organizado como una app React/Vite con lógica geométrica en `src/lib` y componentes de interacción en `src/components`.

## Pipeline

```mermaid
flowchart TD
  subgraph Entrada
    SVG["SVG raw"]
    Params["PrintParams"]
    Kf["WaveKeyframe[]"]
  end

  SVG --> Parse["parseSVG"]
  Parse --> Sample["SampledPath[]"]
  Sample --> Wave["generateWaveLayers"]
  Params --> Wave
  Kf --> Wave
  Wave --> Layers["WaveLayer[]"]
  Layers --> Preview["Preview2D"]
  Layers --> Gcode["generateGcode"]
  Params --> Gcode
  Gcode --> Out["texto .gcode"]
```

## Responsabilidades

```mermaid
flowchart TB
  App["App.tsx<br/>estado, carga de archivos, recomputación"] --> UI["Componentes UI"]
  App --> Lib["Lógica geométrica"]

  UI --> PathParams["PathParams<br/>impresión y arcilla"]
  UI --> LissParams["LissajousParams<br/>onda y presets"]
  UI --> PathList["PathList<br/>overrides por trayecto"]
  UI --> Preview["Preview2D<br/>canvas, timeline, keyframes"]
  UI --> GOut["GcodeOutput<br/>texto y descarga"]

  Lib --> Parser["svgParser.ts<br/>parseo y muestreo"]
  Lib --> Wave["waveGenerator.ts<br/>Lissajous y capas"]
  Lib --> Gcode["gcodeGenerator.ts<br/>salida CNC"]
  Gcode --> Hop["hopUtils.ts<br/>cruces y Z-hop"]
  Gcode --> Skirt["skirtUtils.ts<br/>viajes concéntricos"]
```

## SVG Parser

`svgParser.ts` usa `DOMParser` y luego inserta el SVG en un contenedor oculto. Esto permite usar `SVGGeometryElement.getTotalLength()` y `getPointAtLength()` del navegador.

El muestreo produce `SampledPoint`:

```text
x, y
tangentX, tangentY
normalX, normalY
arcLength
```

La tangente se calcula con diferencias finitas y la normal se deriva rotando la tangente 90 grados.

## Generador De Onda

`waveGenerator.ts` evalúa una figura de Lissajous en el marco local del extrusor:

```text
phaseN = 2π * s / wlN + delta + phaseBase
phaseT = 2π * s / wlT + phaseBase
offsetN = ampN * sin(phaseN)
offsetT = ampT * sin(phaseT)
point = centerline + normal * offsetN + tangent * offsetT
```

También aplica:

- dirección alternada por capa;
- cierre opcional de trayectos;
- interpolación de keyframes;
- centro y escala por keyframe;
- conversión de SVG a mm mediante `svgToMM`.

## Generador De G-code

`gcodeGenerator.ts` recibe `WaveLayer[]` y produce G-code textual.

```mermaid
flowchart TD
  A["WaveLayer[]"] --> B["Ordenar paths por nearest-neighbor"]
  B --> C["Calcular centroides por capa"]
  C --> D["Detectar cruces si zHopHeight > 0"]
  D --> E["Emitir movimientos G1"]
  E --> F{"softJoin"}
  F -- "sí" --> G["Interpolar XY/Z entre capas"]
  F -- "no" --> H["Viaje con skirt arc o salto corto"]
  G --> I["Archivo .gcode"]
  H --> I
```

El modelo de extrusión es lineal:

```text
E += distancia * extrusionMultiplier
```

Si `generateE` está desactivado, la salida conserva movimientos pero omite la columna `E`.

## Vista Canvas

`Preview2D.tsx` dibuja una proyección ortográfica 3D en Canvas. La escala, rotación, pan y keyframes viven en estado local del componente, mientras las capas generadas llegan desde `App.tsx`.

La vista muestra:

- grilla base;
- capas coloreadas;
- línea de centro/escala;
- keyframes;
- posición virtual del extrusor;
- viajes entre trayectos;
- cubo de orientación.
