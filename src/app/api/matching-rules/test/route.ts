import { NextRequest, NextResponse } from "next/server";
import { testRuleCondition } from "@/lib/ai/apply-rules";

export async function POST(request: NextRequest) {
  try {
    const { matchField, matchOperator, matchValue } = await request.json();
    if (!matchField || !matchOperator || !matchValue?.trim()) {
      return NextResponse.json({ count: 0, samples: [] });
    }
    const result = await testRuleCondition(matchField, matchOperator, matchValue);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Rule test error:", error);
    return NextResponse.json({ error: "Test fehlgeschlagen" }, { status: 500 });
  }
}
