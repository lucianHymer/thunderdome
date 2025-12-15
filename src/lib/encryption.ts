/**
 * Token Encryption Utilities
 *
 * Provides AES-256-GCM encryption for storing sensitive tokens (Claude API keys).
 * Uses the ENCRYPTION_KEY environment variable.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // AES block size
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment variable
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  // Convert hex string to buffer
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:salt:tag:encryptedData (all hex encoded)
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const salt = randomBytes(SALT_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Return format: iv:salt:tag:encryptedData
  return `${iv.toString("hex")}:${salt.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted string (format: iv:salt:tag:encryptedData)
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();

  // Parse the encrypted text
  const parts = encryptedText.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted text format");
  }

  const [ivHex, saltHex, tagHex, encryptedData] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
