import React, { useState, useEffect } from "react";
import { X, ShieldCheck } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

interface UserListModalProps {
  title: string;
  userId: string;
  type: "followers" | "following";
  onClose: () => void;
  onUserClick: (id: string) => void;
}

export const UserListModal: React.FC<UserListModalProps> = ({
  title,
  userId,
  type,
  onClose,
  onUserClick,
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get(`/user/${userId}/${type}`);
        setUsers(res.data);
      } catch (err) {
        toast.error("获取列表失败");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [userId, type]);

  return (
    <div className="fixed inset-0 bg-white/80 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-md w-full max-w-md max-h-[80vh] border border-black/10 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between p-6 border-b border-black/5">
          <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-black/10 rounded-full transition-colors text-neutral-600 hover:text-neutral-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-10 text-neutral-500 font-bold uppercase tracking-widest animate-pulse">
              正在载入数据...
            </div>
          ) : users.length > 0 ? (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-md hover:bg-black/5 cursor-pointer transition-colors"
                  onClick={() => {
                    onClose();
                    onUserClick(u.id);
                  }}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-black/10 shrink-0">
                    <img
                      src={
                        u.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`
                      }
                      alt={u.username}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900">
                        {u.username}
                      </span>
                      {u.certifications && u.certifications.length > 0 && (
                        <span className="text-[10px] text-amber-400 font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
                          认证设计师
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-neutral-500 uppercase font-black tracking-tighter opacity-30">
              列表为空
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
