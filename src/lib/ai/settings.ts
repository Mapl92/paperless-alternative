import { prisma } from "@/lib/db/prisma";
import type { AISettings } from "@/app/api/settings/ai/route";
import { DEFAULT_AI_SETTINGS } from "@/app/api/settings/ai/route";

export async function getAISettings(): Promise<AISettings> {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: "ai_config" },
    });

    if (!setting) return DEFAULT_AI_SETTINGS;

    const stored = setting.value as Record<string, unknown>;
    return {
      model: (stored.model as string) || DEFAULT_AI_SETTINGS.model,
      classifyPrompt:
        (stored.classifyPrompt as string) || DEFAULT_AI_SETTINGS.classifyPrompt,
      ocrPrompt: (stored.ocrPrompt as string) || DEFAULT_AI_SETTINGS.ocrPrompt,
      ocrPageLimit: typeof stored.ocrPageLimit === "number" ? stored.ocrPageLimit : DEFAULT_AI_SETTINGS.ocrPageLimit,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}
