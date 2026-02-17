import { callOpenRouter } from "./openrouter";
import { getAISettings } from "./settings";

export async function performOCR(
  imageBase64: string,
  mimeType: string = "image/png",
  ocrPrompt?: string,
  model?: string
): Promise<string> {
  const response = await callOpenRouter(
    [
      {
        role: "system",
        content: ocrPrompt || "Du bist ein OCR-System. Extrahiere den GESAMTEN sichtbaren Text aus dem Bild.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
          {
            type: "text",
            text: "Schreibe den EXAKTEN Text ab, der auf diesem Dokument sichtbar ist. Erfinde NICHTS. Nur Text wiedergeben, der tatsächlich zu sehen ist.",
          },
        ],
      },
    ],
    model,
    "ocr"
  );

  return response.content;
}

export async function performOCROnMultiplePages(
  pages: Array<{ base64: string; mimeType: string }>
): Promise<string> {
  const aiSettings = await getAISettings();
  const CONCURRENCY = 3;
  const results: string[] = new Array(pages.length);

  // Process pages in parallel batches
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((page) =>
        performOCR(page.base64, page.mimeType, aiSettings.ocrPrompt, aiSettings.model)
      )
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results.join("\n\n---\n\n");
}
