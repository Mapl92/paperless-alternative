"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Plus, Trash2, X, ExternalLink, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import { toast } from "sonner";

interface ReminderItem {
  id: string;
  title: string;
  note: string | null;
  remindAt: string;
  dismissed: boolean;
  documentId: string | null;
  createdAt: string;
  document: { id: string; title: string } | null;
}

function getReminderStatus(remindAt: string, dismissed: boolean) {
  if (dismissed) return "dismissed";
  const diff = new Date(remindAt).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 24 * 60 * 60 * 1000) return "today";
  return "upcoming";
}

function StatusBadge({ remindAt, dismissed }: { remindAt: string; dismissed: boolean }) {
  const status = getReminderStatus(remindAt, dismissed);
  if (status === "dismissed") return <Badge variant="outline" className="text-xs text-muted-foreground">Erledigt</Badge>;
  if (status === "overdue") return <Badge className="text-xs bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Überfällig</Badge>;
  if (status === "today") return <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">Heute</Badge>;
  return <Badge variant="outline" className="text-xs">Ausstehend</Badge>;
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all" | "dismissed">("pending");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newRemindAt, setNewRemindAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const status = tab === "pending" ? "pending" : tab === "dismissed" ? "dismissed" : "all";
      const res = await fetch(`/api/reminders?status=${status}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDismiss(id: string) {
    setReminders((prev) => prev.map((r) => r.id === id ? { ...r, dismissed: true } : r));
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Erinnerung als erledigt markiert");
      if (tab === "pending") setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setReminders((prev) => prev.map((r) => r.id === id ? { ...r, dismissed: false } : r));
      toast.error("Fehler beim Aktualisieren");
    }
  }

  async function handleReactivate(id: string) {
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: false }),
      });
      if (!res.ok) throw new Error();
      toast.success("Erinnerung reaktiviert");
      load();
    } catch {
      toast.error("Fehler beim Reaktivieren");
    }
  }

  async function handleDelete(id: string) {
    const prev = reminders;
    setReminders((r) => r.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTotal((t) => t - 1);
      toast.success("Erinnerung gelöscht");
    } catch {
      setReminders(prev);
      toast.error("Löschen fehlgeschlagen");
    }
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newRemindAt) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          note: newNote.trim() || null,
          remindAt: new Date(newRemindAt).toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      toast.success("Erinnerung erstellt");
      setCreateOpen(false);
      setNewTitle("");
      setNewNote("");
      setNewRemindAt("");
      // Add to list if it fits the current tab
      if (tab !== "dismissed") {
        setReminders((prev) => [created, ...prev].sort(
          (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime()
        ));
        setTotal((t) => t + 1);
      }
    } catch {
      toast.error("Erinnerung konnte nicht erstellt werden");
    } finally {
      setSaving(false);
    }
  }

  // Default datetime: tomorrow at 9:00
  function getDefaultRemindAt() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }

  const pendingCount = reminders.filter((r) => !r.dismissed && new Date(r.remindAt) <= new Date()).length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Erinnerungen
          </h1>
          {pendingCount > 0 && (
            <p className="text-sm text-red-600 mt-0.5 font-medium">
              {pendingCount} fällige Erinnerung{pendingCount !== 1 ? "en" : ""}
            </p>
          )}
        </div>
        <Button onClick={() => { setNewRemindAt(getDefaultRemindAt()); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Neue Erinnerung
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="all">Alle ({total})</TabsTrigger>
          <TabsTrigger value="dismissed">Erledigt</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BellOff className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "Keine ausstehenden Erinnerungen" :
               tab === "dismissed" ? "Keine erledigten Erinnerungen" :
               "Noch keine Erinnerungen"}
            </p>
            {tab === "pending" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setNewRemindAt(getDefaultRemindAt()); setCreateOpen(true); }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Erste Erinnerung erstellen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => {
            const status = getReminderStatus(r.remindAt, r.dismissed);
            const dateStr = new Date(r.remindAt).toLocaleString("de-DE", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            });
            return (
              <Card
                key={r.id}
                className={
                  status === "overdue" ? "border-red-200 bg-red-50/30" :
                  status === "today" ? "border-orange-200 bg-orange-50/30" :
                  ""
                }
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                      r.dismissed ? "bg-muted" :
                      status === "overdue" ? "bg-red-100" :
                      status === "today" ? "bg-orange-100" :
                      "bg-primary/10"
                    }`}>
                      <Bell className={`h-2.5 w-2.5 ${
                        r.dismissed ? "text-muted-foreground" :
                        status === "overdue" ? "text-red-600" :
                        status === "today" ? "text-orange-600" :
                        "text-primary"
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${r.dismissed ? "line-through text-muted-foreground" : ""}`}>
                          {r.title}
                        </span>
                        <StatusBadge remindAt={r.remindAt} dismissed={r.dismissed} />
                      </div>

                      {r.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.note}</p>
                      )}

                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {dateStr}
                        </span>
                        {r.document && (
                          <Link
                            href={`/documents/${r.document.id}`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            <span className="truncate max-w-[160px]">{r.document.title}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!r.dismissed ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-green-600"
                          title="Als erledigt markieren"
                          onClick={() => handleDismiss(r.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Reaktivieren"
                          onClick={() => handleReactivate(r.id)}
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Löschen"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Neue Erinnerung
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Titel *</label>
              <Input
                className="mt-1"
                placeholder="z.B. Versicherung kündigen, Steuern einreichen..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notiz (optional)</label>
              <Textarea
                className="mt-1"
                placeholder="Zusätzliche Informationen..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Erinnerung am *</label>
              <Input
                className="mt-1"
                type="datetime-local"
                value={newRemindAt}
                onChange={(e) => setNewRemindAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              <X className="mr-2 h-4 w-4" />
              Abbrechen
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !newTitle.trim() || !newRemindAt}
            >
              <Bell className="mr-2 h-4 w-4" />
              {saving ? "Wird erstellt..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
