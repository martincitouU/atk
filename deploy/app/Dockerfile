# Imagen de prueba de la infraestructura (ver server.js).
# Node 24 es la versión LTS; slim trae lo justo para correr Node.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# El código queda de root: el usuario de la app puede leerlo pero no modificarlo
COPY server.js .

# Usuario sin privilegios que trae la imagen (UID 1000). Ansible deja la
# carpeta de datos con ese mismo dueño (atk_app_uid en group_vars).
USER node

EXPOSE 3000

# La imagen slim no trae curl; se usa el fetch de Node
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Forma exec (lista): Node es el proceso 1 y recibe el SIGTERM de docker stop
CMD ["node", "server.js"]
