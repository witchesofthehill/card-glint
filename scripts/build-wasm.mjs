import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rust = '1.98.0';
const wasmBindgen = '0.2.127';
if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
  throw new Error('card-glint source builds support macOS, Linux, and Windows.');
}
const lock = await readFile(path.join(root, 'Cargo.lock'), 'utf8');
const toolchain = await readFile(path.join(root, 'rust-toolchain.toml'), 'utf8');
if (!lock.includes(`name = "wasm-bindgen"\nversion = "${wasmBindgen}"`)) {
  throw new Error('The wasm-bindgen CLI version must match Cargo.lock.');
}
if (!toolchain.includes(`channel = "${rust}"`)) {
  throw new Error('The source build must match rust-toolchain.toml.');
}

const cache = path.join(root, 'node_modules/.cache/card-glint');
const toolRoot = path.join(cache, 'tools', `${rust}-${wasmBindgen}`);
const target = path.join(cache, 'target');
const bindgen = path.join(
  toolRoot,
  `bin/wasm-bindgen${process.platform === 'win32' ? '.exe' : ''}`,
);
const env = {
  ...process.env,
  RUSTUP_TOOLCHAIN: rust,
  CARGO_HOME: path.join(cache, 'cargo'),
  CARGO_TARGET_DIR: target,
  PATH: `${path.join(toolRoot, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
};
const run = (command, args, runEnv = env) =>
  execFileSync(command, args, { cwd: root, env: runEnv, stdio: 'inherit' });
await mkdir(cache, { recursive: true });
run(
  'rustup',
  [
    'toolchain',
    'install',
    rust,
    '--profile',
    'minimal',
    '--target',
    'wasm32-unknown-unknown',
    '--no-self-update',
  ],
  process.env,
);
if (
  !(await access(bindgen).then(
    () => true,
    () => false,
  ))
) {
  run('cargo', [
    'install',
    'wasm-bindgen-cli',
    '--version',
    wasmBindgen,
    '--locked',
    '--root',
    toolRoot,
  ]);
}
if (process.platform === 'darwin') {
  const capture = (args) =>
    execFileSync('rustc', args, { cwd: root, env, encoding: 'utf8' }).trim();
  const sysroot = capture(['--print', 'sysroot']);
  const host = capture(['-vV']).match(/^host: (.+)$/m)?.[1];
  if (!host) throw new Error('Could not determine the Rust host for the macOS WASM linker.');
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  const linker = path.join(cache, 'wasm-linker.sh');
  await writeFile(
    linker,
    `#!/bin/sh\nexport DYLD_LIBRARY_PATH=${quote(path.join(sysroot, 'lib'))}\nexec ${quote(path.join(sysroot, 'lib/rustlib', host, 'bin/rust-lld'))} "$@"\n`,
  );
  await chmod(linker, 0o755);
  env.CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = linker;
}
for (const [crate, name] of [
  ['renderer-wasm', 'renderer'],
  ['pixel-kernels', 'pixels'],
]) {
  run('cargo', [
    'build',
    '--locked',
    '--release',
    '--target',
    'wasm32-unknown-unknown',
    '-p',
    crate,
  ]);
  run(bindgen, [
    path.join(target, 'wasm32-unknown-unknown/release', `${crate.replaceAll('-', '_')}.wasm`),
    '--target',
    'web',
    '--out-dir',
    'packages/browser/generated',
    '--out-name',
    name,
  ]);
  const file = path.join(root, `packages/browser/generated/${name}.js`);
  const source = await readFile(file, 'utf8');
  const defaultUrl = `new URL('${name}_bg.wasm', import.meta.url)`;
  if (!source.includes(defaultUrl)) throw new Error(`Unexpected wasm-bindgen URL in ${file}`);
  await writeFile(
    file,
    source.replace(defaultUrl, `(await import('./${name}_bg.wasm?url')).default`),
  );
}
