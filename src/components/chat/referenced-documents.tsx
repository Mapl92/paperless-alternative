"use client";

import Link from "next/link";
import { FileText, Check } from "lucide-react";

interface RefDoc {
  id: string;
  title: string;
  thumbnailFile: string | null;
  correspondent: { name: string } | null;
}

interface ReferencedDocumentsProps {
  documents: RefDoc[];
  onToggle?: (docId: string) => void;
  excludedIds?: Set<string>;
}

export function ReferencedDocuments({ documents, onToggle, excludedIds }: ReferencedDocumentsProps) {
  if (documents.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
      {documents.map((doc) => {
        const isExcluded = excludedIds?.has(doc.id) ?? false;

        return (
          <div key={doc.id} className="flex-shrink-0 group relative">
            {onToggle && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(doc.id);
                }}
                className="absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-sm border flex items-center justify-center transition-colors bg-background/80 hover:bg-background"
              >
                {!isExcluded && <Check className="h-3 w-3 text-primary" />}
              </button>
            )}
            <Link href={`/documents/${doc.id}`}>
              <div className={`w-16 rounded-md border overflow-hidden bg-muted transition-all group-hover:ring-2 group-hover:ring-primary/30 ${isExcluded ? "opacity-40" : ""}`}>
                <div className="aspect-[3/4] relative">
                  {doc.thumbnailFile ? (
                    <img
                      src={`/api/documents/${doc.id}/file?type=thumbnail`}
                      alt={doc.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="px-1 py-0.5">
                  <p className="text-[9px] leading-tight line-clamp-2 text-muted-foreground">
                    {doc.title}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
