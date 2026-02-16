"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SendHorizonal, Square, Search } from "lucide-react";

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  showSearchToggle?: boolean;
  searchNewDocs?: boolean;
  onSearchNewDocsChange?: (v: boolean) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  showSearchToggle,
  searchNewDocs,
  onSearchNewDocsChange,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t bg-card p-2 md:p-4 shrink-0">
      <div className="max-w-3xl mx-auto">
        {showSearchToggle && (
          <label className="flex items-center gap-2 mb-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={searchNewDocs ?? false}
              onChange={(e) => onSearchNewDocsChange?.(e.target.checked)}
              className="rounded border-muted-foreground/30"
            />
            <Search className="h-3 w-3" />
            Neue Dokumente suchen
          </label>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht eingeben..."
            disabled={isStreaming || disabled}
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 md:px-4 md:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={onStop}
              className="h-11 w-11 shrink-0"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className="h-11 w-11 shrink-0"
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
