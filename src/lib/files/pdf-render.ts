import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

/**
 * Render a single PDF page to PNG using pdftoppm.
 * Uses readdir to find the output file instead of guessing zero-padded filenames.
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

    // pdftoppm creates files like page-1.png or page-01.png (zero-padded
    // depending on total page count). Read all matching PNGs from the temp dir.
    const files = await readdir(tempDir);
    const pngFile = files.find(
      (f) => f.startsWith("page-") && f.endsWith(".png")
    );

    if (!pngFile) {
      throw new Error(`Could not find rendered page ${page}`);
    }

    return await readFile(join(tempDir, pngFile));
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch((err) => {
      console.error(`[pdf-render] Failed to clean up temp dir ${tempDir}:`, err);
    });
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
