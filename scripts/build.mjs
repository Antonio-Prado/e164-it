import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoUrl = 'https://github.com/Antonio-Prado/e164-it';
const sha = process.env.VITE_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || '';
const commitUrl = sha ? `${repoUrl}/commit/${sha}` : '';

const output = `window.__COMMIT_SHA__ = ${JSON.stringify(sha)};\nwindow.__COMMIT_URL__ = ${JSON.stringify(commitUrl)};\n`;
const outputPath = resolve('public', 'build-meta.js');

await writeFile(outputPath, output);
