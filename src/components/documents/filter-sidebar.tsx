"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Tags, Users, FileType, X, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "thisYear";
export type DateField = "documentDate" | "addedAt";

interface SavedViewData {
  id: string;
  name: string;
  filters: {
    search?: string;
    tagId?: string;
    correspondentId?: string;
    documentTypeId?: string;
    dateField?: DateField;
    datePreset?: DatePreset;
    dateFrom?: string;
    dateTo?: string;
  };
  sortField: string;
  sortOrder: string;
}

interface FilterSidebarProps {
  selectedTagId?: string;
  selectedCorrespondentId?: string;
  selectedDocumentTypeId?: string;
  onTagSelect: (id: string | undefined) => void;
  onCorrespondentSelect: (id: string | undefined) => void;
  onDocumentTypeSelect: (id: string | undefined) => void;
  onApplyView?: (view: SavedViewData) => void;
}

interface TagData {
  id: string;
  name: string;
  color: string;
  _count: { documents: number };
}

interface CorrespondentData {
  id: string;
  name: string;
  _count: { documents: number };
}

interface DocumentTypeData {
  id: string;
  name: string;
  _count: { documents: number };
}

export function FilterSidebar({
  selectedTagId,
  selectedCorrespondentId,
  selectedDocumentTypeId,
  onTagSelect,
  onCorrespondentSelect,
  onDocumentTypeSelect,
  onApplyView,
}: FilterSidebarProps) {
  const [tags, setTags] = useState<TagData[]>([]);
  const [correspondents, setCorrespondents] = useState<CorrespondentData[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeData[]>([]);
  const [savedViews, setSavedViews] = useState<SavedViewData[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/tags").then((r) => r.json()),
      fetch("/api/correspondents").then((r) => r.json()),
      fetch("/api/document-types").then((r) => r.json()),
      fetch("/api/saved-views").then((r) => r.json()),
    ]).then(([t, c, d, v]) => {
      const deSort = (a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name, "de");
      setTags(t.sort(deSort));
      setCorrespondents(c.sort(deSort));
      setDocumentTypes(d.sort(deSort));
      setSavedViews(v);
    });
  }, []);

  // Listen for view changes
  useEffect(() => {
    function onViewsChanged() {
      fetch("/api/saved-views")
        .then((r) => r.json())
        .then(setSavedViews)
        .catch(() => {});
    }
    window.addEventListener("saved-views-changed", onViewsChanged);
    return () => window.removeEventListener("saved-views-changed", onViewsChanged);
  }, []);

  const hasActiveFilters =
    selectedTagId || selectedCorrespondentId || selectedDocumentTypeId;

  return (
    <div className="w-60 shrink-0 hidden lg:block">
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="pr-4 space-y-4">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => {
                onTagSelect(undefined);
                onCorrespondentSelect(undefined);
                onDocumentTypeSelect(undefined);
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Filter zurücksetzen
            </Button>
          )}

          {/* Saved Views */}
          {savedViews.length > 0 && (
            <>
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
                  <Bookmark className="h-3 w-3" />
                  Gespeicherte Ansichten
                </h3>
                <div className="space-y-0.5">
                  {savedViews.map((view) => (
                    <button
                      key={view.id}
                      onClick={() => onApplyView?.(view)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted"
                    >
                      <Bookmark className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{view.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Tags */}
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
              <Tags className="h-3 w-3" />
              Tags
            </h3>
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {tags
                .filter((t) => t._count.documents > 0)
                .map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() =>
                      onTagSelect(
                        selectedTagId === tag.id ? undefined : tag.id
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors",
                      selectedTagId === tag.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                    <Badge variant="secondary" className="text-[10px] ml-1 px-1 py-0">
                      {tag._count.documents}
                    </Badge>
                  </button>
                ))}
            </div>
          </div>

          <Separator />

          {/* Correspondents */}
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
              <Users className="h-3 w-3" />
              Korrespondenten
            </h3>
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {correspondents
                .filter((c) => c._count.documents > 0)
                .map((corr) => (
                  <button
                    key={corr.id}
                    onClick={() =>
                      onCorrespondentSelect(
                        selectedCorrespondentId === corr.id
                          ? undefined
                          : corr.id
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors",
                      selectedCorrespondentId === corr.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="truncate">{corr.name}</span>
                    <Badge variant="secondary" className="text-[10px] ml-1 px-1 py-0">
                      {corr._count.documents}
                    </Badge>
                  </button>
                ))}
            </div>
          </div>

          <Separator />

          {/* Document Types */}
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-2">
              <FileType className="h-3 w-3" />
              Dokumenttypen
            </h3>
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {documentTypes
                .filter((d) => d._count.documents > 0)
                .map((dt) => (
                  <button
                    key={dt.id}
                    onClick={() =>
                      onDocumentTypeSelect(
                        selectedDocumentTypeId === dt.id ? undefined : dt.id
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors",
                      selectedDocumentTypeId === dt.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="truncate">{dt.name}</span>
                    <Badge variant="secondary" className="text-[10px] ml-1 px-1 py-0">
                      {dt._count.documents}
                    </Badge>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
