import { charLength, parseHeading } from './titles';
import type { HeadingParts, RawChapter } from './types';

interface Candidate {
  lineIndex: number;
  line: string;
  parts: HeadingParts;
}

interface BareCandidate {
  lineIndex: number;
  line: string;
}

export interface ChapterSplitResult {
  chapters: RawChapter[];
  hasHeadings: boolean;
  bareHeadings: boolean;
}

const BARE_TITLE_META_PREFIX = /^(?:书名|作者|简介|内容简介|文案|标签|字数|状态|更新时间)[:：]/;

export function isBlankLine(line: string | undefined): boolean {
  return line === undefined || line.trim() === '';
}

export function scoreHeading(
  line: string,
  parts: HeadingParts,
  length: number,
  previousBlank: boolean,
  nextBlank: boolean,
): number {
  let score = 2;
  if (length <= 24) score += 1;

  const endsWithSentencePunctuation = /[。！？；…]$/.test(line);
  if (!endsWithSentencePunctuation) score += 1;
  else score -= 2;

  if (previousBlank) score += 1;
  if (nextBlank) score += 1;
  if (!parts.subtitle) score += 1;

  const punctuationCount = (line.match(/[，。！？；：“”‘’、]/g) ?? []).length;
  if (punctuationCount >= 2) score -= 1;

  return score;
}

function looksLikeBareTitle(line: string): boolean {
  const length = charLength(line);
  if (length < 2 || length > 18) return false;
  if (/[。！？；…，、]/.test(line)) return false;
  if (/[“”"「」『』]/.test(line)) return false;
  if (/^[（(【[]/.test(line)) return false;
  if (BARE_TITLE_META_PREFIX.test(line)) return false;
  if (!/[\u4e00-\u9fffA-Za-z]/.test(line)) return false;
  return true;
}

/**
 * Some TXT files use bare, unnumbered titles ("初入江湖") separated by blank
 * lines. This is only attempted when the user enabled auto-numbering and no
 * standard heading was found, so normal numbered books are never affected.
 * Requiring at least three candidates avoids turning a single stray line into
 * a chapter.
 */
function findBareHeadings(lines: string[]): BareCandidate[] {
  const candidates: BareCandidate[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!looksLikeBareTitle(line)) continue;
    if (i > 0 && !isBlankLine(lines[i - 1])) continue;
    candidates.push({ lineIndex: i, line });
  }
  return candidates.length >= 3 ? candidates : [];
}

function rawChaptersFromBareCandidates(
  lines: string[],
  candidates: BareCandidate[],
): RawChapter[] {
  const chapters: RawChapter[] = [];
  let nextId = 0;
  const first = candidates[0];

  const preambleLines = lines.slice(0, first.lineIndex);
  if (preambleLines.some((line) => line.trim())) {
    chapters.push({ id: nextId, rawTitle: '开篇', lines: preambleLines, kind: 'preamble' });
    nextId += 1;
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const next = candidates[i + 1];
    chapters.push({
      id: nextId,
      rawTitle: candidate.line,
      lines: lines.slice(candidate.lineIndex + 1, next ? next.lineIndex : lines.length),
      kind: 'chapter',
    });
    nextId += 1;
  }

  return chapters;
}


function chunkByLength(lines: string[], target = 3000): RawChapter[] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (!line.trim() && current.length === 0) continue;
    current.push(line);
    currentLength += line.replace(/\s/g, '').length;
    if (currentLength >= target) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
  }

  if (current.some((line) => line.trim())) groups.push(current);

  return groups.map((groupLines, index) => ({
    id: index,
    rawTitle: `第${index + 1}节`,
    lines: groupLines,
    kind: 'fallback' as const,
  }));
}

/**
 * Split normalized text into raw chapters. The title heuristics are deliberately
 * conservative: a line must look like a heading, be reasonably short, and not
 * read like a sentence.
 */
export function splitRawChapters(
  text: string,
  fallback: 'single' | 'chunk' = 'single',
  detectBareTitles = false,
): ChapterSplitResult {
  const lines = text.split('\n');
  const candidates: Candidate[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const original = lines[i].trim();
    if (!original) continue;

    const parts = parseHeading(original);
    if (!parts) continue;

    const length = charLength(original);
    const maxLength = parts.kind === 'english' ? 60 : 30;
    if (length > maxLength) continue;

    const score = scoreHeading(
      original,
      parts,
      length,
      isBlankLine(lines[i - 1]),
      isBlankLine(lines[i + 1]),
    );

    if (score >= 3) {
      candidates.push({ lineIndex: i, line: original, parts });
    }
  }

  if (candidates.length === 0) {
    if (!text.trim()) return { chapters: [], hasHeadings: false, bareHeadings: false };

    if (detectBareTitles) {
      const bareCandidates = findBareHeadings(lines);
      if (bareCandidates.length > 0) {
        return {
          chapters: rawChaptersFromBareCandidates(lines, bareCandidates),
          hasHeadings: true,
          bareHeadings: true,
        };
      }
    }

    if (fallback === 'chunk') {
      return { chapters: chunkByLength(lines), hasHeadings: false, bareHeadings: false };
    }
    return {
      chapters: [
        {
          id: 0,
          rawTitle: '全文',
          lines,
          kind: 'fallback',
        },
      ],
      hasHeadings: false,
      bareHeadings: false,
    };
  }

  const chapters: RawChapter[] = [];
  let nextId = 0;
  const first = candidates[0];

  const preambleLines = lines.slice(0, first.lineIndex);
  if (preambleLines.some((line) => line.trim())) {
    chapters.push({
      id: nextId,
      rawTitle: '开篇',
      lines: preambleLines,
      kind: 'preamble',
    });
    nextId += 1;
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const next = candidates[i + 1];
    const end = next ? next.lineIndex : lines.length;
    const kind =
      candidate.parts.kind === 'volume'
        ? 'volume'
        : candidate.parts.special
          ? 'special'
          : 'chapter';

    chapters.push({
      id: nextId,
      rawTitle: candidate.line,
      lines: lines.slice(candidate.lineIndex + 1, end),
      kind,
    });
    nextId += 1;
  }

  return { chapters, hasHeadings: true, bareHeadings: false };
}
