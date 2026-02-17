import { prisma } from "@/lib/db/prisma";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const EMAIL_SETTINGS_KEY = "email_config";

export interface EmailSettings {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  folder: string;
  pollIntervalMinutes: number;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: false,
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  folder: "INBOX",
  pollIntervalMinutes: 5,
};

// #6: AES-256-GCM encryption for the IMAP password stored in DB.
// Key is derived from AUTH_SECRET so no extra env var is needed.
function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || "";
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

function encryptPassword(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  if (!stored) return "";
  // Legacy plaintext (no enc: prefix) — return as-is; will be encrypted on next save
  if (!stored.startsWith("enc:")) return stored;
  try {
    const key = getEncryptionKey();
    const parts = stored.slice(4).split(":");
    if (parts.length !== 3) return stored;
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    // Decryption failed — treat as plaintext (migration safety net)
    return stored;
  }
}

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: EMAIL_SETTINGS_KEY },
    });

    if (!setting) return { ...DEFAULT_EMAIL_SETTINGS };

    const stored = setting.value as Record<string, unknown>;
    return {
      enabled: Boolean(stored.enabled),
      imapHost: String(stored.imapHost || ""),
      imapPort: Number(stored.imapPort) || 993,
      imapUser: String(stored.imapUser || ""),
      imapPassword: decryptPassword(String(stored.imapPassword || "")),
      folder: String(stored.folder || "INBOX"),
      pollIntervalMinutes: Number(stored.pollIntervalMinutes) || 5,
    };
  } catch (error) {
    console.error("[email] Failed to read settings:", error);
    return { ...DEFAULT_EMAIL_SETTINGS };
  }
}

export async function saveEmailSettings(
  settings: EmailSettings
): Promise<void> {
  const value = {
    enabled: settings.enabled,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapUser: settings.imapUser,
    imapPassword: encryptPassword(settings.imapPassword),
    folder: settings.folder,
    pollIntervalMinutes: settings.pollIntervalMinutes,
  };

  await prisma.settings.upsert({
    where: { key: EMAIL_SETTINGS_KEY },
    update: { value },
    create: { key: EMAIL_SETTINGS_KEY, value },
  });
}
