import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, X, Command, ArrowRight } from "lucide-react";
import { UserData } from "../types";
import { motion, AnimatePresence } from "motion/react";
import {
  isDesktopLoginOnWeb,
  redirectDesktopAuthCallback,
} from "../lib/runtime";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: UserData, token: string) => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Form State
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);

  // 倒计时逻辑
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((p) => p - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return toast.error("请输入正确的11位手机号");
    }
    setLoading(true);
    try {
      await api.post("/auth/send-sms", { phone });
      toast.success("验证码已发送，请注意查收");
      setCountdown(60);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "获取验证码失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      return toast.error("请先阅读并同意用户服务协议");
    }
    if (!phone || !code) {
      return toast.error("请填写完整信息");
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/phone-login", { phone, code });
      if (isDesktopLoginOnWeb()) {
        toast.success("登录成功，正在返回桌面软件…");
        redirectDesktopAuthCallback(res.data.token, res.data.user);
        return;
      }
      toast.success("登录成功");
      onSuccess(res.data.user, res.data.token);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "操作失败，请检查输入或重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 lg:p-0">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-neutral-950/20 backdrop-blur-md"
      />

      {/* Main Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative w-full max-w-[800px] z-10 flex shadow-2xl rounded-3xl overflow-hidden bg-white min-h-[500px]"
      >
        {/* Left Side: Branding / Visual */}
        <div className="hidden md:flex w-[40%] bg-neutral-950 p-10 flex-col justify-between relative overflow-hidden text-white">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[-10%] right-[-20%] w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-neutral-950/80 to-neutral-950 opacity-60" />
            <div className="absolute bottom-[-10%] left-[-20%] w-[100%] h-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/30 via-transparent to-transparent opacity-40 mix-blend-screen" />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg">
              <Command className="w-6 h-6 text-black" />
            </div>
            <span className="font-black text-xl tracking-wide">Jepow AI</span>
          </div>

          <div className="relative z-10 mt-20">
            <h3 className="text-3xl font-black mb-4 leading-tight">
              Create What's Next.
            </h3>
            <p className="text-neutral-400 text-sm leading-relaxed mb-8">
              加入 Jepow AI，开启下一代创作范式。用AI增强你的想象力，打破边界。
            </p>
            <div className="flex gap-2">
              <div className="w-2h-2 rounded-full bg-white transition-all shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              <div className="w-2 h-2 rounded-full bg-white/20 transition-all" />
              <div className="w-2 h-2 rounded-full bg-white/20 transition-all" />
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-[60%] bg-white p-8 md:p-12 relative flex flex-col justify-center">
          {isDesktopLoginOnWeb() && (
            <div className="mb-6 p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-xs leading-relaxed">
              您正在为 <strong>Jepow AI 桌面画布</strong> 登录。验证成功后将自动返回软件，账号与积分与网站一致。
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-100/50 hover:bg-neutral-100 rounded-full transition-all z-20"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="mb-10">
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight">
              登录账户
            </h2>
            <p className="text-sm text-neutral-500 mt-2">
              使用手机号快速登录 / 注册 Jepow AI
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">
                手机号
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入 11 位手机号"
                className="bg-neutral-50 border-black/5 hover:border-black/10 h-14 rounded-xl focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:bg-white transition-all text-base px-4 shadow-sm"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">
                验证码
              </Label>
              <div className="relative flex items-center group">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入手机验证码"
                  className="bg-neutral-50 border-black/5 hover:border-black/10 h-14 rounded-xl focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:bg-white transition-all text-base pl-4 pr-[120px] shadow-sm"
                  required
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading || phone.length !== 11}
                  className="absolute right-2 h-10 w-[100px] flex items-center justify-center text-xs font-bold bg-white border border-black/5 text-neutral-900 rounded-lg hover:shadow-md disabled:hover:shadow-none disabled:opacity-50 transition-all active:scale-95"
                >
                  {countdown > 0 ? `${countdown}s 后重新获取` : "获取验证码"}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading || !phone || !code}
                className="w-full h-14 bg-neutral-900 hover:bg-black text-white font-bold text-base tracking-widest rounded-xl transition-all shadow-xl shadow-black/10 active:scale-[0.98] flex items-center justify-center group disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span className="mb-0.5">继 续</span>
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>

            <div className="pt-2 mt-4 flex items-start gap-3 bg-neutral-50/50 p-4 rounded-xl border border-black/5">
              <div className="flex items-center h-5 pt-0.5">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 rounded-md border-black/20 text-black focus:ring-black focus:ring-offset-0 bg-white transition-all cursor-pointer"
                />
              </div>
              <Label
                htmlFor="terms"
                className="text-[11px] text-neutral-500 font-medium leading-relaxed cursor-pointer select-none"
              >
                我已阅读并同意
                <a
                  href="#"
                  className="text-black font-bold hover:underline mx-1"
                >
                  综合服务协议
                </a>
                、
                <a
                  href="#"
                  className="text-black font-bold hover:underline mx-1"
                >
                  隐私权政策
                </a>{" "}
                及
                <a
                  href="#"
                  className="text-black font-bold hover:underline ml-1"
                >
                  AI 创作公约
                </a>
                。未注册的手机号验证后将自动创建 Jepow AI 账户。
              </Label>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
