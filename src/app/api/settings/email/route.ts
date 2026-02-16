import { NextRequest, NextResponse } from "next/server";
import {
  getEmailSettings,
  saveEmailSettings,
  DEFAULT_EMAIL_SETTINGS,
} from "@/lib/email/settings";
import { restartEmailWatcher, testImapConnection } from "@/lib/email/watcher";

export async function GET() {
  try {
    const settings = await getEmailSettings();
    // Mask password for display
    return NextResponse.json({
      ...settings,
      imapPassword: settings.imapPassword ? "********" : "",
    });
  } catch (error) {
    console.error("Email settings read error:", error);
    return NextResponse.json(DEFAULT_EMAIL_SETTINGS);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // If password is masked, keep the existing one
    let imapPassword = body.imapPassword;
    if (imapPassword === "********") {
      const current = await getEmailSettings();
      imapPassword = current.imapPassword;
    }

    const settings = {
      enabled: Boolean(body.enabled),
      imapHost: String(body.imapHost || ""),
      imapPort: Number(body.imapPort) || 993,
      imapUser: String(body.imapUser || ""),
      imapPassword: String(imapPassword || ""),
      folder: String(body.folder || "INBOX"),
      pollIntervalMinutes:
        typeof body.pollIntervalMinutes === "number" &&
        body.pollIntervalMinutes >= 1
          ? body.pollIntervalMinutes
          : 5,
    };

    await saveEmailSettings(settings);
    await restartEmailWatcher();

    return NextResponse.json({
      ...settings,
      imapPassword: settings.imapPassword ? "********" : "",
    });
  } catch (error) {
    console.error("Email settings write error:", error);
    return NextResponse.json(
      { error: "Einstellungen konnten nicht gespeichert werden" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "test") {
      // If password is masked, use stored password
      let imapPassword = body.imapPassword;
      if (imapPassword === "********") {
        const current = await getEmailSettings();
        imapPassword = current.imapPassword;
      }

      const result = await testImapConnection({
        imapHost: body.imapHost,
        imapPort: Number(body.imapPort) || 993,
        imapUser: body.imapUser,
        imapPassword: String(imapPassword || ""),
        folder: body.folder || "INBOX",
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (error) {
    console.error("Email settings action error:", error);
    return NextResponse.json(
      { error: "Aktion fehlgeschlagen" },
      { status: 500 }
    );
  }
}
