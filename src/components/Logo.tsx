import React, { useState } from "react";
import { Sparkles } from "lucide-react";

export const Logo = ({
  className = "w-8 h-8",
  url,
}: {
  className?: string;
  url?: string;
}) => {
  const [imgError, setImgError] = useState(false);
  const logoUrl = url || "/jepow-logo.png";
  if (!imgError) {
    return (
      <span
        className={`${className} inline-flex items-center justify-center bg-white rounded-[20%] overflow-hidden border border-black/10`}
        aria-label="Jepow Logo"
      >
        <img
          src={logoUrl}
          alt="Logo"
          className="w-[78%] h-[78%] object-contain"
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
