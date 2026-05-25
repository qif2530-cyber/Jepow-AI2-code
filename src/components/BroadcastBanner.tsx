import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import api from "../lib/api";

export function BroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Fetch broadcasts
    api
      .get("/public/broadcasts")
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          // 只取最新的5条消息
          setBroadcasts(res.data.slice(0, 5));
        }
      })
      .catch((err) => console.error("Failed to fetch broadcasts:", err));
  }, []);

  useEffect(() => {
    if (broadcasts.length > 1) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [broadcasts]);

  if (broadcasts.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[120000] h-10 w-full flex justify-center pointer-events-none">
      <div className="relative w-full max-w-3xl h-full mx-auto overflow-hidden bg-gradient-to-r from-transparent via-neutral-900/80 to-transparent flex items-center justify-center backdrop-blur-sm border-b border-white/5 shadow-2xl">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute flex items-center justify-center text-[13px] font-black tracking-widest text-emerald-400 drop-shadow-md px-12"
          >
            <span className="opacity-50 text-white mr-3">SYSTEM</span>
            {broadcasts[currentIndex]?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
