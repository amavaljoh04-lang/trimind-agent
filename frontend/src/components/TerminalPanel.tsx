import { useEffect, useRef } from "react";
import { Terminal as TermIcon } from "lucide-react";

interface ToolCall {
  tool: string;
  args: Record<string, string>;
  result: string;
  success: boolean;
}

interface WsMessage {
  type: string;
  data: Record<string, unknown>;
}

interface TerminalPanelProps {
  messages: WsMessage[];
}

export default function TerminalPanel({ messages }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract tool calls from messages
  const entries: {
    tool: string;
    args: string;
    result: string;
    success: boolean;
    role: string;
  }[] = [];

  for (const msg of messages) {
    if (msg.type === "message") {
      const d = msg.data as {
        role?: string;
        tool_calls?: ToolCall[];
      };
      if (d.tool_calls && Array.isArray(d.tool_calls)) {
        for (const tc of d.tool_calls) {
          entries.push({
            tool: tc.tool,
            args: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args),
            result: tc.result,
            success: tc.success,
            role: d.role || "executor",
          });
        }
      }
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <TermIcon size={14} className="text-emerald-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Terminal
        </span>
        <span className="text-[10px] text-slate-600 ml-auto">
          {entries.length} command{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Terminal output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-3 bg-black/20"
      >
        {entries.length === 0 ? (
          <div className="text-slate-600 text-center py-8">
            <TermIcon size={24} className="mx-auto mb-2 opacity-30" />
            <p>No commands executed yet.</p>
            <p className="text-[10px] mt-1">
              Send a task to see shell output here.
            </p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={i}
              className={`rounded-lg border ${
                entry.success
                  ? "border-emerald-500/10 bg-emerald-500/3"
                  : "border-red-500/10 bg-red-500/3"
              } overflow-hidden`}
            >
              {/* Command line */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/3">
                <span
                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    entry.success
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {entry.tool}
                </span>
                <span className="text-slate-500 truncate flex-1">
                  {entry.args}
                </span>
                <span
                  className={`text-[10px] ${
                    entry.success ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {entry.success ? "OK" : "FAIL"}
                </span>
              </div>
              {/* Output */}
              {entry.result && (
                <pre className="px-2.5 py-2 text-slate-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
                  {entry.result.length > 2000
                    ? entry.result.slice(0, 2000) + "\n... (truncated)"
                    : entry.result}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
