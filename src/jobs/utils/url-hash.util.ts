import { createHash } from 'crypto';

/**
 * Generate a stable, path-safe identifier for a URL.
 * Uses SHA-256 and base64url encoding.
 */
export const generateUrlHash = (url: string): string => {
  return createHash('sha256').update(url).digest('base64url').slice(0, 16);
};
