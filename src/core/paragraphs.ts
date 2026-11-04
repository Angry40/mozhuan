export function buildParagraphs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, ''))
    .filter((line) => line.length > 0);
}
