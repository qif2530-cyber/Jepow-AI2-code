import React from "react";
import { Download, X, Monitor } from "lucide-react";
import { Button } from "./ui/button";
import { openJepowWeb } from "../lib/runtime";

interface DesktopDownloadPromptProps {
  onClose: () => void;
}

export function DesktopDownloadPrompt({ onClose }: DesktopDownloadPromptProps) {
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-black/5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 text-neutral-500"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center mb-5">
          <Monitor className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-xl font-black text-neutral-900 mb-2">
          无限画布需使用桌面版
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed mb-6">
          网站提供社区、充值与后台管理。无限画布创作请下载并安装 Jepow AI
          桌面客户端，使用同一账号登录即可同步积分与项目数据。
        </p>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-11 font-bold"
            onClick={() => openJepowWeb("/")}
          >
            <Download className="w-4 h-4 mr-2" />
            前往官网下载
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
