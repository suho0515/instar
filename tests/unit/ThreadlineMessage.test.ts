/**
 * Unit tests for ThreadlineMessage protocol contract (Phase 1).
 *
 * Verifies the type interface is correctly defined and usable.
 */

import { describe, it, expect } from 'vitest';
import type { ThreadlineMessage } from '../../src/threadline/types.js';

describe('ThreadlineMessage — Protocol Contract', () => {
  it('constructs a valid content message', () => {
    const msg: ThreadlineMessage = {
      type: 'content',
      messageId: 'test-123',
      threadId: 'thread-abc',
      from: 'fp1234567890abcdef',
      timestamp: new Date().toISOString(),
      text: 'Hello from another agent',
    };
    expect(msg.type).toBe('content');
    expect(msg.messageId).toBe('test-123');
  });

  it('constructs a valid status (ack) message', () => {
    const ack: ThreadlineMessage = {
      type: 'status',
      messageId: 'ack-456',
      threadId: 'thread-abc',
      from: 'fp0987654321fedcba',
      timestamp: new Date().toISOString(),
      text: 'Message received. Composing response...',
      status: 'processing',
      inReplyTo: 'test-123',
    };
    expect(ack.type).toBe('status');
    expect(ack.status).toBe('processing');
    expect(ack.inReplyTo).toBe('test-123');
  });

  it('constructs a valid busy status message with retryAfter', () => {
    const busy: ThreadlineMessage = {
      type: 'status',
      messageId: 'busy-789',
      threadId: 'thread-abc',
      from: 'fp0987654321fedcba',
      timestamp: new Date().toISOString(),
      text: 'Agent is busy',
      status: 'busy',
      retryAfter: 30,
    };
    expect(busy.status).toBe('busy');
    expect(busy.retryAfter).toBe(30);
  });

  it('constructs a valid error message', () => {
    const err: ThreadlineMessage = {
      type: 'error',
      messageId: 'err-101',
      threadId: 'thread-abc',
      from: 'fp0987654321fedcba',
      timestamp: new Date().toISOString(),
      text: 'Agent at capacity',
      retryAfter: 60,
    };
    expect(err.type).toBe('error');
    expect(err.retryAfter).toBe(60);
  });

  it('constructs a session-rotated notification', () => {
    const rotated: ThreadlineMessage = {
      type: 'status',
      messageId: 'rot-202',
      threadId: 'thread-abc',
      from: 'fp0987654321fedcba',
      timestamp: new Date().toISOString(),
      text: 'Session rotated — context reset',
      status: 'session-rotated',
    };
    expect(rotated.status).toBe('session-rotated');
  });

  it('type discriminator distinguishes message types', () => {
    const content: ThreadlineMessage = {
      type: 'content', messageId: '1', threadId: 't', from: 'fp', timestamp: '', text: 'hi',
    };
    const status: ThreadlineMessage = {
      type: 'status', messageId: '2', threadId: 't', from: 'fp', timestamp: '', text: 'ack', status: 'processing',
    };
    const error: ThreadlineMessage = {
      type: 'error', messageId: '3', threadId: 't', from: 'fp', timestamp: '', text: 'fail',
    };

    // Type guard pattern that consumers will use
    expect(content.type === 'content').toBe(true);
    expect(status.type === 'status').toBe(true);
    expect(error.type === 'error').toBe(true);

    // Status-specific fields only present on status messages
    expect(content.status).toBeUndefined();
    expect(status.status).toBe('processing');
  });
});
