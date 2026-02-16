"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronsUpDown,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  PenLine,
  Pencil,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import SigningOverlay from "@/components/signatures/signing-overlay";
import { toast } from "sonner";

interface DocumentDetail {
  id: string;
  title: string;
  content: string | null;
  originalFile: string;
  archiveFile: string | null;
  thumbnailFile: string | null;
  documentDate: string | null;
  createdAt: string;
  updatedAt: string;
  fileSize: number;
  pageCount: number | null;
  mimeType: string;
  aiProcessed: boolean;
  aiSummary: string | null;
  aiExtractedData: Record<string, unknown> | null;
  correspondent: { id: string; name: string } | null;
  documentType: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string; color: string }>;
  notes: Array<{ id: string; content: string; createdAt: string }>;
}

interface SelectOption {
  id: string;
  name: string;
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const router = useRouter();

  // Cached options for metadata editing
  const [correspondents, setCorrespondents] = useState<SelectOption[] | null>(null);
  const [documentTypes, setDocumentTypes] = useState<SelectOption[] | null>(null);
  const [allTags, setAllTags] = useState<TagOption[] | null>(null);

  // Popover open states
  const [corrOpen, setCorrOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Reprocess state
  const [reprocessing, setReprocessing] = useState(false);

  // Signing state
  const [signingOpen, setSigningOpen] = useState(false);

  // Fulltext toggle
  const [showFulltext, setShowFulltext] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // Lazy-load options on first popover open
  const loadCorrespondents = useCallback(async () => {
    if (correspondents) return;
    const res = await fetch("/api/correspondents");
    if (res.ok) setCorrespondents(await res.json());
  }, [correspondents]);

  const loadDocumentTypes = useCallback(async () => {
    if (documentTypes) return;
    const res = await fetch("/api/document-types");
    if (res.ok) setDocumentTypes(await res.json());
  }, [documentTypes]);

  const loadTags = useCallback(async () => {
    if (allTags) return;
    const res = await fetch("/api/tags");
    if (res.ok) setAllTags(await res.json());
  }, [allTags]);

  // Generic PATCH helper
  async function patchDocument(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setDoc((prev) => (prev ? { ...prev, ...updated } : prev));
        toast.success("Gespeichert");
        return true;
      }
      toast.error("Speichern fehlgeschlagen");
    } catch {
      toast.error("Speichern fehlgeschlagen");
    }
    return false;
  }

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data);
        setEditTitle(data.title);
      })
      .catch(() => toast.error("Dokument nicht gefunden"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSaveTitle() {
    if (!doc || editTitle === doc.title) {
      setEditing(false);
      return;
    }
    const ok = await patchDocument({ title: editTitle });
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Dokument wirklich löschen?")) return;
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      toast.success("Dokument gelöscht");
      router.push("/");
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/documents/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote }),
      });
      if (res.ok) {
        const note = await res.json();
        setDoc((prev) =>
          prev ? { ...prev, notes: [note, ...prev.notes] } : prev
        );
        setNewNote("");
        toast.success("Notiz hinzugefügt");
      }
    } catch {
      toast.error("Notiz konnte nicht gespeichert werden");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      const res = await fetch(
        `/api/documents/${id}/notes?noteId=${noteId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDoc((prev) =>
          prev
            ? { ...prev, notes: prev.notes.filter((n) => n.id !== noteId) }
            : prev
        );
        toast.success("Notiz gelöscht");
      }
    } catch {
      toast.error("Notiz konnte nicht gelöscht werden");
    }
  }

  async function handleReprocess() {
    setReprocessing(true);
    try {
      const res = await fetch(`/api/documents/${id}/reprocess`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("KI-Verarbeitung gestartet. Seite wird in Kürze aktualisiert.");
        // Poll for completion
        const poll = setInterval(async () => {
          const r = await fetch(`/api/documents/${id}`);
          if (r.ok) {
            const data = await r.json();
            if (data.aiProcessed) {
              clearInterval(poll);
              setDoc(data);
              setReprocessing(false);
              toast.success("KI-Verarbeitung abgeschlossen");
            }
          }
        }, 3000);
        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(poll);
          setReprocessing(false);
        }, 300_000);
      } else {
        toast.error("Verarbeitung konnte nicht gestartet werden");
        setReprocessing(false);
      }
    } catch {
      toast.error("Verarbeitung fehlgeschlagen");
      setReprocessing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <Skeleton className="flex-1 aspect-[3/4] rounded-lg" />
          <Skeleton className="w-80 h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 text-center">
        <p>Dokument nicht gefunden</p>
      </div>
    );
  }

  const formattedDate = doc.documentDate
    ? new Date(doc.documentDate).toLocaleDateString("de-DE")
    : null;

  return (
    <div className="p-4 md:p-6">
      {/* Back button + actions */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/documents/${id}/file?type=original`}
              download={`${doc.title}.pdf`}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSigningOpen(true)}
          >
            <PenLine className="mr-2 h-4 w-4" />
            Unterschreiben
          </Button>
          {doc.content && (
            <Button
              variant={showFulltext ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFulltext(!showFulltext)}
            >
              <FileText className="mr-2 h-4 w-4" />
              {showFulltext ? "Volltext ausblenden" : "Volltext"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReprocess}
            disabled={reprocessing}
          >
            {reprocessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {reprocessing ? "Verarbeitet..." : "KI neu verarbeiten"}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Löschen
          </Button>
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* PDF Preview */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-0">
              <iframe
                src={`/api/documents/${id}/file?type=${doc.archiveFile ? "archive" : "original"}`}
                className="w-full h-[calc(100vh-12rem)] rounded-lg"
                title="PDF Vorschau"
              />
            </CardContent>
          </Card>

          {/* Fulltext */}
          {showFulltext && doc.content && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  OCR-Volltext
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
                  {doc.content}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata */}
        <div className="w-full lg:w-80 space-y-4">
          {/* Title */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Titel
                </CardTitle>
                {!editing ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleSaveTitle}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditing(false);
                        setEditTitle(doc.title);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  autoFocus
                />
              ) : (
                <p className="font-medium">{doc.title}</p>
              )}
            </CardContent>
          </Card>

          {/* Metadata Card */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Correspondent */}
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <Popover open={corrOpen} onOpenChange={(open) => {
                  setCorrOpen(open);
                  if (open) loadCorrespondents();
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-auto px-2 py-1 font-normal justify-between w-full">
                      <span className={doc.correspondent ? "" : "text-muted-foreground"}>
                        {doc.correspondent?.name ?? "Kein Korrespondent"}
                      </span>
                      <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-60" align="start">
                    <Command>
                      <CommandInput placeholder="Suchen..." />
                      <CommandList>
                        <CommandEmpty>Nichts gefunden.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              patchDocument({ correspondentId: null });
                              setCorrOpen(false);
                            }}
                          >
                            <span className="text-muted-foreground">Keine Zuordnung</span>
                            {!doc.correspondent && <Check className="ml-auto h-4 w-4" />}
                          </CommandItem>
                          {correspondents?.map((c) => (
                            <CommandItem
                              key={c.id}
                              onSelect={() => {
                                patchDocument({ correspondentId: c.id });
                                setCorrOpen(false);
                              }}
                            >
                              {c.name}
                              {doc.correspondent?.id === c.id && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Document Type */}
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <Popover open={typeOpen} onOpenChange={(open) => {
                  setTypeOpen(open);
                  if (open) loadDocumentTypes();
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-auto px-2 py-1 font-normal justify-between w-full">
                      <span className={doc.documentType ? "" : "text-muted-foreground"}>
                        {doc.documentType?.name ?? "Kein Dokumenttyp"}
                      </span>
                      <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-60" align="start">
                    <Command>
                      <CommandInput placeholder="Suchen..." />
                      <CommandList>
                        <CommandEmpty>Nichts gefunden.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              patchDocument({ documentTypeId: null });
                              setTypeOpen(false);
                            }}
                          >
                            <span className="text-muted-foreground">Keine Zuordnung</span>
                            {!doc.documentType && <Check className="ml-auto h-4 w-4" />}
                          </CommandItem>
                          {documentTypes?.map((dt) => (
                            <CommandItem
                              key={dt.id}
                              onSelect={() => {
                                patchDocument({ documentTypeId: dt.id });
                                setTypeOpen(false);
                              }}
                            >
                              {dt.name}
                              {doc.documentType?.id === dt.id && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Document Date */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                {editingDate ? (
                  <Input
                    ref={dateInputRef}
                    type="date"
                    defaultValue={doc.documentDate ? new Date(doc.documentDate).toISOString().split("T")[0] : ""}
                    className="h-8 text-sm"
                    autoFocus
                    onBlur={(e) => {
                      const val = e.target.value;
                      patchDocument({ documentDate: val || null });
                      setEditingDate(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingDate(false);
                    }}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 font-normal w-full justify-start"
                    onClick={() => setEditingDate(true)}
                  >
                    <span className={formattedDate ? "" : "text-muted-foreground"}>
                      {formattedDate ?? "Kein Datum"}
                    </span>
                  </Button>
                )}
              </div>

              <Separator />

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Tags</p>
                  <Popover open={tagsOpen} onOpenChange={(open) => {
                    setTagsOpen(open);
                    if (open) loadTags();
                  }}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Tag className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-60" align="start">
                      <Command>
                        <CommandInput placeholder="Tags suchen..." />
                        <CommandList>
                          <CommandEmpty>Nichts gefunden.</CommandEmpty>
                          <CommandGroup>
                            {allTags?.map((t) => {
                              const isSelected = doc.tags.some((dt) => dt.id === t.id);
                              return (
                                <CommandItem
                                  key={t.id}
                                  onSelect={() => {
                                    const newTagIds = isSelected
                                      ? doc.tags.filter((dt) => dt.id !== t.id).map((dt) => dt.id)
                                      : [...doc.tags.map((dt) => dt.id), t.id];
                                    patchDocument({ tagIds: newTagIds });
                                  }}
                                >
                                  <Checkbox checked={isSelected} className="pointer-events-none" />
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  {t.name}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {doc.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="text-xs gap-1 pr-1"
                        style={{ borderColor: tag.color, color: tag.color }}
                      >
                        {tag.name}
                        <button
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                          onClick={() => {
                            const newTagIds = doc.tags
                              .filter((t) => t.id !== tag.id)
                              .map((t) => t.id);
                            patchDocument({ tagIds: newTagIds });
                          }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Keine Tags</p>
                )}
              </div>

              <Separator />

              {/* File Info */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Größe: {(doc.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                {doc.pageCount && <p>Seiten: {doc.pageCount}</p>}
                <p>
                  Hinzugefügt:{" "}
                  {new Date(doc.createdAt).toLocaleDateString("de-DE")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          {doc.aiSummary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  KI-Zusammenfassung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{doc.aiSummary}</p>
              </CardContent>
            </Card>
          )}

          {/* Extracted Data */}
          {doc.aiExtractedData &&
            Object.keys(doc.aiExtractedData).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Extrahierte Daten
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {Object.entries(doc.aiExtractedData).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-muted-foreground capitalize">
                          {key}:
                        </span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Notizen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Notiz hinzufügen..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="min-h-[60px] text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0 self-end"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || savingNote}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </div>
              {doc.notes.length > 0 && (
                <div className="space-y-2">
                  {doc.notes.map((note) => (
                    <div
                      key={note.id}
                      className="group relative rounded-md border p-3 text-sm"
                    >
                      <p className="whitespace-pre-wrap pr-6">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(note.createdAt).toLocaleString("de-DE")}
                      </p>
                      <button
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Signing Overlay */}
      <SigningOverlay
        documentId={id}
        open={signingOpen}
        onOpenChange={setSigningOpen}
        onSigned={() => {
          // Refresh document to get updated archiveFile
          fetch(`/api/documents/${id}`)
            .then((r) => r.json())
            .then((data) => {
              setDoc(data);
            });
        }}
      />
    </div>
  );
}
