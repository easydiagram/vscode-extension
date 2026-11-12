import { FALLBACK_ICON_NAME, resolveIcon } from '@app/icons';
import type { Attr, Document, EdgeOp, EdgeStmt, Statement } from '../../core/ast';
import { COLORS, DIRECTIONS, type Color, type Direction } from '../../core/constants';
import { diag, type Diagnostic, type Span } from '../../core/diagnostics';
import { LIMITS } from '../../core/limits';
import { oneOf } from '../../core/narrow';
import { ARCH_GROUP_ATTRS, ARCH_NODE_ATTRS, ARCH_SHAPES, LINE_STYLES, type ArchShape, type LineStyle } from './spec';

export type Arrow = 'end' | 'start' | 'both' | 'none';

export interface ArchNode {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  shape: ArchShape;
  style: LineStyle;
  link?: string;
  parent?: string;
  /** Set on a collapsed group drawn as one box: how many nodes it holds. */
  items?: number;
}

export interface ArchGroup {
  id: string;
  label: string;
  icon?: string;
  color: string;
  parent?: string;
  children: string[];
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** The labels a merged edge stands for, shown on hover (collapsed groups). */
  title?: string;
  arrow: Arrow;
  style: 'solid' | 'dashed';
}

export interface ArchitectureModel {
  direction: Direction;
  title?: string;
  nodes: Map<string, ArchNode>;
  groups: Map<string, ArchGroup>;
  edges: ArchEdge[];
  rootChildren: string[];
}

/** Colours given to groups that do not choose one. No green: it is not part of the brand (an explicit `color: green` still works). */
const GROUP_PALETTE: readonly Color[] = ['blue', 'orange', 'purple', 'red', 'teal', 'yellow', 'pink'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const OP_STYLE: Record<EdgeOp, { arrow: Arrow; style: 'solid' | 'dashed' }> = {
  '->': { arrow: 'end', style: 'solid' },
  '->>': { arrow: 'end', style: 'solid' },
  '<-': { arrow: 'start', style: 'solid' },
  '<->': { arrow: 'both', style: 'solid' },
  '--': { arrow: 'none', style: 'solid' },
  '-->': { arrow: 'end', style: 'dashed' },
};

export function buildArchitectureModel(doc: Document, diagnostics: Diagnostic[]): ArchitectureModel {
  const model: ArchitectureModel = {
    direction: readDirection(doc, diagnostics),
    nodes: new Map(),
    groups: new Map(),
    edges: [],
    rootChildren: [],
  };
  if (doc.headers.title) model.title = doc.headers.title.value;

  const edgeStmts: EdgeStmt[] = [];
  let paletteIndex = 0;
  let tooManyEdges = false;
  const pairCount = new Map<string, number>();

  let tooManyNodes = false;
  // Stop creating elements at the limit, so a hostile source can't make us build (and check icons for) 50k nodes.
  const hasRoom = (): boolean => {
    if (model.nodes.size + model.groups.size < LIMITS.maxNodes) return true;
    tooManyNodes = true;
    return false;
  };

  const declare = (id: string, span: Span): boolean => {
    if (!model.nodes.has(id) && !model.groups.has(id)) return hasRoom();
    diagnostics.push(
      diag('error', 'E_DUPLICATE_ID', span, `'${id}' is already declared`, 'Every node and group needs a unique id.'),
    );
    return false;
  };

  const visit = (statements: Statement[], parent: ArchGroup | undefined): void => {
    const siblings = parent ? parent.children : model.rootChildren;
    for (const st of statements) {
      if (st.kind === 'edge') {
        edgeStmts.push(st);
        continue;
      }
      if (st.kind === 'node') {
        if (!declare(st.id, st.idSpan)) continue;
        const node: ArchNode = { id: st.id, label: st.label ?? st.id, shape: 'box', style: 'solid' };
        if (parent) node.parent = parent.id;
        applyNodeAttrs(node, st.attrs, diagnostics);
        model.nodes.set(node.id, node);
        siblings.push(node.id);
        continue;
      }
      if (!declare(st.name, st.nameSpan)) {
        visit(st.children, parent);
        continue;
      }
      const hasColor = st.attrs.some((a) => a.key === 'color');
      const group: ArchGroup = {
        id: st.name,
        label: st.name,
        color: hasColor ? 'gray' : GROUP_PALETTE[paletteIndex++ % GROUP_PALETTE.length]!,
        children: [],
      };
      if (parent) group.parent = parent.id;
      applyGroupAttrs(group, st.attrs, diagnostics);
      model.groups.set(group.id, group);
      siblings.push(group.id);
      visit(st.children, group);
    }
  };
  visit(doc.statements, undefined);

  for (const st of edgeStmts) {
    for (const ref of [...st.from, ...st.to]) {
      if (model.nodes.has(ref.name) || model.groups.has(ref.name)) continue;
      if (!hasRoom()) continue;
      model.nodes.set(ref.name, { id: ref.name, label: ref.name, shape: 'box', style: 'solid' });
      model.rootChildren.push(ref.name);
      diagnostics.push(
        diag(
          'info',
          'I_AUTO_NODE',
          ref.span,
          `'${ref.name}' was not declared, so it was created automatically`,
          `Declare it to set a label and icon: ${ref.name} "Label" [icon: server]`,
        ),
      );
    }
    const { arrow, style } = OP_STYLE[st.op];
    expand: for (const from of st.from) {
      for (const to of st.to) {
        if (model.edges.length >= LIMITS.maxEdges) {
          tooManyEdges = true;
          break expand;
        }
        // Quoted IDs may contain the separators: encode each endpoint to keep pairs unambiguous.
        const pair = `${encodeURIComponent(from.name)}->${encodeURIComponent(to.name)}`;
        const n = pairCount.get(pair) ?? 0;
        pairCount.set(pair, n + 1);
        const edge: ArchEdge = { id: `${pair}#${n}`, from: from.name, to: to.name, arrow, style };
        if (st.label !== undefined) edge.label = st.label;
        model.edges.push(edge);
      }
    }
  }
  const whole = { line: 1, col: 1, endLine: 1, endCol: 1 };
  if (tooManyEdges) {
    diagnostics.push(
      diag('error', 'E_TOO_LARGE', whole, `More than ${LIMITS.maxEdges} edges`, 'Split the diagram into smaller ones.'),
    );
  }
  if (tooManyNodes) {
    diagnostics.push(
      diag(
        'error',
        'E_TOO_LARGE',
        whole,
        `More than ${LIMITS.maxNodes} nodes and groups`,
        'Split the diagram into smaller ones.',
      ),
    );
  }
  return model;
}

function readDirection(doc: Document, diagnostics: Diagnostic[]): Direction {
  const header = doc.headers.direction;
  if (!header) return 'right';
  const direction = oneOf(DIRECTIONS, header.value.trim().toLowerCase());
  if (direction) return direction;
  diagnostics.push(
    diag(
      'warning',
      'W_INVALID_ATTR_VALUE',
      header.valueSpan,
      `Unknown direction '${header.value}'; using right`,
      `Use one of: ${DIRECTIONS.join(', ')}`,
    ),
  );
  return 'right';
}

function applyNodeAttrs(node: ArchNode, attrs: Attr[], diagnostics: Diagnostic[]): void {
  for (const a of attrs) {
    switch (a.key) {
      case 'icon':
        node.icon = checkIcon(a, diagnostics);
        break;
      case 'color': {
        const color = checkColor(a, diagnostics);
        if (color) node.color = color;
        break;
      }
      case 'shape':
        {
          const shape = oneOf(ARCH_SHAPES, a.value);
          if (shape) node.shape = shape;
          else invalidValue(a, diagnostics, ARCH_SHAPES);
        }
        break;
      case 'style':
        {
          const style = oneOf(LINE_STYLES, a.value);
          if (style) node.style = style;
          else invalidValue(a, diagnostics, LINE_STYLES);
        }
        break;
      case 'link':
        if (/^https?:\/\//.test(a.value)) node.link = a.value;
        else
          diagnostics.push(
            diag('warning', 'W_INVALID_ATTR_VALUE', a.valueSpan, `link must start with http:// or https://`),
          );
        break;
      default:
        unknownAttr(a, diagnostics, Object.keys(ARCH_NODE_ATTRS), 'node');
    }
  }
}

function applyGroupAttrs(group: ArchGroup, attrs: Attr[], diagnostics: Diagnostic[]): void {
  for (const a of attrs) {
    switch (a.key) {
      case 'icon':
        group.icon = checkIcon(a, diagnostics);
        break;
      case 'color': {
        const color = checkColor(a, diagnostics);
        if (color) group.color = color;
        break;
      }
      default:
        unknownAttr(a, diagnostics, Object.keys(ARCH_GROUP_ATTRS), 'group');
    }
  }
}

const MAX_ICON_SUGGESTIONS = 20;

function checkIcon(a: Attr, diagnostics: Diagnostic[]): string {
  const unknownSoFar = diagnostics.filter((d) => d.code === 'W_UNKNOWN_ICON').length;
  const result = resolveIcon(a.value, { suggest: unknownSoFar < MAX_ICON_SUGGESTIONS });
  if (result.icon) return result.icon.name;
  const hint =
    result.suggestions.length > 0
      ? `Did you mean ${result.suggestions.map((s) => `"${s}"`).join(', ')}? Use list_icons to search.`
      : 'Use the list_icons tool to search icon names.';
  diagnostics.push(
    diag('warning', 'W_UNKNOWN_ICON', a.valueSpan, `Unknown icon '${a.value}'; showing a generic icon`, hint),
  );
  return FALLBACK_ICON_NAME;
}

function checkColor(a: Attr, diagnostics: Diagnostic[]): string | null {
  const value = a.value.trim();
  const named = oneOf(COLORS, value.toLowerCase());
  if (named) return named;
  if (HEX.test(value)) return value.toLowerCase();
  invalidValue(a, diagnostics, [...COLORS, '#rrggbb']);
  return null;
}

function invalidValue(a: Attr, diagnostics: Diagnostic[], allowed: readonly string[]): void {
  diagnostics.push(
    diag(
      'warning',
      'W_INVALID_ATTR_VALUE',
      a.valueSpan,
      `Invalid ${a.key} '${a.value}'`,
      `Use one of: ${allowed.join(', ')}`,
    ),
  );
}

function unknownAttr(a: Attr, diagnostics: Diagnostic[], allowed: readonly string[], what: string): void {
  diagnostics.push(
    diag(
      'warning',
      'W_UNKNOWN_ATTR',
      a.keySpan,
      `Unknown ${what} attribute '${a.key}' (ignored)`,
      `Allowed: ${allowed.join(', ')}`,
    ),
  );
}
