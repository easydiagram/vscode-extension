import type { Span } from './diagnostics';

export type HeaderKey = 'type' | 'direction' | 'style' | 'title';
export type EdgeOp = '<->' | '-->' | '->>' | '->' | '<-' | '--';

export interface Header {
  value: string;
  span: Span;
  valueSpan: Span;
}
export interface Attr {
  key: string;
  value: string;
  keySpan: Span;
  valueSpan: Span;
}
export interface Ref {
  name: string;
  span: Span;
}

export interface NodeStmt {
  kind: 'node';
  id: string;
  idSpan: Span;
  label?: string;
  attrs: Attr[];
  span: Span;
}
export interface GroupStmt {
  kind: 'group';
  name: string;
  nameSpan: Span;
  attrs: Attr[];
  children: Statement[];
  span: Span;
}
export interface EdgeStmt {
  kind: 'edge';
  from: Ref[];
  op: EdgeOp;
  to: Ref[];
  label?: string;
  span: Span;
}

export type Statement = NodeStmt | GroupStmt | EdgeStmt;

export interface Document {
  headers: Partial<Record<HeaderKey, Header>>;
  statements: Statement[];
}
