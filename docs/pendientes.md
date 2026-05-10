# Pendientes

Notas abiertas de diseño, fabricación y UI para BarroCode.

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
