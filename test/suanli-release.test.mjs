import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { stageRelease, tarballName } from '../scripts/publish-suanli-release.mjs';

const pkg = { name: '@michengai/dsh-codex-pet', version: '1.2.0-suanli.1' };
const file = 'michengai-dsh-codex-pet-1.2.0-suanli.1.tgz';

function scratch(t, content, level = 9) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packDir = join(root, 'pack');
  const releasesDir = join(root, 'releases');
  mkdirSync(packDir);
  mkdirSync(releasesDir);
  writeFileSync(join(packDir, file), gzipSync(Buffer.from(content), { level }));
  return { packDir, releasesDir };
}

test('发行包文件名与 npm pack 一致', () => {
  assert.equal(tarballName(pkg.name, pkg.version), file);
});

test('新版本写入发行包、清单和说明', t => {
  const { packDir, releasesDir } = scratch(t, 'package bytes');
  const result = stageRelease(pkg, packDir, releasesDir, 'abc123');
  assert.equal(result.published, true);
  assert.match(result.integrity, /^sha512-/);
  assert.deepEqual(readFileSync(join(releasesDir, file)), readFileSync(join(packDir, file)));
  const manifest = JSON.parse(readFileSync(join(releasesDir, 'releases.json'), 'utf8'));
  assert.equal(manifest[pkg.version].source, 'abc123');
  assert.equal(manifest[pkg.version].integrity, result.integrity);
  assert.match(readFileSync(join(releasesDir, 'README.md'), 'utf8'), new RegExp(`\`${file}\` \| abc123`));
});

test('已发行且内容相同时跳过，即使压缩结果不同', t => {
  const first = scratch(t, 'package bytes');
  stageRelease(pkg, first.packDir, first.releasesDir, 'abc123');
  const released = readFileSync(join(first.releasesDir, file));
  writeFileSync(join(first.packDir, file), gzipSync(Buffer.from('package bytes'), { level: 1 }));
  const result = stageRelease(pkg, first.packDir, first.releasesDir, 'def456');
  assert.equal(result.published, false);
  assert.deepEqual(readFileSync(join(first.releasesDir, file)), released);
  assert.equal(JSON.parse(readFileSync(join(first.releasesDir, 'releases.json'), 'utf8'))[pkg.version].source, 'abc123');
});

test('已发行但内容不同时拒绝，要求先改版本号', t => {
  const { packDir, releasesDir } = scratch(t, 'package bytes');
  stageRelease(pkg, packDir, releasesDir, 'abc123');
  writeFileSync(join(packDir, file), gzipSync(Buffer.from('changed bytes')));
  assert.throws(() => stageRelease(pkg, packDir, releasesDir, 'def456'), /请先修改 package\.json 的 version/);
});

test('手工发行的版本没有内容指纹，跳过', t => {
  const { packDir, releasesDir } = scratch(t, 'package bytes');
  writeFileSync(join(releasesDir, 'releases.json'), JSON.stringify({ [pkg.version]: { file, source: 'abc123', integrity: 'sha512-x' } }));
  assert.equal(stageRelease(pkg, packDir, releasesDir, 'def456').published, false);
  assert.equal(existsSync(join(releasesDir, file)), false);
});

test('未登记的同名发行包会被拒绝', t => {
  const { packDir, releasesDir } = scratch(t, 'package bytes');
  writeFileSync(join(releasesDir, file), 'stray');
  assert.throws(() => stageRelease(pkg, packDir, releasesDir, 'abc123'), /没有登记/);
});
