"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CheckSquare, Home, Upload, Search, Settings, MessageCircle } from "lucide-react";

const items = [
  { href: "/", label: "Dokumente", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Suche", icon: Search },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/todos", label: "Aufgaben", icon: CheckSquare },
  { href: "/settings", label: "Mehr", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden">
      <div className="flex items-center justify-around py-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors",
              pathname === item.href
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
