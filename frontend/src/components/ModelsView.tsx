import { useEffect, useState } from "react";
import {
  Brain,
  Code2,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Cpu,
} from "lucide-react";
import {
  api,
  type ModelAssignment,
  type ModelInfo,
} from "../hooks/useApi";

export default function ModelsView() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [assigned, setAssigned] = useState<ModelAssignment>({
    planner: "",
    executor: "",
    reviewer: "",
  });
  const [healthy, setHealthy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        api.models(),
        api.assignedModels(),
      ]);
      setModels(mRes.models);
      setHealthy(mRes.healthy);
      setAssigned(aRes);
    } catch {
      setHealthy(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAssign = async () => {
    setSaving(true);
    try {
      await api.assignModels(assigned);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handlePull = async () => {
    if (!pullName.trim()) return;
    setPulling(true);
    try {
      await api.pullModel(pullName.trim());
      await refresh();
      setPullName("");
    } catch {
      // ignore
    } finally {
      setPulling(false);
    }
  };

  const modelNames = models.map((m) => m.name);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Model Management</h2>
            <p className="text-sm text-slate-500">
              Configure Ollama models and assign roles
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                healthy
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  healthy ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              Ollama {healthy ? "Connected" : "Disconnected"}
            </span>
            <button
              onClick={refresh}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Role Assignment */}
        <div className="glass rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Role Assignment
          </h3>
          <p className="text-xs text-slate-500">
            Select which model powers each role in the symbiosis pipeline
          </p>

          <div className="grid gap-4">
            <RoleSelector
              role="Planner"
              description="Strategic reasoning & task decomposition"
              icon={<Brain size={18} />}
              color="purple"
              value={assigned.planner}
              options={modelNames}
              onChange={(v) => setAssigned({ ...assigned, planner: v })}
            />
            <RoleSelector
              role="Executor"
              description="Code generation & command execution"
              icon={<Code2 size={18} />}
              color="emerald"
              value={assigned.executor}
              options={modelNames}
              onChange={(v) => setAssigned({ ...assigned, executor: v })}
            />
            <RoleSelector
              role="Reviewer"
              description="Validation & error detection"
              icon={<Eye size={18} />}
              color="amber"
              value={assigned.reviewer}
              options={modelNames}
              onChange={(v) => setAssigned({ ...assigned, reviewer: v })}
            />
          </div>

          <button
            onClick={handleAssign}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin inline mr-2" />
            ) : null}
            Save Assignment
          </button>
        </div>

        {/* Pull Model */}
        <div className="glass rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Download Model
          </h3>
          <p className="text-xs text-slate-500">
            Pull a new model from the Ollama registry (e.g. deepseek-r1:14b, qwen2.5-coder:14b)
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              placeholder="Model name (e.g. llama3.1:8b)"
              className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/30"
              onKeyDown={(e) => e.key === "Enter" && handlePull()}
            />
            <button
              onClick={handlePull}
              disabled={pulling || !pullName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/20 text-blue-400 text-sm hover:bg-blue-600/30 disabled:opacity-40 transition-all"
            >
              {pulling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Pull
            </button>
          </div>
        </div>

        {/* Installed Models */}
        <div className="glass rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Installed Models ({models.length})
          </h3>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
          ) : models.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No models found. Pull a model to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {models.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <Cpu size={14} className="text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {m.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.size || "Unknown size"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {assigned.planner === m.name && (
                      <Badge label="P" color="purple" />
                    )}
                    {assigned.executor === m.name && (
                      <Badge label="E" color="emerald" />
                    )}
                    {assigned.reviewer === m.name && (
                      <Badge label="R" color="amber" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleSelector({
  role,
  description,
  icon,
  color,
  value,
  options,
  onChange,
}: {
  role: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const colorMap: Record<string, string> = {
    purple: "border-purple-500/20 bg-purple-500/5",
    emerald: "border-emerald-500/20 bg-emerald-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
  };
  const textMap: Record<string, string> = {
    purple: "text-purple-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border ${
        colorMap[color] || ""
      }`}
    >
      <div className={textMap[color] || ""}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${textMap[color]}`}>{role}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-sm text-white outline-none cursor-pointer max-w-48"
      >
        <option value="">Select model...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !options.includes(value) && (
          <option value={value}>{value} (not installed)</option>
        )}
      </select>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const cls: Record<string, string> = {
    purple: "bg-purple-500/20 text-purple-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/20 text-amber-400",
  };
  return (
    <span
      className={`text-xs font-bold w-5 h-5 rounded flex items-center justify-center ${
        cls[color] || ""
      }`}
    >
      {label}
    </span>
  );
}
