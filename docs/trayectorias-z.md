# Trayectorias que varían en Z: referentes y propuestas

Investigación de noviembre de 2026. Busca referentes de trayectorias que suben y bajan dentro de la capa, hacen bucles, arcos o espirales, o tejen, y propone cómo llevar eso a barrocode. Nada de esto está comprometido. Lo que se concrete pasa a [../pendientes.md](../pendientes.md).

Complementa [marco-teorico.md](marco-teorico.md) (sección 6, *El accidente programado*), que ya cita a Chiu-Webster y Lister, Ribe, Emerging Objects, van Herpt y Keep.

## 1. Referentes

Agrupados por mecanismo, no por autor: lo que interesa es qué variable produce la forma.

### El material dibuja: enrollamiento y caída

Tres variables deciden lo que hace un cordón blando al caer: la altura de la boquilla sobre lo impreso, la velocidad de avance y el caudal. Con la boquilla alta y avance lento el cordón se dobla, se enrolla o serpentea solo.

- **Jawed, Brun y Reis (2015)**, sobre un hilo depositado en una superficie que se mueve. Al bajar la velocidad de avance frente a la de salida aparecen, en orden, meandros, bucles alternados y espirales trasladadas. Es la "máquina de coser" de Chiu-Webster y Lister puesta en números. **Brun et al., "The molten glass sewing machine" (*Phil. Trans. R. Soc. A*, 2017)** lo lleva a una impresora de vidrio con la boquilla alta a propósito.
- **Yuk y Zhao, *Advanced Materials* (2018)**, MIT. Un diagrama de fases de altura de boquilla contra velocidad. Con una sola boquilla y un solo recorrido sacan acumulación, espiral trasladada, espiral alternada, meandro, adelgazamiento y cordón cortado, cambiando solo esas dos variables.
- **Takahashi y Miyashita, "Expressive Fused Deposition Modeling by Controlling Extruder Height and Extrusion Amount" (CHI 2017).** Envolventes en el tiempo para la altura y el caudal; la sobreextrusión como patrón en la pared.
- **Alberts, Nachtigall, Doubrovski y Saakes, "From Dribbling Honey to Non-planar 3D-Printing: Coiling Becomes Craft" (DIS 2024).** El enrollamiento como oficio: texturas y estructuras textiles con trayectorias no planas.
- **Emerging Objects, *GCODE.Clay*.** Superficies que parecen tejidas, enhebradas o rizadas porque el barro cuelga y se dobla.
- **"Clay 3D Printing in Whoville" (Instructables).** Tazas de barro con bucles sueltos (*gloops*) usados como textura. Muestra que el barro de impresión sí se enrolla.

### El error como patrón

- **Olivier van Herpt y Ricky van Broekhoven, *Solid Vibration* (2016).** La resonancia del motor dejaba un moiré en las piezas; en vez de corregirlo pusieron un parlante bajo la cama. Las texturas parecen tejido de punto.
- **Jack Forman, *DefeXtiles* (UIST 2020).** Subextrusión periódica: glóbulos unidos por hilos finos, una tela casi tejida con una impresora corriente.
- **OrcaSlicer, *fuzzy skin*.** Seis tipos de ruido: clásico, Perlin, *billow*, *ridged multifractal*, Voronoi y *ripple*. Un vocabulario práctico de ruido controlado, con tamaño, octavas y persistencia.

### Tejer con la trayectoria

- **Friedman, Kim y Mesa, "Woven Clay" (ACADIA 2014).** Un robot teje cordones de barro de media pulgada en paneles de 45 × 45 cm.
- **Kleibel-McGee, Gosch, Jauk, Ristoski y Stavric, "Integration of Weaving- and Sewing-Motions into the 3D Printing of Clay for Lightweight Ceramic-Structures" (ASCAAD 2024).** Movimientos de tejido y costura en la trayectoria; paneles con densidad del 73 al 100 %. Sigue en **Wagiri, Shih, Jauk y Stavric, "Continuous Clay" (2026)**. Del mismo grupo, **Jauk et al., "Filament-Reinforced 3D Printing of Clay" (*Materials*, 2023)**: puentes 4,6 veces más largos.
- **Rosenwasser, "Clay Non-Wovens" (ACADIA 2017).** Extrusión robótica de barro sobre moldes, como un no tejido.
- **Hand and Machine Lab (Leah Buechley, UNM).** *WeaveSlicer*: trayectorias continuas sin soporte que dan un aspecto tejido y aguantan voladizos más inclinados; librería Python abierta. *Extruder Turtle* (Pezzuti Dyer y Buechley, TEI 2022): G-code con geometría tortuga, texturas, bucles y bultos en barro; *SpiralCup* de Deanna Gelosi lo usa con bultos paramétricos.
- **Takahashi y Kim, "3D Printed Fabric" (UIST 2019).** Pilares verticales (urdimbre) con una trama que se teje entre ellos.
- **BrickLayers (GeekDetour, 2025).** Postproceso que sube media capa los perímetros alternos: quedan trabados como ladrillos y la pared ondula. Hay una patente europea citada en los foros (EP4094924).

### Sin capas: trayectorias en el espacio

- **Mueller et al., *WirePrint* (UIST 2014).** Zigzag en el aire entre contornos horizontales.
- **AlOthman, Im, Jung y Bechthold, "Spatial Print Trajectory" (Rob|Arch 2018).** Retículas de barro autoportantes, sin capas, con maniobras de "anclar y arrastrar" y la velocidad controlando la caída del cordón. **Im, AlOthman y García del Castillo, "Responsive Spatial Print" (ACADIA 2018)** añade un láser que mide la flecha de cada tramo y recalcula los siguientes.
- **Andrew Gleadall, *FullControl* (*Additive Manufacturing* 46, 2021).** Diseño directo de la trayectoria, sin slicer: zigzags no planos, voladizos sin soporte, texturas de onda. Es el referente más cercano a barrocode en filosofía.
- **Silkworm** (Grasshopper). Más o menos extrusión por tramo; espirales continuas con grosor y velocidad variables.
- **Ahlers et al., "3D Printing of Nonplanar Layers for Smooth Surface Generation" (CASE 2019).** Capas no planas para superficies lisas. Menos expresivo, pero es la base técnica de la no planaridad en impresoras de tres ejes.

## 2. Qué limita hoy la Z en barrocode

Leído en `src/lib/waveGenerator.ts`.

- **Una sola senoide.** `zOffset = ampZ · sin(cycZ + phaseZ + phaseBase)`, con su propio largo de onda. No hay arcos, pulsos ni ruido.
- **El desfase por capa también corre la Z.** `phaseBase` incluye `phaseShiftPerLayer`, así que si la textura gira entre capas, la onda Z gira igual. El hueco con la capa de abajo pasa a ser `h ± 2 · ampZ · sin(Δφ / 2)`. Con capa de 1,5 mm, amplitud Z de 1 mm y 90° por capa, va de 0,09 a 2,91 mm.
- **El suelo se come la onda.** Cada punto queda al menos `0,5 · h` sobre la misma muestra de la capa de abajo (`MIN_LAYER_GAP`). En el ejemplo anterior corta todos los valles: la onda grande no se ve. La capa 0 tampoco baja de su altura, así que pierde media onda.
- **E y velocidad no siguen la Z.** E depende solo de la distancia y la velocidad es una por capa. La boquilla no puede levantarse para dejar caer el cordón, ni frenar para amontonarlo.
- **El z-hop solo levanta.** En un cruce sigue extruyendo (*Correctness* 1 en CLAUDE.md).

En corto: barrocode ya mueve la Z, pero solo como una ondulación suave y paralela entre capas. Para bucles, arcos y tejido hacen falta tres cosas: que la Z pueda ir en sincronía con la onda en planta, que E y velocidad varíen por punto, y que el suelo sepa qué hay debajo.

## 3. Propuestas

Por impacto ÷ esfuerzo. Las dos primeras son casi gratis porque la matemática ya está.

### Z1. Desfase por capa propio para Z

Un `phaseShiftZPerLayer` (o un interruptor *La Z gira con la capa*) separado del de N y T. Con 0, la textura en planta puede girar en hélice mientras la onda Z queda alineada entre capas: toda la pared ondula con amplitud grande, sin tocar el suelo. Con un valor pequeño, la ondulación sube en diagonal por la pieza.

Esfuerzo bajo: un campo en `PrintParams`, `WAVE_PARAMS`, el keyframe, el encabezado del G-code y un control en el panel *Onda*. `paramDeps.test.ts` avisa si falta algo.

### Z2. Puntada: Z sincronizada con T

Cuando la onda T es grande (`ampT · 2π / wlT > 1`) la boquilla retrocede en cada ciclo y dibuja un rizo en planta. Si la Z va al mismo ritmo, con la cresta en el tramo de retroceso (fase Z −90° respecto de T), el rizo pasa por encima de sí mismo como una puntada de crochet. Es la versión programada de los bucles de Yuk y Zhao, sin depender de la física.

Hoy se puede a mano poniendo `wlZ = wlT`, pero se pierde al editar o con keyframes. Propuesta: un interruptor *Z sigue a T* que fuerza el mismo largo de onda y ajuste de ciclos en rutas cerradas, y un preset *Puntada*. Revisar que el z-hop no duplique el levantamiento en esos cruces. Esfuerzo bajo.

### Z3. Zonas de caída: enrollamiento programado

El accidente programado en sentido estricto. Cada `L` mm de recorrido, un tramo de largo `w` donde la boquilla sube `H` sobre el cordón (con entrada y salida suaves), frena y mantiene o aumenta el caudal. El barro cae y se enrolla o serpentea solo; entre zonas imprime normal. Con un desfase por capa las zonas se alternan como ladrillos.

Parámetros, en lenguaje de la pieza: *altura de caída* (mm), *largo de zona*, *separación*, *desfase por capa* y una *razón de avance* (velocidad de la boquilla dividida por la velocidad de salida del cordón, `Q / (π d² / 4)`). Esa razón es la variable que ordena los patrones en Jawed, Brun y Reis: cerca de 1 meandros, más baja bucles, mucho más baja espirales.

Requiere un factor de E y de velocidad por punto en la trayectoria (`ToolpathLayer`), que también resuelve *Correctness* 2 de CLAUDE.md (E según el grosor real del cordón): conviene construirlo una vez para ambos. La capa siguiente debe pasar sobre el montón, cuya altura no se conoce hasta probar: empezar con zonas en capas alternas y una altura de montón medida. El visor no puede simular el enrollamiento; marcar las zonas con un trazo grueso basta. Esfuerzo medio. Impacto alto, pero solo se sabe imprimiendo (ver sección 4).

### Z4. Ruido con semilla en Z y N

Ruido coherente en dos dimensiones (largo de arco × capa), con semilla, para que el "accidente" se repita igual cada vez. Tipos como los de Orca: Perlin para bultos suaves, *ridged* para crestas, celdas Voronoi para elementos que se repiten sin ser idénticos. Amplitud, tamaño y semilla; la amplitud keyframeable. El suelo de Z ya existe y lo contiene.

Es el "parámetro de desorden con semilla" de *marco-teorico.md*, extendido a Z. Esfuerzo bajo a medio. Ojo con el ajuste de ciclos en rutas cerradas: el ruido debe ser periódico en el perímetro o la costura salta.

### Z5. Hebras: trenza y tejido sobre-bajo

Extender *Muro* (`wallPasses`) para que cada pasada tenga su propio desfase en N y en Z. Dos pasadas con N opuesta se cruzan en planta; con Z también opuesta, en cada cruce una va arriba y la otra abajo, alternando: una trenza real. Con tres o más pasadas a `2π/k`, una trenza de k hebras. Es lo que hacen a mano *Woven Clay* y Kleibel-McGee et al.

Hoy todas las pasadas comparten la Z de la línea central (`waveGenerator.ts`, el `pass` reutiliza `zOffset`). Hace falta Z por pasada, un suelo que mire lo más alto debajo en planta y no la misma muestra, desactivar el z-hop en los cruces diseñados y bajar E en ellos. Esfuerzo medio a alto; es el que más se parece a "tejido".

Variante barata dentro de lo mismo: **medio paso alterno** (BrickLayers). La pasada j sube `h/2 · (j mod 2)`, con la primera capa a media altura. Pared trabada y una ondulación horizontal.

### Z6. Altura de capa variable por capa

Una onda lenta en la altura: capas gruesas y finas que forman bandas horizontales. Necesita que E siga a la altura local (el mismo factor por punto de Z3). Esfuerzo bajo una vez hecho Z3.

### Más adelante

- **Puentes y tramos en el aire** (*Spatial Print Trajectory*, *WirePrint*): dejar que un tramo cuelgue entre dos apoyos. Requiere relajar el suelo y controlar la velocidad por tramo. Riesgo alto.
- **Espiral continua** (NP-1, ya en el backlog): sin costura, la hélice es la base natural para bucles que no se interrumpen.
- **Dejar los bucles de esquina** en vez de redondearlos (ya en *marco-teorico.md*).

## 4. Pruebas que lo deciden

Para la serie de muestras de [muestras-plan.md](muestras-plan.md). Cada una es un cilindro de 8 cm, 30 capas.

1. **Puntada (Z2).** T con rizos (`ampT · 2π / wlT ≈ 1,5`), Z sincronizada a 0,5 · h, 1 · h y 1,5 · h. ¿El rizo queda arriba o se aplasta?
2. **Grilla de caída (Z3).** Altura de caída 2, 4, 6 y 8 mm contra razón de avance 0,8, 0,5 y 0,3, una zona por combinación en la misma pieza. Fotografiar cada zona de frente y de lado.
3. **Z alineada (Z1).** Amplitud Z de 2, 4 y 6 mm con la textura en planta girando 90° por capa. ¿Dónde se cae la pared?
4. **Trenza (Z5).** Dos hebras, N y Z opuestas, con y sin E reducida en los cruces.

## Fuentes

- Jawed, Brun y Reis, modelo geométrico del enrollamiento sobre un sustrato en movimiento (2015): [PDF](https://www.epfl.ch/labs/flexlab/wp-content/uploads/2017/12/52_2015_Jawed_JAM_GeometricModelCoilingElasticRodMovingSubstrate.pdf)
- Brun et al., enrollamiento y vidrio fundido: [APS DFD 2015](https://gfm.aps.org/meetings/dfd-2015/55f71a2069702d060d4f0500), [*Physics* synopsis](https://physics.aps.org/synopsis-for/10.1103/PhysRevLett.114.174501); revisión del modelo geométrico (2024): [arXiv 2410.21503](https://arxiv.org/pdf/2410.21503)
- Yuk y Zhao (2018): [Advanced Science News](https://advancedsciencenews.com/3d-printing-resolution-beyond-nozzle-size), modos de impresión en la [patente](https://patents.google.com/patent/US20200368962A1/en)
- Enrollamiento en impresión de alimentos (umbral de altura): [arXiv 2409.01487](https://arxiv.org/html/2409.01487v1)
- Takahashi y Miyashita (CHI 2017), DOI 10.1145/3025453.3025933: [Amanote](https://research.amanote.com/publication/IJri23MBKQvf0BhiJYs_/expressive-fused-deposition-modeling-by-controlling-extruder-height-and-extrusion-amount)
- Alberts et al. (DIS 2024): [TU Delft](https://repository.tudelft.nl/record/uuid:886c039e-8a78-408d-a5a6-176417aa6339), [HvA](https://research.hva.nl/en/publications/from-dribbling-honey-to-non-planar-3d-printing-coiling-becomes-cr/)
- Emerging Objects, GCODE.Clay: [3DPrint.com](https://3dprint.com/130487/emerging-objects-extruded-clay/), [SolidSmack](https://www.solidsmack.com/fabrication/emerging-objects-tests-the-limits-of-g-code-ceramics-and-gravity-with-the-gcode-clay-series/)
- Clay 3D Printing in Whoville: [Instructables](https://www.instructables.com/Clay-3D-Printing-in-Whoville/)
- Solid Vibration: [Architect](https://www.architectmagazine.com/technology/products/object-of-the-moment-solid-vibration-by-ricky-van-broekhoven-and-olivier-van-herpt_o), [Fabbaloo](https://www.fabbaloo.com/2016/02/the-solid-vibration-3d-printing-project)
- DefeXtiles: [MIT News](https://news.mit.edu/2020/defextiles-leveraging-3d-printer-defect-to-create-quasi-textiles-1020)
- OrcaSlicer, fuzzy skin: [wiki](https://www.orcaslicer.com/wiki/print_settings/others/others_settings_fuzzy_skin)
- Woven Clay: [archivo ACADIA](https://pages.sandpoints.org/sandpoints/acadiaarchive-46619c43/article/woven-clay), [Make](https://makezine.com/article/maker-news/robotic-fabrication-a-look-at-fiber-syntax-and-woven-clay/)
- Kleibel-McGee et al. (2024): [3dcp.fyi](https://3dcp.fyi/klei_gosc_jauk_rist.2024.IoWaSMit3PoCfLCS/); Continuous Clay: [Scientific.net](https://www.scientific.net/AST.173.85); Jauk et al. (2023): [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10532797/)
- Clay Non-Wovens: [PDF](https://static1.squarespace.com/static/5d94c1f17e53db44ee34b9a3/t/5d9515aca6584d41e0a5a8f4/1570051510794/Clay+Non-Wovens.pdf)
- WeaveSlicer: [Hand and Machine](https://handandmachine.org/?p=1602), [librería](https://handandmachine.org/projects/weave_slicer_python/); Extruder Turtle: [PDF](https://handandmachine.org/publications/Extruder_Turtle.pdf); SpiralCup: [GitHub](https://github.com/deannagelosi/SpiralCup)
- Takahashi y Kim (UIST 2019): [researchr](https://researchr.org/publication/TakahashiK19-2)
- BrickLayers: [Hackaday](https://hackaday.com/2025/01/23/brick-layer-post-processor-promising-stronger-3d-prints-now-available)
- WirePrint: [MIT HCIE](https://hcie.csail.mit.edu/research/wireprint/wireprint.html)
- Spatial Print Trajectory: [Harvard GSD MaP+S](https://research.gsd.harvard.edu/maps/2018/12/05/spatial-print-clay-3d-printing-of-spatial-lattices); Responsive Spatial Print: [PDF](https://research.gsd.harvard.edu/maps/files/2018/11/Responsive-Spatial-Print_ACADIA-2018-Proceedings.pdf)
- FullControl: [preprint](https://engrxiv.org/preprint/view/1561), [Wevolver](https://www.wevolver.com/article/open-source-software-for-unconstrained-design-in-additive-manufacturing)
- Silkworm: [3DPrint.com](https://3dprint.com/16524/project-silkworm-3d-printing/)
- Ahlers et al. (2019): [PDF](https://tams-www.informatik.uni-hamburg.de/publications/2019/case_ahlers_2019.pdf)
