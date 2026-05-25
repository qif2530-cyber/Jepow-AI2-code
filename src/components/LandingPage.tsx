import React, { useState, useEffect, useRef } from "react";
import {
  Image as ImageIcon,
  Video,
  MessageSquare,
  Music,
  PenTool,
  ArrowRight,
  Globe,
  Monitor,
  RefreshCw,
  Lightbulb,
  Sparkles,
  ShieldCheck,
  Twitter,
  Mail,
  MessageCircle,
  ArrowUpRight,
  LogOut,
  Users,
  User as UserIcon,
  FileText,
  Headset,
  Zap,
  ChevronRight,
  SquareActivity,
  Gift,
  Trash2,
  Home,
  Wand2,
  Crown,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { CloudProject } from "../types";
import api from "../lib/api";
import { isDesktopApp } from "../lib/runtime";
import { LandingDownloadSection } from "./LandingDownloadSection";
import { checkIsVideoUrl } from "../lib/video";

interface LandingPageProps {
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject?: (id: string, newName: string) => void;
  onManageProjects: () => void;
  user: any;
  onLogout: () => void;
  onLogin: () => void;
  onOpenAdmin?: () => void;
  onOpenProfile: (userId?: string) => void;
  onOpenAccountManagement?: () => void;
  siteConfig?: any;
  onCloseProfile: () => void;
  onOpenEditProfile: () => void;
  onCloseEditProfile: () => void;
  onOpenCredits: () => void;
  onUpdateProfile: (data: {
    name: string;
    bio: string;
    avatar: string;
    industry?: string;
  }) => void;
  onRecharge: () => void;
  onProjectPurchased?: () => void;
  projects: CloudProject[];
  currentProjectId?: string | null;
  triggerUpload?: boolean;
  onUploadTriggered?: () => void;
  showMessagesPanel: boolean;
  setShowMessagesPanel: (show: boolean) => void;
  onOpenMessagesTab?: (tab: "chats" | "system" | "official") => void;
  activeChatUser: string | null;
  setActiveChatUser: (userId: string | null) => void;
  showPublicProfile: string | null;
  setShowPublicProfile: (id: string | null) => void;
  viewingPost: any | null;
  setViewingPost: (post: any | null) => void;
  showEditProfileModal: boolean;
  setShowEditProfileModal: (show: boolean) => void;
  setViewingActivity?: (activity: any) => void;
}

import { Heart } from "lucide-react";

import { Clock } from "lucide-react";

const dummyActivities = [
  {
    id: "1",
    cover:
      "https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80",
    badgeText: "距离截止还有15天6小时",
    badgeType: "countdown",
    title: "直通全球动画最高荣誉殿堂·昂西国际动画节",
    description: "面向全球征集AI动画作品与项目计划，探索未来动画影像的新表达",
    tags: [
      { text: "包机酒参与昂西动画节放映交流，4万欧奖金", icon: Gift },
      { text: "已有82人参与", isGray: true },
    ],
  },
  {
    id: "2",
    cover:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80",
    badgeText: "距离截止还有9天6小时",
    badgeType: "countdown",
    title: "Y600 Pro万级长续航AI大赛",
    description: "用AI演绎「万级长续航跨越山海」",
    tags: [
      { text: "本期活动设置20万奖金池和5万抖音流量池", icon: Gift },
      { text: "已有882人参与", isGray: true },
    ],
  },
  {
    id: "3",
    cover:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80",
    badgeText: "距离截止还有46天6小时",
    badgeType: "countdown",
    title: "大学生广告艺术节学院奖 即梦AI青年创意大赛 (视频类)",
    description:
      "即梦AI携手中国大学生广告艺术节学院奖，联合发起首届青年创意赛事",
    tags: [
      { text: "学院奖组委会统一颁发奖励", icon: Gift },
      { text: "已有1557人参与", isGray: true },
    ],
  },
  {
    id: "4",
    cover:
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80",
    badgeText: "距离截止还有46天6小时",
    badgeType: "countdown",
    title: "即梦AI创作者成长计划·新影像",
    description: '全方位助力你实现从"拍剪"到"大片"的专业化蜕变',
    tags: [
      { text: "赢千万即梦积分", icon: Sparkles },
      { text: "已有2048人参与", isGray: true },
    ],
  },
];

const dummyShorts = [
  {
    id: "s1",
    cover:
      "https://images.unsplash.com/photo-1600577916048-804c9191e36c?auto=format&fit=crop&q=80",
    title: "聊斋志异: 燕赤霞",
    desc: "燕赤霞短片：以文化为魂，用技术破界 我们创作《燕赤霞》短片的起点，是对中国经...",
    authorName: "猫大人爱睡大觉",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=cat",
    likes: 47730,
    duration: "04:01",
  },
  {
    id: "s2",
    cover:
      "https://images.unsplash.com/photo-1618365908648-e71bd5716cba?auto=format&fit=crop&q=80",
    title: "《心轨》",
    desc: "《心轨》以火车比喻男孩的内心，通过与内心的对话和外界变化的互动，逐渐学会与...",
    authorName: "十二话",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=12",
    likes: 2307,
    duration: "03:18",
  },
  {
    id: "s3",
    cover:
      "https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80",
    title: "国际青年节广告片",
    desc: "和同事一起创作的纯AI工作流的广告宣传片！！！世界是个草台班子，但你不是NPC...",
    authorName: "600.",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=600",
    likes: 2237,
    duration: "02:36",
  },
  {
    id: "s4",
    cover:
      "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&q=80",
    title: "《汇龙奇谭》上海国际AIGC短片大赛一等奖",
    desc: '很荣幸《汇龙奇谭》获得了"提示未来"上海国际AIGC短片大赛一等奖。这是一条7...',
    authorName: "白马少年",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=horse",
    likes: 945,
    duration: "07:25",
  },
];

const getAspectClass = (post: any) => {
  const isVideoItem = checkIsVideoUrl(post.mediaUrl) || checkIsVideoUrl(post.coverUrl);
  if (isVideoItem) {
    return "aspect-[16/10]";
  }
  const idStr = String(post.id || post.mediaUrl || "");
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % 3;
  if (idx === 0) {
    return "aspect-[4/3]";
  } else if (idx === 1) {
    return "aspect-square";
  } else {
    return "aspect-[3/4]";
  }
};

interface InspirationCardProps {
  post: any;
  contextList: any[];
  onSelect: (post: any) => void;
}

const InspirationCard = ({ post, contextList, onSelect }: InspirationCardProps) => {
  // Try to read aspect ratio from cache on startup to prevent initial jumps
  const mediaUrlStr = post.mediaUrl || post.coverUrl || "";
  const getCachedRatio = () => {
    if (!mediaUrlStr) return null;
    try {
      const cached = localStorage.getItem(`aspect_v2_${mediaUrlStr}`);
      if (cached) return parseFloat(cached);
    } catch (e) {}
    return null;
  };

  const [customAspect, setCustomAspect] = useState<number | null>(getCachedRatio());

  const saveAspectToCache = (ratio: number) => {
    if (!mediaUrlStr || !ratio) return;
    try {
      localStorage.setItem(`aspect_v2_${mediaUrlStr}`, String(ratio));
    } catch (e) {}
  };

  const getSrc = (url: string) => {
    if (!url) return "";
    if (
      url.includes("127.0.0.1:3000") ||
      url.includes("localhost:3000")
    ) {
      try {
        const path = new URL(url).pathname;
        return path;
      } catch (e) {
        return url;
      }
    }
    return url;
  };

  const mediaSrc = getSrc(post.mediaUrl);
  const coverSrc = post.coverUrl ? getSrc(post.coverUrl) : undefined;
  const isVideoItem = checkIsVideoUrl(post.mediaUrl) || checkIsVideoUrl(post.coverUrl);

  const aspectStyle = customAspect ? { aspectRatio: String(customAspect) } : {};

  return (
    <div
      className={`break-inside-avoid mb-4 rounded-xl overflow-hidden group cursor-pointer relative shadow-lg bg-white border border-black/5 hover:border-black/20 transition-all block`}
      onClick={() =>
        onSelect({
          ...post,
          _contextList: contextList,
        })
      }
      onMouseEnter={(e) => {
        const video = e.currentTarget.querySelector("video");
        if (video) video.play().catch(() => {});
      }}
      onMouseLeave={(e) => {
        const video = e.currentTarget.querySelector("video");
        if (video) {
          video.pause();
        }
      }}
    >
      <div 
        className={`relative w-full overflow-hidden bg-neutral-100 ${!customAspect ? getAspectClass(post) : ""}`}
        style={aspectStyle}
      >
        {isVideoItem ? (
          <video
            src={mediaSrc || coverSrc}
            poster={coverSrc}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            muted
            loop
            playsInline
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              if (video.videoWidth && video.videoHeight) {
                const ratio = video.videoWidth / video.videoHeight;
                setCustomAspect(ratio);
                saveAspectToCache(ratio);
              }
            }}
            onError={(e) => {
              const target = e.currentTarget as HTMLVideoElement;
              target.onerror = null;
              target.poster =
                "https://placehold.co/600x400/141414/555555?text=Video+Error";
            }}
          />
        ) : (
          <img
            src={coverSrc || mediaSrc}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            alt={post.title || "Inspiration"}
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                const ratio = img.naturalWidth / img.naturalHeight;
                setCustomAspect(ratio);
                saveAspectToCache(ratio);
              }
            }}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.onerror = null;
              target.src =
                "https://placehold.co/600x400/141414/555555?text=No+Image";
            }}
          />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 text-left pointer-events-none">
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {post.author?.avatarUrl ? (
              <img
                src={post.author.avatarUrl}
                alt="avatar"
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] text-white shrink-0">
                {post.author?.name?.charAt(0) || "U"}
              </div>
            )}
            <span className="text-white/80 text-xs truncate max-w-[100px]">
              {post.author?.name || "未知用户"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-white/90">
            <Heart className="w-3.5 h-3.5" />
            <span>
              {post.likesCount || post.likes?.length || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export function LandingPage({
  onNewProject,
  onOpenProject,
  onDeleteProject,
  onRenameProject,
  onManageProjects,
  projects,
  user,
  onLogout,
  onLogin,
  onOpenAdmin,
  onOpenProfile,
  onOpenCredits,
  onOpenAccountManagement,
  siteConfig,
  setViewingPost,
  setViewingActivity,
}: LandingPageProps) {
  const [showDesktopWarning, setShowDesktopWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<"发现" | "短片" | "活动">("发现");
  const [posts, setPosts] = useState<any[]>([]);
  const [columnCount, setColumnCount] = useState(5);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 640) {
        setColumnCount(2);
      } else if (w < 768) {
        setColumnCount(3);
      } else if (w < 1024) {
        setColumnCount(4);
      } else {
        setColumnCount(5);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [activities, setActivities] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const helpDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
      if (
        helpDropdownRef.current &&
        !helpDropdownRef.current.contains(event.target as Node)
      ) {
        setIsHelpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Fetch Activities
    api
      .get("/activities")
      .then((res) => {
        if (Array.isArray(res.data)) {
          setActivities(res.data);
        }
      })
      .catch(console.error);

    // Fetch Posts
    api
      .get("/community/posts")
      .then((res) => {
        if (Array.isArray(res.data)) {
          // 每天晚上12点更新布局 - 使用按天生成的随机种子进行 Deterministic Shuffle
          const dateStr = new Date().toLocaleDateString("en-US", {
            timeZone: "Asia/Shanghai",
          });
          const seedStr = dateStr + "-posts-layout";
          let seed = 0;
          for (let i = 0; i < seedStr.length; i++) {
            seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
          }
          let m_w = Math.abs(seed) || 1;
          let m_z = 987654321;
          const random = () => {
            m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & 0xffffffff;
            m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & 0xffffffff;
            const res = ((m_z << 16) + m_w) & 0xffffffff;
            return (res >>> 0) / 4294967296;
          };

          const arr = [...res.data];
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          setPosts(arr);
        }
      })
      .catch(console.error);
  }, []);

  const handleProjectAction = (action: () => void) => {
    if (
      typeof window !== "undefined" &&
      !isDesktopApp() &&
      window.innerWidth < 768
    ) {
      setShowDesktopWarning(true);
      return;
    }
    action();
  };

  return (
    <div className="min-h-screen relative w-full bg-white text-neutral-900 font-sans overflow-x-hidden selection:bg-neutral-900 selection:text-white pb-32 pt-10">
      {/* Sidebar Navigation */}
      <div className="fixed left-6 bottom-12 z-[100] flex flex-col items-center gap-4 hidden lg:flex">
        <button
          title="首页"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="p-3 bg-white text-neutral-900 shadow-md hover:shadow-lg border border-black/5 hover:border-black/10 rounded-full transition-all group relative active:scale-95"
        >
          <Home className="w-[22px] h-[22px]" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-black text-white text-[13px] font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-xl">
            首页
          </span>
        </button>
        <button
          title="AI 灵感"
          onClick={() => {
            document
              .getElementById("ai-inspiration")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
          className="p-3 bg-white text-neutral-500 shadow-md hover:shadow-lg hover:text-neutral-900 border border-black/5 hover:border-black/10 rounded-full transition-all group relative active:scale-95"
        >
          <Lightbulb className="w-[22px] h-[22px]" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-black text-white text-[13px] font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-xl">
            AI 灵感
          </span>
        </button>
        <button
          title="会员"
          className="p-3 bg-white text-neutral-500 shadow-md hover:shadow-lg hover:text-neutral-900 border border-black/5 hover:border-black/10 rounded-full transition-all group relative active:scale-95"
        >
          <Crown className="w-[22px] h-[22px]" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-black text-white text-[13px] font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-xl">
            会员
          </span>
        </button>

        <div className="w-8 h-[1px] bg-black/10 my-1 rounded-full" />

        <div className="relative group/help" ref={helpDropdownRef}>
          <button
            title="帮助中心"
            onClick={() => setIsHelpDropdownOpen(!isHelpDropdownOpen)}
            className="p-3 bg-white text-neutral-500 shadow-md hover:shadow-lg hover:text-neutral-900 border border-black/5 hover:border-black/10 rounded-full transition-all relative active:scale-95"
          >
            <HelpCircle className="w-[22px] h-[22px]" />
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-black text-white text-[13px] font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-xl">
              帮助中心
            </span>
          </button>

          <AnimatePresence>
            {isHelpDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute left-full bottom-0 ml-4 w-[340px] bg-white border border-black/10 rounded-2xl shadow-2xl flex z-50 text-sm p-6 gap-6 text-left cursor-default before:content-[''] before:absolute before:-left-4 before:bottom-0 before:w-4 before:h-20"
              >
                <div className="flex-1">
                  <h4 className="font-bold mb-4 text-neutral-900 text-xs tracking-widest uppercase opacity-60">
                    支持
                  </h4>
                  <ul className="space-y-3 text-neutral-600 font-medium text-[13px]">
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        帮助中心
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        使用教程
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        联系我们
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        反馈建议
                      </a>
                    </li>
                  </ul>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold mb-4 text-neutral-900 text-xs tracking-widest uppercase opacity-60">
                    关于我们
                  </h4>
                  <ul className="space-y-3 text-neutral-600 font-medium text-[13px]">
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        关于 {siteConfig?.logoText || "Jepow AI"}
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        加入我们
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        隐私政策
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="hover:text-black hover:translate-x-1 transition-all block py-0.5"
                      >
                        服务条款
                      </a>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 bg-transparent pointer-events-none">
        <div
          className="flex flex-1 items-center justify-start gap-2 cursor-pointer pointer-events-auto"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          {siteConfig?.logo && (
            <img
              src={siteConfig.logo}
              alt="Logo"
              className="w-8 h-8 rounded-md object-contain"
            />
          )}
        </div>

        <div className="flex flex-1 items-center justify-end pointer-events-auto">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-10 h-10 rounded-full overflow-hidden border border-black/10 hover:border-black/30 transition-colors focus:outline-none flex-shrink-0 block"
                >
                  <img
                    src={
                      user.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                    }
                    className="w-full h-full object-cover"
                    alt=""
                  />
                </button>

                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-3 w-[320px] bg-white border border-black/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 text-sm"
                    >
                      {/* User Info */}
                      <div className="flex items-center gap-3 p-4 bg-black/[0.02] border-b border-black/5">
                        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-black/10">
                          <img
                            src={
                              user.avatar ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
                            }
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-medium text-neutral-900 truncate text-base">
                            {user.username || "Jepow 用户"}
                          </span>
                          <span className="text-neutral-900/40 text-xs truncate">
                            {user.email || ""}
                          </span>
                        </div>
                      </div>

                      {/* Points / Benefits */}
                      <div className="p-4 border-b border-black/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between text-neutral-900/80">
                          <span className="font-medium text-base">
                            Ultimate
                          </span>
                          <button
                            onClick={() => {
                              setIsDropdownOpen(false);
                              onOpenCredits?.();
                            }}
                            className="flex items-center gap-2 bg-neutral-900 text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-sm"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>{user.credits || 0}</span>
                            <span className="text-white/30 mx-0.5">|</span>
                            <span>升级</span>
                          </button>
                        </div>
                        <button className="w-full py-2 bg-black/5 hover:bg-black/10 text-neutral-900 rounded-lg transition-colors border border-black/10 text-sm font-medium">
                          查看我的权益
                        </button>
                      </div>

                      {/* Points Details */}
                      <div className="p-4 border-b border-black/5 flex flex-col gap-3">
                        <div className="flex items-center justify-between text-neutral-900/80">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-neutral-900/50" />
                            <span className="font-medium">积分</span>
                          </div>
                          <span className="font-medium">
                            {user.credits || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-900/40 text-xs">
                          <span>于 2026-06-01 到期</span>
                          <span>{user.credits || 0}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenCredits?.();
                        }}
                        className="w-full p-4 flex items-center justify-between text-neutral-900/70 hover:text-neutral-900 hover:bg-black/5 transition-colors border-b border-black/5"
                      >
                        <span className="text-sm font-medium">使用详情</span>
                        <ChevronRight className="w-4 h-4 text-neutral-900/30" />
                      </button>

                      {/* Menu Items */}
                      <div className="flex flex-col py-2">
                        <button
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-neutral-900/70 hover:text-neutral-900 hover:bg-black/5 transition-colors text-left"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            onOpenAccountManagement?.();
                          }}
                        >
                          <UserIcon className="w-4 h-4" />
                          <span className="flex-1">账户管理</span>
                        </button>
                        <button
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-neutral-900/70 hover:text-neutral-900 hover:bg-black/5 transition-colors text-left"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <Globe className="w-4 h-4" />
                          <span className="flex-1">简体中文</span>
                          <ChevronRight className="w-4 h-4 text-neutral-900/30" />
                        </button>
                      </div>

                      {/* Logout */}
                      <div className="border-t border-black/5 py-2">
                        {(user.role === "admin" ||
                          user.role === "super_admin") && (
                          <button
                            className="w-full px-4 py-2.5 flex items-center gap-3 text-amber-500/70 hover:text-amber-500 hover:bg-black/5 transition-colors text-left font-medium"
                            onClick={() => {
                              setIsDropdownOpen(false);
                              onOpenAdmin();
                            }}
                          >
                            <Monitor className="w-4 h-4" />
                            <span className="flex-1">管理系统</span>
                          </button>
                        )}
                        <button
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-neutral-900/70 hover:text-neutral-900 hover:bg-black/5 transition-colors text-left"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            onLogout();
                          }}
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="flex-1">退出登录</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="text-sm font-medium bg-white border border-neutral-200 text-neutral-900 rounded-full px-8 py-2.5 hover:bg-neutral-50 shadow-sm transition-colors"
            >
              登录 / 注册
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 flex flex-col items-center justify-center min-h-[75vh] px-4">
        <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
          <h1 className="text-7xl md:text-[120px] lg:text-[140px] font-black tracking-tighter mb-6 font-sans text-neutral-900 leading-none">
            {siteConfig?.logoText || "Jepow AI"}
          </h1>
          <p className="text-xl md:text-3xl text-neutral-500 mb-14 tracking-wide font-light">
            释放创造力，探索 AI 的无限可能
          </p>

          <div className="bg-white border border-black/5 rounded-full p-2.5 flex items-center max-w-3xl mx-auto mb-10 shadow-[0_8px_40px_rgb(0,0,0,0.08)] z-20 relative hover:shadow-[0_8px_40px_rgb(0,0,0,0.12)] hover:border-black/10 transition-all duration-300">
            <input
              type="text"
              placeholder="描述你的想法，比如：未来城市的夜景"
              className="bg-transparent text-neutral-900 placeholder:text-neutral-400 border-none outline-none flex-1 px-8 py-4 text-lg md:text-xl w-full font-medium"
            />
            <button
              onClick={() => handleProjectAction(onNewProject)}
              className="bg-neutral-900 text-white text-base font-bold rounded-full px-10 py-5 flex items-center gap-2 hover:bg-neutral-800 transition-colors whitespace-nowrap shadow-md active:scale-[0.98]"
            >
              立即生成 <Sparkles className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm md:text-base text-neutral-500">
            <span className="font-medium mr-2">热门推荐：</span>
            {[
              "未来城市",
              "赛博朋克",
              "唯美风景",
              "人物写真",
              "科幻场景",
              "中国风",
            ].map((tag) => (
              <button
                key={tag}
                className="px-5 py-2 rounded-full border border-black/5 hover:bg-black/5 hover:text-neutral-900 transition-colors bg-white font-medium"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Desktop client — projects are stored locally, not on the website server */}
      {!isDesktopApp() && (
        <LandingDownloadSection downloadUrl={siteConfig?.desktopAppDownloadUrl} />
      )}

      {/* Recent Projects (desktop app only — local storage) */}
      {user && isDesktopApp() && (
        <section className="py-12 px-6 lg:px-28 xl:px-32 max-w-[1600px] mx-auto relative z-10 mt-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              最近项目
            </h2>
            <button
              onClick={onManageProjects}
              className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition-colors"
            >
              查看全部 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex overflow-x-auto pb-6 gap-6 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* New Project Card */}
            <div
              onClick={() => onNewProject()}
              className="flex-shrink-0 w-[280px] group cursor-pointer flex flex-col"
            >
              <div className="w-full aspect-video rounded-2xl border-2 border-dashed border-black/15 flex items-center justify-center bg-neutral-50 group-hover:border-black/30 group-hover:bg-neutral-100 hover:shadow-lg transition-all duration-300 mb-4 relative overflow-hidden">
                <div className="text-3xl font-light text-neutral-400 group-hover:text-neutral-700 group-hover:scale-110 transition-all duration-300">
                  +
                </div>
              </div>
              <h3 className="text-sm font-medium text-neutral-900 px-1">
                新建项目
              </h3>
            </div>

            {/* Recent Projects */}
            {projects.slice(0, 5).map((project) => (
              <div
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                className="flex-shrink-0 w-[280px] group cursor-pointer flex flex-col"
              >
                <div className="w-full aspect-video rounded-2xl border border-black/10 bg-neutral-50 overflow-hidden mb-4 group-hover:border-black/20 hover:shadow-xl transition-all duration-300 relative group/card">
                  {project.thumbnail ? (
                    checkIsVideoUrl(project.thumbnail) ? (
                      <video
                        src={project.thumbnail + "#t=0.001"}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        muted
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => {
                          e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                        }}
                      />
                    ) : (
                      <img
                        src={project.thumbnail}
                        alt={project.name}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-50 text-neutral-400 group-hover:scale-105 transition-all duration-500">
                      <ImageIcon className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("确定要删除这个项目吗？")) {
                        onDeleteProject(project.id);
                      }
                    }}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity backdrop-blur-sm z-10"
                    title="删除项目"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {editingProjectId === project.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (onRenameProject && editingName.trim() !== "") {
                        onRenameProject(project.id, editingName.trim());
                      }
                      setEditingProjectId(null);
                    }}
                    className="px-1 mt-1 mb-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingName}
                      autoFocus
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => {
                        if (
                          onRenameProject &&
                          editingName.trim() !== "" &&
                          editingName !== project.name
                        ) {
                          onRenameProject(project.id, editingName.trim());
                        }
                        setEditingProjectId(null);
                      }}
                      className="w-full text-sm font-medium text-neutral-900 bg-white border border-black/20 rounded px-1 -ml-1 outline-none"
                    />
                  </form>
                ) : (
                  <h3
                    className="text-sm font-medium text-neutral-900 truncate px-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingProjectId(project.id);
                      setEditingName(project.name);
                    }}
                    title="双击重命名"
                  >
                    {project.name}
                  </h3>
                )}
                <p className="text-xs text-neutral-500 mt-1 px-1">
                  更新于{" "}
                  {new Date(project.updatedAt).toLocaleDateString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Inspiration Section */}
      <section
        id="ai-inspiration"
        className="py-24 px-6 lg:px-28 xl:px-32 max-w-[1600px] mx-auto relative z-10"
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 tracking-tight">
            探索 AI 灵感
          </h2>
          <p className="text-neutral-900/40 mb-10">
            发现更多创意作品，激发无限灵感
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 text-[15px] font-bold">
            {["发现", "短片", "活动"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2.5 rounded-full transition-all tracking-wider ${activeTab === tab ? "bg-neutral-900 text-white shadow-md" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/50"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {["发现", "短片"].map((tab) => {
          const isTabActive = activeTab === tab;

          const visiblePosts = posts.filter((post) => {
            const isVideoItem =
              checkIsVideoUrl(post.mediaUrl) || checkIsVideoUrl(post.coverUrl);
            return (
              (tab === "发现" &&
                (!post.activityId ||
                  activities.find((a) => a.id === post.activityId)?.type ===
                    "image")) ||
              (tab === "短片" &&
                ((!post.activityId && isVideoItem) ||
                  (post.activityId &&
                    activities.find((a) => a.id === post.activityId)?.type ===
                      "video")))
            );
          });

          // Pre-distribute posts to specific stable columns based on our columnCount to prevent dynamic browser re-flow (dancing) between columns
          const columnsData = Array.from({ length: columnCount }, () => [] as any[]);
          visiblePosts.forEach((post, index) => {
            columnsData[index % columnCount].push(post);
          });

          return (
            <div key={tab} className={isTabActive ? "block" : "hidden"}>
              {visiblePosts.length > 0 ? (
                <div 
                  className="grid gap-4" 
                  style={{ 
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    alignItems: "start" 
                  }}
                >
                  {columnsData.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-4">
                      {col.map((post) => (
                        <InspirationCard
                          key={post.id}
                          post={post}
                          contextList={visiblePosts}
                          onSelect={(p) => setViewingPost(p)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-neutral-500 text-sm tracking-widest uppercase">
                  暂无作品
                </div>
              )}
            </div>
          );
        })}

        <div className={activeTab === "活动" ? "block" : "hidden"}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="group cursor-pointer flex flex-col bg-white rounded-2xl overflow-hidden border border-black/5 hover:border-black/20 hover:shadow-xl transition-all duration-300"
                onClick={() => setViewingActivity?.(activity)}
              >
                <div className="relative aspect-[21/9] overflow-hidden">
                  <img
                    src={
                      activity.cover ||
                      `https://picsum.photos/seed/activity-${activity.id}/800/400`
                    }
                    alt={activity.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />

                  {/* Badge */}
                  <div className="absolute top-4 left-4">
                    <div
                      className={`px-3 py-1.5 backdrop-blur-md rounded-full flex items-center gap-2 text-xs font-bold tracking-wider ${activity.status !== "active" ? "bg-black/40 text-white/90" : "bg-black/60 text-white"}`}
                    >
                      {activity.status === "active" ? (
                        <Clock className="w-3.5 h-3.5 opacity-80" />
                      ) : null}
                      <span>
                        {activity.status === "active"
                          ? `进行中，截止: ${activity.deadline}`
                          : "已结束"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-lg font-bold text-neutral-900 mb-2 truncate group-hover:text-black">
                    {activity.title}
                  </h3>
                  <p className="text-sm text-neutral-500 mb-6 line-clamp-2">
                    {activity.content}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 font-bold`}
                    >
                      {activity.type === "image" ? "图片征集" : "视频征集"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <div className="col-span-full py-20 text-center text-neutral-500 text-sm tracking-widest uppercase">
                暂无进行中的活动
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white pt-8 pb-10 px-4 md:px-8 border-t border-black/5 overflow-hidden relative z-10 text-sm">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-center gap-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 flex-wrap w-full text-center">
            <p className="text-neutral-900/30">
              © {new Date().getFullYear()} {siteConfig?.logoText || "Jepow AI"}.
              All rights reserved.
            </p>
            {siteConfig?.icp && (
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-900/30 hover:text-neutral-900 transition-colors"
              >
                {siteConfig.icp}
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* Modals & Alerts */}
      <AnimatePresence>
        {showDesktopWarning && (
          <div
            className="fixed inset-0 z-[200000] flex items-center justify-center p-6 bg-black/10 backdrop-blur-md"
            onClick={() => setShowDesktopWarning(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-black/10 rounded-3xl p-8 max-w-[320px] w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="w-16 h-16 bg-black/5 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-black/10">
                <Monitor className="w-8 h-8 text-neutral-900/80" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">
                进入完整工作台
              </h3>
              <p className="text-sm text-neutral-900/50 leading-relaxed mb-8">
                已为桌面设备优化。请通过电脑浏览器访问以使用完整的创意工具。
              </p>
              <Button
                onClick={() => setShowDesktopWarning(false)}
                className="w-full h-12 bg-white text-black hover:bg-neutral-200 rounded-full font-bold text-sm transition-all"
              >
                我知道了
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
