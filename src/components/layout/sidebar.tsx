"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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
  X,
  MessageCircle,
  ScanSearch,
  Trash2,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/lib/hooks/use-branding";

interface SavedView {
  id: string;
  name: string;
  count?: number;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/documents", label: "Dokumente", icon: FileText },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Suche", icon: Search },
  { href: "/chat", label: "Chat", icon: MessageCircle },
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

  async function handleDeleteView(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
    setViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) {
      router.push("/");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        {branding.hasLogo ? (
          <img
            src={`/api/branding/logo?v=${Date.now()}`}
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
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isReminders = item.href === "/reminders";
            return (
              <Link
                key={item.href}
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
              Ordner
            </p>
            <nav className="space-y-0.5">
              {views.map((view) => (
                <Link
                  key={view.id}
                  href={`/?view=${view.id}`}
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
      </ScrollArea>

      {/* Logout */}
      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Abmelden
        </Button>
      </div>
    </aside>
  );
}
