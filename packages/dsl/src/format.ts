import { parse } from './core/parser';
import { tokenize, type Token } from './core/tokenize';

const INDENT = '  ';
/** Columns between the longest statement and its aligned trailing comment. */
const COMMENT_GAP = 2;

interface Line {
  depth: number;
  code: string;
  comment?: string;
}

/** One attribute (`key: value`), or a comment on its own line inside the list (no tokens). */
interface Attr {
  tokens: Token[];
  comment?: string;
}

/** A statement collected from tokens: what comes before '[', the attribute list, and what follows ']'. */
interface Statement {
  head: Token[];
  attrs: Attr[] | null;
  attrComment?: string;
  tail: Token[];
  hasAttrComments: boolean;
}

const newStatement = (): Statement => ({ head: [], attrs: null, tail: [], hasAttrComments: false });
const isEmpty = (s: Statement) => s.head.length === 0 && s.attrs === null && s.tail.length === 0;

/** Joins significant tokens with the canonical spacing. */
function join(tokens: readonly Token[]): string {
  let out = '';
  let prev: Token | undefined;
  for (const t of tokens) {
    if (prev) {
      const noSpace =
        t.text === ',' ||
        t.text === ']' ||
        prev.text === '[' ||
        (t.text === ':' && (prev.kind === 'keyword' || prev.kind === 'attr-key'));
      out += noSpace ? '' : ' ';
    }
    out += t.text;
    prev = t;
  }
  return out;
}

function attrText(attr: Attr): string {
  return join(attr.tokens);
}

/**
 * Formats diagram source: one statement per line, two-space indentation per group, canonical spacing, one blank
 * line at most, aligned trailing comments. Every comment is kept. Sources with syntax errors are returned unchanged,
 * and so is any result that would not parse to exactly the same diagram.
 */
export function format(source: string): string {
  if (parse(source).diagnostics.some((d) => d.severity === 'error')) return source;
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const tokens = tokenize(text);
  if (tokens.some((t) => t.kind === 'text')) return source;

  const lines: Line[] = [];
  let depth = 0;
  let stmt = newStatement();
  let inAttrs = false;
  let currentAttr: Attr | null = null;
  /** A newline inside the attribute list since its last token: a comment there stands on its own line. */
  let attrNewline = false;
  /** True until a newline: a comment then belongs to the line just written. */
  let lineOpen = false;

  const pushBlank = () => {
    const last = lines.at(-1);
    if (!last || (last.code === '' && last.comment === undefined) || last.code.endsWith('{')) return;
    lines.push({ depth, code: '' });
  };

  const flush = () => {
    if (isEmpty(stmt)) return;
    const head = join(stmt.head);
    const tail = join(stmt.tail);
    const after = (s: string) => (s === '' ? '' : s.startsWith(',') ? s : ` ${s}`);
    if (stmt.attrs === null) {
      lines.push({ depth, code: head + after(tail) });
    } else if (!stmt.hasAttrComments) {
      const list = `[${stmt.attrs.map(attrText).join(', ')}]`;
      lines.push({ depth, code: `${head === '' ? '' : `${head} `}${list}${after(tail)}` });
    } else {
      const open: Line = { depth, code: `${head === '' ? '' : `${head} `}[` };
      if (stmt.attrComment) open.comment = stmt.attrComment;
      lines.push(open);
      const lastReal = stmt.attrs.findLastIndex((a) => a.tokens.length > 0);
      stmt.attrs.forEach((a, i) => {
        const line: Line = { depth: depth + 1, code: a.tokens.length ? attrText(a) + (i < lastReal ? ',' : '') : '' };
        if (a.comment) line.comment = a.comment;
        lines.push(line);
      });
      lines.push({ depth, code: `]${after(tail)}` });
    }
    stmt = newStatement();
    lineOpen = true;
  };

  for (const t of tokens) {
    if (t.kind === 'whitespace') {
      const newlines = t.text.split('\n').length - 1;
      if (newlines === 0) continue;
      if (inAttrs) {
        attrNewline = true;
        continue;
      }
      flush();
      lineOpen = false;
      if (newlines >= 2) pushBlank();
      continue;
    }
    if (t.kind === 'comment') {
      const comment = t.text.trimEnd();
      if (inAttrs) {
        stmt.hasAttrComments = true;
        const attrs = stmt.attrs!;
        const target = currentAttr ?? attrs.at(-1);
        if (!attrNewline && !target && !stmt.attrComment) stmt.attrComment = comment;
        else if (!attrNewline && target && target.tokens.length > 0 && !target.comment) target.comment = comment;
        else {
          // Its own line inside the list: keep it there, in order.
          attrs.push({ tokens: [], comment });
          currentAttr = null;
        }
        continue;
      }
      if (!isEmpty(stmt)) {
        flush();
        lines.at(-1)!.comment = comment;
      } else if (lineOpen && lines.length > 0 && lines.at(-1)!.comment === undefined && lines.at(-1)!.code !== '') {
        lines.at(-1)!.comment = comment;
      } else {
        lines.push({ depth, code: '', comment });
      }
      continue;
    }
    if (inAttrs) {
      attrNewline = false;
      if (t.text === ']') {
        inAttrs = false;
        currentAttr = null;
      } else if (t.text === ',') {
        currentAttr = null;
      } else {
        if (!currentAttr) {
          currentAttr = { tokens: [] };
          stmt.attrs!.push(currentAttr);
        }
        currentAttr.tokens.push(t);
      }
      continue;
    }
    if (t.text === '[' && t.kind === 'punctuation') {
      inAttrs = true;
      stmt.attrs = [];
      continue;
    }
    if (t.text === ';') {
      flush();
      continue;
    }
    if (t.text === '{') {
      stmt.tail.push(t);
      flush();
      depth++;
      continue;
    }
    if (t.text === '}') {
      flush();
      while (lines.at(-1)?.code === '' && lines.at(-1)?.comment === undefined) lines.pop();
      depth = Math.max(0, depth - 1);
      lines.push({ depth, code: '}' });
      lineOpen = true;
      continue;
    }
    (stmt.attrs === null ? stmt.head : stmt.tail).push(t);
  }
  flush();
  while (lines.at(-1)?.code === '' && lines.at(-1)?.comment === undefined) lines.pop();

  const formatted = lines.length === 0 ? '' : render(lines);
  // Safety net: same diagram, and the same comments in the same order; otherwise leave the source alone.
  const same = meaning(formatted) === meaning(text) && commentsOf(formatted) === commentsOf(text);
  return same ? formatted : source;
}

function render(lines: Line[]): string {
  const width = (l: Line) => l.depth * INDENT.length + l.code.length;
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    // A run of consecutive statements with trailing comments shares one comment column.
    let j = i;
    while (j < lines.length && lines[j]!.code !== '' && lines[j]!.comment !== undefined) j++;
    const column = Math.max(0, ...lines.slice(i, j).map(width)) + COMMENT_GAP;
    for (let k = i; k < Math.max(j, i + 1); k++) {
      const l = lines[k]!;
      const code = INDENT.repeat(l.depth) + l.code;
      if (l.comment === undefined) out.push(code);
      else if (l.code === '') out.push(INDENT.repeat(l.depth) + l.comment);
      else out.push(code + ' '.repeat(column - width(l)) + l.comment);
    }
    i = Math.max(j, i + 1);
  }
  return `${out.join('\n')}\n`;
}

const commentsOf = (src: string): string =>
  JSON.stringify(
    tokenize(src)
      .filter((t) => t.kind === 'comment')
      .map((t) => t.text.trimEnd()),
  );

const meaning = (src: string) =>
  JSON.stringify(parse(src).doc, (key, value: unknown) => (/span$/i.test(key) ? undefined : value));
