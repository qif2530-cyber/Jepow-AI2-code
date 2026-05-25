import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, Heart, Clock } from "lucide-react";
import { Button } from "./ui/button";
import api from "../lib/api";
import { checkIsVideoUrl } from "../lib/video";

import { UploadPostModal } from "./UploadPostModal";

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

interface ActivityDetailModalProps {
  activity: any;
  onClose: () => void;
  onBack?: () => void;
  onViewPost?: (post: any) => void;
}

export function ActivityDetailModal({
  activity,
  onClose,
  onBack,
  onViewPost,
}: ActivityDetailModalProps) {
  const isActivityEnded = activity?.endTime
    ? new Date(activity.endTime).getTime() < Date.now()
    : false;
  const [activeTab, setActiveTab] = useState<"全部" | "获奖作品">("全部");
  const [sortOrder, setSortOrder] = useState<"按时间" | "按热度">("按热度");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isActivityEnded && activeTab === "获奖作品") {
      setActiveTab("全部");
    }
  }, [isActivityEnded, activeTab]);

  useEffect(() => {
    if (activity?.id) {
      fetchWorks();
    }
  }, [activity?.id]);

  const fetchWorks = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/community/posts?activityId=${activity.id}`);
      setWorks(res.data);
    } catch (err) {
      console.error("Fetch works failed", err);
    } finally {
      setLoading(false);
    }
  };

  // Mock
  const dummyEntries = [
    {
      id: "e1",
      cover:
        "https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80",
      title: "A Cloud of Feelings",
      desc: '这是一个关于"情绪云朵"与自我成长的故事...',
      authorName: "柠岛Blink",
      authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=blink",
      likes: 34,
      duration: "02:44",
    },
    {
      id: "e2",
      cover:
        "https://images.unsplash.com/photo-1618365908648-e71bd5716cba?auto=format&fit=crop&q=80",
      title: "【携带甲兽】- 四神兽青龙",
      desc: "原创IP：携带甲兽，特别篇-四神兽系列之青龙篇。...",
      authorName: "AI图图",
      authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=tutu",
      likes: 13,
      duration: "07:56",
    },
    {
      id: "e3",
      cover:
        "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&q=80",
      title: "吞噬 (Devour)",
      desc: "一扇玻璃窗，里面是光，外面是吞。一个男人站在...",
      authorName: "当当凡",
      authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=dang",
      likes: 5,
      duration: "05:16",
    },
  ];

  return (
    <div className="fixed inset-0 z-[100000] bg-white flex flex-col overflow-y-auto w-full h-full animate-in fade-in zoom-in-95 duration-200">
      {/* Top action bar */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-black/5 px-8 flex items-center justify-between h-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full w-10 h-10 border border-black/10 text-neutral-600 hover:text-black"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-neutral-900 truncate max-w-[800px]">
              {activity?.title
                ? `${activity.title}${activity.title === "直通全球动画最高荣誉殿堂·昂西国际动画节" ? "：即梦设立4万欧奖金，征集AI动画作品" : ""}`
                : "直通全球动画最高荣誉殿堂·昂西国际动画节：即梦设立4万欧奖金，征集AI动画作品"}
            </h2>
            <div className="flex items-center gap-3 text-xs text-neutral-500 font-medium">
              <span className="flex items-center gap-1 text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-md">
                <Clock className="w-3.5 h-3.5" />{" "}
                {activity?.badgeText || "距离截稿还有15天6小时"}
              </span>
              <span>
                活动时间{" "}
                {activity?.activityTime ||
                  "2026-05-13 00:00:00 - 2026-05-30 23:59:59"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="h-10 rounded-xl px-6 font-bold bg-neutral-900 border-none text-white hover:bg-neutral-800"
            onClick={() => setShowUploadModal(true)}
          >
            立即投稿
          </Button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[1400px] mx-auto px-8 py-10">
        {/* Banner */}
        <div className="w-full aspect-[21/6] rounded-3xl overflow-hidden mb-12 shadow-sm border border-black/5">
          <img
            src={
              activity?.cover ||
              "https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80"
            }
            className="w-full h-full object-cover"
            alt="Banner"
          />
        </div>

        {/* Activity Background */}
        <section className="mb-16">
          <h3 className="text-lg font-bold text-neutral-900 mb-4 tracking-wider">
            活动背景
          </h3>
          <div
            className={`relative text-[15px] leading-relaxed text-neutral-600 space-y-4 ${isExpanded ? "" : "max-h-[140px] overflow-hidden"}`}
          >
            {activity?.content ? (
              <div className="whitespace-pre-wrap">{activity.content}</div>
            ) : (
              <>
                <p>
                  法国昂西国际动画节 (Annecy International Animation Film
                  Festival)
                  创立于1960年。作为全球四大国际动画节中历史最悠久的动画节，也是全球A类国际电影节中唯一的动画节，享有"动画界奥斯卡"的美誉。创立60余年来，昂西动画节始终致力于打造全球最具影响力的动画风向标，并设有MIFA——全球规模最大的专业动画交易市场。2026年，昂西动画节迎来了它创立的第66年，并将AI列为今年的核心主题之一。
                </p>
                <p>
                  即梦AI（及海外Dreamina
                  AI）将于2026年6月23日在法国昂西国际动画节，举办即梦AI动画国际峰会，并全球启动AI动画作品及项目征集，携手全球优秀创作者，将最具创意的AI动画内容带上昂西的舞台。基于即梦AI的Voice
                  2.0视频模型的能力效果，即梦AI将通过昂西现场展映、创作者分享与行业对话，持续探索未来动画影像的新表达。
                </p>
              </>
            )}

            {!isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white/80 to-transparent flex items-end justify-center pb-2">
                <button
                  onClick={() => setIsExpanded(true)}
                  className="px-6 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold rounded-full text-sm shadow-sm transition-all"
                >
                  展开
                </button>
              </div>
            )}
          </div>
          {isExpanded && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setIsExpanded(false)}
                className="px-6 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold rounded-full text-sm shadow-sm transition-all"
              >
                收起
              </button>
            </div>
          )}
        </section>

        {/* Works Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <h3 className="text-xl font-bold text-neutral-900 tracking-wider">
                参赛作品
              </h3>
              <div className="flex gap-4 border-l border-black/10 pl-6 h-6 items-center">
                <button
                  className={`text-sm font-bold transition-colors ${activeTab === "全部" ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-600"}`}
                  onClick={() => setActiveTab("全部")}
                >
                  全部
                </button>
                {isActivityEnded && (
                  <button
                    className={`text-sm font-bold transition-colors ${activeTab === "获奖作品" ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-600"}`}
                    onClick={() => setActiveTab("获奖作品")}
                  >
                    获奖作品
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center bg-neutral-100 p-1 rounded-lg">
              <button
                onClick={() => setSortOrder("按热度")}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                  sortOrder === "按热度"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                最热
              </button>
              <button
                onClick={() => setSortOrder("按时间")}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                  sortOrder === "按时间"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                最新
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-neutral-500 text-sm">
              加载中...
            </div>
          ) : works.filter(
              (w) => activeTab === "全部" || (w.grade && w.grade !== "none"),
            ).length === 0 ? (
            <div className="py-20 text-center text-neutral-500 text-sm">
              暂无参赛作品，快来抢首发吧！
            </div>
          ) : (
            <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-6 space-y-6">
              {works
                .filter(
                  (w) =>
                    activeTab === "全部" || (w.grade && w.grade !== "none"),
                )
                .sort((a, b) => {
                  if (sortOrder === "按热度") {
                    const aLikes = a.likesCount || a.likes?.length || 0;
                    const bLikes = b.likesCount || b.likes?.length || 0;
                    return bLikes - aLikes;
                  } else {
                    return (
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                    );
                  }
                })
                .map((item: any) => (
                  <div
                    key={item.id}
                    className="group cursor-pointer break-inside-avoid"
                    onClick={() => onViewPost && onViewPost(item)}
                  >
                    <div className="w-full rounded-xl overflow-hidden bg-neutral-100 mb-3 relative border border-black/5">
                      <img
                        src={item.coverUrl || item.mediaUrl}
                        className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                        alt={item.title}
                      />
                      {item.grade && item.grade !== "none" && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-md shadow-sm">
                          {item.grade}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-medium">
                          {item.duration || ""}
                        </span>
                        <div className="flex items-center gap-1 text-white">
                          <Heart className="w-3.5 h-3.5" />
                          <span className="text-xs">
                            {item.likesCount || item.likes?.length || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    <h4 className="font-bold text-neutral-900 text-sm mb-1.5 truncate group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-neutral-200">
                        <img
                          src={
                            item.author?.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.authorId}`
                          }
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs text-neutral-500 truncate">
                        {item.author?.username || "佚名"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      {showUploadModal && (
        <UploadPostModal
          activityId={activity.id}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchWorks();
          }}
        />
      )}
    </div>
  );
}
