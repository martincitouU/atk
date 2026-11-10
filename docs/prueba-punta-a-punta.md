# Prueba de punta a punta

Un día completo de la casa de cambio, desde una base vacía, con la imagen
real de la app detrás de Nginx: lo mismo que corre en la VM. Se hace a mano
en el navegador, antes de cada despliegue que cambie cómo se opera.

**Nunca en producción:** una operación confirmada y la auditoría no se pueden
borrar. La prueba quedaría para siempre en la base real.

## Preparar el stack local

El stack local arranca sin login (no existen los archivos de `/etc/atk`). Un
archivo de compose adicional, **fuera del repo**, le da un secreto aleatorio:

```bash
cat > /tmp/atk-e2e.yaml <<EOF
services:
  app:
    environment:
      BETTER_AUTH_SECRET: "$(openssl rand -hex 32)"
      BETTER_AUTH_URL: "http://localhost:8080"
EOF
cd deploy && rm -rf data
CODIGO=../app HTTP_PORT=8080 docker compose -p atk-e2e -f compose.yaml -f /tmp/atk-e2e.yaml up -d --build --wait
docker compose -p atk-e2e -f compose.yaml -f /tmp/atk-e2e.yaml exec app node apps/api/src/cli/inicializar.ts
```

`inicializar` pregunta los datos de la casa y del primer admin (en una
terminal de verdad: necesita escribir la contraseña sin mostrarla).

Al terminar:

```bash
docker compose -p atk-e2e -f compose.yaml -f /tmp/atk-e2e.yaml down && rm -rf data
```

## Los pasos

Cada paso dice qué debe pasar. Si algo no pasa, se anota y se corrige antes
de desplegar.

### Admin
1. Entra con la cuenta de `inicializar`. La pizarra muestra "Sin tasa".
2. Publica USD (referencia 940, márgenes 1,5 %) y EUR (1020, 2 %). La
   pizarra muestra compra 925,90 / venta 954,10 para USD.
3. Administración › Fidelización: crea "Frecuente" con 30 %.
4. Administración › Personal: crea una cajera y un supervisor.

### Cajera
5. Abre turno en Caja 1 y registra el fondo inicial: CLP 10.000.000,
   USD 10.000 y EUR 2.000. Los saldos y el libro de caja se actualizan.
6. Crea la ficha completa de un cliente con RUT, con la categoría Frecuente.
7. Venta de US$ 100: el cálculo aparece al escribir ($ 95.410). Registra el
   borrador y lo confirma escribiendo el folio en el diálogo.
8. Venta de US$ 6.000: aparece "Requiere ficha (UAF)". Elige al cliente
   (la tasa baja por la categoría), escribe el propósito y confirma.
9. Venta de US$ 200 con tasa preferencial 950: el borrador no se puede
   confirmar sin autorización.
10. Compra de € 100 con folio: queda en borrador.
11. Registra un gasto en efectivo.

### Supervisor
12. Autoriza la tasa preferencial del paso 9.
13. Reversa la venta del paso 7 con motivo: el detalle muestra quién y por qué.
14. Reversa el gasto con motivo: el dinero vuelve a la caja.

### Admin
15. Publica una tasa nueva de EUR (referencia 1030).

### Cajera
16. Confirma la compra del paso 10: la API no deja (la pizarra cambió) y el
    diálogo ofrece "Recalcular". Recalcula, revisa los montos nuevos y confirma.
17. Confirma la venta preferencial del paso 9.
18. Intenta cerrar el turno con un borrador pendiente: no deja y dice por qué.
19. Cierra el turno contando $ 1.000 de menos: el arqueo muestra la diferencia.

### Cliente y supervisor
20. Sin sesión, registra una cuenta del portal con el RUT de la ficha del paso 6.
21. El supervisor (o la cajera) la verifica en Clientes › Cuentas del portal.
22. El supervisor registra el ajuste de -1.000 CLP: el saldo queda igual a lo contado.
23. El cliente entra y ve su operación del paso 8, con su tasa y su boleta.

## Última vez

**10 de noviembre de 2026** (F3, antes del primer despliegue del front):
pasaron todos los pasos, con una excepción que se corrigió. En el paso 17,
guardar el folio en el diálogo de confirmar borraba la autorización del
paso 12: la API recalculaba el borrador al editarlo y la autorización se
perdía. Ahora se conserva si la edición no cambia el precio ni el monto
(test en `servicios/operaciones.test.ts`), y el caso se repitió con la
imagen corregida.

La pizarra vence a las 12 horas (`vigencia_cotizacion_minutos`): si la prueba
cruza la noche, el admin debe volver a publicar antes de seguir.
