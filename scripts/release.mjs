#!/usr/bin/env node
/**
 * 发版脚本：bump 版本 → 生成 CHANGELOG 段落 → 提交 → 打标签。
 *
 *   node scripts/release.mjs patch        # 0.1.0 → 0.1.1
 *   node scripts/release.mjs minor        # 0.1.0 → 0.2.0
 *   node scripts/release.mjs major        # 0.1.0 → 1.0.0
 *   node scripts/release.mjs 1.2.3        # 指定版本
 *   node scripts/release.mjs minor --dry-run
 *
 * 变更条目由 Conventional Commits 的提交类型自动归类，因此提交规范是前提。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'extension', 'manifest.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

const TYPE_TITLES = {
  feat: '新增',
  fix: '修复',
  perf: '性能',
  refactor: '重构',
  docs: '文档',
  test: '测试',
  build: '构建',
  ci: '持续集成',
  style: '样式',
  chore: '杂项',
  revert: '回滚',
};

const TYPE_ORDER = Object.keys(TYPE_TITLES);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function git(args, input) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: input === undefined ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
}

function bumpVersion(current, kind) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    fail(`package.json 中的版本号无法解析：${current}`);
  }
  const [major, minor, patch] = parts;
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  fail('用法：node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run]');
  return '';
}

function previousTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0']).trim() || null;
  } catch {
    return null;
  }
}

function collectCommits(range) {
  const raw = git(['log', '--pretty=format:%h%x1f%s', range]).trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject] = line.split('\x1f');
      const match = /^(\w+)(?:\(([^)]+)\))?!?: (.+)$/.exec(subject ?? '');
      return {
        hash,
        subject: subject ?? '',
        type: match?.[1],
        scope: match?.[2],
        text: match?.[3],
      };
    });
}

function buildSection(commits) {
  const groups = new Map();
  for (const commit of commits) {
    if (!commit.type || !TYPE_TITLES[commit.type]) continue;
    // 发版提交本身不进变更日志
    if (commit.type === 'chore' && commit.scope === 'release') continue;
    if (commit.subject.startsWith('Merge ')) continue;
    if (!groups.has(commit.type)) groups.set(commit.type, []);
    const scope = commit.scope ? `**${commit.scope}**：` : '';
    groups.get(commit.type).push(`- ${scope}${commit.text}（${commit.hash}）`);
  }

  const lines = [];
  for (const type of TYPE_ORDER) {
    const items = groups.get(type);
    if (!items?.length) continue;
    lines.push(`### ${TYPE_TITLES[type]}`, '', ...items, '');
  }

  if (lines.length === 0) {
    return '### 其他\n\n- 本次发版没有用户可见的变更。\n';
  }
  return lines.join('\n');
}

function updateChangelog(version, date, section) {
  const fallback = '# 更新日志\n\n## [Unreleased]\n';
  const current = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : fallback;
  const entry = `## [${version}] - ${date}\n\n${section}`;
  const marker = '## [Unreleased]';

  const index = current.indexOf(marker);
  if (index === -1) {
    return `${current.trimEnd()}\n\n${entry}`;
  }

  const head = current.slice(0, index + marker.length);
  const tail = current.slice(index + marker.length).replace(/^\n+/, '');
  return `${head}\n\n${entry}\n${tail}`;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const kind = args.find((arg) => !arg.startsWith('--'));

  if (!kind) fail('用法：node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run]');

  const dirty = git(['status', '--porcelain']).trim();
  if (dirty) {
    fail(`工作区有未提交的改动，请先提交或 stash 后再发版：\n${dirty}`);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  const nextVersion = bumpVersion(currentVersion, kind);

  if (nextVersion === currentVersion) {
    fail(`新版本号与当前版本相同（${currentVersion}），无需发版。`);
  }

  const tag = previousTag();
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const commits = collectCommits(range);

  if (commits.length === 0 && tag) {
    fail(`自 ${tag} 以来没有任何提交，无法生成变更日志。`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const section = buildSection(commits);
  const changelog = updateChangelog(nextVersion, date, section);

  console.log(`\n版本：${currentVersion} → ${nextVersion}`);
  console.log(`范围：${tag ? `${tag}..HEAD` : '全部提交'}`);
  console.log(`提交：${commits.length} 条\n`);
  console.log('--- CHANGELOG 新增段落 ---');
  console.log(`## [${nextVersion}] - ${date}\n\n${section}`);

  if (dryRun) {
    console.log('--- dry-run，未写入任何文件 ---');
    return;
  }

  writeFileSync(changelogPath, changelog);
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // 源清单的版本号与 package.json 保持同步；构建时仍以 package.json 为准。
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = nextVersion;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  git(['add', 'package.json', 'CHANGELOG.md', 'extension/manifest.json']);
  git(
    ['commit', '-q', '-F', '-'],
    `chore(release): v${nextVersion}\n\n由 scripts/release.mjs 自动生成，范围 ${range}。\n`,
  );
  git(['tag', '-a', `v${nextVersion}`, '-m', `v${nextVersion}`]);

  console.log(`\n✓ 已提交并打标签 v${nextVersion}`);
  console.log(`  推送：git push origin main --follow-tags`);
}

main();
