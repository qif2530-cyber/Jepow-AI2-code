import React from "react";
import {
  Download,
  Monitor,
  Layers,
  HardDrive,
  Sparkles,
  Globe,
  ArrowRight,
} from "lucide-react";
import { motion } from "motion/react";
import { openJepowWeb } from "../lib/runtime";

interface LandingDownloadSectionProps {
  downloadUrl?: string;
}

const FEATURES = [
  {
    icon: Layers,
    label: "无限画布 + 3D",
    desc: "节点式创作工作流",
  },
  {
    icon: HardDrive,
    label: "工程本地保存",
    desc: "不占用服务器空间",
  },
  {
    icon: Globe,
    label: "账号网站互通",
    desc: "积分与权限同步",
  },
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
    <section className="py-10 px-6 lg:px-28 xl:px-32 max-w-[1600px] mx-auto relative z-10 -mt-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="rounded-[28px] border border-black/[0.06] bg-white shadow-[0_8px_40px_rgb(0,0,0,0.06)] overflow-hidden hover:shadow-[0_12px_48px_rgb(0,0,0,0.08)] hover:border-black/10 transition-all duration-300"
      >
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          {/* Copy */}
          <div className="p-8 md:p-12 lg:p-14 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 w-fit mb-6 px-4 py-1.5 rounded-full border border-black/5 bg-neutral-50 text-neutral-600">
              <Monitor className="w-3.5 h-3.5 text-neutral-900" />
              <span className="text-xs font-bold tracking-widest uppercase">
                无限画布 · 桌面版
              </span>
            </div>

            <h2 className="text-3xl md:text-[2.5rem] font-black tracking-tighter text-neutral-900 leading-[1.1] mb-4">
              工程保存在您的电脑
              <span className="block text-neutral-400 font-black mt-1">
                网站负责社区与积分
              </span>
            </h2>

            <p className="text-base md:text-lg text-neutral-500 font-light leading-relaxed max-w-xl mb-8">
              网页端专注社区、充值与后台管理。含 3D 的无限画布请使用桌面客户端——工程存本机，登录后自动同步
              jepow.com 账号与积分。
            </p>

            <ul className="grid sm:grid-cols-3 gap-3 mb-10">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <li
                  key={label}
                  className="rounded-2xl border border-black/5 bg-neutral-50/80 px-4 py-3.5 hover:bg-neutral-100/80 hover:border-black/10 transition-colors"
                >
                  <Icon className="w-4 h-4 text-neutral-900 mb-2" strokeWidth={2} />
                  <p className="text-sm font-bold text-neutral-900">{label}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 bg-neutral-900 text-white text-base font-bold rounded-full px-8 py-4 hover:bg-neutral-800 transition-colors shadow-md active:scale-[0.98]"
              >
                <Download className="w-5 h-5" />
                下载无限画布客户端
                <ArrowRight className="w-4 h-4 opacity-70" />
              </button>
              <span className="text-xs text-neutral-400 font-medium">
                Windows · macOS
              </span>
            </div>
          </div>

          {/* Preview — matches site light aesthetic */}
          <div className="relative hidden lg:flex items-center justify-center p-10 bg-[linear-gradient(160deg,#fafafa_0%,#f5f5f5_50%,#ffffff_100%)] border-l border-black/[0.04] overflow-hidden min-h-[360px]">
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #d4d4d4 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative w-full max-w-[340px] aspect-[4/3]">
              <motion.div
                className="absolute top-4 left-2 w-[72%] rounded-2xl border border-black/10 bg-white p-4 shadow-[0_12px_32px_rgb(0,0,0,0.08)]"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-neutral-300" />
                  <div className="w-2 h-2 rounded-full bg-neutral-300" />
                  <div className="w-2 h-2 rounded-full bg-neutral-300" />
                  <span className="ml-auto text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Canvas
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 border border-black/5"
                    />
                  ))}
                </div>
              </motion.div>

              <motion.div
                className="absolute bottom-6 right-0 w-[58%] rounded-2xl border border-dashed border-black/15 bg-white/90 backdrop-blur p-4 shadow-lg"
                animate={{ y: [0, 5, 0] }}
                transition={{
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.6,
                }}
              >
                <div className="flex items-center gap-2 text-neutral-900 mb-2">
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-bold">3D 节点</span>
                </div>
                <div className="h-16 rounded-xl bg-neutral-900/5 border border-black/5 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-neutral-400" />
                </div>
              </motion.div>

              <motion.div
                className="absolute top-[42%] -right-2 px-3 py-2 rounded-full bg-neutral-900 text-white text-xs font-bold shadow-lg flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <HardDrive className="w-3.5 h-3.5" />
                本地存储
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
