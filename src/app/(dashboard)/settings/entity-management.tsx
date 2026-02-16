"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Pencil,
  Trash2,
  Merge,
  Plus,
  Search,
  Loader2,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";

// ---- Types ----

interface Entity {
  id: string;
  name: string;
  color?: string;
  _count: { documents: number };
}

type EntityType = "tags" | "correspondents" | "document-types";

interface EntityConfig {
  type: EntityType;
  label: string;
  labelPlural: string;
  apiPath: string;
  hasColor: boolean;
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    type: "tags",
    label: "Tag",
    labelPlural: "Tags",
    apiPath: "/api/tags",
    hasColor: true,
  },
  {
    type: "correspondents",
    label: "Korrespondent",
    labelPlural: "Korrespondenten",
    apiPath: "/api/correspondents",
    hasColor: false,
  },
  {
    type: "document-types",
    label: "Dokumenttyp",
    labelPlural: "Dokumenttypen",
    apiPath: "/api/document-types",
    hasColor: false,
  },
];

// ---- Main Component ----

export default function EntityManagement() {
  return (
    <div className="space-y-6">
      {ENTITY_CONFIGS.map((config) => (
        <EntitySection key={config.type} config={config} />
      ))}
    </div>
  );
}

// ---- Entity Section ----

function EntitySection({ config }: { config: EntityConfig }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog states
  const [editEntity, setEditEntity] = useState<Entity | null>(null);
  const [deleteEntity, setDeleteEntity] = useState<Entity | null>(null);
  const [mergeEntity, setMergeEntity] = useState<Entity | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch(config.apiPath);
      const data = await res.json();
      setEntities(data);
    } catch {
      toast.error(`${config.labelPlural} konnten nicht geladen werden`);
    } finally {
      setLoading(false);
    }
  }, [config.apiPath, config.labelPlural]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const filtered = entities
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{config.labelPlural}</CardTitle>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Neu
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`${config.labelPlural} durchsuchen...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {search ? "Keine Treffer" : `Keine ${config.labelPlural} vorhanden`}
          </p>
        ) : (
          <div className="border rounded-md">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <span>Name</span>
              <span className="w-16 text-right">Doku.</span>
              <span className="w-24 text-right">Aktionen</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {filtered.map((entity) => (
                <div
                  key={entity.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 border-b last:border-b-0 items-center text-sm hover:bg-muted/30"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {config.hasColor && entity.color && (
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: entity.color }}
                      />
                    )}
                    <span className="truncate">{entity.name}</span>
                  </span>
                  <Badge variant="secondary" className="w-16 justify-center">
                    {entity._count.documents}
                  </Badge>
                  <div className="flex gap-1 w-24 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditEntity(entity)}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setMergeEntity(entity)}
                      title="Zusammenführen"
                      disabled={entities.length < 2}
                    >
                      <Merge className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteEntity(entity)}
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          {entities.length} {config.labelPlural} gesamt
          {search && `, ${filtered.length} angezeigt`}
        </p>
      </CardContent>

      {/* Dialogs */}
      <EditDialog
        config={config}
        entity={editEntity}
        onClose={() => setEditEntity(null)}
        onSaved={fetchEntities}
      />
      <DeleteDialog
        config={config}
        entity={deleteEntity}
        onClose={() => setDeleteEntity(null)}
        onDeleted={fetchEntities}
      />
      <MergeDialog
        config={config}
        entity={mergeEntity}
        entities={entities}
        onClose={() => setMergeEntity(null)}
        onMerged={fetchEntities}
      />
      <CreateDialog
        config={config}
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchEntities}
      />
    </Card>
  );
}

// ---- Edit Dialog ----

function EditDialog({
  config,
  entity,
  onClose,
  onSaved,
}: {
  config: EntityConfig;
  entity: Entity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entity) {
      setName(entity.name);
      setColor(entity.color || "#6B7280");
    }
  }, [entity]);

  async function handleSave() {
    if (!name.trim() || !entity) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (config.hasColor) body.color = color;

      const res = await fetch(`${config.apiPath}/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(`${config.label} aktualisiert`);
        onSaved();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Fehler beim Speichern");
      }
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!entity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.label} bearbeiten</DialogTitle>
          <DialogDescription>
            Name {config.hasColor ? "und Farbe " : ""}
            ändern.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          {config.hasColor && (
            <div>
              <Label htmlFor="edit-color">Farbe</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  id="edit-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-28 font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete Dialog ----

function DeleteDialog({
  config,
  entity,
  onClose,
  onDeleted,
}: {
  config: EntityConfig;
  entity: Entity | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!entity) return;
    setDeleting(true);
    try {
      const res = await fetch(`${config.apiPath}/${entity.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`${config.label} gelöscht`);
        onDeleted();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Fehler beim Löschen");
      }
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!entity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.label} löschen</DialogTitle>
          <DialogDescription>
            Möchten Sie &quot;{entity?.name}&quot; wirklich löschen?
          </DialogDescription>
        </DialogHeader>
        {entity && entity._count.documents > 0 && (
          <p className="text-sm text-amber-600">
            {entity._count.documents} Dokument
            {entity._count.documents !== 1 ? "e" : ""}{" "}
            {entity._count.documents !== 1 ? "verlieren" : "verliert"} diese
            Zuordnung.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Merge Dialog ----

function MergeDialog({
  config,
  entity,
  entities,
  onClose,
  onMerged,
}: {
  config: EntityConfig;
  entity: Entity | null;
  entities: Entity[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (entity) setTargetId("");
  }, [entity]);

  const targets = entities
    .filter((e) => e.id !== entity?.id)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const selectedTarget = targets.find((t) => t.id === targetId);

  async function handleMerge() {
    if (!entity || !targetId) return;
    setMerging(true);
    try {
      const res = await fetch(`${config.apiPath}/${entity.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      if (res.ok) {
        toast.success(
          `"${entity.name}" wurde mit "${selectedTarget?.name}" zusammengeführt`
        );
        onMerged();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Zusammenführung fehlgeschlagen");
      }
    } catch {
      toast.error("Zusammenführung fehlgeschlagen");
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open={!!entity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.label} zusammenführen</DialogTitle>
          <DialogDescription>
            Alle Dokumente von &quot;{entity?.name}&quot; werden dem
            Ziel-Eintrag zugewiesen. &quot;{entity?.name}&quot; wird
            anschließend gelöscht.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>Zusammenführen mit:</Label>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between mt-1"
              >
                {selectedTarget?.name || `${config.label} auswählen...`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Suchen..." />
                <CommandList>
                  <CommandEmpty>Kein Eintrag gefunden.</CommandEmpty>
                  <CommandGroup>
                    {targets.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={t.name}
                        onSelect={() => {
                          setTargetId(t.id);
                          setPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            targetId === t.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <span className="flex-1 truncate">{t.name}</span>
                        <Badge variant="secondary" className="ml-2">
                          {t._count.documents}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleMerge} disabled={merging || !targetId}>
            {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zusammenführen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Create Dialog ----

function CreateDialog({
  config,
  open,
  onClose,
  onCreated,
}: {
  config: EntityConfig;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setColor("#6B7280");
    }
  }, [open]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (config.hasColor) body.color = color;

      const res = await fetch(config.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(`${config.label} erstellt`);
        onCreated();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Fehler beim Erstellen");
      }
    } catch {
      toast.error("Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.label} erstellen</DialogTitle>
          <DialogDescription>
            Neuen {config.label} anlegen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="create-name">Name</Label>
            <Input
              id="create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder={`Neuer ${config.label}...`}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          {config.hasColor && (
            <div>
              <Label htmlFor="create-color">Farbe</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  id="create-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-28 font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
