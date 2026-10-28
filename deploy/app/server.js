// App de prueba de la infraestructura, no la app real. Solo comprueba el
// contrato con la infra: escuchar en PORT y poder escribir junto a DATABASE_PATH.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
  console.error("Falta la variable de entorno DATABASE_PATH");
  process.exit(1);
}

const dataDir = path.dirname(databasePath);
// Se escribe en cada /health: prueba que el disco de datos acepta escrituras
const probeFile = path.join(dataDir, ".healthcheck");
// Se escribe solo la primera vez: si sobrevive a recrear el contenedor,
// el volumen es persistente
const firstBootFile = path.join(dataDir, ".first-boot");

function checkDataDir() {
  fs.writeFileSync(probeFile, new Date().toISOString());
  if (!fs.existsSync(firstBootFile)) {
    fs.writeFileSync(firstBootFile, new Date().toISOString());
  }
  return fs.readFileSync(firstBootFile, "utf8");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    try {
      sendJson(res, 200, { status: "ok", firstBoot: checkDataDir() });
    } catch (err) {
      console.error(`No se puede escribir en ${dataDir}: ${err.message}`);
      sendJson(res, 503, { status: "error", detail: "carpeta de datos no escribible" });
    }
    return;
  }

  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ATK ok\n");
    return;
  }

  sendJson(res, 404, { status: "not found" });
});

server.listen(port, () => {
  console.log(`Escuchando en el puerto ${port}`);
});

// docker stop manda SIGTERM: se cierra limpio en vez de esperar el SIGKILL
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
