export interface ImageSnippet {
  kind: string;
  snippet: string;
}

export interface ImageStripResult {
  text: string;
  count: number;
  snippets: ImageSnippet[];
}

interface ImageRule {
  kind: string;
  pattern: RegExp;
}

/**
 * Rules run from most specific to least specific. The bare-URL rule is last so
 * that URLs already consumed by Markdown/BBCode/HTML rules are not counted
 * twice.
 */
const RULES: ImageRule[] = [
  { kind: 'html-figure', pattern: /<figure\b[^>]*>[\s\S]*?<\/figure>/gi },
  { kind: 'html-picture', pattern: /<picture\b[^>]*>[\s\S]*?<\/picture>/gi },
  { kind: 'html-img', pattern: /<img\b[^>]*\/?>/gi },
  { kind: 'markdown', pattern: /!\[[^\]]*\]\([^)]*\)/g },
  { kind: 'markdown-ref', pattern: /!\[[^\]]*\]\[[^\]]*\]/g },
  { kind: 'bbcode', pattern: /\[img(?:=[^\]]*)?\][\s\S]*?\[\/img\]/gi },
  { kind: 'base64', pattern: /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/gi },
  {
    kind: 'placeholder',
    pattern:
      /(?:[\[【（(]\s*(?:插图|插画|图片|配图|图|image|img|pic|picture|illustration)\s*(?:[:：][^\]】）)]*)?[\]】）)])/gi,
  },
  {
    kind: 'url',
    pattern:
      /(?:https?|ftp):\/\/[^\s<>"'（）【】]+?\.(?:jpe?g|png|gif|webp|bmp|svg)(?:\?[^\s<>"'（）【】]*)?/gi,
  },
];

export function stripImages(input: string, enabled: boolean): ImageStripResult {
  if (!enabled || !input) return { text: input, count: 0, snippets: [] };

  let count = 0;
  const snippets: ImageSnippet[] = [];
  let text = input;

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      count += 1;
      if (snippets.length < 50) {
        const snippet = match.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (snippet) snippets.push({ kind: rule.kind, snippet });
      }
      return '';
    });
  }

  text = text
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t\u3000]{2,}/g, ' ')
        .replace(/^[ \t\u3000]+/, '')
        .replace(/[ \t\u3000]+$/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return { text: text.trim(), count, snippets };
}
