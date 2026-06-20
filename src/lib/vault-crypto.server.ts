// Shared AES-256-GCM helpers — derive a 32-byte key from SUPABASE_SERVICE_ROLE_KEY.
// Used by per-project secrets vault and mobile signing-profile vault.
// Server-only by filename (`.server.ts` — blocked from client bundles).

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "crypto";

const SALT = "foundry-vault-v1";

export function deriveVaultKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Vault key unavailable on this environment");
  return scryptSync(secret, SALT, 32);
}

export const toBytea = (buf: Buffer) => "\\x" + buf.toString("hex");
export function fromBytea(s: string): Buffer {
  if (s.startsWith("\\x")) return Buffer.from(s.slice(2), "hex");
  return Buffer.from(s, "base64");
}

export function encryptBuffer(plaintext: Buffer) {
  const key = deriveVaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: toBytea(ciphertext), iv: toBytea(iv), tag: toBytea(tag) };
}

export function decryptBuffer(ciphertext: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const key = deriveVaultKey();
  const dec = createDecipheriv("aes-256-gcm", key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ciphertext), dec.final()]);
}
