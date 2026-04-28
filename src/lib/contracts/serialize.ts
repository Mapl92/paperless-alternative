import { costToMonthly, costToYearly } from "./costs";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function serializeCost(cost: Record<string, unknown>) {
  const amount = decimalToNumber(cost.amount) ?? 0;
  return {
    ...cost,
    amount,
    monthlyAmount: costToMonthly(amount, cost.billingInterval as string | null),
    yearlyAmount: costToYearly(amount, cost.billingInterval as string | null),
  };
}

export function serializeCandidate(candidate: Record<string, unknown>) {
  return {
    ...candidate,
    amount: decimalToNumber(candidate.amount),
  };
}

export function serializeContract(contract: Record<string, unknown>) {
  const costs = Array.isArray(contract.costs)
    ? (contract.costs as Array<Record<string, unknown>>).map(serializeCost)
    : [];
  const currentCost = costs[0] ?? null;

  return {
    ...contract,
    costs,
    currentCost,
  };
}
