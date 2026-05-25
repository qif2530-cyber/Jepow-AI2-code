import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  MessageCircle,
  Bell,
  Megaphone,
  ChevronLeft,
  Send,
  Trash2,
  MoreVertical,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import api from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { socket } from "../lib/socket";

interface MessagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUser?: any;
  activeChatUser: string | null;
  setActiveChatUser: (userId: string | null) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
  onTabChange?: (tab: "chats" | "system" | "official") => void;
}

export const MessagesPanel: React.FC<
  MessagesPanelProps & { activeTab?: "chats" | "system" | "official" }
> = ({
  isOpen,
  onClose,
  currentUserId,
  currentUser,
  activeTab: initialActiveTab,
  activeChatUser,
  setActiveChatUser,
  onOpenProfile,
  onOpenPost,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<"chats" | "system" | "official">(
    initialActiveTab || "chats",
  );

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);
  const [recentChats, setRecentChats] = useState<any[]>([]);

  // Sync tab if prop changes (e.g. from nav stack restoration)
  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputValue, setChatInputValue] = useState("");
  const [targetUser, setTargetUser] = useState<any>(null);
  const [isTargetUserOnline, setIsTargetUserOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch recent chats
  const fetchRecentChats = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoadingChats(true);
    try {
      console.log(
        "[MessagesPanel] fetchRecentChats called, showLoading:",
        showLoading,
      );
      const res = await api.get("/user/recent-chats");
      console.log("[MessagesPanel] fetchRecentChats response:", res.data);
      setRecentChats(res.data);
    } catch (err) {
      console.error("[MessagesPanel] fetchRecentChats error:", err);
    } finally {
      if (showLoading) setIsLoadingChats(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get("/user/notifications");
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const res = await api.get("/news");
      setNews(res.data);
    } catch (err) {
      console.error("Failed to fetch news", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "chats" && !activeChatUser) {
        fetchRecentChats(true);
      } else if (activeTab === "system") {
        fetchNotifications();
      } else if (activeTab === "official") {
        fetchNews();
      }
    }
  }, [
    isOpen,
    activeTab,
    activeChatUser,
    fetchRecentChats,
    fetchNotifications,
    fetchNews,
  ]);

  useEffect(() => {
    if (activeChatUser) {
      setActiveTab("chats");
      // Fetch target user info
      api
        .get(`/user/${activeChatUser}`)
        .then((res) => {
          setTargetUser(res.data);
        })
        .catch(console.error);

      // Check online status
      api
        .get(`/user/online-status/${activeChatUser}`)
        .then((res) => {
          setIsTargetUserOnline(res.data.isOnline);
        })
        .catch(console.error);

      // Fetch historical messages
      api
        .get(`/messages/${activeChatUser}`)
        .then((res) => {
          setChatMessages(res.data);
          window.dispatchEvent(new CustomEvent("recheck_unread"));
        })
        .catch(console.error);
    }
  }, [activeChatUser]);

  // Listen for online status updates
  useEffect(() => {
    const handleOnline = (data: { userId: string }) => {
      if (data.userId === activeChatUser) setIsTargetUserOnline(true);
    };
    const handleOffline = (data: { userId: string }) => {
      if (data.userId === activeChatUser) setIsTargetUserOnline(false);
    };

    socket.on("user_online", handleOnline);
    socket.on("user_offline", handleOffline);

    return () => {
      socket.off("user_online", handleOnline);
      socket.off("user_offline", handleOffline);
    };
  }, [activeChatUser]);

  useEffect(() => {
    // Listen for incoming messages
    const handleReceiveMessage = (message: any) => {
      if (activeChatUser) {
        if (
          (String(message.senderId) === String(currentUserId) &&
            String(message.receiverId) === String(activeChatUser)) ||
          (String(message.senderId) === String(activeChatUser) &&
            String(message.receiverId) === String(currentUserId))
        ) {
          if (
            String(message.senderId) === String(activeChatUser) &&
            String(message.receiverId) === String(currentUserId)
          ) {
            // Mark as read immediately since we are viewing the chat
            api
              .post(`/user/messages/${message.id}/read`)
              .then(() => {
                window.dispatchEvent(new CustomEvent("unread_decreased"));
              })
              .catch(() => {});
          }

          setChatMessages((prev) => {
            // Check if there's a temp message to replace
            const tempIndex = prev.findIndex(
              (m) => m.isTemp && m.content === message.content,
            );
            if (
              tempIndex !== -1 &&
              String(message.senderId) === String(currentUserId)
            ) {
              const newMessages = [...prev];
              // Keep the temp ID so the React key doesn't change, avoiding re-animation
              newMessages[tempIndex] = {
                ...message,
                id: prev[tempIndex].id,
                realId: message.id,
                isTemp: false,
              };
              return newMessages;
            }
            // If it's a new message (not one we just sent), or no match, just add it
            if (
              !prev.some((m) => m.id === message.id || m.realId === message.id)
            ) {
              return [...prev, message];
            }
            return prev;
          });
        }
      } else if (activeTab === "chats") {
        // Refresh recent chats if we are on the chats list
        fetchRecentChats(false);
      }
    };

    socket.on("receive_message", handleReceiveMessage);

    const handleReceiveNotification = (notification: any) => {
      if (activeTab === "system") {
        setNotifications((prev) => [notification, ...prev]);
      }
    };

    socket.on("receive_notification", handleReceiveNotification);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("receive_notification", handleReceiveNotification);
    };
  }, [currentUserId, activeChatUser, activeTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendMessage = () => {
    if (!chatInputValue.trim() || !activeChatUser) return;

    const content = chatInputValue.trim();
    setChatInputValue("");

    // Optimistically add message
    const tempMessage = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      receiverId: activeChatUser,
      content,
      createdAt: new Date().toISOString(),
      isTemp: true,
    };

    setChatMessages((prev) => [...prev, tempMessage]);

    socket.emit("send_message", {
      fromUserId: currentUserId,
      toUserId: activeChatUser,
      content: content,
    });
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    targetId: string,
  ) => {
    e.stopPropagation();

    try {
      await api.delete(`/messages/${targetId}`);
      setRecentChats((prev) => prev.filter((c) => c.userId !== targetId));
      if (activeChatUser === targetId) {
        setActiveChatUser(null);
      }
      toast.success("对话已删除");
    } catch (err) {
      console.error("Failed to delete conversation", err);
      toast.error("删除失败");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/message/${messageId}`);
      setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success("消息已删除");
    } catch (err) {
      console.error("Failed to delete message", err);
      toast.error("删除失败");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100000] flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-white border-l border-black/10 flex flex-col shadow-2xl"
      >
        <div className="p-4 md:p-6 border-b border-black/10 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-md md:rounded-md bg-black/5 flex items-center justify-center text-neutral-900">
              <MessageCircle className="w-5 h-5 md:w-6 h-6" />
            </div>
            <h2 className="text-lg md:text-xl font-black text-neutral-900 uppercase tracking-tighter">
              消息中心
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 md:p-2 hover:bg-black/10 rounded-full transition-colors text-neutral-600 hover:text-neutral-900"
          >
            <X className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        <div className="flex p-3 md:p-4 gap-1.5 md:gap-2 border-b border-black/5 bg-white">
          <button
            onClick={() => {
              setActiveTab("chats");
              setActiveChatUser(null);
            }}
            className={`flex-1 py-2 md:py-2.5 rounded-lg md:rounded-md text-[11px] md:text-sm font-bold flex items-center justify-center gap-1.5 md:gap-2 transition-all ${activeTab === "chats" ? "bg-white text-black shadow-lg" : "bg-black/5 text-neutral-600 hover:bg-black/10"}`}
          >
            <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
            聊天
          </button>
          <button
            onClick={() => {
              setActiveTab("system");
              setActiveChatUser(null);
            }}
            className={`flex-1 py-2 md:py-2.5 rounded-lg md:rounded-md text-[11px] md:text-sm font-bold flex items-center justify-center gap-1.5 md:gap-2 transition-all ${activeTab === "system" ? "bg-white text-black shadow-lg" : "bg-black/5 text-neutral-600 hover:bg-black/10"}`}
          >
            <Bell className="w-3.5 h-3.5 md:w-4 md:h-4" />
            系统
          </button>
          <button
            onClick={() => {
              setActiveTab("official");
              setActiveChatUser(null);
            }}
            className={`flex-1 py-2 md:py-2.5 rounded-lg md:rounded-md text-[11px] md:text-sm font-bold flex items-center justify-center gap-1.5 md:gap-2 transition-all ${activeTab === "official" ? "bg-white text-black shadow-lg" : "bg-black/5 text-neutral-600 hover:bg-black/10"}`}
          >
            <Megaphone className="w-3.5 h-3.5 md:w-4 md:h-4" />
            官方
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "chats" &&
            (activeChatUser ? (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-4 border-b border-black/5 flex items-center gap-3 bg-black/50">
                  <button
                    onClick={() => setActiveChatUser(null)}
                    className="p-2 hover:bg-black/10 rounded-md transition-colors text-neutral-600 hover:text-neutral-900"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      targetUser?.id && onOpenProfile?.(targetUser.id)
                    }
                    className="w-10 h-10 rounded-full overflow-hidden bg-neutral-100 border border-black/10 shadow-lg hover:ring-2 hover:ring-white/40 transition-all"
                  >
                    {targetUser?.avatar ? (
                      <img
                        src={targetUser.avatar}
                        alt={targetUser.username}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = `https://picsum.photos/seed/${targetUser.id}/200/200`;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-neutral-900 bg-neutral-100">
                        {targetUser?.username?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() =>
                        targetUser?.id && onOpenProfile?.(targetUser.id)
                      }
                      className="font-bold text-neutral-900 truncate hover:text-neutral-600 transition-colors block"
                    >
                      {targetUser?.username || "加载中..."}
                    </button>
                    <div
                      className={`text-[10px] flex items-center gap-1 ${isTargetUserOnline ? "text-green-500" : "text-neutral-500"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isTargetUserOnline ? "bg-green-500 animate-pulse" : "bg-neutral-500"}`}
                      />
                      {isTargetUserOnline ? "在线" : "离线"}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-600 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center">
                        <MessageCircle className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-sm font-bold uppercase tracking-widest">
                        开始第一次对话
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => {
                    const isMe = msg.senderId === currentUserId;
                    const showTime =
                      idx === 0 ||
                      new Date(msg.createdAt).getTime() -
                        new Date(chatMessages[idx - 1].createdAt).getTime() >
                        300000;

                    return (
                      <div key={msg.id} className="space-y-2">
                        {showTime && (
                          <div className="flex justify-center">
                            <span className="px-2 py-1 rounded-lg bg-black/5 text-[10px] text-neutral-500 font-medium">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex ${isMe ? "justify-end" : "justify-start"} group`}
                          style={{ animationDelay: `${idx * 0.02}s` }}
                        >
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                              duration: 0.3,
                              ease: [0.23, 1, 0.32, 1],
                            }}
                            className={`flex gap-3 max-w-[85%] ${isMe ? "flex-row-reverse" : "flex-row"}`}
                          >
                            <button
                              onClick={() => {
                                const uid = isMe
                                  ? currentUserId
                                  : activeChatUser;
                                if (uid) onOpenProfile?.(uid);
                              }}
                              className="w-8 h-8 rounded-full overflow-hidden bg-neutral-100 shrink-0 mt-1 shadow-md hover:ring-2 hover:ring-white/40 transition-all"
                            >
                              <img
                                src={
                                  isMe
                                    ? currentUser?.avatar ||
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUserId}`
                                    : targetUser?.avatar ||
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeChatUser}`
                                }
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </button>
                            <div className="flex flex-col space-y-1">
                              <div className="flex items-center gap-2 group/msg">
                                <div
                                  className={`px-4 py-2.5 rounded-md text-sm leading-relaxed shadow-sm ${
                                    isMe
                                      ? "bg-white text-black rounded-tr-none"
                                      : "bg-neutral-100 text-neutral-900 rounded-tl-none border border-black/5"
                                  }`}
                                >
                                  {msg.content}
                                </div>
                                {isMe && (
                                  <button
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="opacity-0 group-hover/msg:opacity-100 p-1.5 hover:bg-black/10 rounded-lg text-neutral-500 hover:text-red-400 transition-all font-bold"
                                    title="删除消息"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-3 md:p-4 border-t border-black/5 bg-white flex items-center gap-2 md:gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={chatInputValue}
                      onChange={(e) => setChatInputValue(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSendMessage()
                      }
                      placeholder="输入消息..."
                      className="w-full bg-black/5 border border-black/10 rounded-md md:rounded-md px-3 md:px-4 py-2 md:py-3 text-[11px] md:text-sm text-neutral-900 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInputValue.trim()}
                    className="w-9 h-9 md:w-12 md:h-12 rounded-md md:rounded-md bg-white hover:bg-neutral-200 disabled:opacity-50 text-black flex items-center justify-center shrink-0 shadow-lg transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2 animate-in fade-in duration-300">
                {isLoadingChats ? (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-500 py-20">
                    <div className="w-8 h-8 border-2 border-black/20 border-t-white rounded-full animate-spin mb-4" />
                    <p className="text-sm font-black uppercase tracking-[0.2em]">
                      正在加载...
                    </p>
                  </div>
                ) : recentChats.length > 0 ? (
                  recentChats.map((chat) => (
                    <motion.div
                      key={chat.userId}
                      whileHover={{ x: 4 }}
                      onClick={() => setActiveChatUser(chat.userId)}
                      className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-[20px] md:rounded-md bg-black/[0.02] hover:bg-black/5 cursor-pointer transition-all border border-black/5 hover:border-black/10 group"
                    >
                      <div className="w-11 h-11 md:w-14 md:h-14 rounded-full overflow-hidden bg-neutral-100 shrink-0 border-2 border-transparent group-hover:border-black/20 transition-all shadow-lg">
                        <img
                          src={
                            chat.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.userId}`
                          }
                          alt={chat.username}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5 md:mb-1">
                          <h4 className="text-neutral-900 text-[13px] md:text-base font-bold truncate group-hover:text-neutral-600 transition-colors">
                            {chat.username}
                          </h4>
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <span className="text-[9px] md:text-[10px] text-neutral-500 font-medium">
                              {new Date(chat.lastMessageAt).toLocaleDateString(
                                [],
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                            <button
                              onClick={(e) =>
                                handleDeleteConversation(e, chat.userId)
                              }
                              className="opacity-0 group-hover:opacity-100 p-1 md:p-1.5 hover:bg-red-500/20 rounded-lg text-neutral-500 hover:text-red-400 transition-all"
                              title="删除对话"
                            >
                              <Trash2 className="w-3 md:w-3.5 h-3 md:h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] md:text-sm text-neutral-600 truncate leading-relaxed">
                          {chat.lastMessage}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {chat.unreadCount > 0 && (
                          <div className="bg-red-500 text-neutral-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {chat.unreadCount}
                          </div>
                        )}
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-500 py-20">
                    <div className="w-20 h-20 rounded-full bg-black/5 flex items-center justify-center mb-6">
                      <MessageCircle className="w-10 h-10 opacity-20" />
                    </div>
                    <p className="font-bold uppercase tracking-widest text-neutral-800">
                      暂无信号流入
                    </p>
                    <p className="text-[10px] mt-2 opacity-60 font-black uppercase tracking-widest text-center px-8">
                      与社区同步以初始化连接
                    </p>
                  </div>
                )}
              </div>
            ))}

          {activeTab === "system" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in duration-300">
              <div className="p-5 rounded-md bg-black/5 border border-black/10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                  <Bell className="w-12 h-12 text-neutral-900" />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md bg-black/10 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-neutral-900" />
                  </div>
                  <h4 className="text-neutral-900 font-bold text-sm uppercase tracking-widest">
                    系统连接已建立
                  </h4>
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed font-black uppercase tracking-tight">
                  欢迎来到 jepow AI 创作者社区！在这里开启您的创意合成。
                </p>
                <span className="text-[10px] text-neutral-500 mt-4 block font-black uppercase tracking-widest">
                  刚才
                </span>
              </div>

              {notifications.map((notification) => {
                const targetPostId =
                  notification.postId || notification.relatedId;
                return (
                  <div
                    key={notification.id}
                    onClick={async () => {
                      if (!notification.read) {
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notification.id ? { ...n, read: true } : n,
                          ),
                        );
                        try {
                          await api.post(
                            `/user/notifications/${notification.id}/read`,
                          );
                          window.dispatchEvent(
                            new CustomEvent("unread_decreased"),
                          );
                        } catch (e) {}
                      }
                      if (targetPostId) onOpenPost?.(targetPostId);
                    }}
                    className={`p-5 rounded-md border transition-all ${targetPostId ? "cursor-pointer hover:bg-black/5 active:scale-[0.98]" : "cursor-pointer"} ${notification.read ? "bg-black/[0.02] border-black/5" : "bg-black/5 border-black/20"}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {notification.sender ? (
                        <div
                          className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-black/10 cursor-pointer hover:border-black/40 transition-all active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile?.(notification.sender.id);
                          }}
                        >
                          <img
                            src={
                              notification.sender.avatar ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.sender.id}`
                            }
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-neutral-100 flex items-center justify-center">
                          <Megaphone className="w-5 h-5 text-neutral-600" />
                        </div>
                      )}
                      <div>
                        <h4
                          className={`text-neutral-900 font-bold text-sm ${notification.sender ? "cursor-pointer hover:text-neutral-600 transition-colors" : ""}`}
                          onClick={(e) => {
                            if (notification.sender) {
                              e.stopPropagation();
                              onOpenProfile?.(notification.sender.id);
                            }
                          }}
                        >
                          {notification.sender
                            ? notification.sender.username
                            : "系统信号"}
                        </h4>
                        {!notification.sender && (
                          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1 block">
                            官方法令
                          </span>
                        )}
                      </div>
                      {!notification.read && (
                        <span className="w-2 h-2 rounded-full bg-white ml-auto shadow-[0_0_8px_rgba(255,255,255,0.5)]"></span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      {notification.content}
                    </p>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {new Date(notification.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {targetPostId && (
                        <span className="text-[10px] text-neutral-900 font-bold flex items-center gap-1 uppercase tracking-[0.3em]">
                          查看详情
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                  <Bell className="w-12 h-12 opacity-10 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">
                    暂无系统消息
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "official" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-in fade-in duration-300">
              {news.length > 0 ? (
                news.map((item) => (
                  <div
                    key={item.id}
                    className="p-6 rounded-md bg-black/[0.02] border border-black/5 relative overflow-hidden group hover:border-black/10 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-md bg-black/5 flex items-center justify-center border border-black/10">
                        <Megaphone className="w-5 h-5 text-neutral-900" />
                      </div>
                      <div>
                        <h4 className="text-neutral-900 font-bold text-sm uppercase tracking-tighter">
                          {item.tag}
                        </h4>
                        <div className="text-[10px] text-neutral-500 font-medium uppercase tracking-widest">
                          {item.date}
                        </div>
                      </div>
                      {item.type === "hot" && (
                        <span className="ml-auto px-2 py-0.5 bg-white text-black text-[10px] font-black rounded uppercase tracking-widest">
                          热门
                        </span>
                      )}
                    </div>
                    <h5 className="text-neutral-900 font-bold mb-2 group-hover:text-neutral-600 transition-colors">
                      {item.title}
                    </h5>
                    <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                    <div className="mt-6 flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 font-medium">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedNews(item);
                          setIsNewsModalOpen(true);
                        }}
                        className="px-4 py-1.5 rounded-md bg-black/10 text-neutral-900 text-[10px] font-black hover:bg-white/60 transition-colors uppercase tracking-widest"
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                  <Megaphone className="w-12 h-12 opacity-10 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em]">
                    暂无官方动态
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* News Detail Modal */}
      <AnimatePresence>
        {isNewsModalOpen && selectedNews && (
          <div className="fixed inset-0 bg-white/90 z-[100002] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-black/10 rounded-md w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="relative h-64 shrink-0">
                <img
                  src={
                    selectedNews.image ||
                    `https://picsum.photos/seed/news-${selectedNews.id}/800/450`
                  }
                  className="w-full h-full object-cover"
                  alt=""
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] to-transparent" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsNewsModalOpen(false)}
                  className="absolute top-6 right-6 bg-white/60 hover:bg-black/5 text-neutral-900 rounded-full "
                >
                  <X className="w-6 h-6" />
                </Button>
                <div className="absolute bottom-6 left-8 right-8">
                  <div className="flex gap-2 mb-3">
                    <span className="px-3 py-1 bg-white text-black text-[10px] font-black rounded-full uppercase tracking-widest">
                      {selectedNews.tag}
                    </span>
                    {selectedNews.type === "hot" && (
                      <span className="px-3 py-1 bg-red-600 text-neutral-900 text-[10px] font-bold rounded-full">
                        热门
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-neutral-900 leading-tight">
                    {selectedNews.title}
                  </h2>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="flex items-center justify-between text-xs text-neutral-500 border-b border-black/5 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-neutral-900 font-bold text-xs">
                      J
                    </div>
                    <span className="text-neutral-700 uppercase tracking-widest font-black text-[10px]">
                      官方发布
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px] font-black">
                      {selectedNews.date}
                    </span>
                  </div>
                </div>
                <div className="space-y-6">
                  <p className="text-lg text-neutral-700 leading-relaxed font-medium">
                    {selectedNews.description}
                  </p>
                  <div className="text-neutral-600 leading-relaxed whitespace-pre-wrap text-sm">
                    {selectedNews.content}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
