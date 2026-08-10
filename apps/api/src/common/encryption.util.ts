import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM at the application layer for children's medical/allergy notes,
// so a database dump/backup never exposes them in the clear. Key is 32 bytes
// (64 hex chars) from CHILD_DATA_ENCRYPTION_KEY. Format: iv:tag:ciphertext
// (all hex).
function getKey(): Buffer {
  const hex = process.env.CHILD_DATA_ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) {
    throw new Error("CHILD_DATA_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptField(stored: string): string {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return ""; // corrupt/legacy ciphertext must never crash a read
  }
}
