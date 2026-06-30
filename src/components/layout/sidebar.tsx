"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  FileText,
  Upload,
  Search,
  Settings,
  LogOut,
  LayoutDashboard,
  FolderOpen,
  Folder,
  Folders,
  X,
  Plus,
  ArrowLeft,
  MessageCircle,
  ScanSearch,
  Trash2,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBranding } from "@/lib/hooks/use-branding";
import { ThemeToggle } from "@/components/theme-toggle";
import { DOC_DRAG_TYPE } from "@/components/documents/document-card";
import { toast } from "sonner";

interface SavedView {
  id: string;
  name: string;
  count?: number;
}

interface ProjectItem {
  id: string;
  name: string;
  color: string;
  documentCount: number;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Dokumente", icon: FileText },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Suche", icon: Search },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/contracts", label: "Verträge", icon: ShieldCheck },
  { href: "/todos", label: "Aufgaben", icon: CheckSquare },
  { href: "/reminders", label: "Erinnerungen", icon: Bell },
  { href: "/duplicates", label: "Duplikate", icon: ScanSearch },
];


export function Sidebar() {
  return (
    <Suspense>
      <SidebarContent />
    </Suspense>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeViewId = searchParams.get("view");

  const branding = useBranding();
  const [views, setViews] = useState<SavedView[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  // Project mode: replaces the normal nav with the list of projects
  const [projectMode, setProjectMode] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/saved-views")
      .then((r) => r.json())
      .then(setViews)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/documents?trashed=true&limit=1")
      .then((r) => r.json())
      .then((data) => setTrashCount(data.total ?? 0))
      .catch(() => {});
  }, [pathname]);

  // Poll pending reminders count every 60 seconds
  useEffect(() => {
    function fetchPending() {
      fetch("/api/reminders/pending")
        .then((r) => r.json())
        .then((data) => setReminderCount(data.count ?? 0))
        .catch(() => {});
    }
    fetchPending();
    const interval = setInterval(fetchPending, 60_000);
    return () => clearInterval(interval);
  }, [pathname]);

  // Listen for custom event when a view is saved
  useEffect(() => {
    function onViewsChanged() {
      fetch("/api/saved-views")
        .then((r) => r.json())
        .then(setViews)
        .catch(() => {});
    }
    window.addEventListener("saved-views-changed", onViewsChanged);
    return () => window.removeEventListener("saved-views-changed", onViewsChanged);
  }, []);

  function fetchProjects() {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }

  // Refresh project list/counts when entering project mode and whenever a
  // document is moved into/out of a project (drag-drop or bulk move).
  useEffect(() => {
    if (!projectMode) return;
    fetchProjects();
    function onMoved() {
      fetchProjects();
    }
    window.addEventListener("documind-doc-moved", onMoved);
    return () => window.removeEventListener("documind-doc-moved", onMoved);
  }, [projectMode]);

  async function handleDeleteView(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
    setViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) {
      router.push("/");
    }
  }

  async function handleCreateProject() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Projekt konnte nicht erstellt werden");
      setProjects((prev) =>
        [...prev, data as ProjectItem].sort((a, b) => a.name.localeCompare(b.name, "de"))
      );
      setNewName("");
      setCreateOpen(false);
      toast.success("Projekt erstellt");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDropOnProject(e: React.DragEvent, projectId: string) {
    e.preventDefault();
    setDragOverId(null);
    const docId = e.dataTransfer.getData(DOC_DRAG_TYPE);
    if (!docId) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error("Verschieben fehlgeschlagen");
      toast.success("Dokument ins Projekt verschoben");
      window.dispatchEvent(new CustomEvent("documind-doc-moved"));
      fetchProjects();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.trim().toLowerCase())
  );

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        {branding.hasLogo ? (
          <img
            src="/api/branding/logo"
            alt={branding.appName}
            className="h-8 w-8 rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
        <span className="text-lg font-semibold">{branding.appName}</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-3">
        {projectMode ? (
          /* ---------- Project mode: list of projects ---------- */
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => setProjectMode(false)}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Zurück
              </Button>
              <span className="text-sm font-semibold">Projekte</span>
            </div>

            {/* Search projects */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Projekte filtern..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>

            {/* New project */}
            <Button
              variant="outline"
              size="sm"
              className="mb-3 w-full justify-start"
              onClick={() => {
                setNewName("");
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Neues Projekt
            </Button>

            {/* Project list (drop targets) */}
            <nav className="space-y-0.5">
              {filteredProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverId !== project.id) setDragOverId(project.id);
                  }}
                  onDragLeave={() => setDragOverId((cur) => (cur === project.id ? null : cur))}
                  onDrop={(e) => handleDropOnProject(e, project.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    pathname === `/projects/${project.id}`
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    dragOverId === project.id &&
                      "ring-2 ring-primary ring-inset bg-primary/10 text-primary"
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                  <span className="truncate flex-1">{project.name}</span>
                  {project.documentCount > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                      {project.documentCount}
                    </span>
                  )}
                </Link>
              ))}

              {filteredProjects.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {projects.length === 0
                    ? "Noch keine Projekte. Lege dein erstes Projekt an."
                    : "Keine Projekte gefunden."}
                </p>
              )}
            </nav>

            <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted-foreground">
              Ziehe Dokumente aus der Dokumentenliste auf ein Projekt, um sie dorthin zu
              verschieben.
            </p>
          </div>
        ) : (
          /* ---------- Normal navigation ---------- */
          <>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isReminders = item.href === "/reminders";
                return (
                  <Fragment key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        pathname === item.href && !activeViewId
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {isReminders && reminderCount > 0 && (
                        <span className="rounded-full bg-red-500 text-white px-1.5 py-0.5 text-xs font-medium leading-none">
                          {reminderCount}
                        </span>
                      )}
                    </Link>

                    {/* Projekte — toggles the sidebar into project mode (no navigation) */}
                    {item.href === "/documents" && (
                      <button
                        type="button"
                        onClick={() => setProjectMode(true)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          pathname.startsWith("/projects")
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Folders className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">Projekte</span>
                      </button>
                    )}
                  </Fragment>
                );
              })}

              {/* Papierkorb */}
              <Link
                href="/trash"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === "/trash"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Trash2 className="h-4 w-4" />
                <span className="flex-1">Papierkorb</span>
                {trashCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {trashCount}
                  </span>
                )}
              </Link>
            </nav>

            {/* Saved Views / Smart Folders */}
            {views.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="mb-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ansichten
                </p>
                <nav className="space-y-0.5">
                  {views.map((view) => (
                    <Link
                      key={view.id}
                      href={`/documents?view=${view.id}`}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        activeViewId === view.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{view.name}</span>
                      {view.count !== undefined && view.count > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium group-hover:hidden">
                          {view.count}
                        </span>
                      )}
                      <button
                        onClick={(e) => handleDeleteView(e, view.id)}
                        className="hidden group-hover:flex h-4 w-4 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Link>
                  ))}
                </nav>
              </>
            )}

            <Separator className="my-3" />

            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                pathname === "/settings"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Settings className="h-4 w-4" />
              Einstellungen
            </Link>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Abmelden
        </Button>
        <ThemeToggle />
      </div>

      {/* Create project dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Neues Projekt
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Projektname</label>
            <Input
              className="mt-1"
              placeholder="z.B. Arzt, Arbeitgeber, Steuer 2026..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) handleCreateProject();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateProject} disabled={creating || !newName.trim()}>
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
