import React from "react";
import { Download, Monitor, Layers, HardDrive, Globe } from "lucide-react";
import { openJepowWeb } from "../lib/runtime";

interface LandingDownloadSectionProps {
  downloadUrl?: string;
}

const FEATURES = [
  { icon: Layers, label: "无限画布 + 3D 节点" },
  { icon: HardDrive, label: "工程本地保存" },
  { icon: Globe, label: "账号与网站互通" },
] as const;

export function LandingDownloadSection({
  downloadUrl,
}: LandingDownloadSectionProps) {
  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    openJepowWeb("/");
  };

  return (
    <section className="relative z-10 px-4 pb-20 -mt-6 max-w-5xl mx-auto text-center">
      <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full border border-black/5 bg-white text-neutral-600 shadow-sm">
        <Monitor className="w-3.5 h-3.5 text-neutral-900" />
        <span className="text-xs font-bold tracking-wider text-neutral-500">
          无限画布 · 桌面版
        </span>
      </div>

      <h2 className="text-2xl md:text-4xl font-black tracking-tighter text-neutral-900 leading-snug mb-4">
        工程保存在您的电脑
        <span className="text-neutral-400"> · </span>
        网站负责账号与积分
      </h2>

      <p className="text-base md:text-lg text-neutral-500 font-light leading-relaxed max-w-2xl mx-auto mb-8">
        网页端提供社区、充值与后台。含 3D 的无限画布请下载桌面客户端，工程存本机，登录后同步
        jepow.com 账号与积分。
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mb-10">
        {FEATURES.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-black/5 bg-white text-neutral-600 text-sm font-medium hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
          >
            <Icon className="w-4 h-4 text-neutral-900" strokeWidth={2} />
            {label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-2 bg-neutral-900 text-white text-base font-bold rounded-full px-10 py-4 hover:bg-neutral-800 transition-colors shadow-md active:scale-[0.98]"
      >
        <Download className="w-5 h-5" />
        下载无限画布客户端
      </button>

      <p className="mt-4 text-xs text-neutral-400 font-medium">Windows · macOS</p>
    </section>
  );
}
