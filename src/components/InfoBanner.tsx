import React, { useEffect, useState, useRef } from "react";
import { Megaphone } from "lucide-react";
import api from "../lib/api";
import { io } from "socket.io-client";
import { getAppOrigin } from "../lib/runtime";

interface Announcement {
  id: string;
  type: "news" | "broadcast";
  title: string;
  content: string;
  timestamp: string;
  tag?: string;
}

const SOCKET_URL = getAppOrigin();

interface InfoBannerProps {
  onClick?: (tab: "official" | "system") => void;
}

export const InfoBanner: React.FC<InfoBannerProps> = ({ onClick }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const fetchAnnouncements = async () => {
    try {
      const response = await api.get("/announcements");
      setAnnouncements(response.data.slice(0, 5));
    } catch (error) {
      console.error("Failed to fetch announcements:", error);
    }
  };

  useEffect(() => {
    fetchAnnouncements();

    const socket = io(SOCKET_URL);
    socket.on("announcement_updated", () => {
      fetchAnnouncements();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (announcements.length === 0) return null;

  return (
    <div
      className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] max-w-[90vw] h-10 z-[200] flex items-center bg-white/60 overflow-hidden pointer-events-auto"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
      }}
    >
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black/60 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black/60 to-transparent z-10 pointer-events-none" />

      {/* Container for marquee */}
      <div className="flex whitespace-nowrap animate-marquee h-full items-center">
        {/* Render multiple times for seamless loop */}
        {[...announcements, ...announcements, ...announcements].map(
          (current, idx) => (
            <div
              key={`${current.id}-${idx}`}
              className="flex items-center gap-4 px-12 cursor-pointer hover:opacity-80 transition-opacity h-full"
              onClick={() =>
                onClick?.(current.type === "news" ? "official" : "system")
              }
            >
              <Megaphone className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-neutral-900/90">
                <span className="text-amber-400 font-bold mr-2 uppercase tracking-wide">
                  [
                  {current.tag ||
                    (current.type === "broadcast" ? "系统广播" : "公告")}
                  ]
                </span>
                {current.content}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
};
