#!/usr/bin/env node
/**
 * Genera index.json (el "manejador de contenidos").
 *
 * Escanea las carpetas de sección (toc/, boletin/, finanzas/) y produce, para
 * cada una, un index.json con la lista de artículos ordenada de más reciente a
 * más antigua. Ese JSON es lo que assets/js/content.js consume para dibujar el
 * menú lateral y el paginador.
 *
 * Convención de nombres de archivo (subida manual):
 *   YYYY-MM-DD-<Serie-NN>:<Título>.md        ej. 2026-09-07-Boletin-01:Fondos de Noruega.md
 *
 * Uso:
 *   node scripts/build-index.mjs [seccion ...]     (sin argumentos: todas)
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/i;

// Secciones que participan del manejador de contenidos.
const SECTIONS = {
  toc:     { label: 'Teoría de Restricciones' },
  boletin: { label: 'Boletines' },
  finanzas: { label: 'Servicios Financieros' },
};

async function buildSection(name, meta) {
  const dir = join(REPO_ROOT, name);
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));

  const articles = files.map((file) => {
    const m = DATE_PREFIX_RE.exec(file);
    return {
      date: m ? m[1] : '',                       // fecha ISO YYYY-MM-DD ('' si no cumple el formato)
      title: m ? m[2] : file.replace(/\.md$/i, ''), // nombre visible (sin prefijo de fecha)
      file,
    };
  });

  // Más recientes primero; empate -> nombre de archivo descendente (estable).
  articles.sort((a, b) => (b.date || '0000').localeCompare(a.date || '0000') || b.file.localeCompare(a.file));

  const index = {
    section: name,
    label: meta.label,
    generated: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`${name}/index.json  ->  ${articles.length} artículo(s)`);
  for (const a of articles) {
    console.log(`   ${a.date || '????-??-??'}  ${a.file}`);
  }
}

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(SECTIONS);
  for (const name of names) {
    if (!SECTIONS[name]) {
      console.error(`Sección desconocida: ${name} (disponibles: ${Object.keys(SECTIONS).join(', ')})`);
      process.exitCode = 1;
      continue;
    }
    await buildSection(name, SECTIONS[name]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});