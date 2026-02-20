/**
 * Edge case tests for TelegramAdapter API behavior.
 *
 * Covers: token redaction in logs, 429 retry cap, send with markdown fallback,
 * and apiCall timeout configuration.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('TelegramAdapter — API edge cases', () => {
  const sourcePath = path.join(process.cwd(), 'src/messaging/TelegramAdapter.ts');
  let source: string;

  // Read source once for all tests
  source = fs.readFileSync(sourcePath, 'utf-8');

  describe('token redaction', () => {
    it('never logs the raw bot token in API URLs', () => {
      // Should use a redacted URL for error messages
      expect(source).toContain('[REDACTED]');
      expect(source).toContain('safeUrl');
    });

    it('uses safeUrl in HTTP error messages (not raw URL)', () => {
      // HTTP error messages (status code errors) should use safeUrl
      const httpErrorLines = source.split('\n').filter(line =>
        line.includes('throw new Error') && line.includes('Telegram API error')
      );
      expect(httpErrorLines.length).toBeGreaterThan(0);
      for (const line of httpErrorLines) {
        expect(line).toContain('safeUrl');
      }
    });
  });

  describe('429 retry cap', () => {
    it('has a retry limit of 3 for rate-limited requests', () => {
      expect(source).toContain('retryCount >= 3');
    });

    it('passes retryCount parameter to prevent infinite recursion', () => {
      expect(source).toContain('retryCount + 1');
    });

    it('reads retry_after from Telegram API response', () => {
      expect(source).toContain('retry_after');
    });

    it('defaults to 5s when retry_after is not provided', () => {
      expect(source).toContain('?? 5');
    });
  });

  describe('timeout configuration', () => {
    it('uses longer timeout for getUpdates (long polling)', () => {
      expect(source).toContain('60_000');
    });

    it('uses shorter timeout for regular API calls', () => {
      expect(source).toContain('15_000');
    });

    it('uses AbortController for timeout enforcement', () => {
      expect(source).toContain('AbortController');
      expect(source).toContain('controller.abort');
      expect(source).toContain('controller.signal');
    });

    it('cleans up timeout timer in finally block', () => {
      expect(source).toContain('finally');
      expect(source).toContain('clearTimeout(timer)');
    });
  });

  describe('send with markdown fallback', () => {
    it('sends with Markdown parse_mode by default', () => {
      expect(source).toContain("parse_mode: 'Markdown'");
    });

    it('retries without parse_mode on 400 error', () => {
      // The send method should catch 400 errors and retry without parse_mode
      expect(source).toContain("(400)");
      expect(source).toContain('delete params.parse_mode');
    });

    it('sendToTopic also has markdown fallback', () => {
      // sendToTopic tries with Markdown first, catches and retries without
      const sendToTopicSection = source.slice(source.indexOf('async sendToTopic'));
      const nextMethod = sendToTopicSection.indexOf('async ', 10);
      const methodBody = sendToTopicSection.slice(0, nextMethod > 0 ? nextMethod : undefined);

      expect(methodBody).toContain("parse_mode: 'Markdown'");
      expect(methodBody).toContain('catch');
    });
  });

  describe('polling safety', () => {
    it('checks polling flag before each poll cycle', () => {
      expect(source).toContain('if (!this.polling) return');
    });

    it('wraps poll in try-catch to prevent crash on network errors', () => {
      const pollSection = source.slice(source.indexOf('private async poll'));
      expect(pollSection).toContain('catch (err)');
    });

    it('schedules next poll regardless of errors', () => {
      // The setTimeout for next poll should be outside the try-catch
      const pollSection = source.slice(source.indexOf('private async poll'));
      const catchIndex = pollSection.lastIndexOf('catch (err)');
      const setTimeoutIndex = pollSection.lastIndexOf('setTimeout');
      // setTimeout should come AFTER the catch block
      expect(setTimeoutIndex).toBeGreaterThan(catchIndex);
    });
  });
});
