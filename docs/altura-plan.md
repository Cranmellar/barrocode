# Forma que cambia con la altura: plan de evaluación

Fecha: 2026-11-06 · base: `main` @ `bc01873` · estado: propuesta. Nada de esto está decidido ni comprometido. Decisiones en la sección 7.

Este documento evalúa cómo dejar que la planta de la pieza cambie con la altura: un pie redondo que termina en un labio estrellado, un cuerpo que se ensancha y se cierra en un cuello, o varios SVG a distintas alturas con barrocode interpolando entre ellos. Puede quedarse en registro. Por eso la sección 10 separa lo que sirve aunque el resto no se haga.

---

## 1. Problema

Hoy toda la pieza sale de **una sola planta**. `generateWaveLayers` (`lib/waveGenerator.ts`) recibe un `SampledPath[]` y lo repite en cada capa. Lo único que cambia entre capas es la onda, la fase y la transformación (centro, escala, giro), con keyframes.

Con eso se consigue mucho: escala por keyframes da barrigas y cuellos, el giro da torsiones. Pero la forma de la planta no cambia. Un círculo sigue siendo un círculo, solo más grande o más chico, y cinco lóbulos siguen siendo cinco.

## 2. Objetivo

Ampliar las formas que la app puede imprimir sin perder lo que hoy la hace confiable:

1. Que la planta cambie con la altura, de forma continua y predecible.
2. Que la onda siga apilándose: las crestas de una capa sobre las de la anterior.
3. Que la app avise cuando el cambio entre capas sea más rápido de lo que la arcilla aguanta.
4. Que una pieza sin forma por altura salga igual que hoy, byte a byte.

## 3. Qué supone hoy el pipeline

Repetir la misma planta en cada capa no es solo una comodidad. Varias partes del código cuentan con ello:

| Qué | Dónde | Qué pasa si la planta cambia por capa |
|---|---|---|
| **Suelo de Z** | `prevZ[pi][i]` en `generateWaveLayers` | Compara cada punto con la misma muestra de la capa de abajo. Exige el mismo número de muestras por ruta, en el mismo orden, en todas las capas. |
| **Ciclos enteros en rutas cerradas** | `fitN/T/Z` en `computeWave` | Si el perímetro cambia, `round(L / λ)` salta de N a N+1 en alguna capa. Las crestas dejan de apilarse y el patrón se corre entero de golpe. |
| **Esquinas redondeadas** | `roundCorners` | Abre el lazo en su punto más suave. Si la planta cambia, ese punto puede saltar de capa en capa y la costura deambula. Se agrava el empate conocido (CLAUDE.md, *sharp edges*). |
| **Capas idénticas reutilizadas** | `waveCache`, y los cruces de z-hop en `buildToolpath` | Dejan de servir. Cada capa cuesta lo que cuesta hoy con keyframes. |
| **Keyframes** | `t` = fracción de todos los puntos | Una clave de forma pertenece a una altura, no a un punto del trayecto. Hay que conciliar las dos líneas de tiempo. |
| **Un archivo** | `ParsedSVG`, `PathList`, `scaleFactor`, sesión | Cada SVG trae su viewBox, `mmPerUnit`, centro, rutas activas y ajustes por ruta. Todo eso se multiplica. |

Lo que **no** cambia: `buildToolpath`, `generateGcode` y el visor ya trabajan con geometría distinta en cada capa, porque la escala y el giro por keyframes la producen. La rampa de costura solo sube Z sobre la capa actual. Si la siguiente capa empieza un poco más allá, la transición suave cubre el hueco mientras quede dentro de `transitionLength`.

## 4. Cuatro caminos

De menor a mayor costo. No se excluyen: cada uno reutiliza algo del anterior.

### A. Perfil de la pieza (silueta)

El usuario da el perfil lateral, r(z): una curva que dice cuánto se aleja la pared del centro a cada altura. Dos modos:

- **Escalar.** La planta se escala por r(z) / r(0) alrededor del pivote. Equivale a tener un keyframe de escala en cada capa, con una curva en vez de doscientos rombos. Como `applyTransformSVG` escala después de la onda, la onda crece con la pieza, igual que hoy con keyframes de escala. Los ciclos por vuelta no cambian, porque la onda se calcula sobre la planta sin escalar: las crestas se apilan solas.
- **Desplazar.** La línea central se corre r(z) − r(0) mm hacia afuera por su normal, antes de la onda, como `wallOffsets` corre las pasadas del muro (`signedArea`, `transformNormal`). La pared conserva su forma y la onda su amplitud en mm, como una costilla de alfarero. Hacia adentro, un desplazamiento mayor que el radio de curvatura local pliega la línea; hay que limitarlo o avisar. El perímetro cambia, así que hace falta la decisión D-A3.

No hay problema de correspondencia: es la misma planta en todas las capas. Cubre la mayoría de las vasijas: panza, cuello, labio abierto.

### B. Familias de *Forma* por altura

Ya está en `docs/shaper-plan.md`, sección 8. Las familias polares (lóbulos, polígono o estrella, superfórmula) dan la correspondencia gratis: la muestra k está en el ángulo θₖ en todas las capas. Se interpolan los parámetros de la familia entre alturas: 5 lóbulos abajo y 8 arriba, de redondo a estrella, de agudeza baja a alta.

Cambia el contrato entre *Forma* e *Impresión*: hoy es un string SVG; pasaría a ser un contorno por capa (o la receta para generarlo). Solo `generateWaveLayers` tendría que aceptarlo. Un cambio de número de lóbulos no se interpola en la cuenta (5,5 lóbulos no existe); se interpola la forma, muestra a muestra en el mismo ángulo.

### C. Contornos clave de cualquier SVG

El caso general: varias plantas a distintas alturas, de archivos o de *Forma* con nodos. Pasos por par de claves:

1. Remuestrear cada contorno a M puntos por longitud de arco normalizada.
2. Llevar todos al mismo sentido (`signedArea`).
3. Centrar y girar el índice de inicio para minimizar la distancia entre los dos (o alinear por el ángulo de costura, si viene de *Forma*).
4. Interpolar punto a punto, con `segmentAlpha` entre más de dos claves (claves suaves: Hermite, como los keyframes).

Para contornos estrellados (cada rayo desde el centro corta una vez) conviene interpolar r(θ) en vez de x, y. Interpolar x, y entre plantas giradas o cóncavas encoge o pliega el medio: dos cuadrados a 45° dan un octógono más chico.

Exigir el **mismo número de contornos** en todas las claves, emparejados por cercanía de centro y por anidamiento (agujero con agujero). Si no coinciden, rechazar con un aviso.

### D. Campos de distancia

Interpolar las distancias con signo de cada planta y extraer el contorno (marching squares) en cada capa. Es lo único que maneja cambios de topología: un contorno que se parte en dos, un agujero que aparece (muestra 4). A cambio pierde lo que el suelo de Z y la rampa de costura necesitan: una costura estable y la misma muestra en la misma posición capa a capa. Costoso y frágil para este pipeline.

### Comparación

| | A. Perfil | B. Familias | C. Contornos clave | D. Campos |
|---|---|---|---|---|
| Formas nuevas | Silueta (vasijas) | Planta polar que cambia | Cualquier planta → cualquier planta, misma topología | También cambios de topología |
| Correspondencia | No hace falta | Gratis (ángulo) | Remuestreo y alineación | Se pierde |
| Toca el pipeline | Escalar: casi nada. Desplazar: línea central por capa | Contorno por capa | Contorno por capa | Contorno por capa, sin correspondencia |
| UI | Una curva | Claves en *Forma* | Varias plantas con altura | Igual que C |
| Riesgo | Bajo | Medio | Medio-alto | Alto |
| Esfuerzo (sesiones) | 1–2 | 2–3 | 3–5 | 5 o más |

## 5. Problemas comunes

Valen para B, C y D, y en parte para el modo *desplazar* de A.

- **Imprimibilidad.** Un cambio rápido entre claves deja capas que salen más allá de lo que la capa de abajo sostiene. Hoy nada compara el paso horizontal entre capas con `lineWidth`; con escala y giro ya puede pasar, y la app no lo mide (CLAUDE.md: la torsión es "decisión del usuario"). Con forma por altura el aviso deja de ser opcional. Ver A0.
- **La onda en la costura.** Si el perímetro cambia, los ciclos enteros por vuelta cambian en algún punto. Para que las costillas sigan verticales hay que fijar el número de ciclos y dejar que la longitud de onda se estire con el perímetro (la onda por arco normalizado, s / L). Es un cambio real en la matemática de la onda, y una decisión (D-A3).
- **Costura estable.** La costura de cada capa tiene que caer en la misma muestra. `roundCorners` no puede elegirla capa por capa; se decide una vez (en la clave de abajo o con un ángulo de costura) y se mantiene. Se cruza con la idea de *costura en el punto más cercano* de `docs/research-notes.md`.
- **Esquinas por capa.** Si una clave tiene esquina y la otra no, el redondeo interpolado no coincide con el redondeo de la forma interpolada. Opción simple: redondear cada capa después de interpolar, con la costura fija.
- **Rendimiento.** Sin capas idénticas, cada capa se calcula entera, como hoy con keyframes, y los cruces de z-hop se buscan capa por capa. Hay que medirlo a 150 capas antes de B o C, y probablemente pasar el G-code a un worker (*Performance*, 2026-10-28 #7).
- **Altura y `t`.** Las claves de forma van por capa o por altura en mm. En la línea de tiempo serían una segunda fila, o una vista propia. La capa ya se muestra junto a `t` (`layerLabel`), así que la conversión existe.

## 6. Lo que este plan no hará

- No interpolar entre plantas con distinto número de contornos (salvo con D).
- No subir varios archivos a la vez como primer paso. Si C llega, entra primero por *Forma* o por un solo SVG con capas.
- No tocar la escala, el giro ni la onda por keyframes: siguen como hoy y se suman a la forma por altura.
- No mostrar la pieza como malla ni exportar STL.

## 7. Decisiones abiertas

| Id | Decisión | Opciones | Inclinación |
|---|---|---|---|
| D-A1 | **¿Se hace algo?** | Nada · solo A0 · A0 + A · más | A0 sirve sola; A si hay demanda. |
| D-A2 | **De dónde sale el perfil (A).** | Un SVG con una ruta abierta (x = radio, y = altura) · una curva editable en el visor · claves de radio en la línea de tiempo | Un SVG abierto es lo más barato; una curva en el visor, lo más claro. |
| D-A3 | **Ciclos de la onda cuando cambia el perímetro.** | Recalcular por capa (salta) · fijos desde la capa 0 (λ se estira) · elegible | Fijos: las costillas se apilan. |
| D-A4 | **Entrada de varias plantas (C).** | Solo desde *Forma* · un SVG con grupos o capas con altura (`z=40` en el `id` o en `inkscape:label`) · varios archivos | *Forma* primero; un SVG con capas después. Varios archivos, último. |
| D-A5 | **Umbral del aviso de voladizo (A0).** | Fracción de `lineWidth` (½ como punto de partida) · ángulo por capa | Medir en una impresión de prueba antes de fijarlo. |
| D-A6 | **Dónde se editan las claves de forma.** | Línea de tiempo de *Impresión* · *Forma* · las dos | *Forma*, que ya tiene la planta y deshacer. |

## 8. Fases

Cada fase se puede dejar en cualquier punto sin romper nada.

### A0. Aviso de voladizo (½–1 sesión)

En `generateWaveLayers`, junto al suelo de Z: para cada muestra, el desplazamiento respecto a la misma muestra de la capa de abajo, proyectado sobre la normal hacia afuera de la capa de abajo. Solo la componente normal: el deslizamiento a lo largo de la línea (desfase por capa, torsión suave) no deja el cordón sin apoyo. Se guarda el mayor por capa en `WaveLayer` (como `maxGap`) y `checkMachine` avisa en *Máquina* y con la marca gris de *Impresión*. Tests: una escala lineal da el desplazamiento esperado; una pieza sin cambios da 0; el G-code no cambia.

Sirve hoy, sin nada más de este plan: mide los keyframes de escala, la torsión y el muro.

### A1. Perfil, modo escalar (1 sesión)

Una curva r(z) multiplica `scaleX/Y` por capa, encima de los keyframes. Sin cambios en la onda. Con D-A2 resuelta.

### A2. Perfil, modo desplazar (1 sesión)

Línea central corrida por la normal antes de la onda, con límite hacia adentro por la curvatura (la que mide `printability.ts` en *Forma*). Pide D-A3. Esquinas redondeadas con el radio después del desplazamiento.

### B1. Familias por altura (2–3 sesiones)

Claves de familia en *Forma*, contorno por capa por ángulo, nuevo contrato *Forma* → *Impresión*. `generateWaveLayers` acepta una línea central por capa con el mismo número de muestras. Costura fija. G-code en worker antes o durante.

### C1. Contornos clave (3–5 sesiones)

Remuestreo, sentido, alineación, interpolación (r(θ) cuando se pueda), emparejado de contornos. Entrada según D-A4. Tests en `lib/` (todo es geometría pura salvo el parseo).

### D. Campos de distancia

Fuera de este plan salvo que C muestre que hace falta.

## 9. Esfuerzo y veredicto

| Fase | Sesiones | Formas nuevas | Riesgo |
|---|---|---|---|
| A0 | ½–1 | Ninguna; protege las actuales | Bajo |
| A1 | 1 | Siluetas de vasija | Bajo |
| A2 | 1 | Siluetas con la pared y la onda intactas | Medio |
| B1 | 2–3 | Plantas polares que cambian | Medio |
| C1 | 3–5 | Cualquier planta a cualquier planta | Medio-alto |

Si se hace algo, el orden es A0 → A1, y parar ahí a mirar piezas impresas. B1 solo si las siluetas se quedan cortas. C1 solo con un pedido concreto de la comunidad, y por *Forma* antes que por archivos. D, no.

## 10. Si el plan no se implementa

Varias piezas valen por sí solas y no dependen de que la planta cambie con la altura:

- **A0, el aviso de voladizo.** Ya hay escala, giro y muro que pueden dejar cordones sin apoyo.
- **Un aplanador de trazados SVG en JS puro** (rectas, curvas cuadráticas y cúbicas, arcos, transformaciones) en vez de `getPointAtLength`. El parser es la entrada más frágil y no tiene tests porque necesita el DOM. Una versión pura se prueba en Node, da lo mismo en todos los navegadores, corre en un worker y abarata la entrada de C si algún día llega.
- **G-code en un worker** (*Performance* #7).
- **Costura fija o por ángulo** en *Trayecto* (`docs/research-notes.md`).
- **Caudal por altura local del cordón** (NP-0a en `pendientes.md`).
