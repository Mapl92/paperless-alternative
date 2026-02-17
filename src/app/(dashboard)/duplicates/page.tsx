"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  ScanSearch,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface DocInfo {
  id: string;
  title: string;
  thumbnailFile: string | null;
  documentDate: string | null;
  createdAt: string;
  fileSize: number | null;
  pageCount: number | null;
  correspondent: { name: string } | null;
  documentType: { name: string } | null;
}

interface PairInfo {
  id1: string;
  id2: string;
  embeddingSimilarity: number;
  textSimilarity: number;
}

interface DuplicateGroup {
  documents: DocInfo[];
  pairs: PairInfo[];
  maxSimilarity: number;
  maxTextSimilarity: number;
}

interface ScanResult {
  groups: DuplicateGroup[];
  scanned: number;
  threshold: number;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "–";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getPairSimilarity(pairs: PairInfo[], id1: string, id2: string) {
  return pairs.find(
    (p) => (p.id1 === id1 && p.id2 === id2) || (p.id1 === id2 && p.id2 === id1)
  );
}

function SimilarityBadge({ value, label }: { value: number; label: string }) {
  const color =
    value >= 95 ? "text-red-600 bg-red-50 border-red-200" :
    value >= 85 ? "text-orange-600 bg-orange-50 border-orange-200" :
    "text-yellow-600 bg-yellow-50 border-yellow-200";
  return (
    <span className={`text-[10px] border rounded px-1.5 py-0.5 font-medium ${color}`}>
      {label} {value}%
    </span>
  );
}

export default function DuplicatesPage() {
  const [threshold, setThreshold] = useState("0.90");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function handleScan() {
    setScanning(true);
    setResult(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch(`/api/documents/duplicates?threshold=${threshold}`);
      if (!res.ok) throw new Error("Scan fehlgeschlagen");
      setResult(await res.json());
    } catch {
      toast.error("Scan fehlgeschlagen");
    } finally {
      setScanning(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllDuplicates() {
    if (!result) return;
    // Pre-select all but the newest document in each group
    const toSelect = new Set<string>();
    for (const group of result.groups) {
      const sorted = [...group.documents].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      // Keep newest, select rest for deletion
      sorted.slice(1).forEach((d) => toSelect.add(d.id));
    }
    setSelectedIds(toSelect);
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Dokument(e) wirklich löschen?`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", documentIds: [...selectedIds] }),
      });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");

      toast.success(`${selectedIds.size} Dokument(e) gelöscht`);

      // Remove deleted docs from result
      setResult((prev) => {
        if (!prev) return null;
        const remaining = prev.groups
          .map((g) => ({
            ...g,
            documents: g.documents.filter((d) => !selectedIds.has(d.id)),
            pairs: g.pairs.filter(
              (p) => !selectedIds.has(p.id1) && !selectedIds.has(p.id2)
            ),
          }))
          .filter((g) => g.documents.length > 1);
        return { ...prev, groups: remaining };
      });
      setSelectedIds(new Set());
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  }

  const totalDuplicateCount = result?.groups.reduce(
    (sum, g) => sum + g.documents.length,
    0
  ) ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Duplikat-Erkennung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Findet ähnliche Dokumente anhand semantischer Übereinstimmung (Embeddings) und Textüberlappung.
        </p>
      </div>

      {/* Scan controls */}
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schwellenwert</label>
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.98">98 % — Fast identisch</SelectItem>
                <SelectItem value="0.95">95 % — Sehr ähnlich (empfohlen)</SelectItem>
                <SelectItem value="0.90">90 % — Ähnlich</SelectItem>
                <SelectItem value="0.85">85 % — Grob ähnlich</SelectItem>
                <SelectItem value="0.80">80 % — Locker ähnlich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="mr-2 h-4 w-4" />
            )}
            {scanning ? "Scanne…" : "Scan starten"}
          </Button>

          {result && (
            <p className="text-sm text-muted-foreground self-center">
              {result.scanned} Dokumente gescannt
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {result.groups.length === 0 ? (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-2 py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="font-medium">Keine Duplikate gefunden</p>
                <p className="text-sm text-muted-foreground">
                  Kein Dokument-Paar überschreitet den Schwellenwert von {Math.round(parseFloat(threshold) * 100)} %.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">
                    {result.groups.length} Gruppe{result.groups.length !== 1 ? "n" : ""} mit{" "}
                    {totalDuplicateCount} Dokumenten gefunden
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllDuplicates}>
                    Ältere vorauswählen
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={selectedIds.size === 0 || deleting}
                  >
                    {deleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {selectedIds.size > 0
                      ? `${selectedIds.size} löschen`
                      : "Auswahl löschen"}
                  </Button>
                </div>
              </div>

              {/* Duplicate groups */}
              {result.groups.map((group, gi) => (
                <Card key={gi} className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Gruppe {gi + 1} — {group.documents.length} Dokumente
                      </span>
                      <SimilarityBadge value={group.maxSimilarity} label="Semantik" />
                      {group.maxTextSimilarity > 0 && (
                        <SimilarityBadge value={group.maxTextSimilarity} label="Text" />
                      )}
                    </div>
                  </div>

                  <CardContent className="p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.documents.map((doc) => {
                        if (!doc) return null;
                        const isSelected = selectedIds.has(doc.id);
                        const date = doc.documentDate || doc.createdAt;
                        const formattedDate = new Date(date).toLocaleDateString("de-DE");
                        const addedDate = new Date(doc.createdAt).toLocaleDateString("de-DE");

                        // Find highest pair similarity for this doc within the group
                        const docPairs = group.pairs.filter(
                          (p) => p.id1 === doc.id || p.id2 === doc.id
                        );
                        const maxPairSim = docPairs.length
                          ? Math.max(...docPairs.map((p) => p.embeddingSimilarity))
                          : null;

                        return (
                          <div
                            key={doc.id}
                            className={`relative rounded-lg border transition-all ${
                              isSelected
                                ? "border-destructive bg-destructive/5"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            {/* Checkbox */}
                            <div className="absolute top-2 left-2 z-10">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(doc.id)}
                                aria-label={`"${doc.title}" zum Löschen markieren`}
                                className="bg-background/90 backdrop-blur"
                              />
                            </div>

                            {/* Open link */}
                            <Link
                              href={`/documents/${doc.id}`}
                              target="_blank"
                              className="absolute top-2 right-2 z-10 p-1 rounded bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Dokument öffnen"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>

                            {/* Thumbnail */}
                            <div className="aspect-[4/3] bg-muted overflow-hidden rounded-t-lg">
                              {doc.thumbnailFile ? (
                                <img
                                  src={`/api/documents/${doc.id}/file?type=thumbnail`}
                                  alt={doc.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <FileText className="h-10 w-10 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="p-3 space-y-1.5">
                              <p className="text-sm font-medium line-clamp-2">{doc.title}</p>

                              {doc.correspondent && (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="h-3 w-3 shrink-0" />
                                  {doc.correspondent.name}
                                </p>
                              )}

                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3 shrink-0" />
                                {formattedDate}
                              </p>

                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {doc.documentType && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {doc.documentType.name}
                                  </Badge>
                                )}
                                {doc.pageCount && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {doc.pageCount} S.
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {formatBytes(doc.fileSize)}
                                </Badge>
                              </div>

                              <p className="text-[10px] text-muted-foreground">
                                Hinzugefügt: {addedDate}
                              </p>

                              {maxPairSim !== null && (
                                <div className="flex gap-1 flex-wrap pt-0.5">
                                  <SimilarityBadge value={maxPairSim} label="max. Ähnlichkeit" />
                                </div>
                              )}
                            </div>

                            {isSelected && (
                              <div className="absolute inset-0 rounded-lg ring-2 ring-destructive pointer-events-none" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Pair details for groups with >2 docs */}
                    {group.documents.length === 2 && group.pairs.length === 1 && (
                      <div className="mt-3 pt-3 border-t flex gap-3 text-xs text-muted-foreground">
                        <span>
                          Semantische Ähnlichkeit:{" "}
                          <strong>{group.pairs[0].embeddingSimilarity} %</strong>
                        </span>
                        {group.pairs[0].textSimilarity > 0 && (
                          <span>
                            Textübereinstimmung:{" "}
                            <strong>{group.pairs[0].textSimilarity} %</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
