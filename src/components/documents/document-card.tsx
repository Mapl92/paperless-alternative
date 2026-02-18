"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Calendar, User } from "lucide-react";

interface DocumentCardProps {
  document: {
    id: string;
    title: string;
    thumbnailFile: string | null;
    documentDate: string | null;
    expiresAt: string | null;
    createdAt: string;
    aiProcessed: boolean;
    correspondent: { id: string; name: string } | null;
    documentType: { id: string; name: string } | null;
    tags: Array<{ id: string; name: string; color: string }>;
  };
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function getExpiryBadge(expiresAt: string | null): { label: string; className: string } | null {
  if (!expiresAt) return null;
  const diffDays = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0)
    return { label: "Abgelaufen", className: "bg-red-600 text-white border-red-600" };
  if (diffDays <= 7)
    return { label: `${diffDays}T`, className: "bg-red-500 text-white border-red-500" };
  if (diffDays <= 30)
    return { label: `${diffDays}T`, className: "bg-orange-400 text-white border-orange-400" };
  return null; // far future — no badge on card
}

export function DocumentCard({ document, selectable, selected, onSelect }: DocumentCardProps) {
  const date = document.documentDate || document.createdAt;
  const formattedDate = new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const expiryBadge = getExpiryBadge(document.expiresAt);

  const cardContent = (
    <Card className={`group overflow-hidden transition-all hover:shadow-md hover:border-primary/30 ${selected ? "ring-2 ring-primary border-primary" : ""}`}>
      {/* Thumbnail */}
      <div className="relative aspect-[3/4] bg-muted overflow-hidden">
        {document.thumbnailFile ? (
          <img
            src={`/api/documents/${document.id}/file?type=thumbnail`}
            alt={document.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        {selectable && (
          <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect?.(document.id)}
              className="bg-background/80 backdrop-blur"
              aria-label={`Dokument "${document.title}" auswählen`}
            />
          </div>
        )}
        {/* Expiry badge — top-right, only for ≤30 days or expired */}
        {expiryBadge && (
          <div className="absolute top-2 right-2 z-10">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${expiryBadge.className}`}>
              {expiryBadge.label}
            </span>
          </div>
        )}
        {!document.aiProcessed && !expiryBadge && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="text-xs">
              Verarbeitung...
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-3">
        <h3 className="font-medium text-sm line-clamp-2 mb-1.5">
          {document.title}
        </h3>

        {document.correspondent && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <User className="h-3 w-3" />
            <span className="truncate">{document.correspondent.name}</span>
          </p>
        )}

        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Calendar className="h-3 w-3" />
          {formattedDate}
        </p>

        {document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {document.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                {tag.name}
              </Badge>
            ))}
            {document.tags.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{document.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (selectable) {
    return (
      <div className="cursor-pointer" onClick={() => onSelect?.(document.id)}>
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/documents/${document.id}`}>
      {cardContent}
    </Link>
  );
}
