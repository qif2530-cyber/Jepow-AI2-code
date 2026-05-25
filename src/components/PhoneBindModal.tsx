import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import api from "../lib/api";

interface PhoneBindModalProps {
  user: any;
  onClose: () => void;
  onUpdate: (updatedUser: any) => void;
}

export const PhoneBindModal: React.FC<PhoneBindModalProps> = ({
  user,
  onClose,
  onUpdate,
}) => {
  const [step, setStep] = useState(user?.phone ? 1 : 2); // 1: Verify Old, 2: Bind New
  const [phone, setPhone] = useState(user?.phone || "");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    const targetPhone = step === 1 ? user?.phone : phone;
    if (!targetPhone || !/^1[3-9]\d{9}$/.test(targetPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setIsSending(true);
    try {
      await api.post("/auth/send-sms", { phone: targetPhone });
      toast.success("验证码已发送");
      setCountdown(60);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "发送失败");
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifyOld = async () => {
    if (!code) return toast.error("请输入验证码");
    setIsSubmitting(true);
    try {
      // Very basic verify code check using our mock backend
      await api.post("/auth/verify-code", { phone: user.phone, code });
      setStep(2);
      setPhone("");
      setCode("");
      setCountdown(0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "验证失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBindNew = async () => {
    if (!phone || !code) return toast.error("请输入手机号和验证码");
    setIsSubmitting(true);
    try {
      const res = await api.post("/user/bind-phone", { phone, code });
      onUpdate(res.data.user);
      toast.success("手机号换绑成功");
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "绑定失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[400000] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-8 border border-black/10 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-neutral-900/50 hover:text-neutral-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-neutral-900 mb-6">
          {step === 1
            ? "验证原手机号"
            : user?.phone
              ? "绑定新手机号"
              : "绑定手机号"}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-900/60 mb-2">
              手机号
            </label>
            <input
              type="text"
              value={step === 1 ? user?.phone : phone}
              onChange={(e) => step === 2 && setPhone(e.target.value)}
              disabled={step === 1}
              className="w-full bg-white border border-black/10 rounded-lg px-4 py-2 text-neutral-900 disabled:opacity-50"
              placeholder="请输入手机号"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-900/60 mb-2">
              验证码
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 bg-white border border-black/10 rounded-lg px-4 py-2 text-neutral-900"
                placeholder="请输入验证码"
              />
              <Button
                variant="outline"
                className="w-28 shrink-0 border-black/10 text-neutral-900"
                onClick={handleSendCode}
                disabled={countdown > 0 || isSending}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s`
                ) : (
                  "获取验证码"
                )}
              </Button>
            </div>
          </div>

          <Button
            className="w-full mt-6 bg-white text-black hover:bg-white/90"
            onClick={step === 1 ? handleVerifyOld : handleBindNew}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "确认"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
