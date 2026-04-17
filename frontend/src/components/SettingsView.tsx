import { useState } from "react";
import { Save, Server, Sliders, FolderCog, GitBranch } from "lucide-react";

export default function SettingsView() {
  const [ollamaUrl, setOllamaUrl] = useState(
    import.meta.env.VITE_API_URL || "http://localhost:8000"
  );
  const [maxIterations, setMaxIterations] = useState(20);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [autoTest, setAutoTest] = useState(true);
  const [workspace, setWorkspace] = useState("./workspace");
  const [shellTimeout, setShellTimeout] = useState(30);
  const [githubToken, setGithubToken] = useState("");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <p className="text-sm text-slate-500">
            Configure agent behavior and connections
          </p>
        </div>

        {/* Connection */}
        <Section title="Connection" icon={<Server size={16} />}>
          <Field label="Ollama URL">
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="input-field"
            />
          </Field>
        </Section>

        {/* Agent Behavior */}
        <Section title="Agent Behavior" icon={<Sliders size={16} />}>
          <Field label="Max Iterations" sub="Maximum autonomous loop cycles">
            <input
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value))}
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
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-xs text-slate-400 ml-2 w-8">
              {temperature.toFixed(2)}
            </span>
          </Field>
          <Field label="Max Tokens" sub="Maximum response length">
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={256}
              max={32768}
              step={256}
              className="input-field w-28"
            />
          </Field>
          <Field label="Auto Test" sub="Automatically test until project works">
            <button
              onClick={() => setAutoTest(!autoTest)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                autoTest ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoTest ? "left-5" : "left-0.5"
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
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label="Shell Timeout (seconds)">
            <input
              type="number"
              value={shellTimeout}
              onChange={(e) => setShellTimeout(Number(e.target.value))}
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

        <button className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
          <Save size={14} />
          Save Settings
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
