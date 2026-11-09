import { describe, expect, it } from 'vitest';
import { responseStopReason, unhealthy } from './public-reader-journey.mjs';

describe('public reader journey safety guards', () => {
  it('stops when either independent public health probe fails or stays slow', () => {
    expect(unhealthy([{ status: 200, ms: 300 }, { status: 200, ms: 80 }], 500)).toBe(false);
    expect(unhealthy([{ status: 503, ms: 20 }, { status: 200, ms: 80 }], 500)).toBe(true);
    expect(unhealthy([{ status: 200, ms: 2600 }, { status: 200, ms: 80 }], 500)).toBe(true);
  });

  it('distinguishes edge protection from network and application failures', () => {
    expect(responseStopReason({ status: 200, challenge: false })).toBeNull();
    expect(responseStopReason({ status: 403, challenge: true })).toBe('edge-protection');
    expect(responseStopReason({ status: 429, challenge: false })).toBe('edge-protection');
    expect(responseStopReason({ status: 0, challenge: false })).toBe('request-failure');
    expect(responseStopReason({ status: 500, challenge: false })).toBe('request-failure');
  });
});
