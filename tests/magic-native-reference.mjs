import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, sourceHash } from '../games/magic/tools/accuracy/common.mjs';

export const nativeReference = '8000228d77c91ceed98e604c50290aac4271ba7e';
let repository;
let materialized;

async function referenceRepository() {
  if (!repository)
    repository = (async () => {
      try {
        execFileSync('git', ['cat-file', '-e', nativeReference + '^{commit}'], {
          cwd: root,
          stdio: 'pipe',
        });
        return root;
      } catch {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'card-glint-reference-git-'));
        process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
        execFileSync('git', ['init', '--bare', directory], { stdio: 'pipe' });
        execFileSync(
          'git',
          ['fetch', '--depth=1', 'https://github.com/vishvananda/card-glint.git', nativeReference],
          { cwd: directory, stdio: 'pipe' },
        );
        return directory;
      }
    })();
  return repository;
}

export async function readNativeReference(file) {
  const cwd = await referenceRepository();
  return execFileSync('git', ['show', nativeReference + ':' + file], {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export async function nativeReferenceRoot() {
  if (!materialized)
    materialized = (async () => {
      const cwd = await referenceRepository();
      const directory = await mkdtemp(path.join(os.tmpdir(), 'card-glint-native-reference-'));
      process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
      await mkdir(directory, { recursive: true });
      const metadata = execFileSync(
        'git',
        ['ls-tree', '--name-only', `${nativeReference}:games/magic`],
        {
          cwd,
          encoding: 'utf8',
        },
      )
        .trim()
        .split('\n')
        .filter((file) => /\.(?:json|css)$/.test(file))
        .map((file) => `games/magic/${file}`);
      const archive = execFileSync(
        'git',
        [
          'archive',
          nativeReference,
          'games/magic/src',
          ...metadata,
          'packages/browser/src',
          'crates',
          'Cargo.toml',
          'Cargo.lock',
          'rust-toolchain.toml',
        ],
        { cwd, maxBuffer: 32 * 1024 * 1024 },
      );
      execFileSync('tar', ['-x', '-C', directory], {
        input: archive,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      for (const file of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'])
        assert.deepEqual(
          await readFile(path.join(root, file)),
          await readFile(path.join(directory, file)),
          'Reference bindings require unchanged Rust build inputs: ' + file,
        );
      const rustSources = /\.(?:rs|toml|lock)$/;
      assert.equal(
        await sourceHash(path.join(root, 'crates'), rustSources),
        await sourceHash(path.join(directory, 'crates'), rustSources),
        'Reference bindings require unchanged Rust sources',
      );
      await cp(
        path.join(root, 'packages/browser/generated'),
        path.join(directory, 'packages/browser/generated'),
        { recursive: true },
      );
      return directory;
    })();
  return materialized;
}
