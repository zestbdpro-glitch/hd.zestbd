import { cp, mkdir, readdir } from 'node:fs/promises';
await mkdir('dist/private', { recursive: true });
for (const file of await readdir('server')) {
  if (file.endsWith('.php') && file !== 'config.local.php' || file === '.htaccess') {
    await cp(`server/${file}`, `dist/private/${file}`);
  }
}
console.log('PHP backend packaged in dist/private. Local credentials are excluded.');
