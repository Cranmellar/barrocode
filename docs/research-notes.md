# Notas de investigación

Notas abiertas de diseño, fabricación y UI para BarroCode. Ideas en exploración, sin priorizar ni comprometerse a ejecución.

> Para el backlog accionable y priorizado de tickets listos para ejecutar, ver [../pendientes.md](../pendientes.md).

## Interacción Y UI

- Agregar un slider vertical para ubicar un eje/centro en el espacio de trabajo. Ese centro debería poder usarse dentro de keyframes para escalar una curva específica y generar gradaciones de escala a lo largo de la trayectoria.
- Ubicar ese control entre la visualización de Lissajous y el visualizador de G-code, en una columna estrecha del panel inferior.
- Reducir el tamaño del área de carga SVG.
- Aumentar el logo aproximadamente 50%.
- Revisar el peso/valor de la tipografía numérica: bajar ligeramente el negro de los valores principales.

## Visualización

- Ajustar el grosor de línea de la visualización de trayectoria según el zoom del panel.
- Subir levemente saturación y luminosidad de las líneas de trayectoria.
- Colorear keyframes individualmente según su ubicación sobre la trayectoria, reflejando el color del marcador visual correspondiente.
- Revisar los acentos de color de eje N y eje T para que dialoguen mejor con la visualización de Lissajous y el panel de acoplamiento de fase.

## Trayectoria Y Fabricación

- Refinar el movimiento tipo Z-hop antes, durante y después de cruces o autointersecciones por capa, para evitar interrumpir el flujo de arcilla.
- Explorar una versión 2 donde un plano normal a cada vector de dirección de trayectoria sea el lugar donde se evalúa y desplaza cada Lissajous. Eso permitiría una trayectoria helicoidal no plana entre capas y suavizaría el tránsito vertical.
- **Costura en el punto más cercano al inicio (pospuesto).** Hoy la costura de una ruta cerrada es la primera muestra del SVG (donde se empezó a dibujar) y `nearestNeighbourOrder` solo elige qué ruta va primero, midiendo hasta su inicio, así que el primer viaje puede cruzar la pieza en planta. Idea: rotar cada ruta cerrada para que empiece en la muestra más cercana a la posición real de la boquilla (fin de la línea de cebado, o el 0,0 de la máquina; hoy el código usa `originX/originY`). El segmento hasta el punto más cercano nunca corta la curva, sea convexa o no. Con varias rutas, voraz en la capa 0, tomando cada costura como nueva referencia; en rutas abiertas solo elegir el extremo más cercano. Decidir la costura una vez para todas las capas (la rampa de costura y el suelo de Z comparan la misma muestra entre capas) y rotar en `generateWaveLayers` antes de la onda, para que el salto de fase de la onda coincida con la costura en lugar de quedar a mitad del perímetro. Medir en mm tras `applyTransformSVG` + `svgToMM`. Pendiente de decidir: la costura quedaría siempre en la esquina delantera izquierda, a la vista; ofrecerla como opción en *Trayecto* y quizá un ángulo de costura.
