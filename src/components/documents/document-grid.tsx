"use client";

import { useEffect, useState, useCallback } from "react";
import { DocumentCard } from "./document-card";
import { BulkActionsBar } from "./bulk-actions-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckSquare, Square, X } from "lucide-react";

interface DocumentGridProps {
  search?: string;
  tagId?: string;
  correspondentId?: string;
  documentTypeId?: string;
  sortField?: string;
  sortOrder?: string;
  documentDateFrom?: string;
  documentDateTo?: string;
  addedDateFrom?: string;
  addedDateTo?: string;
}

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
}

export function DocumentGrid({
  search,
  tagId,
  correspondentId,
  documentTypeId,
  sortField = "createdAt",
  sortOrder = "desc",
  documentDateFrom,
  documentDateTo,
  addedDateFrom,
  addedDateTo,
}: DocumentGridProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "24");
    if (search) params.set("search", search);
    if (tagId) params.set("tagId", tagId);
    if (correspondentId) params.set("correspondentId", correspondentId);
    if (documentTypeId) params.set("documentTypeId", documentTypeId);
    if (documentDateFrom) params.set("documentDateFrom", documentDateFrom);
    if (documentDateTo) params.set("documentDateTo", documentDateTo);
    if (addedDateFrom) params.set("addedDateFrom", addedDateFrom);
    if (addedDateTo) params.set("addedDateTo", addedDateTo);
    params.set("sortField", sortField);
    params.set("sortOrder", sortOrder);

    try {
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      setDocuments(data.documents);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, tagId, correspondentId, documentTypeId, sortField, sortOrder, documentDateFrom, documentDateTo, addedDateFrom, addedDateTo]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    setPage(1);
  }, [search, tagId, correspondentId, documentTypeId, sortField, sortOrder, documentDateFrom, documentDateTo, addedDateFrom, addedDateTo]);

  // ESC to exit select mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectMode]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(documents.map((d) => d.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          Keine Dokumente gefunden
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {search
            ? "Versuche andere Suchbegriffe"
            : "Lade dein erstes Dokument hoch"}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Selection controls */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} Dokumente
        </p>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <Button variant="outline" size="sm" onClick={selectAll}>
                <CheckSquare className="mr-1 h-4 w-4" />
                Alle auswählen
              </Button>
              {selectedIds.size > 0 && (
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  <Square className="mr-1 h-4 w-4" />
                  Auswahl aufheben
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                <X className="mr-1 h-4 w-4" />
                Abbrechen
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
              <CheckSquare className="mr-1 h-4 w-4" />
              Auswählen
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            document={doc}
            selectable={selectMode}
            selected={selectedIds.has(doc.id)}
            onSelect={toggleSelect}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-end">
          <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectMode && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          selectedIds={selectedIds}
          onClearSelection={exitSelectMode}
          onRefresh={fetchDocuments}
        />
      )}
    </div>
  );
}
