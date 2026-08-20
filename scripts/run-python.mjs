import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const candidates = process.platform === 'win32'
  ? [path.join(root, '.venv', 'Scripts', 'python.exe'), 'python']
  : [path.join(root, '.venv', 'bin', 'python'), 'python3', 'python'];
const executable = candidates.find(candidate => !candidate.includes(path.sep) || existsSync(candidate));

if (!executable) {
  console.error('Python was not found. Create .venv or add Python to PATH.');
  process.exit(1);
}

const child = spawn(executable, process.argv.slice(2), {
  cwd: root,
  env: process.env,
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', error => {
  console.error(`Could not start ${executable}:`, error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
