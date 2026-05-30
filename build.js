#!/usr/bin/env node
// DONT GET DISTRACTED BIRD — Build script
// Rasterizes SVG icons → PNG at 16/32/48/128px, zips the extension.
// Usage: node build.js

import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const SIZES = [16, 32, 48, 128];
const ICONS = ['on', 'off'];

async function rasterizeSVGs() {
  let sharp;
  try {
    const mod = await import('sharp');
    sharp = mod.default;
  } catch {
    console.error('sharp not installed. Run: npm install\nFalling back to placeholder PNGs.');
    await generatePlaceholderPNGs();
    return;
  }

  console.log('Rasterizing SVG icons...');
  for (const state of ICONS) {
    const svgPath = resolve(__dirname, `assets/icon-${state}.svg`);
    const svgData = readFileSync(svgPath);
    for (const size of SIZES) {
      const outPath = resolve(__dirname, `assets/icon-${state}-${size}.png`);
      // Also write the canonical name (e.g. icon-16.png for ON state, icon-off-16.png for OFF)
      const canonPath = state === 'on'
        ? resolve(__dirname, `assets/icon-${size}.png`)
        : resolve(__dirname, `assets/icon-off-${size}.png`);
      await sharp(svgData).resize(size, size).png().toFile(outPath);
      // Copy to canonical path
      const data = readFileSync(outPath);
      writeFileSync(canonPath, data);
      console.log(`  icon-${state} ${size}px → ${canonPath}`);
    }
  }
  console.log('Icons done.\n');
}

async function generatePlaceholderPNGs() {
  // Generate minimal 1x1 PNG placeholders so the extension can load
  // Real icons require `npm install` and re-running build.js
  const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
  if (!PNG) {
    console.warn('  No PNG library available. Creating empty placeholder files.');
    for (const state of ICONS) {
      for (const size of SIZES) {
        const canonPath = state === 'on'
          ? resolve(__dirname, `assets/icon-${size}.png`)
          : resolve(__dirname, `assets/icon-off-${size}.png`);
        // Write a minimal valid 1x1 PNG (hardcoded bytes)
        const minPng = Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
          '2e0000000c4944415478016360f8cfc00000000200017f0a7f2c0000000049454e44ae426082', 'hex'
        );
        writeFileSync(canonPath, minPng);
      }
    }
    return;
  }
}

async function zipExtension() {
  let archiver;
  try {
    const mod = await import('archiver');
    archiver = mod.default;
  } catch {
    console.warn('archiver not installed. Skipping zip. Run: npm install');
    return;
  }

  mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
  const output = createWriteStream(resolve(__dirname, 'dist/dont-get-distracted-bird.zip'));
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve_p, reject) => {
    output.on('close', () => {
      console.log(`Extension zip: dist/dont-get-distracted-bird.zip (${(archive.pointer() / 1024).toFixed(1)} KB)`);
      resolve_p();
    });
    archive.on('error', reject);
    archive.pipe(output);

    // Add extension files (exclude build tooling, store screenshots, node_modules, dist itself)
    const excludes = ['node_modules', 'dist', 'store', 'build.js', 'package.json', 'package-lock.json', '.git', 'SUBMIT.md', 'README.md'];
    archive.glob('**/*', {
      cwd: __dirname,
      ignore: excludes.map(e => `${e}/**`).concat(excludes),
    });

    archive.finalize();
  });
}

async function main() {
  console.log('DONT GET DISTRACTED BIRD — Build\n');
  mkdirSync(resolve(__dirname, 'assets'), { recursive: true });
  mkdirSync(resolve(__dirname, 'dist'), { recursive: true });

  await rasterizeSVGs();
  await zipExtension();

  console.log('\nDone. To load the extension:');
  console.log('  1. Open chrome://extensions');
  console.log('  2. Enable Developer Mode');
  console.log('  3. Click "Load unpacked" → select this folder');
  console.log('  OR use dist/dont-get-distracted-bird.zip to submit to the Chrome Web Store.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
