import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { planVersion, stageRelease, tarballName } from '../scripts/publish-suanli-release.mjs';

const pkg = { name: '@michengai/dsh-codex-pet', version: '1.2.0-suanli.1' };
const file = 'michengai-dsh-codex-pet-1.2.0-suanli.1.tgz';

function scratch(t, content, level = 9) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packDir = join(root, 'pack');
  const distDir = join(root, 'dist');
  mkdirSync(packDir);
  mkdirSync(distDir);
  writeFileSync(join(packDir, file), gzipSync(Buffer.from(content), { level }));
  return { packDir, distDir };
}

test('发行包文件名与 npm pack 一致', () => {
  assert.equal(tarballName(pkg.name, pkg.version), file);
});

test('新版本写入发行包、清单和说明', t => {
  const { packDir, distDir } = scratch(t, 'package bytes');
  const result = stageRelease(pkg, packDir, distDir, 'abc123');
  assert.equal(result.published, true);
  assert.match(result.integrity, /^sha512-/);
  assert.deepEqual(readFileSync(join(distDir, file)), readFileSync(join(packDir, file)));
  const manifest = JSON.parse(readFileSync(join(distDir, 'releases.json'), 'utf8'));
  assert.equal(manifest[pkg.version].source, 'abc123');
  assert.equal(manifest[pkg.version].integrity, result.integrity);
  assert.match(readFileSync(join(distDir, 'README.md'), 'utf8'), new RegExp(`\`${file}\` \| abc123`));
});

test('已发行且内容相同时跳过，即使压缩结果不同', t => {
  const first = scratch(t, 'package bytes');
  stageRelease(pkg, first.packDir, first.distDir, 'abc123');
  const released = readFileSync(join(first.distDir, file));
  writeFileSync(join(first.packDir, file), gzipSync(Buffer.from('package bytes'), { level: 1 }));
  const result = stageRelease(pkg, first.packDir, first.distDir, 'def456');
  assert.equal(result.published, false);
  assert.deepEqual(readFileSync(join(first.distDir, file)), released);
  assert.equal(JSON.parse(readFileSync(join(first.distDir, 'releases.json'), 'utf8'))[pkg.version].source, 'abc123');
});

test('已发行但内容不同时拒绝，要求先改版本号', t => {
  const { packDir, distDir } = scratch(t, 'package bytes');
  stageRelease(pkg, packDir, distDir, 'abc123');
  writeFileSync(join(packDir, file), gzipSync(Buffer.from('changed bytes')));
  assert.throws(() => stageRelease(pkg, packDir, distDir, 'def456'), /请先修改 package\.json 的 version/);
});

test('手工发行的版本没有内容指纹，跳过', t => {
  const { packDir, distDir } = scratch(t, 'package bytes');
  writeFileSync(join(distDir, 'releases.json'), JSON.stringify({ [pkg.version]: { file, source: 'abc123', integrity: 'sha512-x' } }));
  assert.equal(stageRelease(pkg, packDir, distDir, 'def456').published, false);
  assert.equal(existsSync(join(distDir, file)), false);
});

test('未登记的同名发行包会被拒绝', t => {
  const { packDir, distDir } = scratch(t, 'package bytes');
  writeFileSync(join(distDir, file), 'stray');
  assert.throws(() => stageRelease(pkg, packDir, distDir, 'abc123'), /没有登记/);
});

test('基础版本没发行过时原样使用', () => {
  assert.deepEqual(planVersion({ '1.1.1-suanli.3': {} }, '1.2.0-suanli.1'), { next: '1.2.0-suanli.1' });
});

test('基础版本发行过时接着最新一次构建编号', () => {
  assert.deepEqual(planVersion({ '1.1.1-suanli.3': {} }, '1.1.1-suanli.3'), { latest: '1.1.1-suanli.3', next: '1.1.1-suanli.3.1' });
  const manifest = { '1.1.1-suanli.3': {}, '1.1.1-suanli.3.1': {}, '1.1.1-suanli.3.2': {}, '1.1.1-suanli.30.1': {}, '1.1.1-suanli.3.x': {} };
  assert.deepEqual(planVersion(manifest, '1.1.1-suanli.3'), { latest: '1.1.1-suanli.3.2', next: '1.1.1-suanli.3.3' });
});
