import React, { useState, useEffect, useRef } from "react";
import { X, Send } from "lucide-react";
import { Button } from "./ui/button";
import { socket } from "../lib/socket";
import api from "../lib/api";

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
}

interface ChatWindowProps {
  currentUserId: string;
  targetUserId: string;
  onClose: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  currentUserId,
  targetUserId,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [targetUser, setTargetUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch target user info
    api
      .get(`/user/${targetUserId}`)
      .then((res) => {
        setTargetUser(res.data);
      })
      .catch(console.error);

    // Fetch historical messages
    api
      .get(`/messages/${targetUserId}`)
      .then((res) => {
        setMessages(res.data);
      })
      .catch(console.error);

    // Listen for incoming messages
    const handleReceiveMessage = (message: any) => {
      if (
        (message.senderId === currentUserId &&
          message.receiverId === targetUserId) ||
        (message.senderId === targetUserId &&
          message.receiverId === currentUserId)
      ) {
        setMessages((prev) => [...prev, message]);
      }
    };

    socket.on("receive_message", handleReceiveMessage);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    socket.emit("send_message", {
      fromUserId: currentUserId,
      toUserId: targetUserId,
      content: inputValue.trim(),
    });

    setInputValue("");
  };

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-white border border-black/10 rounded-md shadow-2xl flex flex-col z-[10000] overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-100">
            {targetUser?.avatar ? (
              <img
                src={targetUser.avatar}
                alt={targetUser.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-900">
                {targetUser?.username?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </div>
          <span className="font-bold text-neutral-900">
            {targetUser?.username || "加载中..."}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-md text-sm ${
                  isMe
                    ? "bg-white text-black rounded-br-none"
                    : "bg-black/10 text-neutral-900 rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
              <span className="text-[10px] text-neutral-500 mt-1">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-black/5 bg-white flex items-center gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="传输信号..."
          className="flex-1 bg-black/5 border border-black/10 rounded-md px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-white/40"
        />
        <Button
          onClick={handleSend}
          className="w-9 h-9 rounded-md bg-white text-black hover:bg-neutral-200 p-0 flex items-center justify-center shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
