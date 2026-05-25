import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  X,
  User as UserIcon,
  CreditCard,
  Receipt,
  Edit2,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import api from "../lib/api";
import { PhoneBindModal } from "./PhoneBindModal";

interface AccountManagementModalProps {
  user: any;
  onClose: () => void;
  onUpdate: (updatedUser: any) => void;
}

export const AccountManagementModal: React.FC<AccountManagementModalProps> = ({
  user,
  onClose,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<
    "profile" | "subscription" | "billing"
  >("profile");
  const [isUploading, setIsUploading] = useState(false);
  const [showPhoneBindModal, setShowPhoneBindModal] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await api.get("/user/sessions");
      setDevices(res.data);
    } catch (err) {
      console.error("获取设备列表失败", err);
    }
  };

  const removeDevice = async (sessionId: string) => {
    if (!window.confirm("确定要移除此设备吗？移除后对应设备将需要重新登录。"))
      return;
    try {
      await api.post("/user/sessions/remove", { sessionId });
      toast.success("设备已移除");
      fetchDevices();
    } catch (err) {
      toast.error("移除失败");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    setIsUploading(true);
    try {
      const res = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newAvatar = res.data.url;
      const updateRes = await api.post("/user/profile", { avatar: newAvatar });
      onUpdate(updateRes.data.user);
      toast.success("头像更新成功");
    } catch (err) {
      toast.error("上传失败");
    } finally {
      setIsUploading(false);
    }
  };

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
        className="relative w-full max-w-[900px] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto max-h-[90vh] md:h-[650px] z-10"
      >
        <button
          onClick={onClose}
          className="absolute right-6 top-6 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-100/50 hover:bg-neutral-100 rounded-full transition-all z-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Sidebar */}
        <div className="w-full md:w-[35%] bg-neutral-950 p-8 flex flex-col shrink-0 relative overflow-hidden text-white">
          <div className="absolute inset-0 z-0">
            <div className="absolute top-[-10%] left-[-20%] w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-neutral-950/80 to-neutral-950 opacity-60" />
            <div className="absolute bottom-[-10%] right-[-20%] w-[100%] h-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/30 via-transparent to-transparent opacity-40 mix-blend-screen" />
          </div>

          <div className="relative z-10 mb-10">
            <h2 className="text-xl font-black text-white tracking-wide">
              账户管理
            </h2>
          </div>

          <nav className="relative z-10 flex flex-row md:flex-col gap-2 overflow-x-auto scrollbar-hide md:overflow-visible">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold text-xs md:text-sm whitespace-nowrap active:scale-[0.98] ${activeTab === "profile" ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent"}`}
            >
              <UserIcon className="w-5 h-5" />
              个人主页
            </button>
            <button
              onClick={() => setActiveTab("subscription")}
              className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold text-xs md:text-sm whitespace-nowrap active:scale-[0.98] ${activeTab === "subscription" ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent"}`}
            >
              <CreditCard className="w-5 h-5" />
              订阅
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all font-bold text-xs md:text-sm whitespace-nowrap active:scale-[0.98] ${activeTab === "billing" ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent"}`}
            >
              <Receipt className="w-5 h-5" />
              账单
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 bg-white">
          {activeTab === "profile" && (
            <div className="p-8 md:p-12 mb-8">
              <div className="mb-10 mt-6 md:mt-0">
                <h3 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                  账户信息
                </h3>
                <p className="text-sm text-neutral-500 mt-2 font-medium">
                  管理您的个人资料和设备连接。
                </p>
              </div>

              <div className="flex items-center justify-between p-6 bg-neutral-50/50 border border-black/5 rounded-2xl mb-10 hover:shadow-sm transition-all hover:border-black/10">
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-white">
                      <img
                        src={
                          user?.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`
                        }
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-neutral-900 font-black text-xl mb-1 tracking-tight">
                      {user?.username || "Jepow 用户"}
                    </h4>
                    <p className="text-neutral-500 text-sm font-medium">
                      {user?.email || user?.phone || "未绑定邮箱"}
                    </p>
                  </div>
                </div>
                <div className="relative flex items-center h-10 px-5 rounded-xl border border-black/5 bg-white hover:bg-neutral-50 text-sm font-bold text-neutral-900 transition-all cursor-pointer shadow-sm active:scale-95 group">
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2 shrink-0 opacity-50 group-hover:opacity-100" />
                  )}
                  <span>{isUploading ? "正在上传" : "更换头像"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-4 mb-16">
                <div className="flex items-center justify-between p-4 px-6 bg-white border border-black/5 rounded-xl hover:border-black/10 transition-colors">
                  <span className="text-neutral-500 text-xs font-bold tracking-widest uppercase">
                    用户名
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-neutral-900 font-bold">
                      {user?.username || "Jepow 用户"}
                    </span>
                    <button className="text-neutral-400 hover:text-neutral-900 transition-colors p-1.5 bg-black/5 rounded-lg hover:bg-black/10">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 px-6 bg-white border border-black/5 rounded-xl hover:border-black/10 transition-colors">
                  <span className="text-neutral-500 text-xs font-bold tracking-widest uppercase">
                    手机号
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-neutral-900 font-bold">
                      {user?.phone || "未绑定"}
                    </span>
                    <button
                      onClick={() => setShowPhoneBindModal(true)}
                      className="text-neutral-500 hover:text-neutral-900 text-sm font-bold transition-all underline underline-offset-4 decoration-black/20 hover:decoration-black/40"
                    >
                      {user?.phone ? "更换绑定" : "绑定手机"}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 px-6 bg-white border border-black/5 rounded-xl hover:border-black/10 transition-colors">
                  <span className="text-neutral-500 text-xs font-bold tracking-widest uppercase">
                    电子邮箱
                  </span>
                  <span className="text-neutral-900 font-bold">
                    {user?.email || "未绑定"}
                  </span>
                </div>
              </div>

              <h3 className="text-xl font-black text-neutral-900 mb-6 tracking-tight">
                设备管理
              </h3>

              <div className="mb-8">
                <div className="mt-4">
                  <div className="grid grid-cols-[80px_1fr_80px] gap-4 mb-4 text-neutral-500 font-bold text-xs px-4 uppercase tracking-widest">
                    <span>状态</span>
                    <span>设备与位置</span>
                    <span className="text-right">操作</span>
                  </div>
                  <div className="space-y-2">
                    {devices.map((dev) => (
                      <div
                        key={dev.id}
                        className="grid grid-cols-[80px_1fr_80px] gap-4 items-center p-4 bg-neutral-50/50 border border-black/5 hover:border-black/10 hover:shadow-sm transition-all rounded-xl"
                      >
                        <div className="flex items-center gap-4 pl-4">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${dev.isCurrent ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "bg-neutral-300"}`}
                          />
                        </div>
                        <div className="truncate">
                          <span
                            className="text-neutral-900 text-sm font-medium tracking-tight cursor-default"
                            title={`${dev.type} | ${dev.os} | ${dev.browser} | ${dev.source} | ${dev.ip} | ${new Date(dev.date).toLocaleString()}`}
                          >
                            {dev.type} • {dev.os} • {dev.browser}
                            <div className="text-[11px] text-neutral-400 font-medium mt-0.5 tracking-wider uppercase">
                              {dev.ip} | {new Date(dev.date).toLocaleString()}
                            </div>
                          </span>
                        </div>
                        <div className="text-right">
                          {dev.isCurrent ? (
                            <span className="text-neutral-400 text-xs font-bold bg-neutral-100 px-3 py-1.5 rounded-md whitespace-nowrap">
                              当前设备
                            </span>
                          ) : (
                            <button
                              onClick={() => removeDevice(dev.id)}
                              className="px-3 py-1.5 border border-black/10 hover:border-black/30 hover:bg-neutral-100 rounded-md text-neutral-600 hover:text-red-600 text-xs font-bold transition-all whitespace-nowrap shadow-sm"
                            >
                              下线
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {devices.length === 0 && (
                      <div className="p-8 pb-10 text-center flex flex-col items-center justify-center border-2 border-dashed border-black/5 rounded-2xl bg-neutral-50/50">
                        <span className="text-neutral-400 font-medium text-sm">
                          暂无设备记录
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "subscription" && (
            <div className="p-8 md:p-12 mb-8">
              <div className="mb-10 mt-6 md:mt-0">
                <h3 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                  订阅管理
                </h3>
                <p className="text-sm text-neutral-500 mt-2 font-medium">
                  查看和管理您的会员订阅服务。
                </p>
              </div>
              <div className="p-12 bg-neutral-50/50 border-2 border-dashed border-black/10 rounded-2xl text-center text-neutral-400 shadow-sm">
                <CreditCard className="w-8 h-8 mx-auto mb-4 opacity-30" />
                <p className="font-bold text-sm">订阅功能开发中</p>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="p-8 md:p-12 mb-8">
              <div className="mb-10 mt-6 md:mt-0">
                <h3 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
                  账单记录
                </h3>
                <p className="text-sm text-neutral-500 mt-2 font-medium">
                  查看您的历史消费和开票记录。
                </p>
              </div>
              <div className="p-12 bg-neutral-50/50 border-2 border-dashed border-black/10 rounded-2xl text-center text-neutral-400 shadow-sm">
                <Receipt className="w-8 h-8 mx-auto mb-4 opacity-30" />
                <p className="font-bold text-sm">账单功能开发中</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {showPhoneBindModal && (
        <PhoneBindModal
          user={user}
          onClose={() => setShowPhoneBindModal(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
};
