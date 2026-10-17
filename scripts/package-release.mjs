import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { copyBrowserLibrary } from './browser-assets.mjs';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw Error('Invalid release version');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw Error('Release tag must match package.json version');
}
const output = path.resolve('dist/releases'),
  folder = `card-glint-${version}-browser`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', output], {
  stdio: 'inherit',
});
const packed = { filename: (await readdir(output))[0] };
const browser = path.join(output, folder);
await copyBrowserLibrary(browser);
await cp('games/showcase/art', path.join(browser, 'art'), { recursive: true });
await cp('examples/standalone', browser, { recursive: true });
await mkdir(path.join(browser, 'magic'), { recursive: true });
for (const name of [
  'README.md',
  'NOTICE.md',
  'assets.json',
  'printing-styles.md',
  'provider-cards.md',
]) {
  await cp(path.join('games/magic', name), path.join(browser, 'magic', name));
}
for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE.md']) {
  await cp(name, path.join(browser, name));
}
await writeFile(
  path.join(browser, 'README.txt'),
  `card-glint ${version}\n\nServe this directory with an HTTP server (for example python3 -m http.server).\nOpen index.html for a working example. file:// URLs cannot load WASM reliably.\n\nImport createRenderer from ./browser.js. Keep the JS chunks and both WASM binaries\ntogether: the WASM core requires its matching JavaScript/WebGL2 host. No Node,\nRust compiler, bundler, model weights or external artwork is needed at runtime.\nThe optional showcase.js and art/ are original, repository-licensed examples.\n\nTypes, architecture and game-pack API: https://github.com/witchesofthehill/card-glint\n`,
);
const archive = `${folder}.zip`;
execFileSync('zip', ['-qr', archive, folder], { cwd: output });
const files = [];
for (const name of [packed.filename, archive]) {
  const bytes = await readFile(path.join(output, name));
  files.push({
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  path.join(output, 'release.json'),
  JSON.stringify(
    {
      version,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
      node: process.version,
      files,
    },
    null,
    2,
  ) + '\n',
);
const manifestHash = createHash('sha256')
  .update(await readFile(path.join(output, 'release.json')))
  .digest('hex');
await writeFile(
  path.join(output, 'SHA256SUMS'),
  files.map((file) => `${file.sha256}  ${file.name}\n`).join('') +
    `${manifestHash}  release.json\n`,
);
console.log(JSON.stringify({ version, files }, null, 2));
