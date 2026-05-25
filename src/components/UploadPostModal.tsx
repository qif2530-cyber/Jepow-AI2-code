import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  Loader2,
  FileJson,
  Image as ImageIcon,
  Zap,
  ShieldCheck,
  Check,
  Camera,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import api from "../lib/api";
import { motion } from "motion/react";

import { CloudProject } from "../types";
import { checkIsVideoUrl } from "../lib/video";

interface UploadPostModalProps {
  onClose: () => void;
  onSuccess: () => void;
  currentProjectData?: any;
  projects?: CloudProject[];
  currentProjectId?: string | null;
  activityId?: string;
}

export const UploadPostModal: React.FC<UploadPostModalProps> = ({
  onClose,
  onSuccess,
  currentProjectData,
  projects = [],
  currentProjectId,
  activityId,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [mediaUrl, setMediaUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [includeProject, setIncludeProject] = useState(false);
  const [canDownload, setCanDownload] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [category, setCategory] = useState("AI_SIGHT_SYNTHESIS");

  const videoRef = useRef<HTMLVideoElement>(null);

  const captureVideoFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCoverUrl(dataUrl);
      toast.success("已将当前画面设为封面");
    } catch (err) {
      console.error(err);
      toast.error("截取封面失败，可能是跨域资源限制");
    }
  };

  const isCurrentProjectPurchased = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)?.isPurchased
    : false;

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("封面大小超过限制：20MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsCoverUploading(true);
    try {
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCoverUrl(res.data.url);
      toast.success("封面上传成功");
    } catch (err: any) {
      toast.error("封面上传失败");
    } finally {
      setIsCoverUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("文件大小超过限制：100MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsFileUploading(true);
    try {
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMediaUrl(res.data.url);
      toast.success("素材上传成功");
    } catch (err: any) {
      toast.error("素材上传失败");
    } finally {
      setIsFileUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("请输入标题");
      return;
    }
    if (!mediaUrl.trim()) {
      toast.error("请上传或输入素材链接");
      return;
    }

    if (includeProject && !selectedProjectId && isCurrentProjectPurchased) {
      toast.error("已购买的作品无法再次包含工程数据");
      return;
    }

    setIsUploading(true);
    try {
      let finalProjectData = includeProject ? currentProjectData : null;
      if (includeProject && selectedProjectId) {
        // Fetch the project data from the server
        const res = await api.get(`/projects/${selectedProjectId}`);
        finalProjectData = res.data.data;
      }

      await api.post("/community/upload", {
        title,
        description,
        mediaUrl,
        coverUrl,
        category,
        price,
        canDownload,
        activityId,
        projectData: finalProjectData,
      });
      toast.success("作品已提交成功，等待管理员审核", {
        duration: 5000,
      });
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "发布失败，请稍后重试。");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/95 z-[100005] flex justify-center items-center p-0 md:p-8 animate-in fade-in duration-500">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-6xl h-full md:h-[90vh] flex flex-col md:border border-black/10 md:rounded-md relative shadow-2xl overflow-hidden"
        style={{ transform: "translateZ(0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pt-10 md:p-8 border-b border-black/5 bg-black/[0.02] shrink-0 relative z-10">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-neutral-900 tracking-widest">
              发布作品{" "}
              <span className="text-neutral-600 font-normal">
                / UPLOAD POST
              </span>
            </h2>
            <p className="text-xs md:text-sm text-neutral-500 mt-1">
              上传你的最新创意与开发工程协议
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={isUploading}
              className="h-10 px-6 bg-white text-black hover:bg-neutral-200 font-bold text-sm tracking-[0.1em] uppercase rounded-full shadow-[0_0_20px_rgba(0,0,0,0.1)] transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>发布中...</span>
                </>
              ) : (
                "正式发布作品"
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
                  媒体资产配置 · Media Identity
                </h3>
                <div className="h-px bg-black/10 flex-1" />
              </div>

              <div className="flex gap-6 relative">
                <div className="flex-1 space-y-6">
                  <div className="flex gap-4">
                    <Input
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="粘贴外部资源链接或直接上传（视频或图片）..."
                      className="h-14 bg-black/[0.02] border-black/5 rounded-md px-5 text-sm focus:bg-white/[0.05] transition-all"
                      required
                    />
                    <div className="relative group/upload">
                      <input
                        type="file"
                        accept="video/mp4,image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isFileUploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className={`w-14 h-14 bg-black/5 border-black/10 rounded-md transition-all p-0 flex items-center justify-center ${isFileUploading ? "opacity-50" : "hover:bg-black/10 hover:text-neutral-900"}`}
                        disabled={isFileUploading}
                      >
                        {isFileUploading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="relative aspect-[21/9] bg-white rounded-md overflow-hidden border border-black/10 shadow-inner group/preview">
                    {mediaUrl ? (
                      <div className="w-full h-full relative">
                        {checkIsVideoUrl(mediaUrl) ? (
                          <>
                            <video
                              ref={videoRef}
                              src={mediaUrl}
                              controls
                              crossOrigin="anonymous"
                              className="w-full h-full object-contain"
                            />
                            <Button
                              type="button"
                              onClick={captureVideoFrame}
                              variant="secondary"
                              className="absolute top-4 right-4 h-8 px-3 bg-black/60 text-white hover:bg-black/90 border-transparent shadow-md flex items-center gap-1 transition-opacity"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span className="text-xs">截取为封面</span>
                            </Button>
                          </>
                        ) : (
                          <img
                            src={mediaUrl}
                            alt="Preview"
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover/preview:scale-105"
                            onError={(e) =>
                              (e.currentTarget.style.display = "none")
                            }
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-700">
                        <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">
                          等待预览载入
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-[200px] shrink-0 space-y-3 hidden md:block">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider">
                    专属封面图
                  </label>
                  <div className="relative w-full aspect-[4/5] bg-white rounded-md border border-dashed border-black/10 flex flex-col items-center justify-center overflow-hidden hover:border-black/30 transition-all group/cover">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={isCoverUploading}
                    />
                    {coverUrl ? (
                      <>
                        <img
                          src={coverUrl}
                          className="w-full h-full object-cover"
                          alt="Cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-neutral-900 text-xs font-bold">
                            更换封面
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 opacity-50 group-hover/cover:opacity-100 transition-opacity">
                        {isCoverUploading ? (
                          <Loader2 className="w-6 h-6 animate-spin text-neutral-900/50" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-neutral-900/50" />
                        )}
                        <span className="text-[10px] font-bold text-neutral-900/50">
                          上传封面
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Basic Info Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="h-px bg-black/10 flex-1" />
                <h3 className="text-[10px] md:text-xs font-black text-neutral-500 uppercase tracking-[0.3em]">
                  核心元数据 · Core Metadata
                </h3>
                <div className="h-px bg-black/10 flex-1" />
              </div>

              <div className="space-y-6">
                <div className="space-y-3 relative group">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider">
                    作品标题
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-black/[0.02] border-black/5 h-14 text-base px-5 focus:border-black/30 focus:bg-white/[0.05] transition-all rounded-md"
                    placeholder="赋予作品一个灵魂标题..."
                    required
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-neutral-600 tracking-wider flex justify-between">
                    <span>创作说明</span>
                    <span className="text-[10px] text-neutral-600">
                      {description.length} / 500
                    </span>
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    className="bg-black/[0.02] border border-black/5 rounded-md p-5 text-sm md:text-base focus:border-black/30 focus:bg-white/[0.05] transition-all min-h-[160px] resize-none leading-relaxed"
                    placeholder="分享你的创作过程、灵感来源或使用的核心技术细节..."
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
};
