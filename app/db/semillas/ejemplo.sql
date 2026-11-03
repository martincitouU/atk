-- =====================================================================
--  Datos semilla de EJEMPLO (los mismos del diseño original).
--  Solo para desarrollo y tests: NUNCA se cargan en producción.
--  Todas las cifras (márgenes, tasas, umbrales) son de ejemplo y deben
--  reemplazarse por las validadas con el mandante (OE1).
--
--  Recordatorio de unidades:
--    montos       → unidad mínima de su moneda (USD en centavos, CLP en pesos)
--    columnas _e6 → valor × 1.000.000
-- =====================================================================

INSERT INTO moneda (codigo, nombre, simbolo, decimales) VALUES
    ('CLP', 'Peso chileno',          '$',   0),
    ('USD', 'Dólar estadounidense',  'US$', 2),
    ('EUR', 'Euro',                  '€',   2),
    ('BRL', 'Real brasileño',        'R$',  2),
    ('ARS', 'Peso argentino',        'AR$', 2);

INSERT INTO casa (id, rut, razon_social, nombre_fantasia, moneda_base)
VALUES (1, '76123456-7', 'Casa de Cambio Demo SpA', 'Cambios Demo', 'CLP');

-- monto_minimo en unidad mínima: US$ 1 = 100, € 5 = 500, R$ 10 = 1000, AR$ 1000 = 100000
INSERT INTO casa_moneda (moneda_codigo, decimales_tasa, monto_minimo, orden_pizarra) VALUES
    ('USD', 2,    100, 1),
    ('EUR', 2,    500, 2),
    ('BRL', 2,   1000, 3),
    ('ARS', 4, 100000, 4);   -- el ARS cotiza bajo 1 CLP: su precio necesita más decimales

INSERT INTO sucursal (nombre, direccion, comuna)
VALUES ('Casa Matriz', 'Dirección de ejemplo 123', 'Santiago');

INSERT INTO caja (sucursal_id, nombre) VALUES (1, 'Caja 1'), (1, 'Caja 2');

-- Sin contraseñas: las credenciales las crea Better Auth (fase 4)
INSERT INTO usuario (rut, nombre, email, rol) VALUES
    ('11111111-1', 'Administrador', 'admin@demo.cl',      'ADMIN'),
    ('22222222-2', 'Supervisor',    'supervisor@demo.cl', 'SUPERVISOR'),
    ('33333333-3', 'Cajero',        'cajero@demo.cl',     'CAJERO');

INSERT INTO parametro (clave, valor, tipo_dato, descripcion) VALUES
    ('zona_horaria',                       'America/Santiago', 'TEXTO',    'Zona horaria para cortes diarios'),
    ('umbral_identificacion_cliente',      '1000000',          'ENTERO',   'Monto en unidad mínima de la moneda base desde el cual se exige identificar al cliente (validar con normativa vigente)'),
    ('permitir_saldo_negativo',            'false',            'BOOLEANO', 'Si es false, no se puede vender divisa sin stock en caja'),
    ('vigencia_cotizacion_minutos',        '720',              'ENTERO',   'Minutos que una pizarra es válida antes de exigir republicarla'),
    ('anulacion_requiere_supervisor',      'true',             'BOOLEANO', 'Si las anulaciones requieren rol SUPERVISOR o ADMIN'),
    ('desviacion_maxima_preferencial_pct', '5',                'DECIMAL',  'Desviación máxima de una tasa preferencial respecto de la pizarra, en %');

-- Márgenes en % ×10^6; tramos en unidad mínima de la divisa (US$ 5.000 = 500000)
INSERT INTO regla_spread (moneda_codigo, tipo_margen, margen_compra_e6, margen_venta_e6, monto_desde, monto_hasta) VALUES
    ('USD', 'PORCENTAJE', 1500000, 1500000,      0, 500000),  -- id 1: tramo base
    ('USD', 'PORCENTAJE', 1000000, 1000000, 500000,   NULL),  -- id 2: tramo mayorista
    ('EUR', 'PORCENTAJE', 2000000, 2000000,      0,   NULL),  -- id 3
    ('BRL', 'PORCENTAJE', 3000000, 3000000,      0,   NULL),  -- id 4
    ('ARS', 'PORCENTAJE', 5000000, 5000000,      0,   NULL);  -- id 5: mayor volatilidad → mayor spread

-- Tasas de referencia de EJEMPLO (no son valores de mercado reales)
INSERT INTO tasa_referencia (moneda_codigo, valor_e6, registrada_por) VALUES
    ('USD',  940000000, 1),   -- id 1:  940,00
    ('EUR', 1020000000, 1),   -- id 2: 1020,00
    ('BRL',  170000000, 1),   -- id 3:  170,00
    ('ARS',     750000, 1);   -- id 4:    0,75

-- Pizarra inicial. En la app la calculará el servicio de precios (fase 3);
-- aquí va precalculada con la misma regla del diseño original:
--   compra = ref × (1 − margen)  redondeado HACIA ABAJO a decimales_tasa
--   venta  = ref × (1 + margen)  redondeado HACIA ARRIBA a decimales_tasa
INSERT INTO cotizacion (moneda_codigo, tasa_referencia_id, regla_spread_id,
                        precio_compra_e6, precio_venta_e6, publicada_por) VALUES
    ('USD', 1, 1,  925900000,  954100000, 1),   --  925,90 /  954,10
    ('EUR', 2, 3,  999600000, 1040400000, 1),   --  999,60 / 1040,40
    ('BRL', 3, 4,  164900000,  175100000, 1),   --  164,90 /  175,10
    ('ARS', 4, 5,     712500,     787500, 1);   --  0,7125 /  0,7875
