import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import iconv from 'iconv-lite';
import JSZip from 'jszip';

const sampleText = readFileSync(new URL('../fixtures/sample.txt', import.meta.url), 'utf8');
const coverBase64 = readFileSync('public/sample/示例封面.png').toString('base64');

// 导出现在是两步：先生成并展示文件卡片，再由用户点击“下载 EPUB”。
async function exportAndDownload(page: Page) {
  await page.getByTestId('export-button').click();
  await expect(page.getByTestId('export-result')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-button').click();
  return downloadPromise;
}

test.beforeAll(() => {
  mkdirSync('artifacts', { recursive: true });
  mkdirSync('docs', { recursive: true });
  mkdirSync('samples', { recursive: true });
});

test('loads the empty workspace without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '墨转' })).toBeVisible();
  await expect(page.getByTestId('export-button')).toBeDisabled();
  await expect(page.getByTestId('stats')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshot-empty.png', fullPage: true });

  expect(errors).toEqual([]);
});

test('loads the built-in sample novel', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('chapter-count')).toHaveText('7');
  await expect(page.getByTestId('title-input')).toHaveValue('示例小说');
  await expect(page.getByTestId('preview-frame')).toBeVisible();
});

test('shows the generated EPUB before downloading and invalidates stale results', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('chapter-count')).toHaveText('7');

  const result = page.getByTestId('export-result');
  await expect(result).toHaveCount(0);

  await page.getByTestId('export-button').click();
  await expect(result).toBeVisible();
  await expect(page.getByTestId('export-file-name')).toHaveText('示例小说.epub');
  await expect(page.getByTestId('export-file-meta')).toContainText('章');
  await expect(page.getByTestId('download-button')).toBeVisible();

  // 生成完成不应自动触发浏览器下载。
  let autoDownloaded = false;
  const markDownload = () => {
    autoDownloaded = true;
  };
  page.on('download', markDownload);
  await page.waitForTimeout(600);
  expect(autoDownloaded).toBe(false);
  page.off('download', markDownload);

  // 改动任何导出输入都会让旧结果失效，按钮回到“生成 EPUB”。
  await page.getByTestId('toggle-indent').click();
  await expect(result).toHaveCount(0);
  await expect(page.getByTestId('export-button')).toHaveText('生成 EPUB');

  await page.getByTestId('export-button').click();
  await expect(result).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('示例小说.epub');

  await page.getByTestId('export-dismiss').click();
  await expect(result).toHaveCount(0);
});

test('uploads, previews styles, and exports a valid EPUB', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: '临川夜雨.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(sampleText, 'utf8'),
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('7');
  await expect(page.getByTestId('image-count')).toHaveText('4');
  await expect(page.getByTestId('chapter-list-count')).toHaveText('7 章');
  await expect(page.getByTestId('preview-frame')).toBeVisible();

  await page.getByTestId('cover-input').setInputFiles('public/sample/示例封面.png');
  await expect(page.getByTestId('cover-image')).toBeVisible();

  const defaultDownload = await exportAndDownload(page);
  expect(defaultDownload.suggestedFilename()).toBe('临川夜雨.epub');
  await defaultDownload.saveAs('samples/示例小说.epub');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot.png', fullPage: true });

  const sampleZip = await JSZip.loadAsync(readFileSync('samples/示例小说.epub'));
  expect(sampleZip.file('OEBPS/images/cover.png')).toBeTruthy();
  const sampleOpf = (await sampleZip.file('OEBPS/content.opf')!.async('string')) ?? '';
  expect(sampleOpf).toContain('<meta name="cover" content="cover-image"/>');
  expect(sampleOpf).toContain('properties="cover-image"');

  await page.getByTestId('cover-remove').click();
  await expect(page.getByTestId('cover-image')).toHaveCount(0);
  await page.getByTestId('cover-input').setInputFiles('public/sample/示例封面.png');
  await expect(page.getByTestId('cover-image')).toBeVisible();

  const removalDetails = page.getByTestId('removal-details');
  await expect(removalDetails).toBeVisible();
  await removalDetails.locator('summary').click();
  await expect(removalDetails).toContainText('bridge.jpg');
  await removalDetails.locator('summary').click();

  const frame = page.frameLocator('#preview-frame');
  await expect(frame.locator('.chapter-title')).toHaveText('初入江湖');
  await expect(frame.locator('p.body').first()).toContainText('雨下了整夜');

  const indentOn = await frame
    .locator('p.body')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).textIndent));
  expect(indentOn).toBeGreaterThan(0);

  const gapOff = await frame
    .locator('p.body')
    .nth(1)
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).marginTop));
  expect(gapOff).toBe(0);

  await page.getByTestId('toggle-indent').click();
  const indentOff = await frame
    .locator('p.body')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).textIndent));
  expect(indentOff).toBe(0);

  await page.getByTestId('toggle-gap').click();
  const gapOn = await frame
    .locator('p.body')
    .nth(1)
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).marginTop));
  expect(gapOn).toBeGreaterThan(0);

  await page.getByTestId('preset-modern').click();
  await expect(frame.locator('.chapter-head')).toHaveClass(/preset-modern/);

  await page.getByTestId('numbering-arabic').click();
  await expect(frame.locator('.chapter-number')).toHaveText('第1章');

  await page.getByTestId('preset-inline').click();
  await expect(frame.locator('.inline-marker')).toHaveText('第1章');
  await expect(frame.locator('.inline-title')).toHaveText('初入江湖');
  const inlineOffset = await frame.locator('.chapter-title').evaluate((element) => {
    const marker = element.querySelector('.inline-marker')!;
    const title = element.querySelector('.inline-title')!;
    const markerBox = marker.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    return Math.abs(
      markerBox.top + markerBox.height / 2 - (titleBox.top + titleBox.height / 2),
    );
  });
  expect(inlineOffset).toBeLessThan(8);

  await page.getByTestId('chapter-select').selectOption('1');
  await expect(frame.locator('.inline-title')).toHaveText('风起');
  await expect(frame.locator('.inline-marker')).toHaveText('第2章');

  await page.getByTestId('toggle-images').click();
  await expect(page.getByTestId('image-count')).toHaveText('0');
  await expect(frame.locator('p.body').filter({ hasText: '[插图]' })).toHaveCount(1);

  await page.getByTestId('toggle-images').click();
  await expect(page.getByTestId('image-count')).toHaveText('4');
  await expect(frame.locator('p.body').filter({ hasText: '[插图]' })).toHaveCount(0);

  await page.getByTestId('chapter-select').selectOption('0');
  await expect(frame.locator('.inline-title')).toHaveText('初入江湖');
  await expect(frame.locator('.inline-marker')).toHaveText('第1章');

  await page.getByTestId('title-input').fill('临川夜雨');
  await page.getByTestId('author-input').fill('墨转测试');

  const download = await exportAndDownload(page);
  expect(download.suggestedFilename()).toBe('临川夜雨.epub');

  const savePath = 'artifacts/e2e.epub';
  await download.saveAs(savePath);
  const bytes = readFileSync(savePath);
  expect(bytes.subarray(0, 2).toString('utf8')).toBe('PK');

  const zip = await JSZip.loadAsync(bytes);
  expect(zip.file('META-INF/container.xml')).toBeTruthy();
  expect(zip.file('OEBPS/content.opf')).toBeTruthy();
  expect(Object.keys(zip.files)[0]).toBe('mimetype');

  const opf = (await zip.file('OEBPS/content.opf')!.async('string')) ?? '';
  expect(opf).toContain('临川夜雨');
  expect(opf).toContain('墨转测试');

  const nav = (await zip.file('OEBPS/nav.xhtml')!.async('string')) ?? '';
  expect(nav).toContain('第1章 初入江湖');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot-options.png', fullPage: true });
});

test('pastes a cover image from the clipboard', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: '临川夜雨.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(sampleText, 'utf8'),
  });
  await expect(page.getByTestId('chapter-count')).toHaveText('7');

  await page.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const read = async () => [
      {
        types: ['image/png'],
        getType: async () => new Blob([bytes], { type: 'image/png' }),
      },
    ];
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, 'read', {
        configurable: true,
        value: read,
      });
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { read },
      });
    }
  }, coverBase64);

  await page.getByTestId('cover-paste').click();
  await expect(page.getByTestId('cover-image')).toBeVisible();
  await expect(page.getByTestId('cover-error')).toHaveCount(0);

  await page.getByTestId('cover-remove').click();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'read', {
      configurable: true,
      value: async () => {
        const error = new Error('denied');
        error.name = 'NotAllowedError';
        throw error;
      },
    });
  });
  await page.getByTestId('cover-paste').click();
  await expect(page.getByTestId('cover-paste-hint')).toBeVisible();
  await expect(page.getByTestId('cover-error')).toContainText('浏览器没有允许读取剪贴板');

  await page.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    document.dispatchEvent(event);
  }, coverBase64);

  await expect(page.getByTestId('cover-image')).toBeVisible();
  await expect(page.getByTestId('cover-paste-hint')).toHaveCount(0);
});

test('reviews, repairs, and removes empty chapters', async ({ page }) => {
  const emptyText = `第一章 空章一

第二章 空章二

第三章 有内容

这一章有正文。`;

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: '空章测试.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(emptyText, 'utf8'),
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('3');
  const notice = page.getByTestId('empty-chapter-notice');
  await expect(notice).toContainText('有 2 章没有正文内容');
  await expect(notice.getByTestId('empty-chapter-0')).toBeVisible();
  await notice.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/screenshot-empty-chapters.png' });

  await notice
    .getByTestId('empty-chapter-0')
    .getByRole('button', { name: '定位' })
    .click();
  const frame = page.frameLocator('#preview-frame');
  await expect(frame.locator('.chapter-title')).toHaveText('空章一');

  await page.getByTestId('edit-empty-0').click();
  await expect(page.getByTestId('chapter-editor')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshot-chapter-editor.png' });
  await page.getByTestId('chapter-editor-marker').fill('第一章');
  await page.getByTestId('chapter-editor-subtitle').fill('重写的空章');
  await page
    .getByTestId('chapter-editor-textarea')
    .fill('补写的正文第一段。\n\n补写的第二段。');
  await page.getByTestId('chapter-editor-save').click();
  await expect(page.getByTestId('chapter-editor')).toHaveCount(0);
  await expect(page.getByTestId('empty-chapter-notice')).toContainText('有 1 章没有正文内容');
  await expect(frame.locator('.chapter-title')).toHaveText('重写的空章');
  await expect(frame.locator('p.body').first()).toContainText('补写的正文第一段');

  await page.getByTestId('delete-all-empty').click();
  await expect(page.getByTestId('empty-chapter-notice')).toHaveCount(0);
  await expect(page.getByTestId('excluded-bar')).toContainText('排除 1 章');
  await expect(page.getByTestId('chapter-count')).toHaveText('2');

  await page.getByTestId('restore-excluded').click();
  await expect(page.getByTestId('empty-chapter-notice')).toContainText('有 1 章没有正文内容');
  await expect(page.getByTestId('excluded-bar')).toHaveCount(0);
  await expect(page.getByTestId('chapter-count')).toHaveText('3');

  await page.getByTestId('empty-chapter-1').getByRole('button', { name: '定位' }).click();
  await expect(frame.locator('.chapter-title')).toHaveText('空章二');
  await page.getByTestId('delete-chapter').click();
  await expect(page.getByTestId('excluded-bar')).toContainText('排除 1 章');
  await page.getByTestId('restore-excluded').click();
  await expect(page.getByTestId('empty-chapter-notice')).toContainText('有 1 章没有正文内容');

  await page.getByTestId('delete-all-empty').click();
  await expect(page.getByTestId('excluded-bar')).toBeVisible();

  const download = await exportAndDownload(page);
  await download.saveAs('artifacts/empty-review.epub');

  const zip = await JSZip.loadAsync(readFileSync('artifacts/empty-review.epub'));
  const nav = (await zip.file('OEBPS/nav.xhtml')!.async('string')) ?? '';
  expect(nav).toContain('第一章 重写的空章');
  expect(nav).toContain('第三章 有内容');
  expect(nav).not.toContain('第二章 空章二');

  const firstChapter = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
  expect(firstChapter).toContain('补写的正文第一段');
});

test('imports an existing EPUB and rebuilds it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles('samples/示例小说.epub');

  await expect(page.getByTestId('epub-info')).toBeVisible();
  await expect(page.getByTestId('chapter-count')).toHaveText('7');
  await expect(page.getByTestId('title-input')).toHaveValue('临川夜雨');
  await expect(page.getByTestId('encoding-select')).toHaveCount(0);
  await expect(page.getByTestId('cover-image')).toBeVisible();
  // EPUB 输入下插图开关同样可点：关闭时保留插图与图片文件。
  await expect(page.getByTestId('toggle-images')).toBeEnabled();
  await expect(page.frameLocator('#preview-frame').locator('.chapter-title')).toHaveText('初入江湖');
  await expect(page.getByTestId('export-button')).toBeEnabled();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot-epub-import.png', fullPage: true });

  const download = await exportAndDownload(page);
  expect(download.suggestedFilename()).toBe('临川夜雨.epub');
  await download.saveAs('artifacts/imported-epub.epub');

  const zip = await JSZip.loadAsync(readFileSync('artifacts/imported-epub.epub'));
  const nav = (await zip.file('OEBPS/nav.xhtml')!.async('string')) ?? '';
  expect(nav).toContain('第一章 初入江湖');
  expect(nav).toContain('后记');
  expect(zip.file('OEBPS/images/cover.png')).toBeTruthy();

  const firstChapter = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
  expect(firstChapter).toContain('雨下了整夜');
  expect((firstChapter.match(/class="chapter-number"/g) ?? []).length).toBe(1);
});

const E2E_TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mNcYq/DwMDAxMDAgKAAFOkBFcv34tUAAAAASUVORK5CYII=',
  'base64',
);

async function makeIllustratedEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:33333333-3333-4333-8333-333333333333</dc:identifier>
    <dc:title>带图样本</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="p1" href="images/pic-a.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
  );
  zip.file(
    'OEBPS/text/chapter-1.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第一章 起</title></head>
<body>
<h1>第一章 起</h1>
<p>第一段文字。</p>
<figure><img src="../images/pic-a.png" alt="断桥"/><figcaption>图一</figcaption></figure>
<p>第二段文字。</p>
</body>
</html>`,
  );
  zip.file('OEBPS/images/pic-a.png', E2E_TINY_PNG);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('keeps or removes EPUB illustrations with the image switch', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: '带图样本.epub',
    mimeType: 'application/epub+zip',
    buffer: await makeIllustratedEpub(),
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('1');
  const frame = page.frameLocator('#preview-frame');

  // 默认开：插图被清除，预览里没有任何图片。
  await expect(page.getByTestId('toggle-images')).toBeEnabled();
  await expect(frame.locator('figure.illustration')).toHaveCount(0);
  await expect(page.getByTestId('image-count')).toHaveText('1');

  // 关闭：插图回到正文，统计显示保留数量。
  await page.getByTestId('toggle-images').click();
  await expect(frame.locator('figure.illustration')).toHaveCount(1);
  await expect(page.getByTestId('kept-count')).toContainText('已保留 1 张插图');
  await expect(frame.locator('figure.illustration img')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );

  const withImages = await exportAndDownload(page);
  await withImages.saveAs('artifacts/with-images.epub');
  const zip = await JSZip.loadAsync(readFileSync('artifacts/with-images.epub'));
  expect(zip.file('OEBPS/images/fig-001.png')).toBeTruthy();
  const opf = (await zip.file('OEBPS/content.opf')!.async('string')) ?? '';
  expect(opf).toContain('href="images/fig-001.png" media-type="image/png"');
  const chapter = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
  expect(chapter).toContain('src="../images/fig-001.png"');

  // 重新打开开关：图片文件与标签一起消失。
  await page.getByTestId('toggle-images').click();
  await expect(frame.locator('figure.illustration')).toHaveCount(0);

  const withoutImages = await exportAndDownload(page);
  await withoutImages.saveAs('artifacts/without-images.epub');
  const cleanZip = await JSZip.loadAsync(readFileSync('artifacts/without-images.epub'));
  expect(
    Object.keys(cleanZip.files).filter(
      (name) => name.startsWith('OEBPS/images/') && !name.endsWith('/'),
    ),
  ).toEqual([]);
  const cleanChapter =
    (await cleanZip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
  expect(cleanChapter).not.toContain('<img');
  expect(cleanChapter).not.toContain('figcaption');
});

async function makeFontEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:44444444-4444-4444-8444-444444444444</dc:identifier>
    <dc:title>字体样本</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="f1" href="fonts/song.woff2" media-type="font/woff2"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
  );
  zip.file(
    'OEBPS/text/chapter-1.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章 起</title></head>
<body><h1>第一章 起</h1><p>正文。</p></body></html>`,
  );
  zip.file('OEBPS/fonts/song.woff2', Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x00, 0x00, 0x01]));
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('keeps or removes embedded fonts with the font switch', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: '字体样本.epub',
    mimeType: 'application/epub+zip',
    buffer: await makeFontEpub(),
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('1');
  // 默认开（精简）：显示移除提示。
  await expect(page.getByTestId('fonts-removed-count')).toContainText('已精简（不嵌入）1 个字体文件');

  const withoutFonts = await exportAndDownload(page);
  await withoutFonts.saveAs('artifacts/without-fonts.epub');
  let zip = await JSZip.loadAsync(readFileSync('artifacts/without-fonts.epub'));
  expect(
    Object.keys(zip.files).filter((name) => name.startsWith('OEBPS/fonts/') && !name.endsWith('/')),
  ).toEqual([]);
  let css = (await zip.file('OEBPS/css/style.css')!.async('string')) ?? '';
  expect(css).not.toContain('@font-face');

  // 关闭：保留字体文件。
  await page.getByTestId('toggle-fonts').click();
  await expect(page.getByTestId('fonts-kept-count')).toContainText('将保留 1 个字体文件');

  const withFonts = await exportAndDownload(page);
  await withFonts.saveAs('artifacts/with-fonts.epub');
  zip = await JSZip.loadAsync(readFileSync('artifacts/with-fonts.epub'));
  expect(
    Object.keys(zip.files).filter((name) => name.startsWith('OEBPS/fonts/') && !name.endsWith('/')),
  ).toHaveLength(1);
  const opf = (await zip.file('OEBPS/content.opf')!.async('string')) ?? '';
  expect(opf).toContain('media-type="font/woff2"');
  css = (await zip.file('OEBPS/css/style.css')!.async('string')) ?? '';
  expect(css).toContain('@font-face');
});

test('detects GBK files and switches chapters', async ({ page }) => {
  await page.goto('/');
  const gbk = iconv.encode(sampleText, 'gbk');
  await page.getByTestId('file-input').setInputFiles({
    name: 'gbk小说.txt',
    mimeType: 'text/plain',
    buffer: gbk,
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('7');
  await expect(page.getByTestId('encoding-select')).toHaveValue('gb18030');
  await expect(page.getByTestId('warnings')).toHaveCount(0);

  await page.getByTestId('chapter-item-2').click();
  const frame = page.frameLocator('#preview-frame');
  await expect(frame.locator('.chapter-title')).toHaveText('夜雨');
});

test('renders on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('chapter-count')).toHaveText('7');
  await expect(page.frameLocator('#preview-frame').locator('.chapter-title')).toHaveText('初入江湖');
  await page.getByTestId('preview-frame').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot-mobile.png' });
});

test('filters hidden blank lines and applies the toggle to preview and export', async ({
  page,
}) => {
  await page.goto('/');

  // 「　　」是普通空行（始终丢弃），后两行是肉眼看不见的假空白行。
  const blankText = [
    '第一章 隐空白',
    '',
    '正文一。',
    '\u3000\u3000',
    '&nbsp;',
    '\u2800',
    '正文二。',
  ].join('\n');

  await page.getByTestId('file-input').setInputFiles({
    name: '隐空白.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(blankText, 'utf8'),
  });

  await expect(page.getByTestId('chapter-count')).toHaveText('1');
  await expect(page.getByTestId('paragraph-count')).toHaveText('2');

  const frame = page.frameLocator('#preview-frame');
  await expect(frame.locator('p.body')).toHaveCount(2);
  await expect(frame.locator('p.body').first()).toHaveText('正文一。');

  // 关闭后假空白行重新出现。
  await page.getByTestId('toggle-blank-lines').click();
  await expect(page.getByTestId('paragraph-count')).toHaveText('4');
  await expect(frame.locator('p.body')).toHaveCount(4);

  // 再次开启恢复。
  await page.getByTestId('toggle-blank-lines').click();
  await expect(page.getByTestId('paragraph-count')).toHaveText('2');
  await expect(frame.locator('p.body')).toHaveCount(2);

  const download = await exportAndDownload(page);
  const savePath = 'artifacts/blank-lines.epub';
  await download.saveAs(savePath);

  const zip = await JSZip.loadAsync(readFileSync(savePath));
  const chapter = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
  expect(chapter).not.toContain('nbsp');
  expect(chapter).not.toContain('\u2800');
  expect(chapter.match(/<p class="body">/g) ?? []).toHaveLength(2);
});
