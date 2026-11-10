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
  neutro: "#6b7378"
  letrero-ventanilla: "#37584a"
  letrero-cierre: "#7b5e2e"
  letrero-jornada: "#624a3c"
  letrero-clientes: "#40506c"
  letrero-config: "#4f575b"
  usd: "#2f7d4f"
  ars: "#3e8fc9"
  eur: "#2d3f9e"
  usd-letrero: "#58c47f"
  ars-letrero: "#6cb8ec"
  eur-letrero: "#8f9ef5"
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
  cebra: "#f7f7f2"
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
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  letrero:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
  codigo-divisa:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "0.01em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.1em"
  cifra-letrero:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.05
    fontFeature: "tnum"
  cifra-monto:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 700
    fontFeature: "tnum"
  cifra:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "17px"
    fontWeight: 700
    fontFeature: "tnum"
  tecla:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  tecla: "4px"
  chip: "4px"
  boton-letrero: "6px"
  control: "8px"
  panel: "6px"
  filete: "10px"
  letrero: "14px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "12px"
  xl: "18px"
  pagina: "24px"
  cinta: "76px"
  registro: "400px"
components:
  letrero:
    backgroundColor: "{colors.letrero-ventanilla}"
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
  barra-titulo:
    backgroundColor: "{colors.asfalto}"
    textColor: "{colors.riel-tinta}"
    height: "32px"
  pestana-activa:
    backgroundColor: "{colors.cabecera}"
    textColor: "{colors.tinta}"
    rounded: "6px 6px 0 0"
    padding: "5px 16px"
  cinta:
    backgroundColor: "{colors.cabecera}"
    textColor: "{colors.tinta}"
    height: "{spacing.cinta}"
  barra-estado:
    backgroundColor: "{colors.asfalto}"
    textColor: "{colors.riel-tinta}"
    height: "28px"
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

La aplicación de la ventanilla se lee como la señalética vial chilena. Cada sección tiene su letrero: una lámina en el tono de su función, apagado (croma baja; vuelta 3, A3), con un filete interior blanco redondeado, letras IBM Plex Sans en negrita y cifras en IBM Plex Mono tabular. Las divisas son destinos, con un color fijo cada una, y sus tasas son las distancias, legibles de un vistazo. Alrededor del letrero todo es lámina gris clara y paneles blancos con líneas finas, dentro de la estructura de un programa de escritorio (vuelta 3, 2026-11-08): barra de título y pestañas de sección sobre asfalto, una cinta de comandos con grupos rotulados, paneles con barra de título, grillas compactas como una planilla y una barra de estado al pie. Sin tarjetas de KPI, sin acento azul genérico, sin gradientes; cada dato va rotulado y enmarcado.

La densidad es la de una herramienta de trabajo: 80 a 150 operaciones al día por teclado. Cada acción tiene su tecla visible (`kbd`), los montos se alinean en columnas tabulares y la vista previa es una placa invertida que se lee en voz alta al cliente. De noche son letreros bajo los focos: el asfalto se hunde, los letreros conservan su color y los blancos reflejan; la placa, la única lámina invertida, se aclara.

**Key Characteristics:**
- Un letrero por sección en el tono apagado de su función, con filete interior blanco y radio de 14 px.
- IBM Plex Sans para palabras e IBM Plex Mono tabular para toda cifra de dinero.
- Un color fijo por divisa, siempre como un punto de 9–10 px junto al código.
- Amarillo para lo que cambió o no cuadra, naranja de faena para borradores, rojo PARE para el reverso.
- Plano por defecto: la sombra solo la llevan los letreros y lo que flota (reverso, diálogo).
- Foco amarillo con canto de asfalto, visible sobre cualquier superficie.

## Colors

Pintura de señalética sobre lámina gris: colores planos para la información vial, neutros cálidos para el trabajo. Desde la vuelta 3 (A3, 2026-11-09) los letreros llevan el tono de su función con la croma baja: el código por pestaña se mantiene sin estridencia; los colores saturados quedan para los avisos.

### Primary
- **Verde Vial** (`vial`): el botón principal («Confirmar», «Entrar», «Cerrar turno») y el favicon (verde de marca). No cambia de valor en oscuro. Su hover es **Verde Vial Encendido** (`vial-hi`), que también es el cursor de texto en claro.

### Secondary: los colores de función
Cada sección se reconoce por su tono apagado en el cuadro de su pestaña y en su letrero (vuelta 3, A3). Todos llevan tinta y filete blancos y no cambian de noche:
- **Verde Pizarra** (`letrero-ventanilla`, #37584a, 7,9:1): Ventanilla (la pizarra) y, desde la sesión 059, también el letrero de la entrada y el del portal `/mi`, con su subtítulo #d6e6e0 (6,1:1).
- **Ocre** (`letrero-cierre`, #7b5e2e, 6,0:1): Cierre del día. Va en H78 y no en el H85 del amarillo, que con la croma baja se vuelve caqui. El **Amarillo de Advertencia** (`amarillo`) deja el letrero y queda para el foco, la selección de texto, el borde de la tasa que cambió y el descuadre.
- **Café** (`letrero-jornada`, #624a3c, 8,2:1): Jornada.
- **Azul Pizarra** (`letrero-clientes`, #40506c, 8,1:1; subtítulo #d6dfec, 6,1:1): Clientes.
- **Gris** (`letrero-config`, #4f575b, 7,4:1; subtítulo #e1e5e7, 5,8:1): Configuración, Usuarios y Auditoría. `neutro` sigue para la divisa sin color propio, como CLP.

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
- **Asfalto** (`asfalto`, `asfalto-2`): la barra de título, las pestañas y la barra de estado (en los dos modos; el token se llama `riel` por historia), la placa en claro, el segmentado activo y la tinta principal (`tinta`).
- **Tinta Suave** (`suave`): rótulos, ayudas y columnas secundarias.
- **Líneas** (`linea`, `linea-fila`): bordes de panel y separadores de fila. **Trazo** (#1d2226 en claro, #c8cdc6 en oscuro): bordes fuertes del segmentado, del botón secundario, del monto y de la cabecera de tabla. **Borde de control** (`borde-control`): contorno de input y select, a 3:1 sobre el panel.
- **Destacador** (`fila-elegida`) y **aviso** (`aviso-fondo`): la fila elegida del libro y el fondo del aviso amarillo.

### Named Rules
**The Letrero Rule.** Los tonos `letrero-*` aparecen solo en el letrero de su sección y en el cuadro de su pestaña (`letrero-ventanilla` también en los letreros de la entrada y del portal). El verde vial y el amarillo suman únicamente los papeles listados arriba (botón principal y confirmada; advertencia, foco y selección). Ningún color de función tiñe paneles, fondos ni encabezados.

**The Destino Rule.** Cada divisa tiene un solo color, en todas las pantallas, siempre como punto o barra junto a su código. Una divisa nueva sin token cae en `neutro`.

**The Señal de Estado Rule.** Amarillo = cambió o no cuadra; naranja de faena = borrador; rojo PARE = reversado o error. El color nunca va solo: cada aviso lleva ícono o texto que dice el tono.

## Typography

**Display Font:** IBM Plex Sans (con system-ui, sans-serif), pesos 400, 600 y 700, autohospedada con `@fontsource` (subconjunto latino). Elegida por Alonso en la vuelta 3 (B1, 2026-11-09); antes, Overpass.
**Label/Mono Font:** IBM Plex Mono (con ui-monospace), pesos 500 y 700, con `tabular-nums`; avanza 0,6 em por carácter.

**Character:** IBM Plex es sobria y «de software», de lectura clara en pantalla; Plex Mono pone las cifras en columnas que cuadran. Llega a 700: la jerarquía la hacen el tamaño, las mayúsculas espaciadas y el paso 400 → 600 → 700, no los pesos 800 y 900 de antes.

### Hierarchy
- **Marca** (700, 46px, 1, 0.04em): solo «ATK» en el letrero de la entrada. En la barra de título, 17px.
- **Letrero** (700, 22–24px, 1.1, 0.04em, mayúsculas en Cierre y Jornada): el título de cada letrero de sección.
- **Código de divisa** (700, 26px, 1): USD, ARS, EUR en la pizarra (22px bajo 900 px).
- **Title** (700, 15px; 17px para un título suelto fuera de panel; 18px en diálogos): cabecera de panel.
- **Body** (400, 14px, 1.4): texto general. Los controles van en 600, 15px; los rótulos de campo en 700, 12px, en `suave`.
- **Label** (700, 10–11px, 0.06–0.14em, mayúsculas): cabeceras de tabla, chips de estado, rótulos de la placa y de la pizarra («COMPRA», «VENTA»), la leyenda de un letrero.
- **Cifras** (IBM Plex Mono 700, tabulares): 21px en la pizarra, 28px en el campo de monto (alineado a la derecha), 19px y 24px (total) en la placa, 17px en los totales del pie, 13.5px en el libro.
- **Tecla** (IBM Plex Mono 700, 11px): cada `kbd`.

### Named Rules
**The Cifra Tabular Rule.** Todo monto, tasa, folio u hora va en IBM Plex Mono con `tabular-nums` y alineado a la derecha en tablas. Ninguna cifra de dinero va en IBM Plex Sans.

**The Leyenda Vial Rule.** Las mayúsculas espaciadas son leyenda de letrero o cabecera de columna: rotulan una cifra o una columna que está ahí mismo. No van sobre un título como antetítulo.

## Layout

El marco de escritorio (vuelta 3; comp B en `.impeccable/mocks/office/`) ocupa la ventana, de arriba abajo:

1. **La barra de título** (asfalto, 32 px): «ATK», la casa, la sección abierta con su caja y quién está.
2. **Las pestañas de sección** (asfalto): Ventanilla F1, Cierre del día F2, Jornada F3, Clientes F4 y Configuración F5, y, solo para el administrador, Usuarios y Auditoría. Cada una lleva el cuadro del tono apagado de su función, con un canto claro de 1,5 px (de trazo en la activa) para llegar a 3:1 sobre el asfalto; la activa se funde con la cinta. «Salir» va al final de la fila.
3. **La cinta** (unos 76 px): los comandos de la pantalla en grupos rotulados, con su tecla.
4. **El área de trabajo**, con 14px 18px de margen, que corre por dentro. Los bloques se separan por 14 px.
5. **La barra de estado** (asfalto, 28 px): el turno, quién está, la conexión con el servidor, la vigencia de la pizarra y la fecha y la hora.

La Ventanilla, desde 1200 × 640, ocupa el área de trabajo sin scroll: la pizarra arriba a todo el ancho y, debajo, el registro de 400 px y el libro, que corre por dentro con su pie de totales. **En una ventana baja** (hasta 860 px de alto) la cinta se simplifica a una fila sin rótulos y la pizarra y el registro se aprietan; hasta 800 px, la cabecera del letrero se va (la vigencia sigue en la cinta y en la barra de estado). Confirmar y Borrador quedan pegados al pie del registro aunque lo de arriba corra.

Puntos de quiebre: bajo 1200 px el registro y el libro se apilan; **bajo 900 px el marco es el del teléfono, igual que antes de la vuelta 3**: las pestañas bajan a una barra inferior de 60 px (cinco secciones y «Salir»; Usuarios y Auditoría no van) y la barra de título, la cinta y la barra de estado no se muestran. Bajo 640 px el libro esconde tasa, folio, hora y tipo; bajo 400 px se oculta el nombre de la divisa. Todo funciona desde 360 px. La Jornada se diseñó primero para el teléfono; en el PC toma el ancho del área de trabajo.

Ritmo interno: barra de título de panel de 40 px (8px 14px); filas de grilla de 32 px (4px 10px) y cabecera de 30 px; grupos rotulados con 8 px entre campos; acciones con 10 px.

## Elevation & Depth

Plano por defecto, con capas tonales: lámina gris, panel blanco con línea de 1 px y su barra de título en `cabecera`, y el asfalto de la barra de título, las pestañas y la barra de estado. Solo dos cosas tienen sombra: los letreros, que se separan de la lámina como una placa montada, y lo que flota sobre el trabajo.

### Shadow Vocabulary
- **Letrero** (`--sombra-letrero`, en `tokens.css`; valor en el sidecar): un canto de 2 px y una sombra difusa teñida de verde bajo la placa. En oscuro, más honda y neutra.
- **Flotante** (`0 16px 36px -14px rgb(0 0 0 / 0.4)` en el reverso; `0 18px 48px -16px rgb(0 0 0 / 0.45)` en el diálogo, con fondo atenuado `rgb(14 17 19 / 0.55)`).

### Named Rules
**The Flat Panel Rule.** Los paneles, tablas, campos y botones no llevan sombra. La profundidad se marca con el borde y el cambio de superficie.

## Shapes

Esquinas de señalética: redondeadas pero firmes. El letrero mide 14 px de radio por fuera, con 6 px de lámina hasta un filete de 3 px y 10 px de radio por dentro; los carteles de Clientes y Configuración son la versión compacta (12 px fuera, 5 px de lámina, filete de 2 px y 8 px dentro), y la Jornada usa 12/8 con filete de 3 px. Paneles, grupos rotulados y placa: 6 px (vuelta 3: más de escritorio; eran 10 px). Controles, botones y segmentado: 8 px; los botones de la cinta, 5 px; las pestañas, 6 px arriba. Botón sobre letrero y fila de borrador: 6 px. Chips y teclas: 4 px. Los puntos de divisa son círculos; el cuadro de sección de la pestaña, un cuadrado de 12 px con 3 px de radio (14 px en la barra del teléfono).

Los bordes son el lenguaje de forma: 1 px para paneles y filas, 2 px para controles y botones, 2 px de trazo bajo la cabecera de tabla y sobre el pie de totales.

## Components

### Letrero (componente firma)
La pieza de identidad de cada pantalla. Lámina del tono apagado de su función, filete interior blanco, `--sombra-letrero`. En la Ventanilla es la pizarra, **como tabla** (vuelta 3): una cabecera con «Pizarra · pesos por unidad», la vigencia y «Actualizar pizarra», y una fila por divisa con sus columnas rotuladas (Divisa, Compra, Venta, Cambio), separadas por líneas blancas al 22 % como las divisiones de un letrero de destinos. La divisa lleva su punto en su tono de letrero (`usd-letrero`, `ars-letrero`, `eur-letrero`, con anillo blanco), el código en 21 px y el nombre; las tasas, en Mono de 21 px. El letrero no lleva la cebra de las grillas.
- **La tasa que cambió:** la fila queda encendida con un contorno amarillo de 3 px y fondo `rgb(242 183 5 / 0.12)`; su celda «Cambio» es el aviso en `reflejo` (con el diamante de advertencia) y es el botón que la marca como vista. Al llegar, el contorno destella blanco y amarillo una vez (1.3s, `cubic-bezier(0.16, 1, 0.3, 1)`). Al mirarlo se apaga. Con foco, el anillo del botón es blanco. Las demás dicen «Sin cambios desde las …».
- **Botón sobre letrero:** contorno blanco de 2 px, fondo transparente, hover con blanco al 12–14 %.

### Placa
La vista previa invertida: tres columnas (tasa, cliente paga, margen), rótulos de 10 px en mayúsculas y cifras de 19/24 px. Asfalto con tinta blanca en claro; lámina clara con tinta de asfalto en oscuro. Si la tasa quedó desfasada, las cifras bajan al 60 %.

### Buttons
- **Shape:** 8 px de radio, 44 px de alto mínimo, borde de 2 px, IBM Plex Sans 700 15px.
- **Primary:** verde vial con texto blanco; la tecla dentro va en `vial-hi`. Se estira en la fila de acciones.
- **Hover / Focus:** hover a `vial-hi` (0.15s ease-out); foco con el anillo global.
- **Secondary:** panel blanco con borde de trazo; hover a `lamina`.
- **Peligro:** rojo PARE con tinta blanca (en oscuro, #f5596b con tinta de asfalto).
- **Enlace:** acción secundaria dentro de una fila o un aviso: 700, subrayado de 1 px que pasa a 2 px en hover.

### Segmentado
Compra/Venta y gasto/retiro/ingreso: dos mitades dentro de un borde de trazo de 2 px. La activa en asfalto con tinta blanca (en oscuro, trazo claro con tinta oscura); cada mitad lleva su tecla.

### Chips de estado
IBM Plex Sans 700, 11px, 0.06em, mayúsculas, 4 px de radio: CONFIRMADA (ok), BORRADOR (obra), REVERSADA (rev).

### Cards / Containers
- **Corner Style:** 6 px.
- **Background:** `panel`, sobre `fondo`.
- **Shadow Strategy:** ninguna (ver Flat Panel Rule).
- **Border:** 1 px `linea`; cabecera separada por 1 px.
- **Internal Padding:** 14–18 px.

### Inputs / Fields
- **Style:** panel blanco, borde de 2 px `borde-control`, 8 px de radio, 44 px de alto, 600 15px. El campo de monto lleva borde de trazo y cifra Mono de 28 px a la derecha.
- **Focus:** anillo global: 3 px amarillo y, por fuera, 5 px de canto de asfalto. Dentro de una franja (pestañas, segmentado) el anillo va por dentro.
- **Error / Disabled:** inválido con borde rojo PARE más el error junto al campo (ícono y texto). Deshabilitado al 55 %.
- **Divisa:** tres opciones con punto, código y tecla; la elegida con borde de trazo doble.

### Avisos
Grilla de ícono y cuerpo, borde de 2 px y 8 px de radio. Advertencia: borde amarillo sobre `aviso-fondo`. Error: borde PARE sobre `error-fondo`. En el Cierre, el descuadre es una franja amarilla; de noche, una placa amarilla entera.

### Navigation
Las pestañas de sección sobre el asfalto: cuadro de color, nombre 700 13.5px y tecla de función (F1–F5). Hover en `asfalto-2`; la activa en `cabecera`, con borde de línea, sube 2 px y se funde con la cinta. «Salir» al final de la fila. Bajo 900 px es la barra inferior de 60 px de siempre: cuadro arriba, nombre corto abajo, la activa en `asfalto-2` con el anillo reflectante en su cuadro.

### Cinta
Los comandos de la pantalla, en grupos rotulados (11px 700 en mayúsculas, como una leyenda): los principales como botones grandes (ícono de 22 px arriba, rótulo y tecla abajo) y los demás apilados (ícono de 18 px, rótulo y tecla). Hover en `lamina` con borde de línea; el ícono va en `suave`, en `vial-hi` si confirma y en `pare` si reversa. Un grupo puede llevar una nota corta («Vigente desde 21:45»). Cada pantalla la declara con `useCinta()` y cada comando llama a lo mismo que su tecla. Es una barra de herramientas: una sola parada de Tab, y las flechas recorren sus botones. En una ventana baja se vuelve una sola fila sin rótulos.

### Barra de estado
Asfalto, 28 px, 12px 600: segmentos separados por una línea, con su ícono en `riel-suave`: el turno (en blanco «Turno abierto»), quién está y su rol, un punto verde «Conectado al servidor» (amarillo si no), la vigencia de la pizarra y, a la derecha, el día y la hora en Mono.

### Libro
La tabla del día, como una planilla (vuelta 3): cabecera fija en mayúsculas sobre un trazo de 2 px, filas de 32 px con líneas verticales y cebra (`cebra`), hover en `lamina` y la fila elegida con destacador amarillo y contorno amarillo de 2 px, como la celda activa. Lo reversado se tacha en PARE con el motivo debajo; lo pendiente va en `suave` con «Confirmar» como enlace en la misma línea. Al pie, la fila de totales: cuatro celdas rotuladas (Compras, Ventas, Margen del día, Caja en pesos) en cifras de 17 px sobre `cabecera`.

Las demás grillas del personal (conteo, clientes, usuarios, auditoría, configuración) siguen la misma regla: filas de 32 px, líneas verticales y cebra; la cebra no pesa (`:where()`) y cualquier estado de fila manda sobre ella.

### Grupos rotulados
En un formulario, los campos que van juntos se encierran en un grupo con su leyenda (11px 700 en mayúsculas, en `suave`), con borde de línea y 6 px de radio, como en un cuadro de diálogo: en el registro, «Operación» y «Monto y documento». La placa no lleva recuadro: su rótulo imita la leyenda.

### Teclas
`kbd` en Mono 700 11px, borde de 1 px con 2 px abajo, 4 px de radio. Sobre el verde y el asfalto toma el fondo de su superficie.

### Carga
Barras grises del tamaño de lo que viene, con un pulso de opacidad de 1.2s; sin spinner. Con movimiento reducido no hay transiciones ni animaciones.

## Do's and Don'ts

### Do:
- **Do** abrir cada pantalla con su letrero en el tono apagado de su función, con filete interior y la sombra del letrero.
- **Do** escribir toda cifra de dinero en IBM Plex Mono tabular, con `formatearMonto`/`formatearTasa`.
- **Do** mostrar la tecla de cada acción con `kbd` junto a su rótulo.
- **Do** usar el foco amarillo con canto de asfalto (3 px + 5 px) y medir 3:1 en cada superficie donde aparezca.
- **Do** acompañar cada color de estado con ícono o palabra (Phosphor en SVG, peso bold, 14–18 px).
- **Do** declarar el valor nocturno de cada token nuevo y comprobar AA sobre `panel` y `fondo` en los dos modos.

### Don't:
- **Don't** armar un dashboard de tarjetas de KPI con barra lateral clara y acento azul.
- **Don't** teñir paneles, fondos o títulos con un color de función o de divisa fuera de su letrero, el cuadro de su pestaña o su punto.
- **Don't** dejar un dato sin rótulo ni marco: cada cifra va en su columna con cabecera o en un grupo rotulado (vuelta 3).
- **Don't** poner sombra a paneles, campos o botones.
- **Don't** cambiar de noche el color de un letrero: los letreros quedan iguales y los blancos reflejan.
- **Don't** usar spinners: la carga se muestra con la forma de lo que viene.
