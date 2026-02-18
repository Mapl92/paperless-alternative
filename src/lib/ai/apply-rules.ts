import { prisma } from "@/lib/db/prisma";

function matchesCondition(
  fieldValue: string,
  operator: string,
  matchValue: string
): boolean {
  const v = fieldValue.toLowerCase();
  const m = matchValue.toLowerCase();
  switch (operator) {
    case "contains":   return v.includes(m);
    case "startsWith": return v.startsWith(m);
    case "endsWith":   return v.endsWith(m);
    case "exact":      return v === m;
    case "regex": {
      try { return new RegExp(matchValue, "i").test(fieldValue); }
      catch { return false; }
    }
    default: return false;
  }
}

/**
 * Apply all active matching rules to a document.
 * Rules run in order; later rules can override earlier ones for
 * correspondent/type, but tags are always additive.
 */
export async function applyMatchingRules(
  documentId: string
): Promise<{ applied: number; ruleNames: string[] }> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true, title: true, correspondentId: true, documentTypeId: true },
  });
  if (!document) return { applied: 0, ruleNames: [] };

  const rules = await prisma.matchingRule.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
  if (rules.length === 0) return { applied: 0, ruleNames: [] };

  const appliedNames: string[] = [];
  let correspondentId = document.correspondentId;
  let documentTypeId = document.documentTypeId;
  const tagsToAdd: string[] = [];

  for (const rule of rules) {
    const fieldValue =
      rule.matchField === "content" ? (document.content ?? "") : document.title;
    if (!fieldValue || !matchesCondition(fieldValue, rule.matchOperator, rule.matchValue)) {
      continue;
    }

    appliedNames.push(rule.name);

    // Rules always override AI classification for correspondent/type
    if (rule.setCorrespondentId !== undefined) correspondentId = rule.setCorrespondentId;
    if (rule.setDocumentTypeId !== undefined) documentTypeId = rule.setDocumentTypeId;

    const addIds = rule.addTagIds as string[];
    tagsToAdd.push(...addIds);
  }

  if (appliedNames.length === 0) return { applied: 0, ruleNames: [] };

  const uniqueTags = [...new Set(tagsToAdd)];
  await prisma.document.update({
    where: { id: documentId },
    data: {
      correspondentId,
      documentTypeId,
      ...(uniqueTags.length > 0 && {
        tags: { connect: uniqueTags.map((id) => ({ id })) },
      }),
    },
  });

  console.log(
    `[rules] Applied ${appliedNames.length} rule(s) to ${documentId}: ${appliedNames.join(", ")}`
  );
  return { applied: appliedNames.length, ruleNames: appliedNames };
}

/**
 * Count how many documents a hypothetical rule condition would match.
 * Used for the "test" preview in the UI.
 */
export async function testRuleCondition(
  matchField: string,
  matchOperator: string,
  matchValue: string
): Promise<{ count: number; samples: Array<{ id: string; title: string }> }> {
  const docs = await prisma.document.findMany({
    where: { aiProcessed: true },
    select: { id: true, title: true, content: true },
  });

  const matches = docs.filter((doc) => {
    const fieldValue = matchField === "content" ? (doc.content ?? "") : doc.title;
    return matchesCondition(fieldValue, matchOperator, matchValue);
  });

  return {
    count: matches.length,
    samples: matches.slice(0, 5).map(({ id, title }) => ({ id, title })),
  };
}
