/**
 * Indexes of UTF-16 code units that are illegal in XML 1.0: C0 controls other than tab/LF/CR, U+FFFE/U+FFFF and
 * lone surrogates. Agents sometimes emit these; left in, they break SVG export and PNG rasterization.
 */
export function illegalCharIndexes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) out.push(i);
    else if (c === 0xfffe || c === 0xffff) out.push(i);
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else out.push(i);
    } else if (c >= 0xdc00 && c <= 0xdfff) out.push(i);
  }
  return out;
}

export function stripIllegalChars(text: string): string {
  const bad = new Set(illegalCharIndexes(text));
  if (bad.size === 0) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) if (!bad.has(i)) out += text[i];
  return out;
}
