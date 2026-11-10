"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  CheckSquare,
  FileText,
  Folders,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Always visible in the bottom bar.
const primaryItems: NavItem[] = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/documents", label: "Dokumente", icon: FileText },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Suche", icon: Search },
];

// Everything else the desktop sidebar offers, reachable through "Mehr".
const moreItems: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/contracts", label: "Verträge", icon: ShieldCheck },
  { href: "/todos", label: "Aufgaben", icon: CheckSquare },
  { href: "/reminders", label: "Erinnerungen", icon: Bell },
  { href: "/projects", label: "Projekte", icon: Folders },
  { href: "/duplicates", label: "Duplikate", icon: ScanSearch },
  { href: "/trash", label: "Papierkorb", icon: Trash2 },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // The theme is only known in the browser; rendering it during server
  // rendering would not match the markup. False on the server, true after.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [reminderCount, setReminderCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);

  useEffect(() => {
    fetch("/api/reminders/pending")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.count === "number") setReminderCount(data.count);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/documents?trashed=true&limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.total === "number") setTrashCount(data.total);
      })
      .catch(() => {});
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isDark = mounted && resolvedTheme === "dark";
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));
  const badges: Record<string, number> = {
    "/reminders": reminderCount,
    "/trash": trashCount,
  };

  return (
    <>
      <nav
        aria-label="Hauptnavigation"
        // h-16 matches the pb-16 the page layouts reserve and the offset of the bulk bar
        className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t bg-card md:hidden"
      >
        <div className="grid h-full grid-cols-5 items-center">
          {primaryItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 px-1 py-1 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 px-1 py-1 text-xs transition-colors",
              moreActive || open ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className="relative">
              <Menu className="h-5 w-5" />
              {reminderCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500"
                  aria-label={`${reminderCount} fällige Erinnerungen`}
                />
              )}
            </span>
            <span className="max-w-full truncate">Mehr</span>
          </button>
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-6 md:hidden">
          <SheetHeader className="pb-0">
            <SheetTitle>Mehr</SheetTitle>
            <SheetDescription className="sr-only">
              Weitere Bereiche, Design und Abmelden
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-4 gap-1 px-3">
            {moreItems.map((item) => {
              const active = isActive(pathname, item.href);
              const badge = badges[item.href] ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-xs transition-colors",
                    active ? "bg-accent text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className="relative">
                    <item.icon className="h-5 w-5" />
                    {badge > 0 && (
                      <span
                        className={cn(
                          "absolute -right-3 -top-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4",
                          item.href === "/reminders"
                            ? "bg-red-500 text-white"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mx-4 flex gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? "Helles Design" : "Dunkles Design"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
