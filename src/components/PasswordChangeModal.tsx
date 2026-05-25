import React, { useState } from "react";
import { X, Lock, ShieldCheck, Mail, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import api from "../lib/api";

interface PasswordChangeModalProps {
  onClose: () => void;
  userPhone: string | null;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  onClose,
  userPhone,
}) => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState(userPhone || "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSendCode = async () => {
    if (!phone) {
      toast.error("Phone required");
      return;
    }
    setIsSending(true);
    try {
      await api.post("/auth/send-sms", { phone });
      toast.success("短信已发送");
      setStep(2);
    } catch (err: any) {
      toast.error("发送失败");
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    if (!code) {
      toast.error("Code required");
      return;
    }
    setIsVerifying(true);
    try {
      await api.post("/auth/verify-code", { phone, code });
      toast.success("Verified");
      setStep(3);
    } catch (err: any) {
      toast.error("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password too short");
      return;
    }
    setIsSaving(true);
    try {
      await api.post("/user/profile", {
        password: newPassword,
        phone,
        code,
      });
      toast.success("Password updated");
      onClose();
    } catch (err: any) {
      toast.error("Update failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/90 z-[300001] flex items-center justify-center p-4">
      <div className="bg-[#F9FAFB] w-full max-w-sm rounded flex flex-col border border-black/10 relative">
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <h2 className="text-xs font-bold text-neutral-900 tracking-widest">
            安全验证
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center hover:bg-black/5 rounded text-neutral-500 hover:text-neutral-900"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p className="text-[10px] text-neutral-500">
                  步骤 1: 验证手机号
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-transparent border-black/10 text-xs font-mono"
                  />
                </div>
                <Button
                  onClick={handleSendCode}
                  disabled={isSending || !phone}
                  className="w-full h-10 bg-white text-black font-bold text-xs tracking-widest"
                >
                  {isSending ? "发送中..." : "发送验证码"}
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p className="text-[10px] text-neutral-500">
                  步骤 2: 输入验证码
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    className="bg-transparent border-black/10 text-center tracking-[0.5em] font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying || code.length < 4}
                  className="w-full h-10 bg-white text-black font-bold text-xs tracking-widest"
                >
                  {isVerifying ? "验证中..." : "验证身份"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="w-full text-[10px] text-neutral-500 hover:text-neutral-900 tracking-widest"
                >
                  <span className="opacity-50">上一步</span>
                </Button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p className="text-[10px] text-neutral-500">
                  步骤 3: 设置新密码
                </p>
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="至少含有 6 个字符"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-transparent border-black/10 text-xs font-mono"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving || newPassword.length < 6}
                  className="w-full h-10 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs tracking-widest"
                >
                  {isSaving ? "修改中..." : "确认修改"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
