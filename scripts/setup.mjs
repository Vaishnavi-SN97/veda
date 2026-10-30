// One-time setup: Python venv + packages, frontend packages, database tables, syllabus, demo data.
//   npm run setup
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const win = process.platform === "win32";
const backend = join(root, "backend");
const python = join(backend, ".venv", win ? "Scripts/python.exe" : "bin/python");

function run(cmd, args, cwd, label) {
  console.log(`\n== ${label}`);
  // Only npm needs a shell on Windows; a shell would split paths with spaces ("Windows 11").
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: win && cmd === "npm" });
}

if (!existsSync(join(root, ".env"))) {
  console.error("Missing .env in the project root (DATABASE_URL, DIRECT_URL, DEMO_MODE, ...).");
  process.exit(1);
}
if (!existsSync(python)) run(win ? "python" : "python3", ["-m", "venv", ".venv"], backend, "Create backend/.venv");
run(python, ["-m", "pip", "install", "-r", "requirements.txt"], backend, "Install backend packages");
run("npm", ["install"], join(root, "frontend"), "Install frontend packages");
run(python, ["-m", "alembic", "upgrade", "head"], backend, "Create/upgrade database tables");
run(python, ["scripts/import_syllabus.py"], backend, "Import syllabus from docs/syllabus/*.pdf");
run(python, ["scripts/seed_demo.py"], backend, "Load demo data");
console.log("\nDone. Start everything with: npm run dev");
