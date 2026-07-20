import { cp, mkdir, rm } from 'node:fs/promises';

const webFiles = [
  'index.html',
  'style.css',
  'app.js',
  'firebase-checkin.js',
  'data.json',
  'manifest.json',
  'sw.js',
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const file of webFiles) {
  await cp(file, `dist/${file}`);
}

await cp('icons', 'dist/icons', { recursive: true });

// @capacitor/assets expects icon.png (or logo.png) in an assets directory.
await rm('mobile-assets', { recursive: true, force: true });
await mkdir('mobile-assets', { recursive: true });
await cp('icons/icon-1024.png', 'mobile-assets/icon.png');

console.log('Prepared the mobile web bundle in dist/.');
