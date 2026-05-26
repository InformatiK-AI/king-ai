// Client component — React with EventSource for SSE
// Template generado por /ai-feature-scaffold — adaptar estilos según tu design system
"use client";

import { useState, useRef, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatComponentProps {
  apiEndpoint?: string;
  placeholder?: string;
  title?: string;
}

export function ChatComponent({
  apiEndpoint = "/api/chat",
  placeholder = "Type your message...",
  title = "AI Assistant",
}: ChatComponentProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsStreaming(true);

    // Create assistant message placeholder for streaming
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "delta" && parsed.text) {
              // Accumulate streaming chunks into the assistant message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.text }
                    : m,
                ),
              );
            } else if (parsed.type === "error") {
              setError(parsed.message ?? "An error occurred");
            }
          } catch {
            // Ignore malformed SSE chunks
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled
      setError("Connection error. Please try again.");
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, messages, apiEndpoint]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "600px", maxWidth: "800px", margin: "0 auto", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
        {title}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", marginTop: "40px" }}>
            Start a conversation
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "12px 16px",
              borderRadius: "8px",
              background: msg.role === "user" ? "#3b82f6" : "#f3f4f6",
              color: msg.role === "user" ? "#fff" : "#111827",
            }}
          >
            {msg.content || (isStreaming && msg.role === "assistant" ? "▋" : "")}
          </div>
        ))}
        {error && (
          <div style={{ color: "#dc2626", fontSize: "14px", textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming}
          rows={2}
          style={{ flex: 1, resize: "none", padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
        />
        {isStreaming ? (
          <button
            onClick={stopStreaming}
            style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", opacity: !input.trim() ? 0.5 : 1 }}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
