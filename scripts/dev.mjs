// Start backend (FastAPI on :8000) and frontend (Next.js on :3000) together.
//   npm run dev        development (hot reload for the frontend)
//   npm start          production build: faster, offline service worker on; use this for demos
// Ctrl+C stops both. Demo vs real mode: DEMO_MODE in backend/.env.
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const win = process.platform === "win32";
const python = join(root, "backend", ".venv", win ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python) || !existsSync(join(root, "frontend", "node_modules"))) {
  console.error("First run `npm run setup` (creates backend/.venv and installs packages).");
  process.exit(1);
}

const procs = [];
function start(name, color, cmd, args, cwd) {
  // Only npm needs a shell on Windows (npm.cmd); paths with spaces ("Windows 11") break under a shell.
  const p = spawn(cmd, args, { cwd, shell: win && cmd === "npm", env: { ...process.env, FORCE_COLOR: "1", PYTHONUNBUFFERED: "1" } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(tag + l + "\n");
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on("exit", (code) => {
    console.log(`${tag}stopped (${code})`);
    stopAll();
  });
  procs.push(p);
}

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    if (win) spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

// No --reload: on Windows its reloader stopped the API (instead of restarting it) whenever any file
// under backend/ changed. Restart `npm run dev` after editing backend code.
const prod = process.argv.includes("--prod");
if (prod) {
  console.log("Building the frontend (production)…");
  execSync("npm run build", { cwd: join(root, "frontend"), stdio: "inherit", shell: true });
}
start("api", "36", python, ["-m", "uvicorn", "app.main:app", "--port", "8000"], join(root, "backend"));
start("web", "35", "npm", ["run", prod ? "start" : "dev"], join(root, "frontend"));
console.log(`Veda (${prod ? "production" : "development"}): frontend and API are starting  ·  Ctrl+C to stop`);
