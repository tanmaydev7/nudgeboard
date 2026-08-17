import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextLanBindHost } from './protocol.ts';

describe('nextLanBindHost', () => {
  it('rebinds to the home Wi-Fi address when the office address is gone', () => {
    assert.equal(
      nextLanBindHost(['192.168.1.10'], '10.20.0.5'),
      '192.168.1.10',
    );
  });

  it('keeps the current bind address while it is still on the machine', () => {
    assert.equal(
      nextLanBindHost(['192.168.1.10', '10.0.0.2'], '192.168.1.10'),
      '192.168.1.10',
    );
  });

  it('prefers home Wi-Fi over a leftover office VPN address', () => {
    assert.equal(
      nextLanBindHost(['192.168.1.10', '10.20.0.5'], '10.20.0.5'),
      '192.168.1.10',
    );
  });
});
