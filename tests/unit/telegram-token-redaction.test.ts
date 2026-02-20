/**
 * Tests that the Telegram bot token is never exposed in error messages.
 *
 * Security: Bot tokens in logs/errors could be harvested by log aggregators.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('TelegramAdapter — token redaction', () => {
  it('apiCall uses a sanitized URL in error messages', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/messaging/TelegramAdapter.ts'),
      'utf-8',
    );

    // Must define safeUrl with [REDACTED]
    expect(source).toContain('bot[REDACTED]');

    // Error throw must use safeUrl, not url
    const errorLine = source.match(/throw new Error\(`Telegram API error .+?\)/);
    expect(errorLine).toBeTruthy();
    expect(errorLine![0]).toContain('safeUrl');
    expect(errorLine![0]).not.toMatch(/\$\{url\}/);
  });

  it('send() only retries on 400 errors (parse failures)', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/messaging/TelegramAdapter.ts'),
      'utf-8',
    );

    // Should check for 400 status before retrying
    expect(source).toContain("(400)");
    expect(source).toContain('parse_mode');
  });

  it('onTopicMessage has try/catch like the general handler', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/messaging/TelegramAdapter.ts'),
      'utf-8',
    );

    // The onTopicMessage call should be wrapped in try/catch
    expect(source).toContain('Topic message handler error');
  });
});
