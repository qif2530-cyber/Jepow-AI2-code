import React from "react";
import { motion } from "motion/react";

export const SidebarItem = ({
  icon,
  label,
  active = false,
  onClick,
  highlight = false,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  highlight?: boolean;
  variant?: "default" | "red" | "blue";
}) => {
  const baseClasses =
    "w-full py-3 flex flex-col items-center justify-center relative transition-all duration-300 active:scale-95 cursor-pointer";

  const variants = {
    default: active
      ? "text-neutral-900 font-bold"
      : "text-neutral-500 hover:text-neutral-800 font-medium",
    red: "text-red-500 hover:text-red-600",
    blue: "text-blue-500 hover:text-blue-600",
  };

  return (
    <div className="relative flex flex-col items-center w-full">
      <button
        onClick={onClick}
        className={`${baseClasses} ${variants[variant]}`}
      >
        <div className="relative z-10 flex items-center justify-center mb-1">
          {icon}
          {highlight && !active && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse" />
          )}
        </div>
        <span className="text-[10px] sm:text-xs">{label}</span>
      </button>
    </div>
  );
};

export const MobileNavItem = ({
  icon,
  label,
  active = false,
  onClick,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}) => (
  <button
    onClick={onClick}
    className="flex-1 flex flex-col items-center justify-center py-2 relative group"
  >
    <div
      className={`
      relative z-10 transition-colors duration-300 flex items-center justify-center mb-1
      ${active ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-800"}
    `}
    >
      {icon}
      {highlight && !active && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </div>
    <span
      className={`
      text-[9px] font-bold transition-colors duration-300
      ${active ? "text-neutral-900" : "text-neutral-500"}
    `}
    >
      {label}
    </span>
  </button>
);
