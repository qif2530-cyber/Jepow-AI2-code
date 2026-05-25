import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { CreditCard, X, Check, Loader2 } from "lucide-react";
import { UserData } from "../types";
import { QRCodeSVG } from "qrcode.react";
import api from "../lib/api";
import { toast } from "sonner";

interface RechargeModalProps {
  user: UserData;
  initialPkg?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function RechargeModal({
  user,
  initialPkg,
  onClose,
  onSuccess,
}: RechargeModalProps) {
  const [selectedPkg, setSelectedPkg] = useState<any>(initialPkg || null);
  const [method, setMethod] = useState<"alipay" | "wechat" | null>(null);
  const [loading, setLoading] = useState(false);
  const [payData, setPayData] = useState<{
    orderId: string;
    payUrl?: string;
    codeUrl?: string;
  } | null>(null);

  const handleCreateOrder = async (m: "alipay" | "wechat") => {
    if (!selectedPkg) return;
    setMethod(m);
    setLoading(true);
    try {
      // price string like "¥19.9", convert to cents/yuan. For simulation we use pkg.amount as weight
      const res = await api.post("/api/pay/create", {
        amount: selectedPkg.amount,
        method: m,
        price: selectedPkg.price,
      });
      setPayData(res.data);
      if (m === "alipay" && res.data.payUrl) {
        // Alipay usually returns a form or a URL to redirect
        // For simulation/debug we'll just show it
        if (res.data.payUrl.startsWith("http")) {
          // In a real app we'd window.open or redirect
          // window.open(res.data.payUrl, '_blank');
        }
      }
    } catch (err: any) {
      toast.error("创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  const packages = [
    { amount: 1000, price: "¥19.9" },
    { amount: 5000, price: "¥89.9" },
    { amount: 12000, price: "¥199" },
    { amount: 30000, price: "¥459" },
  ];

  return (
    <div className="fixed inset-0 z-[110000] flex items-center justify-center bg-neutral-950/20 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div className="relative w-full max-w-[440px] z-10 flex flex-col shadow-2xl rounded-[32px] overflow-hidden bg-neutral-950 text-white min-h-[400px]">
        {/* Background Gradients */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] right-[-20%] w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-neutral-950/80 to-neutral-950 opacity-60" />
          <div className="absolute bottom-[-10%] left-[-20%] w-[100%] h-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-transparent to-transparent opacity-40 mix-blend-screen" />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-20 text-neutral-400 hover:text-white transition-all hover:bg-white/10 rounded-full p-2"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative z-10 p-10 flex flex-col h-full mt-2">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-center mb-2 tracking-tight">
            {payData ? "扫码支付" : "能量充值"}
          </h3>
          <p className="text-sm font-medium text-neutral-400 text-center mb-8">
            {payData
              ? "使用对应App扫描下方二维码进行支付"
              : "选择适合您的能量包，继续精彩创作"}
          </p>

          <div className="flex-1 space-y-6">
            {!payData ? (
              <>
                {!selectedPkg ? (
                  <div className="grid grid-cols-2 gap-4">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.amount}
                        className="group flex flex-col items-center justify-center gap-1.5 p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-300 active:scale-95 shadow-sm"
                        onClick={() => setSelectedPkg(pkg)}
                      >
                        <span className="text-xl font-black text-white group-hover:scale-105 transition-transform tracking-tight">
                          {pkg.amount} <span className="text-sm">能量</span>
                        </span>
                        <span className="text-[13px] font-bold text-neutral-400 group-hover:text-neutral-200">
                          {pkg.price}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">
                          已选套餐
                        </p>
                        <p className="text-2xl font-black text-white tracking-tight">
                          {selectedPkg.amount} 能量
                        </p>
                      </div>
                      <p className="text-2xl font-black text-emerald-400 drop-shadow-md">
                        {selectedPkg.price}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-2">
                      <Button
                        onClick={() => handleCreateOrder("alipay")}
                        disabled={loading}
                        className="h-14 bg-[#00A0E9] hover:bg-[#0080C9] text-white rounded-xl font-bold gap-3 text-[15px] border border-blue-400/20 shadow-[0_4px_20px_rgba(0,160,233,0.3)] transition-all overflow-hidden relative group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] transition-transform duration-500 group-hover:translate-x-[150%]" />
                        {loading && method === "alipay" ? (
                          <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                        ) : (
                          <img
                            src="https://img.icons8.com/color/48/alipay.png"
                            className="w-6 h-6 bg-white rounded-md p-0.5 relative z-10"
                          />
                        )}
                        <span className="relative z-10">使用支付宝支付</span>
                      </Button>
                      <Button
                        onClick={() => handleCreateOrder("wechat")}
                        disabled={loading}
                        className="h-14 bg-[#07C160] hover:bg-[#06AE56] text-white rounded-xl font-bold gap-3 text-[15px] border border-green-400/20 shadow-[0_4px_20px_rgba(7,193,96,0.3)] transition-all overflow-hidden relative group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[150%] transition-transform duration-500 group-hover:translate-x-[150%]" />
                        {loading && method === "wechat" ? (
                          <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                        ) : (
                          <img
                            src="https://img.icons8.com/color/48/wechat--v1.png"
                            className="w-6 h-6 bg-white rounded-md p-0.5 relative z-10"
                          />
                        )}
                        <span className="relative z-10">使用微信支付</span>
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedPkg(null)}
                        className="mt-2 text-neutral-400 hover:text-white font-bold h-12 rounded-xl transition-colors tracking-widest text-sm"
                      >
                        重新选择套餐
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-8 animate-in zoom-in-95 duration-300 pb-4">
                <div className="p-4 bg-white rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                  <QRCodeSVG
                    value={payData.codeUrl || payData.payUrl || ""}
                    size={200}
                    level="H"
                    includeMargin
                  />
                </div>
                <div className="text-center space-y-2 pb-2">
                  <p className="text-neutral-400 font-mono text-sm tracking-wider">
                    订单号: {payData.orderId}
                  </p>
                </div>
                <div className="flex gap-4 w-full">
                  <Button
                    onClick={() => setPayData(null)}
                    variant="ghost"
                    className="flex-1 h-12 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 font-bold tracking-widest transition-all"
                  >
                    返回修改
                  </Button>
                  <Button
                    onClick={() => {
                      toast.success("模拟支付成功！能量已到账。");
                      onSuccess();
                      onClose();
                    }}
                    className="flex-1 h-12 bg-white text-black hover:bg-neutral-200 rounded-xl font-black tracking-widest shadow-xl shadow-white/10 transition-all"
                  >
                    已完成支付
                  </Button>
                </div>
              </div>
            )}

            <div className="pt-6 mt-6 border-t border-white/10">
              <p className="text-xs text-neutral-600 text-center font-bold tracking-widest uppercase leading-relaxed">
                充值即表示您同意我们的
                <br className="hidden md:block" />
                <a
                  href="#"
                  className="underline underline-offset-4 decoration-neutral-600/50 hover:text-neutral-400 transition-colors ml-1 mr-1"
                >
                  服务条款
                </a>
                和
                <a
                  href="#"
                  className="underline underline-offset-4 decoration-neutral-600/50 hover:text-neutral-400 transition-colors ml-1"
                >
                  隐私协议
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
