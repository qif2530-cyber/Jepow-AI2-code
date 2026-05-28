import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Zap, LogOut, ExternalLink } from "lucide-react";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { openJepowWeb } from "../lib/runtime";

type OfficialUpdate = {
  title: string;
  summary: string;
  url?: string;
  mediaUrl?: string;
};

interface DesktopHomeScreenProps {
  user: {
    id: string;
    username?: string;
    accountName?: string;
    avatar?: string;
    credits?: number;
  };
  onStart: () => void;
  onLogout: () => void;
}

const FALLBACK_UPDATES: OfficialUpdate[] = [
  {
    title: "Jepow 官方动态",
    summary: "正在连接官方活动与通知中心，稍后将自动同步最新信息。",
    url: "https://jepow.com",
  },
  {
    title: "无限画布工作流",
    summary: "图像、视频与三维节点可以在同一画布中组织、编排和迭代。",
    url: "https://jepow.com",
  },
];

function normalizeOfficialUpdates(payload: unknown): OfficialUpdate[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.items)
      ? (payload as any).items
      : Array.isArray((payload as any)?.announcements)
        ? (payload as any).announcements
        : Array.isArray((payload as any)?.posts)
          ? (payload as any).posts
          : [];

  return source
    .map((item: any) => ({
      title: String(item?.title || item?.name || item?.headline || "").trim(),
      summary: String(item?.summary || item?.description || item?.excerpt || "").trim(),
      url: item?.url || item?.link || item?.href,
      mediaUrl:
        item?.mediaUrl ||
        item?.posterUrl ||
        item?.poster ||
        item?.imageUrl ||
        item?.image ||
        item?.coverUrl ||
        item?.cover ||
        item?.videoUrl,
    }))
    .filter((item) => item.title)
    .slice(0, 8);
}

export function DesktopHomeScreen({
  user,
  onStart,
  onLogout,
}: DesktopHomeScreenProps) {
  const displayName = user.username || user.accountName || "创作者";
  const [showIntro, setShowIntro] = useState(true);
  const [officialUpdates, setOfficialUpdates] = useState<OfficialUpdate[]>(FALLBACK_UPDATES);
  const [activeUpdateIndex, setActiveUpdateIndex] = useState(0);
  const activeUpdate = useMemo(
    () => officialUpdates[activeUpdateIndex % officialUpdates.length] || FALLBACK_UPDATES[0],
    [activeUpdateIndex, officialUpdates],
  );
  const hasOfficialPoster = Boolean(activeUpdate.mediaUrl);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const endpoints = [
      "https://jepow.com/api/desktop/announcements",
      "https://jepow.com/api/announcements",
      "https://jepow.com/api/news",
    ];

    const loadOfficialUpdates = async () => {
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) continue;
          const nextUpdates = normalizeOfficialUpdates(await response.json());
          if (nextUpdates.length > 0) {
            setOfficialUpdates(nextUpdates);
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
    };

    loadOfficialUpdates();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (showIntro || officialUpdates.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveUpdateIndex((index) => (index + 1) % officialUpdates.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [officialUpdates.length, showIntro]);

  if (showIntro) {
    return (
      <div className="relative w-[720px] max-w-[calc(100vw-32px)] h-[420px] overflow-hidden rounded-lg border border-[#3d3d3d] bg-[#111214] text-[#d8d8d8] shadow-2xl">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes jepowIntroLineA {
                0% { transform: translate3d(-20%, 20%, 0) rotate(0deg) scale(0.9); opacity: .2; }
                45% { opacity: .95; }
                100% { transform: translate3d(22%, -18%, 0) rotate(160deg) scale(1.15); opacity: .35; }
              }
              @keyframes jepowIntroLineB {
                0% { transform: translate3d(18%, -16%, 0) rotate(180deg) scale(1); opacity: .18; }
                50% { opacity: .9; }
                100% { transform: translate3d(-18%, 16%, 0) rotate(20deg) scale(1.2); opacity: .3; }
              }
              @keyframes jepowIntroPulse {
                0%, 100% { opacity: .38; filter: blur(22px); }
                50% { opacity: .85; filter: blur(12px); }
              }
              @keyframes jepowPosterFlow {
                0% { transform: translate3d(0, 0, 0); }
                100% { transform: translate3d(-50%, 0, 0); }
              }
            `,
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(87,132,255,0.24),transparent_34%),radial-gradient(circle_at_70%_78%,rgba(255,96,201,0.18),transparent_34%),#111214]" />
        <div className="absolute inset-[-18%] opacity-90">
          <div className="absolute left-[8%] top-[28%] h-[2px] w-[86%] rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent" style={{ animation: "jepowIntroLineA 5s ease-in-out forwards" }} />
          <div className="absolute left-[12%] top-[54%] h-[2px] w-[80%] rounded-full bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent" style={{ animation: "jepowIntroLineB 5s ease-in-out forwards" }} />
          <div className="absolute left-[18%] top-[36%] h-36 w-36 rounded-full bg-blue-500/25" style={{ animation: "jepowIntroPulse 2.4s ease-in-out infinite" }} />
          <div className="absolute right-[16%] bottom-[24%] h-44 w-44 rounded-full bg-fuchsia-500/20" style={{ animation: "jepowIntroPulse 2.8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-5 text-[24px] font-semibold tracking-tight text-white">
            Jepow AI 无限画布
          </h1>
          <p className="mt-2 text-[12px] text-[#b8b8b8]">
            正在同步官方活动、通知与工作区信息
          </p>
          <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full origin-left animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[720px] max-w-[calc(100vw-32px)] max-h-[78vh] flex flex-col bg-[#202124] text-[#d8d8d8] overflow-hidden rounded-lg border border-[#3d3d3d] shadow-2xl">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes jepowPosterFlow {
              0% { transform: translate3d(0, 0, 0); }
              100% { transform: translate3d(-50%, 0, 0); }
            }
            @keyframes jepowPosterLineA {
              0% { transform: translate3d(-18%, 18%, 0) rotate(0deg) scale(0.95); opacity: .2; }
              45% { opacity: .95; }
              100% { transform: translate3d(18%, -16%, 0) rotate(150deg) scale(1.18); opacity: .38; }
            }
            @keyframes jepowPosterLineB {
              0% { transform: translate3d(16%, -14%, 0) rotate(180deg) scale(1); opacity: .18; }
              50% { opacity: .86; }
              100% { transform: translate3d(-16%, 14%, 0) rotate(20deg) scale(1.2); opacity: .34; }
            }
            @keyframes jepowPosterPulse {
              0%, 100% { opacity: .34; filter: blur(24px); transform: scale(.95); }
              50% { opacity: .9; filter: blur(12px); transform: scale(1.08); }
            }
          `,
        }}
      />
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[#343434] bg-[#2b2c2f]">
        <div className="flex items-center gap-3">
          <Logo className="w-6 h-6" />
          <span className="text-[13px] font-semibold tracking-tight text-white">Jepow AI</span>
          <span className="text-[11px] text-[#8c8c8c] font-medium hidden sm:inline">
            无限画布
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openJepowWeb("/")}
            className="text-[11px] text-[#9a9a9a] hover:text-white flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openJepowWeb("/")}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#30291c] border border-[#5c4825] text-amber-300 text-[11px] font-semibold"
          >
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            {user.credits ?? 0}
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-[#3a3a3a]">
            <UserAvatar
              userId={user.id}
              avatar={user.avatar}
              displayName={displayName}
              className="w-7 h-7 rounded object-cover border border-[#3a3a3a] shrink-0"
            />
            <span className="text-[11px] font-semibold text-[#d8d8d8] max-w-[100px] truncate hidden md:block">
              {displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="p-1.5 rounded hover:bg-white/10 text-[#9a9a9a]"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="relative flex h-[390px] min-h-[360px] flex-col overflow-hidden bg-[#111214]">
          <button
            type="button"
            onClick={() => activeUpdate.url && openJepowWeb(activeUpdate.url)}
            className="absolute inset-0 overflow-hidden text-left"
          >
            {hasOfficialPoster ? (
              activeUpdate.mediaUrl?.match(/\.(mp4|webm|mov)(\?|#|$)/i) ? (
                <video
                  key={activeUpdate.mediaUrl}
                  src={activeUpdate.mediaUrl}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  key={activeUpdate.mediaUrl}
                  src={activeUpdate.mediaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(54,211,255,0.26),transparent_34%),radial-gradient(circle_at_76%_74%,rgba(190,107,255,0.24),transparent_34%),#111214]" />
                <div className="absolute inset-[-18%] opacity-90">
                  <div className="absolute left-[8%] top-[26%] h-[2px] w-[86%] rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent" style={{ animation: "jepowPosterLineA 5s ease-in-out infinite alternate" }} />
                  <div className="absolute left-[12%] top-[58%] h-[2px] w-[80%] rounded-full bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent" style={{ animation: "jepowPosterLineB 5s ease-in-out infinite alternate" }} />
                  <div className="absolute left-[14%] top-[22%] h-48 w-48 rounded-full bg-blue-500/25" style={{ animation: "jepowPosterPulse 2.6s ease-in-out infinite" }} />
                  <div className="absolute right-[10%] bottom-[18%] h-56 w-56 rounded-full bg-fuchsia-500/22" style={{ animation: "jepowPosterPulse 3s ease-in-out infinite" }} />
                </div>
              </>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-[#111214]/78" />
            <div className="absolute right-4 top-4 flex items-center gap-1.5">
                {officialUpdates.map((_, index) => (
                  <span
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeUpdateIndex
                        ? "w-5 bg-cyan-300"
                        : "w-1.5 bg-white/35"
                    }`}
                  />
                ))}
            </div>
            <div className="absolute bottom-[96px] left-5 max-w-[74%]">
              <p className="text-[20px] font-semibold tracking-tight text-white">
                {activeUpdate.title}
              </p>
              <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[#c4ccdc]">
                {activeUpdate.summary || "查看 Jepow 官方最新发布。"}
              </p>
            </div>
          </button>

          <div className="relative z-10 mt-auto flex flex-col gap-4 bg-[#202124]/78 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <UserAvatar
                userId={user.id}
                avatar={user.avatar}
                displayName={displayName}
                className="w-10 h-10 rounded object-cover border border-[#3a3a3a] shadow-sm shrink-0 hidden sm:block"
              />
              <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-white">
                欢迎回来，{displayName}
              </h1>
              <p className="text-[#9a9a9a] mt-1 text-[12px]">
                账号已完成验证，点击开始创作进入工作区
              </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center justify-center gap-2 bg-[#3f6db5] text-white font-semibold rounded px-5 h-9 hover:bg-[#4c7ccc] active:scale-[0.98] transition-all shrink-0 text-[12px]"
            >
              开始创作
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
