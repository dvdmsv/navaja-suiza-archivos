// Comprueba que todos los iconos que usa el código están en el subconjunto.
//
// La fuente de iconos viene recortada a los que se usan (scripts/generar-iconos.py),
// así que usar uno nuevo sin regenerar dejaría un hueco en blanco en la interfaz
// sin que nada fallara. Esto lo convierte en un error de compilación.
//
// Sin dependencias a propósito: corre con `node` a secas, en local y en la CI.
//
//   node scripts/comprobar-iconos.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function ficheros(carpeta) {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
  });
}

const usados = new Set();
for (const f of ficheros(join(raiz, 'src'))) {
  if (!['.html', '.ts', '.css'].includes(extname(f))) continue;
  if (f.includes('estilos/iconos')) continue;   // el propio CSS generado
  for (const [, nombre] of readFileSync(f, 'utf8').matchAll(/\bbi-([a-z0-9-]+)/g)) {
    usados.add(nombre);
  }
}

const css = readFileSync(join(raiz, 'src/estilos/iconos/iconos.css'), 'utf8');
const disponibles = new Set([...css.matchAll(/\.bi-([a-z0-9-]+)::before/g)].map((m) => m[1]));

const faltan = [...usados].filter((n) => !disponibles.has(n)).sort();
const sobran = [...disponibles].filter((n) => !usados.has(n)).sort();

if (faltan.length) {
  console.error(`\nEstos iconos se usan pero no están en la fuente recortada:\n  ${faltan.join('\n  ')}`);
  console.error('\nRegenérala:  python3 scripts/generar-iconos.py\n');
  process.exit(1);
}
if (sobran.length) {
  console.error(`\nEstos iconos están en la fuente pero ya no se usan: ${sobran.join(', ')}`);
  console.error('Regenera para quitarlos:  python3 scripts/generar-iconos.py\n');
  process.exit(1);
}
console.log(`Los ${usados.size} iconos que usa la aplicación están en el subconjunto.`);
