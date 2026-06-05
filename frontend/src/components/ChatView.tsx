import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  FlaskConical,
  Loader2,
  Send,
  Square,
  Terminal,
  XCircle,
} from "lucide-react";
import type { WSMessage } from "../hooks/useWebSocket";
import { api, type OllamaStatus } from "../hooks/useApi";

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
  { label: string; color: string; icon: React.ReactNode; bg: string; gradient: string }
> = {
  user: {
    label: "You",
    color: "text-blue-400",
    icon: <Terminal size={14} />,
    bg: "border-blue-500/20",
    gradient: "from-blue-500/10 to-blue-600/5",
  },
  planner: {
    label: "Planner",
    color: "text-purple-400",
    icon: <Brain size={14} />,
    bg: "border-purple-500/20",
    gradient: "from-purple-500/10 to-purple-600/5",
  },
  executor: {
    label: "Executor",
    color: "text-emerald-400",
    icon: <Code2 size={14} />,
    bg: "border-emerald-500/20",
    gradient: "from-emerald-500/10 to-emerald-600/5",
  },
  reviewer: {
    label: "Reviewer",
    color: "text-amber-400",
    icon: <Eye size={14} />,
    bg: "border-amber-500/20",
    gradient: "from-amber-500/10 to-amber-600/5",
  },
  system: {
    label: "System",
    color: "text-slate-400",
    icon: <CheckCircle2 size={14} />,
    bg: "border-slate-500/20",
    gradient: "from-slate-500/10 to-slate-600/5",
  },
};

const PHASE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  planning: { label: "Planning", color: "text-purple-400", icon: <Brain size={14} /> },
  executing: { label: "Executing", color: "text-emerald-400", icon: <Code2 size={14} /> },
  reviewing: { label: "Reviewing", color: "text-amber-400", icon: <Eye size={14} /> },
  testing: { label: "Testing", color: "text-cyan-400", icon: <FlaskConical size={14} /> },
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
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

  // Current phase from WS messages
  const currentPhase = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "phase") {
        return messages[i].data as { phase: string; iteration: number };
      }
    }
    return null;
  })();

  // Poll Ollama status
  useEffect(() => {
    const check = () => api.ollamaStatus().then(setOllamaStatus).catch(() => {});
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, []);

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
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 flex-wrap">
        {/* Backend connection */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 animate-pulse-slow" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-slate-400">
            {connected ? "Backend" : "Disconnected"}
          </span>
        </div>
        {/* Ollama status */}
        {ollamaStatus && (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                ollamaStatus.running ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className="text-xs text-slate-400">
              {ollamaStatus.running
                ? `Ollama (${ollamaStatus.url}) - ${ollamaStatus.model_count} models`
                : "Ollama OFF"}
            </span>
          </div>
        )}
        {/* Phase indicator */}
        {isRunning && currentPhase && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            {(() => {
              const pc = PHASE_CONFIG[currentPhase.phase];
              if (!pc) return null;
              return (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/5 bg-white/3 ${pc.color}`}>
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-xs font-medium">{pc.label}</span>
                  <span className="text-[10px] text-slate-600">
                    #{currentPhase.iteration}
                  </span>
                </div>
              );
            })()}
          </div>
        )}
        {isRunning && (
          <div className={`flex items-center gap-2 ${!currentPhase ? "ml-auto" : ""}`}>
            {!currentPhase && <Loader2 size={14} className="animate-spin text-blue-400" />}
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
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
            {/* Quick prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 max-w-lg w-full">
              {[
                "Create a Python Flask REST API with CRUD endpoints",
                "Build a simple React todo app with local storage",
                "Write a bash script that monitors disk usage",
                "Create a Node.js CLI tool for file management",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-white/5 bg-white/3 hover:bg-white/5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {agentMessages.map((msg, idx) => {
          const cfg = ROLE_CONFIG[msg.role] || ROLE_CONFIG.system;
          return (
            <div
              key={idx}
              className={`rounded-xl border-l-2 ${cfg.bg} bg-gradient-to-r ${cfg.gradient} transition-all`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label}
                </span>
                {msg.iteration !== undefined && msg.iteration > 0 && (
                  <span className="text-[10px] text-slate-600 px-1.5 py-0.5 rounded bg-white/3">
                    iteration {msg.iteration}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="px-4 pb-3 pt-1">
                <ContentRenderer content={msg.content} />
              </div>

              {/* Tool calls */}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {msg.tool_calls.map((tc, tci) => (
                    <CollapsibleToolCall key={tci} tc={tc} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <Loader2 size={14} className="animate-spin" />
            <span>
              {currentPhase
                ? `${PHASE_CONFIG[currentPhase.phase]?.label || currentPhase.phase}...`
                : "Thinking..."}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 py-3 border-t border-white/5">
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

/** Render content with code blocks */
function ContentRenderer({ content }: { content: string }) {
  if (!content) return null;

  // Split content into text and code blocks
  const parts: { type: "text" | "code"; content: string; lang?: string }[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", content: match[2], lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content });
  }

  return (
    <div className="space-y-2">
      {parts.map((part, i) =>
        part.type === "code" ? (
          <div key={i} className="rounded-lg bg-black/40 border border-white/5 overflow-hidden">
            {part.lang && (
              <div className="px-3 py-1 bg-white/3 border-b border-white/5">
                <span className="text-[10px] text-slate-500 font-mono uppercase">
                  {part.lang}
                </span>
              </div>
            )}
            <pre className="px-3 py-2 text-xs text-emerald-300 font-mono overflow-x-auto leading-relaxed">
              {part.content}
            </pre>
          </div>
        ) : (
          <div
            key={i}
            className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed"
          >
            {part.content.trim()}
          </div>
        )
      )}
    </div>
  );
}

/** Collapsible tool call display */
function CollapsibleToolCall({
  tc,
}: {
  tc: {
    tool: string;
    args: Record<string, unknown>;
    result: string | null;
    success: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const argsStr = typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args);

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        tc.success ? "border-emerald-500/10 bg-black/20" : "border-red-500/10 bg-red-500/3"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/3 transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-slate-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
        )}
        <Terminal size={12} className="text-slate-500 flex-shrink-0" />
        <span className="text-xs font-mono text-slate-400 truncate flex-1 text-left">
          {tc.tool}: {argsStr.length > 60 ? argsStr.slice(0, 60) + "..." : argsStr}
        </span>
        {tc.success ? (
          <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle size={12} className="text-red-400 flex-shrink-0" />
        )}
      </button>
      {open && tc.result && (
        <pre className="px-3 py-2 text-xs text-slate-400 overflow-x-auto max-h-48 font-mono border-t border-white/5 bg-black/20 leading-relaxed">
          {tc.result}
        </pre>
      )}
    </div>
  );
}
