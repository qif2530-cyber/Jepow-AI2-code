import React, { useEffect, useState } from "react";
import {
  Heart,
  Eye,
  MessageSquare,
  ArrowUpRight,
  Plus,
  Check,
  Award,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { socket } from "../lib/socket";
import api from "../lib/api";
import { toast } from "sonner";
import { checkIsVideoUrl } from "../lib/video";

interface CommunityPostCardProps {
  post: any;
  user: any;
  onView: (post: any) => void;
  onProfileOpen: (userId: string) => void;
  onLike: (postId: string) => void;
  onPurchase: (postId: string) => void;
  onLogin?: () => void;
}

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

export const CommunityPostCard = ({
  post: initialPost,
  user,
  onView,
  onProfileOpen,
  onLike,
  onPurchase,
  onLogin,
}: CommunityPostCardProps) => {
  const [post, setPost] = useState(initialPost);
  const [customAspect, setCustomAspect] = useState<number | null>(null);

  useEffect(() => {
    setPost(initialPost);
  }, [initialPost]);

  useEffect(() => {
    if (!post?.id) return;
    const handleUpdate = (data: any) => {
      if (data.postId === post.id) {
        setPost((prev: any) => (prev ? { ...prev, ...data } : prev));
      }
    };

    socket.on("post_updated", handleUpdate);
    return () => {
      socket.off("post_updated", handleUpdate);
    };
  }, [post?.id]);

  if (!post) return null;

  const isVideo = checkIsVideoUrl(post.mediaUrl) && !post.coverUrl;
  const likesArray = Array.isArray(post.likes) ? post.likes : [];
  const isLiked = user && likesArray.includes(user?.id);

  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile || !videoRef.current || !isVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoRef.current?.play().catch(() => {});
          } else {
            videoRef.current?.pause();
          }
        });
      },
      { threshold: 0.5 },
    );

    observer.observe(videoRef.current);
    return () => {
      if (videoRef.current) observer.unobserve(videoRef.current);
    };
  }, [isVideo]);

  const likesCount = Math.max(
    0,
    post.likesCount ?? (Array.isArray(post.likes) ? post.likes.length : 0),
  );
  const commentCount = Math.max(
    0,
    post.commentCount ?? (post.comments?.length || 0),
  );
  const viewsCount = Math.max(0, post.viewsCount ?? (post.views || 0));

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest("a")
    )
      return;
    onView(post);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0.001;
        }
      }}
      onClick={handleClick}
      className="group w-full mb-1 sm:mb-2 relative cursor-pointer"
    >
      <div className="w-full relative z-10 bg-white shadow-lg hover:shadow-xl transition-shadow transition-colors hover:border-black/20 duration-300 rounded-xl overflow-hidden border border-black/5">
        <div 
          className={`relative z-0 w-full overflow-hidden bg-neutral-100 ${!customAspect ? getAspectClass(post) : ""}`}
          style={customAspect ? { aspectRatio: String(customAspect) } : {}}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={
                post.mediaUrl?.includes("#t=")
                  ? post.mediaUrl
                  : `${post.mediaUrl}#t=0.001`
              }
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              muted
              loop
              playsInline
              preload="metadata"
              poster={post.coverUrl || post.thumbnailUrl}
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.videoWidth && video.videoHeight) {
                  setCustomAspect(video.videoWidth / video.videoHeight);
                }
              }}
            />
          ) : (
            <img
              src={
                post.coverUrl ||
                post.thumbnailUrl ||
                post.mediaUrl ||
                "https://picsum.photos/seed/placeholder/800/450"
              }
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setCustomAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="flex items-center justify-between">
            <button
              onClick={() => post.author?.id && onProfileOpen(post.author.id)}
              className="flex items-center gap-2 group/author shrink min-w-0"
            >
              <div className="w-5 h-5 rounded-full overflow-hidden bg-indigo-500 flex items-center justify-center shrink-0 border-none">
                {post.author?.avatar ? (
                  <img
                    src={post.author.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-[10px] text-white font-bold">
                    {post.author?.username?.charAt(0) ||
                      post.author?.name?.charAt(0) ||
                      "U"}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-white/80 truncate drop-shadow-md">
                {post.author?.username || post.author?.name || "未知用户"}
              </span>
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (post.id) onLike(post.id);
                }}
                className={`flex items-center gap-1 text-[12px] transition-all font-medium ${isLiked ? "text-red-400" : "text-white/90 hover:text-white"}`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${isLiked ? "fill-current" : ""}`}
                />
                <span className="drop-shadow-md">{likesCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
