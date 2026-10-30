#!/usr/bin/env node
/**
 * Runs the API and the Expo dev server together.
 *
 * Both are long-lived and both write to stdout, so their output is prefixed and
 * a failure in either brings the other down — a half-running stack is more
 * confusing than a stopped one.
 */
import { spawn } from 'node:child_process';
import { platform } from 'node:process';

const npm = platform === 'win32' ? 'npm.cmd' : 'npm';

const services = [
  { name: 'api', color: '\u001b[36m', args: ['--prefix', 'apps/api', 'run', 'dev'] },
  { name: 'app', color: '\u001b[35m', args: ['--prefix', 'apps/slate', 'run', 'start'] },
];

const children = services.map((service) => {
  const child = spawn(npm, service.args, { stdio: ['ignore', 'pipe', 'pipe'], shell: platform === 'win32' });
  const prefix = `${service.color}[${service.name}]\u001b[0m `;

  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }

  child.on('exit', (code) => {
    process.stdout.write(`${prefix}exited with ${code}\n`);
    shutdown(code ?? 0);
  });

  return child;
});

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
