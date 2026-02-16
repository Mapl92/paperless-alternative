import { createHash } from "crypto";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const DATA_DIR = process.env.DATA_DIR || "./data";

export function getOriginalsDir() {
  return join(DATA_DIR, "originals");
}

export function getArchiveDir() {
  return join(DATA_DIR, "archive");
}

export function getThumbnailsDir() {
  return join(DATA_DIR, "thumbnails");
}

export function getConsumeDir() {
  return join(DATA_DIR, "consume");
}

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveOriginal(
  buffer: Buffer,
  filename: string
): Promise<{ path: string; checksum: string; fileSize: number }> {
  const dir = getOriginalsDir();
  await ensureDir(dir);

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const ext = filename.split(".").pop() || "pdf";
  const storedName = `${checksum}.${ext}`;
  const filePath = join(dir, storedName);

  await writeFile(filePath, buffer);

  return {
    path: `originals/${storedName}`,
    checksum,
    fileSize: buffer.length,
  };
}

export async function saveThumbnail(
  buffer: Buffer,
  documentId: string
): Promise<string> {
  const dir = getThumbnailsDir();
  await ensureDir(dir);

  const filename = `${documentId}.webp`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return `thumbnails/${filename}`;
}

export async function saveArchive(
  buffer: Buffer,
  documentId: string
): Promise<string> {
  const dir = getArchiveDir();
  await ensureDir(dir);

  const filename = `${documentId}.pdf`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return `archive/${filename}`;
}

export async function deleteFile(relativePath: string): Promise<void> {
  const fullPath = join(DATA_DIR, relativePath);
  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }
}

export async function readFileFromStorage(
  relativePath: string
): Promise<Buffer> {
  const fullPath = join(DATA_DIR, relativePath);
  return readFile(fullPath);
}

export function getSignaturesDir() {
  return join(DATA_DIR, "signatures");
}

export async function saveSignature(
  buffer: Buffer,
  signatureId: string
): Promise<string> {
  const dir = getSignaturesDir();
  await ensureDir(dir);

  const filename = `${signatureId}.png`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return `signatures/${filename}`;
}

export function getFullPath(relativePath: string): string {
  return join(DATA_DIR, relativePath);
}
