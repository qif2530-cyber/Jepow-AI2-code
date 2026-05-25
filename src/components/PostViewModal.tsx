import React, { useState, useEffect } from "react";
import {
  X,
  Heart,
  Zap,
  ShieldCheck,
  Bookmark,
  Trash2,
  Check,
  Award,
  Eye,
  MessageSquare,
  UserPlus,
  UserMinus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Send,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import api from "../lib/api";
import { toast } from "sonner";
import { socket } from "../lib/socket";
import { checkIsVideoUrl } from "../lib/video";

interface PostViewModalProps {
  post: any;
  currentUser?: any;
  onClose: () => void;
  onPurchaseProject: (postId: string) => void;
  onOpenProfile: (userId: string) => void;
  onLogin?: () => void;
  onDeletePost?: (postId: string) => void;
  onNavigate?: (post: any) => void;
}

export const PostViewModal: React.FC<PostViewModalProps> = ({
  post: initialPost,
  currentUser,
  onClose,
  onPurchaseProject,
  onOpenProfile,
  onLogin,
  onDeletePost,
  onNavigate,
}) => {
  const [post, setPost] = useState(initialPost);
  const [isLiked, setIsLiked] = useState(false);
  const [isCollected, setIsCollected] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isFollowingLoading, setIsFollowingLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const contextList = initialPost?._contextList || [];
  const currentIndex = post
    ? contextList.findIndex((p: any) => String(p.id) === String(post.id))
    : -1;

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < contextList.length - 1) {
      const nextPost = {
        ...contextList[currentIndex + 1],
        _contextList: contextList,
      };
      setPost(nextPost);
      if (onNavigate) onNavigate(nextPost);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevPost = {
        ...contextList[currentIndex - 1],
        _contextList: contextList,
      };
      setPost(prevPost);
      if (onNavigate) onNavigate(prevPost);
    }
  };

  const isAuthor =
    currentUser &&
    post &&
    (String(currentUser.id) === String(post.userId) ||
      String(currentUser.id) === String(post.author?.id));
  const isAdmin = currentUser && currentUser.role === "admin";
  const canDelete = isAuthor || isAdmin;

  useEffect(() => {
    if (!post?.id) return;

    const handleUpdate = (data: any) => {
      if (data.postId === post.id) {
        setPost((prev: any) => (prev ? { ...prev, ...data } : prev));
      }
    };

    const handleFollowUpdate = (data: any) => {
      if (String(data.followingId) === String(post.userId)) {
        if (currentUser && String(data.followerId) === String(currentUser.id)) {
          return;
        }

        const diff = data.isFollowing ? 1 : -1;
        setPost((prev: any) => {
          if (!prev || !prev.author) return prev;
          return {
            ...prev,
            author: {
              ...prev.author,
              followersCount: Math.max(
                0,
                (prev.author.followersCount || 0) + diff,
              ),
            },
          };
        });
      }
    };

    socket.on("post_updated", handleUpdate);
    socket.on("follow_changed", handleFollowUpdate);

    const handleCommentAdded = (data: any) => {
      if (data.postId === post.id) {
        setComments((prev) => {
          // Check if comment already exists to avoid duplicates
          if (prev.find((c) => c.id === data.comment.id)) return prev;
          return [...prev, data.comment];
        });
      }
    };

    const handleCommentDeleted = (data: any) => {
      if (data.postId === post.id) {
        setComments((prev) => prev.filter((c) => c.id !== data.commentId));
      }
    };

    socket.on("comment_added", handleCommentAdded);
    socket.on("comment_deleted", handleCommentDeleted);
    socket.on("user_profile_updated", (data) => {
      // Update post author if it matches
      setPost((prev: any) => {
        if (
          prev &&
          prev.author &&
          String(prev.author.id) === String(data.userId)
        ) {
          return {
            ...prev,
            author: {
              ...prev.author,
              avatar: data.user.avatar,
              username: data.user.username,
              accountName: data.user.accountName,
              certifications: data.user.certifications,
            },
          };
        }
        return prev;
      });
      // Update comment authors
      setComments((prev) =>
        prev.map((c) =>
          c.author && String(c.author.id) === String(data.userId)
            ? {
                ...c,
                author: {
                  ...c.author,
                  avatar: data.user.avatar,
                  username: data.user.username,
                },
              }
            : c,
        ),
      );
    });

    return () => {
      socket.off("post_updated", handleUpdate);
      socket.off("follow_changed", handleFollowUpdate);
      socket.off("comment_added", handleCommentAdded);
      socket.off("comment_deleted", handleCommentDeleted);
      socket.off("user_profile_updated");
    };
  }, [post.id, post.userId, currentUser?.id]);

  useEffect(() => {
    setPost(initialPost);
  }, [initialPost]);

  useEffect(() => {
    let isMounted = true;
    const fetchInteractionStatus = async () => {
      setIsLoading(true);
      try {
        const [postRes, commentsRes, statusRes] = await Promise.all([
          api.get(`/community/posts/${post.id}`),
          api.get(`/community/posts/${post.id}/comments`),
          currentUser
            ? api
                .get(`/community/posts/${post.id}/interaction-status`)
                .catch(() => ({
                  data: {
                    isFollowing: false,
                    isLiked: false,
                    isCollected: false,
                  },
                }))
            : Promise.resolve({
                data: {
                  isFollowing: false,
                  isLiked: false,
                  isCollected: false,
                },
              }),
        ]);

        if (!isMounted) return;

        // Update post data with full model from server
        setPost((prev: any) => ({
          ...postRes.data,
          _contextList: prev?._contextList,
        }));
        setIsLiked(statusRes.data.isLiked);
        setIsCollected(statusRes.data.isCollected);
        setIsFollowing(statusRes.data.isFollowing);
        setComments(commentsRes.data);

        // Record view silently to avoid annoying 502 toasts during transient server hiccups
        api
          .post(`/community/posts/${post.id}/view`, {}, { silent: true } as any)
          .catch(() => {});
      } catch (err) {
        if (!isMounted) return;
        console.error(
          "Failed to fetch post details, interaction status or comments",
          err,
        );
      } finally {
        if (isMounted) isLoading && setIsLoading(false);
      }
    };
    if (post?.id) {
      fetchInteractionStatus();
    }
    return () => {
      isMounted = false;
    };
  }, [post.id]);

  const handleLike = async () => {
    if (!currentUser) {
      if (onLogin) onLogin();
      else toast.error("需要登录认证");
      return;
    }

    // Optimistic update
    const nextIsLiked = !isLiked;
    const diff = nextIsLiked ? 1 : -1;
    setIsLiked(nextIsLiked);
    setPost((prev: any) => ({
      ...prev,
      likes: nextIsLiked
        ? [...(Array.isArray(prev.likes) ? prev.likes : []), currentUser.id]
        : Array.isArray(prev.likes)
          ? prev.likes.filter((id: string) => id !== currentUser.id)
          : [],
      likesCount: Math.max(0, (prev.likesCount || 0) + diff),
    }));

    try {
      const res = await api.post(`/community/posts/${post.id}/like`);
      // Update with server truth
      setIsLiked(res.data.isLiked);
      setPost((prev: any) => ({
        ...prev,
        likes: res.data.likes,
        likesCount: res.data.likesCount,
      }));
    } catch (err: any) {
      // Rollback
      setIsLiked(!nextIsLiked);
      setPost((prev: any) => {
        const oldLikes = !nextIsLiked
          ? [...(Array.isArray(prev.likes) ? prev.likes : []), currentUser.id]
          : Array.isArray(prev.likes)
            ? prev.likes.filter((id: string) => id !== currentUser.id)
            : [];

        return {
          ...prev,
          likes: oldLikes,
          likesCount: Math.max(0, (prev.likesCount || 0) - diff),
        };
      });
    }
  };

  const handleCollect = async () => {
    if (!currentUser) {
      if (onLogin) onLogin();
      else toast.error("需要登录认证");
      return;
    }

    const nextIsCollected = !isCollected;
    const diff = nextIsCollected ? 1 : -1;

    setIsCollected(nextIsCollected);
    setPost((prev: any) => ({
      ...prev,
      collectCount: Math.max(0, (prev.collectCount || 0) + diff),
    }));

    try {
      const res = await api.post(`/community/posts/${post.id}/collect`);
      setIsCollected(res.data.isCollected);
      // If server returns updated count, we use it
      if (res.data.collectCount !== undefined) {
        setPost((prev: any) => ({
          ...prev,
          collectCount: res.data.collectCount,
        }));
      }
      toast.success(res.data.isCollected ? "存档成功" : "已从存档移除");
    } catch (err: any) {
      setIsCollected(!nextIsCollected);
      setPost((prev: any) => ({
        ...prev,
        collectCount: Math.max(0, (prev.collectCount || 0) - diff),
      }));
      toast.error("系统核心错误");
    }
  };

  const handleFollow = async () => {
    if (!currentUser) {
      if (onLogin) onLogin();
      else toast.error("需要登录认证");
      return;
    }
    if (isAuthor) return;
    if (isFollowingLoading) return;

    setIsFollowingLoading(true);
    // Optimistic update for both follow status and author's follower count
    const nextIsFollowing = !isFollowing;
    const diff = nextIsFollowing ? 1 : -1;

    setIsFollowing(nextIsFollowing);
    if (post.author) {
      setPost((prev: any) => ({
        ...prev,
        author: {
          ...prev.author,
          followersCount: Math.max(0, (prev.author.followersCount || 0) + diff),
        },
      }));
    }

    try {
      const endpoint = nextIsFollowing ? "follow" : "unfollow";
      await api.post(`/user/${post.userId}/${endpoint}`);
    } catch (err: any) {
      // Rollback
      setIsFollowing(!nextIsFollowing);
      if (post.author) {
        setPost((prev: any) => ({
          ...prev,
          author: {
            ...prev.author,
            followersCount: Math.max(
              0,
              (prev.author.followersCount || 0) - diff,
            ),
          },
        }));
      }
      toast.error(err.response?.data?.error || "系统核心错误");
    } finally {
      setIsFollowingLoading(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    if (!currentUser) {
      if (onLogin) onLogin();
      else toast.error("需要登录认证");
      return;
    }
    setIsSubmittingComment(true);
    try {
      await api.post(`/community/posts/${post.id}/comments`, {
        content: newComment,
        replyTo: replyTo?.id,
      });
      // List will be updated by socket 'comment_added' event
      setNewComment("");
      setReplyTo(null);
      toast.success("发布成功");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "发布失败：需要认证");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      toast.info("请再次确认以终结作品。");
      setTimeout(() => setShowDeleteConfirm(false), 3000);
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(`/community/posts/${post.id}`);
      toast.success("作品已终结");
      onDeletePost?.(post.id);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "删除失败");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!post) return null;

  const isVideo = checkIsVideoUrl(post.mediaUrl);

  // Robust count calculation: prioritize explicit counts, fallback to array length, ensure non-negative
  const likesCount = Math.max(
    0,
    post?.likesCount ?? (Array.isArray(post?.likes) ? post.likes.length : 0),
  );
  const collectCount = Math.max(
    0,
    post?.collectCount ??
      (Array.isArray(post?.collects) ? post.collects.length : 0),
  );
  const commentCount = Math.max(
    0,
    post?.commentCount ?? (post?.comments?.length || 0),
  );
  const viewsCount = Math.max(0, post?.viewsCount ?? (post?.views || 0));

  return (
    <div className="fixed inset-0 bg-white z-[100000] flex flex-col md:flex-row p-0 overflow-hidden ">
      {/* LEFT: Media Container */}
      <div className="flex-1 relative flex flex-col items-center justify-center min-w-0">
        {/* Top right Close Button (X) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-0 z-[60] flex items-center justify-center p-3 w-12 h-12 bg-white/90 backdrop-blur-md border-l border-y border-black/10 hover:bg-white rounded-l-xl transition-all text-neutral-600 hover:text-neutral-900 shadow-md"
          title="退出"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {/* Navigation Arrows */}
        {contextList && contextList.length > 1 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-[60] flex flex-col bg-white/90 backdrop-blur-md border-l border-y border-black/10 rounded-l-xl shadow-md overflow-hidden pointer-events-auto">
            <button
              className={`p-3 w-12 h-12 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-white transition-all ${currentIndex <= 0 ? "opacity-30 cursor-not-allowed" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.blur();
                if (currentIndex > 0) handlePrev();
              }}
              disabled={currentIndex <= 0}
              title="上一个作品"
            >
              <ChevronUp className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <div className="h-[1px] bg-black/10 mx-2"></div>
            <button
              className={`p-3 w-12 h-12 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-white transition-all ${currentIndex >= contextList.length - 1 || currentIndex === -1 ? "opacity-30 cursor-not-allowed" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.blur();
                if (
                  currentIndex < contextList.length - 1 &&
                  currentIndex !== -1
                )
                  handleNext();
              }}
              disabled={
                currentIndex >= contextList.length - 1 || currentIndex === -1
              }
              title="下一个作品"
            >
              <ChevronDown className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        )}

        {/* Main Media */}
        <div className="relative z-10 w-full h-full p-4 md:p-12 flex items-center justify-center pointer-events-none">
          <motion.div
            key={post.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="relative w-full h-full flex items-center justify-center"
          >
            {isVideo ? (
              <video
                src={post.mediaUrl}
                className="max-w-full max-h-full object-contain pointer-events-auto shadow-2xl rounded-lg"
                controls
                autoPlay
                loop
                playsInline
                preload="auto"
                ref={(el) => {
                  if (el) el.volume = 0.5;
                }}
              />
            ) : (
              <img
                src={post.mediaUrl}
                alt={post.title}
                className="max-w-full max-h-full object-contain pointer-events-auto shadow-2xl rounded-lg"
                referrerPolicy="no-referrer"
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* RIGHT: Info & Comments Sidebar */}
      <div className="w-full md:w-[400px] bg-white border-t md:border-t-0 md:border-l border-black/10 flex flex-col shrink-0 z-[100] max-h-[40vh] md:max-h-full">
        {/* Header & Author Info */}
        <div className="p-4 pb-6 flex flex-col shrink-0 border-b border-black/5 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenProfile(post.author?.id);
                }}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left"
              >
                <img
                  src={
                    post.author?.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.id || "default"}`
                  }
                  alt={post.author?.username || "Unknown"}
                  className="w-6 h-6 rounded-full object-cover border border-black/20"
                />
                <span className="text-neutral-900 font-medium text-sm">
                  {post.author?.username || "未知作者"}
                </span>
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFollow}
                disabled={
                  isFollowingLoading || post.author?.id === currentUser?.id
                }
                className={`rounded-full h-6 px-3 text-xs font-normal border-black/20 hover:bg-black/10 ${
                  isFollowing
                    ? "bg-black/10 text-neutral-900 border-transparent"
                    : "bg-transparent text-neutral-900"
                }`}
              >
                {isFollowing ? "已关注" : "+ 关注"}
              </Button>
            </div>

            <div className="flex items-center gap-4 text-neutral-600">
              <button
                onClick={handleLike}
                disabled={isLoading}
                className={`flex items-center gap-1.5 transition-colors ${isLiked ? "text-red-500" : "hover:text-neutral-900"}`}
              >
                <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
                <span className="text-sm">{likesCount}</span>
              </button>
              <button className="hover:text-neutral-900 transition-colors">
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 bg-current rounded-full"></div>
                  <div className="w-1 h-1 bg-current rounded-full"></div>
                  <div className="w-1 h-1 bg-current rounded-full"></div>
                </div>
              </button>
            </div>
          </div>

          <div className="text-neutral-500 text-xs ml-11 mb-6 flex items-center gap-2">
            <span>
              {new Date(post.createdAt || Date.now())
                .toLocaleDateString()
                .replace(/\//g, "-")}
            </span>
            <span>|</span>
            <span>内容由 AI 生成</span>
          </div>

          <div className="px-2">
            <div className="text-xs text-neutral-600 mb-2 font-medium">
              图片提示词
            </div>
            <p className="text-neutral-800 text-sm leading-relaxed max-h-32 overflow-y-auto custom-scrollbar break-words">
              {post.description || post.title || "无提示词"}
            </p>
          </div>
        </div>

        {/* Action Bar (Original elements minimized or removed as requested by the UI mock) */}
        {currentUser?.id === post.author?.id && (
          <div className="px-6 py-2 flex items-center justify-end bg-white/60 shrink-0 border-b border-black/5">
            <button
              onClick={handleDelete}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs ${showDeleteConfirm ? "text-red-500 bg-red-500/20" : "text-neutral-500 hover:text-red-500 hover:bg-red-500/10"}`}
              title="删除作品"
            >
              <Trash2 className="w-3.5 h-3.5" />{" "}
              {showDeleteConfirm ? "确认删除?" : "删除作品"}
            </button>
          </div>
        )}

        {/* Comments Section */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-5 custom-scrollbar min-h-0">
          {comments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 opacity-60 min-h-[100px]">
              <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-sm">暂无评论, 留下第一条足迹吧</span>
            </div>
          ) : (
            (function renderComments(
              commentList: any[],
              parentId: string | null = null,
            ): any {
              const levelComments = commentList.filter((c) =>
                parentId === null ? !c.replyTo : c.replyTo === parentId,
              );
              return levelComments.map((comment) => {
                const hasReplies = commentList.some(
                  (c) => c.replyTo === comment.id,
                );
                return (
                  <div
                    key={comment.id}
                    className={`flex gap-3 group ${parentId ? "mt-4 first:mt-3" : "mt-5 first:mt-0"}`}
                  >
                    <img
                      src={
                        comment.author?.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author?.id || "default"}`
                      }
                      className={`${parentId ? "w-6 h-6" : "w-8 h-8"} rounded-full border border-black/10 shrink-0 object-cover`}
                      alt="avatar"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-neutral-900 text-xs font-bold">
                          {comment.author?.username || "未知"}
                        </span>
                        <span className="text-neutral-600 text-[10px] ml-2">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-neutral-700 text-sm mt-0.5 leading-snug break-words whitespace-pre-wrap">
                        {comment.content}
                      </p>
                      <div className="mt-1 flex items-center">
                        <button
                          onClick={() => setReplyTo(comment)}
                          className="text-neutral-500 text-xs hover:text-neutral-900 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          回复
                        </button>
                      </div>

                      {hasReplies && (
                        <div className="mt-2 text-sm text-neutral-600">
                          {renderComments(commentList, comment.id)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })(comments)
          )}
        </div>

        {/* Comment Input */}
        <div className="p-3 border-t border-black/10 bg-white shrink-0">
          {replyTo && (
            <div className="flex items-center justify-between bg-black/5 rounded-lg px-3 py-2 mb-3 mx-1">
              <span className="text-xs text-neutral-600 truncate flex-1">
                正在回复{" "}
                <span className="text-neutral-900">
                  @{replyTo.author?.username || "未知"}
                </span>{" "}
                : {replyTo.content}
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-neutral-500 hover:text-neutral-900 shrink-0 ml-2 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={handleCommentSubmit} className="relative">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="说点什么..."
              className="w-full bg-white border border-black/10 rounded-full px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-black/30 transition-colors pr-10"
              disabled={isSubmittingComment}
            />
            <button
              type="submit"
              disabled={isSubmittingComment || !newComment.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:bg-neutral-200 disabled:text-neutral-500 transition-colors"
            >
              <Send className="w-3.5 h-3.5 -ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
