"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentGrid } from "@/components/documents/document-grid";
import { DocumentCard } from "@/components/documents/document-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Folder,
  Search,
  Type,
  Brain,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { toast } from "sonner";

type SearchMode = "hybrid" | "semantic" | "text";

const MODE_CONFIG = {
  hybrid: { label: "Hybrid", icon: Sparkles, description: "Text + Semantisch" },
  semantic: { label: "Semantisch", icon: Brain, description: "KI-basiert" },
  text: { label: "Text", icon: Type, description: "Exakte Suche" },
} as const;

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Neueste zuerst" },
  { value: "createdAt:asc", label: "Älteste zuerst" },
  { value: "title:asc", label: "Titel A–Z" },
  { value: "title:desc", label: "Titel Z–A" },
  { value: "documentDate:desc", label: "Datum (neueste)" },
  { value: "documentDate:asc", label: "Datum (älteste)" },
] as const;

interface ProjectMeta {
  id: string;
  name: string;
  color: string;
  documentCount: number;
}

interface DocumentData {
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
  score?: number;
}

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 400);
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [sort, setSort] = useState("createdAt:desc");
  const [sortField, sortOrder] = sort.split(":");

  // Search results (only used when a query is active)
  const [results, setResults] = useState<DocumentData[]>([]);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  // Header actions
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setProject(data);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Keep document count fresh when documents are moved in/out
  useEffect(() => {
    function onMoved() {
      fetchProject();
    }
    window.addEventListener("documind-doc-moved", onMoved);
    return () => window.removeEventListener("documind-doc-moved", onMoved);
  }, [fetchProject]);

  const runSearch = useCallback(async () => {
    if (!search) {
      setResults([]);
      setTotal(0);
      setTotalPages(0);
      return;
    }
    setSearching(true);
    try {
      const sp = new URLSearchParams({
        q: search,
        mode,
        page: String(page),
        limit: "24",
        projectId: id,
      });
      const res = await fetch(`/api/search?${sp}`);
      const data = await res.json();
      setResults(data.documents || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  }, [search, mode, page, id]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  useEffect(() => {
    setPage(1);
  }, [search, mode]);

  async function handleRename() {
    const name = renameValue.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Umbenennen fehlgeschlagen");
      setProject((prev) => (prev ? { ...prev, name: data.name } : prev));
      setRenameOpen(false);
      toast.success("Projekt umbenannt");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Projekt löschen? Die enthaltenen Dokumente werden NICHT gelöscht, sondern zurück in die allgemeinen Dokumente verschoben."
      )
    )
      return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      toast.success("Projekt gelöscht — Dokumente sind wieder in den allgemeinen Dokumenten");
      window.dispatchEvent(new CustomEvent("documind-doc-moved"));
      router.push("/projects");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (notFound) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-lg font-medium text-muted-foreground">Projekt nicht gefunden</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zu den Projekten
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Folder className="h-7 w-7 shrink-0" style={{ color: project?.color }} />
          <h1 className="text-2xl font-bold truncate">{project?.name ?? "Projekt"}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto shrink-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(project?.name ?? "");
                  setRenameOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Umbenennen
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Projekt löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {project ? `${project.documentCount} Dokument${project.documentCount !== 1 ? "e" : ""}` : "—"}
        </p>
      </div>

      {/* Search bar + mode toggle (scoped to this project) */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="In diesem Projekt suchen..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
        <div className="flex rounded-lg border bg-muted p-1 h-11">
          {(Object.entries(MODE_CONFIG) as [SearchMode, typeof MODE_CONFIG[SearchMode]][]).map(
            ([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant={mode === key ? "default" : "ghost"}
                  size="sm"
                  className="h-full px-3 gap-1.5"
                  onClick={() => setMode(key)}
                  title={config.description}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{config.label}</span>
                </Button>
              );
            }
          )}
        </div>
      </div>

      {search ? (
        /* ---------- Search results (scoped to project) ---------- */
        searching ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-muted-foreground">Keine Dokumente gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Versuche andere Suchbegriffe oder einen anderen Suchmodus
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {total} Ergebnis{total !== 1 ? "se" : ""}
              {mode !== "text" && " — sortiert nach Relevanz"}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {results.map((doc) => (
                <div key={doc.id} className="relative">
                  <DocumentCard document={doc} />
                  {doc.score != null && mode !== "text" && (
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {mode === "semantic" ? `${Math.round(doc.score * 100)}%` : doc.score.toFixed(3)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )
      ) : (
        /* ---------- Browse all documents in this project ---------- */
        <div>
          <div className="mb-4 flex justify-end">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DocumentGrid projectId={id} sortField={sortField} sortOrder={sortOrder} />
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Projekt umbenennen</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !saving && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={handleRename} disabled={saving || !renameValue.trim()}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
