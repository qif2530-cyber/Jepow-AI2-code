import React, { useState, useEffect } from "react";
import { Phone, ShieldCheck, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api from "../lib/api";

export function BindPhoneModal({
  onSuccess,
}: {
  onSuccess: (phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

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
    if (!phone || !code) return toast.error("请填写完整信息");
    setLoading(true);
    try {
      const res = await api.post("/user/bind-phone", { phone, code });
      toast.success("手机号绑定成功！");
      onSuccess(res.data.phone);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "绑定失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/90 " />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-[440px] z-10"
      >
        <Card className="bg-white border-black/5 shadow-2xl overflow-hidden rounded-[2rem]">
          <div className="px-10 pt-12 pb-8 relative text-center">
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 rounded-md bg-white border border-black/10 shadow-inner flex items-center justify-center mb-6">
                <Phone
                  className="w-10 h-10 text-neutral-900/80"
                  strokeWidth={1}
                />
              </div>
              <h2 className="text-3xl font-semibold text-neutral-900 tracking-tight">
                绑定手机号
              </h2>
              <p className="text-sm text-neutral-500 mt-2 font-light">
                为保障账号安全，请先绑定您的通讯链路，不绑定将无法继续使用本账号。
              </p>
            </div>
          </div>

          <CardContent className="px-10 pb-12">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                  手机号
                </Label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-neutral-900 transition-colors" />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+86 1XX XXXX XXXX"
                    className="bg-black/50 border-black/5 h-14 pl-12 rounded-md focus:border-black/20 focus:ring-0 transition-all text-sm"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                  短信验证码
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1 group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-neutral-900 transition-colors" />
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="验证码"
                      className="bg-black/50 border-black/5 h-14 pl-12 rounded-md focus:border-black/20 focus:ring-0 transition-all text-sm"
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading}
                    className="h-14 px-6 bg-black/5 hover:bg-black/10 text-neutral-900 border border-black/10 rounded-md transition-all"
                  >
                    {countdown > 0 ? (
                      `${countdown}s`
                    ) : loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "发送"
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-white text-black hover:bg-neutral-200 rounded-md font-medium tracking-wide mt-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "立即绑定"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
