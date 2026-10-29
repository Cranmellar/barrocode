# Marco teórico

Referentes para pensar conceptual y formalmente lo que hace BarroCode: cómo una exploración geométrica precisa (una onda de Lissajous sobre una curva, apilada en capas) pasa por un instrumento y una materia, el barro, y vuelve como ornamento con algo de orgánico y algo de accidente.

Las referencias están citadas de memoria; conviene verificar fechas, ediciones y títulos exactos antes de citarlas en un texto.

> Ideas de diseño sin priorizar: [research-notes.md](research-notes.md). Criterios de fabricación: [fabrication-notes.md](fabrication-notes.md).

---

## 1. Ornamento: cómo la planta se vuelve geometría

La tradición que piensa el ornamento vegetal como una geometría que se va abstrayendo.

- **Alois Riegl, *Stilfragen* (1893).** Sigue la palmeta y el acanto desde Egipto hasta el arabesco y sostiene que el zarcillo vegetal evoluciona por lógica interna del motivo, no por copia de la naturaleza. Es la base del tema.
- **Ernst Gombrich, *The Sense of Order* (1979).** Psicología del ornamento: el placer está entre lo que se repite y lo que sorprende. Sirve para pensar el accidente dentro de una regla.
- **Wilhelm Worringer, *Abstraktion und Einfühlung* (1908).** Opone la abstracción geométrica a la empatía orgánica. BarroCode trabaja en la frontera entre ambas.
- **William Hogarth, *The Analysis of Beauty* (1753).** La "línea de la belleza", serpentina: antecedente directo de la línea ondulada como valor estético.
- **Owen Jones, *The Grammar of Ornament* (1856).** Repertorio y principios del ornamento de muchas culturas.
- **Oleg Grabar, *The Mediation of Ornament* (1992)** y **Gülru Necipoğlu, *The Topkapı Scroll: Geometry and Ornament in Islamic Architecture* (1995).** El arabesco islámico (*islimi*): el tallo vegetal llevado a sistema geométrico.
- **Antoine Picon, *Ornament: The Politics of Architecture and Subjectivity* (2013).** El regreso del ornamento con lo digital.

## 2. Simetría formal: BarroCode dibuja frisos

El puente técnico más preciso entre la teoría del ornamento y el código:

- Una onda periódica a lo largo de una curva es un **friso** enrollado sobre la trayectoria (hay exactamente 7 grupos de friso). Los ejes N y T son una modulación en el marco de Frenet de la curva: normal y tangente.
- Con `phaseShiftPerLayer` las capas apiladas forman un **patrón de papel tapiz sobre un cilindro**, una red helicoidal.
- `alternateDirection` introduce una reflexión o deslizamiento entre capas.
- Los keyframes **rompen la simetría** a propósito: el friso cambia a lo largo de la altura.

Referencias:

- **Dorothy Washburn y Donald Crowe, *Symmetries of Culture: Theory and Practice of Plane Pattern Analysis* (1988).** Clasifica cerámica y textiles de muchas culturas por grupos de simetría.
- **Hermann Weyl, *Symmetry* (1952)** y **Branko Grünbaum y G. C. Shephard, *Tilings and Patterns* (1987).**
- **Paulus Gerdes, sobre los *sona* y los diseños lunda**, junto con los ***kolam*** del sur de India: ornamentos de **línea continua sin levantar el trazo**, la misma restricción que tiene un cordón de barro.

## 3. Crecimiento y forma: de lo geométrico a lo orgánico

- **D'Arcy Thompson, *On Growth and Form* (1917).** En el capítulo de las transformaciones, deformar una retícula lleva de una especie de pez a otra. Es casi literalmente lo que hacen los keyframes de escala, rotación y onda a lo largo de la altura.
- **Johann Wolfgang von Goethe, *La metamorfosis de las plantas* (1790).** La hoja como forma única que se transforma a lo largo del tallo: una metáfora de la interpolación entre keyframes.
- **Ernst Haeckel, *Kunstformen der Natur* (1904)** y **Karl Blossfeldt, *Urformen der Kunst* (1928).** La naturaleza leída como ornamento.
- **Przemysław Prusinkiewicz y Aristid Lindenmayer, *The Algorithmic Beauty of Plants* (1990).** Plantas generadas con reglas formales (sistemas L).
- **Johan Gielis, "A generic geometric transformation that unifies a wide range of natural and abstract shapes" (*American Journal of Botany*, 2003).** El artículo de la **superfórmula**, una de las familias de *Forma* (`src/shaper/lib/families.ts`).
- **Philip Ball, *Nature's Patterns* (trilogía, 2009)** y **Jay Kappraff, *Connections: The Geometric Bridge Between Art and Science* (1991).**

## 4. Máquinas de ornamento: los antecesores instrumentales

BarroCode pertenece a una genealogía de instrumentos que convierten la superposición de oscilaciones en ornamento:

- **Torno de rosas y guilloché.** Levas que modulan el radio mientras la pieza gira: una modulación normal a lo largo de una curva, como el eje N. Referencia clásica: **Charles Holtzapffel, *Turning and Mechanical Manipulation*, vol. 5 (1884)**, sobre el torneado ornamental.
- **Armonógrafo y figuras de Lissajous.** **Anthony Ashton, *Harmonograph: A Visual Guide to the Mathematics of Music* (2003)**, breve y visual.
- **Hans Jenny, *Cymatics* (1967).** Patrones producidos por vibración.

## 5. La línea, la materia y quién da la forma

- **Gilbert Simondon, *L'individuation à la lumière des notions de forme et d'information*.** Critica el hilemorfismo (una forma impuesta a una materia pasiva) con **el ejemplo del ladrillo de arcilla en el molde**: la forma surge del encuentro de fuerzas, no de un plano. El G-code y el barro encajan en esa discusión.
- **Tim Ingold, *Lines: A Brief History* (2007) y *Making: Anthropology, Archaeology, Art and Architecture* (2013).** Antropología de la línea, del hilo y del trazo; la "textilidad" del hacer: seguir el flujo del material en vez de imponerle forma.
- **Gottfried Semper, *Der Stil* (1860–63).** El estilo nace de la técnica y del material; el origen textil de la arquitectura. Una pieza impresa en cordón de barro es, literalmente, un tejido enrollado.
- **Anni Albers, *On Weaving* (1965).** La estructura que nace de la restricción del hilo.
- **Lambros Malafouris, *How Things Shape the Mind* (2013).** Su caso central es el alfarero en el torno: la mente distribuida entre mano, barro y máquina.
- **Gilles Deleuze, *Le Pli: Leibniz et le baroque* (1988).** El pliegue barroco; casi obligatorio para un proyecto que se llama BarroCode. Ahí aparece el **objetil** de **Bernard Cache** (*Earth Moves: The Furnishing of Territories*, 1995): el objeto como **familia paramétrica** de variantes, no como forma fija, fabricado por control numérico. Es lo que son los parámetros y keyframes de BarroCode.
- **Mario Carpo, *The Alphabet and the Algorithm* (2011)** y *The Second Digital Turn* (2017). Variación no estándar y fabricación digital.

## 6. El accidente programado

Tres planos: el estético, el físico y el matemático.

### Estético y del oficio

- **David Pye, *The Nature and Art of Workmanship* (1968).** Distingue el **trabajo de riesgo** (*workmanship of risk*) del **trabajo de certeza**. Es *la* referencia para pensar qué parte del resultado queda abierta.
- **John Ruskin, "The Nature of Gothic"**, en *The Stones of Venice* (1853). La variabilidad (*changefulness*) y la imperfección como valor. Lo actualiza para lo digital **Lars Spuybroek, *The Sympathy of Things: Ruskin and the Ecology of Design* (2011)**.
- **Vera Molnár** y su "1 % de desorden": una dosis controlada de azar dentro de una regla.
- **Georg Nees, *Schotter*** (c. 1968): una cuadrícula que se desordena progresivamente.
- **Philip Galanter, "What is Generative Art? Complexity Theory as a Context for Art Theory" (2003).** La *complejidad efectiva*: lo interesante está entre el orden total y el ruido total. Antecedentes: **George D. Birkhoff, *Aesthetic Measure* (1933)** y la estética informacional de **Max Bense**.
- **Christopher Alexander, *The Nature of Order*, vol. 1 (2002).** Entre sus quince propiedades: *roughness* y *alternating repetition*.

### Físico

- La física de fluidos estudia exactamente estos accidentes. **N. M. Chiu-Webster y J. R. Lister, "The fall of a viscous thread onto a moving surface: a 'fluid-mechanical sewing machine'" (*Journal of Fluid Mechanics*, 2006)**: un hilo viscoso que cae sobre una superficie en movimiento dibuja meandros, bucles y puntadas según la razón entre la velocidad de extrusión y la de avance.
- **N. M. Ribe, M. Habibi y D. Bonn, "Liquid rope coiling" (*Annual Review of Fluid Mechanics*, 2012).** Revisión del enrollamiento de hilos viscosos.
- Es un accidente programable: un umbral físico que se puede cruzar a propósito con la velocidad (`printSpeed`) y la extrusión (`extrusionMultiplier`).

### Matemático

- Cuando la amplitud N supera el radio de curvatura del trayecto, la curva desplazada desarrolla **cúspides y colas de golondrina**, singularidades clásicas. Ver **J. W. Bruce y P. J. Giblin, *Curves and Singularities*** y la teoría de catástrofes de René Thom y V. I. Arnold.
- `roundCorners` (`src/lib/waveGenerator.ts`) existe para *evitar* esos bucles. Conceptualmente son el lugar donde la geometría produce su propio accidente.

## Prácticas contemporáneas en impresión de barro

- **Emerging Objects (Ronald Rael y Virginia San Fratello).** *Printing Architecture: Innovative Recipes for 3D Printing* (2018) y el proyecto **G-Code.Clay**: G-code escrito a mano, sin slicer, que aprovecha el colapso y el goteo del barro para lograr texturas tejidas.
- **Olivier van Herpt, *Solid Vibrations*.** Vibración sonora que perturba la extrusión.
- **Jonathan Keep.** Vasijas generadas a partir de sonido y código.
- **Unfold, *L'Artisan Électronique* (2010).**

---

## Por dónde empezar

1. **Pye** y **Simondon** (o **Ingold, *Making***): el marco de material y riesgo.
2. **Riegl** y **Gombrich**: el ornamento vegetal como geometría.
3. **Washburn y Crowe** con **Chiu-Webster y Lister**: el lado formal y el físico del instrumento.
4. **Deleuze y Cache**: la conexión barroca y paramétrica.

## Exploraciones que salen de este marco

Sin priorizar; si alguna se concreta, pasa a [../pendientes.md](../pendientes.md).

- **Dejar que ocurran los bucles de esquina** como opción, en vez de redondearlos: un accidente que nace de una singularidad de la curva desplazada.
- **Un parámetro de desorden con semilla**, al estilo Molnár: una perturbación pequeña y reproducible de fase o amplitud.
- **Explorar el umbral de enrollamiento del cordón** variando la razón entre velocidad y extrusión, para que la propia física del barro dibuje.
- **Nombrar los grupos de friso** que producen los parámetros (desfase por capa, dirección alterna) como vocabulario para la comunidad.
