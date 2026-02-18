"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

interface MatchingRule {
  id: string;
  name: string;
  order: number;
  active: boolean;
  matchField: string;
  matchOperator: string;
  matchValue: string;
  setCorrespondentId: string | null;
  setDocumentTypeId: string | null;
  addTagIds: string[];
  setCorrespondent: { id: string; name: string } | null;
  setDocumentType: { id: string; name: string } | null;
}

interface Entity {
  id: string;
  name: string;
}

const FIELD_LABELS: Record<string, string> = {
  content: "Inhalt (OCR-Text)",
  title: "Titel",
};

const OPERATOR_LABELS: Record<string, string> = {
  contains: "enthält",
  startsWith: "beginnt mit",
  endsWith: "endet mit",
  exact: "ist genau",
  regex: "Regex",
};

const EMPTY_FORM = {
  name: "",
  order: 0,
  active: true,
  matchField: "content",
  matchOperator: "contains",
  matchValue: "",
  setCorrespondentId: "",
  setDocumentTypeId: "",
  addTagIds: [] as string[],
};

export default function MatchingRules() {
  const [rules, setRules] = useState<MatchingRule[]>([]);
  const [correspondents, setCorrespondents] = useState<Entity[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Entity[]>([]);
  const [tags, setTags] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  // Test preview
  const [testCount, setTestCount] = useState<number | null>(null);
  const [testSamples, setTestSamples] = useState<Array<{ id: string; title: string }>>([]);
  const [testLoading, setTestLoading] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, corrRes, typeRes, tagRes] = await Promise.all([
        fetch("/api/matching-rules"),
        fetch("/api/correspondents"),
        fetch("/api/document-types"),
        fetch("/api/tags"),
      ]);
      setRules(await rulesRes.json());
      setCorrespondents(await corrRes.json());
      setDocumentTypes(await typeRes.json());
      const tagData = await tagRes.json();
      setTags(Array.isArray(tagData) ? tagData : tagData.tags ?? []);
    } catch {
      toast.error("Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, order: rules.length });
    setTestCount(null);
    setTestSamples([]);
    setDialogOpen(true);
  }

  function openEdit(rule: MatchingRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      order: rule.order,
      active: rule.active,
      matchField: rule.matchField,
      matchOperator: rule.matchOperator,
      matchValue: rule.matchValue,
      setCorrespondentId: rule.setCorrespondentId ?? "",
      setDocumentTypeId: rule.setDocumentTypeId ?? "",
      addTagIds: rule.addTagIds ?? [],
    });
    setTestCount(null);
    setTestSamples([]);
    setDialogOpen(true);
  }

  async function handleTest() {
    if (!form.matchValue.trim()) return;
    setTestLoading(true);
    try {
      const res = await fetch("/api/matching-rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchField: form.matchField,
          matchOperator: form.matchOperator,
          matchValue: form.matchValue,
        }),
      });
      const data = await res.json();
      setTestCount(data.count ?? 0);
      setTestSamples(data.samples ?? []);
    } catch {
      toast.error("Test fehlgeschlagen");
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.matchValue.trim()) {
      toast.error("Name und Wert sind erforderlich");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        setCorrespondentId: form.setCorrespondentId || null,
        setDocumentTypeId: form.setDocumentTypeId || null,
        order: Number(form.order),
      };
      const url = editingId ? `/api/matching-rules/${editingId}` : "/api/matching-rules";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Regel aktualisiert" : "Regel erstellt");
      setDialogOpen(false);
      load();
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Regel wirklich löschen?")) return;
    try {
      await fetch(`/api/matching-rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Regel gelöscht");
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  }

  async function handleToggleActive(rule: MatchingRule) {
    try {
      await fetch(`/api/matching-rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      );
    } catch {
      toast.error("Fehler beim Speichern");
    }
  }

  async function handleApplyAll() {
    setApplyingAll(true);
    try {
      const res = await fetch("/api/matching-rules/apply-all", { method: "POST" });
      const data = await res.json();
      toast.success(data.message ?? "Regeln werden angewendet…");
    } catch {
      toast.error("Fehler beim Anwenden");
    } finally {
      setApplyingAll(false);
    }
  }

  function toggleTag(tagId: string) {
    setForm((f) => ({
      ...f,
      addTagIds: f.addTagIds.includes(tagId)
        ? f.addTagIds.filter((id) => id !== tagId)
        : [...f.addTagIds, tagId],
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Regeln werden automatisch nach jeder KI-Klassifizierung angewendet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleApplyAll} disabled={applyingAll || rules.filter(r => r.active).length === 0}>
            {applyingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Alle anwenden
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Regel
          </Button>
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GripVertical className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Keine Regeln vorhanden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Erstelle eine Regel, um Dokumente automatisch zu klassifizieren.
            </p>
            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Erste Regel erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={rule.active ? "" : "opacity-60"}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-medium text-sm">{rule.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        #{rule.order}
                      </Badge>
                      {!rule.active && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Inaktiv
                        </Badge>
                      )}
                    </div>

                    {/* Condition */}
                    <p className="text-xs text-muted-foreground mb-2">
                      <span className="font-medium text-foreground">
                        {FIELD_LABELS[rule.matchField]}
                      </span>{" "}
                      {OPERATOR_LABELS[rule.matchOperator]}{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                        {rule.matchValue}
                      </code>
                    </p>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1.5">
                      {rule.setCorrespondent && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          Korrespondent: {rule.setCorrespondent.name}
                        </Badge>
                      )}
                      {rule.setDocumentType && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          Typ: {rule.setDocumentType.name}
                        </Badge>
                      )}
                      {(rule.addTagIds ?? []).length > 0 && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          {(rule.addTagIds ?? []).length} Tag(s)
                        </Badge>
                      )}
                      {!rule.setCorrespondent && !rule.setDocumentType && (rule.addTagIds ?? []).length === 0 && (
                        <span className="text-[10px] text-muted-foreground italic">Keine Aktionen definiert</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => handleToggleActive(rule)}
                      aria-label={`Regel "${rule.name}" ${rule.active ? "deaktivieren" : "aktivieren"}`}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Regel bearbeiten" : "Neue Regel erstellen"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="z.B. Deutsche Telekom"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reihenfolge</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Condition */}
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Bedingung</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Feld</Label>
                  <Select value={form.matchField} onValueChange={(v) => setForm((f) => ({ ...f, matchField: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="content">Inhalt (OCR-Text)</SelectItem>
                      <SelectItem value="title">Titel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Operator</Label>
                  <Select value={form.matchOperator} onValueChange={(v) => setForm((f) => ({ ...f, matchOperator: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">enthält</SelectItem>
                      <SelectItem value="startsWith">beginnt mit</SelectItem>
                      <SelectItem value="endsWith">endet mit</SelectItem>
                      <SelectItem value="exact">ist genau</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wert</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Deutsche Telekom AG"
                    value={form.matchValue}
                    onChange={(e) => { setForm((f) => ({ ...f, matchValue: e.target.value })); setTestCount(null); }}
                  />
                  <Button variant="outline" size="sm" onClick={handleTest} disabled={!form.matchValue.trim() || testLoading}>
                    {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                  </Button>
                </div>
              </div>

              {testCount !== null && (
                <div className={`rounded-md p-2.5 text-sm ${testCount === 0 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}`}>
                  {testCount === 0 ? (
                    <span className="flex items-center gap-1.5">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Kein Dokument würde zutreffen
                    </span>
                  ) : (
                    <>
                      <strong>{testCount}</strong> Dokument(e) würden zutreffen
                      {testSamples.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-green-600">
                          {testSamples.map((s) => (
                            <li key={s.id} className="truncate">• {s.title}</li>
                          ))}
                          {testCount > testSamples.length && (
                            <li className="text-muted-foreground">… und {testCount - testSamples.length} weitere</li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Aktionen</p>

              <div className="space-y-1.5">
                <Label className="text-xs">Korrespondent setzen</Label>
                <Select
                  value={form.setCorrespondentId || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, setCorrespondentId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kein Korrespondent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nicht setzen —</SelectItem>
                    {correspondents.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Dokumenttyp setzen</Label>
                <Select
                  value={form.setDocumentTypeId || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, setDocumentTypeId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kein Typ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nicht setzen —</SelectItem>
                    {documentTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tags hinzufügen</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {tags.map((tag) => {
                    const selected = form.addTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border"
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                id="rule-active"
              />
              <Label htmlFor="rule-active">Regel aktiv</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
