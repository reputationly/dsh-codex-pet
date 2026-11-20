/** 把 npm pack 打出的发行包登记到 dist 分支的工作目录；提交与推送由 workflow 完成。 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const MANIFEST = 'releases.json';

/** npm pack 给作用域包起的文件名。 */
export function tarballName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

function digest(algorithm, body, encoding) {
  return `${algorithm}-${createHash(algorithm).update(body).digest(encoding)}`;
}

function readme(manifest) {
  const rows = Object.entries(manifest).reverse().map(([, entry]) => `| \`${entry.file}\` | ${entry.source} |`);
  return [
    '# 蒜狸版 dsh-codex-pet 发行包', '',
    '本分支只存放发行包，供 deepseek-harness 按提交号固定的 URL 依赖。把 `suanli` 合入 `release` 分支后由 CI 打包并提交到这里，请不要手工修改。', '',
    '| 文件 | 源码提交 |', '|---|---|', ...rows, '',
  ].join('\n');
}

/**
 * 登记一个新版本；版本已发行时，内容相同则跳过，内容不同则拒绝。
 * @param {{ name: string, version: string }} pkg 源码分支的 package.json
 * @param {string} packDir npm pack 的输出目录
 * @param {string} distDir dist 分支的工作目录
 * @param {string} source 打包所用的源码提交
 * @returns {{ published: boolean, version: string, file: string, integrity?: string }}
 */
export function stageRelease(pkg, packDir, distDir, source) {
  const file = tarballName(pkg.name, pkg.version);
  const body = readFileSync(join(packDir, file));
  // npm pack 固定了包内的时间和属主，解压后的字节只取决于内容，可以跨机器比较。
  const content = digest('sha256', gunzipSync(body), 'hex');
  const manifestPath = join(distDir, MANIFEST);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const released = manifest[pkg.version];
  if (released) {
    if (released.content !== undefined && released.content !== content) {
      throw new Error(`版本 ${pkg.version} 已由提交 ${released.source} 发行，这次打出的包内容不同；请先修改 package.json 的 version 再合入 release。`);
    }
    return { published: false, version: pkg.version, file };
  }
  if (existsSync(join(distDir, file))) throw new Error(`dist 分支已有 ${file}，但 ${MANIFEST} 没有登记；请先核对。`);
  const integrity = digest('sha512', body, 'base64');
  writeFileSync(join(distDir, file), body);
  manifest[pkg.version] = { file, source, integrity, content };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(distDir, 'README.md'), readme(manifest));
  return { published: true, version: pkg.version, file, integrity };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { 'pack-dir': { type: 'string' }, 'dist-dir': { type: 'string' }, source: { type: 'string' } } });
  if (!values['pack-dir'] || !values['dist-dir'] || !values.source) throw new Error('需要 --pack-dir、--dist-dir 和 --source');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const result = stageRelease(pkg, values['pack-dir'], values['dist-dir'], values.source);
  console.log(result.published ? `已登记 ${result.file}` : `版本 ${result.version} 已发行且内容未变，跳过`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${String(value)}\n`).join(''));
  }
}
