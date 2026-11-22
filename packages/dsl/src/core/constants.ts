import type { EdgeOp } from './ast';

export const DIAGRAM_TYPES = ['architecture', 'sequence', 'erd', 'flowchart'] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];
export const SUPPORTED_TYPES: readonly DiagramType[] = ['architecture'];

export const DIRECTIONS = ['right', 'down', 'left', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];
/** The looks a diagram can be drawn in (spec 8). No `style:` line means crisp. */
export const DIAGRAM_STYLES = ['crisp', '3d'] as const;
export type DiagramStyle = (typeof DIAGRAM_STYLES)[number];

export const COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'yellow', 'gray', 'teal', 'pink'] as const;
export type Color = (typeof COLORS)[number];

export const EDGE_OPERATORS: ReadonlyArray<{ op: EdgeOp; meaning: string }> = [
  { op: '->', meaning: 'arrow from left to right' },
  { op: '<-', meaning: 'arrow from right to left' },
  { op: '<->', meaning: 'arrows both ways' },
  { op: '--', meaning: 'line without arrows' },
  { op: '-->', meaning: 'dashed arrow (async, optional, eventual)' },
];
