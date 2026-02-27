import { describe, it, expect, beforeEach } from 'vitest';
import { StaleProcessGuard } from '../../src/core/StaleProcessGuard.js';

describe('StaleProcessGuard', () => {
  let guard: StaleProcessGuard;

  beforeEach(() => {
    guard = new StaleProcessGuard();
  });

  // ── Registration ──────────────────────────────────────────────

  describe('snapshot registration', () => {
    it('registers a snapshot', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.70');
      expect(guard.getRegisteredKeys()).toContain('version');
    });

    it('tracks multiple snapshots', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.70');
      guard.registerSnapshot('config-hash', 'abc', () => 'abc');
      expect(guard.getRegisteredKeys()).toHaveLength(2);
    });

    it('unregisters a snapshot', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.70');
      guard.unregisterSnapshot('version');
      expect(guard.getRegisteredKeys()).toHaveLength(0);
    });

    it('getFrozenValue returns the captured value', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.71');
      expect(guard.getFrozenValue('version')).toBe('0.9.70');
    });

    it('getFrozenValue returns undefined for unregistered key', () => {
      expect(guard.getFrozenValue('nonexistent')).toBeUndefined();
    });
  });

  // ── Drift Detection ───────────────────────────────────────────

  describe('drift detection', () => {
    it('no drift when values match', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.70');
      const drift = guard.check('version');
      expect(drift).toBeNull();
    });

    it('detects drift when current value differs', () => {
      let currentValue = '0.9.70';
      guard.registerSnapshot('version', '0.9.70', () => currentValue);

      expect(guard.check('version')).toBeNull();

      // Simulate disk update
      currentValue = '0.9.71';
      const drift = guard.check('version');

      expect(drift).not.toBeNull();
      expect(drift!.key).toBe('version');
      expect(drift!.frozenValue).toBe('0.9.70');
      expect(drift!.currentValue).toBe('0.9.71');
      expect(drift!.detectedAt).toBeTruthy();
    });

    it('preserves original detection time on subsequent checks', () => {
      let currentValue = '0.9.71';
      guard.registerSnapshot('version', '0.9.70', () => currentValue);

      const first = guard.check('version');
      const firstDetected = first!.detectedAt;

      const second = guard.check('version');
      expect(second!.detectedAt).toBe(firstDetected);
    });

    it('clears drift when value returns to match', () => {
      let currentValue = '0.9.71';
      guard.registerSnapshot('version', '0.9.70', () => currentValue);

      expect(guard.check('version')).not.toBeNull();
      expect(guard.hasDrift('version')).toBe(true);

      // Process restarted with correct version
      currentValue = '0.9.70';
      expect(guard.check('version')).toBeNull();
      expect(guard.hasDrift('version')).toBe(false);
    });

    it('returns null for unregistered key', () => {
      expect(guard.check('nonexistent')).toBeNull();
    });

    it('handles currentValueFn throwing', () => {
      guard.registerSnapshot('broken', '0.9.70', () => { throw new Error('read failed'); });
      // Should not report drift when we can't read current value
      expect(guard.check('broken')).toBeNull();
    });
  });

  // ── Check All ─────────────────────────────────────────────────

  describe('checkAll', () => {
    it('returns empty array when nothing is drifted', () => {
      guard.registerSnapshot('a', '1', () => '1');
      guard.registerSnapshot('b', '2', () => '2');

      const drifts = guard.checkAll();
      expect(drifts).toHaveLength(0);
    });

    it('returns all drifts', () => {
      guard.registerSnapshot('a', '1', () => '2'); // drifted
      guard.registerSnapshot('b', '2', () => '2'); // ok
      guard.registerSnapshot('c', '3', () => '4'); // drifted

      const drifts = guard.checkAll();
      expect(drifts).toHaveLength(2);
      expect(drifts.map(d => d.key).sort()).toEqual(['a', 'c']);
    });

    it('updates lastCheckAt', () => {
      const status = guard.getStatus();
      expect(status.lastCheckAt).toBeNull();

      guard.checkAll();
      expect(guard.getStatus().lastCheckAt).toBeTruthy();
    });
  });

  // ── Status Reporting ──────────────────────────────────────────

  describe('getStatus', () => {
    it('reports snapshot count', () => {
      guard.registerSnapshot('a', '1', () => '1');
      guard.registerSnapshot('b', '2', () => '2');

      expect(guard.getStatus().snapshotCount).toBe(2);
    });

    it('reports hasCriticalDrift when critical snapshot drifts', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.71', {
        severity: 'critical',
        description: 'Package version',
      });

      guard.checkAll();
      expect(guard.getStatus().hasCriticalDrift).toBe(true);
    });

    it('hasCriticalDrift is false for non-critical drifts', () => {
      guard.registerSnapshot('cache', 'old', () => 'new', {
        severity: 'info',
      });

      guard.checkAll();
      expect(guard.getStatus().hasCriticalDrift).toBe(false);
    });

    it('reports active drift details', () => {
      guard.registerSnapshot('version', '0.9.70', () => '0.9.71', {
        severity: 'critical',
        description: 'Package version',
      });

      guard.checkAll();
      const status = guard.getStatus();

      expect(status.drifts).toHaveLength(1);
      expect(status.drifts[0].key).toBe('version');
      expect(status.drifts[0].frozenValue).toBe('0.9.70');
      expect(status.drifts[0].currentValue).toBe('0.9.71');
      expect(status.drifts[0].severity).toBe('critical');
      expect(status.drifts[0].description).toBe('Package version');
    });
  });

  // ── Severity ──────────────────────────────────────────────────

  describe('severity levels', () => {
    it('defaults to warning severity', () => {
      guard.registerSnapshot('test', '1', () => '2');
      guard.checkAll();
      expect(guard.getStatus().drifts[0].severity).toBe('warning');
    });

    it('respects custom severity', () => {
      guard.registerSnapshot('test', '1', () => '2', { severity: 'info' });
      guard.checkAll();
      expect(guard.getStatus().drifts[0].severity).toBe('info');
    });
  });
});
