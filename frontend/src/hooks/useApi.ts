const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || "8000";
const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:${BACKEND_PORT}`;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface HardwareInfo {
  cpu: { model: string; cores: number; threads: number };
  ram: { total_gb: number; used_gb: number; free_gb: number; type: string };
  gpus: {
    name: string;
    vram_total_mb: number;
    vram_used_mb: number;
    vram_free_mb: number;
    temperature: number;
    utilization: number;
  }[];
  os: { name: string; version: string };
  has_gpu: boolean;
  total_vram_gb: number;
}

export interface ModelInfo {
  name: string;
  size: string | null;
  modified_at: string | null;
  digest: string | null;
}

export interface ModelAssignment {
  planner: string;
  executor: string;
  reviewer: string;
}

export interface SessionInfo {
  session_id: string;
  created_at: string;
  message_count: number;
  last_message: string | null;
}

export interface OllamaStatus {
  running: boolean;
  model_count: number;
  url: string;
}

export const api = {
  hardware: () => apiFetch<HardwareInfo>("/api/hardware"),
  ollamaStatus: () => apiFetch<OllamaStatus>("/api/ollama/status"),
  ollamaStart: () =>
    apiFetch<{ success: boolean; message: string }>("/api/ollama/start", {
      method: "POST",
    }),
  models: () => apiFetch<{ models: ModelInfo[]; healthy: boolean; ollama_url: string }>("/api/models"),
  assignedModels: () => apiFetch<ModelAssignment>("/api/models/assigned"),
  assignModels: (a: ModelAssignment) =>
    apiFetch<{ status: string }>("/api/models/assign", {
      method: "POST",
      body: JSON.stringify(a),
    }),
  pullModel: (name: string) =>
    apiFetch<{ status: string }>("/api/models/pull", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  sessions: () => apiFetch<{ sessions: SessionInfo[] }>("/api/sessions"),
  session: (id: string) =>
    apiFetch<{ session_id: string; status: string; messages: unknown[] }>(
      `/api/sessions/${id}`
    ),
  stopSession: (id: string) =>
    apiFetch<{ status: string }>(`/api/sessions/${id}/stop`, { method: "POST" }),
};
