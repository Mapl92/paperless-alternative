import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { applyMatchingRules } from "@/lib/ai/apply-rules";

export async function POST() {
  try {
    const rules = await prisma.matchingRule.count({ where: { active: true } });
    if (rules === 0) {
      return NextResponse.json({ message: "Keine aktiven Regeln vorhanden", affected: 0 });
    }

    const docs = await prisma.document.findMany({
      where: { aiProcessed: true },
      select: { id: true },
    });

    // Fire-and-forget — runs in background
    let affected = 0;
    (async () => {
      for (const doc of docs) {
        const result = await applyMatchingRules(doc.id).catch(() => ({ applied: 0 }));
        if (result.applied > 0) affected++;
      }
      console.log(`[rules] apply-all complete: ${affected}/${docs.length} documents affected`);
    })();

    return NextResponse.json({
      message: `Regeln werden auf ${docs.length} Dokumente angewendet…`,
      total: docs.length,
    });
  } catch (error) {
    console.error("Apply-all error:", error);
    return NextResponse.json({ error: "Fehler beim Anwenden" }, { status: 500 });
  }
}
