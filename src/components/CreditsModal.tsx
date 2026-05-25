import React from "react";
import { motion } from "motion/react";
import { X, Zap, CreditCard, History, Plus, Loader2 } from "lucide-react";
import { UserData } from "../types";

interface Transaction {
  id: string;
  type: "increase" | "decrease";
  amount: number;
  reason: string;
  date: string;
}

interface CreditsModalProps {
  user: UserData | null;
  creditsTab: "recharge" | "history";
  setCreditsTab: (tab: "recharge" | "history") => void;
  loadingTransactions: boolean;
  transactions: Transaction[];
  onClose: () => void;
  onRecharge: (pkg?: any) => void;
}

export function CreditsModal({
  user,
  creditsTab,
  setCreditsTab,
  loadingTransactions,
  transactions,
  onClose,
  onRecharge,
}: CreditsModalProps) {
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 lg:p-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-neutral-950/20 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative w-full max-w-[850px] bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto max-h-[90vh] md:h-[600px] z-10"
      >
        {/* Left Side: Branding / Navigation */}
        <div className="w-full md:w-[35%] bg-neutral-950 p-8 flex flex-col shrink-0 relative overflow-hidden text-white">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[-10%] right-[-20%] w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/40 via-neutral-950/80 to-neutral-950 opacity-60" />
            <div className="absolute bottom-[-10%] left-[-20%] w-[100%] h-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900/30 via-transparent to-transparent opacity-40 mix-blend-screen" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <h3 className="text-xl font-black tracking-wide text-white">
                能量管理
              </h3>
            </div>

            <div className="flex flex-row md:flex-col gap-2 overflow-x-auto scrollbar-hide md:overflow-visible mb-6 md:mb-0">
              <button
                onClick={() => setCreditsTab("recharge")}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold text-xs md:text-sm whitespace-nowrap active:scale-[0.98] ${creditsTab === "recharge" ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent"}`}
              >
                <CreditCard className="w-5 h-5" /> 能量充值
              </button>
              <button
                onClick={() => setCreditsTab("history")}
                className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold text-xs md:text-sm whitespace-nowrap active:scale-[0.98] ${creditsTab === "history" ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent"}`}
              >
                <History className="w-5 h-5" /> 能量记录
              </button>
            </div>
          </div>

          <div className="mt-auto hidden md:block pt-6 relative z-10 border-t border-white/10">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              可用能量{" "}
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse" />
            </div>
            <div className="text-5xl font-black text-white tracking-tighter drop-shadow-md">
              {user?.credits || 0}
            </div>
          </div>

          {/* Mobile Current Balance */}
          <div className="md:hidden relative z-10 flex items-center justify-between p-5 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 mt-4">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
              可用能量{" "}
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            </div>
            <div className="text-2xl font-black text-white">
              {user?.credits || 0}
            </div>
          </div>
        </div>

        {/* Right Side: Content */}
        <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar bg-neutral-900 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-800 rounded-full transition-all z-20"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="mb-10">
            <h4 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              {creditsTab === "recharge" ? "充值方案" : "能量记录"}
            </h4>
            <p className="text-sm text-neutral-500 mt-2 font-medium">
              {creditsTab === "recharge"
                ? "选择适合您的能量包，释放创作潜能。"
                : "查看您最近的能量变动历史。"}
            </p>
          </div>

          {creditsTab === "recharge" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5 mb-6">
              {[
                {
                  amount: 1000,
                  price: "¥19.9",
                  label: "基础包",
                  desc: "适合体验和轻度创作",
                },
                {
                  amount: 5000,
                  price: "¥89.9",
                  label: "专业包",
                  hot: true,
                  desc: "创作者优选，性价比高",
                },
                {
                  amount: 12000,
                  price: "¥199",
                  label: "终极包",
                  desc: "工作室及重度用户适用",
                },
              ].map((pkg) => (
                <div
                  key={pkg.amount}
                  onClick={() => onRecharge(pkg)}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 group cursor-pointer relative flex flex-col ${pkg.hot ? "border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 shadow-[0_10px_30px_rgba(251,191,36,0.15)]" : "border-neutral-700 bg-neutral-800 hover:border-neutral-600 hover:bg-neutral-700 hover:shadow-md"}`}
                >
                  {pkg.hot && (
                    <div className="absolute top-0 right-4 bg-amber-400 text-amber-950 text-[10px] font-black px-3 py-1 rounded-b-lg shadow-sm uppercase tracking-widest translate-y-[-1px]">
                      热门推荐
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div
                        className={`text-xs font-black uppercase tracking-widest mb-1 ${pkg.hot ? "text-amber-600" : "text-neutral-500"}`}
                      >
                        {pkg.label}
                      </div>
                      <div className="text-[11px] font-medium text-neutral-400">
                        {pkg.desc}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-4">
                    <div className="text-3xl font-black text-white tracking-tighter">
                      {pkg.amount}
                    </div>
                    <div className="text-neutral-400 font-bold text-xs uppercase">
                      ENG
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-neutral-700 flex items-center justify-between">
                    <div className="text-white font-black text-xl tracking-tight">
                      {pkg.price}
                    </div>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${pkg.hot ? "bg-amber-400 text-amber-950 group-hover:scale-110 shadow-md" : "bg-neutral-900 border border-neutral-700 text-neutral-400 group-hover:border-neutral-600 group-hover:text-white group-hover:bg-neutral-800"}`}
                    >
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 relative min-h-[300px]">
              {loadingTransactions ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="font-bold text-xs tracking-widest uppercase">
                    正在同步...
                  </p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 bg-neutral-800/50 rounded-2xl border-2 border-dashed border-neutral-700">
                  <History className="w-10 h-10 mb-4 opacity-50" />
                  <p className="font-bold text-xs tracking-widest uppercase">
                    暂无记录
                  </p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[400px] pr-2 space-y-3 custom-scrollbar">
                  {transactions.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 bg-neutral-800 rounded-xl border border-neutral-700 hover:border-neutral-600 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${item.type === "increase" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-neutral-700 border-neutral-600 text-neutral-400"}`}
                        >
                          {item.type === "increase" ? (
                            <Plus className="w-5 h-5" />
                          ) : (
                            <History className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white group-hover:text-white transition-colors">
                            {item.reason}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-medium mt-1 uppercase tracking-wider">
                            {new Date(item.date).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-lg font-black tracking-tighter ${item.type === "increase" ? "text-amber-600" : "text-neutral-500"}`}
                      >
                        {item.type === "increase" ? "+" : "-"}
                        {item.amount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
