import React from "react";
import {
  Plus,
  FolderOpen,
  Zap,
  LogOut,
  ExternalLink,
  Trash2,
  Clock,
} from "lucide-react";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { openJepowWeb } from "../lib/runtime";
import type { CloudProject } from "../types";
import { checkIsVideoUrl } from "../lib/video";

interface DesktopHomeScreenProps {
  user: {
    id: string;
    username?: string;
    accountName?: string;
    avatar?: string;
    credits?: number;
  };
  projects: CloudProject[];
  siteLogo?: string;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onLogout: () => void;
}

export function DesktopHomeScreen({
  user,
  projects,
  siteLogo,
  onNewProject,
  onOpenProject,
  onDeleteProject,
  onLogout,
}: DesktopHomeScreenProps) {
  const displayName = user.username || user.accountName || "创作者";

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fafafa] text-neutral-900 overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-8 py-5 border-b border-black/[0.06] bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Logo className="w-9 h-9" url={siteLogo} />
          <span className="text-lg font-black tracking-tight">Jepow AI</span>
          <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
            无限画布
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => openJepowWeb("/")}
            className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" />
            打开网站
          </button>
          <button
            type="button"
            onClick={() => openJepowWeb("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-sm font-semibold"
          >
            <Zap className="w-4 h-4 fill-amber-500 text-amber-600" />
            {user.credits ?? 0} 能量
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-black/10">
            <UserAvatar
              userId={user.id}
              avatar={user.avatar}
              displayName={displayName}
              className="w-10 h-10 rounded-full object-cover border border-black/10 shrink-0"
            />
            <span className="text-sm font-semibold text-neutral-800 max-w-[120px] truncate hidden md:block">
              {displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
            title="退出登录"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
            <div className="flex items-start gap-4">
              <UserAvatar
                userId={user.id}
                avatar={user.avatar}
                displayName={displayName}
                className="w-14 h-14 rounded-2xl object-cover border border-black/10 shadow-sm shrink-0 hidden sm:block"
              />
              <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-neutral-900">
                欢迎回来，{displayName}
              </h1>
              <p className="text-neutral-500 mt-2 text-sm md:text-base">
                打开历史工程继续创作，或新建工程并选择保存位置
              </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onNewProject}
              className="inline-flex items-center justify-center gap-2 bg-neutral-900 text-white font-bold rounded-full px-8 py-4 hover:bg-neutral-800 shadow-lg active:scale-[0.98] transition-all shrink-0"
            >
              <Plus className="w-5 h-5" />
              新建工程
            </button>
          </div>

          <div className="flex items-center gap-2 mb-5 text-neutral-500">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-semibold">历史工程</span>
            <span className="text-xs text-neutral-400">({projects.length})</span>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-white py-20 flex flex-col items-center text-center">
              <FolderOpen className="w-12 h-12 text-neutral-300 mb-4" />
              <p className="font-semibold text-neutral-600">暂无历史工程</p>
              <p className="text-sm text-neutral-400 mt-1 max-w-sm">
                点击「新建工程」选择保存文件夹后即可开始创作
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group rounded-2xl border border-black/[0.08] bg-white overflow-hidden shadow-sm hover:shadow-xl hover:border-black/15 transition-all"
                >
                  <button
                    type="button"
                    className="w-full aspect-video bg-neutral-100 relative overflow-hidden"
                    onClick={() => onOpenProject(p.id)}
                  >
                    {p.thumbnail ? (
                      checkIsVideoUrl(p.thumbnail) ? (
                        <video
                          src={p.thumbnail}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300">
                        <FolderOpen className="w-10 h-10" />
                      </div>
                    )}
                  </button>
                  <div className="p-4 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left flex-1 min-w-0"
                      onClick={() => onOpenProject(p.id)}
                    >
                      <p className="font-semibold text-neutral-900 truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {new Date(p.updatedAt).toLocaleString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        if (confirm(`确定删除「${p.name}」吗？`)) {
                          onDeleteProject(p.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
