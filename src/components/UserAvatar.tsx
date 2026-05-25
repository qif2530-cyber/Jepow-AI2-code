import React, { useEffect, useMemo, useState } from "react";
import { dicebearAvatarUrl, resolveMediaUrl } from "../lib/runtime";

interface UserAvatarProps {
  userId: string;
  avatar?: string | null;
  displayName?: string;
  className?: string;
}

export function UserAvatar({
  userId,
  avatar,
  displayName,
  className = "w-10 h-10 rounded-full object-cover border border-black/10",
}: UserAvatarProps) {
  const resolved = useMemo(() => resolveMediaUrl(avatar), [avatar]);
  const fallback = useMemo(() => dicebearAvatarUrl(userId), [userId]);
  const [src, setSrc] = useState(resolved || fallback);

  useEffect(() => {
    setSrc(resolved || fallback);
  }, [resolved, fallback]);

  const initial = (displayName || userId || "?").slice(0, 1).toUpperCase();

  if (!resolved && !avatar) {
    return (
      <div
        className={`${className} bg-neutral-200 flex items-center justify-center text-sm font-bold text-neutral-600 border-neutral-300`}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setSrc(fallback)}
    />
  );
}
