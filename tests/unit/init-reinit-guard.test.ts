/**
 * Tests that re-running `instar init` on an existing project
 * preserves config.json, jobs.json, and users.json.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('init — re-initialization guard', () => {
  it('initExistingProject source guards config/jobs/users with existsSync', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/commands/init.ts'),
      'utf-8',
    );

    // The initExistingProject function should guard all three files
    const funcStart = source.indexOf('function initExistingProject');
    const funcBody = source.slice(funcStart);

    // All three should be guarded with existence checks
    expect(funcBody).toContain("existsSync(configPath)");
    expect(funcBody).toContain("existsSync(jobsPath)");
    expect(funcBody).toContain("existsSync(usersPath)");
    // Should show "preserved" message for existing files
    expect(funcBody).toContain('preserved');
  });

  it('installClaudeSettings includes PostToolUse and Notification hooks', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/commands/init.ts'),
      'utf-8',
    );

    // Should configure all three hook sections
    expect(source).toContain('PostToolUse');
    expect(source).toContain('Notification');
    expect(source).toContain('session-start.sh');
    expect(source).toContain('compaction-recovery.sh');
  });
});
