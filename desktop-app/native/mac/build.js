#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const src = path.join(__dirname, 'nudgeboard-mac.swift');
const out = path.join(__dirname, 'nudgeboard-mac');
const pieces = [
  { target: 'arm64-apple-macos12', file: path.join(__dirname, 'nudgeboard-mac.arm64') },
  { target: 'x86_64-apple-macos12', file: path.join(__dirname, 'nudgeboard-mac.x86_64') },
];

for (const piece of pieces) {
  execFileSync(
    'swiftc',
    ['-O', '-parse-as-library', '-target', piece.target, '-o', piece.file, src],
    { stdio: 'inherit' },
  );
}

execFileSync(
  'lipo',
  ['-create', ...pieces.map((piece) => piece.file), '-o', out],
  { stdio: 'inherit' },
);

for (const piece of pieces) {
  fs.unlinkSync(piece.file);
}
fs.chmodSync(out, 0o755);
console.log(`built ${out}`);
