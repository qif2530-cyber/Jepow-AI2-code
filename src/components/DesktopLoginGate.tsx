import React, { useState } from "react";
import { Command, Loader2, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { openJepowWeb, getDesktopLoginUrl } from "../lib/runtime";

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
    <div className="h-screen w-screen flex items-center justify-center bg-neutral-950 text-white p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-2xl">
            <Command className="w-9 h-9 text-black" />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-black tracking-tight">Jepow AI 无限画布</h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            请使用已在 jepow.com 注册的账号登录。点击后将打开浏览器完成登录，成功后自动返回本软件。
          </p>
        </div>
        <Button
          size="lg"
          className="w-full h-12 bg-white text-black hover:bg-neutral-200 font-bold"
          onClick={handleLogin}
          disabled={opening || waiting}
        >
          {opening || waiting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              等待浏览器登录…
            </>
          ) : (
            <>
              <ExternalLink className="w-5 h-5 mr-2" />
              前往网站登录
            </>
          )}
        </Button>
        <p className="text-[11px] text-neutral-500">
          登录页：{getDesktopLoginUrl()}
        </p>
      </div>
    </div>
  );
}
