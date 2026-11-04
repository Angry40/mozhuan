// 把现有 Vite 构建产物 dist/ 打包成可直接“加载已解压”的 Chrome 扩展，
// 并额外产出一个可上传 Chrome Web Store 的 zip。
//
// 运行方式：npm run build:extension（会先执行 npm run build）。
// 这里只做复制、注入版本和静态校验，不修改应用源码与 Vite 配置。

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');
const shellDir = path.join(root, 'extension');
const releaseDir = path.join(root, 'release');
const outDir = path.join(releaseDir, 'extension');

const problems = [];
const warnings = [];

function fail(message) {
  problems.push(message);
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function totalSize(dir) {
  let bytes = 0;
  for (const file of await listFiles(dir)) bytes += (await stat(file)).size;
  return bytes;
}

// ---------------------------------------------------------------- 1. 前置检查

if (!existsSync(distDir)) {
  console.error('✗ 找不到 dist/，请先执行 npm run build（或用 npm run build:extension 一并构建）。');
  process.exit(1);
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '');
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  console.error(`✗ package.json 的 version 不是合法扩展版本号：${JSON.stringify(version)}`);
  process.exit(1);
}

const shellManifest = JSON.parse(await readFile(path.join(shellDir, 'manifest.json'), 'utf8'));
if (shellManifest.manifest_version !== 3) fail('manifest.json 的 manifest_version 必须是 3。');
if (!shellManifest.name) fail('manifest.json 缺少 name。');
else if (shellManifest.name.length > 45) fail(`manifest 名称超过 Chrome Web Store 的 45 字符限制（当前 ${shellManifest.name.length}）。`);
if (!shellManifest.description) fail('manifest.json 缺少 description。');
else if (shellManifest.description.length > 132) fail(`manifest 描述超过 132 字符限制（当前 ${shellManifest.description.length}）。`);
if (!shellManifest.background?.service_worker) fail('manifest.json 缺少 background.service_worker。');

// ---------------------------------------------------------------- 2. 复制产物

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const copied = [];
await cp(distDir, outDir, {
  recursive: true,
  filter: (src) => path.basename(src) !== '.DS_Store' && path.basename(src) !== '.git',
});
for (const file of await listFiles(outDir)) copied.push(path.relative(outDir, file));

// 注入 package.json 的单一版本源，并复制扩展外壳。
const manifest = { ...shellManifest, version };
await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await cp(path.join(shellDir, 'background.js'), path.join(outDir, 'background.js'));
await cp(path.join(shellDir, 'icons'), path.join(outDir, 'icons'), { recursive: true });
copied.push('manifest.json', 'background.js');

// ---------------------------------------------------------------- 3. 静态校验

// 3.1 MV3 扩展页面 CSP 不允许内联脚本；构建产物只能引用外部脚本。
const indexHtmlPath = path.join(outDir, 'index.html');
if (!existsSync(indexHtmlPath)) {
  fail('产物缺少 index.html。');
} else {
  const html = await readFile(indexHtmlPath, 'utf8');
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let sawScript = false;
  while ((match = scriptPattern.exec(html)) !== null) {
    sawScript = true;
    const attrs = match[1];
    const inline = match[2].trim();
    if (!/\bsrc\s*=/.test(attrs)) fail('index.html 中存在内联 <script>，MV3 扩展页 CSP 会阻止执行。');
    if (inline) fail('index.html 的 <script> 带有内联内容，MV3 扩展页 CSP 会阻止执行。');
  }
  if (sawScript && !/<script\b[^>]*\bsrc\s*=\s*["']\.\//i.test(html)) {
    fail('index.html 的脚本不是相对路径（./…），chrome-extension:// 下会加载失败（检查 vite base）。');
  }
  const assetPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  while ((match = assetPattern.exec(html)) !== null) {
    const url = match[1];
    if (/^(?:[a-z]+:|\/\/)/i.test(url)) {
      fail(`index.html 引用了绝对 URL，扩展页无法离线加载：${url}`);
      continue;
    }
    if (url.startsWith('/')) {
      fail(`index.html 引用了以 / 开头的绝对路径，chrome-extension:// 下会 404：${url}`);
      continue;
    }
    if (url.startsWith('#')) continue;
    const target = path.join(outDir, url.split(/[?#]/)[0]);
    if (!existsSync(target)) fail(`index.html 引用的文件不存在：${url}`);
  }
}

// 3.2 manifest 中声明的图标与后台脚本必须真实存在。
const declared = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.background?.service_worker,
].filter(Boolean);
for (const relative of new Set(declared)) {
  if (!existsSync(path.join(outDir, relative))) fail(`manifest.json 声明的文件不存在：${relative}`);
}

// 3.3 “加载示例小说”依赖 public/sample/示例小说.txt，示例封面供演示。
if (!existsSync(path.join(outDir, 'sample', '示例小说.txt'))) {
  fail('产物缺少 sample/示例小说.txt，“加载示例小说”会失败。');
}
if (!existsSync(path.join(outDir, 'favicon.svg'))) {
  warnings.push('产物缺少 favicon.svg（不影响功能）。');
}

// 3.4 MV3 禁止 eval / new Function；仅告警，避免第三方库里的无害字符串误伤。
for (const file of await listFiles(path.join(outDir, 'assets')).catch(() => [])) {
  if (!file.endsWith('.js')) continue;
  const source = await readFile(file, 'utf8');
  if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) {
    warnings.push(`${path.basename(file)} 疑似包含 eval / new Function，MV3 扩展页会在运行时拒绝执行。`);
  }
}

// 3.5 产物体积检查（Chrome Web Store 单包上限为 2GB，这里留出充足余量）。
const outBytes = await totalSize(outDir);
if (outBytes > 512 * 1024 * 1024) {
  fail(`扩展产物 ${formatSize(outBytes)} 过大，请检查是否误把开发依赖打进了 dist/。`);
}

// ---------------------------------------------------------------- 4. 生成 zip

if (problems.length === 0) {
  const zip = new JSZip();
  const files = await listFiles(outDir);
  for (const file of files) {
    const relative = path.relative(outDir, file).split(path.sep).join('/');
    zip.file(relative, await readFile(file), {
      binary: true,
      date: new Date('2026-01-01T00:00:00Z'),
      // 不生成目录条目，zip 内容完全由文件决定，便于复现与比对。
      createFolders: false,
    });
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  await mkdir(releaseDir, { recursive: true });
  for (const entry of await readdir(releaseDir)) {
    if (/^mozhuan-.*\.zip$/.test(entry)) await rm(path.join(releaseDir, entry), { force: true });
  }
  const zipPath = path.join(releaseDir, `mozhuan-${version}.zip`);
  await writeFile(zipPath, buffer);

  // 校验 zip 结构：manifest.json 必须在根目录，不能带外层文件夹。
  const roundTrip = await JSZip.loadAsync(await readFile(zipPath));
  const names = Object.keys(roundTrip.files).filter((name) => !roundTrip.files[name].dir);
  if (!names.includes('manifest.json')) fail('生成的 zip 中 manifest.json 不在根目录。');
  if (names.some((name) => name.startsWith('extension/'))) fail('生成的 zip 带有外层文件夹，商店会拒绝。');

  if (problems.length === 0) {
    console.log(`✓ Chrome 扩展目录：release/extension（${files.length} 个文件，${formatSize(outBytes)}）`);
    console.log(`✓ Chrome Web Store 包：${path.relative(root, zipPath)}（${formatSize(buffer.length)}）`);
    console.log(`  版本 ${version} · 清单名称「${manifest.name}」`);
    console.log('  本地安装：chrome://extensions → 打开“开发者模式” → “加载已解压的扩展程序” → 选择 release/extension');
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
