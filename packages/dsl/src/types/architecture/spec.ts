import { COLORS } from '../../core/constants';

export const ARCH_SHAPES = ['box', 'cylinder', 'queue', 'cloud', 'user'] as const;
export type ArchShape = (typeof ARCH_SHAPES)[number];

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

export const ARCH_NODE_ATTRS = {
  icon: 'Icon name. Search with the list_icons tool.',
  color: `Border color: ${COLORS.join(', ')} or #rrggbb.`,
  shape: `${ARCH_SHAPES.join(', ')}. Default box; use cylinder for databases and storage.`,
  style: `Border style: ${LINE_STYLES.join(', ')}.`,
  link: 'http(s) URL opened when the node is clicked.',
} as const;

export const ARCH_GROUP_ATTRS = {
  icon: 'Icon shown before the group name.',
  color: `Border and tint: ${COLORS.join(', ')} or #rrggbb. Default: next palette color.`,
} as const;
