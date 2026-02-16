import { NextRequest, NextResponse } from "next/server";
import { changePassword } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Beide Passwörter erforderlich" },
      { status: 400 }
    );
  }

  if (newPassword.length < 4) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 4 Zeichen haben" },
      { status: 400 }
    );
  }

  const success = await changePassword(currentPassword, newPassword);
  if (!success) {
    return NextResponse.json(
      { error: "Aktuelles Passwort ist falsch" },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true });
}
