import React, { useState } from "react";
import { FolderOpen, X, FileJson } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { pickProjectSavePath } from "../lib/local-projects";

interface NewProjectSaveDialogProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (payload: { id: string; name: string; filePath: string }) => void;
}

export function NewProjectSaveDialog({
  userId,
  open,
  onClose,
  onCreated,
}: NewProjectSaveDialogProps) {
  const [name, setName] = useState("未命名工程");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (!open) return null;

  const handlePickPath = async () => {
    setPicking(true);
    try {
      const path = await pickProjectSavePath(userId, name.trim() || "未命名工程");
      if (path) setFilePath(path);
    } finally {
      setPicking(false);
    }
  };

  const handleConfirm = () => {
    if (!filePath) return;
    onCreated({
      id: "",
      name: name.trim() || "未命名工程",
      filePath,
    });
    setName("未命名工程");
    setFilePath(null);
  };

  return (
    <div className="fixed inset-0 z-[30000] flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-3xl bg-white border border-black/10 shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-neutral-900 tracking-tight">
              新建工程
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              请选择工程名称与保存位置（存于本机）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          工程名称
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-5 h-11 rounded-xl border-black/10"
          placeholder="未命名工程"
        />

        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          保存位置
        </label>
        <div className="flex gap-2 mb-6">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
            <FileJson className="w-4 h-4 shrink-0 text-neutral-400" />
            <span className="truncate" title={filePath || undefined}>
              {filePath || "尚未选择…"}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-xl border-black/10"
            onClick={handlePickPath}
            disabled={picking}
          >
            <FolderOpen className="w-4 h-4 mr-1.5" />
            浏览
          </Button>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" className="rounded-full" onClick={onClose}>
            取消
          </Button>
          <Button
            className="rounded-full bg-neutral-900 text-white hover:bg-neutral-800 font-bold px-6"
            disabled={!filePath}
            onClick={handleConfirm}
          >
            创建并打开
          </Button>
        </div>
      </div>
    </div>
  );
}
