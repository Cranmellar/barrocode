# Plan de mejora de performance

Este plan deja solo las acciones con mayor impacto visible para BarroCode. El
criterio principal no es que todo termine mas rapido, sino que la app se sienta
fluida mientras el usuario crea, rota, ajusta keyframes y reposa la figura antes
de exportar.

## Enfoque

El G-code no debe conducir la optimizacion inicial. Como vive en otra pestana y
el usuario probablemente revisa/reposa la figura antes de exportarla, puede
tardar bastante mas que el preview sin danar la experiencia principal.

La prioridad real es:

1. Camara fluida: rotar, panear y hacer zoom sin bloqueo.
2. Edicion fluida: sliders, parametros y keyframes responden rapido.
3. Preview confiable: al detener la interaccion vuelve el detalle completo.
4. Export correcto: el G-code puede ser diferido, pero debe ser exacto.

## Diagnostico corto

Los cuellos de botella mas importantes estan en el preview:

- `Preview2D` recalcula datos grandes durante el dibujo.
- Cada movimiento de camara puede disparar mucho trabajo de canvas.
- Se crean muchos arrays/objetos temporales en rutas calientes.
- Algunos parametros recalculan mas de lo necesario.

El G-code tambien es costoso, pero no es el primer problema de UX mientras se
mantenga fuera del camino de la interaccion principal.

## Prioridades

### P0 - Medir lo minimo necesario

Impacto: alto. Riesgo: bajo.

Agregar medicion de desarrollo solo para saber donde duele realmente:

- `generateWaveLayers`;
- construccion de geometria de preview;
- draw de `Preview2D`;
- `generateGcode`, solo como referencia de export.

Implementacion:

- Crear `src/lib/perf.ts` con helpers chicos.
- Usar `performance.now()`.
- Loguear solo en desarrollo.

Definition of done:

- Hay tiempos comparables para 6, 60 y 150 layers.
- No cambia la UI ni la salida de fabricacion.

### P1 - Cachear el modelo de preview

Impacto: muy alto. Riesgo: medio.

Este es el cambio mas importante. El preview debe dibujar desde una estructura
ya preparada, no reconstruir conversiones, bounds, arcos y crossings en cada
redraw.

Implementacion:

- Crear `src/lib/previewModel.ts`.
- Derivar desde `layers` un modelo listo para canvas:
  - puntos convertidos a mm;
  - bounds globales y por layer;
  - rangos por path;
  - arc length por punto;
  - crossings de z-hop cuando aplique;
  - version decimada para interaccion.
- Reemplazar en `Preview2D` los calculos repetidos por lecturas del modelo.

Dependencias que reconstruyen el modelo:

- `layers`;
- `scaleFactor`;
- `originX`;
- `originY`;
- `flipY`;
- `zHopHeight`;
- `viewBox.height`.

Definition of done:

- Rotar/panear ya no recalcula conversion SVG a mm ni arcos.
- `fitView`, marcador de extrusor y keyframes usan el modelo cacheado.
- El preview en reposo se ve igual que antes.

### P2 - Modo interactivo liviano

Impacto: muy alto. Riesgo: medio.

Mientras el usuario arrastra o usa la rueda, la app debe priorizar continuidad.
Puede mostrar menos detalle durante 100-150 ms y restaurar full quality al
quedar quieta.

Implementacion:

- Agregar `isInteracting` como ref/estado.
- Usar `requestAnimationFrame` para agrupar cambios de camara.
- Dibujar puntos decimados durante drag/wheel.
- Durante interaccion, ocultar o simplificar:
  - travel/skirt auxiliar;
  - etiquetas densas;
  - overlays no esenciales.
- Restaurar full quality cuando termina la interaccion.

Definition of done:

- Con 60+ layers, la camara se siente continua.
- Durante drag puede verse simplificado, pero estable.
- Al soltar, vuelve el detalle completo sin accion extra.

### P3 - Separar invalidaciones criticas

Impacto: alto. Riesgo: medio.

No todo cambio debe regenerar todo. Separar que parametros afectan el modelo de
onda, el preview y el export evita trabajo innecesario.

Implementacion:

- Crear dependencias explicitas para:
  - parseo SVG;
  - `generateWaveLayers`;
  - `PreviewModel`;
  - export G-code.
- Evitar que parametros solo-export reconstruyan layers o preview.
- Evitar que timeline/camara disparen trabajo de modelo.

Definition of done:

- Cambiar velocidad, extrusion, priming o safe Z no recalcula wave layers.
- Mover timeline/camara no recalcula layers ni G-code.
- Sliders visuales actualizan preview sin bloquearse con export.

### P4 - G-code diferido, no urgente

Impacto: medio. Riesgo: bajo.

El G-code puede tardar. Lo importante es que no bloquee la creacion de la
figura. No hace falta moverlo a Worker al inicio salvo que las mediciones lo
justifiquen.

Implementacion:

- Mantener o ampliar debounce de export.
- Generar G-code solo cuando el usuario esta en la pestana de G-code o despues
  de una pausa larga.
- Usar `jobId` para ignorar resultados viejos si hay cambios mientras se genera.
- Mostrar estado simple: pendiente/generando/listo.

Definition of done:

- La pestana de preview sigue fluida aunque el G-code este pendiente.
- El G-code final coincide con la salida actual para el mismo input.
- No se muestra un resultado viejo despues de cambios nuevos.

## Orden recomendado

### Sprint 1 - Mayor impacto inmediato

1. P0 - Medicion minima.
2. P1 - `PreviewModel` cacheado.

Resultado esperado: el preview deja de rehacer trabajo pesado en cada movimiento
de camara.

### Sprint 2 - Sensacion de fluidez

1. P2 - Modo interactivo liviano.
2. Ajustes puntuales de allocations dentro del nuevo `PreviewModel`.

Resultado esperado: pan, zoom y rotacion se mantienen suaves incluso con mas
layers.

### Sprint 3 - Evitar trabajo innecesario

1. P3 - Separar invalidaciones criticas.
2. Revalidar sliders, keyframes y parametros de export.

Resultado esperado: editar la figura no dispara export ni recomputos ajenos.

### Sprint 4 - Export comodo

1. P4 - G-code diferido.
2. Worker solo si la medicion demuestra congelamiento real en export.

Resultado esperado: export correcto, tolerante a demora, sin bloquear creacion.

## Checklist de validacion

Probar con:

- muestra por defecto, 6 layers;
- muestra por defecto, 60 layers;
- muestra por defecto, 150 layers;
- SVG con path largo;
- SVG con muchos paths;
- keyframes activos;
- z-hop activo;
- soft join activo e inactivo.

Validar:

- pan, zoom y rotacion;
- ajuste automatico de vista;
- timeline y marcador de extrusor;
- seleccion y drag de keyframes;
- edicion de parametros principales;
- G-code correcto al abrir/exportar;
- `npm run build`.

## Primera tarea recomendada

```text
perf(preview): cache canvas preview model
```

Archivos probables:

- `src/lib/previewModel.ts`
- `src/components/Preview2D.tsx`
- `src/lib/perf.ts`

No debe cambiar:

- formato ni contenido de G-code;
- semantica de `generateWaveLayers`;
- comportamiento final del preview en reposo.
