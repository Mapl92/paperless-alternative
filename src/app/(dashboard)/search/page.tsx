"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DocumentCard } from "@/components/documents/document-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Type, Brain, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
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

export default function SearchPage() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 400);
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchResults = useCallback(async () => {
    if (!search) {
      setDocuments([]);
      setTotal(0);
      setTotalPages(0);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        mode,
        page: String(page),
        limit: "24",
      });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, [search, mode, page]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    setPage(1);
  }, [search, mode]);

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Suche</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Dokumente suchen..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 text-lg h-12"
            autoFocus
          />
        </div>

        <div className="flex rounded-lg border bg-muted p-1 h-12">
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

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[3/4] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : !search ? (
        <p className="text-muted-foreground text-center py-12">
          Gib einen Suchbegriff ein um Dokumente zu finden
        </p>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Keine Dokumente gefunden
          </p>
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
            {documents.map((doc) => (
              <div key={doc.id} className="relative">
                <DocumentCard document={doc} />
                {doc.score != null && mode !== "text" && (
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {mode === "semantic"
                      ? `${Math.round(doc.score * 100)}%`
                      : doc.score.toFixed(3)}
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
      )}
    </div>
  );
}
