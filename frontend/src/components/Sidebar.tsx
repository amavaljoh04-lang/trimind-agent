import { useEffect, useState } from "react";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Cpu,
  HardDrive,
  History,
  MessageSquarePlus,
  Monitor,
  Settings,
  Zap,
} from "lucide-react";
import { api, type HardwareInfo, type SessionInfo } from "../hooks/useApi";

interface SidebarProps {
  activeView: "chat" | "models" | "settings";
  onViewChange: (view: "chat" | "models" | "settings") => void;
  currentSessionId: string;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
}

export default function Sidebar({
  activeView,
  onViewChange,
  currentSessionId,
  onNewSession,
  onSelectSession,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    api.hardware().then(setHardware).catch(() => {});
    api.sessions().then((d) => setSessions(d.sessions)).catch(() => {});
    const iv = setInterval(() => {
      api.hardware().then(setHardware).catch(() => {});
      api.sessions().then((d) => setSessions(d.sessions)).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  return (
    <aside
      className={`h-screen flex flex-col glass transition-all duration-300 ${
        collapsed ? "w-16" : "w-72"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-gradient tracking-tight">
              TriMind Agent
            </h1>
            <p className="text-xs text-slate-500">3 AI Minds in Symbiosis</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-white/5 text-slate-500"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* New session */}
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 hover:from-blue-600/30 hover:to-purple-600/30 border border-blue-500/20 text-sm font-medium transition-all"
        >
          <MessageSquarePlus size={16} />
          {!collapsed && "New Session"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-1">
        <NavItem
          icon={<Zap size={16} />}
          label="Chat"
          active={activeView === "chat"}
          collapsed={collapsed}
          onClick={() => onViewChange("chat")}
        />
        <NavItem
          icon={<Cpu size={16} />}
          label="Models"
          active={activeView === "models"}
          collapsed={collapsed}
          onClick={() => onViewChange("models")}
        />
        <NavItem
          icon={<Settings size={16} />}
          label="Settings"
          active={activeView === "settings"}
          collapsed={collapsed}
          onClick={() => onViewChange("settings")}
        />

        {/* Sessions list */}
        {!collapsed && sessions.length > 0 && (
          <div className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider px-2 mb-2">
              <History size={12} className="inline mr-1" />
              History
            </p>
            {sessions.slice(0, 10).map((s) => (
              <button
                key={s.session_id}
                onClick={() => onSelectSession(s.session_id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors ${
                  s.session_id === currentSessionId
                    ? "bg-blue-500/10 text-blue-400"
                    : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {s.last_message || s.session_id.slice(0, 8)}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Hardware Monitor */}
      {hardware && (
        <div className="p-3 border-t border-white/5">
          {!collapsed ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Monitor size={12} /> System
              </p>
              <HardwareBar
                label="CPU"
                icon={<Cpu size={10} />}
                value={hardware.cpu.model.slice(0, 20)}
                sub={`${hardware.cpu.cores}C / ${hardware.cpu.threads}T`}
              />
              <HardwareBar
                label="RAM"
                icon={<HardDrive size={10} />}
                value={`${hardware.ram.used_gb.toFixed(1)} / ${hardware.ram.total_gb.toFixed(1)} GB`}
                sub={hardware.ram.type}
                percent={
                  hardware.ram.total_gb > 0
                    ? (hardware.ram.used_gb / hardware.ram.total_gb) * 100
                    : 0
                }
              />
              {hardware.gpus.map((gpu, i) => (
                <HardwareBar
                  key={i}
                  label="GPU"
                  icon={<Zap size={10} />}
                  value={gpu.name.slice(0, 20)}
                  sub={`${gpu.vram_used_mb}/${gpu.vram_total_mb} MB | ${gpu.temperature}°C`}
                  percent={
                    gpu.vram_total_mb > 0
                      ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100
                      : 0
                  }
                />
              ))}
              {!hardware.has_gpu && (
                <p className="text-xs text-slate-600 italic">No GPU detected</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Monitor size={14} className="text-slate-500" />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
        active
          ? "bg-white/10 text-white font-medium"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {icon}
      {!collapsed && label}
    </button>
  );
}

function HardwareBar({
  label,
  icon,
  value,
  sub,
  percent,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub?: string;
  percent?: number;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs">
        <span className="text-slate-500">{icon}</span>
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="ml-auto text-slate-300 text-right truncate max-w-32">
          {value}
        </span>
      </div>
      {sub && <p className="text-xs text-slate-600 pl-4">{sub}</p>}
      {percent !== undefined && (
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percent > 80
                ? "bg-red-500"
                : percent > 60
                ? "bg-amber-500"
                : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
