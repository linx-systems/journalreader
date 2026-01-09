import { describe, it, expect } from 'vitest';
import { isConnectionError } from '../connectionErrors';

describe('connectionErrors', () => {
  describe('isConnectionError', () => {
    it('returns false for non-Error values', () => {
      expect(isConnectionError(null)).toBe(false);
      expect(isConnectionError(undefined)).toBe(false);
      expect(isConnectionError('string error')).toBe(false);
      expect(isConnectionError(42)).toBe(false);
      expect(isConnectionError({ message: 'connection failed' })).toBe(false);
    });

    it('returns true for connection-related errors', () => {
      expect(isConnectionError(new Error('Connection refused'))).toBe(true);
      expect(isConnectionError(new Error('connection timeout'))).toBe(true);
      expect(isConnectionError(new Error('Lost connection to server'))).toBe(true);
    });

    it('returns true for network-related errors', () => {
      expect(isConnectionError(new Error('Network error'))).toBe(true);
      expect(isConnectionError(new Error('network unreachable'))).toBe(true);
      expect(isConnectionError(new Error('NetworkError when attempting to fetch'))).toBe(true);
    });

    it('returns true for timeout errors', () => {
      expect(isConnectionError(new Error('Request timeout'))).toBe(true);
      expect(isConnectionError(new Error('timeout exceeded'))).toBe(true);
      expect(isConnectionError(new Error('Operation timed out (TIMEOUT)'))).toBe(true);
    });

    it('returns true for ECONNREFUSED errors', () => {
      expect(isConnectionError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isConnectionError(new Error('connect ECONNREFUSED 127.0.0.1:22'))).toBe(true);
    });

    it('returns true for ENOTFOUND errors', () => {
      expect(isConnectionError(new Error('ENOTFOUND'))).toBe(true);
      expect(isConnectionError(new Error('getaddrinfo ENOTFOUND example.com'))).toBe(true);
    });

    it('returns true for unreachable errors', () => {
      expect(isConnectionError(new Error('Host unreachable'))).toBe(true);
      expect(isConnectionError(new Error('Network is unreachable'))).toBe(true);
    });

    it('returns true for offline errors', () => {
      expect(isConnectionError(new Error('offline'))).toBe(true);
      expect(isConnectionError(new Error('The device is offline'))).toBe(true);
    });

    it('returns true for SSH errors', () => {
      expect(isConnectionError(new Error('SSH connection failed'))).toBe(true);
      expect(isConnectionError(new Error('ssh: handshake failed'))).toBe(true);
    });

    it('returns true for "failed to connect" errors', () => {
      expect(isConnectionError(new Error('Failed to connect to remote host'))).toBe(true);
      expect(isConnectionError(new Error('failed to connect'))).toBe(true);
    });

    it('returns false for non-connection errors', () => {
      expect(isConnectionError(new Error('Permission denied'))).toBe(false);
      expect(isConnectionError(new Error('File not found'))).toBe(false);
      expect(isConnectionError(new Error('Invalid argument'))).toBe(false);
      expect(isConnectionError(new Error('Authentication failed'))).toBe(false);
      expect(isConnectionError(new Error('Unknown error occurred'))).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isConnectionError(new Error('CONNECTION REFUSED'))).toBe(true);
      expect(isConnectionError(new Error('NETWORK ERROR'))).toBe(true);
      expect(isConnectionError(new Error('Timeout'))).toBe(true);
    });
  });
});
