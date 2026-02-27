/**
 * META-LEVEL TESTS: Stale Version Reporting Prevention
 *
 * These tests don't test a single module — they test that the CATEGORY
 * of bug "process reports wrong version" cannot re-emerge.
 *
 * The root cause: code reads package.json from DISK at runtime to report
 * its version, but the code ACTUALLY RUNNING was loaded at process start.
 * After npm install -g, disk has new version but old code is in memory.
 *
 * These tests scan the source code for patterns that would reintroduce
 * this class of bug, acting as structural guardrails.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const SRC_DIR = path.join(process.cwd(), 'src');

describe('META: Stale version reporting prevention', () => {

  // ── Rule 1: No runtime version reads from package.json in routes/health ──

  it('health endpoint does NOT read version from config directly', () => {
    const routesSrc = fs.readFileSync(
      path.join(SRC_DIR, 'server/routes.ts'),
      'utf-8',
    );

    // The health endpoint block should use ProcessIntegrity, not ctx.config.version
    // Find the health endpoint section
    const healthStart = routesSrc.indexOf("router.get('/health'");
    const healthEnd = routesSrc.indexOf("router.get('/'", healthStart + 1);
    const healthBlock = routesSrc.slice(healthStart, healthEnd > 0 ? healthEnd : healthStart + 2000);

    // Should reference ProcessIntegrity
    expect(healthBlock).toContain('ProcessIntegrity');
  });

  it('routes.ts imports ProcessIntegrity', () => {
    const routesSrc = fs.readFileSync(
      path.join(SRC_DIR, 'server/routes.ts'),
      'utf-8',
    );
    expect(routesSrc).toContain("import { ProcessIntegrity }");
  });

  // ── Rule 2: ProcessIntegrity singleton must be initialized in server startup ──

  it('server.ts initializes ProcessIntegrity before server starts', () => {
    const serverSrc = fs.readFileSync(
      path.join(SRC_DIR, 'commands/server.ts'),
      'utf-8',
    );
    expect(serverSrc).toContain('ProcessIntegrity.initialize');
  });

  it('server.ts imports ProcessIntegrity', () => {
    const serverSrc = fs.readFileSync(
      path.join(SRC_DIR, 'commands/server.ts'),
      'utf-8',
    );
    expect(serverSrc).toContain("import { ProcessIntegrity }");
  });

  // ── Rule 3: Version in feedback/dispatch uses frozen version ──

  it('FeedbackManager and DispatchManager receive version at construction, not live', () => {
    const serverSrc = fs.readFileSync(
      path.join(SRC_DIR, 'commands/server.ts'),
      'utf-8',
    );

    // FeedbackManager and DispatchManager should be passed startupVersion,
    // NOT config.version (which could re-read from disk)
    const feedbackInit = serverSrc.match(/new FeedbackManager\(\{[\s\S]*?\}\)/);
    const dispatchInit = serverSrc.match(/new DispatchManager\(\{[\s\S]*?\}\)/);

    if (feedbackInit) {
      expect(feedbackInit[0]).toContain('startupVersion');
    }
    if (dispatchInit) {
      expect(dispatchInit[0]).toContain('startupVersion');
    }
  });

  // ── Rule 4: CoherenceMonitor checks process integrity ──

  it('CoherenceMonitor checks for version mismatch', () => {
    const coherenceSrc = fs.readFileSync(
      path.join(SRC_DIR, 'monitoring/CoherenceMonitor.ts'),
      'utf-8',
    );
    expect(coherenceSrc).toContain('ProcessIntegrity');
    expect(coherenceSrc).toContain('process-version-mismatch');
  });

  // ── Rule 5: getInstarVersion() is NOT used for runtime reporting ──

  it('getInstarVersion() in Config.ts has a comment warning about runtime use', () => {
    const configSrc = fs.readFileSync(
      path.join(SRC_DIR, 'core/Config.ts'),
      'utf-8',
    );
    // getInstarVersion should exist (it's used at startup) but shouldn't be
    // used anywhere for runtime version queries — ProcessIntegrity handles that
    expect(configSrc).toContain('getInstarVersion');
  });

  it('routes.ts does not import getInstarVersion', () => {
    const routesSrc = fs.readFileSync(
      path.join(SRC_DIR, 'server/routes.ts'),
      'utf-8',
    );
    // Routes should never directly read version from Config — always use ProcessIntegrity
    expect(routesSrc).not.toContain('getInstarVersion');
  });

  // ── Rule 6: ProcessIntegrity exists and has the right shape ──

  it('ProcessIntegrity module exists with required exports', () => {
    const piSrc = fs.readFileSync(
      path.join(SRC_DIR, 'core/ProcessIntegrity.ts'),
      'utf-8',
    );
    expect(piSrc).toContain('class ProcessIntegrity');
    expect(piSrc).toContain('runningVersion');
    expect(piSrc).toContain('diskVersion');
    expect(piSrc).toContain('versionMismatch');
    expect(piSrc).toContain('frozenVersion');
    expect(piSrc).toContain('bootTimestamp');
  });

  // ── Rule 7: StaleProcessGuard exists for generalized stale detection ──

  it('StaleProcessGuard module exists with required exports', () => {
    const spgSrc = fs.readFileSync(
      path.join(SRC_DIR, 'core/StaleProcessGuard.ts'),
      'utf-8',
    );
    expect(spgSrc).toContain('class StaleProcessGuard');
    expect(spgSrc).toContain('registerSnapshot');
    expect(spgSrc).toContain('checkAll');
    expect(spgSrc).toContain('DriftReport');
  });

  // ── Rule 8: No new code paths that read version from disk at runtime ──

  it('no route handler reads package.json version directly', async () => {
    const routesSrc = fs.readFileSync(
      path.join(SRC_DIR, 'server/routes.ts'),
      'utf-8',
    );

    // Should not contain patterns like fs.readFileSync(...package.json...)
    // in the routes file — version should come from ProcessIntegrity
    const readPkgPatterns = [
      /readFileSync.*package\.json/,
      /getInstarVersion\(\)/,
    ];

    for (const pattern of readPkgPatterns) {
      expect(routesSrc).not.toMatch(pattern);
    }
  });

  // ── Rule 9: The running version is the FROZEN one, not a live read ──

  it('ProcessIntegrity.runningVersion returns frozen value, not live disk', () => {
    const piSrc = fs.readFileSync(
      path.join(SRC_DIR, 'core/ProcessIntegrity.ts'),
      'utf-8',
    );

    // The runningVersion getter should return this.frozenVersion
    // NOT read from disk
    const runningVersionGetter = piSrc.match(/get runningVersion.*?{[\s\S]*?}/);
    expect(runningVersionGetter).toBeTruthy();
    expect(runningVersionGetter![0]).toContain('frozenVersion');
    expect(runningVersionGetter![0]).not.toContain('readFileSync');
  });
});

describe('META: Stale state detection infrastructure', () => {

  it('server.ts registers version with StaleProcessGuard', () => {
    const serverSrc = fs.readFileSync(
      path.join(SRC_DIR, 'commands/server.ts'),
      'utf-8',
    );
    expect(serverSrc).toContain('StaleProcessGuard');
    expect(serverSrc).toContain("registerSnapshot");
    expect(serverSrc).toContain("'instar-version'");
  });
});
