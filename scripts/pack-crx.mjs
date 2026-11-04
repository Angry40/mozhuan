#!/usr/bin/env node
// 把 release/extension 打包成签名的 CRX3 安装包。
//
// CRX3 的签名依赖一对 RSA 私钥，而扩展 ID 完全由公钥决定：
//   扩展 ID = SHA256(公钥 SPKI DER) 前 16 字节，每个 hex nibble 映射到 a-p
// 因此私钥一旦确定就不能更换，否则扩展 ID 会变，已安装的用户无法升级。
//
// 私钥默认存放在 keys/<name>.pem，不入库。首次运行会自动生成并提示备份。

import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const releaseDir = path.join(root, 'release');
const extDir = path.join(releaseDir, 'extension');
const keysDir = path.join(root, 'keys');

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const keyPath = process.env.CRX_KEY_PATH ?? path.join(keysDir, 'mozhuan.pem');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 逐个探测常见安装路径；可以用 CHROME_PATH 显式指定。
function findChrome() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) fail(`CHROME_PATH 指向的文件不存在：${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) fail('未找到 Chrome / Chromium，可用 CHROME_PATH=/path/to/chrome 指定。');
  return found;
}

// 公钥指纹：SHA256(公钥 SPKI DER) 前 16 字节。
function publicKeyDigest(pem) {
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest().subarray(0, 16);
}

// 扩展 ID：把指纹的每个 hex nibble 按 0-9a-f → a-p 映射。
function extensionIdFromPem(pem) {
  let id = '';
  for (const byte of publicKeyDigest(pem)) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

// 确认签进 crx 的公钥就是私钥对应的那一把。
function crxContainsKey(buffer, pem) {
  const headerLength = buffer.readUInt32LE(8);
  return buffer.subarray(12, 12 + headerLength).includes(publicKeyDigest(pem));
}

if (!existsSync(extDir)) fail('release/extension 不存在，请先运行 npm run build:extension。');

const chrome = findChrome();
const freshKey = !existsSync(keyPath);

// Chrome 会把 <父目录>/<目录名>.crx 写在输入目录的同级，所以先复制到临时目录，
// 保证输出文件名固定为 extension.crx，也避免污染 release/。
const stage = await mkdtemp(path.join(os.tmpdir(), 'mozhuan-crx-'));
const stagedExt = path.join(stage, 'extension');

try {
  await mkdir(keysDir, { recursive: true });
  await cp(extDir, stagedExt, { recursive: true });

  const args = [`--pack-extension=${stagedExt}`, `--user-data-dir=${path.join(stage, 'profile')}`, '--no-first-run', '--no-default-browser-check'];
  if (!freshKey) args.push(`--pack-extension-key=${keyPath}`);

  // Chrome 打包成功时不输出任何内容，直接把产物写进临时目录。
  execFileSync(chrome, args, { stdio: 'pipe', timeout: 120_000 });

  const crxPath = path.join(stage, 'extension.crx');
  if (!existsSync(crxPath)) fail('Chrome 未生成 crx，可能是 Chrome 版本已移除 --pack-extension 支持。');

  const crx = await readFile(crxPath);
  if (crx.subarray(0, 4).toString() !== 'Cr24') fail('产物不是 CRX 文件（magic 校验失败）。');
  if (crx.readUInt32LE(4) !== 3) fail(`产物不是 CRX3（version=${crx.readUInt32LE(4)}）。`);

  // 首次打包时 Chrome 会顺带生成私钥，挪到 keys/ 并锁权限。
  if (freshKey) {
    const generated = path.join(stage, 'extension.pem');
    if (!existsSync(generated)) fail('Chrome 未生成私钥，无法确定扩展 ID。');
    await copyFile(generated, keyPath);
    await chmod(keyPath, 0o600);
  }

  const keyPem = await readFile(keyPath, 'utf8');
  const extensionId = extensionIdFromPem(keyPem);
  // 签名里必须带着这把公钥，否则产物与私钥不匹配，将来无法升级。
  if (!crxContainsKey(crx, keyPem)) fail('crx 头部找不到预期公钥，私钥与产物不匹配。');

  const outPath = path.join(releaseDir, `mozhuan-${version}.crx`);
  for (const entry of await readdir(releaseDir)) {
    if (/^mozhuan-.*\.crx$/.test(entry)) await rm(path.join(releaseDir, entry), { force: true });
  }
  await writeFile(outPath, crx);

  const headerLength = crx.readUInt32LE(8);
  console.log(`✓ CRX3 安装包：release/mozhuan-${version}.crx（${formatSize(crx.length)}）`);
  console.log(`  扩展 ID   ${extensionId}`);
  console.log(`  包内 ZIP  ${formatSize(crx.length - 12 - headerLength)} · 头部 ${headerLength} B`);
  console.log(`  私钥      ${path.relative(root, keyPath)}${freshKey ? '（本次新建，请备份）' : '（已复用）'}`);

  if (freshKey) {
    console.log('');
    console.log('⚠ 私钥决定了扩展 ID，丢失后无法对已安装的副本发布更新，请立刻备份 keys/mozhuan.pem。');
    console.log('  该文件已列入 .gitignore，不要提交、不要上传。');
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
