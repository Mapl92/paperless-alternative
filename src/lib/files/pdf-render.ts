import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

/**
 * Render a single PDF page to PNG using pdftoppm
 */
export async function renderPdfPage(
  pdfPath: string,
  page: number,
  dpi = 150
): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "documind-render-"));
  const outputPrefix = join(tempDir, "page");

  try {
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(dpi),
      "-f",
      String(page),
      "-l",
      String(page),
      pdfPath,
      outputPrefix,
    ]);

    // pdftoppm creates page-{n}.png with zero-padded numbers
    // Try common patterns
    const patterns = [
      join(tempDir, `page-${page}.png`),
      join(tempDir, `page-${String(page).padStart(2, "0")}.png`),
      join(tempDir, `page-${String(page).padStart(3, "0")}.png`),
    ];

    for (const p of patterns) {
      try {
        const buf = await readFile(p);
        await unlink(p);
        return buf;
      } catch {
        // try next pattern
      }
    }

    throw new Error(`Could not find rendered page ${page}`);
  } finally {
    // Clean up temp dir
    try {
      const { readdir } = await import("fs/promises");
      const files = await readdir(tempDir);
      for (const f of files) {
        await unlink(join(tempDir, f));
      }
      const { rmdir } = await import("fs/promises");
      await rmdir(tempDir);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Get page count from a PDF using pdfinfo
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
  const match = stdout.match(/Pages:\s+(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}
