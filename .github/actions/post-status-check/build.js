#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

// Clean output directory
const outputDir = path.join(__dirname, '../../../dist/.github/actions/post-status-check');
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Build with esbuild
esbuild.build({
  entryPoints: [path.join(__dirname, 'src/main.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(outputDir, 'main.js'),
  sourcemap: !isProduction,
  minify: isProduction,
  target: 'node22',
  external: [], // Bundle everything
}).then(() => {
  console.log('✓ Build complete');
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
