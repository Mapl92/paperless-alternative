import { pool } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { generateQueryEmbedding, toVectorString } from "@/lib/ai/embeddings";
import { logApiCall } from "@/lib/logging";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent";

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface DocumentContext {
  id: string;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  documentDate: string | null;
  content: string | null;
}

/**
 * Stream a chat response from Gemini.
 * Yields text chunks as they arrive.
 */
export async function* streamChatResponse(
  systemPrompt: string,
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY nicht konfiguriert");
  }

  const start = Date.now();

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}&alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: messages,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Gemini chat error:", res.status, err);
    logApiCall({
      type: "gemini-chat",
      action: "chat",
      model: "gemini-3-flash-preview",
      durationMs: Date.now() - start,
      status: "error",
      error: `${res.status} - ${err.slice(0, 500)}`,
    });
    throw new Error(`Gemini API Fehler: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Kein Response-Body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // skip malformed JSON
      }
    }
  }

  // Process remaining buffer
  if (buffer.startsWith("data: ")) {
    const jsonStr = buffer.slice(6).trim();
    if (jsonStr && jsonStr !== "[DONE]") {
      try {
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // skip
      }
    }
  }

  logApiCall({
    type: "gemini-chat",
    action: "chat",
    model: "gemini-3-flash-preview",
    durationMs: Date.now() - start,
    status: "success",
  });
}

/**
 * Build a system prompt with document context.
 */
export function buildDocumentContext(documents: DocumentContext[]): string {
  const docSections = documents.map((doc, i) => {
    const meta = [
      doc.correspondent && `Korrespondent: ${doc.correspondent}`,
      doc.documentType && `Typ: ${doc.documentType}`,
      doc.documentDate && `Datum: ${new Date(doc.documentDate).toLocaleDateString("de-DE")}`,
    ]
      .filter(Boolean)
      .join(" | ");

    return `--- Dokument ${i + 1}: ${doc.title} ---
${meta ? meta + "\n" : ""}${doc.content || "(Kein Inhalt verfügbar)"}`;
  });

  const today = new Date().toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `Du bist ein hilfreicher Dokumenten-Assistent. Das heutige Datum ist ${today}. Der Benutzer hat dir folgende Dokumente zur Verfügung gestellt. Beantworte Fragen basierend auf dem Inhalt dieser Dokumente. Wenn die Antwort nicht in den Dokumenten zu finden ist, sage das ehrlich. Antworte auf Deutsch, es sei denn, der Benutzer schreibt in einer anderen Sprache.

${docSections.join("\n\n")}`;
}

/**
 * Find relevant documents using pgvector similarity search.
 */
export async function findRelevantDocuments(
  query: string,
  documentIds?: string[],
  limit = 5
): Promise<DocumentContext[]> {
  const embedding = await generateQueryEmbedding(query);

  let ids: string[];

  if (embedding) {
    const vectorStr = toVectorString(embedding);

    let sql: string;
    let params: (string | number)[];

    if (documentIds && documentIds.length > 0) {
      // Search within specific documents
      const placeholders = documentIds.map((_, i) => `$${i + 3}`).join(",");
      sql = `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
             FROM "Document"
             WHERE "embedding" IS NOT NULL AND "id" IN (${placeholders})
             ORDER BY "embedding" <=> $1::vector
             LIMIT $2`;
      params = [vectorStr, limit, ...documentIds];
    } else {
      // Search all documents
      sql = `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
             FROM "Document"
             WHERE "embedding" IS NOT NULL
             ORDER BY "embedding" <=> $1::vector
             LIMIT $2`;
      params = [vectorStr, limit];
    }

    const result = await pool.query(sql, params);
    ids = result.rows.map((r: { id: string }) => r.id);
  } else if (documentIds && documentIds.length > 0) {
    // No embedding available, just use provided IDs
    ids = documentIds.slice(0, limit);
  } else {
    return [];
  }

  if (ids.length === 0) return [];

  const documents = await prisma.document.findMany({
    where: { id: { in: ids } },
    include: { correspondent: true, documentType: true },
  });

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    correspondent: doc.correspondent?.name ?? null,
    documentType: doc.documentType?.name ?? null,
    documentDate: doc.documentDate?.toISOString() ?? null,
    content: doc.content,
  }));
}

/**
 * Generate a short title for a conversation based on the first message.
 */
export async function generateTitle(userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "Neuer Chat";

  const start = Date.now();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Gib mir einen kurzen Titel (3-5 Wörter, ohne Punkt, ohne Anführungszeichen) für eine Chat-Konversation die mit dieser Nachricht beginnt:\n\n${userMessage}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 256,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      logApiCall({
        type: "gemini-title",
        action: "title",
        model: "gemini-2.5-flash",
        durationMs: Date.now() - start,
        status: "error",
        error: `${res.status}`,
      });
      return "Neuer Chat";
    }

    const data = await res.json();
    // Gemini 2.5 has "thinking" — parts[0] may be a thought, so find the last non-thought text part
    const parts: Array<{ text?: string; thought?: boolean }> =
      data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.filter((p) => !p.thought && p.text).pop();
    const raw = textPart?.text?.trim();
    if (!raw) return "Neuer Chat";
    // Strip quotes and trailing punctuation the model might add
    const title = raw.replace(/^["„»]+|["»"]+$/g, "").replace(/\.+$/, "").trim();
    logApiCall({
      type: "gemini-title",
      action: "title",
      model: "gemini-2.5-flash",
      durationMs: Date.now() - start,
      status: "success",
    });
    return title || "Neuer Chat";
  } catch {
    logApiCall({
      type: "gemini-title",
      action: "title",
      model: "gemini-2.5-flash",
      durationMs: Date.now() - start,
      status: "error",
      error: "Failed to parse response",
    });
    return "Neuer Chat";
  }
}
