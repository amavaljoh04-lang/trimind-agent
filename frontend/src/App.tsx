import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import ModelsView from "./components/ModelsView";
import SettingsView from "./components/SettingsView";
import FileBrowser from "./components/FileBrowser";
import TerminalPanel from "./components/TerminalPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import { FolderTree, Terminal } from "lucide-react";

/** Generate a UUID that works in non-secure contexts (plain HTTP) */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (http:// on non-localhost)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type RightPanel = "none" | "terminal" | "files";

function App() {
  const [activeView, setActiveView] = useState<"chat" | "models" | "settings">(
    "chat"
  );
  const [sessionId, setSessionId] = useState<string>(generateId);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");

  const { connected, messages, send, clearMessages } = useWebSocket(sessionId);

  const handleSend = useCallback(
    (message: string) => {
      setIsRunning(true);
      send({ type: "task", data: { message } });
    },
    [send]
  );

  const handleStop = useCallback(() => {
    send({ type: "stop", data: {} });
    setIsRunning(false);
  }, [send]);

  const handleNewSession = useCallback(() => {
    setSessionId(generateId());
    clearMessages();
    setIsRunning(false);
    setActiveView("chat");
  }, [clearMessages]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        setSessionId(id);
        clearMessages();
        setIsRunning(false);
        setActiveView("chat");
      }
    },
    [sessionId, clearMessages]
  );

  // Detect "done" messages to stop the running indicator
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "done" && isRunning) {
      setIsRunning(false);
    }
  }, [messages, isRunning]);

  // Auto-open terminal when task starts running
  useEffect(() => {
    if (isRunning && rightPanel === "none") {
      setRightPanel("terminal");
    }
  }, [isRunning, rightPanel]);

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((prev) => (prev === panel ? "none" : panel));
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar — hidden on mobile unless toggled */}
      <div
        className={`fixed inset-y-0 left-0 z-40 md:relative md:z-auto transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar
          activeView={activeView}
          onViewChange={(v) => {
            setActiveView(v);
            setSidebarOpen(false);
          }}
          currentSessionId={sessionId}
          onNewSession={() => {
            handleNewSession();
            setSidebarOpen(false);
          }}
          onSelectSession={(id) => {
            handleSelectSession(id);
            setSidebarOpen(false);
          }}
        />
      </div>

      {/* Main content area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar with hamburger */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 md:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-400"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gradient">TriMind Agent</span>
          {/* Panel toggles for mobile */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => togglePanel("terminal")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                rightPanel === "terminal"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-slate-500 hover:bg-white/5"
              }`}
            >
              <Terminal size={16} />
            </button>
            <button
              onClick={() => togglePanel("files")}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                rightPanel === "files"
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-slate-500 hover:bg-white/5"
              }`}
            >
              <FolderTree size={16} />
            </button>
          </div>
        </div>

        {/* Content with optional right panel */}
        <div className="flex-1 min-h-0 flex">
          {/* Main view */}
          <div className={`flex-1 min-w-0 ${rightPanel !== "none" ? "hidden sm:flex sm:flex-col" : "flex flex-col"}`}>
            {activeView === "chat" && (
              <ChatView
                messages={messages}
                connected={connected}
                onSend={handleSend}
                onStop={handleStop}
                isRunning={isRunning}
              />
            )}
            {activeView === "models" && <ModelsView />}
            {activeView === "settings" && <SettingsView />}
          </div>

          {/* Right panel (terminal / file browser) */}
          {rightPanel !== "none" && (
            <div className="w-full sm:w-80 md:w-96 border-l border-white/5 flex flex-col glass-light">
              {/* Panel tabs */}
              <div className="flex items-center border-b border-white/5">
                <button
                  onClick={() => setRightPanel("terminal")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanel === "terminal"
                      ? "text-emerald-400 border-b-2 border-emerald-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Terminal size={13} /> Terminal
                </button>
                <button
                  onClick={() => setRightPanel("files")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    rightPanel === "files"
                      ? "text-blue-400 border-b-2 border-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <FolderTree size={13} /> Files
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0">
                {rightPanel === "terminal" && (
                  <TerminalPanel messages={messages} />
                )}
                {rightPanel === "files" && (
                  <FileBrowser />
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Desktop panel toggle buttons — fixed right side */}
      <div className="hidden md:flex flex-col gap-1 p-1 border-l border-white/5">
        <button
          onClick={() => togglePanel("terminal")}
          className={`p-2 rounded-lg transition-colors ${
            rightPanel === "terminal"
              ? "bg-emerald-500/10 text-emerald-400"
              : "text-slate-600 hover:bg-white/5 hover:text-slate-400"
          }`}
          title="Terminal"
        >
          <Terminal size={16} />
        </button>
        <button
          onClick={() => togglePanel("files")}
          className={`p-2 rounded-lg transition-colors ${
            rightPanel === "files"
              ? "bg-blue-500/10 text-blue-400"
              : "text-slate-600 hover:bg-white/5 hover:text-slate-400"
          }`}
          title="Files"
        >
          <FolderTree size={16} />
        </button>
      </div>
    </div>
  );
}

export default App;
