/** Hard caps that keep parsing, layout and rendering bounded for hostile or runaway input. */
export const LIMITS = {
  maxGroupDepth: 16,
  maxNodes: 300,
  maxEdges: 600,
  maxDiagnostics: 100,
} as const;
