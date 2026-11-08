---
name: ATK
description: Casa de cambio en Coyhaique; la ventanilla se lee como un letrero de la Carretera Austral.
colors:
  vial: "#005c45"
  vial-hi: "#0b7a5d"
  amarillo: "#f2b705"
  reflejo: "#ffd54a"
  faena: "#e06a1b"
  pare: "#c8102e"
  servicios: "#1e4fa0"
  turismo: "#7a4a2a"
  neutro: "#6b7378"
  usd: "#2f7d4f"
  ars: "#3e8fc9"
  eur: "#2d3f9e"
  fondo: "#ecede6"
  lamina: "#f4f4ef"
  panel: "#ffffff"
  cabecera: "#fafaf7"
  asfalto: "#1d2226"
  asfalto-2: "#2a3035"
  tinta: "#1d2226"
  suave: "#5d666c"
  linea: "#d9dbd3"
  linea-fila: "#ecede7"
  borde-control: "#8a9296"
  riel-tinta: "#e9eae4"
  riel-suave: "#9aa3a8"
  ok-tinta: "#005c45"
  ok-fondo: "#e1efe9"
  obra-tinta: "#8a3d0b"
  obra-fondo: "#fce9da"
  rev-tinta: "#c8102e"
  rev-fondo: "#fbe3e6"
  aviso-fondo: "#fff4cc"
  fila-elegida: "#fcf1cd"
  kbd-fondo: "#f7f7f3"
  kbd-borde: "#c7cac1"
typography:
  marca:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.04em"
  letrero:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "0.04em"
  codigo-divisa:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.02em"
  title:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    letterSpacing: "0.01em"
  body:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.1em"
  cifra-letrero:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.05
    fontFeature: "tnum"
  cifra-monto:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 700
    fontFeature: "tnum"
  cifra:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "17px"
    fontWeight: 700
    fontFeature: "tnum"
  tecla:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  tecla: "4px"
  chip: "4px"
  boton-letrero: "6px"
  control: "8px"
  panel: "10px"
  filete: "10px"
  letrero: "14px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "12px"
  xl: "18px"
  pagina: "24px"
  riel: "208px"
  registro: "420px"
components:
  letrero:
    backgroundColor: "{colors.vial}"
    textColor: "#ffffff"
    rounded: "{rounded.letrero}"
    padding: "6px"
  placa:
    backgroundColor: "{colors.asfalto}"
    textColor: "#ffffff"
    rounded: "{rounded.panel}"
    padding: "14px 16px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.panel}"
  button-primary:
    backgroundColor: "{colors.vial}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.vial-hi}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.lamina}"
  button-peligro:
    backgroundColor: "{colors.pare}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "11px 16px"
    height: "44px"
  segmentado-activo:
    backgroundColor: "{colors.asfalto}"
    textColor: "#ffffff"
    height: "40px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.tinta}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "44px"
  input-monto:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.tinta}"
    typography: "{typography.cifra-monto}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  estado-ok:
    backgroundColor: "{colors.ok-fondo}"
    textColor: "{colors.ok-tinta}"
    rounded: "{rounded.chip}"
    padding: "3px 8px"
  estado-obra:
    backgroundColor: "{colors.obra-fondo}"
    textColor: "{colors.obra-tinta}"
    rounded: "{rounded.chip}"
    padding: "3px 8px"
  estado-rev:
    backgroundColor: "{colors.rev-fondo}"
    textColor: "{colors.rev-tinta}"
    rounded: "{rounded.chip}"
    padding: "3px 8px"
  riel:
    backgroundColor: "{colors.asfalto}"
    textColor: "{colors.riel-tinta}"
    width: "208px"
  riel-item-activo:
    backgroundColor: "{colors.asfalto-2}"
    textColor: "#ffffff"
    padding: "11px 22px"
  tecla:
    backgroundColor: "{colors.kbd-fondo}"
    textColor: "{colors.tinta}"
    typography: "{typography.tecla}"
    rounded: "{rounded.tecla}"
    padding: "1px 5px"
---

# Design System: ATK

Fuente normativa: `app/apps/web/src/estilos/tokens.css` (claro en `:root`, oscuro en `prefers-color-scheme: dark`). Los valores de arriba son los del modo claro; los del oscuro están en `.impeccable/design.json` (`colorMeta.<token>.oscuro`). Si este archivo y `tokens.css` discrepan, manda `tokens.css`.

## Overview

**Creative North Star: "La Carretera Austral"**

La aplicación de la ventanilla se lee como la señalética vial chilena. Cada sección tiene su letrero: una lámina de color plano con un filete interior blanco (o de tinta) redondeado, letras Overpass gruesas y cifras en Overpass Mono tabular. Las divisas son destinos, con un color fijo cada una, y sus tasas son las distancias, legibles de un vistazo. Alrededor del letrero todo es lámina gris clara, paneles blancos con líneas finas y un riel de asfalto a la izquierda: sin tarjetas de KPI, sin acento azul genérico, sin gradientes.

La densidad es la de una herramienta de trabajo: 80 a 150 operaciones al día por teclado. Cada acción tiene su tecla visible (`kbd`), los montos se alinean en columnas tabulares y la vista previa es una placa invertida que se lee en voz alta al cliente. De noche son letreros bajo los focos: el asfalto se hunde, los letreros conservan su color y los blancos reflejan; la placa, la única lámina invertida, se aclara.

**Key Characteristics:**
- Un letrero por sección en su color de función, con filete interior y radio de 14 px.
- Overpass para palabras y Overpass Mono tabular para toda cifra de dinero.
- Un color fijo por divisa, siempre como un punto de 9–10 px junto al código.
- Amarillo para lo que cambió o no cuadra, naranja de faena para borradores, rojo PARE para el reverso.
- Plano por defecto: la sombra solo la llevan los letreros y lo que flota (reverso, diálogo).
- Foco amarillo con canto de asfalto, visible sobre cualquier superficie.

## Colors

Pintura de señalética sobre lámina gris: colores planos y saturados para la información vial, neutros cálidos para el trabajo.

### Primary
- **Verde Vial** (`vial`): la pizarra de la Ventanilla, el letrero de la entrada, el botón principal («Confirmar», «Entrar», «Cerrar turno») y el cuadro de la Ventanilla en el riel. No cambia de valor en oscuro. Su hover es **Verde Vial Encendido** (`vial-hi`), que también es el cursor de texto en claro.

### Secondary: los colores de función
Cada sección se reconoce por su color en el cuadro del riel y en su letrero:
- **Verde Vial** (`vial`): Ventanilla.
- **Amarillo de Advertencia** (`amarillo`): Cierre del día; su letrero lleva tinta de asfalto y filete de asfalto. También es el foco, la selección de texto y el borde de la tasa que cambió.
- **Café Turismo** (`turismo`): Jornada. El letrero queda en #7a4a2a en los dos modos; el token del riel sube de luz de noche.
- **Azul Servicios** (`servicios`): Clientes. El cartel queda en #1e4fa0 en los dos modos.
- **Gris Neutro** (`neutro`): Configuración (cartel #5d666c) y la divisa sin color propio, como CLP.

### Tertiary: los estados
- **Reflejo** (`reflejo`): el aviso «cambió hace N min» dentro de la pizarra verde; el amarillo de señal no alcanzaba 4,5:1 sobre el verde teñido.
- **Naranja de Faena** (`faena`): el borrador y lo pendiente (ícono de la nota de la placa, borde del aviso de borradores en la Jornada). Chip con `obra-fondo`/`obra-tinta`.
- **Rojo PARE** (`pare`): el reverso (borde del panel, botón «Reversar», tachado del monto reversado) y el borde de un campo inválido. Chip y texto de error con `rev-fondo`/`rev-tinta`.
- **Confirmada**: chip `ok-fondo`/`ok-tinta`, el mismo verde vial en claro.

### Divisas
- **USD** (`usd`), **ARS** (`ars`), **EUR** (`eur`): un color fijo por destino, solo como punto junto al código, en la barra de proporción de la Jornada y nunca como fondo de texto. En oscuro suben de luz (#4fb477, #3e8fc9, #7b8cf0).

### Neutral
- **Lámina Gris** (`fondo`): el fondo de la página.
- **Lámina Clara** (`lamina`): hover de fila y de botón secundario, la nota bajo la cabecera de un panel.
- **Panel Blanco** (`panel`) y **Cabecera** (`cabecera`): paneles y cabecera fija de tabla.
- **Asfalto** (`asfalto`, `asfalto-2`): el riel (en los dos modos), la placa en claro, el segmentado activo y la tinta principal (`tinta`).
- **Tinta Suave** (`suave`): rótulos, ayudas y columnas secundarias.
- **Líneas** (`linea`, `linea-fila`): bordes de panel y separadores de fila. **Trazo** (#1d2226 en claro, #c8cdc6 en oscuro): bordes fuertes del segmentado, del botón secundario, del monto y de la cabecera de tabla. **Borde de control** (`borde-control`): contorno de input y select, a 3:1 sobre el panel.
- **Destacador** (`fila-elegida`) y **aviso** (`aviso-fondo`): la fila elegida del libro y el fondo del aviso amarillo.

### Named Rules
**The Letrero Rule.** El café turismo, el azul servicios y el gris de Configuración aparecen solo en el letrero de su sección y en su cuadro del riel. El verde vial y el amarillo suman únicamente los papeles listados arriba (botón principal y confirmada; advertencia, foco y selección). Ningún color de función tiñe paneles, fondos ni encabezados.

**The Destino Rule.** Cada divisa tiene un solo color, en todas las pantallas, siempre como punto o barra junto a su código. Una divisa nueva sin token cae en `neutro`.

**The Señal de Estado Rule.** Amarillo = cambió o no cuadra; naranja de faena = borrador; rojo PARE = reversado o error. El color nunca va solo: cada aviso lleva ícono o texto que dice el tono.

## Typography

**Display Font:** Overpass (con system-ui, sans-serif), pesos 400, 600, 700, 800 y 900, autohospedada (subconjunto latino).
**Label/Mono Font:** Overpass Mono (con ui-monospace), pesos 500 y 700, con `tabular-nums`.

**Character:** Overpass viene de la tipografía de señalización vial: gruesa, abierta y legible a distancia. Overpass Mono pone las cifras en columnas que cuadran.

### Hierarchy
- **Marca** (900, 46px, 1, 0.04em): solo «ATK» en el letrero de la entrada. En el riel, 22px.
- **Letrero** (900, 22–24px, 1.1, 0.04em, mayúsculas en Cierre y Jornada): el título de cada letrero de sección.
- **Código de divisa** (900, 26px, 1): USD, ARS, EUR en la pizarra (22px bajo 900 px).
- **Title** (800, 15px; 17px para un título suelto fuera de panel; 18px en diálogos): cabecera de panel.
- **Body** (400, 14px, 1.4): texto general. Los controles van en 600, 15px; los rótulos de campo en 700, 12px, en `suave`.
- **Label** (800, 10–11px, 0.06–0.14em, mayúsculas): cabeceras de tabla, chips de estado, rótulos de la placa y de la pizarra («COMPRA», «VENTA»), la leyenda de un letrero.
- **Cifras** (Overpass Mono 700, tabulares): 21px en la pizarra, 28px en el campo de monto (alineado a la derecha), 19px y 24px (total) en la placa, 17px en los totales del pie, 13.5px en el libro.
- **Tecla** (Overpass Mono 700, 11px): cada `kbd`.

### Named Rules
**The Cifra Tabular Rule.** Todo monto, tasa, folio u hora va en Overpass Mono con `tabular-nums` y alineado a la derecha en tablas. Ninguna cifra de dinero va en Overpass.

**The Leyenda Vial Rule.** Las mayúsculas espaciadas son leyenda de letrero o cabecera de columna: rotulan una cifra o una columna que está ahí mismo. No van sobre un título como antetítulo.

## Layout

Un marco de dos columnas: el riel de asfalto fijo de 208 px y el área de trabajo con 20px 24px de margen. Los bloques de una pantalla se separan por 18 px. La Ventanilla, a partir de 1200 px de ancho y 640 px de alto, ocupa la pantalla entera sin scroll: la pizarra arriba a todo el ancho y, debajo, el registro de 420 px y el libro, que corre por dentro con su pie de totales pegado abajo.

Puntos de quiebre: bajo 1200 px el registro y el libro se apilan (registro hasta 640 px de ancho); bajo 900 px el riel baja a una barra inferior de 60 px con cinco pestañas y «Salir» aparte, la pizarra pasa a una fila por destino y el reverso deja de flotar; bajo 640 px el libro esconde tasa, folio, hora y tipo (la hora y el tipo bajan bajo la divisa); bajo 400 px se oculta el nombre de la divisa. Todo funciona desde 360 px. La Jornada se diseñó primero para el teléfono (ancho máximo 1180 px).

Ritmo interno: cabecera de panel 14px 18px 10px; celdas 9px 12px; formulario con 12 px entre campos; acciones con 10 px.

## Elevation & Depth

Plano por defecto, con capas tonales: lámina gris, panel blanco con línea de 1 px, riel de asfalto. Solo dos cosas tienen sombra: los letreros, que se separan de la lámina como una placa montada, y lo que flota sobre el trabajo.

### Shadow Vocabulary
- **Letrero** (`--sombra-letrero`, en `tokens.css`; valor en el sidecar): un canto de 2 px y una sombra difusa teñida de verde bajo la placa. En oscuro, más honda y neutra.
- **Flotante** (`0 16px 36px -14px rgb(0 0 0 / 0.4)` en el reverso; `0 18px 48px -16px rgb(0 0 0 / 0.45)` en el diálogo, con fondo atenuado `rgb(14 17 19 / 0.55)`).

### Named Rules
**The Flat Panel Rule.** Los paneles, tablas, campos y botones no llevan sombra. La profundidad se marca con el borde y el cambio de superficie.

## Shapes

Esquinas de señalética: redondeadas pero firmes. El letrero mide 14 px de radio por fuera, con 6 px de lámina hasta un filete de 3 px y 10 px de radio por dentro; los carteles de Clientes y Configuración son la versión compacta (12 px fuera, 5 px de lámina, filete de 2 px y 8 px dentro), y la Jornada usa 12/8 con filete de 3 px. Paneles y placa: 10 px. Controles, botones y segmentado: 8 px. Botón sobre letrero y fila de borrador: 6 px. Chips y teclas: 4 px. Los puntos de divisa son círculos; el cuadro de sección del riel, un cuadrado de 14 px con 3 px de radio.

Los bordes son el lenguaje de forma: 1 px para paneles y filas, 2 px para controles y botones, 2 px de trazo bajo la cabecera de tabla y sobre el pie de totales.

## Components

### Letrero (componente firma)
La pieza de identidad de cada pantalla. Lámina del color de función, filete interior del color de la tinta (blanco, o asfalto en el amarillo del Cierre), `--sombra-letrero`. En la Ventanilla es la pizarra: leyenda «Pizarra · pesos por unidad», vigencia y «Actualizar pizarra» a la derecha, y tres destinos con código, nombre y compra/venta en cifras de 21 px.
- **La tasa que cambió:** el destino queda encendido con un contorno amarillo de 3 px y fondo `rgb(242 183 5 / 0.12)`, con el aviso en `reflejo`; al llegar, el contorno destella blanco y amarillo una vez (1.3s, `cubic-bezier(0.16, 1, 0.3, 1)`). Al mirarlo se apaga. Con foco, el anillo pasa a blanco.
- **Botón sobre letrero:** contorno blanco de 2 px, fondo transparente, hover con blanco al 12–14 %.

### Placa
La vista previa invertida: tres columnas (tasa, cliente paga, margen), rótulos de 10 px en mayúsculas y cifras de 19/24 px. Asfalto con tinta blanca en claro; lámina clara con tinta de asfalto en oscuro. Si la tasa quedó desfasada, las cifras bajan al 60 %.

### Buttons
- **Shape:** 8 px de radio, 44 px de alto mínimo, borde de 2 px, Overpass 800 15px.
- **Primary:** verde vial con texto blanco; la tecla dentro va en `vial-hi`. Se estira en la fila de acciones.
- **Hover / Focus:** hover a `vial-hi` (0.15s ease-out); foco con el anillo global.
- **Secondary:** panel blanco con borde de trazo; hover a `lamina`.
- **Peligro:** rojo PARE con tinta blanca (en oscuro, #f5596b con tinta de asfalto).
- **Enlace:** acción secundaria dentro de una fila o un aviso: 800, subrayado de 1 px que pasa a 2 px en hover.

### Segmentado
Compra/Venta y gasto/retiro/ingreso: dos mitades dentro de un borde de trazo de 2 px. La activa en asfalto con tinta blanca (en oscuro, trazo claro con tinta oscura); cada mitad lleva su tecla.

### Chips de estado
Overpass 800, 11px, 0.06em, mayúsculas, 4 px de radio: CONFIRMADA (ok), BORRADOR (obra), REVERSADA (rev).

### Cards / Containers
- **Corner Style:** 10 px.
- **Background:** `panel`, sobre `fondo`.
- **Shadow Strategy:** ninguna (ver Flat Panel Rule).
- **Border:** 1 px `linea`; cabecera separada por 1 px.
- **Internal Padding:** 14–18 px.

### Inputs / Fields
- **Style:** panel blanco, borde de 2 px `borde-control`, 8 px de radio, 44 px de alto, 600 15px. El campo de monto lleva borde de trazo y cifra Mono de 28 px a la derecha.
- **Focus:** anillo global: 3 px amarillo y, por fuera, 5 px de canto de asfalto. Dentro de una franja (riel, segmentado) el anillo va por dentro.
- **Error / Disabled:** inválido con borde rojo PARE más el error junto al campo (ícono y texto). Deshabilitado al 55 %.
- **Divisa:** tres opciones con punto, código y tecla; la elegida con borde de trazo doble.

### Avisos
Grilla de ícono y cuerpo, borde de 2 px y 8 px de radio. Advertencia: borde amarillo sobre `aviso-fondo`. Error: borde PARE sobre `error-fondo`. En el Cierre, el descuadre es una franja amarilla; de noche, una placa amarilla entera.

### Navigation
El riel de asfalto: marca arriba («ATK» 900 22px y el lugar en mayúsculas), secciones con cuadro de color, nombre 700 14px y tecla de función (F1–F4), y el turno y «Salir» al pie. Hover y activa en `asfalto-2`; la activa además rodea su cuadro con un anillo reflectante de 2 px. Bajo 900 px es una barra inferior de 60 px: cuadro arriba y nombre corto abajo.

### Libro
La tabla del día: cabecera fija en mayúsculas sobre un trazo de 2 px, filas de 9px 12px con línea fina, hover en `lamina` y la fila elegida con destacador amarillo. Lo reversado se tacha en PARE con el motivo debajo; lo pendiente va en `suave` con «Confirmar» como enlace. Al pie, los totales del día en cifras de 17 px.

### Teclas
`kbd` en Mono 700 11px, borde de 1 px con 2 px abajo, 4 px de radio. Sobre el verde y el asfalto toma el fondo de su superficie.

### Carga
Barras grises del tamaño de lo que viene, con un pulso de opacidad de 1.2s; sin spinner. Con movimiento reducido no hay transiciones ni animaciones.

## Do's and Don'ts

### Do:
- **Do** abrir cada pantalla con su letrero en su color de función, con filete interior y la sombra del letrero.
- **Do** escribir toda cifra de dinero en Overpass Mono tabular, con `formatearMonto`/`formatearTasa`.
- **Do** mostrar la tecla de cada acción con `kbd` junto a su rótulo.
- **Do** usar el foco amarillo con canto de asfalto (3 px + 5 px) y medir 3:1 en cada superficie donde aparezca.
- **Do** acompañar cada color de estado con ícono o palabra (Phosphor en SVG, peso bold, 14–18 px).
- **Do** declarar el valor nocturno de cada token nuevo y comprobar AA sobre `panel` y `fondo` en los dos modos.

### Don't:
- **Don't** armar un dashboard de tarjetas de KPI con barra lateral clara y acento azul.
- **Don't** teñir paneles, fondos o títulos con un color de función o de divisa fuera de su letrero, su cuadro del riel o su punto.
- **Don't** poner sombra a paneles, campos o botones.
- **Don't** cambiar de noche el color de un letrero: los letreros quedan iguales y los blancos reflejan.
- **Don't** usar spinners: la carga se muestra con la forma de lo que viene.
