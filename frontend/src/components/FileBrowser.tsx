import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { api, type FileNode } from "../hooks/useApi";

interface FileBrowserProps {
  onFileSelect?: (path: string, content: string) => void;
}

export default function FileBrowser({ onFileSelect }: FileBrowserProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.workspaceTree();
      setTree(res.tree);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => clearInterval(iv);
  }, [refresh]);

  const handleFileClick = async (path: string) => {
    setFileLoading(true);
    try {
      const res = await api.workspaceFile(path);
      if (res.content !== undefined) {
        setSelectedFile({ path, content: res.content });
        onFileSelect?.(path, res.content);
      }
    } catch {
      // ignore
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <Folder size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Workspace
        </span>
        <button
          onClick={refresh}
          className="ml-auto p-1 rounded hover:bg-white/5 text-slate-500"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading && tree.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : tree.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4 px-2">
            Workspace is empty. Start a task to generate files.
          </p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.name}
              node={node}
              path={node.name}
              depth={0}
              onFileClick={handleFileClick}
              selectedPath={selectedFile?.path}
            />
          ))
        )}
      </div>

      {/* File Preview */}
      {selectedFile && (
        <div className="border-t border-white/5 flex flex-col max-h-[40%]">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/3">
            <File size={12} className="text-slate-500" />
            <span className="text-xs text-slate-400 truncate flex-1">
              {selectedFile.path}
            </span>
            {fileLoading && (
              <Loader2 size={10} className="animate-spin text-slate-500" />
            )}
            <button
              onClick={() => setSelectedFile(null)}
              className="p-0.5 rounded hover:bg-white/5 text-slate-600"
            >
              <X size={10} />
            </button>
          </div>
          <pre className="flex-1 overflow-auto px-3 py-2 text-xs text-slate-400 font-mono bg-black/20 leading-relaxed">
            {selectedFile.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function TreeNode({
  node,
  path,
  depth,
  onFileClick,
  selectedPath,
}: {
  node: FileNode;
  path: string;
  depth: number;
  onFileClick: (path: string) => void;
  selectedPath?: string;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "dir";
  const isSelected = path === selectedPath;

  const handleClick = () => {
    if (isDir) {
      setOpen(!open);
    } else {
      onFileClick(path);
    }
  };

  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  const fileColor = getFileColor(ext);

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1 px-1 py-0.5 rounded text-xs hover:bg-white/5 transition-colors ${
          isSelected ? "bg-blue-500/10 text-blue-400" : "text-slate-400"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isDir ? (
          <>
            {open ? (
              <ChevronDown size={12} className="text-slate-600 flex-shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
            )}
            {open ? (
              <FolderOpen size={13} className="text-amber-400 flex-shrink-0" />
            ) : (
              <Folder size={13} className="text-amber-400 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            <File size={13} className={`${fileColor} flex-shrink-0`} />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="ml-auto text-slate-700 text-[10px] flex-shrink-0">
            {formatSize(node.size)}
          </span>
        )}
      </button>
      {isDir && open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getFileColor(ext: string): string {
  const colors: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    py: "text-green-400",
    rs: "text-orange-400",
    go: "text-cyan-400",
    html: "text-orange-400",
    css: "text-purple-400",
    json: "text-amber-400",
    yaml: "text-pink-400",
    yml: "text-pink-400",
    md: "text-slate-400",
    sh: "text-emerald-400",
    sql: "text-blue-300",
    toml: "text-pink-400",
  };
  return colors[ext] || "text-slate-500";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
