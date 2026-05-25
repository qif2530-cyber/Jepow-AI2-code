import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Loader2,
  ShieldCheck,
  X,
  History,
  Users,
  BarChart3,
  Sparkles,
  Search,
  Key,
  Globe,
  Megaphone,
  Layout,
  Settings,
  Zap,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  Database,
  Lock as LockIcon,
  Newspaper,
  Edit2,
  Eye,
  User,
  Clock,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { UserData } from "../types";
import { UserActionModal } from "./UserActionModal";
import { motion } from "motion/react";
import { socket } from "../lib/socket";
import { checkIsVideoUrl } from "../lib/video";

function AntiAutofillPasswordInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const [isFocused, setIsFocused] = useState(false);
  const randomName = React.useMemo(
    () => `pwd_${Math.random().toString(36).substring(2, 10)}`,
    [],
  );
  return (
    <Input
      {...props}
      type="password"
      name={randomName}
      autoComplete="new-password"
      readOnly={!isFocused}
      onFocus={(e) => {
        setIsFocused(true);
        if (props.onFocus) props.onFocus(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        if (props.onBlur) props.onBlur(e);
      }}
    />
  );
}

interface AdminPanelProps {
  onClose: () => void;
  currentUser: UserData;
  onConfigUpdate?: () => void;
}

export function AdminPanel({
  onClose,
  currentUser,
  onConfigUpdate,
}: AdminPanelProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | "analytics"
    | "users"
    | "projects"
    | "config"
    | "content"
    | "site"
    | "broadcast"
    | "news"
    | "virtual"
    | "activities"
  >("analytics");
  const [isVirtualUploading, setIsVirtualUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [editingActivity, setEditingActivity] = useState<any>({
    title: "",
    deadline: "",
    content: "",
    type: "image",
  });
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [editingNews, setEditingNews] = useState<any>(null);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [selectedActivityForReview, setSelectedActivityForReview] =
    useState<any>(null);
  const [broadcastContent, setBroadcastContent] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [previewingMedia, setPreviewingMedia] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 30>(7);

  const hasPermission = (permission: string) => {
    if (currentUser.role === "super_admin" || currentUser.role === "admin")
      return true;
    return currentUser.permissions?.includes(permission);
  };

  const hasAnyPermission =
    ["super_admin", "admin"].includes(currentUser.role) ||
    (currentUser.permissions && currentUser.permissions.length > 0);

  const chartData = React.useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = timeRange - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const shortDate = `${d.getMonth() + 1}/${d.getDate()}`;

      const visits = analytics?.dailyVisits?.[dateStr] || 0;
      const aiCallsForDay = analytics?.dailyAiCalls?.[dateStr] || {};
      const totalAiCallsDay = Object.values(aiCallsForDay).reduce(
        (a: any, b: any) => a + Number(b),
        0,
      );

      data.push({
        date: shortDate,
        visits,
        aiCalls: totalAiCallsDay,
      });
    }
    return data;
  }, [timeRange, analytics]);

  const modelBarData = React.useMemo(() => {
    return Object.entries(analytics?.totalAiCallsByModel || {})
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);
  }, [analytics]);

  // Set initial tab based on permissions
  useEffect(() => {
    if (!hasPermission("manage_users")) {
      if (hasPermission("manage_content")) setActiveTab("content");
      else if (hasPermission("manage_config")) setActiveTab("config");
      else if (hasPermission("manage_site")) setActiveTab("site");
      else if (hasPermission("broadcast")) setActiveTab("broadcast");
      else if (hasPermission("manage_news")) setActiveTab("news");
    }
  }, []);

  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const requests: Promise<any>[] = [];
      const keys: string[] = [];

      if (hasPermission("manage_users")) {
        requests.push(api.get("/admin/users"));
        keys.push("users");
      }

      // Stats is generally for all admins
      requests.push(api.get("/admin/stats"));
      keys.push("stats");

      if (hasPermission("manage_config")) {
        requests.push(api.get("/admin/config"));
        keys.push("config");
      }

      if (hasPermission("manage_content")) {
        requests.push(api.get("/admin/posts"));
        keys.push("posts");
        requests.push(api.get("/admin/projects"));
        keys.push("projects");
        requests.push(api.get("/admin/activities"));
        keys.push("activities");
      }

      if (hasPermission("manage_site")) {
        requests.push(api.get("/admin/site-config"));
        keys.push("site");
        requests.push(api.get("/admin/analytics"));
        keys.push("analytics");
      }

      if (hasPermission("broadcast")) {
        requests.push(api.get("/admin/broadcast/history"));
        keys.push("broadcast");
      }

      if (hasPermission("manage_site")) {
        requests.push(api.get("/admin/news"));
        keys.push("news");
      }

      if (hasPermission("manage_site")) {
        requests.push(api.get("/admin/invitations"));
        keys.push("invitations");
      }

      const results = await Promise.allSettled(requests);

      results.forEach((result, index) => {
        const key = keys[index];
        if (result.status === "fulfilled") {
          const data = result.value.data;
          if (key === "users") setUsers(data);
          if (key === "analytics") setAnalytics(data);
          if (key === "stats") setStats(data);
          if (key === "config") setConfig(data);
          if (key === "posts") setPosts(data);
          if (key === "projects") setProjects(data);
          if (key === "activities") setActivities(data || []);
          if (key === "site") setSiteConfig(data);
          if (key === "broadcast") setBroadcastHistory(data || []);
          if (key === "news") setNews(data || []);
          if (key === "invitations") setInvitations(data || []);
        } else {
          console.error(`Failed to fetch ${key}:`, result.reason);
          // Only toast if it's not a 403 (which we should have caught with hasPermission anyway)
          if (result.reason.response?.status !== 403) {
            toast.error(`矩阵同步失败: ${key}`);
          }
        }
      });

      // Update selected user if open
      if (selectedUser) {
        const usersResult = results.find((r, i) => keys[i] === "users");
        if (usersResult?.status === "fulfilled") {
          const updatedUser = usersResult.value.data.find(
            (u: UserData) => u.id === selectedUser.id,
          );
          if (updatedUser) setSelectedUser(updatedUser);
        }
      }
    } catch (err: any) {
      toast.error(`矩阵数据加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (newConfig: any) => {
    try {
      await api.post("/admin/config", newConfig);
      setConfig(newConfig);
      toast.success("系统协议已持久化");
    } catch (err: any) {
      console.error("Save config failed:", err);
    }
  };

  useEffect(() => {
    fetchData();

    if (socket) {
      const handleProjectsUpdated = () => {
        if (hasPermission("manage_users") || hasPermission("manage_site")) {
          fetchData();
        }
      };
      socket.on("projects_updated", handleProjectsUpdated);
      socket.on("user_profile_updated", fetchData); // to keep user counts synced

      return () => {
        socket.off("projects_updated", handleProjectsUpdated);
        socket.off("user_profile_updated", fetchData);
      };
    }
  }, []);

  const filteredUsers = (users || []).filter(
    (u) =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.includes(searchTerm),
  );

  return (
    <div className="fixed inset-0 z-[40000] flex bg-neutral-100 animate-in fade-in duration-300">
      <div
        className="w-full h-full flex flex-row relative bg-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar */}
        <div className="w-56 md:w-64 bg-neutral-950 relative z-20 flex flex-col shrink-0 text-white overflow-hidden shadow-[4px_0_24px_rgba(0,0,0,0.1)]">
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-20%] w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/30 via-neutral-950/80 to-neutral-950 opacity-60" />
            <div className="absolute bottom-[-10%] right-[-20%] w-[100%] h-[100%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent opacity-40 mix-blend-screen" />
          </div>

          <div className="px-6 h-[80px] flex items-center gap-3 border-b border-white/10 shrink-0 relative z-10 mt-2">
            <ShieldCheck className="w-6 h-6 text-white shrink-0" />
            <h2 className="text-xl font-black text-white tracking-widest truncate drop-shadow-md">
              核心管理系统
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2 custom-scrollbar relative z-10">
            {[
              {
                id: "analytics",
                label: "数据大盘",
                icon: BarChart3,
                permission: "manage_site",
              },
              {
                id: "users",
                label: "节点管理",
                icon: Users,
                permission: "manage_users",
              },
              {
                id: "projects",
                label: "工程管理",
                icon: Database,
                permission: "manage_content",
              },
              {
                id: "content",
                label: "作品列表",
                icon: ImageIcon,
                permission: "manage_content",
              },
              {
                id: "activities",
                label: "专栏活动",
                icon: Calendar,
                permission: "manage_content",
              },
              {
                id: "virtual",
                label: "虚拟注入",
                icon: Upload,
                permission: "manage_content",
              },
              {
                id: "news",
                label: "系统通知",
                icon: Newspaper,
                permission: "manage_site",
              },
              {
                id: "site",
                label: "站点合成",
                icon: Layout,
                permission: "manage_site",
              },
              {
                id: "broadcast",
                label: "信号广播",
                icon: Megaphone,
                permission: "broadcast",
              },
              {
                id: "config",
                label: "管理协议",
                icon: Settings,
                permission: "manage_config",
              },
            ].map(
              (tab) =>
                hasPermission(tab.permission) && (
                  <button
                    key={tab.id}
                    className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm transition-all duration-200 relative group overflow-hidden ${activeTab === tab.id ? "text-black font-bold shadow-lg" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      if (tab.id !== "content")
                        setSelectedActivityForReview(null);
                    }}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="admin-tab"
                        className="absolute inset-0 bg-white border border-transparent z-0"
                      />
                    )}
                    <tab.icon
                      className={`w-5 h-5 relative z-10 ${activeTab === tab.id ? "text-black" : ""}`}
                    />
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                ),
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative z-10 bg-white">
          {/* Header */}
          <div className="px-8 h-[80px] border-b border-black/5 flex items-center justify-end bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 text-neutral-600 hover:text-neutral-900 transition-colors text-sm font-bold rounded-xl border border-black/10 hover:border-black/20 hover:bg-neutral-100 flex items-center gap-2 bg-white shadow-sm active:scale-95"
              >
                <History
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
                同步数据
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200 rounded-lg transition-colors group border border-black/10 bg-neutral-100"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              </button>
            </div>
          </div>

          {!hasAnyPermission ? (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 space-y-4">
              <LockIcon className="w-16 h-16 opacity-5" />
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-neutral-900 tracking-[0.5em] uppercase">
                  拒绝访问
                </h3>
                <p className="text-[10px] font-bold text-neutral-800 uppercase tracking-widest">
                  此终端需要管理权限。
                </p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === "analytics" && hasPermission("manage_site") && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white relative z-10 px-10 py-8">
                  <div className="flex-1 overflow-y-auto w-full custom-scrollbar pr-4">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest uppercase">
                        系统数据大盘
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setTimeRange(7)}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${timeRange === 7 ? "bg-white text-black" : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 border border-black/10"}`}
                        >
                          7天
                        </button>
                        <button
                          onClick={() => setTimeRange(30)}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${timeRange === 30 ? "bg-white text-black" : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 border border-black/10"}`}
                        >
                          30天
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6 relative overflow-hidden group">
                        <p className="text-xs text-neutral-600 font-bold mb-2 uppercase tracking-widest">
                          总注册用户
                        </p>
                        <p className="text-4xl font-black text-neutral-900">
                          {analytics?.totalUsers || 0}
                        </p>
                        <p className="text-xs text-emerald-400 mt-2 font-bold tracking-wider">
                          今日新增: +{analytics?.dailyRegistrations || 0}
                        </p>
                      </div>

                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6 relative overflow-hidden group">
                        <p className="text-xs text-neutral-600 font-bold mb-2 uppercase tracking-widest">
                          网址访问总人次
                        </p>
                        <p className="text-4xl font-black text-neutral-900">
                          {analytics?.totalVisits || 0}
                        </p>
                        <p className="text-xs text-blue-400 mt-2 font-bold tracking-wider">
                          今日活跃: +
                          {analytics?.dailyVisits?.[
                            new Date().toISOString().split("T")[0]
                          ] || 0}
                        </p>
                      </div>

                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6 relative overflow-hidden group">
                        <p className="text-xs text-neutral-600 font-bold mb-2 uppercase tracking-widest">
                          当前实时在线
                        </p>
                        <p className="text-4xl font-black text-emerald-400 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                          {analytics?.currentOnline || 0}
                        </p>
                        <p className="text-xs text-neutral-500 mt-2 tracking-wider">
                          Socket 活跃并发
                        </p>
                      </div>

                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6 relative overflow-hidden group">
                        <p className="text-xs text-neutral-600 font-bold mb-2 uppercase tracking-widest">
                          大模型总调动次数
                        </p>
                        <p className="text-4xl font-black text-amber-500">
                          {analytics?.totalAiCalls || 0}
                        </p>
                        <p className="text-xs text-amber-500 mt-2 font-bold tracking-wider">
                          今日调动: +
                          {Object.values(
                            (analytics?.dailyAiCalls?.[
                              new Date().toISOString().split("T")[0]
                            ] as Record<string, number>) || {},
                          ).reduce((a, b) => a + Number(b), 0)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6">
                        <h4 className="text-sm font-bold text-neutral-800 tracking-widest uppercase mb-6">
                          近 {timeRange} 天访问 & API调动趋势
                        </h4>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#333"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                              />
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: "#1A1A1A",
                                  borderColor: "#333",
                                  borderRadius: "8px",
                                  color: "#fff",
                                }}
                                itemStyle={{ color: "#fff" }}
                              />
                              <Line
                                type="monotone"
                                dataKey="visits"
                                name="访问人次"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
                                activeDot={{ r: 6 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="aiCalls"
                                name="调动次数"
                                stroke="#f59e0b"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="bg-neutral-100 border border-black/10 rounded-md p-6">
                        <h4 className="text-sm font-bold text-neutral-800 tracking-widest uppercase mb-6">
                          模型调用排名 (Top 10)
                        </h4>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={modelBarData}
                              layout="vertical"
                              margin={{ left: 20 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#333"
                                horizontal={false}
                              />
                              <XAxis
                                type="number"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                width={100}
                              />
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: "#1A1A1A",
                                  borderColor: "#333",
                                  borderRadius: "8px",
                                  color: "#fff",
                                }}
                                cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                              />
                              <Bar
                                dataKey="value"
                                name="调动次数"
                                fill="#10b981"
                                radius={[0, 4, 4, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-neutral-900 tracking-widest uppercase mb-4 mt-6">
                      单个模型调动明细
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                      {Object.entries(analytics?.totalAiCallsByModel || {})
                        .sort((a: any, b: any) => b[1] - a[1])
                        .map(([model, count]: any) => (
                          <div
                            key={model}
                            className="bg-neutral-100 border border-black/10 rounded-md p-5 flex justify-between items-center transition-colors hover:border-black/20"
                          >
                            <div className="flex flex-col">
                              <span className="text-neutral-800 font-bold tracking-wider mb-1">
                                {model}
                              </span>
                              <span className="text-neutral-500 text-xs font-mono">
                                今日:{" "}
                                {analytics?.dailyAiCalls?.[
                                  new Date().toISOString().split("T")[0]
                                ]?.[model] || 0}{" "}
                                次
                              </span>
                            </div>
                            <span className="text-neutral-900 font-black text-xl">
                              {count}{" "}
                              <span className="text-xs text-neutral-500 font-normal">
                                次
                              </span>
                            </span>
                          </div>
                        ))}
                      {Object.keys(analytics?.totalAiCallsByModel || {})
                        .length === 0 && (
                        <div className="col-span-full py-12 text-center text-neutral-500 border border-black/5 rounded-md border-dashed">
                          暂无大模型调动记录
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "users" && hasPermission("manage_users") && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white relative z-10 px-10 py-8">
                  {/* Minimal Stats */}
                  {stats && (
                    <div className="flex gap-10 mb-8 border-b border-black/10 pb-8">
                      <div>
                        <p className="text-[10px] font-bold text-neutral-700 tracking-widest mb-1">
                          网络节点
                        </p>
                        <p className="text-3xl font-black text-neutral-900">
                          {(stats.totalUsers || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-neutral-700 tracking-widest mb-1">
                          数据协议
                        </p>
                        <p className="text-3xl font-black text-emerald-400">
                          {(stats.totalProjects || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-neutral-700 tracking-widest mb-1">
                          积分储备
                        </p>
                        <p className="text-3xl font-black text-amber-400">
                          {(stats.totalCredits || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-6">
                    <div className="relative w-80">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                      <Input
                        className="pl-12 bg-transparent border-black/10 text-neutral-900 rounded-lg h-10 text-[12px] font-bold focus:border-black/20 transition-all rounded-[12px]"
                        placeholder="搜索节点..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex-1 border border-black/10 rounded-md overflow-hidden bg-white flex flex-col">
                    <div className="flex-1 overflow-auto custom-scrollbar p-0">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-white/90 border-b border-black/10 z-10 shadow-lg">
                          <tr className="text-neutral-700 font-medium tracking-wide">
                            <th className="py-5 px-6 font-normal">ID / 节点</th>
                            <th className="py-5 px-6 font-normal">权限等级</th>
                            <th className="py-5 px-6 font-normal">账户状态</th>
                            <th className="py-5 px-6 font-normal text-right">
                              工程数量
                            </th>
                            <th className="py-5 px-6 font-normal text-right">
                              积分储备
                            </th>
                            <th className="py-5 px-6 font-normal">加入时间</th>
                            <th className="py-5 px-6 font-normal text-right">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-neutral-800">
                          {loading ? (
                            <tr>
                              <td colSpan={7} className="py-16 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-neutral-600 inline-block" />
                              </td>
                            </tr>
                          ) : filteredUsers.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="py-16 text-center text-neutral-600"
                              >
                                未找到节点。
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((u) => (
                              <tr
                                key={u.id}
                                className="hover:bg-neutral-200 transition-colors group"
                              >
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-md border border-black/10 bg-white flex items-center justify-center font-bold text-neutral-900 overflow-hidden shadow-sm shrink-0">
                                      {u.avatar ? (
                                        <img
                                          src={u.avatar}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        u.username?.[0]
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-neutral-900 font-medium text-sm md:text-base">
                                        {u.username}
                                      </span>
                                      <span className="text-neutral-600 font-mono text-[10px] md:text-xs truncate max-w-[120px]">
                                        {u.id}
                                      </span>
                                      {u.phone && (
                                        <span className="text-blue-400 font-mono text-[10px] md:text-xs tracking-wider">
                                          {u.phone}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <span
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-widest uppercase border ${u.role === "super_admin" ? "bg-white text-neutral-900 border-neutral-900 shadow-[0_0_15px_rgba(0,0,0,0.1)]" : u.role === "admin" ? "text-amber-400 bg-amber-400/20 border-amber-400/20" : "text-neutral-700 border-black/10 bg-white"}`}
                                  >
                                    {u.role === "super_admin"
                                      ? "超级管理员"
                                      : u.role === "admin"
                                        ? "管理员"
                                        : "普通用户"}
                                  </span>
                                </td>
                                <td className="py-4 px-6">
                                  <span
                                    className={`flex items-center gap-2 font-medium text-xs tracking-wider ${u.status === "banned" ? "text-red-400" : "text-emerald-400"}`}
                                  >
                                    <div
                                      className={`w-2 h-2 rounded-full ${u.status === "banned" ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"}`}
                                    />
                                    {u.status === "banned" ? "封禁" : "正常"}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right tabular-nums font-mono text-neutral-800">
                                  {u.projectsCount || 0}
                                </td>
                                <td className="py-4 px-6 text-right tabular-nums font-mono font-medium text-amber-400">
                                  {u.credits || 0}
                                </td>
                                <td className="py-4 px-6 text-neutral-600 text-xs font-mono">
                                  {new Date(
                                    u.createdAt || Date.now(),
                                  ).toLocaleDateString("zh-CN")}
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs px-4 rounded-lg font-medium border-black/10 bg-transparent hover:bg-neutral-200 hover:text-neutral-900 transition-all"
                                    onClick={() => setSelectedUser(u)}
                                  >
                                    编辑详情
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "projects" && hasPermission("manage_content") && (
                <div className="flex-1 overflow-hidden flex flex-col px-10 py-8 bg-white relative z-10">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest">
                        工程溯源
                      </h3>
                      <p className="text-neutral-600 text-sm leading-relaxed">
                        系统所有工程
                      </p>
                    </div>
                    <div>{/* Optional actions */}</div>
                  </div>

                  <div className="flex-1 overflow-y-auto rounded-md border border-black/10 bg-white relative flex flex-col shadow-2xl relative shadow-neutral-200/50">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white/90 border-b border-black/10 z-10 shadow-lg">
                        <tr className="text-neutral-700 font-medium tracking-wide">
                          <th className="py-5 px-6 font-normal">ID</th>
                          <th className="py-5 px-6 font-normal">名称</th>
                          <th className="py-5 px-6 font-normal">节点数</th>
                          <th className="py-5 px-6 font-normal">
                            归属节点 (用户)
                          </th>
                          <th className="py-5 px-6 font-normal text-right">
                            时间戳
                          </th>
                          <th className="py-5 px-6 font-normal text-right">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-sm md:text-base">
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="py-16 text-center">
                              <Loader2 className="w-6 h-6 animate-spin text-neutral-600 inline-block" />
                            </td>
                          </tr>
                        ) : projects.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="py-16 text-center text-neutral-600"
                            >
                              空数据协议。
                            </td>
                          </tr>
                        ) : (
                          projects.map((p) => (
                            <tr
                              key={p.id}
                              className="hover:bg-neutral-200 transition-colors group"
                            >
                              <td className="py-4 px-6 text-neutral-600 font-mono text-[10px] truncate max-w-[120px]">
                                {p.id}
                              </td>
                              <td className="py-4 px-6 text-neutral-900 font-medium">
                                {p.name || "未命名"}
                              </td>
                              <td className="py-4 px-6 text-neutral-700 font-mono">
                                {p.nodeCount}
                              </td>
                              <td className="py-4 px-6">
                                <span className="text-neutral-800 font-medium">
                                  {p.username}
                                </span>
                                <br />
                                <span className="text-neutral-700 font-mono text-[10px]">
                                  {p.userId}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-right font-mono text-neutral-600 text-xs">
                                更新: {new Date(p.updatedAt).toLocaleString()}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      if (
                                        window.confirm(
                                          "警告：强行抹除数据协议可能导致未知级联崩溃。无法恢复。是否继续？",
                                        )
                                      ) {
                                        try {
                                          await api.delete(
                                            `/admin/projects/${p.id}`,
                                          );
                                          toast.success("协议抹除成功");
                                          setProjects(
                                            projects.filter(
                                              (proj) => proj.id !== p.id,
                                            ),
                                          );
                                          // Update stats immediately visually
                                          if (stats?.totalProjects) {
                                            setStats({
                                              ...stats,
                                              totalProjects:
                                                stats.totalProjects - 1,
                                            });
                                          }
                                        } catch (error: any) {
                                          toast.error(
                                            `抹除失败: ${error.message}`,
                                          );
                                        }
                                      }
                                    }}
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "content" && hasPermission("manage_content") && (
                <div className="flex-1 overflow-hidden flex flex-col px-10 py-8 bg-white relative z-10">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        {selectedActivityForReview && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedActivityForReview(null);
                              setActiveTab("activities");
                            }}
                            className="h-8 px-2 text-neutral-600 hover:text-neutral-900"
                          >
                            &larr; 返回
                          </Button>
                        )}
                        <h3 className="text-xl font-bold text-neutral-900 tracking-widest">
                          {selectedActivityForReview
                            ? `活动审核：${selectedActivityForReview.title}`
                            : "作品库审核"}
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 border border-black/10 rounded-md overflow-hidden bg-white flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-white/90 border-b border-black/10 z-10 shadow-lg">
                          <tr className="text-neutral-700 font-medium tracking-wide">
                            <th className="py-5 px-6 font-normal">
                              媒体 / 标题
                            </th>
                            <th className="py-5 px-6 font-normal">作者</th>
                            <th className="py-5 px-6 font-normal">审核状态</th>
                            <th className="py-5 px-6 font-normal">系统评级</th>
                            <th className="py-5 px-6 font-normal">发布日期</th>
                            <th className="py-5 px-6 font-normal text-right">
                              管理操作
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-neutral-800">
                          {posts.filter((p) =>
                            selectedActivityForReview
                              ? p.activityId === selectedActivityForReview.id
                              : !p.activityId,
                          ).length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-16 text-center text-neutral-600"
                              >
                                未找到作品。
                              </td>
                            </tr>
                          )}
                          {posts
                            .filter((p) =>
                              selectedActivityForReview
                                ? p.activityId === selectedActivityForReview.id
                                : !p.activityId,
                            )
                            .map((p) => (
                              <tr
                                key={p.id}
                                className="hover:bg-neutral-200 transition-colors group/row"
                              >
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-4">
                                    <div
                                      className="w-20 aspect-video bg-white rounded-lg overflow-hidden border border-black/10 shadow-sm cursor-pointer relative shrink-0 hover:border-black/20 transition-colors"
                                      onClick={() =>
                                        setPreviewingMedia(p.mediaUrl)
                                      }
                                    >
                                      {checkIsVideoUrl(p.mediaUrl) ? (
                                        <video
                                          src={p.mediaUrl}
                                          className="w-full h-full object-cover opacity-80"
                                          muted
                                          playsInline
                                        />
                                      ) : (
                                        <img
                                          src={p.mediaUrl}
                                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                                          referrerPolicy="no-referrer"
                                        />
                                      )}
                                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 opacity-0 hover:opacity-100 transition-opacity">
                                        <Eye className="w-5 h-5 text-neutral-900" />
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-neutral-900 font-medium text-sm md:text-base truncate max-w-[200px]">
                                        {p.title || "无标题"}
                                      </span>
                                      <span className="text-neutral-600 font-mono text-[10px] md:text-xs truncate max-w-[150px]">
                                        {p.id}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-neutral-900 font-medium">
                                      {p.author?.username || "系统"}
                                    </span>
                                    <span className="text-neutral-600 font-mono text-xs hidden md:block">
                                      {p.authorId}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <span
                                    className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-widest border ${
                                      p.status === "approved"
                                        ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                                        : p.status === "rejected"
                                          ? "text-red-400 bg-red-400/20 border-red-400/20"
                                          : "text-amber-400 bg-amber-400/20 border-amber-400/20 animate-pulse"
                                    }`}
                                  >
                                    {p.status === "approved"
                                      ? "已通过"
                                      : p.status === "rejected"
                                        ? "已驳回"
                                        : "审核中"}
                                  </span>
                                </td>
                                <td className="py-4 px-6">
                                  <span className="text-neutral-900 font-bold bg-neutral-100 px-3 py-1.5 rounded-lg text-sm border border-black/10">
                                    {p.grade === "none"
                                      ? "无"
                                      : p.grade || "无"}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-neutral-600 text-xs font-mono">
                                  {new Date(p.createdAt).toLocaleDateString(
                                    "zh-CN",
                                  )}
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <div className="flex bg-white/80 border border-black/10 rounded-lg p-1 ">
                                      {[
                                        { value: "none", label: "无" },
                                        { value: "第一名", label: "第一名" },
                                        { value: "第二名", label: "第二名" },
                                        { value: "第三名", label: "第三名" },
                                        { value: "入围奖", label: "入围奖" },
                                      ].map((g) => (
                                        <button
                                          key={g.value}
                                          onClick={async () => {
                                            try {
                                              await api.post(
                                                `/admin/posts/${p.id}/review`,
                                                {
                                                  status: "approved",
                                                  grade: g.value,
                                                },
                                              );
                                              fetchData();
                                            } catch (err) {}
                                          }}
                                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${p.grade === g.value || (g.value === "none" && !p.grade) ? "bg-white text-neutral-900 shadow-md" : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"}`}
                                        >
                                          {g.label}
                                        </button>
                                      ))}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 text-red-500 hover:text-red-400"
                                      onClick={async () => {
                                        if (!confirm("确定删除?")) return;
                                        try {
                                          await api.post(
                                            `/admin/posts/${p.id}/review`,
                                            { status: "rejected" },
                                          );
                                          fetchData();
                                        } catch (err) {}
                                      }}
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "virtual" && hasPermission("manage_content") && (
                <div className="flex-1 overflow-auto flex flex-col px-10 py-8 bg-white relative z-10 custom-scrollbar">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10 shrink-0">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest">
                        虚拟内容批量注入
                      </h3>
                      <p className="text-sm text-neutral-500">
                        上传视频或图片，系统会自动分配随机虚拟账号和曝光数据
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 max-w-3xl flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl bg-neutral-50 p-12 text-center transition-all hover:bg-neutral-100 hover:border-black/20 group cursor-pointer relative overflow-hidden">
                    <Upload className="w-12 h-12 text-neutral-400 group-hover:text-black transition-colors mb-6 group-hover:-translate-y-1 duration-300" />
                    <h4 className="text-lg font-bold text-neutral-900 mb-2">
                      点击或拖拽上传多个作品
                    </h4>
                    <p className="text-sm text-neutral-500 mb-8 max-w-sm">
                      支持 .mp4, .mov, .jpg, .png
                      等。单次建议上传不超过200个文件。
                    </p>

                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      disabled={isVirtualUploading}
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        setIsVirtualUploading(true);
                        toast.loading(
                          `正在批量处理 ${files.length} 个文件...`,
                          { id: "virtual-upload" },
                        );
                        try {
                          const formData = new FormData();
                          Array.from(files).forEach((f) =>
                            formData.append("files", f),
                          );

                          const res = await api.post(
                            "/admin/virtual-upload",
                            formData,
                            {
                              headers: {
                                "Content-Type": "multipart/form-data",
                              },
                            },
                          );

                          if (res.data.success) {
                            toast.success(
                              `${res.data.count} 个作品注入成功！已分发到社区。`,
                              { id: "virtual-upload" },
                            );
                          } else {
                            throw new Error(res.data.error || "上传失败");
                          }

                          if (e.target) e.target.value = "";
                        } catch (err: any) {
                          toast.error(
                            "批量注入失败: " +
                              (err.response?.data?.error || err.message),
                            { id: "virtual-upload" },
                          );
                        } finally {
                          setIsVirtualUploading(false);
                          fetchData();
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />

                    {isVirtualUploading && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-bold text-sm text-black">
                          全功率上传中 ...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "site" && hasPermission("manage_site") && (
                <div className="flex-1 overflow-hidden flex flex-col bg-white relative z-10 px-10 py-8">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest">
                        站点配置
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      className="border-black/10 bg-white hover:bg-neutral-200 text-neutral-900 font-bold"
                      onClick={async () => {
                        try {
                          await api.post("/admin/site-config", siteConfig);
                          toast.success("同步完成");
                          if (onConfigUpdate) onConfigUpdate();
                        } catch (err) {
                          toast.error("同步失败");
                        }
                      }}
                    >
                      应用配置
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row gap-10">
                    <div className="flex-1 space-y-10 max-w-full">
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-bold text-neutral-600 tracking-widest border-b border-black/10 pb-2">
                          核心元数据
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              站点名称
                            </Label>
                            <Input
                              value={siteConfig?.name || ""}
                              onChange={(e) =>
                                setSiteConfig({
                                  ...siteConfig,
                                  name: e.target.value,
                                })
                              }
                              className="bg-white border-black/10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              版权信息
                            </Label>
                            <Input
                              value={siteConfig?.footer || ""}
                              onChange={(e) =>
                                setSiteConfig({
                                  ...siteConfig,
                                  footer: e.target.value,
                                })
                              }
                              className="bg-white border-black/10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              ICP 备案
                            </Label>
                            <Input
                              value={siteConfig?.icp || ""}
                              onChange={(e) =>
                                setSiteConfig({
                                  ...siteConfig,
                                  icp: e.target.value,
                                })
                              }
                              className="bg-white border-black/10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              Logo 链接
                            </Label>
                            <div className="flex gap-2 items-center">
                              <Input
                                value={siteConfig?.logo || ""}
                                onChange={(e) =>
                                  setSiteConfig({
                                    ...siteConfig,
                                    logo: e.target.value,
                                  })
                                }
                                className="bg-white border-black/10 font-mono text-[10px] flex-1"
                              />
                              <div className="relative">
                                <input
                                  type="file"
                                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                      // @ts-ignore
                                      const res = await api.post(
                                        "/upload",
                                        formData,
                                        {
                                          headers: {
                                            "Content-Type":
                                              "multipart/form-data",
                                          },
                                        },
                                      );
                                      setSiteConfig({
                                        ...siteConfig,
                                        logo: res.data.url,
                                      });
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  className="h-8 border-black/10 bg-white hover:bg-neutral-100"
                                >
                                  上传
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              Favicon 链接
                            </Label>
                            <div className="flex gap-2 items-center">
                              <Input
                                value={siteConfig?.favicon || ""}
                                onChange={(e) =>
                                  setSiteConfig({
                                    ...siteConfig,
                                    favicon: e.target.value,
                                  })
                                }
                                className="bg-white border-black/10 font-mono text-[10px] flex-1"
                              />
                              <div className="relative">
                                <input
                                  type="file"
                                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                      // @ts-ignore
                                      const res = await api.post(
                                        "/upload",
                                        formData,
                                        {
                                          headers: {
                                            "Content-Type":
                                              "multipart/form-data",
                                          },
                                        },
                                      );
                                      setSiteConfig({
                                        ...siteConfig,
                                        favicon: res.data.url,
                                      });
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  className="h-8 border-black/10 bg-white hover:bg-neutral-100"
                                >
                                  上传
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2 pt-4">
                          <Label className="text-[10px] text-neutral-700">
                            全局公告
                          </Label>
                          <textarea
                            value={siteConfig?.announcement || ""}
                            onChange={(e) =>
                              setSiteConfig({
                                ...siteConfig,
                                announcement: e.target.value,
                              })
                            }
                            className="w-full bg-white border border-black/10 rounded-md p-4 text-xs min-h-[100px] text-neutral-900 focus:border-black/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h4 className="text-[10px] font-bold text-neutral-600 tracking-widest border-b border-black/10 pb-2">
                          访问控制
                        </h4>
                        <div className="space-y-4 max-w-xl">
                          <div className="flex items-center justify-between bg-white p-4 rounded-lg">
                            <span className="text-sm font-medium text-neutral-900">
                              启用无限画布
                            </span>
                            <button
                              onClick={() =>
                                setSiteConfig({
                                  ...siteConfig,
                                  infiniteCanvasEnabled:
                                    !siteConfig?.infiniteCanvasEnabled,
                                })
                              }
                              className={`w-10 h-5 rounded-full transition-all flex items-center px-0.5 ${siteConfig?.infiniteCanvasEnabled !== false ? "bg-emerald-500" : "bg-neutral-100"}`}
                            >
                              <div
                                className={`w-4 h-4 bg-white rounded-full transition-all transform ${siteConfig?.infiniteCanvasEnabled !== false ? "translate-x-5" : "translate-x-0"}`}
                              />
                            </button>
                          </div>
                          {siteConfig?.infiniteCanvasEnabled === false && (
                            <div className="space-y-4 mt-2">
                              <div className="flex items-center justify-between bg-white p-4 rounded-lg">
                                <span className="text-sm font-medium text-neutral-900">
                                  需要邀请码
                                </span>
                                <button
                                  onClick={() =>
                                    setSiteConfig({
                                      ...siteConfig,
                                      isByInvitationOnly:
                                        !siteConfig?.isByInvitationOnly,
                                    })
                                  }
                                  className={`w-10 h-5 rounded-full transition-all flex items-center px-0.5 ${siteConfig?.isByInvitationOnly ? "bg-emerald-500" : "bg-neutral-100"}`}
                                >
                                  <div
                                    className={`w-4 h-4 bg-white rounded-full transition-all transform ${siteConfig?.isByInvitationOnly ? "translate-x-5" : "translate-x-0"}`}
                                  />
                                </button>
                              </div>
                              {siteConfig?.isByInvitationOnly ? (
                                <div className="space-y-4 pt-2">
                                  <Button
                                    size="sm"
                                    className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50"
                                    disabled={isGeneratingCodes}
                                    onClick={async () => {
                                      setIsGeneratingCodes(true);
                                      try {
                                        const res = await api.post(
                                          "/admin/invitations/generate",
                                          { count: 5 },
                                        );
                                        setInvitations((prev) => [
                                          ...res.data,
                                          ...prev,
                                        ]);
                                      } catch (err) {
                                      } finally {
                                        setIsGeneratingCodes(false);
                                      }
                                    }}
                                  >
                                    生成 5 个邀请码
                                  </Button>
                                  <div className="max-h-60 overflow-auto border border-black/10 rounded-lg custom-scrollbar">
                                    <table className="w-full text-left text-xs text-neutral-900">
                                      <thead className="sticky top-0 bg-white z-10 border-b border-black/10">
                                        <tr>
                                          <th className="p-3 font-medium text-neutral-700">
                                            邀请码
                                          </th>
                                          <th className="p-3 font-medium text-neutral-700 text-right">
                                            操作
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {invitations.map((inv) => (
                                          <tr
                                            key={inv.id}
                                            className="border-b border-black/10 hover:bg-neutral-200"
                                          >
                                            <td className="p-3 font-mono tracking-wider">
                                              {inv.code}
                                            </td>
                                            <td className="p-3 text-right">
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    await api.delete(
                                                      `/admin/invitations/${inv.id}`,
                                                    );
                                                    setInvitations((prev) =>
                                                      prev.filter(
                                                        (i) => i.id !== inv.id,
                                                      ),
                                                    );
                                                  } catch (err) {}
                                                }}
                                                className="text-red-400 hover:text-red-300 font-medium"
                                              >
                                                删除
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2 pt-2">
                                  <Label className="text-[10px] text-neutral-700">
                                    关闭提示信息
                                  </Label>
                                  <textarea
                                    value={
                                      siteConfig?.infiniteCanvasClosedMessage ||
                                      ""
                                    }
                                    onChange={(e) =>
                                      setSiteConfig({
                                        ...siteConfig,
                                        infiniteCanvasClosedMessage:
                                          e.target.value,
                                      })
                                    }
                                    className="w-full bg-white border border-black/10 rounded-md p-3 text-xs text-neutral-900"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "broadcast" && hasPermission("broadcast") && (
                <div className="flex-1 overflow-hidden flex flex-col bg-white relative z-10 px-10 py-8">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest uppercase">
                        系统广播
                      </h3>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar flex gap-10">
                    <div className="flex-1 flex flex-col space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] text-neutral-700">
                          消息内容
                        </Label>
                        <textarea
                          value={broadcastContent}
                          onChange={(e) => setBroadcastContent(e.target.value)}
                          placeholder="输入需要广播的消息内容..."
                          className="w-full bg-transparent border border-black/10 rounded-md p-4 text-xs min-h-[200px] text-neutral-900 focus:border-black/20 font-mono"
                        />
                        <div className="text-[10px] text-neutral-700 text-right">
                          {broadcastContent.length} 字符
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        disabled={isBroadcasting || !broadcastContent.trim()}
                        className="border-black/10 bg-white hover:bg-neutral-200 text-neutral-900 font-bold h-12"
                        onClick={async () => {
                          setIsBroadcasting(true);
                          try {
                            const res = await api.post("/admin/broadcast", {
                              content: broadcastContent,
                            });
                            toast.success(`已推送到 ${res.data.count} 个节点`);
                            setBroadcastContent("");
                            fetchData();
                          } catch (err) {
                            toast.error("广播发送失败");
                          } finally {
                            setIsBroadcasting(false);
                          }
                        }}
                      >
                        {isBroadcasting ? "广播中..." : "发送广播"}
                      </Button>
                    </div>

                    <div className="w-[400px] flex flex-col border-l border-black/10 pl-10 h-full">
                      <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest border-b border-black/10 pb-2 mb-4">
                        广播记录
                      </h4>
                      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                        {broadcastHistory.map((h, idx) => (
                          <div
                            key={idx}
                            className="space-y-2 border-b border-black/10 pb-4 last:border-0 hover:bg-white p-2 rounded transition-colors -mx-2"
                          >
                            <div className="flex justify-between items-center text-[9px] font-mono text-neutral-600">
                              <span>
                                {new Date(h.timestamp).toLocaleString("en-GB")}
                              </span>
                              <span className="text-emerald-400">
                                {h.recipientCount} 个节点
                              </span>
                            </div>
                            <p className="text-xs text-neutral-800 font-mono line-clamp-3">
                              {h.content}
                            </p>
                          </div>
                        ))}
                        {broadcastHistory.length === 0 && (
                          <div className="text-center py-10 text-[10px] text-neutral-700 font-mono">
                            暂无记录
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "config" && hasPermission("manage_config") && (
                <div className="flex-1 overflow-hidden flex flex-col bg-white relative z-10 px-10 py-8">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest uppercase">
                        管理协议
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      className="border-black/10 bg-white hover:bg-neutral-200 text-neutral-900 font-bold"
                      onClick={async () => {
                        try {
                          await api.post("/admin/config", config);
                          toast.success("配置已保存");
                          if (onConfigUpdate) onConfigUpdate();
                        } catch (err) {
                          toast.error("配置保存失败");
                        }
                      }}
                    >
                      保存配置
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                      <div className="space-y-12">
                        <div className="space-y-6">
                          <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest border-b border-black/10 pb-2">
                            Omni Router 路由
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                凭证 Token
                              </Label>
                              <AntiAutofillPasswordInput
                                value={config?.omniRouterKey || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    omniRouterKey: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                网关 URL
                              </Label>
                              <Input
                                value={config?.omniRouterUrl || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    omniRouterUrl: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700 flex justify-between items-center">
                                <span>安全与并发白名单配置 (IP Whitelist)</span>
                                <span className="text-[9px] text-emerald-600 font-normal">免限速直通</span>
                              </Label>
                              <Input
                                placeholder="例如: 47.98.112.5, 120.55.62.11"
                                value={config?.ipWhitelist || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    ipWhitelist: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                              <p className="text-[9px] text-neutral-400 leading-normal">
                                填入您国内服务器或开发机的公网 IP（多个用逗号隔开）。保存后将直通专属物理专线、免受限速，并激活最高 8 路多媒体异步并发生成通道。
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest border-b border-black/10 pb-2">
                            阿里云短信配置
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                AccessKey ID
                              </Label>
                              <Input
                                value={config?.aliyunAccessKeyId || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    aliyunAccessKeyId: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                AccessKey Secret
                              </Label>
                              <AntiAutofillPasswordInput
                                value={config?.aliyunAccessKeySecret || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    aliyunAccessKeySecret: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                签名名称 (SignName)
                              </Label>
                              <Input
                                value={config?.aliyunSmsSignName || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    aliyunSmsSignName: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                模板代码 (TemplateCode)
                              </Label>
                              <Input
                                value={config?.aliyunSmsTemplateCode || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    aliyunSmsTemplateCode: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-12">
                        <div className="space-y-6">
                          <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest border-b border-black/10 pb-2">
                            系统经济模型
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                初始赠与积分
                              </Label>
                              <Input
                                type="number"
                                value={config?.initialCredits || 0}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    initialCredits: parseInt(e.target.value),
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                单次模型消耗
                              </Label>
                              <Input
                                type="number"
                                value={config?.omniRouterInferenceCost || 50}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    omniRouterInferenceCost: parseInt(
                                      e.target.value,
                                    ),
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "activities" &&
                hasPermission("manage_content") && (
                  <div className="flex-1 overflow-hidden flex flex-col bg-white relative z-10 px-10 py-8">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-neutral-900 tracking-widest uppercase">
                          专栏活动设定
                        </h3>
                      </div>
                      <Button
                        variant="outline"
                        className="border-black/10 bg-white hover:bg-neutral-200 text-neutral-900 font-bold"
                        onClick={() => {
                          setEditingActivity({
                            title: "",
                            deadline: new Date().toISOString().split("T")[0],
                            content: "",
                            type: "image",
                            status: "active",
                          });
                          setIsActivityModalOpen(true);
                        }}
                      >
                        + 发布活动
                      </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {activities.map((item) => (
                          <div
                            key={item.id}
                            className="border border-black/10 rounded overflow-hidden flex flex-col bg-white"
                          >
                            <div className="p-4 flex-1 flex flex-col space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                  <span className="px-2 py-0.5 bg-neutral-100 text-neutral-900 text-[10px] uppercase rounded">
                                    {item.type === "image"
                                      ? "图片活动"
                                      : "视频活动"}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-[10px] uppercase rounded ${item.status === "active" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"}`}
                                  >
                                    {item.status === "active"
                                      ? "进行中"
                                      : "已结束"}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 py-0 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-bold tracking-widest border border-blue-200"
                                    onClick={() => {
                                      setSelectedActivityForReview(item);
                                      setActiveTab("content");
                                    }}
                                  >
                                    审核作品
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-neutral-600 hover:text-neutral-900"
                                    onClick={() => {
                                      setEditingActivity(item);
                                      setIsActivityModalOpen(true);
                                    }}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-neutral-600 hover:text-red-500"
                                    onClick={async () => {
                                      try {
                                        await api.delete(
                                          `/admin/activities/${item.id}`,
                                        );
                                        fetchData();
                                      } catch (err) {}
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-sm font-bold text-neutral-900 truncate">
                                  {item.title}
                                </h3>
                                <p className="text-[10px] text-neutral-500">
                                  截稿时间: {item.deadline}
                                </p>
                                <p className="text-[10px] text-neutral-600 line-clamp-3">
                                  {item.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {activities.length === 0 && (
                          <div className="col-span-full py-20 text-center text-neutral-700 font-mono text-[10px] uppercase">
                            暂无活动。
                          </div>
                        )}
                      </div>
                    </div>

                    {isActivityModalOpen && (
                      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded w-full max-w-2xl flex flex-col max-h-[90vh]">
                          <div className="p-4 border-b border-black/10 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-neutral-900">
                              {editingActivity?.id ? "修改活动" : "发布活动"}
                            </h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsActivityModalOpen(false)}
                              className="h-6 w-6 p-0 hover:bg-neutral-100"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs">活动背景图</Label>
                                <div className="flex gap-2 isolate">
                                  <Input
                                    value={editingActivity.cover || ""}
                                    onChange={(e) =>
                                      setEditingActivity({
                                        ...editingActivity,
                                        cover: e.target.value,
                                      })
                                    }
                                    className="bg-transparent border-black/20 flex-1"
                                    placeholder="图片 URL，可留空"
                                  />
                                  <div className="relative">
                                    <input
                                      type="file"
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const formData = new FormData();
                                        formData.append("file", file);
                                        try {
                                          const res = await api.post(
                                            "/upload",
                                            formData,
                                          );
                                          setEditingActivity({
                                            ...editingActivity,
                                            cover: res.data.url,
                                          });
                                        } catch (err) {}
                                      }}
                                    />
                                    <Button
                                      variant="outline"
                                      className="h-10 px-4 bg-transparent border-black/20 text-neutral-900"
                                    >
                                      <Upload className="w-4 h-4 mr-2" />
                                      上传
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">活动主题</Label>
                                <Input
                                  value={editingActivity.title}
                                  onChange={(e) =>
                                    setEditingActivity({
                                      ...editingActivity,
                                      title: e.target.value,
                                    })
                                  }
                                  className="bg-transparent border-black/20"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs">活动类型</Label>
                                  <select
                                    value={editingActivity.type}
                                    onChange={(e) =>
                                      setEditingActivity({
                                        ...editingActivity,
                                        type: e.target.value,
                                      })
                                    }
                                    className="w-full h-10 px-3 bg-transparent border border-black/20 rounded text-sm"
                                  >
                                    <option value="image">图片活动</option>
                                    <option value="video">视频活动</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">截稿时间</Label>
                                  <Input
                                    type="date"
                                    value={editingActivity.deadline}
                                    onChange={(e) =>
                                      setEditingActivity({
                                        ...editingActivity,
                                        deadline: e.target.value,
                                      })
                                    }
                                    className="bg-transparent border-black/20"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">活动状态</Label>
                                <select
                                  value={editingActivity.status}
                                  onChange={(e) =>
                                    setEditingActivity({
                                      ...editingActivity,
                                      status: e.target.value,
                                    })
                                  }
                                  className="w-full h-10 px-3 bg-transparent border border-black/20 rounded text-sm"
                                >
                                  <option value="active">进行中</option>
                                  <option value="ended">已结束</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">活动内容</Label>
                                <textarea
                                  value={editingActivity.content}
                                  onChange={(e) =>
                                    setEditingActivity({
                                      ...editingActivity,
                                      content: e.target.value,
                                    })
                                  }
                                  className="w-full bg-transparent border border-black/20 rounded p-3 text-sm min-h-[120px]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="p-4 border-t border-black/10 flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => setIsActivityModalOpen(false)}
                            >
                              取消
                            </Button>
                            <Button
                              className="bg-black text-white hover:bg-neutral-800"
                              onClick={async () => {
                                try {
                                  if (editingActivity.id) {
                                    await api.put(
                                      `/admin/activities/${editingActivity.id}`,
                                      editingActivity,
                                    );
                                  } else {
                                    await api.post(
                                      "/admin/activities",
                                      editingActivity,
                                    );
                                  }
                                  fetchData();
                                  setIsActivityModalOpen(false);
                                  toast.success("操作成功");
                                } catch (err) {
                                  toast.error("操作失败");
                                }
                              }}
                            >
                              保存
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {activeTab === "news" && hasPermission("manage_site") && (
                <div className="flex-1 overflow-hidden flex flex-col bg-white relative z-10 px-10 py-8">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/10">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-neutral-900 tracking-widest uppercase">
                        系统通知设定
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      className="border-black/10 bg-white hover:bg-neutral-200 text-neutral-900 font-bold"
                      onClick={() => {
                        setEditingNews({
                          title: "",
                          description: "",
                          content: "",
                          image: "",
                          tag: "通知",
                          type: "new",
                          date: new Date().toISOString().split("T")[0],
                        });
                        setIsNewsModalOpen(true);
                      }}
                    >
                      + 发布通知
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {news.map((item) => (
                        <div
                          key={item.id}
                          className="border border-black/10 rounded overflow-hidden group hover:border-black/20 transition-all flex flex-col bg-white"
                        >
                          <div className="aspect-[21/9] relative overflow-hidden bg-white">
                            <img
                              src={
                                item.image ||
                                "https://picsum.photos/seed/news/800/450"
                              }
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2 left-2 flex gap-2">
                              <span className="px-2 py-0.5 bg-white text-neutral-900 text-[9px] font-bold uppercase">
                                {item.tag}
                              </span>
                              {item.type === "hot" && (
                                <span className="px-2 py-0.5 bg-red-500 text-neutral-900 text-[9px] font-bold uppercase">
                                  热门
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-4 flex-1 flex flex-col space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-neutral-600 font-mono">
                                {item.date}
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-neutral-600 hover:text-neutral-900"
                                  onClick={() => {
                                    setEditingNews(item);
                                    setIsNewsModalOpen(true);
                                  }}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-neutral-600 hover:text-red-500"
                                  onClick={async () => {
                                    try {
                                      await api.delete(
                                        `/admin/news/${item.id}`,
                                      );
                                      fetchData();
                                    } catch (err) {}
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1 flex-1">
                              <h3 className="text-sm font-bold text-neutral-900 truncate">
                                {item.title}
                              </h3>
                              <p className="text-[10px] text-neutral-600 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {news.length === 0 && (
                        <div className="col-span-full py-20 text-center text-neutral-700 font-mono text-[10px] uppercase">
                          暂无系统通知。
                        </div>
                      )}
                    </div>
                  </div>

                  {isNewsModalOpen && (
                    <div className="fixed inset-0 bg-white/90 z-[100] flex items-center justify-center p-4">
                      <div className="bg-white border border-black/10 rounded w-full max-w-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-black/10 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">
                            {editingNews?.id ? "编辑通知" : "发布新通知"}
                          </h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsNewsModalOpen(false)}
                            className="h-6 w-6 p-0 text-neutral-600 hover:text-neutral-900"
                          >
                            ✕
                          </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                标题
                              </Label>
                              <Input
                                value={editingNews.title}
                                onChange={(e) =>
                                  setEditingNews({
                                    ...editingNews,
                                    title: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                日期
                              </Label>
                              <Input
                                type="date"
                                value={editingNews.date}
                                onChange={(e) =>
                                  setEditingNews({
                                    ...editingNews,
                                    date: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              简介 (Description)
                            </Label>
                            <textarea
                              value={editingNews.description}
                              onChange={(e) =>
                                setEditingNews({
                                  ...editingNews,
                                  description: e.target.value,
                                })
                              }
                              className="w-full bg-transparent border border-black/10 rounded p-3 text-xs min-h-[60px] text-neutral-900"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              正文 (Markdown)
                            </Label>
                            <textarea
                              value={editingNews.content}
                              onChange={(e) =>
                                setEditingNews({
                                  ...editingNews,
                                  content: e.target.value,
                                })
                              }
                              className="w-full bg-transparent border border-black/10 rounded p-4 text-xs min-h-[200px] font-mono text-neutral-900"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                标签 (Tag)
                              </Label>
                              <Input
                                value={editingNews.tag}
                                onChange={(e) =>
                                  setEditingNews({
                                    ...editingNews,
                                    tag: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 text-xs uppercase"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] text-neutral-700">
                                优先级
                              </Label>
                              <select
                                value={editingNews.type}
                                onChange={(e) =>
                                  setEditingNews({
                                    ...editingNews,
                                    type: e.target.value,
                                  })
                                }
                                className="w-full bg-transparent border border-black/10 text-neutral-900 rounded h-9 px-3 text-xs uppercase"
                              >
                                <option value="normal" className="bg-white">
                                  常规
                                </option>
                                <option value="hot" className="bg-white">
                                  热门 (Critical)
                                </option>
                                <option value="new" className="bg-white">
                                  全新 (Priority)
                                </option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[10px] text-neutral-700">
                              封面图片 URI
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                value={editingNews.image}
                                onChange={(e) =>
                                  setEditingNews({
                                    ...editingNews,
                                    image: e.target.value,
                                  })
                                }
                                className="bg-transparent border-black/10 font-mono text-xs flex-1"
                              />
                              <div className="relative">
                                <input
                                  type="file"
                                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                      const res = await api.post(
                                        "/upload",
                                        formData,
                                      );
                                      setEditingNews({
                                        ...editingNews,
                                        image: res.data.url,
                                      });
                                    } catch (err) {}
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  className="h-9 w-9 bg-transparent border-black/10 text-neutral-900 p-0"
                                >
                                  <Upload className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 border-t border-black/10 flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => setIsNewsModalOpen(false)}
                            className="text-xs"
                          >
                            取消
                          </Button>
                          <Button
                            className="bg-white text-neutral-900 hover:bg-neutral-200 text-xs font-bold"
                            onClick={async () => {
                              try {
                                if (editingNews.id) {
                                  await api.put(
                                    `/admin/news/${editingNews.id}`,
                                    editingNews,
                                  );
                                } else {
                                  await api.post("/admin/news", editingNews);
                                }
                                setIsNewsModalOpen(false);
                                fetchData();
                              } catch (err) {}
                            }}
                          >
                            {editingNews.id ? "保存修改" : "立即发布"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedUser && (
        <UserActionModal
          user={selectedUser}
          currentUser={currentUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={fetchData}
        />
      )}

      {previewingMedia && (
        <div
          className="fixed inset-0 z-[60000] bg-white/90 flex items-center justify-center p-4 md:p-12"
          onClick={() => setPreviewingMedia(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-5xl aspect-video bg-white rounded-md overflow-hidden shadow-2xl border border-black/10"
            onClick={(e) => e.stopPropagation()}
          >
            {checkIsVideoUrl(previewingMedia) ? (
              <video
                src={previewingMedia}
                className="w-full h-full"
                controls
                autoPlay
              />
            ) : (
              <img
                src={previewingMedia}
                className="w-full h-full object-contain"
                alt="Preview"
                referrerPolicy="no-referrer"
              />
            )}
            <button
              onClick={() => setPreviewingMedia(null)}
              className="absolute top-6 right-6 p-2 bg-white/80 hover:bg-white/60 text-neutral-900 rounded-full transition-all hover:rotate-90 z-50"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
