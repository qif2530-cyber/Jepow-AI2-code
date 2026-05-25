import React, { useState, useEffect } from "react";
import {
  X,
  ShieldCheck,
  Camera,
  Loader2,
  Zap,
  Heart,
  Trash2,
  LogOut,
} from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import api from "../lib/api";
import { socket } from "../lib/socket";
import { motion } from "motion/react";
import { UserListModal } from "./UserListModal";
import { CommunityPostCard } from "./CommunityPostCard";

interface PublicProfileModalProps {
  userId: string;
  currentUser?: any;
  onClose: () => void;
  onPurchaseProject: (postId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onUpdateProfile?: (user: any) => void;
  onOpenChat?: (userId: string) => void;
  onViewPost?: (post: any) => void;
  onUploadWork?: () => void;
  onDeletePost?: (postId: string) => void;
  onOpenEditProfile?: () => void;
  onLogout?: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  currentUser,
  onClose,
  onPurchaseProject,
  onOpenProfile,
  onUpdateProfile,
  onOpenChat,
  onViewPost,
  onUploadWork,
  onDeletePost,
  onOpenEditProfile,
  onLogout,
}) => {
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [collectedPosts, setCollectedPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"published" | "collected">(
    "published",
  );
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [showList, setShowList] = useState<{
    type: "followers" | "following";
    title: string;
  } | null>(null);

  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const [profileRes, postsRes, followRes, collectionsRes] =
          await Promise.all([
            api.get(`/user/${userId}`),
            api.get(`/user/${userId}/posts`),
            currentUser && !isOwnProfile
              ? api
                  .get(`/user/${userId}/is-following`)
                  .catch(() => ({ data: { isFollowing: false } }))
              : Promise.resolve({ data: { isFollowing: false } }),
            api.get(`/user/${userId}/collections`).catch(() => ({ data: [] })),
          ]);
        setProfile(profileRes.data);
        setPosts(postsRes.data);
        setCollectedPosts(collectionsRes.data);
        setIsFollowing(followRes.data.isFollowing);
      } catch (err) {
        toast.error("获取资料失败：用户不存在");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId, isOwnProfile, currentUser?.id]);

  useEffect(() => {
    const handlePostUpdate = (data: any) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === data.postId ? { ...p, ...data } : p)),
      );
      setCollectedPosts((prev) =>
        prev.map((p) => (p.id === data.postId ? { ...p, ...data } : p)),
      );
    };

    const handleFollowUpdate = (data: any) => {
      if (String(data.followingId) === String(userId)) {
        // If the follow action was initiated by the current user, we ignore it here
        // because we already applied an optimistic update locally in handleFollowAction.
        if (currentUser && String(data.followerId) === String(currentUser.id)) {
          return;
        }

        const diff = data.isFollowing ? 1 : -1;
        setProfile((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            followersCount: Math.max(0, (prev.followersCount || 0) + diff),
          };
        });
      }
    };

    socket.on("post_updated", handlePostUpdate);
    socket.on("follow_changed", handleFollowUpdate);
    socket.on("user_profile_updated", (data) => {
      if (String(data.userId) === String(userId)) {
        setProfile(data.user);
      }
    });

    return () => {
      socket.off("post_updated", handlePostUpdate);
      socket.off("follow_changed", handleFollowUpdate);
      socket.off("user_profile_updated");
    };
  }, [userId, currentUser?.id]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setIsCoverUploading(true);
    try {
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newCoverUrl = res.data.url;

      await api.post("/user/profile", {
        coverUrl: newCoverUrl,
      });
      setProfile((prev: any) => ({ ...prev, coverUrl: newCoverUrl }));
      onUpdateProfile?.({ ...profile, coverUrl: newCoverUrl });

      toast.success("封面更新成功");
    } catch (err: any) {
      toast.error("封面上传失败");
    } finally {
      setIsCoverUploading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      toast.error("请先登录");
      return;
    }

    if (isFollowLoading) return;

    // Optimistic update
    const nextIsFollowing = !isFollowing;
    const diff = nextIsFollowing ? 1 : -1;
    setIsFollowing(nextIsFollowing);
    setProfile((prev: any) => ({
      ...prev,
      followersCount: Math.max(0, (prev.followersCount || 0) + diff),
    }));

    setIsFollowLoading(true);

    try {
      if (nextIsFollowing) {
        await api.post(`/user/${userId}/follow`);
      } else {
        await api.post(`/user/${userId}/unfollow`);
      }
      // Server will broadcast follow update if needed, but we rely on our optimistic state for now
    } catch (err: any) {
      // Rollback
      setIsFollowing(!nextIsFollowing);
      setProfile((prev: any) => ({
        ...prev,
        followersCount: Math.max(0, (prev.followersCount || 0) - diff),
      }));
      toast.error(err.response?.data?.error || "同步错误");
    } finally {
      setIsFollowLoading(false);
    }
  };

  const isLiked = (post: any) => {
    if (!currentUser) return false;
    const likesArray = Array.isArray(post.likes) ? post.likes : [];
    return likesArray.includes(currentUser.id);
  };

  const handleDeletePost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!confirm("确定要彻底删除该作品吗？")) return;

    setDeletingPostId(postId);
    try {
      await api.delete(`/community/posts/${postId}`);
      toast.success("作品已永久移除");
      setPosts((prev) => (prev || []).filter((p) => p.id !== postId));
      setCollectedPosts((prev) => (prev || []).filter((p) => p.id !== postId));
      onDeletePost?.(postId);
    } catch (err: any) {
      toast.error("删除失败");
    } finally {
      setDeletingPostId(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white/80 z-[9000] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-neutral-900 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="fixed inset-0 bg-white/95 z-[9000] flex items-center justify-center">
      <div
        className="bg-white w-full h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar controls */}
        <div className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-[110]"></div>
        <div className="fixed top-6 right-6 md:top-8 md:right-8 z-[120] flex items-center gap-4">
          {isOwnProfile && onLogout && (
            <button
              onClick={onLogout}
              title="退出登录"
              className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/20 backdrop-blur-md hover:bg-red-500/90 text-white hover:text-white rounded-full transition-all shadow-lg"
            >
              <LogOut className="w-5 h-5 ml-0.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-white/20 backdrop-blur-md hover:bg-white/90 rounded-full transition-all text-white hover:text-neutral-900 shadow-lg"
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        <div className="flex-1 p-0 w-full bg-white relative">
          {/* Cover Image Area - Simplified and Elegant */}
          <div className="h-48 md:h-64 w-full relative group/cover bg-neutral-100">
            <img
              src={
                profile.coverUrl ||
                "https://picsum.photos/seed/minimal/1920/1080"
              }
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover/cover:opacity-100"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10"></div>

            {isOwnProfile && (
              <div className="absolute top-4 md:top-6 right-4 md:right-6 z-20 opacity-0 group-hover/cover:opacity-100 transition-all duration-300">
                <div className="relative">
                  <Button className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white border border-white/20 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
                    {isCoverUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    <span className="text-xs font-medium tracking-wide">
                      更换封面
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isCoverUploading}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="max-w-6xl mx-auto px-6 md:px-12 relative z-10 pb-20 md:pb-32">
            {/* Profile Header - Clean & Minimalist */}
            <div className="flex flex-col md:flex-row items-start gap-6 md:gap-10 -mt-16 md:-mt-24 mb-12 md:mb-16">
              <div className="relative shrink-0">
                <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-white shadow-xl bg-white transition-transform duration-500 hover:scale-[1.02]">
                  <img
                    src={
                      profile.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`
                    }
                    alt={profile.username}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              <div className="flex-1 space-y-4 pt-2 md:pt-28 lg:pt-28 xl:pt-28">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">
                      {profile.username}
                    </h1>
                    {profile.certifications &&
                      profile.certifications.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 border border-yellow-200">
                          <ShieldCheck className="w-4 h-4 text-yellow-600" />
                          <span className="text-yellow-700 text-xs font-semibold">
                            认证设计师
                          </span>
                        </div>
                      )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-500 font-medium">
                    <span>@{profile.accountName || profile.username}</span>
                    <span className="w-1 h-1 bg-neutral-300 rounded-full"></span>
                    <span>ID: {String(profile.id).slice(-6)}</span>
                  </div>
                </div>

                <p className="text-neutral-600 text-sm md:text-base leading-relaxed max-w-2xl">
                  {profile.bio || "暂无个人简介"}
                </p>

                <div className="flex items-center gap-8 pt-2">
                  <button
                    className={`flex items-baseline gap-2 group ${isOwnProfile ? "cursor-pointer hover:opacity-80" : "cursor-default"} transition-opacity`}
                    onClick={() =>
                      isOwnProfile &&
                      setShowList({ type: "followers", title: "粉丝列表" })
                    }
                  >
                    <span className="text-xl md:text-2xl font-bold text-neutral-900">
                      {profile.followersCount || 0}
                    </span>
                    <span className="text-sm font-medium text-neutral-500">
                      粉丝
                    </span>
                  </button>
                  <button
                    className={`flex items-baseline gap-2 group ${isOwnProfile ? "cursor-pointer hover:opacity-80" : "cursor-default"} transition-opacity`}
                    onClick={() =>
                      isOwnProfile &&
                      setShowList({ type: "following", title: "关注列表" })
                    }
                  >
                    <span className="text-xl md:text-2xl font-bold text-neutral-900">
                      {profile.followingCount || 0}
                    </span>
                    <span className="text-sm font-medium text-neutral-500">
                      关注
                    </span>
                  </button>
                </div>
              </div>

              <div className="w-full md:w-auto pt-4 md:pt-28 flex flex-row gap-3 shrink-0">
                {isOwnProfile ? (
                  <>
                    <Button
                      className="flex-1 md:flex-initial bg-black text-white hover:bg-neutral-800 rounded-full px-6 md:px-8 h-10 md:h-11 text-sm font-semibold transition-all shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUploadWork?.();
                      }}
                    >
                      发布作品
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 md:flex-initial bg-white hover:bg-neutral-50 text-neutral-900 rounded-full px-6 md:px-8 h-10 md:h-11 text-sm font-semibold border border-neutral-200 transition-all shadow-sm shadow-black/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditProfile?.();
                      }}
                    >
                      编辑资料
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className={`flex-1 md:flex-initial rounded-full px-8 md:px-10 h-10 md:h-11 text-sm font-semibold transition-all shadow-sm ${isFollowing ? "bg-neutral-100 text-neutral-700 border border-neutral-200" : "bg-black text-white hover:bg-neutral-800"}`}
                      onClick={handleFollowToggle}
                      disabled={isFollowLoading}
                    >
                      {isFollowing ? "已关注" : "关注"}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 md:flex-initial border-neutral-200 text-neutral-900 rounded-full px-8 md:px-10 h-10 md:h-11 text-sm font-semibold hover:bg-neutral-50 transition-all shadow-sm shadow-black/5"
                      onClick={() => onOpenChat && onOpenChat(userId)}
                    >
                      私信
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-12">
              <div className="flex items-center gap-8 border-b border-neutral-200 pb-4">
                <button
                  onClick={() => setActiveTab("published")}
                  className={`text-lg transition-all relative font-medium ${activeTab === "published" ? "text-neutral-900 pb-4 -mb-4" : "text-neutral-500 hover:text-neutral-700"}`}
                >
                  动态
                  {activeTab === "published" && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900"
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("collected")}
                  className={`text-lg transition-all relative font-medium ${activeTab === "collected" ? "text-neutral-900 pb-4 -mb-4" : "text-neutral-500 hover:text-neutral-700"}`}
                >
                  收藏
                  {activeTab === "collected" && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900"
                    />
                  )}
                </button>
              </div>

              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6">
                {(activeTab === "published" ? posts : collectedPosts).map(
                  (post) => (
                    <div
                      key={post.id}
                      className="relative group/card break-inside-avoid mb-6"
                    >
                      <CommunityPostCard
                        post={post}
                        user={currentUser}
                        onView={(p) =>
                          onViewPost?.({
                            ...p,
                            _contextList:
                              activeTab === "published"
                                ? posts
                                : collectedPosts,
                          })
                        }
                        onProfileOpen={(id) => onOpenProfile?.(id)}
                        onLike={async (postId) => {
                          if (!currentUser) {
                            toast.error("需要登录认证");
                            return;
                          }

                          const postsToSearch = [...posts, ...collectedPosts];
                          const post = postsToSearch.find(
                            (p) => p.id === postId,
                          );
                          if (!post) return;

                          const currentlyLiked = isLiked(post);
                          const diff = currentlyLiked ? -1 : 1;

                          // Optimistic update
                          const updateList = (prev: any[]) =>
                            prev.map((p) => {
                              if (p.id === postId) {
                                const newLikes = currentlyLiked
                                  ? Array.isArray(p.likes)
                                    ? p.likes.filter(
                                        (id: any) => id !== currentUser.id,
                                      )
                                    : []
                                  : [
                                      ...(Array.isArray(p.likes)
                                        ? p.likes
                                        : []),
                                      currentUser.id,
                                    ];
                                return {
                                  ...p,
                                  likes: newLikes,
                                  likesCount: Math.max(
                                    0,
                                    (p.likesCount || 0) + diff,
                                  ),
                                };
                              }
                              return p;
                            });

                          setPosts(updateList);
                          setCollectedPosts(updateList);

                          try {
                            await api.post(`/community/posts/${postId}/like`);
                          } catch (err) {
                            // Rollback
                            const rollbackList = (prev: any[]) =>
                              prev.map((p) => {
                                if (p.id === postId) {
                                  const oldLikes = !currentlyLiked
                                    ? Array.isArray(p.likes)
                                      ? p.likes.filter(
                                          (id: any) => id !== currentUser.id,
                                        )
                                      : []
                                    : [
                                        ...(Array.isArray(p.likes)
                                          ? p.likes
                                          : []),
                                        currentUser.id,
                                      ];
                                  return {
                                    ...p,
                                    likes: oldLikes,
                                    likesCount: Math.max(
                                      0,
                                      (p.likesCount || 0) - diff,
                                    ),
                                  };
                                }
                                return p;
                              });
                            setPosts(rollbackList);
                            setCollectedPosts(rollbackList);
                            toast.error("点赞失败");
                          }
                        }}
                        onPurchase={(postId) => onPurchaseProject?.(postId)}
                      />
                      {isOwnProfile && activeTab === "published" && (
                        <button
                          onClick={(e) => handleDeletePost(e, post.id)}
                          className="absolute top-4 left-4 w-10 h-10 rounded-md bg-white/60 border border-black/10 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all hover:bg-red-500 hover:border-red-500 text-neutral-900 z-[20] shadow-2xl"
                        >
                          {deletingPostId === post.id ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Trash2 className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>

              {(activeTab === "published" ? posts : collectedPosts).length ===
                0 && (
                <div className="py-32 flex flex-col items-center justify-center text-neutral-600 gap-4">
                  <Zap className="w-12 h-12 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-sm">
                    暂无内容
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showList && (
        <UserListModal
          userId={userId}
          type={showList.type}
          title={showList.title}
          onClose={() => setShowList(null)}
          onUserClick={(id) => {
            setShowList(null);
            onOpenProfile?.(id);
          }}
        />
      )}
    </div>
  );
};
