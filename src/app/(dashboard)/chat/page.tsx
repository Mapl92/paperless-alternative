"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@/lib/hooks/use-chat";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput } from "@/components/chat/chat-input";
import { ConversationList } from "@/components/chat/conversation-list";
import { NewChat } from "@/components/chat/new-chat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu, MessageCircle } from "lucide-react";

interface ConversationSummary {
  id: string;
  title: string;
  documentScope: string;
  updatedAt: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchNewDocs, setSearchNewDocs] = useState(false);

  const {
    messages,
    isStreaming,
    error,
    pinnedDocIds,
    excludedDocIds,
    sendMessage,
    loadConversation,
    stopStreaming,
    toggleDocExcluded,
  } = useChat(activeId);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      setConversations(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  async function handleNewChat() {
    setActiveId(null);
    setShowNewChat(true);
    setSidebarOpen(false);
    setSearchNewDocs(false);
  }

  async function handleSelectConversation(id: string) {
    setActiveId(id);
    setShowNewChat(false);
    setSidebarOpen(false);
    setSearchNewDocs(false);
    await loadConversation(id);
  }

  async function handleDeleteConversation(id: string) {
    await fetch(`/api/chat/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setShowNewChat(true);
    }
  }

  async function handleStartChat(
    scope: "all" | "selected",
    selectedIds?: string[]
  ) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentScope: scope,
          selectedDocumentIds: selectedIds,
        }),
      });
      const conv = await res.json();
      setActiveId(conv.id);
      setShowNewChat(false);
      setSearchNewDocs(false);
      await fetchConversations();
    } catch {
      // ignore
    }
  }

  async function handleSendMessage(content: string) {
    const titleUpdate = await sendMessage(content, searchNewDocs);
    // Reset search toggle after sending
    setSearchNewDocs(false);
    if (titleUpdate) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, title: titleUpdate } : c
        )
      );
    }
    fetchConversations();
  }

  const hasPinnedDocs = pinnedDocIds.length > 0;

  const sidebarContent = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelectConversation}
      onDelete={handleDeleteConversation}
      onNew={handleNewChat}
    />
  );

  return (
    <div className="absolute inset-0 bottom-16 md:bottom-0 flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 border-r flex-col shrink-0 relative z-10">
        {sidebarContent}
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden shrink-0">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Chat-Verlauf</SheetTitle>
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <MessageCircle className="h-4 w-4 text-primary shrink-0" />
          <h1 className="font-semibold truncate text-sm">
            {showNewChat
              ? "Neuer Chat"
              : conversations.find((c) => c.id === activeId)?.title || "Chat"}
          </h1>
        </div>

        {showNewChat ? (
          <NewChat onStart={handleStartChat} />
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isStreaming={isStreaming}
              excludedDocIds={excludedDocIds}
              onToggleDoc={toggleDocExcluded}
            />
            {error && (
              <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm text-center shrink-0">
                {error}
              </div>
            )}
            <ChatInput
              onSend={handleSendMessage}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              showSearchToggle={hasPinnedDocs}
              searchNewDocs={searchNewDocs}
              onSearchNewDocsChange={setSearchNewDocs}
            />
          </>
        )}
      </div>
    </div>
  );
}
