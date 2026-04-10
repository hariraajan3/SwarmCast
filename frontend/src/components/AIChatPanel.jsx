import React, { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";

const AIChatPanel = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text: "Hello! I'm your weather assistant. Ask me about weather predictions, specific locations, or network insights."
    }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    // Add user message
    setMessages([...messages, { role: "user", text: input }]);
    
    // Placeholder AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "AI chat support is coming soon! This feature will provide weather predictions and visualize them on the map."
        }
      ]);
    }, 500);

    setInput("");
  };

  // Note: Visibility and sliding is handled by the parent container in App.jsx
  // but we keep the internal structure clean.

  return (
    <div 
      className="w-85 border-l border-[var(--border-subtle)] bg-[var(--bg-glass)] backdrop-blur-xl flex flex-col h-full shadow-2xl"
    >
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[var(--accent-cyan)]" />
          <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)] uppercase font-sans">
            AI Assistant
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          aria-label="Close AI panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] p-3.5 text-[0.75rem] leading-relaxed rounded-2xl ${
                msg.role === "user"
                  ? "bg-[var(--accent-cyan)] text-white rounded-br-none shadow-lg shadow-cyan-500/10"
                  : "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-bl-none shadow-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask SwarmCast AI..."
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] px-4 py-2.5 text-[0.75rem] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20 focus:border-[var(--accent-cyan)] transition-all placeholder-[var(--text-muted)]"
          />
          <button
            onClick={handleSend}
            className="group bg-[var(--accent-cyan)] text-white p-2.5 rounded-xl hover:bg-[var(--accent-cyan)]/90 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
          >
            <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
