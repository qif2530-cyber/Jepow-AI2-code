import React, { useState } from "react";
import { Sparkles } from "lucide-react";

const JEPOW_LOGO_URL = "/jepow-logo.png?v=20260525-2354";

export const Logo = ({
  className = "w-8 h-8",
}: {
  className?: string;
}) => {
  const [imgError, setImgError] = useState(false);
  if (!imgError) {
    return (
      <span
        className={`${className} inline-flex items-center justify-center bg-white rounded-[20%] overflow-hidden border border-black/10`}
        aria-label="Jepow Logo"
      >
        <img
          src={JEPOW_LOGO_URL}
          alt="Logo"
          className="w-full h-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </span>
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-white text-neutral-900 rounded-[20%] overflow-hidden border border-black/10`}
      aria-label="Jepow Logo"
    >
      <Sparkles className="w-1/2 h-1/2" />
    </div>
  );
};
