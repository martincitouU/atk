// npm run dev: la API (:3000, base local de desarrollo) y el front (Vite,
// :5173) juntos. Se abre http://localhost:5173. Ctrl+C detiene los dos.
//
// Es un script y no "comando1 & comando2" porque el shell ignora Ctrl+C en
// lo que corre con "&", y la API quedaría ocupando el puerto 3000.

import { spawn } from "node:child_process";

const procesos = [
  spawn("npm", ["run", "dev", "--workspace=@atk/api"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "--workspace=@atk/web"], { stdio: "inherit" }),
];

let deteniendo = false;
function detenerTodo(codigo = 0) {
  if (deteniendo) return;
  deteniendo = true;
  for (const proceso of procesos) proceso.kill("SIGTERM");
  process.exitCode = codigo;
}

process.on("SIGINT", () => detenerTodo());
process.on("SIGTERM", () => detenerTodo());
// Si uno se cae (por ejemplo, el puerto está ocupado), se detiene el otro
for (const proceso of procesos) proceso.on("exit", (codigo) => detenerTodo(codigo ?? 0));
