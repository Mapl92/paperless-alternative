export const PRIORITIES = [
  { value: 1, label: "P1", name: "Dringend", color: "text-red-600", bg: "bg-red-100", border: "border-red-300" },
  { value: 2, label: "P2", name: "Hoch", color: "text-orange-600", bg: "bg-orange-100", border: "border-orange-300" },
  { value: 3, label: "P3", name: "Mittel", color: "text-yellow-600", bg: "bg-yellow-100", border: "border-yellow-300" },
  { value: 4, label: "P4", name: "Normal", color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-300" },
] as const;

export function getPriority(value: number) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[3];
}
