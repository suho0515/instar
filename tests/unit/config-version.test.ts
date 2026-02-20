import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Config version detection', () => {
  it('health endpoint uses config version not hardcoded', async () => {
    // Read the routes source to verify no hardcoded version
    const routesSource = fs.readFileSync(
      path.join(process.cwd(), 'src/server/routes.ts'),
      'utf-8'
    );
    // Should NOT contain hardcoded '0.1.0'
    expect(routesSource).not.toContain("version: '0.1.0'");
    // Should reference config version
    expect(routesSource).toContain('ctx.config.version');
  });

  it('CLI version is dynamic, not hardcoded', () => {
    const cliSource = fs.readFileSync(
      path.join(process.cwd(), 'src/cli.ts'),
      'utf-8'
    );
    // Should NOT have a hardcoded version string
    const hardcoded = cliSource.match(/\.version\('[0-9]+\.[0-9]+\.[0-9]+'\)/);
    expect(hardcoded).toBeNull();
    // Should use getInstarVersion()
    expect(cliSource).toContain('.version(getInstarVersion())');
    expect(cliSource).toContain("import { getInstarVersion }");
  });
});
