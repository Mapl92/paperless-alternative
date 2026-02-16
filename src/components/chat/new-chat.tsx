"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentCard } from "@/components/documents/document-card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Search, FileStack, Files, Type, Brain, Sparkles } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";

type SearchMode = "hybrid" | "semantic" | "text";

const MODE_CONFIG = {
  hybrid: { label: "Hybrid", icon: Sparkles, description: "Text + Semantisch" },
  semantic: { label: "Semantisch", icon: Brain, description: "KI-basiert" },
  text: { label: "Text", icon: Type, description: "Exakte Suche" },
} as const;

interface DocumentData {
  id: string;
  title: string;
  thumbnailFile: string | null;
  documentDate: string | null;
  createdAt: string;
  aiProcessed: boolean;
  correspondent: { id: string; name: string } | null;
  documentType: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string; color: string }>;
  score?: number;
}

interface NewChatProps {
  onStart: (scope: "all" | "selected", selectedIds?: string[]) => void;
}

export function NewChat({ onStart }: NewChatProps) {
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const search = useDebounce(searchInput, 400);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      if (search) {
        // Use search API with mode support
        const params = new URLSearchParams({
          q: search,
          mode,
          limit: "100",
        });
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setDocuments(data.documents || []);
      } else {
        // No search query — show all documents
        const res = await fetch("/api/documents?limit=100");
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      console.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [search, mode]);

  useEffect(() => {
    if (scope === "selected") {
      fetchDocuments();
    }
  }, [scope, fetchDocuments]);

  function toggleDocument(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStart() {
    if (scope === "selected" && selectedIds.size === 0) return;
    onStart(scope, scope === "selected" ? Array.from(selectedIds) : undefined);
  }

  return (
    <div className="flex-1 flex flex-col items-center p-4 md:p-6 overflow-y-auto md:justify-center">
      <div className="max-w-2xl w-full space-y-4 md:space-y-6">
        <div className="text-center space-y-1 md:space-y-2">
          <MessageCircle className="h-8 w-8 md:h-12 md:w-12 mx-auto text-primary" />
          <h2 className="text-xl md:text-2xl font-bold">Neuer Chat</h2>
          <p className="text-muted-foreground text-sm md:text-base">
            Chatte mit deinen Dokumenten.
          </p>
        </div>

        {/* Scope Toggle */}
        <div className="flex gap-2 justify-center">
          <Button
            variant={scope === "all" ? "default" : "outline"}
            onClick={() => setScope("all")}
            className="gap-2"
          >
            <Files className="h-4 w-4" />
            Alle Dokumente
          </Button>
          <Button
            variant={scope === "selected" ? "default" : "outline"}
            onClick={() => setScope("selected")}
            className="gap-2"
          >
            <FileStack className="h-4 w-4" />
            Auswahl
          </Button>
        </div>

        {scope === "all" ? (
          <p className="text-center text-sm text-muted-foreground">
            Es werden automatisch die relevantesten Dokumente zu deiner Frage gefunden.
          </p>
        ) : (
          <>
            {/* Search input + mode toggle */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Dokumente suchen..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex rounded-lg border bg-muted p-1">
                {(Object.entries(MODE_CONFIG) as [SearchMode, typeof MODE_CONFIG[SearchMode]][]).map(
                  ([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <Button
                        key={key}
                        variant={mode === key ? "default" : "ghost"}
                        size="sm"
                        className="h-full px-2 gap-1"
                        onClick={() => setMode(key)}
                        title={config.description}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline text-xs">{config.label}</span>
                      </Button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Selected count */}
            {selectedIds.size > 0 && (
              <p className="text-sm text-primary font-medium">
                {selectedIds.size} Dokument{selectedIds.size !== 1 ? "e" : ""} ausgewählt
              </p>
            )}

            {/* Document grid */}
            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 max-h-[250px] md:max-h-[400px] overflow-y-auto">
                {documents.map((doc) => (
                  <div key={doc.id} className="relative">
                    <DocumentCard
                      document={doc}
                      selectable
                      selected={selectedIds.has(doc.id)}
                      onSelect={toggleDocument}
                    />
                    {doc.score != null && search && mode !== "text" && (
                      <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded">
                        {mode === "semantic"
                          ? `${Math.round(doc.score * 100)}%`
                          : doc.score.toFixed(3)}
                      </div>
                    )}
                  </div>
                ))}
                {!loading && search && documents.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground text-center py-8">
                    Keine Dokumente gefunden
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Start button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleStart}
            disabled={scope === "selected" && selectedIds.size === 0}
            className="gap-2"
          >
            <MessageCircle className="h-5 w-5" />
            Chat starten
          </Button>
        </div>
      </div>
    </div>
  );
}
