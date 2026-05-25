import React from "react";
import { Download, Monitor, Layers, HardDrive } from "lucide-react";
import { Button } from "./ui/button";
import { openJepowWeb } from "../lib/runtime";

interface LandingDownloadSectionProps {
  downloadUrl?: string;
}

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
    <section className="py-16 px-6 lg:px-28 xl:px-32 max-w-[1600px] mx-auto relative z-10 mt-8">
      <div className="rounded-3xl border border-black/10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800 text-white p-10 md:p-14 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Monitor className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
              无限画布 · 桌面版
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
            工程保存在您的电脑，网站负责账号与积分
          </h2>
          <p className="text-sm md:text-base text-white/70 leading-relaxed mb-8">
            网页端提供社区、充值与后台管理。含 3D 在内的无限画布创作请下载桌面客户端：工程文件存储在本机，不占用服务器空间；登录后自动同步您在 jepow.com 的账号、积分与权限。
          </p>
          <ul className="grid sm:grid-cols-3 gap-4 mb-10 text-sm text-white/80">
            <li className="flex items-start gap-2">
              <Layers className="w-5 h-5 shrink-0 text-amber-400" />
              <span>无限画布 + 3D 节点</span>
            </li>
            <li className="flex items-start gap-2">
              <HardDrive className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>工程本地保存</span>
            </li>
            <li className="flex items-start gap-2">
              <Download className="w-5 h-5 shrink-0 text-blue-400" />
              <span>账号与网站互通</span>
            </li>
          </ul>
          <Button
            size="lg"
            className="h-12 px-8 bg-white text-black hover:bg-neutral-200 font-bold"
            onClick={handleDownload}
          >
            <Download className="w-5 h-5 mr-2" />
            下载无限画布客户端
          </Button>
        </div>
      </div>
    </section>
  );
}
