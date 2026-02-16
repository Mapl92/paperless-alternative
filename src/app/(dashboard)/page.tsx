"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DocumentGrid } from "@/components/documents/document-grid";
import { FilterSidebar } from "@/components/documents/filter-sidebar";
import { DateFilterBar } from "@/components/documents/date-filter-bar";
import { Bookmark, Search } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { toast } from "sonner";
import type { DateField, DatePreset } from "@/components/documents/filter-sidebar";

function resolveDatePreset(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(today.getTime() + 86400000 - 1);
  switch (preset) {
    case "today":
      return { from: today, to: endOfDay };
    case "yesterday": {
      const y = new Date(today.getTime() - 86400000);
      return { from: y, to: new Date(y.getTime() + 86400000 - 1) };
    }
    case "last7days":
      return { from: new Date(today.getTime() - 6 * 86400000), to: endOfDay };
    case "last30days":
      return { from: new Date(today.getTime() - 29 * 86400000), to: endOfDay };
    case "thisYear":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay };
  }
}

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Neueste zuerst" },
  { value: "createdAt:asc", label: "Älteste zuerst" },
  { value: "title:asc", label: "Titel A–Z" },
  { value: "title:desc", label: "Titel Z–A" },
  { value: "documentDate:desc", label: "Datum (neueste)" },
  { value: "documentDate:asc", label: "Datum (älteste)" },
] as const;

interface SavedViewData {
  id: string;
  name: string;
  filters: {
    search?: string;
    tagId?: string;
    correspondentId?: string;
    documentTypeId?: string;
    dateField?: DateField;
    datePreset?: DatePreset;
    dateFrom?: string;
    dateTo?: string;
  };
  sortField: string;
  sortOrder: string;
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const viewId = searchParams.get("view");

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [tagId, setTagId] = useState<string | undefined>();
  const [correspondentId, setCorrespondentId] = useState<string | undefined>();
  const [documentTypeId, setDocumentTypeId] = useState<string | undefined>();
  const [sort, setSort] = useState("createdAt:desc");
  const [dateField, setDateField] = useState<DateField>("documentDate");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [datePreset, setDatePreset] = useState<DatePreset | undefined>();

  const [sortField, sortOrder] = sort.split(":");

  // Compute effective date range (preset takes priority)
  const effectiveDates = datePreset ? resolveDatePreset(datePreset) : { from: dateFrom, to: dateTo };
  const documentDateFrom = dateField === "documentDate" && effectiveDates.from ? effectiveDates.from.toISOString() : undefined;
  const documentDateTo = dateField === "documentDate" && effectiveDates.to ? effectiveDates.to.toISOString() : undefined;
  const addedDateFrom = dateField === "addedAt" && effectiveDates.from ? effectiveDates.from.toISOString() : undefined;
  const addedDateTo = dateField === "addedAt" && effectiveDates.to ? effectiveDates.to.toISOString() : undefined;

  // Save view popover
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Load saved view when ?view= changes
  useEffect(() => {
    if (!viewId) return;
    fetch(`/api/saved-views`)
      .then((r) => r.json())
      .then((views: SavedViewData[]) => {
        const view = views.find((v) => v.id === viewId);
        if (!view) return;
        applyView(view);
      })
      .catch(() => {});
  }, [viewId]);

  function applyView(view: SavedViewData) {
    const f = view.filters;
    setSearchInput(f.search ?? "");
    setTagId(f.tagId ?? undefined);
    setCorrespondentId(f.correspondentId ?? undefined);
    setDocumentTypeId(f.documentTypeId ?? undefined);
    setSort(`${view.sortField}:${view.sortOrder}`);
    setDateField(f.dateField ?? "documentDate");
    if (f.datePreset) {
      setDatePreset(f.datePreset);
      setDateFrom(undefined);
      setDateTo(undefined);
    } else {
      setDatePreset(undefined);
      setDateFrom(f.dateFrom ? new Date(f.dateFrom) : undefined);
      setDateTo(f.dateTo ? new Date(f.dateTo) : undefined);
    }
  }

  async function handleSaveView() {
    if (!saveName.trim()) return;

    const filters: Record<string, string> = {};
    if (searchInput) filters.search = searchInput;
    if (tagId) filters.tagId = tagId;
    if (correspondentId) filters.correspondentId = correspondentId;
    if (documentTypeId) filters.documentTypeId = documentTypeId;
    if (dateFrom || dateTo || datePreset) filters.dateField = dateField;
    if (datePreset) {
      filters.datePreset = datePreset;
    } else {
      if (dateFrom) filters.dateFrom = dateFrom.toISOString();
      if (dateTo) filters.dateTo = dateTo.toISOString();
    }

    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: saveName.trim(),
        filters,
        sortField,
        sortOrder,
      }),
    });

    if (res.ok) {
      toast.success("Ansicht gespeichert");
      setSaveName("");
      setSaveOpen(false);
      window.dispatchEvent(new Event("saved-views-changed"));
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Fehler beim Speichern");
    }
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Dokumente</h1>
        <div className="flex gap-3 items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Dokumente durchsuchen..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" title="Ansicht speichern">
                <Bookmark className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <p className="text-sm font-medium">Ansicht speichern</p>
                <Input
                  ref={saveInputRef}
                  placeholder="Name der Ansicht..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveView();
                  }}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleSaveView}
                  disabled={!saveName.trim()}
                >
                  Speichern
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Date Filter Bar */}
        <DateFilterBar
          dateField={dateField}
          onDateFieldChange={setDateField}
          dateFrom={datePreset ? resolveDatePreset(datePreset).from : dateFrom}
          dateTo={datePreset ? resolveDatePreset(datePreset).to : dateTo}
          datePreset={datePreset}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onDatePresetChange={setDatePreset}
        />
      </div>

      {/* Content with sidebar */}
      <div className="flex gap-6">
        <FilterSidebar
          selectedTagId={tagId}
          selectedCorrespondentId={correspondentId}
          selectedDocumentTypeId={documentTypeId}
          onTagSelect={setTagId}
          onCorrespondentSelect={setCorrespondentId}
          onDocumentTypeSelect={setDocumentTypeId}
          onApplyView={applyView}
        />

        <div className="flex-1 min-w-0">
          <DocumentGrid
            search={search}
            tagId={tagId}
            correspondentId={correspondentId}
            documentTypeId={documentTypeId}
            sortField={sortField}
            sortOrder={sortOrder}
            documentDateFrom={documentDateFrom}
            documentDateTo={documentDateTo}
            addedDateFrom={addedDateFrom}
            addedDateTo={addedDateTo}
          />
        </div>
      </div>
    </div>
  );
}
