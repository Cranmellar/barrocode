# Muestras y lectura de piezas: plan de trabajo

Fecha: 2026-11-06 · base: `main` @ `5a08c63` · estado: propuesta. Nada está decidido. Decisiones en la sección 7.

Este documento ordena cómo pasar de imprimir piezas sueltas a un ciclo: diseñar, imprimir, medir, interpretar y cambiar el programa. Y cómo leer los proyectos que mandan otros usuarios para ver de qué modos se usa barrocode.

---

## 1. El ciclo

```text
proyecto (.barrocode.json) ─▶ G-code ─▶ impresión ─▶ pieza
      ▲                                                │
      │                                       medidas, fotos, ficha
      │                                                │
   cambio en barrocode ◀── hallazgo ◀── lectura (sesión con Claude)
```

Cada vuelta deja tres cosas: una muestra registrada, un hallazgo escrito y, a veces, un cambio en el programa. El vocabulario formal crece con lo que las piezas demuestran que se puede imprimir, no con lo que se imagina en pantalla.

Una condición de base: Claude no recuerda entre sesiones. La memoria del diálogo tiene que estar escrita en archivos (fichas, bitácora, `fabrication-notes.md`, `pendientes.md`). Lo que no queda escrito se pierde.

## 2. Qué hay hoy y qué falta

| Qué | Hoy | Falta |
|---|---|---|
| Diseño | El `.barrocode.json` guarda SVG, parámetros, keyframes, rutas, forma y máquina (`lib/project.ts`) | Con qué versión de barrocode se hizo y cuándo. El pipeline cambia (esquinas, costura): el mismo proyecto puede dar otro G-code meses después |
| Lo que fue a la máquina | El encabezado del G-code lista cada parámetro y la caja | Un vínculo con el proyecto y la versión. El G-code impreso no se guarda en ningún lado |
| La pieza | Nada | Material, condiciones, resultado, medidas, fotos, si cumple su función |
| Comparar proyectos | Abrirlos uno por uno en la app | Una tabla con las mismas métricas para todos, y un diff de parámetros entre dos |
| Pendientes de comprobar en una impresión | Lista en CLAUDE.md (*Check on real machines*): cruces con salto Z, muros, cola de la capa 0, E con onda Z | Piezas de prueba diseñadas para zanjar cada uno |

## 3. Las partes del plan

### A. Registro de muestras

Una carpeta por pieza impresa:

```text
muestras/
  M-001-lobulos-onda-z/
    proyecto.barrocode.json
    impreso.gcode.gz          el G-code que fue a la máquina
    ficha.md
    fotos/frente.jpg  planta.jpg  iso.jpg  costura.jpg  cruce.jpg
  usuarios/
    2026-11-ana-jarron.barrocode.json   proyectos recibidos, sin impresión
  bitacora.md                lo que se leyó en cada sesión
```

La ficha es Markdown con un bloque de datos al inicio, para que se lea en GitHub y se procese con un script:

```yaml
id: M-001
fecha: 2026-11-10
autor: Cristián
proyecto: proyecto.barrocode.json
maquina: (perfil y cambios a mano)
pasta: (nombre, chamota, % de agua o consistencia)
boquilla_mm: 4
multiplicador_real: 1.0
resultado: completa | colapsó | deformada | se rompió al secar | se rompió en cocción
falla_en_capa: null
medidas_mm: { alto: , ancho_x: , ancho_y: , muro: }
peso_g: { humedo: , seco: , cocido: }
funcion: (qué tenía que lograr: contener, apoyar, que la onda se lea, que las crestas se apilen)
cumple: si | parcial | no
```

Debajo, texto libre: qué se vio durante la impresión, intervenciones a mano, qué sorprendió.

Fotos estándar, para comparar piezas entre sí y con la vista 3D: frente, planta e isométrica (las mismas tres vistas de la barra superior), más un detalle de costura y uno de cruce si los hay. Con una regla en cuadro y fondo neutro, a la misma distancia. Con la regla se pueden estimar medidas desde la foto; sin ella, solo proporciones.

### B. Trazabilidad

Un cambio chico en el código:

- `vite.config.ts` inyecta el commit y la fecha del build (en GitHub Actions, `GITHUB_SHA`).
- El `.barrocode.json` guarda `app: { commit, guardado }`. `parseProject` lo lee y lo ignora si falta.
- El encabezado del G-code escribe la misma versión y el nombre del proyecto.

Con eso, cada muestra dice con qué código se hizo, y el análisis puede regenerar el G-code con esa versión o con la actual y mostrar qué cambió.

### C. Proyectos como archivos

Un script en barrocode, `npm run analizar -- <carpeta>`, que pasa cada proyecto por el pipeline real y escribe una tabla (CSV y JSON). Corre en Chromium con Playwright, porque `parseSVG` necesita el DOM para medir. Es el mismo arnés que pide el paso 4 de *Next steps* (tests de `svgParser`), así que sirve dos veces.

Métricas por proyecto:

| Grupo | Métricas |
|---|---|
| Tamaño | Caja X/Y/Z, alto, número de capas, altura de capa |
| Proceso | Tiempo, largo impreso, E total, largo de viajes, número de saltos sobre cruces |
| Onda | Amplitudes y longitudes N/T/Z, ciclos por vuelta, pendiente de la onda (amplitud / longitud), radio de esquina aplicado, largo perdido en puntas |
| Riesgo | Hueco máximo con la capa de abajo (`MAX_LAYER_GAP`), avisos de `checkMachine`, desplazamiento máximo de una capa sobre la anterior (voladizo, A0 de `altura-plan.md`), giro total |
| Uso | Keyframes (cuántos, qué campos varían), familia de *Forma*, muros, transición suave, campos distintos del valor por defecto |

Además:

- `--diff a.json b.json`: los parámetros que cambian entre dos proyectos.
- Vistas Iso, Planta y Frente de cada proyecto como PNG, para ponerlas junto a las fotos.

Con las fichas, la tabla suma lo medido: alto real contra alto diseñado (contracción, asentamiento), resultado y falla por capa.

### D. Sesiones de lectura

Una sesión con Claude cada vez que hay muestras nuevas:

1. Subes las carpetas nuevas al repositorio de muestras.
2. Abres una sesión con barrocode y ese repositorio: "lee M-004 a M-007".
3. Claude corre el análisis, lee fichas y fotos, compara lo medido con lo diseñado y con muestras parecidas.
4. Claude escribe en `bitacora.md`: observaciones, hipótesis y qué pieza de prueba zanjaría cada una.
5. Lo que queda firme pasa a barrocode: un criterio a `fabrication-notes.md`, un ticket a `pendientes.md` citando las muestras (`M-004`, `M-006`), un ítem tachado en *Check on real machines*.
6. Tú decides qué tickets entran y en qué orden.

### E. Del hallazgo al programa

Cada hallazgo cae en una de cinco clases, y cada clase tiene su destino:

| Clase | Ejemplo | Destino |
|---|---|---|
| El G-code no hace lo que muestra la vista | Doble cordón en los cruces | Bug, primero en la cola |
| Límite de la arcilla que la app no avisa | La pieza colapsa con giro mayor a X° por capa | Un aviso en la revisión (`MachineCheck.part`) |
| Calibración | La pasta A pide multiplicador 1,3 | Perfil de máquina, o un perfil de pasta si se repite |
| Vocabulario | Quiero puntas agudas que no se redondeen | Feature: `altura-plan.md`, no planaridad (NP), atenuar la onda en puntas |
| Uso | Nadie toca la fase; todos suben la amplitud al máximo | Valores por defecto, presets, orden de los controles |

### F. Modos de uso

Los proyectos de otros usuarios no traen pieza, pero dicen cómo se usa la app. Pasados por el mismo análisis muestran qué controles se mueven y cuáles nunca, qué rangos se usan, qué funciones nadie descubre y dónde se topan con los límites (`MAX_LAYERS`, amplitudes extremas). Cuando un usuario manda también fotos de su pieza, entra a `muestras/` con su ficha.

## 4. Piezas de prueba

Cada hipótesis abierta pide una pieza chica que cambie una sola cosa. Claude puede generar los proyectos (`.barrocode.json`) listos para abrir e imprimir.

| Pieza | Qué zanja | Diseño |
|---|---|---|
| P1 Cruce | Si el salto Z acumula arcilla (paso 1 de *Correctness*) | Un ocho, 20 capas, mitad con salto y mitad sin |
| P2 Muro | Si las pasadas de muro se unen | Cilindro con 1, 2 y 3 pasadas |
| P3 Costura | La cola de la capa 0 con transición suave | Cilindro bajo, foto de la costura |
| P4 Onda Z | Si E necesita escalar por el hueco (paso 2) | Cilindro con onda Z y desfase por capa |
| P5 Puntas | Redondear o atenuar la onda en una punta | Estrella de 5 puntas de 30° |
| P6 Matriz de onda | Dónde se apilan las crestas y dónde se cae el muro | Grilla de cilindros chicos: amplitud N × longitud de onda |

P6 es la de más alcance para el vocabulario: dibuja el mapa de lo imprimible con una pasta y una boquilla. Ese mapa puede volver a la app como un aviso o como el borde de los sliders.

## 5. Fases

| Fase | Qué | Esfuerzo |
|---|---|---|
| M0 | Sello de versión en proyecto y G-code (B). Plantilla de ficha. Repositorio de muestras creado | Una sesión |
| M1 | Script de análisis, diff y vistas PNG (C) | Una o dos sesiones |
| M2 | Proyectos P1–P6. Imprimes. Primera sesión de lectura con las piezas que ya tienes | Lo que tarden las impresiones |
| M3 | Corpus de usuarios y modos de uso (F). Quizá notas de impresión dentro del proyecto (D-M3) | Una sesión, luego continuo |
| M4 | El ciclo en régimen: cada tanda de muestras, una sesión de lectura | Continuo |

M0 y M1 no dependen de imprimir nada. M2 sí. Las piezas que ya tienes pueden entrar a M2 aunque no tengan G-code guardado: el proyecto basta si se sabe con qué día se imprimió.

## 6. Qué hace cada uno

Tú: imprimir, medir, fotografiar, llenar la ficha, decidir qué entra al programa y pedir permiso a los usuarios.

Claude: diseñar las piezas de prueba, correr el análisis, leer fichas y fotos, escribir la bitácora, proponer tickets con evidencia, implementar lo que decidas. Puede ver fotos y comparar proporciones con la vista 3D; medidas finas, solo con regla en cuadro.

## 7. Decisiones

- **D-M1. Dónde viven las muestras.** (a) Un repositorio privado aparte, `barrocode-muestras` (recomendado: las fotos pesan, el trabajo de los usuarios queda privado y el deploy no lo toca; se agrega a cada sesión). (b) Una carpeta en barrocode. (c) Una carpeta en Drive, que Claude no puede leer directamente.
- **D-M2. Qué tan estructurada es la ficha.** Recomendado: los campos de la sección 3A obligatorios, el resto libre. Más campos se agregan cuando falten en una lectura.
- **D-M3. Notas de impresión dentro del `.barrocode.json`.** Un bloque `impresiones: []` que la app deja llenar en *Proyecto*. Así un usuario manda diseño y resultado en un solo archivo. Costo: UI nueva. Recomendado: esperar a M3 y ver si la ficha aparte alcanza.
- **D-M4. Permiso de los usuarios.** Qué se puede guardar, citar en la bitácora o mostrar. Recomendado: preguntar al recibir y anotar la respuesta en el nombre de la carpeta o en la ficha.
- **D-M5. Guardar el G-code impreso.** Recomendado sí, comprimido: es lo único que dice con certeza qué hizo la máquina.
