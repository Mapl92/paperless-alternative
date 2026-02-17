import { NextRequest, NextResponse } from "next/server";
import { parseTodoText } from "@/lib/ai/parse-todo";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: "Text erforderlich" }, { status: 400 });
    }

    const parsed = await parseTodoText(text.trim());
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Todo parse API error:", error);
    return NextResponse.json(
      { error: "Parsing fehlgeschlagen" },
      { status: 500 }
    );
  }
}
