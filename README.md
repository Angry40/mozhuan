# 墨转 · TXT / EPUB 小说转 EPUB

一个**纯前端、零上传**的单页工具：把 TXT 或现有 EPUB 拖进浏览器，解析章节，调整排版，实时预览，然后重新导出带目录的 EPUB 3。

![墨转界面](docs/screenshot.png)

## 功能

- **TXT / EPUB 导入**：TXT 自动识别 UTF-8 / GB18030（GBK）/ Big5 / UTF-16 编码；EPUB 解析 container.xml、OPF、spine、nav.xhtml / NCX，保留元数据与封面，再按统一的排版管线重建。
- **章节识别**：支持 `第X章`、`卷`、`序章 / 楔子 / 番外 / 后记`、`Chapter N` 等标题；没有标准标题时自动兜底为单章或按长度分节；也可以识别少量无编号短标题并自动补号。
- **插图开关**：开启时删除图片标签、图片链接、`[插图]` 占位符与 base64 图片，EPUB 的内联插图连同图片文件一并清除；关闭时所有图片操作暂停，TXT 保留原始标记，EPUB 保留插图与图片文件按原样导出。封面始终保留。
- **过滤空行和空白行**：除了普通空行，还会清理只含零宽字符、盲文空白（U+2800）、Hangul Filler、`&nbsp;` / `&#160;`、`<br>` 等不可见内容的「假空行」；关闭后只忽略普通空行。
- **首行缩进**：开关 + 0–4em 可调，默认开、2em。
- **段间距**：开关 + 0–2em 可调，默认关、0.6em。
- **章节标题美化**：纯净 / 经典 / 雅致 / 现代 / 题签五种版式，支持编号格式转换、自动补号、清洗推广语、细线或花饰装饰。
- **空章节审校**：集中列出没有正文的章节，可直接定位、补充正文或从导出中删除；删除可一键恢复，源文件不会被修改。
- **实时预览**：预览和导出的 EPUB 使用同一套排版渲染逻辑，所见即所得。
- **目录与统计**：全书章节目录、字数、段落数、插图移除数、预计阅读时长。
- **导出确认**：生成后先在导出区展示 EPUB 文件名、大小与章数，点击“下载 EPUB”才保存；改动任何导出设置后旧结果会自动失效。
- **可选封面**：自动提取 EPUB 原有封面，也可以上传 JPG / PNG / GIF，或读取剪贴板图片覆盖；生成封面页与 `cover-image` 元数据，留空则不生成封面。
- **EPUB 3 + NCX**：带 EPUB 3 `nav.xhtml` 和兼容旧阅读器的 `toc.ncx`；输出包含书名、作者、语言与可选封面元数据。
- **隐私**：所有解析、排版和 ZIP 生成都在浏览器内完成，不上传文件、不请求外部字体或图片、无统计脚本。

## 快速开始

环境：Node.js 22+、npm。

```bash
npm install
npm run dev
```

打开终端提示的地址（默认 <http://127.0.0.1:5174>）。如果 npm 报缓存权限错误，可以用项目内缓存安装：

```bash
npm install --cache .npm-cache
```

也可以直接点击界面里的“加载示例小说”，不需要准备文件。

## 使用步骤

1. 拖入一份 `.txt` 或 `.epub` 文件，或点击“加载示例小说”。
2. 如果导入的是 TXT，检查顶部编码；如果正文乱码，在“源文件 → 编码”中切换编码。EPUB 会显示解析出的章数、字数和封面。
3. 填写书名、作者、语言，并按需替换封面（留空也可以）。
4. 调整排版选项，右侧会实时预览第一章；标题、段落、封面和目录都会重新生成。其中「过滤空行和空白行」会影响预览与导出的段落数，改完可对照顶部统计确认。
5. 如果出现“有 N 章没有正文内容”的提示，可在提示条里定位、补充正文或删除空章节。
6. 点击“生成 EPUB”。生成完成后，导出区会展示文件名、大小和章数卡片，确认无误后点击“下载 EPUB”保存 `<书名>.epub`；生成本身不会自动下载。改动源文件、元数据、排版选项或章节后，旧卡片会自动收起，需要重新生成。
7. 用 Apple Books、Calibre、Kindle（Send to Kindle 或转换工具）打开验证。

## 选项说明

| 选项 | 默认 | 行为 |
|---|---|---|
| 清除插图 | 开 | 开启：TXT 删除图片标签、图片链接、`[插图]`/`（配图：…）` 占位符与 base64 图片；EPUB 删除内联插图标签，并把对应图片文件从导出包中移除。关闭：图片操作全部暂停，TXT 保留原文标记，EPUB 保留插图与图片文件按原样导出。封面不受开关影响，始终保留。两种情况都不联网抓图。 |
| 过滤空行和空白行 | 开 | 丢弃纯空行（含全角空格）；开启时同时清理只含零宽字符、盲文空白 U+2800、`&nbsp;`、`<br>` 等不可见字符的「假空行」。关闭后仅忽略普通空行，假空行会原样保留。 |
| 首行缩进 | 开，2em | 作用于所有正文段落；每行原本已有的行首空格会先清理，避免双缩进。 |
| 段间距 | 关，0.6em | 只在相邻正文段落之间生效，标题与首段之间由标题样式控制。 |
| 标题美化 | 开，雅致 | 关闭后只输出清理过的单行标题，无章号行和装饰。 |
| 标题版式 | 雅致 | 纯净 / 经典 / 雅致 / 现代 / 题签，五种不同的章号与标题排布；“题签”会把章号与标题合并到同一行，章号做成细框标签。 |
| 编号格式 | 保持原文 | 保持原文 / 阿拉伯数字 / 中文数字，例如 `第12章` ↔ `第十二章`。 |
| 清洗推广语 | 开 | 去掉行首“正文”、行尾“（求月票）”“（求订阅）”“（本章完）”等固定后缀。 |
| 自动补全缺失章号 | 开 | 找不到标准标题时，尝试识别无编号短标题并按顺序补“第 N 章”；如识别有误可在选项里关闭。 |
| 封面 | 留空 | 可上传 JPG / PNG / GIF（≤10MB），也可点“粘贴图片”读取剪贴板；留空时导出无封面 EPUB。封面只在本机读取。 |

### EPUB 导入与转换

- 支持常见 EPUB 2 / EPUB 3 结构：`container.xml` → `content.opf` → `spine`；优先使用 `nav.xhtml`，没有时回退到 `toc.ncx` 或 spine/manifest 顺序。
- 自动读取书名、作者、语言、identifier、修改时间和封面；导入后仍可在“书籍信息”里修改。
- 章节标题优先使用导航目录中的标题，其次使用正文里的 `h1` / `h2` / `h3`；段落正文会去掉 XHTML 标签后进入现有排版管线。
- 原有 EPUB 的 CSS、分页和复杂结构不会保留，输出会按当前选项全量重建（EPUB 3 + NCX）。
- **内联插图受「清除插图」开关控制**：开启时插图与原图文件一起清除，关闭时插图保留在正文原位置，图片写入导出包的 `OEBPS/images/` 并在 OPF 中登记。图注（`figcaption`）始终作为正文段落保留。
- 加密 / DRM 的 EPUB 不支持。

![EPUB 导入](docs/screenshot-epub-import.png)

### 空章节处理

当相邻标题之间没有正文，或标题被误识别时，预览区上方会出现详细的“没有正文内容”提示：

- **定位**：点击章节标题或“定位”，会选中该章并滚动到预览区。
- **编辑章节**：打开编辑器后可以同时修改章节标题和正文；标题会套用当前标题版式，正文一行一段。保存后只覆盖当前预览和导出内容，不修改源文件。
- **从导出删除**：把该章从本次 EPUB 中排除；工具栏的“删除本章”也可以删除当前选中的任意章节。
- **删除全部空章节**：一次排除提示条里的所有空章。
- **恢复全部**：删除后会出现“已从导出中排除 N 章”的提示条，点击“恢复全部”即可还原。

“删除”是导出层的软删除，所以可以随时恢复；如果要从根本上修正标题或拆分错误，仍建议修改源文件后重新导入。

![空章节审校](docs/screenshot-empty-chapters.png)

### 章节识别规则

标题需出现在独立行，长度通常不超过 30 个字符，并且不会以句末标点结尾。支持：

- `第一章 初入江湖`、`第12章：风起`、`第一百零一章 归途`
- `第一卷 山雨欲来`
- `序章`、`楔子`、`引子`、`前言`、`番外 小传`、`后记`、`尾声`、`大结局`
- `Chapter 12: The Rain`、`Prologue`、`Epilogue`

`他翻开第一章，又合上了书。` 这类句子不会被误判为章节标题。

## 构建与部署

```bash
npm run build
npm run preview
```

构建产物在 `dist/`。Vite 使用 `base: './'`，可以部署到任意静态托管的根路径或子路径。项目没有后端依赖。

### Chrome 扩展

同一个 `dist/` 可以直接打包成 Manifest V3 扩展：所有解析、排版和下载都在扩展页面内完成，**不需要任何权限**，也不加载远程代码。

```bash
npm run build:extension
```

产物：

- `release/extension/`：可直接“加载已解压的扩展程序”的目录；
- `release/mozhuan-<version>.zip`：根目录即 `manifest.json`，可直接上传 Chrome Web Store。

本地安装：

1. 打开 `chrome://extensions`，开启右上角“开发者模式”；
2. 点击“加载已解压的扩展程序”，选择 `release/extension/`；
3. 点击工具栏的“墨转”图标，会在完整标签页中打开应用（不使用 popup，避免 800×600 限制和误关丢失状态）。

说明：

- 扩展页沿用 MV3 默认 CSP（`script-src 'self'`）。构建脚本会校验 `index.html` 不含内联脚本、资源均为相对路径，并检查 `manifest.json` 声明的文件真实存在。
- 图标由 `public/favicon.svg` 预先栅格化为 16/32/48/128 PNG，构建期不依赖字体或图形工具。
- 版本号以 `package.json` 为唯一来源，打包时写入 `manifest.json`。
- 与 Web 版相比，扩展没有新增运行时能力，也没有改变隐私边界：无 `permissions`、无网络请求、无远程代码，关闭标签页即清空本次转换内容。
- “粘贴图片”的剪贴板直读在扩展页可能被浏览器拒绝，此时仍会自动回退到 ⌘V / Ctrl+V 粘贴模式。

## 测试

```bash
npm run typecheck   # TypeScript
npm test            # Vitest 单元测试（含 2.5MB / 1000 章性能冒烟）
npm run test:e2e    # Playwright，使用系统安装的 Chrome
npm run test:extension  # 构建并验证打包后的 Chrome 扩展
```

扩展测试使用 Playwright 自带的 Chromium（Chrome 137+ 已移除 `--load-extension` 启动参数，系统 Chrome 只能手动加载），首次运行前需要：

```bash
npx playwright install chromium
```

测试会加载 `release/extension`，从 service worker 取得扩展 ID，打开扩展页面，加载示例小说、上传封面、导出 EPUB，检查下载文件结构并通过 EPUBCheck；未安装浏览器时该用例会自动跳过，不影响 Web 侧 e2e。

端到端测试会：

- 上传 UTF-8、GBK 和 EPUB 样例，验证编码、EPUB 解析、章节数、元数据、封面与统计。
- 切换首行缩进、段间距、标题版式、编号和插图开关，并读取 iframe 的计算样式。
- 上传封面、移除封面、重新上传、从剪贴板粘贴封面，并检查封面缩略图与 `cover-image` 元数据。
- 构造空章节样例，验证定位、补充正文、删除空章、恢复删除以及导出后的目录变化。
- 导出 EPUB 并检查 ZIP 结构、`mimetype` 顺序、OPF/NAV/封面页内容；EPUB 导入后的导出结果再做一次 EPUBCheck。
- 生成 `samples/示例小说.epub`、`docs/screenshot.png`、`docs/screenshot-options.png` 等验收产物。

### EPUBCheck 校验

本项目生成的示例 EPUB 以及从示例 EPUB 重新导入并导出的结果都通过了 **EPUBCheck 5.4.0：0 errors / 0 warnings**。如需复跑：

1. 从 <https://github.com/w3c/epubcheck/releases> 下载 `epubcheck-5.4.0.zip`；
2. 解压到 `tools/epubcheck-5.4.0/`（该目录已加入 `.gitignore`）；
3. 执行：

```bash
npm run validate:epub -- samples/示例小说.epub
```

如果解压路径不同，可用 `EPUBCHECK_JAR=/path/to/epubcheck.jar npm run validate:epub -- ...`。

## 版本管理

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，格式为 `<type>(<scope>): <subject>`：

```text
feat(export): 支持自定义封面尺寸
fix(encoding): 修正 GB18030 边界字符解码
docs: 补充扩展安装说明
```

`type` 取 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。`Merge` 与 `Revert` 信息自动放行。

钩子放在 `scripts/git-hooks/`，通过 `core.hooksPath` 生效，随仓库分发，不需要 husky 之类的依赖。首次克隆后执行一次：

```bash
git config core.hooksPath scripts/git-hooks
```

`npm install` 时 `prepare` 脚本会自动执行同一条命令。钩子做两件事：

- `commit-msg`：校验提交信息格式，标题超过 100 字符直接拒绝，超过 72 字符给出提示；
- `pre-commit`：拦截 `.DS_Store`、`node_modules`、`dist`、`release`、测试产物、`.jar` 与 `.env` 等误入暂存区的文件，并对大于 2MB 的文件给出提示（不阻断）。

### 发版

```bash
npm run release -- patch       # 0.1.0 → 0.1.1
npm run release -- minor       # 0.1.0 → 0.2.0
npm run release -- major       # 0.1.0 → 1.0.0
npm run release -- 1.0.0       # 指定版本
npm run release -- minor --dry-run
```

脚本会校验工作区是否干净，按提交类型自动归类生成 `CHANGELOG.md` 段落，同步 `package.json` 与 `extension/manifest.json` 的版本号，提交 `chore(release): vX.Y.Z` 并打 `vX.Y.Z` 标签。推送时带上标签：

```bash
git push origin main --follow-tags
```

## 输出结构

```text
mimetype                      # 第一个文件、STORE 不压缩
META-INF/container.xml
OEBPS/content.opf             # EPUB 3 元数据、manifest、spine
OEBPS/nav.xhtml               # EPUB 3 目录
OEBPS/toc.ncx                 # 旧阅读器目录回退
OEBPS/css/style.css           # 缩进、段距、标题版式、封面页
OEBPS/images/cover.png        # 可选：上传的封面原图（扩展名随格式）
OEBPS/images/fig-001.png      # 可选：保留的正文插图（关闭“清除插图”时生成）
OEBPS/text/cover.xhtml        # 可选：封面页，位于正文之前
OEBPS/text/chapter-0001.xhtml
...
```

除自定义封面与保留的正文插图外，EPUB 内不包含图片、外部字体或远程资源，因此文件可以离线阅读，也不会触发网络请求。

## 项目结构

```text
src/
├── App.tsx                    # 状态编排、导入、导出
├── components/                # 上传、选项、元数据、EPUB 信息、预览、目录、统计、警告
├── core/
│   ├── encoding.ts            # 编码检测与解码
│   ├── chapters.ts            # 章节标题评分与切分
│   ├── images.ts              # 插图标记清理
│   ├── illustrations.ts       # 插图哈希、格式识别与 base64 编码
│   ├── cover.ts               # 封面图片校验与读取
│   ├── clipboard.ts           # 剪贴板图片读取
│   ├── titles.ts              # 标题解析、中文数字、编号、清洗
│   ├── paragraphs.ts          # 段落构建
│   ├── rendering.ts           # XHTML/CSS 渲染（预览与导出共用）
│   ├── pipeline.ts            # 解析管线
│   ├── download.ts            # 文件名清洗、下载
│   └── epub/
│       ├── build.ts           # EPUB ZIP 打包
│       ├── parsers.ts         # container / OPF / spine / nav / NCX 解析
│       └── import.ts          # EPUB 导入结果 → 统一 Chapter 模型
└── styles.css                 # 界面样式
extension/
├── manifest.json              # Manifest V3 扩展清单（无 permissions）
├── background.js              # 点击工具栏图标打开完整标签页
└── icons/                     # 16 / 32 / 48 / 128 扩展图标
scripts/
└── build-extension.mjs        # dist → release/extension + 商店 zip，并做 CSP/清单校验
tests/
├── unit/                      # Vitest 单元测试
├── e2e/                       # Playwright 端到端测试（含扩展冒烟用例）
└── fixtures/sample.txt        # 测试样例
public/sample/示例小说.txt      # 界面“加载示例”使用的样例
public/sample/示例封面.png      # 示例封面，供测试/演示
samples/示例小说.epub           # 默认排版 + 示例封面的示例成品
samples/示例小说-重排.epub       # 从示例 EPUB 导入后重新排版生成的样例
docs/                          # 界面截图
```

## 已知限制

- **TXT 中没有真实图片二进制**。“清除插图”处理的是图片标记、链接和占位符；关闭开关只保留原文标记，不会下载远程图片，base64 图片也按原文字输出。
- **EPUB 插图有体积上限**：单张超过 8MB、或全书累计超过 40MB 的插图会被跳过并给出警告；WebP 等非 EPUB 3 核心格式同样跳过。
- **封面始终保留**，不受「清除插图」开关影响。
- **EPUB 原样式不保留**：导入后会按本工具的排版选项全量重建，原 CSS、脚注弹窗、复杂分栏等结构不保证一致。
- **EPUB 目录会重建**：支持 nav / NCX / spine 的章节顺序，但嵌套分卷会压平为单层目录。
- 章节切分仍使用启发式规则，不提供拖动拆分点；空章节可以补充正文、修改标题或从导出中软删除。
- 段落按“一行一段”处理，不自动合并被硬换行拆开的段落。
- 分卷目前按独立章节处理，目录是平铺的；嵌套分卷目录留作后续增强。
- 封面支持 JPG / PNG / GIF，不支持 WebP / SVG；最大 10MB，不做自动裁剪或压缩。
- “粘贴图片”依赖浏览器的剪贴板读取权限；如果浏览器拒绝或没有直接读取能力，会切换到粘贴模式，按提示使用 ⌘V / Ctrl+V 即可。
- 封面页是单独一个 XHTML 页面；如果阅读器只读取 `cover-image` 属性，也会显示封面缩略图。
- 超过 20MB 的文件会提示可能较慢；建议先拆分或确认内存充足。
- 依赖浏览器 `TextDecoder` 对 GB18030 / Big5 的支持；如果当前浏览器不支持，请先转存为 UTF-8。
- 不处理 DRM 保护的电子书；EPUB 需要是可正常解压、未加密的 EPUB 2/3 文件。
- **扩展版不持久化状态**：关闭标签页后本次导入和选项不会保留；每次点击图标都会新开一个标签页。扩展也不申请 `clipboardRead`，因此“粘贴图片”的剪贴板直读可能需要走回退的粘贴模式。

## 隐私

整个转换流程在本地浏览器内完成：TXT / EPUB 都通过 `File.arrayBuffer()` 读取，EPUB 由 JSZip 解包和重新打包，不发送到任何服务器。运行时没有分析脚本、远程字体或图片请求。
