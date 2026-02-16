import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";

export async function verifyPassword(password: string): Promise<boolean> {
  const setting = await prisma.settings.findUnique({
    where: { key: "auth_password_hash" },
  });

  if (!setting) {
    // First login - check against env password and store hash
    const envPassword = process.env.AUTH_PASSWORD || "admin";
    if (password === envPassword) {
      const hash = await bcrypt.hash(password, 10);
      await prisma.settings.create({
        data: {
          key: "auth_password_hash",
          value: JSON.stringify(hash),
        },
      });
      return true;
    }
    return false;
  }

  const storedHash = JSON.parse(setting.value as string) as string;
  return bcrypt.compare(password, storedHash);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const isValid = await verifyPassword(currentPassword);
  if (!isValid) return false;

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.settings.upsert({
    where: { key: "auth_password_hash" },
    update: { value: JSON.stringify(hash) },
    create: { key: "auth_password_hash", value: JSON.stringify(hash) },
  });
  return true;
}
