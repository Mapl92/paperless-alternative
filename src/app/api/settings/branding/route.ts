import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { mkdir, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const BRANDING_KEY = "branding";
const DATA_DIR = process.env.DATA_DIR || "./data";
const BRANDING_DIR = join(DATA_DIR, "branding");

export interface BrandingSettings {
  appName: string;
  hasLogo: boolean;
}

const DEFAULTS: BrandingSettings = {
  appName: "DocuMind",
  hasLogo: false,
};

export async function GET() {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: BRANDING_KEY },
    });

    if (!setting) {
      return NextResponse.json(DEFAULTS);
    }

    const stored = setting.value as Record<string, unknown>;
    const logoPath = join(BRANDING_DIR, "logo");
    const hasLogo = existsSync(logoPath + ".png") || existsSync(logoPath + ".jpg") || existsSync(logoPath + ".webp") || existsSync(logoPath + ".svg");

    return NextResponse.json({
      appName: stored.appName || DEFAULTS.appName,
      hasLogo,
    });
  } catch (error) {
    console.error("Branding read error:", error);
    return NextResponse.json(DEFAULTS);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const appName = formData.get("appName") as string | null;
      const logo = formData.get("logo") as File | null;
      const removeLogo = formData.get("removeLogo") === "true";

      // Update app name
      const current = await prisma.settings.findUnique({ where: { key: BRANDING_KEY } });
      const stored = (current?.value as Record<string, unknown>) || {};
      const newName = appName?.trim() || stored.appName || DEFAULTS.appName;

      await prisma.settings.upsert({
        where: { key: BRANDING_KEY },
        update: { value: { appName: newName } },
        create: { key: BRANDING_KEY, value: { appName: newName } },
      });

      // Handle logo
      if (removeLogo) {
        for (const ext of ["png", "jpg", "webp", "svg"]) {
          const p = join(BRANDING_DIR, `logo.${ext}`);
          if (existsSync(p)) await unlink(p);
        }
      } else if (logo && logo.size > 0) {
        // #4: SVG excluded — can contain <script> tags → stored XSS
        // #4: 2 MB max for a logo file
        const ALLOWED_MIME: Record<string, string> = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
        };
        if (!ALLOWED_MIME[logo.type]) {
          return NextResponse.json(
            { error: "Nur PNG, JPG und WebP sind erlaubt (kein SVG)" },
            { status: 400 }
          );
        }
        if (logo.size > 2 * 1024 * 1024) {
          return NextResponse.json(
            { error: "Logo darf maximal 2 MB groß sein" },
            { status: 400 }
          );
        }

        if (!existsSync(BRANDING_DIR)) {
          await mkdir(BRANDING_DIR, { recursive: true });
        }
        // Remove old logos
        for (const ext of ["png", "jpg", "webp", "svg"]) {
          const p = join(BRANDING_DIR, `logo.${ext}`);
          if (existsSync(p)) await unlink(p);
        }
        const ext = ALLOWED_MIME[logo.type];
        const buffer = Buffer.from(await logo.arrayBuffer());
        await writeFile(join(BRANDING_DIR, `logo.${ext}`), buffer);
      }

      const hasLogo = ["png", "jpg", "webp", "svg"].some((ext) =>
        existsSync(join(BRANDING_DIR, `logo.${ext}`))
      );

      return NextResponse.json({ appName: newName, hasLogo });
    }

    // JSON body (name only)
    const body = await request.json();
    const appName = body.appName?.trim() || DEFAULTS.appName;

    await prisma.settings.upsert({
      where: { key: BRANDING_KEY },
      update: { value: { appName } },
      create: { key: BRANDING_KEY, value: { appName } },
    });

    return NextResponse.json({ appName, hasLogo: false });
  } catch (error) {
    console.error("Branding write error:", error);
    return NextResponse.json(
      { error: "Einstellungen konnten nicht gespeichert werden" },
      { status: 500 }
    );
  }
}
