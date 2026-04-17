import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import ModelsView from "./components/ModelsView";
import SettingsView from "./components/SettingsView";
import { useWebSocket } from "./hooks/useWebSocket";

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

function App() {
  const [activeView, setActiveView] = useState<"chat" | "models" | "settings">(
    "chat"
  );
  const [sessionId, setSessionId] = useState<string>(generateId);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        </div>
        <div className="flex-1 min-h-0">
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
      </main>
    </div>
  );
}

export default App;
