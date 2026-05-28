import React, { useState } from "react";
import { Loader2, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { openJepowWeb, getDesktopLoginUrl } from "../lib/runtime";
import { Logo } from "./Logo";

interface DesktopLoginGateProps {
  onOpenLogin: () => void;
  waiting?: boolean;
}

export function DesktopLoginGate({
  onOpenLogin,
  waiting = false,
}: DesktopLoginGateProps) {
  const [opening, setOpening] = useState(false);

  const handleLogin = async () => {
    setOpening(true);
    try {
      await onOpenLogin();
    } finally {
      setTimeout(() => setOpening(false), 800);
    }
  };

  return (
    <div className="w-[720px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-[#3d3d3d] bg-[#202124] text-[#d8d8d8] shadow-2xl">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes jepowLoginLineA {
              0% { transform: translate3d(-18%, 18%, 0) rotate(0deg) scale(0.95); opacity: .2; }
              45% { opacity: .95; }
              100% { transform: translate3d(18%, -16%, 0) rotate(150deg) scale(1.18); opacity: .38; }
            }
            @keyframes jepowLoginLineB {
              0% { transform: translate3d(16%, -14%, 0) rotate(180deg) scale(1); opacity: .18; }
              50% { opacity: .86; }
              100% { transform: translate3d(-16%, 14%, 0) rotate(20deg) scale(1.2); opacity: .34; }
            }
            @keyframes jepowLoginPulse {
              0%, 100% { opacity: .34; filter: blur(24px); transform: scale(.95); }
              50% { opacity: .9; filter: blur(12px); transform: scale(1.08); }
            }
          `,
        }}
      />
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[#343434] bg-[#2b2c2f]">
        <div className="flex items-center gap-3">
          <Logo className="w-6 h-6" />
          <span className="text-[13px] font-semibold tracking-tight text-white">Jepow AI</span>
          <span className="hidden text-[11px] font-medium text-[#8c8c8c] sm:inline">
            无限画布
          </span>
        </div>
        <button
          type="button"
          onClick={() => openJepowWeb("/")}
          className="text-[11px] text-[#9a9a9a] hover:text-white flex items-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </header>

      <main className="relative h-[390px] min-h-[360px] overflow-hidden bg-[#111214]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(54,211,255,0.26),transparent_34%),radial-gradient(circle_at_76%_74%,rgba(190,107,255,0.24),transparent_34%),#111214]" />
        <div className="absolute inset-[-18%] opacity-90">
          <div className="absolute left-[8%] top-[26%] h-[2px] w-[86%] rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent" style={{ animation: "jepowLoginLineA 5s ease-in-out infinite alternate" }} />
          <div className="absolute left-[12%] top-[58%] h-[2px] w-[80%] rounded-full bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent" style={{ animation: "jepowLoginLineB 5s ease-in-out infinite alternate" }} />
          <div className="absolute left-[14%] top-[22%] h-48 w-48 rounded-full bg-blue-500/25" style={{ animation: "jepowLoginPulse 2.6s ease-in-out infinite" }} />
          <div className="absolute right-[10%] bottom-[18%] h-56 w-56 rounded-full bg-fuchsia-500/22" style={{ animation: "jepowLoginPulse 3s ease-in-out infinite" }} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-[#111214]/78" />

        <div className="absolute bottom-[96px] left-5 max-w-[74%]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/25 px-2.5 py-1 backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-[#8bc34a]" />
            <span className="text-[11px] font-semibold text-[#d7f5c0]">
              启动校验
            </span>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight text-white">
            Jepow AI 无限画布
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-[#c4ccdc]">
            登录并校验账号后才可操作工作区。登录会在浏览器完成，成功后自动返回软件。
          </p>
        </div>

        <div className="relative z-10 mt-auto flex h-full flex-col justify-end">
          <div className="flex flex-col gap-4 bg-[#202124]/78 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[#3a3a3a] bg-[#111214]">
                <ShieldCheck className="h-5 w-5 text-[#8bc34a]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold tracking-tight text-white">
                  {waiting ? "等待浏览器验证" : "欢迎使用 Jepow AI"}
                </h2>
                <p className="mt-1 truncate text-[11px] text-[#9a9a9a]">
                  登录地址：{getDesktopLoginUrl()}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-9 shrink-0 rounded bg-[#3f6db5] px-5 text-[12px] font-semibold text-white hover:bg-[#4c7ccc]"
              onClick={handleLogin}
              disabled={opening}
            >
              {opening ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  正在打开
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {waiting ? "重新打开登录" : "登录"}
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
