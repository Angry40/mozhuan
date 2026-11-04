import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';
import JSZip from 'jszip';

// 这个用例验证“打包后的扩展”本身，而不是 Vite 开发服务器。
// 前置：npm run build:extension；以及 npx playwright install chromium。
const extensionDir = 'release/extension';
const extensionReady = existsSync(`${extensionDir}/manifest.json`);

test.skip(!extensionReady, '先运行 npm run build:extension 生成 release/extension。');
test.skip(
  !existsSync(chromium.executablePath()),
  '扩展测试需要 Playwright 自带 Chromium（Chrome 137+ 已移除 --load-extension）：npx playwright install chromium。',
);

function hasJava(): boolean {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('打包后的扩展可加载、加载示例并导出合法 EPUB', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/);

    const page = await context.newPage();
    const errors: string[] = [];
    const externalRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const protocol = new URL(request.url()).protocol;
      if (!['chrome-extension:', 'data:', 'blob:'].includes(protocol)) {
        externalRequests.push(request.url());
      }
    });

    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(page.getByRole('heading', { name: '墨转' })).toBeVisible();
    await expect(page.getByTestId('export-button')).toBeDisabled();

    // “加载示例小说”依赖扩展包内的 public/sample 资源，同时验证同源 fetch。
    await page.getByTestId('load-sample').click();
    await expect(page.getByTestId('chapter-count')).toHaveText('7');
    await expect(page.getByTestId('title-input')).toHaveValue('示例小说');
    await expect(page.getByTestId('preview-frame')).toBeVisible();

    // 预览 iframe 使用 sandbox="" + srcdoc，确认排版内容仍能渲染。
    const frame = page.frameLocator('#preview-frame');
    await expect(frame.locator('body')).toContainText('临川');

    // 与 Web 版一致的封面输入与下载链路。
    await page.getByTestId('cover-input').setInputFiles('public/sample/示例封面.png');
    await expect(page.getByTestId('cover-image')).toBeVisible();

    // 与 Web 版一致：先生成文件卡片，再手动下载。
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-result')).toBeVisible();
    await expect(page.getByTestId('export-file-name')).toHaveText('示例小说.epub');
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('示例小说.epub');
    const output = 'artifacts/extension-export.epub';
    await download.saveAs(output);

    // 结构与现有 Web 端导出约定一致。
    const zip = await JSZip.loadAsync(await readFile(output));
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    expect(names[0]).toBe('mimetype');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    expect(names).toContain('OEBPS/toc.ncx');
    expect(names.some((name) => name.startsWith('OEBPS/text/chapter-'))).toBe(true);
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');

    // 与 Web 版共用同一套渲染，导出结果应通过 EPUBCheck。
    if (hasJava()) {
      const result = execFileSync('bash', ['scripts/validate-epub.sh', output], { encoding: 'utf8' });
      expect(result).toContain('0 errors');
      expect(result).toContain('0 warnings');
    } else {
      test.info().annotations.push({ type: 'warning', description: '未安装 Java，跳过 EPUBCheck。' });
    }

    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
