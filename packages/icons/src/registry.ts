import * as hugeicons from '@hugeicons/core-free-icons';
import * as simpleIcons from 'simple-icons';
import { ALIASES, GENERIC_NAMES } from './aliases';
import { LUCIDE_COMPAT } from './lucide-compat';
import { levenshtein } from './levenshtein';

export type IconSet = 'hugeicons' | 'simple-icons';

export interface IconDef {
  name: string;
  set: IconSet;
  viewBox: string;
  body: string;
  /** `outline`: the body paints itself with `currentColor`; `fill`: the body is filled with the icon color. */
  paint: 'outline' | 'fill';
}

export type IconResolution = { icon: IconDef; suggestions: [] } | { icon: null; suggestions: string[] };

export const FALLBACK_ICON_NAME = 'box';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function kebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

const SAFE_ATTR_VALUE = /^[\w .,#%()+-]*$/;

/** Turns a Hugeicons node list (`[tag, { camelCaseAttr: value }]`) into SVG markup. */
function hugeiconBody(nodes: unknown): string | null {
  if (!Array.isArray(nodes)) return null;
  let body = '';
  for (const node of nodes) {
    if (!Array.isArray(node)) return null;
    const [tag, attrs] = node;
    if (typeof tag !== 'string' || !/^[a-z]+$/.test(tag) || typeof attrs !== 'object' || attrs === null) return null;
    let rendered = '';
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'key') continue;
      if (typeof value !== 'string' && typeof value !== 'number') return null;
      if (!SAFE_ATTR_VALUE.test(String(value))) return null;
      rendered += ` ${kebab(key)}="${value}"`;
    }
    body += `<${tag}${rendered}/>`;
  }
  return body || null;
}

interface Registry {
  icons: Map<string, IconDef>;
  /** Older names Hugeicons still exports (`AlertTriangle` for `TriangleAlertIcon`) → canonical icon names. */
  legacy: Map<string, string>;
}

function buildRegistry(): Registry {
  const generic = new Map<string, IconDef>();
  const canonical = new Map<unknown, string>();
  const entries = Object.entries(hugeicons);
  for (const [key, value] of entries) {
    if (!key.endsWith('Icon')) continue;
    const name = kebab(key.slice(0, -'Icon'.length));
    if (generic.has(name)) continue;
    const body = hugeiconBody(value);
    if (!body) continue;
    generic.set(name, { name, set: 'hugeicons', viewBox: '0 0 24 24', body, paint: 'outline' });
    if (!canonical.has(value)) canonical.set(value, name);
  }
  const legacy = new Map<string, string>();
  for (const [key, value] of entries) {
    if (key.endsWith('Icon') || key.endsWith('FreeIcons')) continue;
    const name = kebab(key);
    const target = canonical.get(value);
    if (target && target !== name && !generic.has(name)) legacy.set(name, target);
  }
  // Brand logos win over a generic icon of the same name (`github`, `react`), except for plain words.
  const icons = new Map<string, IconDef>();
  for (const [key, value] of Object.entries(simpleIcons)) {
    if (!key.startsWith('si') || typeof value !== 'object' || value === null) continue;
    if (!('slug' in value) || !('path' in value)) continue;
    const { slug, path } = value;
    if (typeof slug !== 'string' || typeof path !== 'string' || icons.has(slug) || GENERIC_NAMES.has(slug)) continue;
    icons.set(slug, {
      name: slug,
      set: 'simple-icons',
      viewBox: '0 0 24 24',
      body: `<path d="${path}"/>`,
      paint: 'fill',
    });
  }
  for (const [name, icon] of generic) if (!icons.has(name)) icons.set(name, icon);
  return { icons, legacy };
}

let cached: Registry | undefined;
const registry = (): Registry => (cached ??= buildRegistry());
const icons = (): Map<string, IconDef> => registry().icons;

export function normalizeIconName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/** Resolves an icon by name. Pass `{ suggest: false }` to skip the (expensive) did-you-mean search for unknown names. */
export function resolveIcon(raw: string, options: { suggest?: boolean } = {}): IconResolution {
  const name = normalizeIconName(raw);
  const target = ALIASES[name] ?? LUCIDE_COMPAT[name] ?? name;
  const icon = icons().get(target) ?? icons().get(registry().legacy.get(target) ?? '');
  if (icon) return { icon, suggestions: [] };
  return { icon: null, suggestions: options.suggest === false ? [] : suggest(name) };
}

let candidates: string[] | undefined;
const suggestionCandidates = (): string[] => (candidates ??= [...icons().keys(), ...Object.keys(ALIASES)]);

function suggest(name: string): string[] {
  const scored: Array<[string, number]> = [];
  for (const candidate of suggestionCandidates()) {
    if (Math.abs(candidate.length - name.length) > 2) continue;
    const distance = levenshtein(name, candidate);
    if (distance <= 2) scored.push([candidate, distance]);
  }
  scored.sort((a, b) => a[1] - b[1] || cmp(a[0], b[0]));
  return [...new Set(scored.map(([candidate]) => candidate))].slice(0, 3);
}

export function searchIcons(query: string, limit = 20): Array<{ name: string; set: IconSet }> {
  const q = normalizeIconName(query);
  const rank = (name: string): number => (name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1);
  const results: Array<{ name: string; set: IconSet; rank: number }> = [];
  for (const icon of icons().values()) {
    const r = rank(icon.name);
    if (r >= 0) results.push({ name: icon.name, set: icon.set, rank: r });
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    const r = rank(alias);
    const icon = icons().get(target);
    if (r >= 0 && icon) results.push({ name: alias, set: icon.set, rank: r });
  }
  results.sort((a, b) => a.rank - b.rank || cmp(a.name, b.name));
  return results.slice(0, limit).map(({ name, set }) => ({ name, set }));
}
