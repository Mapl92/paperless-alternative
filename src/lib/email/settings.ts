import { prisma } from "@/lib/db/prisma";

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
      imapPassword: String(stored.imapPassword || ""),
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
    imapPassword: settings.imapPassword,
    folder: settings.folder,
    pollIntervalMinutes: settings.pollIntervalMinutes,
  };

  await prisma.settings.upsert({
    where: { key: EMAIL_SETTINGS_KEY },
    update: { value },
    create: { key: EMAIL_SETTINGS_KEY, value },
  });
}
