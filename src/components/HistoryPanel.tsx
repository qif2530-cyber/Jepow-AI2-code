import React, { useState } from "react";
import { HistoryItem } from "../types";
import {
  X,
  Image as ImageIcon,
  Video,
  Trash2,
  Plus,
  History,
  UploadCloud,
  Sparkles,
  Download,
} from "lucide-react";
import { Button } from "./ui/button";

interface HistoryPanelProps {
  history: HistoryItem[];
  onClose: () => void;
  onClear: () => void;
  onSync?: () => void;
  onAddToCanvas: (item: HistoryItem) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = (props) => {
  const { history = [], onClose, onClear, onSync, onAddToCanvas } = props;
  const [activeTab, setActiveTab] = useState<"generated" | "uploaded">(
    "generated",
  );

  const safeHistory = Array.isArray(history) ? history : [];

  const filteredHistory = safeHistory.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const source = (item as any).source || "generated";
    return source === activeTab;
  });

  return (
    <div className="fixed top-4 right-4 bottom-4 w-80 bg-neutral-900 shadow-2xl border border-neutral-800 rounded-lg overflow-hidden z-[100] flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800 bg-neutral-900/50">
        <h2 className="text-lg font-semibold text-white flex items-center">
          <History className="w-5 h-5 mr-2 text-neutral-400" />
          历史记录
        </h2>
        <button
          className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-neutral-800 bg-neutral-900">
        <button
          className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "generated" ? "text-white border-b-2 border-indigo-500 bg-indigo-500/10" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}
          onClick={() => setActiveTab("generated")}
        >
          <Sparkles className="w-3.5 h-3.5" />
          已生成
        </button>
        <button
          className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "uploaded" ? "text-white border-b-2 border-emerald-500 bg-emerald-500/10" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}
          onClick={() => setActiveTab("uploaded")}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          已上传
        </button>
      </div>

      <div className="px-6 py-2 bg-neutral-900 border-b border-neutral-800">
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">
          点击 + 添加到故事板
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
            {activeTab === "generated" ? (
              <Sparkles className="w-12 h-12 opacity-20" />
            ) : (
              <UploadCloud className="w-12 h-12 opacity-20" />
            )}
            <div className="text-center space-y-1">
              <p className="text-sm">
                暂无{activeTab === "generated" ? "生成" : "上传"}内容
              </p>
              {activeTab === "generated" && onSync && (
                <p className="text-[10px] opacity-60">生成的图像可能尚未同步</p>
              )}
            </div>
            {activeTab === "generated" && onSync && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                onClick={() => onSync()}
              >
                <History className="w-3.5 h-3.5 mr-1.5" />
                从画布同步
              </Button>
            )}
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className="group relative bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden hover:shadow-md hover:border-neutral-600 transition-all"
            >
              <div className="aspect-video bg-neutral-900 relative overflow-hidden">
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.prompt}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded-md flex items-center gap-1.5">
                  {item.type === "image" ? (
                    <ImageIcon className="w-3 h-3 text-white" />
                  ) : (
                    <Video className="w-3 h-3 text-white" />
                  )}
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    {item.type === "image" ? "图片" : "视频"}
                  </span>
                </div>

                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-[140px] rounded-full bg-white text-black hover:bg-neutral-200"
                    onClick={() => onAddToCanvas(item)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    添加到故事板
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-[140px] rounded-full bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = item.url;
                      link.download = `History-${item.type}-${Date.now()}.${item.type === "image" ? "png" : "mp4"}`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    下载{item.type === "image" ? "图片" : "视频"}
                  </Button>
                </div>
              </div>
              <div className="p-3">
                <p className="text-xs text-neutral-300 line-clamp-2">
                  "{typeof item.prompt === "string" ? item.prompt : "Untitled"}"
                </p>
                <p className="text-[10px] text-neutral-500 mt-2">
                  {(() => {
                    try {
                      const d = new Date(item.timestamp);
                      return isNaN(d.getTime())
                        ? "Unknown Date"
                        : d.toLocaleString();
                    } catch (e) {
                      return "Unknown Date";
                    }
                  })()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {onSync && (
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex gap-2">
          <Button
            variant="ghost"
            className="flex-1 text-neutral-400 hover:text-indigo-400 hover:bg-indigo-900/40 rounded-md h-10"
            onClick={() => onSync()}
          >
            <History className="w-4 h-4 mr-2" />
            同步画布
          </Button>
          <Button
            variant="ghost"
            className="flex-1 text-neutral-400 hover:text-red-400 hover:bg-red-900/40 rounded-md h-10"
            onClick={onClear}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            全部清空
          </Button>
        </div>
      )}
    </div>
  );
};
