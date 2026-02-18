"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tags, Trash2, User, FileType, X, Loader2, Search, Download } from "lucide-react";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Correspondent {
  id: string;
  name: string;
}

interface DocumentType {
  id: string;
  name: string;
}

interface BulkActionsBarProps {
  selectedCount: number;
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onRefresh: () => void;
}

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  onClearSelection,
  onRefresh,
}: BulkActionsBarProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [correspondents, setCorrespondents] = useState<Correspondent[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/tags").then((r) => r.json()),
      fetch("/api/correspondents").then((r) => r.json()),
      fetch("/api/document-types").then((r) => r.json()),
    ]).then(([t, c, d]) => {
      setTags(Array.isArray(t) ? t : t.tags || []);
      setCorrespondents(Array.isArray(c) ? c : c.correspondents || []);
      setDocumentTypes(Array.isArray(d) ? d : d.documentTypes || []);
    });
  }, []);

  async function executeBulk(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          documentIds: Array.from(selectedIds),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fehler");
      }
      onClearSelection();
      onRefresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`${selectedCount} Dokument(e) in den Papierkorb verschieben?`)) return;
    const ok = await executeBulk({ action: "trash" });
    if (ok) toast.success(`${selectedCount} Dokument(e) in den Papierkorb verschoben`);
  }

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/documents/bulk/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export fehlgeschlagen");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documind-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${selectedCount} Dokument(e) exportiert`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-3 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedCount} ausgewählt
          </span>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <X className="mr-1 h-4 w-4" />
            Aufheben
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Tags */}
          <TagPopover
            label="Tags +"
            tags={tags}
            loading={loading}
            onApply={async (tagIds) => {
              const ok = await executeBulk({ action: "addTags", tagIds });
              if (ok) toast.success("Tags zugewiesen");
              return ok;
            }}
          />

          {/* Remove Tags */}
          <TagPopover
            label="Tags −"
            tags={tags}
            loading={loading}
            onApply={async (tagIds) => {
              const ok = await executeBulk({ action: "removeTags", tagIds });
              if (ok) toast.success("Tags entfernt");
              return ok;
            }}
          />

          {/* Correspondent */}
          <SearchableListPopover
            label="Korrespondent"
            icon={<User className="mr-1 h-4 w-4" />}
            items={correspondents}
            loading={loading}
            onSelect={async (id) => {
              const ok = await executeBulk({ action: "setCorrespondent", correspondentId: id });
              if (ok) toast.success(id ? "Korrespondent gesetzt" : "Korrespondent entfernt");
              return ok;
            }}
          />

          {/* Document Type */}
          <SearchableListPopover
            label="Dokumenttyp"
            icon={<FileType className="mr-1 h-4 w-4" />}
            items={documentTypes}
            loading={loading}
            onSelect={async (id) => {
              const ok = await executeBulk({ action: "setDocumentType", documentTypeId: id });
              if (ok) toast.success(id ? "Dokumenttyp gesetzt" : "Dokumenttyp entfernt");
              return ok;
            }}
          />

          {/* ZIP Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading || exporting}
          >
            {exporting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            ZIP
          </Button>

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Löschen
          </Button>
        </div>
      </div>
    </div>
  );
}

function SearchableListPopover({
  label,
  icon,
  items,
  loading,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  items: Array<{ id: string; name: string }>;
  loading: boolean;
  onSelect: (id: string | null) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" side="top" align="end">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[240px]">
          <div className="p-1">
            <button
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={async () => {
                const ok = await onSelect(null);
                if (ok) setOpen(false);
              }}
            >
              <span className="text-muted-foreground">— Keiner —</span>
            </button>
            {filtered.map((item) => (
              <button
                key={item.id}
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={async () => {
                  const ok = await onSelect(item.id);
                  if (ok) setOpen(false);
                }}
              >
                {item.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Keine Ergebnisse
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function TagPopover({
  label,
  tags,
  loading,
  onApply,
}: {
  label: string;
  tags: Tag[];
  loading: boolean;
  onApply: (tagIds: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => tags.filter((tag) => tag.name.toLowerCase().includes(search.toLowerCase())),
    [tags, search]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (selected.size === 0) return;
    const ok = await onApply(Array.from(selected));
    if (ok) {
      setSelected(new Set());
      setSearch("");
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelected(new Set()); setSearch(""); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <Tags className="mr-1 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" side="top" align="end">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tags suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[240px]">
          <div className="p-1 space-y-0.5">
            {filtered.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selected.has(tag.id)}
                  onCheckedChange={() => toggle(tag.id)}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate">{tag.name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Keine Ergebnisse
              </p>
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t">
          <Button size="sm" className="w-full" onClick={apply} disabled={selected.size === 0}>
            Anwenden ({selected.size})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
