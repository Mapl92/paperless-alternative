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
            text: "Extrahiere den gesamten Text aus diesem Dokumentbild.",
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
  const results: string[] = [];

  for (const page of pages) {
    const text = await performOCR(
      page.base64,
      page.mimeType,
      aiSettings.ocrPrompt,
      aiSettings.model
    );
    results.push(text);
  }

  return results.join("\n\n---\n\n");
}
