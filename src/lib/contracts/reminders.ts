import { prisma } from "@/lib/db/prisma";

const CONTRACT_REMINDER_DAYS = [60, 30, 14] as const;

interface ContractReminderInput {
  id: string;
  name: string;
  cancellationDeadline: Date | string | null;
  endDate: Date | string | null;
}

function asDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createContractReminders(contract: ContractReminderInput) {
  const targetDate = asDate(contract.cancellationDeadline) ?? asDate(contract.endDate);
  if (!targetDate) return [];

  const now = Date.now();
  const created = [];

  for (const days of CONTRACT_REMINDER_DAYS) {
    const remindAt = new Date(targetDate.getTime() - days * 24 * 60 * 60 * 1000);
    if (remindAt.getTime() < now) continue;

    const existing = await prisma.reminder.findFirst({
      where: {
        contractId: contract.id,
        remindAt,
      },
    });
    if (existing) continue;

    const title = contract.cancellationDeadline
      ? `Kündigungsfrist: ${contract.name}`
      : `Vertragsende: ${contract.name}`;

    created.push(
      await prisma.reminder.create({
        data: {
          contractId: contract.id,
          title,
          note: `${days} Tage vorher prüfen`,
          remindAt,
        },
      })
    );
  }

  return created;
}
