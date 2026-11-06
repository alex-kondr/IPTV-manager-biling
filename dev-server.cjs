#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ngJs = path.join(__dirname, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const ngBin = path.join(__dirname, 'node_modules', '.bin', 'ng');

const binaryToRun = fs.existsSync(ngJs) ? process.execPath : ngBin;
const initialArgs = fs.existsSync(ngJs) ? [ngJs] : [];

const args = [...initialArgs, 'serve', '--host', '0.0.0.0', '--port', '3000'];

const child = spawn(binaryToRun, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
