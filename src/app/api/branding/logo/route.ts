import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || "./data";
const BRANDING_DIR = join(DATA_DIR, "branding");

const extToMime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET() {
  for (const ext of ["png", "jpg", "webp", "svg"]) {
    const filePath = join(BRANDING_DIR, `logo.${ext}`);
    if (existsSync(filePath)) {
      const buffer = await readFile(filePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": extToMime[ext],
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  return NextResponse.json({ error: "No logo" }, { status: 404 });
}
