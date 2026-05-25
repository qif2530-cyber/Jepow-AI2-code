import React, { useState, useEffect } from "react";
import { Phone, ShieldCheck, Loader2, X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import api from "../lib/api";

export function ChangePhoneModal({
  onClose,
  userPhone,
  onSuccess,
}: {
  onClose: () => void;
  userPhone: string;
  onSuccess: (newPhone: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [oldCode, setOldCode] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCode, setNewCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [changeToken, setChangeToken] = useState("");

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((p) => p - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendOldCode = async () => {
    setLoading(true);
    try {
      await api.post("/auth/send-sms", { phone: userPhone });
      toast.success("验证码已发送至原手机号");
      setCountdown(60);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOldCode = async () => {
    if (!oldCode) return toast.error("请输入验证码");
    setLoading(true);
    try {
      const res = await api.post("/user/verify-old-phone", { code: oldCode });
      setChangeToken(res.data.changeToken);
      setStep(2);
      setCountdown(0);
      setOldCode("");
      toast.success("验证成功，请输入新手机号");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "验证失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSendNewCode = async () => {
    if (!newPhone || !/^1[3-9]\d{9}$/.test(newPhone)) {
      return toast.error("请输入正确的11位手机号");
    }
    setLoading(true);
    try {
      await api.post("/auth/send-sms", { phone: newPhone });
      toast.success("验证码已发送至新手机号");
      setCountdown(60);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const handleBindNewPhone = async () => {
    if (!newPhone || !newCode) return toast.error("请填写完整信息");
    setLoading(true);
    try {
      const res = await api.post("/user/bind-phone", {
        phone: newPhone,
        code: newCode,
        changeToken,
      });
      toast.success("手机号换绑成功！");
      onSuccess(res.data.phone);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "绑定失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/80 " />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-[400px] z-10"
      >
        <Card className="bg-white border-black/5 shadow-2xl overflow-hidden rounded-md">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-neutral-900/40 hover:text-neutral-900 bg-white/60 hover:bg-black/10 rounded-full transition-all z-20"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-8 pt-10 pb-6 relative text-center">
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-md bg-white border border-black/10 shadow-inner flex items-center justify-center mb-4">
                <Phone className="w-8 h-8 text-neutral-900/80" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 tracking-wide">
                换绑手机号
              </h2>
              <p className="text-xs text-neutral-500 mt-2">
                {step === 1
                  ? "为了安全，请先验证当前绑定的手机号"
                  : "绑定新手机号作为您的通讯链路"}
              </p>
            </div>
          </div>

          <CardContent className="px-8 pb-10">
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                      当前手机号
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                      <Input
                        value={userPhone.replace(
                          /(\d{3})\d{4}(\d{4})/,
                          "$1****$2",
                        )}
                        disabled
                        className="bg-black/5 border-black/5 h-12 pl-12 rounded-md text-neutral-600 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                      验证码
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 focus-within:text-neutral-900 transition-colors" />
                        <Input
                          value={oldCode}
                          onChange={(e) => setOldCode(e.target.value)}
                          placeholder="输入验证码"
                          className="bg-black/50 border-black/5 h-12 pl-12 rounded-md focus:border-black/20 focus:ring-0 transition-all text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleSendOldCode}
                        disabled={countdown > 0 || loading}
                        className="h-12 px-4 bg-black/5 hover:bg-black/10 text-neutral-900 border border-black/10 rounded-md transition-all w-[90px]"
                      >
                        {countdown > 0 ? `${countdown}s` : "发送"}
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleVerifyOldCode}
                    disabled={loading || !oldCode}
                    className="w-full h-12 bg-white text-black hover:bg-neutral-200 rounded-md font-bold tracking-wide mt-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        下一步 <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                      新手机号
                    </Label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-neutral-900 transition-colors" />
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+86 1XX XXXX XXXX"
                        className="bg-black/50 border-black/5 h-12 pl-12 rounded-md focus:border-black/20 focus:ring-0 transition-all text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">
                      验证码
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1 group">
                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-neutral-900 transition-colors" />
                        <Input
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value)}
                          placeholder="新手机验证码"
                          className="bg-black/50 border-black/5 h-12 pl-12 rounded-md focus:border-black/20 focus:ring-0 transition-all text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleSendNewCode}
                        disabled={countdown > 0 || loading || !newPhone}
                        className="h-12 px-4 bg-black/5 hover:bg-black/10 text-neutral-900 border border-black/10 rounded-md transition-all w-[90px]"
                      >
                        {countdown > 0 ? `${countdown}s` : "发送"}
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleBindNewPhone}
                    disabled={loading || !newPhone || !newCode}
                    className="w-full h-12 bg-white text-black hover:bg-neutral-200 rounded-md font-bold tracking-wide mt-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "确认换绑"
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
