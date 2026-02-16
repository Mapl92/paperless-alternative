"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface RefDocument {
  id: string;
  title: string;
  thumbnailFile: string | null;
  correspondent: { name: string } | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  referencedDocuments?: RefDocument[];
  createdAt: string;
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedDocIds, setPinnedDocIds] = useState<string[]>([]);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Reset all state when conversationId changes (new chat or switching chats)
  useEffect(() => {
    setMessages([]);
    setPinnedDocIds([]);
    setExcludedDocIds(new Set());
    setError(null);
    setIsStreaming(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [conversationId]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/${id}`);
      if (!res.ok) throw new Error("Konversation nicht gefunden");
      const data = await res.json();

      const msgs: ChatMessage[] = data.messages.map(
        (m: {
          id: string;
          role: string;
          content: string;
          referencedDocuments?: RefDocument[];
          createdAt: string;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          referencedDocuments: m.referencedDocuments,
          createdAt: m.createdAt,
        })
      );
      setMessages(msgs);
      setError(null);

      // Derive pinned doc IDs from the first assistant message's referenced documents
      const firstAssistant = msgs.find(
        (m) => m.role === "assistant" && m.referencedDocuments?.length
      );
      if (firstAssistant?.referencedDocuments) {
        setPinnedDocIds(firstAssistant.referencedDocuments.map((d) => d.id));
      }
      setExcludedDocIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, []);

  const toggleDocExcluded = useCallback((docId: string) => {
    setExcludedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string, searchNewDocs?: boolean) => {
      if (!conversationId || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const userMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantMsgId = `temp-assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      let titleUpdate: string | null = null;

      // Build request body with pinning info
      const body: Record<string, unknown> = { content };
      if (pinnedDocIds.length > 0 && !searchNewDocs) {
        body.pinnedDocIds = pinnedDocIds;
        if (excludedDocIds.size > 0) {
          body.excludedDocIds = Array.from(excludedDocIds);
        }
      }
      if (searchNewDocs) {
        body.searchNewDocs = true;
      }

      try {
        const res = await fetch(`/api/chat/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Fehler: ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Kein Response-Body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "refs") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, referencedDocuments: event.documents }
                      : m
                  )
                );
                // Pin docs from first response, or update if searching new
                const newDocIds = (event.documents as RefDocument[]).map((d) => d.id);
                if (pinnedDocIds.length === 0 || searchNewDocs) {
                  setPinnedDocIds(newDocIds);
                  if (searchNewDocs) {
                    setExcludedDocIds(new Set());
                  }
                }
              } else if (event.type === "chunk") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + event.text }
                      : m
                  )
                );
              } else if (event.type === "title") {
                titleUpdate = event.title;
              } else if (event.type === "error") {
                setError(event.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Fehler beim Senden");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }

      return titleUpdate;
    },
    [conversationId, isStreaming, pinnedDocIds, excludedDocIds]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    error,
    pinnedDocIds,
    excludedDocIds,
    sendMessage,
    loadConversation,
    stopStreaming,
    toggleDocExcluded,
    setMessages,
  };
}
