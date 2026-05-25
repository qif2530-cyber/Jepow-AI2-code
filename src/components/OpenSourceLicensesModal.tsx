import React from "react";
import { X, Scale, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  GPL_SOURCE_OFFER_TEXT,
  GPL_TRADEMARK_NOTE,
  JEPOW_OSS_ENTRIES,
} from "../lib/legal/oss-licenses";
import { isDesktopApp } from "../lib/runtime";

interface OpenSourceLicensesModalProps {
  open: boolean;
  onClose: () => void;
}

export function OpenSourceLicensesModal({
  open,
  onClose,
}: OpenSourceLicensesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200001] flex items-center justify-center p-6 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col bg-white rounded-2xl shadow-2xl border border-black/10"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-neutral-700" />
                <h2 className="text-lg font-semibold text-neutral-900">
                  开源许可
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-4 text-sm text-neutral-700">
              <p className="text-neutral-600 leading-relaxed">
                Jepow AI 桌面端默认使用 <strong className="font-medium">MIT</strong>{" "}
                授权的 <code className="text-xs bg-neutral-100 px-1 rounded">jepow-engine</code>{" "}
                作交互视口，<strong className="font-medium">不</strong>在运行时启动 Blender 程序。
              </p>

              <ul className="space-y-3">
                {JEPOW_OSS_ENTRIES.map((e) => (
                  <li
                    key={e.id}
                    className={`rounded-xl border p-3 ${
                      e.gpl
                        ? "border-amber-200/80 bg-amber-50/50"
                        : "border-black/8 bg-neutral-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-neutral-900">
                        {e.name}
                      </span>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded ${
                          e.gpl
                            ? "bg-amber-100 text-amber-900"
                            : "bg-neutral-200/80 text-neutral-800"
                        }`}
                      >
                        {e.license}
                      </span>
                    </div>
                    <p className="mt-1 text-neutral-600">{e.role}</p>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-neutral-500 hover:text-neutral-900"
                      >
                        详情 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>

              {isDesktopApp() && (
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-3 text-xs leading-relaxed text-amber-950/90">
                  <p className="font-medium mb-1">GPL 源码提供（Cycles 组件）</p>
                  <p>{GPL_SOURCE_OFFER_TEXT}</p>
                  <p className="mt-2 opacity-80">{GPL_TRADEMARK_NOTE}</p>
                </div>
              )}

              <p className="text-xs text-neutral-400">
                完整第三方列表见仓库{" "}
                <code className="bg-neutral-100 px-1 rounded">
                  THIRD_PARTY_NOTICES.md
                </code>
                ；GPL 全文见{" "}
                <code className="bg-neutral-100 px-1 rounded">COPYING.GPL</code>
                。
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
