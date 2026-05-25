import React, { useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Loader2,
  Settings2,
  X,
  Sparkles,
  ShieldCheck,
  Lock,
  UserCheck,
  Ban,
  History as HistoryIcon,
} from "lucide-react";
import { UserData } from "../types";

interface UserActionModalProps {
  user: UserData;
  currentUser: UserData;
  onClose: () => void;
  onUpdate: () => void;
}

export function UserActionModal({
  user,
  currentUser,
  onClose,
  onUpdate,
}: UserActionModalProps) {
  const [credits, setCredits] = useState(user.credits);
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status || "active");
  const [permissions, setPermissions] = useState<string[]>(
    user.permissions || [],
  );
  const [loading, setLoading] = useState(false);

  const isSuperAdmin =
    currentUser.role === "super_admin" ||
    currentUser.email === "qif2530@gmail.com";

  const togglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleReleasePhone = async () => {
    if (!window.confirm("确定要释放该用户的手机号吗？")) return;
    setLoading(true);
    try {
      await api.post(`/admin/users/${user.id}/release-phone`);
      toast.success("手机号已释放");
      onUpdate();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Update credits if changed
      if (credits !== user.credits) {
        await api.post("/admin/users/update-credits", {
          userId: user.id,
          amount: credits,
          type: "set",
        });
      }

      // Update role if changed (Super Admin only)
      if (role !== user.role && isSuperAdmin) {
        await api.post("/admin/users/update-role", {
          userId: user.id,
          role,
        });
      }

      // Update permissions if changed (Super Admin only)
      if (
        JSON.stringify(permissions) !==
          JSON.stringify(user.permissions || []) &&
        isSuperAdmin
      ) {
        await api.post("/admin/users/update-permissions", {
          userId: user.id,
          permissions,
        });
      }

      // Update status if changed
      if (status !== (user.status || "active")) {
        await api.post("/admin/users/update-status", {
          userId: user.id,
          status,
        });
      }

      toast.success("用户资料同步成功");
      onUpdate();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "同步失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[50000] bg-neutral-950/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-[32px] overflow-hidden flex flex-col shadow-2xl relative">
        <div className="flex-none flex items-center justify-between border-b border-black/5 px-10 py-8 bg-white relative z-10 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-[28px] bg-white border-4 border-neutral-100 shadow-md flex items-center justify-center text-3xl font-black text-neutral-900 overflow-hidden relative group">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                user.username[0]
              )}
            </div>
            <div>
              <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3">
                {user.username}
                <span className="text-[10px] text-neutral-500 font-bold tracking-[0.2em] bg-neutral-100 px-3 py-1.5 rounded-lg uppercase">
                  UID: {user.id}
                </span>
              </h2>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">
                {user.email || user.phone || "未绑定邮箱"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="h-12 px-6 rounded-2xl text-neutral-500 font-bold tracking-widest hover:text-neutral-900 hover:bg-neutral-100 transition-all"
              onClick={onClose}
            >
              放弃操作
            </Button>
            <Button
              className="h-12 px-8 rounded-2xl bg-neutral-900 hover:bg-black text-white font-bold tracking-widest shadow-xl shadow-black/10 transition-all active:scale-[0.98]"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "同步所有更改"
              )}
            </Button>
            <div className="w-[1px] h-8 bg-black/10 mx-2" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-12 h-12 text-neutral-400 hover:text-neutral-900 hover:bg-black/5 rounded-2xl transition-all"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar text-neutral-900 bg-neutral-50/50">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Column: Stats & Basic Info */}
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "粉丝", value: user.followersCount || 0 },
                  { label: "关注", value: user.followingCount || 0 },
                  { label: "作品", value: user.postsCount || 0 },
                  { label: "点赞", value: user.likesCount || 0 },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="bg-white p-6 rounded-[24px] border border-black/10 text-center transition-all hover:bg-neutral-50 hover:shadow-lg hover:shadow-black/5"
                  >
                    <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">
                      {s.label}
                    </div>
                    <div className="text-3xl font-black text-neutral-900 tracking-tighter">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6 bg-white p-8 rounded-[24px] border border-black/10 shadow-lg shadow-black/5">
                <h4 className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] mb-2">
                  身份特征谱
                </h4>
                <div className="space-y-5">
                  <div className="flex justify-between items-center group">
                    <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-700">
                      访问账号
                    </span>
                    <span className="text-xs text-neutral-900 font-mono bg-neutral-100 px-3 py-1 rounded-md">
                      {user.accountName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-700">
                      通讯链路
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-900 font-bold">
                        {user.phone || "未连接"}
                      </span>
                      {user.phone &&
                        (isSuperAdmin ||
                          (currentUser.permissions || []).includes(
                            "release_phone",
                          )) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-[11px] font-bold bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-all"
                            disabled={loading}
                            onClick={handleReleasePhone}
                          >
                            释放
                          </Button>
                        )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-700">
                      设计师认证
                    </span>
                    <span
                      className={`text-[11px] font-black px-3 py-1 rounded-md uppercase ${
                        user.certifications?.some((c) => {
                          const t = typeof c === "string" ? c : c?.title;
                          return (
                            t === "认证设计师" ||
                            t === "CERTIFIED_DESIGNER" ||
                            t === "OFFICIAL" ||
                            t === "AI CREATOR"
                          );
                        })
                          ? "bg-emerald-50 text-emerald-500"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {user.certifications?.some((c) => {
                        const t = typeof c === "string" ? c : c?.title;
                        return (
                          t === "认证设计师" ||
                          t === "CERTIFIED_DESIGNER" ||
                          t === "OFFICIAL" ||
                          t === "AI CREATOR"
                        );
                      })
                        ? "已认证"
                        : "待处理"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-4 pt-4">
                <Label className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] ml-2">
                  管理员特权操作
                </Label>
                <div className="grid grid-cols-1 gap-3">
                  {!user.certifications?.some((c) => {
                    const t = typeof c === "string" ? c : c?.title;
                    return (
                      t === "认证设计师" ||
                      t === "CERTIFIED_DESIGNER" ||
                      t === "OFFICIAL" ||
                      t === "AI CREATOR"
                    );
                  }) && (
                    <Button
                      variant="outline"
                      className="w-full h-14 rounded-xl border-black/10 bg-white text-neutral-900 font-black text-xs uppercase tracking-widest hover:bg-neutral-100 transition-all active:scale-[0.98] shadow-sm"
                      onClick={async () => {
                        try {
                          await api.post(`/admin/users/${user.id}/certify`, {
                            title: "认证设计师",
                          });
                          toast.success("认证授权成功");
                          onUpdate();
                        } catch (err) {
                          toast.error("信号错误");
                        }
                      }}
                    >
                      授予设计师认证
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className={`w-full h-14 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] ${status === "active" ? "bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 hover:text-red-600 shadow-sm" : "bg-neutral-200 text-neutral-900 hover:bg-neutral-300 shadow-sm"}`}
                    onClick={() =>
                      setStatus(status === "active" ? "banned" : "active")
                    }
                  >
                    {status === "active" ? "终止访问权限" : "恢复访问权限"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Middle Column: Management */}
            <div className="space-y-10">
              <div className="space-y-6">
                <Label className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2 ml-2">
                  <Sparkles className="w-4 h-4" />
                  能量储备调整
                </Label>
                <div className="space-y-4 bg-white p-6 rounded-[24px] border border-black/10 shadow-lg shadow-black/5">
                  <div className="relative group">
                    <Input
                      type="number"
                      value={credits}
                      onChange={(e) => setCredits(parseInt(e.target.value))}
                      className="bg-neutral-50 border-black/5 text-neutral-900 h-16 text-3xl font-black rounded-xl pl-6 focus:bg-white focus:ring-1 focus:ring-black/10 transition-all tracking-tighter"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[11px] font-black text-neutral-400 uppercase tracking-widest">
                      能量
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setCredits((c) => c + 1000)}
                      className="h-12 border-black/10 bg-neutral-50 hover:bg-neutral-100 text-neutral-900 rounded-xl font-bold text-base shadow-sm"
                    >
                      +1,000
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCredits((c) => c + 5000)}
                      className="h-12 border-black/10 bg-neutral-50 hover:bg-neutral-100 text-neutral-900 rounded-xl font-bold text-base shadow-sm"
                    >
                      +5,000
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <Label className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2 ml-2">
                  <ShieldCheck className="w-4 h-4" />
                  安全协议角色 {isSuperAdmin ? "" : "(只读)"}
                </Label>
                <div className="grid grid-cols-1 gap-3 bg-white p-6 rounded-[24px] border border-black/10 shadow-lg shadow-black/5">
                  {[
                    {
                      id: "user",
                      label: "普通用户 (成员)",
                      activeClass:
                        "bg-neutral-900 text-white shadow-xl shadow-black/10 border-transparent",
                    },
                    {
                      id: "admin",
                      label: "管理员 (调解员)",
                      activeClass:
                        "bg-neutral-900 text-white shadow-xl shadow-black/10 border-transparent",
                    },
                    {
                      id: "super_admin",
                      label: "系统架构师 (架构师)",
                      activeClass:
                        "bg-neutral-900 text-white shadow-xl shadow-black/10 border-transparent",
                    },
                  ].map((r) => (
                    <Button
                      key={r.id}
                      variant={role === r.id ? "default" : "outline"}
                      className={`h-14 justify-start px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === r.id ? r.activeClass : "bg-white border-black/10 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"}`}
                      onClick={() => isSuperAdmin && setRole(r.id as any)}
                      disabled={!isSuperAdmin}
                    >
                      <div
                        className={`w-2 h-2 rounded-full mr-4 transition-all ${role === r.id ? "bg-white scale-110" : "bg-neutral-300"}`}
                      />
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>

              {(role === "admin" || role === "super_admin") && (
                <div className="space-y-6 p-8 bg-neutral-900 rounded-[24px] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-3xl rounded-full opacity-50 transition-opacity" />
                  <Label className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] flex items-center gap-2 relative z-10 mb-6">
                    <Lock className="w-4 h-4" />
                    权限细分图谱
                  </Label>
                  <div className="grid grid-cols-1 gap-3 relative z-10">
                    {[
                      { id: "manage_users", label: "用户管理" },
                      { id: "manage_content", label: "内容审计" },
                      { id: "manage_config", label: "核心配置" },
                      { id: "manage_site", label: "界面管理" },
                      { id: "broadcast", label: "全局广播" },
                      { id: "release_phone", label: "通讯链路释放" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        disabled={!isSuperAdmin || role === "super_admin"}
                        onClick={() => togglePermission(p.id)}
                        className={`flex items-center justify-between px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                          role === "super_admin" ||
                          (Array.isArray(permissions) &&
                            permissions.includes(p.id))
                            ? "bg-white border-transparent text-black shadow-lg shadow-white/5"
                            : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {p.label}
                        <div
                          className={`w-2 h-2 rounded-full ${role === "super_admin" || (Array.isArray(permissions) && permissions.includes(p.id)) ? "bg-black" : "bg-white/30"}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Transaction History */}
            <div className="space-y-6 flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
              <Label className="text-[11px] font-black text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-2 ml-2 shrink-0">
                <HistoryIcon className="w-4 h-4" />
                能量变动记录
              </Label>
              <div className="flex-1 bg-white rounded-[24px] border border-black/10 overflow-hidden flex flex-col shadow-lg shadow-black/5 relative">
                <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar relative z-0">
                  {user.transactions && user.transactions.length > 0 ? (
                    user.transactions.map((t: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-5 bg-neutral-50 rounded-xl border border-black/5 group hover:bg-white hover:border-black/10 hover:shadow-md transition-all duration-300"
                      >
                        <div className="space-y-1.5">
                          <div className="text-xs text-neutral-900 font-bold uppercase tracking-wider">
                            {t.reason}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-medium font-mono">
                            {new Date(t.date).toLocaleString()}
                          </div>
                        </div>
                        <div
                          className={`text-base font-black tracking-tighter shrink-0 ml-4 ${t.type === "increase" ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {t.type === "increase" ? "+" : "-"}
                          {t.amount}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-4">
                      <div className="w-20 h-20 rounded-full bg-neutral-50 flex items-center justify-center border border-black/5">
                        <HistoryIcon className="w-8 h-8 opacity-20" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest opacity-40">
                        记录为空
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
