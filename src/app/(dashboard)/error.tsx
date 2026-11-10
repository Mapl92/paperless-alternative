"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

// Catches render errors of any page inside the dashboard layout, so the
// sidebar stays usable instead of the whole app going blank.
export default function DashboardError({
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
    <ErrorState
      title="Diese Seite konnte nicht angezeigt werden"
      description="Beim Laden ist ein Fehler aufgetreten."
      onRetry={reset}
      backHref="/documents"
      backLabel="Zu den Dokumenten"
    />
  );
}
