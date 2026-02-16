"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button onClick={onNew} variant="outline" size="sm" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Neuer Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Noch keine Chats
          </p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors cursor-pointer",
                activeId === conv.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate">{conv.title}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {new Date(conv.updatedAt).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="shrink-0 p-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Chat löschen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
