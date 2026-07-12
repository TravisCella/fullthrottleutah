'use client';

import { useState, useRef, useEffect } from "react";

// NOTE: The assistant's system prompt (business context, pricing, policies) is
// owned and enforced SERVER-SIDE in app/api/chat/route.js. It intentionally does
// NOT live here anymore — keeping it off the client prevents it from shipping in
// the browser bundle and stops the endpoint from being repurposed as a general
// LLM. When fleet/pricing/policy copy changes, update it in the route.

export default function FullThrottleChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! 👋 I'm the Full Throttle Utah assistant. Ask me anything about our jet ski rentals — pricing, availability, what's included, locations, you name it." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = newMessages
        .filter((m, i) => i > 0)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The system prompt is owned and enforced server-side (app/api/chat/route.js).
          // Sending it from the client would be ignored, so we don't.
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      const assistantText = data.content
        ?.filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n") || "Sorry, I had trouble with that. Try asking again or book directly at fullthrottleutah.com!";

      setMessages(prev => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Oops, I'm having connection issues right now. You can book directly at fullthrottleutah.com or text us for help!"
      }]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const accent = "#D85A30";
  const dark = "#0B1120";
  const chatBg = "#fafaf8";
  const userBubble = "#0C4A6E";
  const botBubble = "#fff";
  const muted = "#8a8880";
  const bdr = "#e8e5de";

  // Floating button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "none",
          background: `linear-gradient(135deg, ${accent}, #c44e28)`,
          color: "#fff",
          fontSize: 26,
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(216,90,48,0.4), 0 2px 8px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          transition: "transform 0.2s, box-shadow 0.2s",
          fontFamily: "system-ui",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(216,90,48,0.5), 0 3px 12px rgba(0,0,0,0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(216,90,48,0.4), 0 2px 8px rgba(0,0,0,0.15)"; }}
      >
        💬
      </button>
    );
  }

  // Chat window
  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      width: 380,
      maxWidth: "calc(100vw - 32px)",
      height: 560,
      maxHeight: "calc(100vh - 40px)",
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: "0 12px 48px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)",
      display: "flex",
      flexDirection: "column",
      zIndex: 9999,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: chatBg,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: dark,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}, #c44e28)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}>
            🏄
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, letterSpacing: "-0.3px" }}>Full Throttle Utah</div>
            <div style={{ color: "#6b7a8d", fontSize: 11 }}>
              {loading ? "Typing..." : "Online — Ask me anything"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "none",
            color: "#8b99ab",
            width: 30,
            height: 30,
            borderRadius: 8,
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            {msg.role === "assistant" && (
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${accent}, #c44e28)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                flexShrink: 0,
                color: "#fff",
                fontWeight: 700,
              }}>
                FT
              </div>
            )}
            <div style={{
              maxWidth: "78%",
              padding: "10px 14px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? userBubble : botBubble,
              color: msg.role === "user" ? "#fff" : "#1a1917",
              fontSize: 13,
              lineHeight: 1.55,
              border: msg.role === "assistant" ? `1px solid ${bdr}` : "none",
              boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
              wordBreak: "break-word",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: `linear-gradient(135deg, ${accent}, #c44e28)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, flexShrink: 0, color: "#fff", fontWeight: 700,
            }}>FT</div>
            <div style={{
              padding: "12px 18px",
              borderRadius: "16px 16px 16px 4px",
              background: botBubble,
              border: `1px solid ${bdr}`,
              display: "flex",
              gap: 5,
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: "50%", background: "#c4c0b8",
                  animation: `ftPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      {messages.length <= 2 && (
        <div style={{
          padding: "0 14px 8px",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}>
          {[
            "What are your prices?",
            "What's included?",
            "Do you deliver?",
            "Which lakes?",
          ].map(q => (
            <button
              key={q}
              onClick={() => { setInput(q); setTimeout(() => { setInput(q); sendMessage(); }, 50); }}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: `1px solid ${bdr}`,
                background: "#fff",
                color: "#555",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 500,
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = "#fef8f5"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = bdr; e.currentTarget.style.background = "#fff"; }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 14px 14px",
        borderTop: `1px solid ${bdr}`,
        background: "#fff",
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about pricing, dates, lakes..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 12,
            border: `1.5px solid ${bdr}`,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
            background: chatBg,
            color: "#1a1917",
            transition: "border-color 0.15s",
          }}
          onFocus={e => e.currentTarget.style.borderColor = accent}
          onBlur={e => e.currentTarget.style.borderColor = bdr}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "none",
            background: input.trim() && !loading ? `linear-gradient(135deg, ${accent}, #c44e28)` : "#ddd",
            color: "#fff",
            fontSize: 18,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
            fontFamily: "inherit",
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes ftPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
