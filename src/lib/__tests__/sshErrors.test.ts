import { describe, it, expect } from 'vitest';
import {
  isHostKeyVerificationError,
  isAuthenticationError,
  getErrorMessage,
} from '../sshErrors';

describe('sshErrors', () => {
  describe('isHostKeyVerificationError', () => {
    it('returns true for "Host key verification required"', () => {
      expect(isHostKeyVerificationError('Host key verification required')).toBe(true);
    });

    it('returns true for "HOST KEY HAS CHANGED"', () => {
      expect(isHostKeyVerificationError('HOST KEY HAS CHANGED: The host key has been modified')).toBe(true);
    });

    it('returns true when error message contains verification phrase', () => {
      expect(isHostKeyVerificationError('Error: Host key verification required for server.example.com')).toBe(true);
    });

    it('returns false for other error messages', () => {
      expect(isHostKeyVerificationError('Connection refused')).toBe(false);
      expect(isHostKeyVerificationError('Authentication failed')).toBe(false);
      expect(isHostKeyVerificationError('Network timeout')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isHostKeyVerificationError('')).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    it('returns true for messages containing "auth"', () => {
      expect(isAuthenticationError('auth failed')).toBe(true);
      expect(isAuthenticationError('No auth methods')).toBe(true);
    });

    it('returns true for messages containing "Authentication"', () => {
      expect(isAuthenticationError('Authentication failed')).toBe(true);
      expect(isAuthenticationError('Authentication error')).toBe(true);
    });

    it('returns false for other error messages', () => {
      expect(isAuthenticationError('Connection refused')).toBe(false);
      expect(isAuthenticationError('Network timeout')).toBe(false);
      expect(isAuthenticationError('Host key verification required')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isAuthenticationError('')).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('extracts message from Error objects', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('converts strings directly', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('converts numbers to string', () => {
      expect(getErrorMessage(404)).toBe('404');
    });

    it('converts null to string', () => {
      expect(getErrorMessage(null)).toBe('null');
    });

    it('converts undefined to string', () => {
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('converts objects to string', () => {
      expect(getErrorMessage({ code: 'ERROR' })).toBe('[object Object]');
    });
  });
});
