"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ReferencedDocuments } from "./referenced-documents";
import { User, Bot, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/hooks/use-chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  excludedDocIds?: Set<string>;
  onToggleDoc?: (docId: string) => void;
}

export function ChatMessages({ messages, isStreaming, excludedDocIds, onToggleDoc }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Stelle eine Frage zu deinen Dokumenten</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
            )}

            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 max-w-[85%]",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {msg.role === "assistant" ? (
                <>
                  {msg.content ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  {msg.referencedDocuments && msg.referencedDocuments.length > 0 && (
                    <ReferencedDocuments
                      documents={msg.referencedDocuments}
                      onToggle={onToggleDoc}
                      excludedIds={excludedDocIds}
                    />
                  )}
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>

            {msg.role === "user" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center mt-0.5">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
