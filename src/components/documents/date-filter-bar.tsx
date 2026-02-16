"use client";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { de } from "react-day-picker/locale";
import type { DateField, DatePreset } from "./filter-sidebar";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Heute" },
  { key: "yesterday", label: "Gestern" },
  { key: "last7days", label: "Letzte 7 Tage" },
  { key: "last30days", label: "Letzte 30 Tage" },
  { key: "thisYear", label: "Dieses Jahr" },
];

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface DateFilterBarProps {
  dateField: DateField;
  onDateFieldChange: (field: DateField) => void;
  dateFrom?: Date;
  dateTo?: Date;
  datePreset?: DatePreset;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onDatePresetChange: (preset: DatePreset | undefined) => void;
}

export function DateFilterBar({
  dateField,
  onDateFieldChange,
  dateFrom,
  dateTo,
  datePreset,
  onDateFromChange,
  onDateToChange,
  onDatePresetChange,
}: DateFilterBarProps) {
  const hasDateFilter = dateFrom || dateTo || datePreset;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Date field toggle */}
      <div className="flex rounded-md border text-xs">
        <button
          onClick={() => onDateFieldChange("documentDate")}
          className={cn(
            "px-2.5 py-1 rounded-l-md transition-colors",
            dateField === "documentDate"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
        >
          Dokumentdatum
        </button>
        <button
          onClick={() => onDateFieldChange("addedAt")}
          className={cn(
            "px-2.5 py-1 rounded-r-md transition-colors",
            dateField === "addedAt"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
        >
          Hinzugefügt
        </button>
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-border" />

      {/* Preset chips */}
      {DATE_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => {
            if (datePreset === p.key) {
              onDatePresetChange(undefined);
            } else {
              onDatePresetChange(p.key);
            }
          }}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs border transition-colors whitespace-nowrap",
            datePreset === p.key
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted border-border"
          )}
        >
          {p.label}
        </button>
      ))}

      {/* Separator */}
      <div className="h-6 w-px bg-border" />

      {/* From date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "text-xs gap-1.5",
              dateFrom && !datePreset && "text-primary border-primary/50"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateFrom ? formatDate(dateFrom) : "Von"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateFrom}
            onSelect={(d) => {
              onDateFromChange(d);
              if (d) onDatePresetChange(undefined);
            }}
            locale={de}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* To date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "text-xs gap-1.5",
              dateTo && !datePreset && "text-primary border-primary/50"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateTo ? formatDate(dateTo) : "Bis"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateTo}
            onSelect={(d) => {
              onDateToChange(d);
              if (d) onDatePresetChange(undefined);
            }}
            locale={de}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Clear */}
      {hasDateFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-8 px-2"
          onClick={() => {
            onDateFromChange(undefined);
            onDateToChange(undefined);
            onDatePresetChange(undefined);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
