import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  generateIdentityKeyPair,
  generateEphemeralKeyPair,
  sign,
  verify,
  ecdh,
  deriveRelayToken,
  computeChallengeResponse,
} from '../../../src/threadline/ThreadlineCrypto.js';

describe('ThreadlineCrypto', () => {
  describe('generateIdentityKeyPair', () => {
    it('generates a valid Ed25519 key pair', () => {
      const kp = generateIdentityKeyPair();
      expect(kp.publicKey).toBeInstanceOf(Buffer);
      expect(kp.privateKey).toBeInstanceOf(Buffer);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.privateKey.length).toBe(32);
    });

    it('generates unique key pairs each call', () => {
      const kp1 = generateIdentityKeyPair();
      const kp2 = generateIdentityKeyPair();
      expect(kp1.publicKey.equals(kp2.publicKey)).toBe(false);
    });
  });

  describe('generateEphemeralKeyPair', () => {
    it('generates a valid X25519 key pair', () => {
      const kp = generateEphemeralKeyPair();
      expect(kp.publicKey).toBeInstanceOf(Buffer);
      expect(kp.privateKey).toBeInstanceOf(Buffer);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.privateKey.length).toBe(32);
    });

    it('generates unique key pairs each call', () => {
      const kp1 = generateEphemeralKeyPair();
      const kp2 = generateEphemeralKeyPair();
      expect(kp1.publicKey.equals(kp2.publicKey)).toBe(false);
    });
  });

  describe('sign and verify', () => {
    it('signs and verifies a message successfully', () => {
      const kp = generateIdentityKeyPair();
      const message = Buffer.from('hello threadline');
      const signature = sign(kp.privateKey, message);

      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBe(64); // Ed25519 signatures are 64 bytes

      const isValid = verify(kp.publicKey, message, signature);
      expect(isValid).toBe(true);
    });

    it('rejects tampered messages', () => {
      const kp = generateIdentityKeyPair();
      const message = Buffer.from('original message');
      const signature = sign(kp.privateKey, message);

      const tampered = Buffer.from('tampered message');
      expect(verify(kp.publicKey, tampered, signature)).toBe(false);
    });

    it('rejects wrong public key', () => {
      const kp1 = generateIdentityKeyPair();
      const kp2 = generateIdentityKeyPair();
      const message = Buffer.from('test');
      const signature = sign(kp1.privateKey, message);

      expect(verify(kp2.publicKey, message, signature)).toBe(false);
    });

    it('handles empty messages', () => {
      const kp = generateIdentityKeyPair();
      const message = Buffer.alloc(0);
      const signature = sign(kp.privateKey, message);
      expect(verify(kp.publicKey, message, signature)).toBe(true);
    });

    it('handles large messages', () => {
      const kp = generateIdentityKeyPair();
      const message = crypto.randomBytes(10_000);
      const signature = sign(kp.privateKey, message);
      expect(verify(kp.publicKey, message, signature)).toBe(true);
    });
  });

  describe('ecdh', () => {
    it('produces the same shared secret for both parties', () => {
      const alice = generateEphemeralKeyPair();
      const bob = generateEphemeralKeyPair();

      const sharedA = ecdh(alice.privateKey, bob.publicKey);
      const sharedB = ecdh(bob.privateKey, alice.publicKey);

      expect(sharedA).toBeInstanceOf(Buffer);
      expect(sharedA.length).toBe(32);
      expect(sharedA.equals(sharedB)).toBe(true);
    });

    it('produces different secrets for different key pairs', () => {
      const alice = generateEphemeralKeyPair();
      const bob = generateEphemeralKeyPair();
      const carol = generateEphemeralKeyPair();

      const sharedAB = ecdh(alice.privateKey, bob.publicKey);
      const sharedAC = ecdh(alice.privateKey, carol.publicKey);

      expect(sharedAB.equals(sharedAC)).toBe(false);
    });
  });

  describe('deriveRelayToken', () => {
    it('derives a 32-byte token', () => {
      const secret = crypto.randomBytes(32);
      const salt = crypto.randomBytes(32);
      const token = deriveRelayToken(secret, salt, 'test-info');

      expect(token).toBeInstanceOf(Buffer);
      expect(token.length).toBe(32);
    });

    it('is deterministic with same inputs', () => {
      const secret = crypto.randomBytes(32);
      const salt = crypto.randomBytes(32);
      const t1 = deriveRelayToken(secret, salt, 'test-info');
      const t2 = deriveRelayToken(secret, salt, 'test-info');
      expect(t1.equals(t2)).toBe(true);
    });

    it('produces different tokens with different info strings', () => {
      const secret = crypto.randomBytes(32);
      const salt = crypto.randomBytes(32);
      const t1 = deriveRelayToken(secret, salt, 'info-a');
      const t2 = deriveRelayToken(secret, salt, 'info-b');
      expect(t1.equals(t2)).toBe(false);
    });

    it('produces different tokens with different salts', () => {
      const secret = crypto.randomBytes(32);
      const t1 = deriveRelayToken(secret, crypto.randomBytes(32), 'info');
      const t2 = deriveRelayToken(secret, crypto.randomBytes(32), 'info');
      expect(t1.equals(t2)).toBe(false);
    });
  });

  describe('computeChallengeResponse', () => {
    it('produces a verifiable Ed25519 signature', () => {
      const signer = generateIdentityKeyPair();
      const other = generateIdentityKeyPair();
      const ephA = generateEphemeralKeyPair();
      const ephB = generateEphemeralKeyPair();
      const nonce = crypto.randomBytes(16).toString('hex');

      const response = computeChallengeResponse(
        signer.privateKey,
        nonce,
        signer.publicKey,
        other.publicKey,
        ephA.publicKey,
        ephB.publicKey,
      );

      expect(response).toBeInstanceOf(Buffer);
      expect(response.length).toBe(64);

      // Manually verify: reconstruct the hash and verify the signature
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from(nonce, 'utf-8'));
      hash.update(signer.publicKey);
      hash.update(other.publicKey);
      hash.update(ephA.publicKey);
      hash.update(ephB.publicKey);
      const digest = hash.digest();

      expect(verify(signer.publicKey, digest, response)).toBe(true);
    });

    it('fails verification with wrong nonce', () => {
      const signer = generateIdentityKeyPair();
      const other = generateIdentityKeyPair();
      const ephA = generateEphemeralKeyPair();
      const ephB = generateEphemeralKeyPair();

      const response = computeChallengeResponse(
        signer.privateKey,
        'nonce-a',
        signer.publicKey,
        other.publicKey,
        ephA.publicKey,
        ephB.publicKey,
      );

      // Verify with wrong nonce
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from('nonce-b', 'utf-8'));
      hash.update(signer.publicKey);
      hash.update(other.publicKey);
      hash.update(ephA.publicKey);
      hash.update(ephB.publicKey);
      const digest = hash.digest();

      expect(verify(signer.publicKey, digest, response)).toBe(false);
    });

    it('binds to both identity and ephemeral keys', () => {
      const signer = generateIdentityKeyPair();
      const other = generateIdentityKeyPair();
      const ephA = generateEphemeralKeyPair();
      const ephB = generateEphemeralKeyPair();
      const nonce = 'test-nonce';

      const r1 = computeChallengeResponse(
        signer.privateKey, nonce,
        signer.publicKey, other.publicKey,
        ephA.publicKey, ephB.publicKey,
      );

      // Different ephemeral key should produce different challenge
      const ephC = generateEphemeralKeyPair();
      const r2 = computeChallengeResponse(
        signer.privateKey, nonce,
        signer.publicKey, other.publicKey,
        ephC.publicKey, ephB.publicKey,
      );

      // Both are valid signatures by the same key, but over different digests
      expect(r1.equals(r2)).toBe(false);
    });
  });
});
