import React from "react";
import { Download, Monitor, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
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
    <section className="relative z-10 px-4 pb-20 -mt-2">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-3xl mx-auto"
      >
        {/* 与上方搜索框同宽、同风格的胶囊条 */}
        <div className="rounded-[1.75rem] border border-black/[0.06] bg-white p-2 sm:p-2.5 shadow-[0_8px_40px_rgb(0,0,0,0.07)] hover:shadow-[0_10px_44px_rgb(0,0,0,0.09)] hover:border-black/10 transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
            <div className="flex items-center gap-4 flex-1 min-w-0 px-3 sm:px-5 py-2 sm:py-3">
              <span className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-sm">
                <Monitor className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="text-left min-w-0">
                <p className="text-[15px] sm:text-base font-bold text-neutral-900 tracking-tight truncate">
                  无限画布 · 桌面客户端
                </p>
                <p className="text-xs sm:text-[13px] text-neutral-500 font-light mt-0.5">
                  工程存本机 · 账号与 jepow.com 同步
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="group w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm sm:text-[15px] font-bold rounded-full px-8 sm:px-10 py-4 sm:py-[1.125rem] hover:bg-neutral-800 transition-all active:scale-[0.98] shadow-md sm:mr-1.5"
            >
              <Download className="h-[18px] w-[18px]" strokeWidth={2.5} />
              立即下载
              <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-0.5 transition-transform hidden sm:block" />
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-neutral-400 tracking-wide">
          支持 Windows · macOS
        </p>
      </motion.div>
    </section>
  );
}
