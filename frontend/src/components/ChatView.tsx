import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Code2,
  Eye,
  Loader2,
  Send,
  Square,
  Terminal,
  XCircle,
} from "lucide-react";
import type { WSMessage } from "../hooks/useWebSocket";

interface AgentMsg {
  role: string;
  content: string;
  tool_calls?: {
    tool: string;
    args: Record<string, unknown>;
    result: string | null;
    success: boolean;
  }[];
  iteration?: number;
}

interface ChatViewProps {
  messages: WSMessage[];
  connected: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  isRunning: boolean;
}

const ROLE_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode; bg: string }
> = {
  user: {
    label: "You",
    color: "text-blue-400",
    icon: <Terminal size={14} />,
    bg: "border-blue-500/20",
  },
  planner: {
    label: "Planner",
    color: "text-purple-400",
    icon: <Brain size={14} />,
    bg: "border-purple-500/20",
  },
  executor: {
    label: "Executor",
    color: "text-emerald-400",
    icon: <Code2 size={14} />,
    bg: "border-emerald-500/20",
  },
  reviewer: {
    label: "Reviewer",
    color: "text-amber-400",
    icon: <Eye size={14} />,
    bg: "border-amber-500/20",
  },
  system: {
    label: "System",
    color: "text-slate-400",
    icon: <CheckCircle2 size={14} />,
    bg: "border-slate-500/20",
  },
};

export default function ChatView({
  messages,
  connected,
  onSend,
  onStop,
  isRunning,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Parse agent messages from WS messages
  const agentMessages: AgentMsg[] = messages
    .filter((m) => m.type === "message")
    .map((m) => m.data as unknown as AgentMsg);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 animate-pulse-slow" : "bg-red-400"
            }`}
          />
          <span className="text-sm text-slate-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {isRunning && (
          <div className="ml-auto flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400" />
            <span className="text-xs text-blue-400">Agent working...</span>
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs transition-colors"
            >
              <Square size={10} /> Stop
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {agentMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/5 flex items-center justify-center mb-6">
              <Brain size={36} className="text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold text-gradient mb-2">
              TriMind Agent
            </h2>
            <p className="text-sm text-slate-500 max-w-md">
              3 AI models working in symbiosis. Describe your project and I'll
              plan, code, review, and test until it works perfectly.
            </p>
            <div className="flex gap-3 mt-6">
              {["Planner", "Executor", "Reviewer"].map((role, i) => (
                <div
                  key={role}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    i === 0
                      ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                      : i === 1
                      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                  }`}
                >
                  {role}
                </div>
              ))}
            </div>
          </div>
        )}

        {agentMessages.map((msg, idx) => {
          const cfg = ROLE_CONFIG[msg.role] || ROLE_CONFIG.system;
          return (
            <div
              key={idx}
              className={`glass-light rounded-xl p-4 border-l-2 ${cfg.bg} transition-all`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label}
                </span>
                {msg.iteration !== undefined && msg.iteration > 0 && (
                  <span className="text-xs text-slate-600 ml-auto">
                    iter #{msg.iteration}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>

              {/* Tool calls */}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.tool_calls.map((tc, tci) => (
                    <div
                      key={tci}
                      className="rounded-lg bg-black/30 border border-white/5 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5">
                        <Terminal size={12} className="text-slate-500" />
                        <span className="text-xs font-mono text-slate-400">
                          {tc.tool}
                        </span>
                        {tc.success ? (
                          <CheckCircle2
                            size={12}
                            className="ml-auto text-emerald-400"
                          />
                        ) : (
                          <XCircle
                            size={12}
                            className="ml-auto text-red-400"
                          />
                        )}
                      </div>
                      {tc.result && (
                        <pre className="px-3 py-2 text-xs text-slate-400 overflow-x-auto max-h-48 font-mono">
                          {tc.result}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex items-end gap-3 glass rounded-xl p-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your project... (Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 resize-none outline-none max-h-32"
            style={{ minHeight: "24px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !connected}
            className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-30 transition-opacity flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
