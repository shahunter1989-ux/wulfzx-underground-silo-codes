import test from 'node:test';
import assert from 'node:assert/strict';
import { canCopyResolution, elapsedSession, formatElapsed } from '../terminal-state.js';

test('copy permission expires precisely at reset even before a network refresh', () => {
  const resolution = { canCopy: true, config: {validFrom:'2026-10-08T00:00:00Z',validTo:'2026-10-15T00:00:00Z'} };
  const reset = Date.parse(resolution.config.validTo);
  assert.equal(canCopyResolution(resolution, reset - 1), true);
  assert.equal(canCopyResolution(resolution, reset), false);
  assert.equal(canCopyResolution({...resolution, canCopy:false}, reset - 1), false);
  assert.equal(canCopyResolution(resolution, Date.parse(resolution.config.validFrom) - 1), false);
});

test('session duration includes resumed time but freezes when paused', () => {
  assert.equal(elapsedSession({elapsed:5000,startedAt:10000}, 13000),8000);
  assert.equal(elapsedSession({elapsed:8000,startedAt:null}, 20000),8000);
  assert.equal(formatElapsed(3661000),'01:01:01');
});
