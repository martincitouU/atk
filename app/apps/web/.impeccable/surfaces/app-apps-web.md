---
version: 1
slug: "app-apps-web"
primary_target: "app/apps/web"
related_targets: []
---

# Surface brief — app/apps/web (ATK)

Modo: **Operate**. Pantallas: login, Ventanilla, Cierre del día, Jornada (teléfono), Clientes y Configuración. Claro y oscuro.

Audiencia y tarea: Rolando, solo en la ventanilla con un PC y teclado, registra de 80 a 150 operaciones al día (USD, ARS, EUR ↔ CLP); desde el teléfono consulta la jornada. El cliente no ve la pantalla. Éxito: registrar es más rápido que escribir en el libro.

Restricciones: contrato zod + mocks MSW (sin rutas HTTP todavía); dinero como `bigint`/string, con `formatearMonto` y `formatearTasa`; `Enter` confirma desde la vista previa y `B` deja borrador; CSS propio con tokens, sin librería de componentes; WCAG AA; desde 360 px.

Abierto: denominaciones sin tabla (ayuda de conteo en el front); configuración solo de lectura.

## Direction contract

THESIS: la ventanilla se lee como un letrero de ruta chileno: las divisas son destinos y las tasas sus distancias, legibles de un vistazo. Rechaza el dashboard de tarjetas de KPI con barra lateral clara y acento azul.

OWN-WORLD: verde vial (#005C45) solo en la pizarra-letrero, con su filete blanco interior redondeado; riel de asfalto (#1D2226) con un color de función por sección (verde Ventanilla, amarillo Cierre, café Jornada, azul servicios Clientes); fondo gris claro de lámina; Overpass y Overpass Mono tabular; un color fijo por divisa; amarillo de advertencia para cambios y descuadres, naranja de faena para borradores, rojo PARE para el reverso. En oscuro, letreros bajo los focos: los blancos reflejan.

STORY: Rolando ve la pizarra, escribe C/V, la divisa y el monto, lee la placa de la vista previa y pulsa Enter; la operación cae en el libro del día. Cree que el sistema no le miente con el dinero.

FIRST VIEWPORT: riel de 208 px a la izquierda; arriba, la pizarra-letrero a todo el ancho (tres destinos, compra y venta en cifras de 21–26 px); debajo, el registro (420 px) con la placa invertida y «Confirmar» verde, y el libro del día a la derecha con sus totales al pie.

FORM: candidato 5 de 7 de la lista propia (señalética vial de la Carretera Austral); seed fc087548; movimiento propio: la tasa que cambió queda encendida con borde reflectante hasta que se mira.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Vuelta 3 (sesión 057, pendiente de elección): profesional tipo Office

Alonso pide estructura de software de escritorio sin perder la temática: paneles con título y recuadro (grupos rotulados), grillas tipo Excel (líneas, encabezado fijo, cebra, fila elegida con contorno amarillo), barra de estado abajo (turno, caja, usuario, conexión, vigencia de la pizarra, hora) y barra de comandos arriba con los atajos. La pizarra pasa a ser una tabla dentro del letrero verde: Divisa | Compra | Venta | Cambio, con la fila que cambió contorneada en amarillo. Comps en `.impeccable/mocks/office/` (A riel + barra, B pestañas de cinta —recomendado—, C pizarra acoplada) y la lámina `comparacion.png`. El portal `/mi` no cambia. Hasta que Alonso elija, el FIRST VIEWPORT de arriba sigue siendo el construido.
