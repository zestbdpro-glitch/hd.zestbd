import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';

export const root = process.cwd();
export const localDirectory = path.join(root, '.local');
export const phpBinary = process.env.PHP_BINARY || (existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
const mysqlDirectory = process.env.MYSQL_DIRECTORY || 'C:/xampp/mysql';

export function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(binary)} exited with code ${code}`)));
  });
}

export async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

export async function writePhpConfig(file, config) {
  const json = JSON.stringify(config).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  await writeFile(file, `<?php\nreturn json_decode('${json}', true);\n`);
}

export async function ensureMysql() {
  await mkdir(localDirectory, { recursive: true });
  const credentialsFile = path.join(localDirectory, 'mysql.json');
  const dataDirectory = path.join(localDirectory, 'mysql');
  if (!existsSync(path.join(dataDirectory, 'mysql'))) {
    if (await portOpen(3307)) throw new Error('Port 3307 is already in use. Stop that service or configure an existing database manually.');
    const installer = path.join(mysqlDirectory, 'bin', 'mysql_install_db.exe');
    if (!existsSync(installer)) throw new Error('For local setup, install XAMPP or configure server/config.local.php with an existing MySQL database.');
    await run(installer, [`--datadir=${dataDirectory}`, '--port=3307', '--silent']);
    await writeFile(credentialsFile, JSON.stringify({ password: randomBytes(24).toString('hex'), initialized: false }));
  }
  if (!existsSync(credentialsFile)) throw new Error('Local database credentials are missing.');
  if (!(await portOpen(3307))) {
    const log = await open(path.join(localDirectory, 'mysql.log'), 'a');
    const child = spawn(path.join(mysqlDirectory, 'bin', 'mysqld.exe'), [
      '--no-defaults', `--basedir=${mysqlDirectory}`, `--datadir=${dataDirectory}`, '--bind-address=127.0.0.1', '--port=3307',
      '--skip-name-resolve', '--max-allowed-packet=32M', '--innodb-buffer-pool-size=64M', `--pid-file=${path.join(localDirectory, 'mysql.pid')}`
    ], { detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    child.unref();
    await log.close();
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await portOpen(3307)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!(await portOpen(3307))) throw new Error('MariaDB could not start. See .local/mysql.log.');
  }
  return JSON.parse(await readFile(credentialsFile, 'utf8'));
}

export async function localConfig(database = 'decor_local', url = 'http://127.0.0.1:5173') {
  const credentials = await ensureMysql();
  return {
    environment: 'development', site_url: url,
    db: { host: '127.0.0.1', port: 3307, name: database, user: 'root', password: credentials.password },
    setup_token: randomBytes(32).toString('hex'), turnstile_site_key: '', turnstile_secret_key: '', require_turnstile: false,
    rate_limit_max_orders: 100, rate_limit_window_seconds: 3600,
  };
}
