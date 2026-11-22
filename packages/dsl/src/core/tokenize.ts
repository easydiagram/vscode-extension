export type TokenKind =
  | 'keyword'
  | 'id'
  | 'string'
  | 'operator'
  | 'punctuation'
  | 'attr-key'
  | 'value'
  | 'label'
  | 'comment'
  | 'whitespace'
  | 'text';

export interface Token {
  kind: TokenKind;
  text: string;
  /** Offset of the first character in the source. */
  start: number;
}

const OPERATORS = ['<->', '-->', '->>', '->', '<-', '--'] as const;
const HEADER_KEYS = new Set(['type', 'direction', 'style', 'title']);
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r';
const isIdentStart = (c: string | undefined) => !!c && /[A-Za-z_]/.test(c);
const isIdentPart = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);

type State = 'statement' | 'header-value' | 'edge-label' | 'attr' | 'attr-value';

/**
 * Splits source into highlightable tokens. Lossless (the token texts join back to the source), linear, and it never
 * throws: broken input still gets colors. It follows the parser's rules but does not report errors.
 */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, start: number, end: number) => {
    if (end <= start) return;
    const last = tokens.at(-1);
    if (last && last.kind === kind && (kind === 'whitespace' || kind === 'text')) last.text += src.slice(start, end);
    else tokens.push({ kind, text: src.slice(start, end), start });
  };

  let i = 0;
  let state: State = 'statement';
  let atStatementStart = true;
  let afterHeader = false;

  const readString = (): number => {
    let j = i + 1;
    while (j < src.length && src[j] !== '"' && src[j] !== '\n')
      j += src[j] === '\\' && (src[j + 1] === '"' || src[j + 1] === '\\') ? 2 : 1;
    return src[j] === '"' ? j + 1 : j;
  };
  const readIdent = (): number => {
    let j = i + 1;
    while (isIdentPart(src[j]) || (src[j] === '-' && isIdentPart(src[j + 1]))) j++;
    return j;
  };
  const comment = (): boolean => {
    if (src[i] !== '/' || src[i + 1] !== '/') return false;
    let j = i;
    while (j < src.length && src[j] !== '\n') j++;
    push('comment', i, j);
    i = j;
    return true;
  };
  /** Unquoted header value or edge label: up to a newline, ';', '}' or a space-preceded '//'. */
  const rawValue = (kind: 'value' | 'label') => {
    const start = i;
    let j = i;
    while (j < src.length && src[j] !== '\n' && src[j] !== ';' && src[j] !== '}') {
      if (src[j] === '/' && src[j + 1] === '/' && (j === start || isSpace(src[j - 1]))) break;
      j++;
    }
    let end = j;
    while (end > start && isSpace(src[end - 1])) end--;
    push(kind, start, end);
    push('whitespace', end, j);
    i = j;
  };

  while (i < src.length) {
    const c = src[i]!;
    if (isSpace(c)) {
      push('whitespace', i, i + 1);
      i++;
      continue;
    }

    if (state === 'header-value' || state === 'edge-label') {
      if (c === '\n' || c === ';' || c === '}') state = 'statement';
      else if (comment()) state = 'statement';
      else if (c === '"') {
        push('string', i, (i = readString()));
        state = 'statement';
      } else {
        rawValue(state === 'header-value' ? 'value' : 'label');
        state = 'statement';
      }
      continue;
    }

    if (state === 'attr' || state === 'attr-value') {
      if (c === '\n') {
        push('whitespace', i, ++i);
        continue;
      }
      if (comment()) continue;
      if (c === ']') {
        push('punctuation', i, ++i);
        state = 'statement';
        continue;
      }
      if (c === ',') {
        push('punctuation', i, ++i);
        state = 'attr';
        continue;
      }
      if (state === 'attr') {
        if (isIdentStart(c)) push('attr-key', i, (i = readIdent()));
        else if (c === ':') {
          push('punctuation', i, ++i);
          state = 'attr-value';
        } else push('text', i, ++i);
        continue;
      }
      if (c === '"') {
        push('string', i, (i = readString()));
        state = 'attr';
        continue;
      }
      const start = i;
      let j = i;
      while (j < src.length && src[j] !== ',' && src[j] !== ']' && src[j] !== '\n') {
        if (src[j] === '/' && src[j + 1] === '/' && j > start && isSpace(src[j - 1])) break;
        j++;
      }
      let end = j;
      while (end > start && isSpace(src[end - 1])) end--;
      push('value', start, end);
      push('whitespace', end, j);
      i = j;
      state = 'attr';
      continue;
    }

    // Statement level.
    if (c === '\n' || c === ';' || c === '{' || c === '}') {
      push(c === '\n' ? 'whitespace' : 'punctuation', i, ++i);
      atStatementStart = true;
      afterHeader = false;
      continue;
    }
    if (comment()) continue;
    const startOfStatement = atStatementStart;
    atStatementStart = false;
    if (c === '"') {
      push('string', i, (i = readString()));
      continue;
    }
    if (isIdentStart(c)) {
      const end = readIdent();
      const word = src.slice(i, end);
      let next = end;
      while (isSpace(src[next])) next++;
      if (startOfStatement && HEADER_KEYS.has(word) && src[next] === ':') {
        push('keyword', i, end);
        afterHeader = true;
      } else if (startOfStatement && word === 'group' && next > end && (src[next] === '"' || isIdentStart(src[next]))) {
        push('keyword', i, end);
      } else push('id', i, end);
      i = end;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      push('operator', i, (i += op.length));
      continue;
    }
    if (c === ':') {
      push('punctuation', i, ++i);
      state = afterHeader ? 'header-value' : 'edge-label';
      continue;
    }
    if (c === '[') {
      push('punctuation', i, ++i);
      state = 'attr';
      continue;
    }
    push(c === ',' ? 'punctuation' : 'text', i, ++i);
  }
  return tokens;
}
