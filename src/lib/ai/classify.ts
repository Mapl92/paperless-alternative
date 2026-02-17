import { prisma } from "@/lib/db/prisma";
import { callOpenRouter } from "./openrouter";
import { getAISettings } from "./settings";

export interface ClassificationResult {
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  documentDate: string | null;
  summary: string | null;
  extractedData: Record<string, unknown> | null;
  language: string;
}

export async function classifyDocument(
  ocrText: string
): Promise<ClassificationResult> {
  // Fetch existing entities for context and AI settings
  const [tags, correspondents, documentTypes, aiSettings] = await Promise.all([
    prisma.tag.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.correspondent.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.documentType.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    getAISettings(),
  ]);

  const existingTags = tags.map((t) => t.name);
  const existingCorrespondents = correspondents.map((c) => c.name);
  const existingDocumentTypes = documentTypes.map((d) => d.name);

  const systemPrompt = `${aiSettings.classifyPrompt}

Bestehende Tags: ${JSON.stringify(existingTags)}
Bestehende Korrespondenten: ${JSON.stringify(existingCorrespondents)}
Bestehende Dokumenttypen: ${JSON.stringify(existingDocumentTypes)}`;

  const response = await callOpenRouter(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analysiere dieses Dokument:\n\n${ocrText.slice(0, 8000)}` },
    ],
    aiSettings.model,
    "classify"
  );

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.content;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const result = JSON.parse(jsonStr.trim());

    return {
      title: result.title || "Unbenanntes Dokument",
      correspondent: result.correspondent || null,
      documentType: result.documentType || null,
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 4) : [],
      documentDate: result.documentDate || null,
      summary: result.summary || null,
      extractedData: result.extractedData || null,
      language: result.language || "de",
    };
  } catch {
    // #15: Throw so process-document marks the doc with an error instead of silently
    // storing a blank classification as if processing succeeded
    throw new Error(
      `KI-Klassifizierung fehlgeschlagen: Ungültige JSON-Antwort vom Modell. ` +
      `Antwort: ${response.content.slice(0, 300)}`
    );
  }
}
