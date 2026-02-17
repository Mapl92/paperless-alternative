"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Calendar,
  Check,
  CheckSquare,
  FileText,
  Flag,
  Loader2,
  Pencil,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getPriority, PRIORITIES } from "@/lib/constants/todo";

interface Todo {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: number;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  document: { id: string; title: string };
}

type SortField = "dueDate" | "priority" | "createdAt";

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    title: string;
    description: string;
    dueDate: string;
    priority: number;
  }>({ title: "", description: "", dueDate: "", priority: 4 });

  useEffect(() => {
    loadTodos();
  }, [showCompleted, sortField, sortOrder]);

  async function loadTodos() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sortField,
        sortOrder,
      });
      if (!showCompleted) params.set("completed", "false");

      const res = await fetch(`/api/todos?${params}`);
      if (res.ok) {
        setTodos(await res.json());
      }
    } catch {
      toast.error("Aufgaben konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(todoId: string, completed: boolean) {
    // #21: Capture full original state before optimistic update for correct rollback
    const original = todos.find((t) => t.id === todoId);

    setTodos((prev) =>
      prev.map((t) =>
        t.id === todoId
          ? { ...t, completed, completedAt: completed ? new Date().toISOString() : null }
          : t
      )
    );
    try {
      await fetch(`/api/todos/${todoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!showCompleted && completed) {
        // Remove from view after brief delay for visual feedback
        setTimeout(() => {
          setTodos((prev) => prev.filter((t) => t.id !== todoId));
        }, 300);
      }
    } catch {
      // Restore the full original todo state (including completedAt)
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId && original ? { ...t, ...original } : t))
      );
    }
  }

  async function handleDelete(todoId: string) {
    if (!confirm("Aufgabe wirklich löschen?")) return;
    const prev = todos;
    setTodos((t) => t.filter((todo) => todo.id !== todoId));
    try {
      const res = await fetch(`/api/todos/${todoId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Aufgabe gelöscht");
      } else {
        setTodos(prev);
      }
    } catch {
      setTodos(prev);
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditData({
      title: todo.title,
      description: todo.description || "",
      dueDate: todo.dueDate ? todo.dueDate.split("T")[0] : "",
      priority: todo.priority,
    });
  }

  async function saveEdit(todoId: string) {
    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editData.title,
          description: editData.description || null,
          dueDate: editData.dueDate || null,
          priority: editData.priority,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTodos((prev) => prev.map((t) => (t.id === todoId ? updated : t)));
        setEditingId(null);
        toast.success("Aufgabe aktualisiert");
      }
    } catch {
      toast.error("Speichern fehlgeschlagen");
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const SortIcon = sortOrder === "asc" ? ArrowDownAZ : ArrowUpAZ;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Aufgaben</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Erledigte anzeigen</label>
          <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex gap-2 mb-4">
        {([
          { field: "dueDate" as SortField, label: "Fälligkeit", icon: Calendar },
          { field: "priority" as SortField, label: "Priorität", icon: Flag },
          { field: "createdAt" as SortField, label: "Erstellt", icon: Calendar },
        ]).map(({ field, label, icon: Icon }) => (
          <Button
            key={field}
            variant={sortField === field ? "secondary" : "ghost"}
            size="sm"
            onClick={() => toggleSort(field)}
            className="text-xs"
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {label}
            {sortField === field && <SortIcon className="ml-1 h-3 w-3" />}
          </Button>
        ))}
      </div>

      {/* Todo list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : todos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {showCompleted
                ? "Keine Aufgaben vorhanden."
                : "Keine offenen Aufgaben."}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Erstelle Aufgaben mit <code className="bg-muted px-1 py-0.5 rounded text-xs">@todo</code> im Notizfeld eines Dokuments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => {
            const prio = getPriority(todo.priority);
            const overdue =
              todo.dueDate && !todo.completed && new Date(todo.dueDate) < new Date();
            const isEditing = editingId === todo.id;

            if (isEditing) {
              return (
                <Card key={todo.id}>
                  <CardContent className="py-3 space-y-2">
                    <Input
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                      className="text-sm"
                      placeholder="Titel"
                      autoFocus
                    />
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      className="text-sm min-h-[40px]"
                      placeholder="Beschreibung (optional)"
                      rows={1}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={editData.dueDate}
                        onChange={(e) => setEditData({ ...editData, dueDate: e.target.value })}
                        className="text-sm h-8 w-40"
                      />
                      <div className="flex gap-1">
                        {PRIORITIES.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => setEditData({ ...editData, priority: p.value })}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                              editData.priority === p.value
                                ? `${p.bg} ${p.color} ${p.border}`
                                : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(todo.id)} disabled={!editData.title.trim()}>
                        <Check className="mr-1 h-3 w-3" />
                        Speichern
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Abbrechen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={todo.id} className={todo.completed ? "opacity-60" : ""}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggle(todo.id, !todo.completed)}
                      className="mt-0.5 shrink-0"
                    >
                      {todo.completed ? (
                        <CheckSquare className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${prio.bg} ${prio.color}`}>
                          {prio.label}
                        </span>
                        <p className={`text-sm font-medium ${todo.completed ? "line-through text-muted-foreground" : ""}`}>
                          {todo.title}
                        </p>
                      </div>
                      {todo.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {todo.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {todo.dueDate && (
                          <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            <Calendar className="h-3 w-3" />
                            {new Date(todo.dueDate).toLocaleDateString("de-DE")}
                          </span>
                        )}
                        <Link
                          href={`/documents/${todo.document.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" />
                          {todo.document.title}
                        </Link>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(todo)}
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(todo.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
