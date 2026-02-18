"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, RotateCcw, FileText, AlertTriangle, Calendar, User } from "lucide-react";
import { toast } from "sonner";

interface TrashedDocument {
  id: string;
  title: string;
  thumbnailFile: string | null;
  documentDate: string | null;
  createdAt: string;
  deletedAt: string;
  correspondent: { id: string; name: string } | null;
  documentType: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string; color: string }>;
}

export default function TrashPage() {
  const [documents, setDocuments] = useState<TrashedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const fetchTrashed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents?trashed=true&limit=500&sortField=deletedAt&sortOrder=desc");
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      toast.error("Papierkorb konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrashed();
  }, [fetchTrashed]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map((d) => d.id)));
    }
  }

  async function restore(ids: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", documentIds: ids }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} Dokument${ids.length !== 1 ? "e" : ""} wiederhergestellt`);
      setSelected(new Set());
      await fetchTrashed();
    } catch {
      toast.error("Wiederherstellen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function permanentDelete(ids: string[]) {
    if (!confirm(`${ids.length} Dokument${ids.length !== 1 ? "e" : ""} endgültig löschen? Dies kann nicht rückgängig gemacht werden.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "permanentDelete", documentIds: ids }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} Dokument${ids.length !== 1 ? "e" : ""} gelöscht`);
      setSelected(new Set());
      await fetchTrashed();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = [...selected];
  const allSelected = documents.length > 0 && selected.size === documents.length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="h-6 w-6" />
            Papierkorb
          </h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              {documents.length === 0
                ? "Papierkorb ist leer"
                : `${documents.length} Dokument${documents.length !== 1 ? "e" : ""} im Papierkorb`}
            </p>
          )}
        </div>

        {documents.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => restore(documents.map((d) => d.id))}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Alle wiederherstellen
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => permanentDelete(documents.map((d) => d.id))}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Papierkorb leeren
            </Button>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Dokumente im Papierkorb werden nach 30 Tagen automatisch endgültig gelöscht.
          Stelle sie vorher wieder her, um sie zu behalten.
        </span>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.length} ausgewählt</span>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => restore(selectedIds)}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Wiederherstellen
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => permanentDelete(selectedIds)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Endgültig löschen
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Trash2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Der Papierkorb ist leer.</p>
        </div>
      )}

      {/* Select all */}
      {!loading && documents.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            id="select-all"
          />
          <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer select-none">
            Alle auswählen
          </label>
        </div>
      )}

      {/* Document grid */}
      {!loading && documents.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {documents.map((doc) => (
            <TrashDocumentCard
              key={doc.id}
              document={doc}
              selected={selected.has(doc.id)}
              onSelect={() => toggleSelect(doc.id)}
              onRestore={() => restore([doc.id])}
              onDelete={() => permanentDelete([doc.id])}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrashDocumentCard({
  document: doc,
  selected,
  onSelect,
  onRestore,
  onDelete,
  busy,
}: {
  document: TrashedDocument;
  selected: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const deletedDate = new Date(doc.deletedAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="relative group">
      {/* Checkbox */}
      <div className="absolute top-2 left-2 z-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          className="bg-white/90 shadow-sm"
        />
      </div>

      <Card className={`overflow-hidden transition-all ${selected ? "ring-2 ring-primary border-primary" : ""}`}>
        {/* Thumbnail */}
        <div className="relative aspect-[3/4] bg-muted overflow-hidden">
          {doc.thumbnailFile ? (
            <img
              src={`/api/documents/${doc.id}/file?type=thumbnail`}
              alt={doc.title}
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}

          {/* Overlay actions */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
            <Button
              size="sm"
              variant="secondary"
              className="w-32"
              onClick={onRestore}
              disabled={busy}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Wiederherstellen
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="w-32"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Löschen
            </Button>
          </div>
        </div>

        <CardContent className="p-2.5">
          <p className="text-xs font-medium line-clamp-2 mb-1.5">{doc.title}</p>

          {doc.correspondent && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{doc.correspondent.name}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Gelöscht: {deletedDate}</span>
          </div>

          {doc.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {doc.tags.slice(0, 2).map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-xs px-1 py-0 h-4"
                  style={{ backgroundColor: tag.color + "20", color: tag.color }}
                >
                  {tag.name}
                </Badge>
              ))}
              {doc.tags.length > 2 && (
                <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                  +{doc.tags.length - 2}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
