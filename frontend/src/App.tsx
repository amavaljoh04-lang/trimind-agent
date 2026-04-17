import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import ModelsView from "./components/ModelsView";
import SettingsView from "./components/SettingsView";
import { useWebSocket } from "./hooks/useWebSocket";

function App() {
  const [activeView, setActiveView] = useState<"chat" | "models" | "settings">(
    "chat"
  );
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [isRunning, setIsRunning] = useState(false);

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
    setSessionId(crypto.randomUUID());
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
    <div className="flex h-screen bg-[#0a0a0f]">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        currentSessionId={sessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
      />
      <main className="flex-1 min-w-0">
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
      </main>
    </div>
  );
}

export default App;
