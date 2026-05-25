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
  if (url && !imgError) {
    return (
      <img
        src={url}
        alt="Logo"
        className={`${className} grayscale brightness-125 contrast-125 object-contain`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-white text-neutral-900 rounded-[20%] overflow-hidden`}
    >
      <Sparkles className="w-1/2 h-1/2" />
    </div>
  );
};
