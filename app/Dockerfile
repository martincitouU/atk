# Imagen de la app (contrato con la infra en CLAUDE.md): escucha en PORT,
# guarda SQLite en DATABASE_PATH, corre como UID 1000 y responde /health.
# Se construye desde app/: docker build -t atk-app app

# --- 1. Dependencias de producción ------------------------------------
# better-sqlite3 es un módulo nativo: si no hay binario precompilado para
# la plataforma, se compila. Las herramientas quedan solo en esta etapa.
FROM node:24-slim AS dependencias
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev

# --- 2. Imagen final ---------------------------------------------------
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencias /app/node_modules node_modules
# El código queda de root: el usuario de la app puede leerlo pero no modificarlo
COPY package.json ./
COPY db db
COPY apps/api apps/api

# Usuario sin privilegios de la imagen (UID 1000): Ansible deja la carpeta
# de datos con ese dueño (atk_app_uid). /data de la imagen solo sirve para
# volúmenes de Docker en local; en la VM la reemplaza el disco montado.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Node 24 corre TypeScript directo: no hay paso de compilación
CMD ["node", "apps/api/src/principal.ts"]
