import { describe, expect, it } from 'vitest';
import { supportsCapabilities } from './capabilities.js';

describe('supportsCapabilities', () => {
  it('accepts requirements declared by the selected runtime', () => {
    expect(supportsCapabilities(['streaming'], ['streaming', 'interrupt'])).toBe(true);
  });

  it('rejects requirements absent from the selected runtime', () => {
    expect(supportsCapabilities(['permission_interaction'], ['streaming'])).toBe(false);
  });

  it('fails closed when runtime capabilities are unavailable or malformed', () => {
    expect(supportsCapabilities([], undefined)).toBe(false);
    expect(supportsCapabilities([1], ['streaming'])).toBe(false);
  });
});
