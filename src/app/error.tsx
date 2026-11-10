"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

// Last line of defence for pages outside the dashboard layout (start page, login).
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <ErrorState
        title="Die Seite konnte nicht angezeigt werden"
        description="Beim Laden ist ein Fehler aufgetreten."
        onRetry={reset}
        backHref="/documents"
        backLabel="Zu den Dokumenten"
      />
    </div>
  );
}
