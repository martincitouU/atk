# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Rolando del Río**, dueño y único operador de una casa de cambio en Coyhaique (Patagonia chilena). Atiende solo, en la ventanilla, de 80 a 150 operaciones al día en USD, ARS y EUR contra pesos chilenos. Maneja el computador con soltura y usa Excel a diario; lee bien.
- Registra en un **PC del mostrador**, con teclado. El cliente está al otro lado y **no ve la pantalla**.
- Fuera del local consulta la caja y los márgenes del día **desde el teléfono**.
- El sistema admite roles (ADMIN, SUPERVISOR, CAJERO) y varias cajas, pero la primera instalación tiene un solo usuario y una sola caja.

## Product Purpose

Reemplazar el libro de papel y la transcripción nocturna a Excel (de 2 a 3 horas diarias) por un registro único:
- cada compra, venta, gasto y retiro se anota una sola vez, en el momento;
- la jornada cierra con la posición por divisa cuadrada contra el arqueo físico;
- el dueño conoce su caja y sus márgenes a distancia;
- los antecedentes que piden la UAF y el contador salen sin transcribir.

Éxito: Rolando deja la planilla y no vuelve al papel como registro principal.

## Positioning

Es un producto configurable para casas de cambio chilenas pequeñas: las divisas, las denominaciones, la pizarra con su spread, los umbrales de la UAF y el formato del contador son datos de la instalación, no código. La reportería está construida sobre la normativa chilena (el ROE trimestral de la UAF y la ficha desde USD 5.000), con un motor que lee las planillas que el cliente ya tiene. La casa de Rolando es la primera instalación.

## Operating Context

- **La ventanilla**:
  - el cliente pide comprar o vender;
  - Rolando mira la **pizarra de tasas** (compra y venta por divisa), registra y entrega el efectivo;
  - el DTE se emite por el canal del SII y en el sistema solo se anota su folio.
- **El flujo de una operación**:
  - en **borrador** se edita y no mueve la caja;
  - **confirmada**, mueve la caja y no se puede tocar;
  - **reversada**, solo con un motivo y con movimientos inversos.
  - En la interfaz, `Enter` confirma desde la vista previa (es el caso normal), y otra tecla deja la operación como borrador.
- **El turno y el cierre**: se abre el turno con su caja; al cierre se cuentan los billetes de cada divisa y se compara con el saldo teórico. Las diferencias no se ajustan solas.
- **La pizarra**: al confirmar se recalcula contra la pizarra vigente, y si cambió desde el borrador no se confirma.
- **Los artefactos que Rolando ya conoce**: el libro contable de papel, la pizarra de tasas del local y la planilla Excel.

## Capabilities and Constraints

- **El dinero es exacto**:
  - los montos son enteros en la unidad mínima de cada divisa, y viajan como string en JSON;
  - las tasas, enteras ×10⁶;
  - el redondeo va a favor de la casa;
  - el formato es chileno: `1.234.567,89`.
- **El stack del front**: React + Vite + React Router + TanStack Query + react-hook-form + zod, en `app/apps/web`, y CSS propio con tokens, sin librería de componentes.
- **El backend**: Fastify + SQLite. Hoy existen los servicios de dominio, pero no hay rutas HTTP, así que el front trabaja contra un contrato zod (`app/packages/shared`) con mocks.
- **Sin backend todavía**:
  - la edición de divisas, denominaciones y parámetros (solo lectura);
  - las denominaciones, que no están en el esquema: el cierre recibe el total por divisa.
- **Fuera de esta etapa**: los reportes, la carga del histórico, la interfaz de fidelización, la consulta de auditoría, el registro diferido y el modo offline.
- **Los términos del dominio**: compra, venta, pizarra, spread, tasa, arqueo, turno, caja, folio DTE (34 o 41), ficha UAF, ROE y reverso.
- Se requiere conexión a internet; sin ella se vuelve al libro físico.

## Brand Commitments

- El nombre es **ATK**. La interfaz va en español de Chile.
- Las referencias visuales las fijó el equipo: **el libro contable, la pizarra de tasas, la caja registradora densa (con el teclado primero) y la identidad patagónica**. Van en **claro y en oscuro**.
- Evitar el look típico de una app hecha con IA.
- **La estructura de un programa de escritorio, como los de Office** (decisión del 2026-11-08, vuelta 3): barra de título, pestañas de sección con su tecla, una cinta de comandos con grupos rotulados, paneles con barra de título, grillas compactas tipo planilla y una barra de estado. La identidad «Carretera Austral» vive en el color, los letreros y Overpass. Cada dato va rotulado y enmarcado: nada «suelto».

## Evidence on Hand

- Los RF y RNF del informe del equipo (`Informe_ATK_Tema_del_Proyecto.docx`, fuera del repo).
- La semilla de ejemplo: `app/db/semillas/ejemplo.sql`.
- **No hay** datos reales del cliente, capturas del libro ni de la planilla, ni logotipo. La interfaz usa datos sintéticos rotulados como tales, y nunca datos reales mientras no haya HTTPS.

## Product Principles

1. **Una sola vez, en el momento**: cada pantalla sirve para registrar en la ventanilla sin volver atrás ni transcribir.
2. **El teclado primero**: el caso normal se completa sin ratón, en a lo más cinco campos y en menos de 2 segundos.
3. **El dinero no miente**: los montos son exactos, en el formato chileno, con lo teórico frente a lo contado, y un descuadre nunca se esconde.
4. **Lo que dice el backend se muestra tal cual**: los errores de negocio llegan en español y no se reescriben.
5. **Familiar antes que ingenioso**: Rolando tiene que reconocer su libro y su pizarra, no aprender una app.
6. **Todo lo de la cinta tiene su tecla, y al revés**: la cinta muestra los atajos y hace lo mismo que ellos; quien usa el ratón aprende el teclado mirándola.

## Accessibility & Inclusion

WCAG 2.1 AA:
- foco visible;
- se usa por completo con teclado;
- `prefers-reduced-motion` respetado;
- se opera desde 360 px de ancho (RNF-09).
