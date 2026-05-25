import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface RenameProjectModalProps {
  initialName: string;
  onClose: () => void;
  onConfirm: (newName: string) => void;
}

export const RenameProjectModal: React.FC<RenameProjectModalProps> = ({
  initialName,
  onClose,
  onConfirm,
}) => {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-white/60 animate-in fade-in duration-200">
      <div
        className="bg-white border border-black/10 rounded-md shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-black/5 flex items-center justify-between bg-neutral-50">
          <h3 className="text-xs font-black text-neutral-900 uppercase tracking-[0.2em]">
            重命名工程
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/60 border border-black/10 rounded-md px-4 py-3 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all font-bold text-sm"
              placeholder="请输入新名称..."
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-black/10 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 font-black text-[10px] uppercase tracking-widest"
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-white text-black hover:bg-neutral-200 font-black text-[10px] uppercase tracking-widest"
            >
              确定
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
