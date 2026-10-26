import { describe, expect, it } from 'vitest';
import { describeVersion } from './index.js';

describe('describeVersion', () => {
  it('marks builds without a commit as dev', () => {
    expect(describeVersion({ ok: true, name: 'luma', version: '0.1.0', gitSha: '' })).toBe(
      'luma 0.1.0 (dev)',
    );
  });

  it('shortens the commit sha', () => {
    const report = { ok: true, name: 'luma', version: '0.1.0', gitSha: 'abcdef1234567890' };
    expect(describeVersion(report)).toBe('luma 0.1.0 (abcdef1)');
  });
});
