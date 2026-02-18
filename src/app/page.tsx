"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckSquare,
  FileText,
  Loader2,
  Tag,
  Upload,
  User,
} from "lucide-react";
import { getPriority } from "@/lib/constants/todo";

interface DashboardData {
  stats: {
    documents: number;
    tags: number;
    correspondents: number;
    unprocessed: number;
    todosOpen: number;
  };
  monthlyTrend: Array<{ month: string; label: string; count: number }>;
  recentDocuments: Array<{
    id: string;
    title: string;
    thumbnailFile: string | null;
    documentDate: string | null;
    createdAt: string;
    correspondent: { name: string } | null;
    documentType: { name: string } | null;
  }>;
  urgentTodos: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    priority: number;
    document: { id: string; title: string } | null;
  }>;
  needsAttention: Array<{
    id: string;
    title: string;
    thumbnailFile: string | null;
    documentDate: string | null;
    createdAt: string;
    documentType: { name: string } | null;
  }>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

function formatDueDate(dueDate: string | null): { label: string; color: string } {
  if (!dueDate) return { label: "", color: "" };
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}T überfällig`, color: "bg-red-100 text-red-700 border-red-200" };
  if (diffDays === 0) return { label: "Heute", color: "bg-orange-100 text-orange-700 border-orange-200" };
  if (diffDays === 1) return { label: "Morgen", color: "bg-orange-100 text-orange-700 border-orange-200" };
  return { label: `In ${diffDays} Tagen`, color: "bg-yellow-100 text-yellow-700 border-yellow-200" };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const maxTrend = data ? Math.max(...data.monthlyTrend.map((m) => m.count), 1) : 1;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{getGreeting()}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Hier ist deine Dokumenten-Übersicht
              </p>
            </div>
            <Button asChild>
              <Link href="/upload">
                <Upload className="mr-2 h-4 w-4" />
                Hochladen
              </Link>
            </Button>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/documents">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Dokumente</span>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">{data?.stats.documents ?? 0}</p>
                  )}
                  {!loading && (data?.stats.unprocessed ?? 0) > 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      {data?.stats.unprocessed} in Verarbeitung
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Link href="/documents">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Tags</span>
                    <Tag className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">{data?.stats.tags ?? 0}</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Link href="/documents">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Korrespondenten</span>
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">{data?.stats.correspondents ?? 0}</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Link href="/todos">
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Offene Todos</span>
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">{data?.stats.todosOpen ?? 0}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Trend + Todos Row */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Monthly Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Dokumente pro Monat
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2 h-24">
                      {[40, 70, 20, 55, 35, 90].map((h, i) => (
                        <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="flex-1 h-3" />
                      ))}
                    </div>
                  </div>
                ) : (() => {
                  const CHART_H = 96; // px — fixed chart area height
                  const currentMonth = new Date().toISOString().slice(0, 7);
                  return (
                    <div className="space-y-1">
                      {/* Count labels above bars */}
                      <div className="flex gap-2">
                        {data!.monthlyTrend.map((m) => (
                          <div key={m.month} className="flex-1 text-center">
                            <span className="text-[11px] font-medium text-foreground">
                              {m.count > 0 ? m.count : ""}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Bars — fixed pixel height, aligned to bottom */}
                      <div
                        className="flex items-end gap-2 border-b border-muted"
                        style={{ height: `${CHART_H}px` }}
                      >
                        {data!.monthlyTrend.map((m) => {
                          const barH = maxTrend > 0
                            ? Math.max((m.count / maxTrend) * CHART_H, m.count > 0 ? 4 : 0)
                            : 0;
                          const isCurrent = m.month === currentMonth;
                          return (
                            <div
                              key={m.month}
                              className={`flex-1 rounded-t transition-all ${
                                isCurrent ? "bg-primary" : "bg-primary/35"
                              }`}
                              style={{ height: `${barH}px` }}
                            />
                          );
                        })}
                      </div>

                      {/* Month labels below bars */}
                      <div className="flex gap-2 pt-1">
                        {data!.monthlyTrend.map((m) => {
                          const isCurrent = m.month === new Date().toISOString().slice(0, 7);
                          return (
                            <div key={m.month} className="flex-1 text-center">
                              <span className={`text-[11px] ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                                {m.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Urgent Todos */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Fällige Aufgaben
                </CardTitle>
                <Link href="/todos" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Alle <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !data?.urgentTodos.length ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <CheckSquare className="h-8 w-8 text-green-500 mb-2" />
                    <p className="text-sm text-muted-foreground">Keine fälligen Aufgaben</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.urgentTodos.map((todo) => {
                      const prio = getPriority(todo.priority);
                      const due = formatDueDate(todo.dueDate);
                      return (
                        <div key={todo.id} className="flex items-start gap-2 rounded-lg border p-2.5">
                          <span className={`text-[10px] font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded ${prio.bg} ${prio.color}`}>
                            {prio.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{todo.title}</p>
                            {todo.document && (
                              <p className="text-xs text-muted-foreground truncate">
                                {todo.document.title}
                              </p>
                            )}
                          </div>
                          {due.label && (
                            <span className={`text-[10px] border rounded px-1.5 py-0.5 shrink-0 font-medium ${due.color}`}>
                              {due.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Documents */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Zuletzt hinzugefügt
              </CardTitle>
              <Link href="/documents" className="text-xs text-primary hover:underline flex items-center gap-1">
                Alle Dokumente <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : !data?.recentDocuments.length ? (
                <div className="text-center py-8">
                  <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Noch keine Dokumente</p>
                  <Button asChild size="sm" className="mt-3">
                    <Link href="/upload">Erstes Dokument hochladen</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {data.recentDocuments.map((doc) => {
                    const date = doc.documentDate || doc.createdAt;
                    return (
                      <Link key={doc.id} href={`/documents/${doc.id}`} className="group block">
                        <div className="aspect-[3/4] rounded-lg bg-muted overflow-hidden mb-2 ring-0 group-hover:ring-2 group-hover:ring-primary/30 transition-all">
                          {doc.thumbnailFile ? (
                            <img
                              src={`/api/documents/${doc.id}/file?type=thumbnail`}
                              alt={doc.title}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <FileText className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-medium line-clamp-2 leading-tight">{doc.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(date).toLocaleDateString("de-DE")}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Needs Attention */}
          {!loading && (data?.needsAttention.length ?? 0) > 0 && (
            <Card className="border-orange-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Aufmerksamkeit benötigt
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">(ohne Tags & Korrespondent)</span>
                </div>
                <Link href="/documents" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Alle <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {data!.needsAttention.map((doc) => {
                    const date = doc.documentDate || doc.createdAt;
                    return (
                      <Link key={doc.id} href={`/documents/${doc.id}`} className="group block">
                        <div className="aspect-[3/4] rounded-lg bg-muted overflow-hidden mb-2 ring-0 group-hover:ring-2 group-hover:ring-orange-400/50 transition-all border border-orange-200/60">
                          {doc.thumbnailFile ? (
                            <img
                              src={`/api/documents/${doc.id}/file?type=thumbnail`}
                              alt={doc.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <FileText className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-medium line-clamp-2 leading-tight">{doc.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(date).toLocaleDateString("de-DE")}
                        </p>
                        {doc.documentType && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 mt-1">
                            {doc.documentType.name}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </main>

      <MobileNav />
    </div>
  );
}
