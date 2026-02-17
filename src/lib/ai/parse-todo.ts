import { callOpenRouter } from "./openrouter";

interface ParsedTodo {
  title: string;
  description: string | null;
  dueDate: string | null; // ISO date string
  priority: number; // 1-4
}

export async function parseTodoText(text: string): Promise<ParsedTodo> {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("de-DE", { weekday: "long" });

  try {
    const response = await callOpenRouter(
      [
        {
          role: "system",
          content: `Du bist ein Todo-Parser. Extrahiere aus dem Text: Titel, optionale Beschreibung, Fälligkeitsdatum und Priorität.

Heute ist ${dayOfWeek}, der ${today}.

Regeln:
- Titel: Der Kern der Aufgabe, ohne Datum- oder Prioritätsangaben
- Beschreibung: Zusätzliche Details, falls vorhanden (sonst null)
- Datum: Erkenne absolute Daten (23.03.2026, 2026-03-23) und relative Angaben (morgen, übermorgen, nächste Woche = nächster Montag, nächsten Freitag, Ende des Monats = letzter Tag des aktuellen Monats, in 3 Tagen). Format: YYYY-MM-DD. Null wenn kein Datum erkennbar.
- Priorität: 1=dringend/sofort/ASAP, 2=wichtig/hoch, 3=mittel, 4=normal/Standard. Wenn keine Priorität angegeben → 4.

Antworte NUR mit gültigem JSON:
{"title": "...", "description": null, "dueDate": "YYYY-MM-DD", "priority": 4}`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      "google/gemini-2.5-flash-lite",
      "todo-parse"
    );

    const cleaned = response.content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || text,
      description: parsed.description || null,
      dueDate: parsed.dueDate || null,
      priority: [1, 2, 3, 4].includes(parsed.priority) ? parsed.priority : 4,
    };
  } catch (error) {
    console.error("Todo parse error:", error);
    return {
      title: text,
      description: null,
      dueDate: null,
      priority: 4,
    };
  }
}
