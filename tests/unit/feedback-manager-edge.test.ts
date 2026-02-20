/**
 * Edge case tests for FeedbackManager.
 *
 * Covers: local storage, corrupted files, retry logic,
 * webhook failures, concurrent submissions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackManager } from '../../src/core/FeedbackManager.js';
import { createTempProject } from '../helpers/setup.js';
import type { TempProject } from '../helpers/setup.js';
import fs from 'node:fs';
import path from 'node:path';

describe('FeedbackManager edge cases', () => {
  let project: TempProject;

  beforeEach(() => {
    project = createTempProject();
  });

  afterEach(() => {
    project.cleanup();
    vi.restoreAllMocks();
  });

  function feedbackFile() {
    return path.join(project.stateDir, 'feedback.json');
  }

  function createManager(opts?: { enabled?: boolean; webhookUrl?: string }) {
    return new FeedbackManager({
      feedbackFile: feedbackFile(),
      enabled: opts?.enabled ?? false,
      webhookUrl: opts?.webhookUrl,
    });
  }

  describe('local storage', () => {
    it('stores feedback locally even without webhook', async () => {
      const mgr = createManager();
      const item = await mgr.submit({
        type: 'bug',
        title: 'Test bug',
        description: 'Something broke',
        agentName: 'test',
        instarVersion: '0.1.0',
        nodeVersion: 'v20',
        os: 'test',
      });

      expect(item.id).toBeTruthy();
      expect(item.submittedAt).toBeTruthy();
      expect(item.forwarded).toBe(false);
    });

    it('persists across instances', async () => {
      const mgr1 = createManager();
      await mgr1.submit({
        type: 'feature',
        title: 'Persist test',
        description: 'Should persist',
        agentName: 'test',
        instarVersion: '0.1.0',
        nodeVersion: 'v20',
        os: 'test',
      });

      const mgr2 = createManager();
      const items = mgr2.list();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Persist test');
    });

    it('handles corrupted feedback file gracefully', async () => {
      fs.writeFileSync(feedbackFile(), 'not json!!!');
      const mgr = createManager();
      const items = mgr.list();
      expect(items).toEqual([]);
    });

    it('generates unique IDs', async () => {
      const mgr = createManager();
      const items = await Promise.all([
        mgr.submit({ type: 'bug', title: 'A', description: 'A', agentName: 't', instarVersion: '0', nodeVersion: 'v20', os: 't' }),
        mgr.submit({ type: 'bug', title: 'B', description: 'B', agentName: 't', instarVersion: '0', nodeVersion: 'v20', os: 't' }),
      ]);
      expect(items[0].id).not.toBe(items[1].id);
    });
  });

  describe('get by ID', () => {
    it('returns null for unknown ID', () => {
      const mgr = createManager();
      expect(mgr.get('nonexistent')).toBeNull();
    });

    it('returns feedback by ID', async () => {
      const mgr = createManager();
      const item = await mgr.submit({
        type: 'bug',
        title: 'Find me',
        description: 'Test',
        agentName: 'test',
        instarVersion: '0.1.0',
        nodeVersion: 'v20',
        os: 'test',
      });

      const found = mgr.get(item.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Find me');
    });
  });

  describe('retry unforwarded', () => {
    it('returns zero counts when webhook not configured', async () => {
      const mgr = createManager({ enabled: false });
      await mgr.submit({
        type: 'bug',
        title: 'Won\'t retry',
        description: 'No webhook',
        agentName: 'test',
        instarVersion: '0.1.0',
        nodeVersion: 'v20',
        os: 'test',
      });

      const result = await mgr.retryUnforwarded();
      expect(result.retried).toBe(0);
      expect(result.succeeded).toBe(0);
    });

    it('returns zero when no unforwarded items', async () => {
      const mgr = createManager({ enabled: true, webhookUrl: 'http://localhost:9999' });
      const result = await mgr.retryUnforwarded();
      expect(result.retried).toBe(0);
      expect(result.succeeded).toBe(0);
    });
  });
});
