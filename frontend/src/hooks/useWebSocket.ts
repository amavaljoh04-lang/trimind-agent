import { useCallback, useEffect, useRef, useState } from "react";

export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
}

/** Read backend port from global config injected by launch.sh, or fallback to env/default */
function getBackendPort(): string {
  // 1. Check global config injected at runtime by launch.sh
  const win = window as unknown as Record<string, unknown>;
  if (win.__TRIMIND_BACKEND_PORT__) return String(win.__TRIMIND_BACKEND_PORT__);
  // 2. Check Vite env var (baked at build time)
  if (import.meta.env.VITE_BACKEND_PORT) return import.meta.env.VITE_BACKEND_PORT;
  // 3. Default
  return "8000";
}

export function useWebSocket(sessionId: string) {
  const backendPort = getBackendPort();
  const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:${backendPort}`;
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [wsUrl, sessionId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { connected, messages, send, clearMessages };
}
