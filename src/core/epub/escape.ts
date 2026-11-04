/**
 * Remove characters that are not legal in XML 1.0 and escape the five
 * predefined entities. All text coming from a TXT file must pass through here
 * before it is placed in XHTML or OPF files.
 */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function sanitizeXmlText(input: string): string {
  return input.replace(INVALID_XML_CHARS, '');
}

export function escapeXml(input: string): string {
  return sanitizeXmlText(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(input: string): string {
  return escapeXml(input);
}
