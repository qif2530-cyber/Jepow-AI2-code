import React, { useState, useEffect } from "react";
import { X, Camera, Loader2, Save, Lock, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import api from "../lib/api";
import { PasswordChangeModal } from "./PasswordChangeModal";
import { ChangePhoneModal } from "./ChangePhoneModal";

const INDUSTRIES = ["动画", "摄影", "设计", "运营", "导演", "后期"];

interface EditProfileModalProps {
  user: any;
  onClose: () => void;
  onUpdate: (updatedUser: any) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  user,
  onClose,
  onUpdate,
}) => {
  const [formData, setFormData] = useState({
    name: user?.username || "",
    accountName: user?.accountName || "",
    bio: user?.bio || "",
    industry: user?.industry || "",
    avatar: user?.avatar || "",
    coverUrl: user?.coverUrl || "",
    glowColor: user?.glowColor || "#a855f7",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);

  const isCertified = user?.certifications?.some((c: any) => {
    const t = typeof c === "string" ? c : c?.title;
    return (
      t === "认证设计师" ||
      t === "CERTIFIED_DESIGNER" ||
      t === "OFFICIAL" ||
      t === "AI CREATOR"
    );
  });

  const PREDEFINED_GLOW_COLORS = [
    "#a855f7",
    "#3b82f6",
    "#10b981",
    "#f43f5e",
    "#06b6d4",
    "#eab308",
    "#ffffff",
  ];

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.username || "",
        accountName: user.accountName || "",
        bio: user.bio || "",
        industry: user.industry || "",
        avatar: user.avatar || "",
        coverUrl: user.coverUrl || "",
        glowColor: user.glowColor || "#a855f7",
      });
    }
  }, [user]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "avatar" | "cover",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    if (type === "avatar") setIsUploading(true);
    else setIsCoverUploading(true);

    try {
      const res = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFormData((prev) => ({
        ...prev,
        [type === "avatar" ? "avatar" : "coverUrl"]: res.data.url,
      }));
      toast.success(type === "avatar" ? "头像更新成功" : "封面更新成功");
    } catch (err) {
      toast.error("上传失败");
    } finally {
      if (type === "avatar") setIsUploading(false);
      else setIsCoverUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.post("/user/profile", {
        username: formData.name,
        accountName: formData.accountName,
        bio: formData.bio,
        industry: formData.industry,
        avatar: formData.avatar,
        coverUrl: formData.coverUrl,
        glowColor: formData.glowColor,
      });
      toast.success("个人资料更新成功");
      onUpdate(res.data.user);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "同步失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/95 z-[300000] flex justify-center items-center p-0 md:p-8 animate-in fade-in duration-500">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-6xl h-full md:h-[90vh] flex flex-col md:border border-black/10 md:rounded-md relative shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pt-10 md:p-8 border-b border-black/5 bg-black/[0.02] shrink-0 relative z-10">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-neutral-900 tracking-widest">
              编辑个人资料{" "}
              <span className="text-neutral-600 font-normal">
                / EDIT PROFILE
              </span>
            </h2>
            <p className="text-xs md:text-sm text-neutral-500 mt-1">
              完善你的创作者身份与公开展示信息
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={isSaving}
              className="h-10 px-6 bg-white text-black hover:bg-neutral-200 font-bold text-sm tracking-[0.1em] uppercase rounded-full shadow-[0_0_20px_rgba(0,0,0,0.1)] transition-all hover:scale-[1.02] active:scale-95"
            >
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>保存中...</span>
                </div>
              ) : (
                "保存资料配置"
              )}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-black/10 rounded-full text-neutral-600 hover:text-neutral-900 transition-colors bg-black/5 border border-black/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative">
          <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-12 pb-12">
            {/* Visual Identity Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="h-px bg-black/10 flex-1" />
                <h3 className="text-[10px] md:text-xs font-black text-neutral-500 uppercase tracking-[0.3em]">
                  视觉形象 · Visual Identity
                </h3>
                <div className="h-px bg-black/10 flex-1" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_250px] gap-8">
                {/* Cover Upload */}
                <div className="space-y-4">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider">
                    背景封面
                  </label>
                  <div className="group aspect-[21/9] w-full relative overflow-hidden bg-white border border-black/10 rounded-md shadow-inner transition-all hover:border-black/20">
                    <img
                      src={
                        formData.coverUrl ||
                        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
                      }
                      alt="封面"
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <div className="p-3 bg-black/10 rounded-full mb-2">
                        <Upload className="w-6 h-6 text-neutral-900" />
                      </div>
                      <span className="text-xs font-medium text-neutral-900 tracking-widest">
                        更换封面
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "cover")}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    {isCoverUploading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center ">
                        <Loader2 className="w-8 h-8 text-neutral-900 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Avatar Upload */}
                <div className="space-y-4">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider">
                    个人头像
                  </label>
                  <div className="flex flex-col items-center justify-center gap-4 h-full">
                    <div className="group w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden bg-white border-[4px] border-[#0A0A0A] shadow-2xl relative transition-transform hover:scale-105 duration-500">
                      <img
                        src={
                          formData.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`
                        }
                        alt="头像"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center [2px]">
                        <Upload className="w-6 h-6 text-neutral-900 mb-2" />
                        <span className="text-[10px] text-neutral-900/80 font-medium tracking-wider">
                          上传头像
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, "avatar")}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      {isUploading && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-neutral-900 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Basic Info Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="h-px bg-black/10 flex-1" />
                <h3 className="text-[10px] md:text-xs font-black text-neutral-500 uppercase tracking-[0.3em]">
                  基本属性 · Basic Info
                </h3>
                <div className="h-px bg-black/10 flex-1" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                <div className="space-y-6">
                  <div className="space-y-3 relative group">
                    <label className="text-xs font-medium text-neutral-600 tracking-wider">
                      公开昵称
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="bg-black/[0.02] border-black/5 h-14 text-base px-5 focus:border-black/30 focus:bg-white/[0.05] transition-all rounded-md"
                      placeholder="你的名字"
                    />
                  </div>
                  <div className="space-y-3 relative group">
                    <label className="text-xs font-medium text-neutral-600 tracking-wider">
                      唯一识别号
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-600 font-mono">
                        @
                      </span>
                      <Input
                        value={formData.accountName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            accountName: e.target.value,
                          })
                        }
                        className="bg-black/[0.02] border-black/5 h-14 pl-10 text-base font-mono focus:border-black/30 focus:bg-white/[0.05] transition-all rounded-md"
                        placeholder="username"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider flex justify-between">
                    <span>个人简介</span>
                    <span className="text-[10px] text-neutral-600">
                      {formData.bio.length} / 200
                    </span>
                  </label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) =>
                      setFormData({ ...formData, bio: e.target.value })
                    }
                    maxLength={200}
                    className="bg-black/[0.02] border border-black/5 rounded-md p-5 text-sm md:text-base focus:border-black/30 focus:bg-white/[0.05] transition-all min-h-[136px] resize-none leading-relaxed"
                    placeholder="介绍一下你自己，分享你的创作理念..."
                  />
                </div>
              </div>

              {/* Industry & Tags */}
              <div className="space-y-4 pt-4">
                <label className="text-xs font-medium text-neutral-600 tracking-wider">
                  专注领域
                </label>
                <div className="flex flex-wrap gap-3">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, industry: ind })
                      }
                      className={`px-5 py-2.5 rounded-full text-xs transition-all border ${formData.industry === ind ? "bg-white text-black border-neutral-900 font-bold shadow-[0_0_20px_rgba(0,0,0,0.1)]" : "bg-transparent text-neutral-600 border-black/10 hover:border-black/30 hover:text-neutral-900"}`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>

              {isCertified && (
                <div className="space-y-4 pt-4 border-t border-black/5">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider flex items-center gap-3">
                    认证标识主题色
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded">
                      金标专享炫光
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-4">
                    {PREDEFINED_GLOW_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, glowColor: color })
                        }
                        className={`w-10 h-10 rounded-full transition-all border-[3px] relative flex items-center justify-center ${formData.glowColor === color ? "border-neutral-900 scale-110 shadow-[0_4px_20px_rgba(0,0,0,0.15)] z-10" : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"}`}
                      >
                        <div
                          className="absolute inset-0 rounded-full shadow-inner"
                          style={{ backgroundColor: color }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Security Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="h-px bg-black/10 flex-1" />
                <h3 className="text-[10px] md:text-xs font-black text-neutral-500 uppercase tracking-[0.3em]">
                  安全与凭证 · Security
                </h3>
                <div className="h-px bg-black/10 flex-1" />
              </div>

              <div className="max-w-md space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="w-full justify-between h-14 bg-black/[0.01] border-black/10 hover:bg-white/[0.05] hover:border-black/20 text-neutral-700 transition-all rounded-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-neutral-600" />
                    </div>
                    <span className="text-sm font-medium tracking-wide">
                      重新设置登录密码
                    </span>
                  </div>
                  <span className="text-[10px] font-black tracking-widest uppercase bg-black/10 px-3 py-1.5 rounded-md text-neutral-600 border border-black/5 shadow-inner">
                    短信验证
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPhoneModalOpen(true)}
                  className="w-full justify-between h-14 bg-black/[0.01] border-black/10 hover:bg-white/[0.05] hover:border-black/20 text-neutral-700 transition-all rounded-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-neutral-600" />
                    </div>
                    <span className="text-sm font-medium tracking-wide">
                      换绑手机号
                    </span>
                  </div>
                  <span className="text-[10px] font-black tracking-widest uppercase bg-black/10 px-3 py-1.5 rounded-md text-neutral-600 border border-black/5 shadow-inner">
                    {user?.phone
                      ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
                      : "未绑定"}
                  </span>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </form>

      {isPasswordModalOpen && (
        <PasswordChangeModal
          onClose={() => setIsPasswordModalOpen(false)}
          userPhone={user?.phone || user?.email || ""}
        />
      )}
      {isPhoneModalOpen && (
        <ChangePhoneModal
          onClose={() => setIsPhoneModalOpen(false)}
          userPhone={user?.phone || ""}
          onSuccess={(phone) => {
            setIsPhoneModalOpen(false);
            onUpdate({ ...user, phone });
          }}
        />
      )}
    </div>
  );
};
