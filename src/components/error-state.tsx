"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  description?: string;
  /** Shows a "try again" button when given. */
  onRetry?: () => void;
  /** Shows a secondary link when given. */
  backHref?: string;
  backLabel?: string;
}

/** Message for a page or section that could not be loaded. */
export function ErrorState({ title, description, onRetry, backHref, backLabel }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-lg font-medium">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Erneut versuchen
          </Button>
        )}
        {backHref && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>{backLabel ?? "Zurück"}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
