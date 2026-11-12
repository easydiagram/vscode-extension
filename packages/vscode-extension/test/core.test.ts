import { describe, expect, it } from 'vitest';
import { diagnosticsFor, formatted } from '../src/core';

describe('diagnosticsFor', () => {
  it('maps DSL diagnostics to 0-based ranges with severity, code and hint', () => {
    const [d] = diagnosticsFor('type: architecture\napi API server');
    expect(d).toMatchObject({
      severity: 'error',
      code: 'E_SYNTAX',
      range: { startLine: 1, startCol: 4, endLine: 1, endCol: 5 },
    });
    expect(d!.message).toContain('Unexpected');
  });

  it('reports unknown icons as warnings and nothing for clean sources', () => {
    expect(diagnosticsFor('type: architecture\napi [icon: definitely-not-an-icon]').map((d) => d.severity)).toEqual([
      'warning',
    ]);
    expect(diagnosticsFor('type: architecture\napi "API" [icon: server]')).toEqual([]);
  });
});

describe('formatted', () => {
  it('returns the formatted text, or null when nothing changes or the source has errors', () => {
    expect(formatted('type:architecture\napi->db')).toBe('type: architecture\napi -> db\n');
    expect(formatted('type: architecture\napi -> db\n')).toBeNull();
    expect(formatted('a -> ')).toBeNull();
  });
});
