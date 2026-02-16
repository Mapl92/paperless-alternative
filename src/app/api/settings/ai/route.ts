import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const AI_SETTINGS_KEY = "ai_config";

export interface AISettings {
  model: string;
  classifyPrompt: string;
  ocrPrompt: string;
  ocrPageLimit: number;
}

const DEFAULT_CLASSIFY_PROMPT = `Du bist ein Dokumenten-Analysator. Analysiere den folgenden Dokumenttext und extrahiere strukturierte Informationen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in folgendem Format:
{
  "title": "Kurzer, aussagekräftiger Titel",
  "correspondent": "Absender/Institution (kurze Form)",
  "documentType": "Dokumenttyp",
  "tags": ["Tag1", "Tag2"],
  "documentDate": "YYYY-MM-DD",
  "summary": "2-3 Sätze Zusammenfassung",
  "extractedData": { "betrag": "...", "iban": "...", ... },
  "language": "de"
}

Regeln:
- Verwende BESTEHENDE Tags/Korrespondenten/Typen wenn passend (Fuzzy-Match erlaubt)
- Maximal 4 Tags, mindestens 1
- Erstelle KEINE Jahres-Tags (z.B. "2023", "2024") - verwende stattdessen das documentDate Feld
- Korrespondent: kürzeste sinnvolle Form (z.B. "Amazon" statt "Amazon EU SARL")
- Bei Rechnungen: Tag "Zahlung prüfen" hinzufügen
- Titel: kurz, keine Adressen, Sprache des Dokuments
- documentDate: das relevanteste Datum im Dokument
- extractedData: Beträge, IBAN, Vertragsnummern etc. falls vorhanden`;

const DEFAULT_OCR_PROMPT =
  "Du bist ein OCR-System. Extrahiere den GESAMTEN sichtbaren Text aus dem Bild. Gib NUR den erkannten Text zurück, ohne Kommentare oder Formatierung. Bewahre die Absatzstruktur.";

export const DEFAULT_AI_SETTINGS: AISettings = {
  model: "openai/gpt-4.1-mini",
  classifyPrompt: DEFAULT_CLASSIFY_PROMPT,
  ocrPrompt: DEFAULT_OCR_PROMPT,
  ocrPageLimit: 5,
};

export async function GET() {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: AI_SETTINGS_KEY },
    });

    if (!setting) {
      return NextResponse.json(DEFAULT_AI_SETTINGS);
    }

    const stored = setting.value as Record<string, unknown>;
    return NextResponse.json({
      model: stored.model || DEFAULT_AI_SETTINGS.model,
      classifyPrompt: stored.classifyPrompt || DEFAULT_AI_SETTINGS.classifyPrompt,
      ocrPrompt: stored.ocrPrompt || DEFAULT_AI_SETTINGS.ocrPrompt,
      ocrPageLimit: stored.ocrPageLimit ?? DEFAULT_AI_SETTINGS.ocrPageLimit,
    });
  } catch (error) {
    console.error("Settings read error:", error);
    return NextResponse.json(DEFAULT_AI_SETTINGS);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, classifyPrompt, ocrPrompt, ocrPageLimit } = body;

    const value = {
      model: model || DEFAULT_AI_SETTINGS.model,
      classifyPrompt: classifyPrompt || DEFAULT_AI_SETTINGS.classifyPrompt,
      ocrPrompt: ocrPrompt || DEFAULT_AI_SETTINGS.ocrPrompt,
      ocrPageLimit: typeof ocrPageLimit === "number" && ocrPageLimit > 0 ? ocrPageLimit : DEFAULT_AI_SETTINGS.ocrPageLimit,
    };

    await prisma.settings.upsert({
      where: { key: AI_SETTINGS_KEY },
      update: { value },
      create: { key: AI_SETTINGS_KEY, value },
    });

    return NextResponse.json(value);
  } catch (error) {
    console.error("Settings write error:", error);
    return NextResponse.json(
      { error: "Einstellungen konnten nicht gespeichert werden" },
      { status: 500 }
    );
  }
}
