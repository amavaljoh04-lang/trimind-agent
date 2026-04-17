import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Save,
  Server,
  Sliders,
  FolderCog,
  GitBranch,
} from "lucide-react";
import { api, type Settings } from "../hooks/useApi";

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings>({
    ollama_url: "http://127.0.0.1:11434",
    max_iterations: 20,
    temperature: 0.7,
    max_tokens: 4096,
    auto_test: true,
    workspace: "./workspace",
    shell_timeout: 30,
  });
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setSettings(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await api.saveSettings(settings);
      setSaveMsg(res.message || "Settings saved!");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-slate-500" size={24} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <p className="text-sm text-slate-500">
            Configure agent behavior and connections
          </p>
        </div>

        {/* Connection */}
        <Section title="Connection" icon={<Server size={16} />}>
          <Field label="Ollama URL" sub="Address where Ollama is running">
            <input
              type="text"
              value={settings.ollama_url}
              onChange={(e) => update("ollama_url", e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="input-field"
            />
          </Field>
        </Section>

        {/* Agent Behavior */}
        <Section title="Agent Behavior" icon={<Sliders size={16} />}>
          <Field label="Max Iterations" sub="Maximum autonomous loop cycles">
            <input
              type="number"
              value={settings.max_iterations}
              onChange={(e) => update("max_iterations", Number(e.target.value))}
              min={1}
              max={100}
              className="input-field w-24"
            />
          </Field>
          <Field label="Temperature" sub="Model creativity (0.0 - 1.0)">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.temperature}
              onChange={(e) => update("temperature", Number(e.target.value))}
              className="w-32"
            />
            <span className="text-xs text-slate-400 ml-2 w-8">
              {settings.temperature.toFixed(2)}
            </span>
          </Field>
          <Field label="Max Tokens" sub="Maximum response length">
            <input
              type="number"
              value={settings.max_tokens}
              onChange={(e) => update("max_tokens", Number(e.target.value))}
              min={256}
              max={32768}
              step={256}
              className="input-field w-28"
            />
          </Field>
          <Field label="Auto Test" sub="Automatically test until project works">
            <button
              onClick={() => update("auto_test", !settings.auto_test)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                settings.auto_test ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.auto_test ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </Field>
        </Section>

        {/* Workspace */}
        <Section title="Workspace" icon={<FolderCog size={16} />}>
          <Field label="Workspace Directory">
            <input
              type="text"
              value={settings.workspace}
              onChange={(e) => update("workspace", e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label="Shell Timeout (seconds)">
            <input
              type="number"
              value={settings.shell_timeout}
              onChange={(e) => update("shell_timeout", Number(e.target.value))}
              min={5}
              max={300}
              className="input-field w-24"
            />
          </Field>
        </Section>

        {/* Git */}
        <Section title="Git Integration" icon={<GitBranch size={16} />}>
          <Field label="GitHub Token" sub="For auto-creating repositories">
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_..."
              className="input-field"
            />
          </Field>
        </Section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saveMsg ? (
            <CheckCircle2 size={14} />
          ) : (
            <Save size={14} />
          )}
          {saving ? "Saving..." : saveMsg || "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {sub && <p className="text-xs text-slate-600">{sub}</p>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
