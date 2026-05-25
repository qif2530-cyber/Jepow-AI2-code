import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Clock, X, Trash2 } from "lucide-react";
import { RenameProjectModal } from "./RenameProjectModal";

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

interface ProjectListModalProps {
  projects: Project[];
  onClose: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
}

export function ProjectListModal({
  projects,
  onClose,
  onLoad,
  onDelete,
  onRename,
}: ProjectListModalProps) {
  const [projectToRename, setProjectToRename] = useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-white/60 backdrop-blur-sm animate-in fade-in duration-200 p-4 sm:p-8">
      <Card
        className="w-full max-w-5xl bg-white border border-black/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] overflow-hidden h-[85vh] flex flex-col rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between border-b border-black/5 px-8 md:px-12 py-8 bg-neutral-50/50">
          <div>
            <CardTitle className="text-2xl md:text-3xl font-black flex items-center gap-4 text-neutral-900 tracking-tight">
              <Clock className="w-8 h-8 text-neutral-900" />
              工程档案中心
            </CardTitle>
            <p className="text-sm font-medium text-neutral-500 mt-2 uppercase tracking-widest">
              工程保存在本机 · Local Project Archive
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-12 w-12 text-neutral-400 hover:text-neutral-900 hover:bg-black/5 rounded-full transition-all"
          >
            <X className="w-6 h-6" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-white">
          {projects.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 text-neutral-400 space-y-6">
              <div className="w-24 h-24 rounded-full bg-neutral-100 flex items-center justify-center border border-black/5 mb-4">
                <Clock className="w-10 h-10 opacity-20" />
              </div>
              <p className="font-black text-xl uppercase tracking-widest opacity-40">
                档案库为空
              </p>
              <p className="text-sm font-medium uppercase tracking-widest opacity-40">
                暂无任何工程记录
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group relative flex flex-col justify-between p-6 rounded-2xl bg-white border border-black/10 shadow-sm hover:shadow-xl hover:border-black/20 hover:-translate-y-1 transition-all duration-300"
                >
                  <div
                    className="flex-1 cursor-pointer mb-8"
                    onClick={() => onLoad(p.id)}
                  >
                    <h3
                      className="text-xl font-black text-neutral-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight line-clamp-2"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (onRename)
                          setProjectToRename({ id: p.id, name: p.name });
                      }}
                      title="双击修改名称"
                    >
                      {p.name}
                    </h3>
                    <div className="flex flex-col gap-1 mt-4">
                      <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">
                        LAST SYNC
                      </span>
                      <p className="text-xs text-neutral-600 font-mono bg-neutral-100 w-fit px-2 py-1 rounded-md">
                        {new Date(p.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-4 border-t border-black/5">
                    {onRename && (
                      <Button
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToRename({ id: p.id, name: p.name });
                        }}
                        className="flex-1 h-12 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                      >
                        重命名
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoad(p.id);
                      }}
                      className="flex-[2] h-12 bg-neutral-900 hover:bg-black text-white text-xs rounded-xl font-black tracking-widest uppercase shadow-md active:scale-95 transition-all"
                    >
                      加载工程
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(p.id);
                      }}
                      className="h-12 w-12 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex-shrink-0 border border-transparent hover:border-red-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {projectToRename && onRename && (
        <RenameProjectModal
          initialName={projectToRename.name}
          onClose={() => setProjectToRename(null)}
          onConfirm={(newName) => {
            onRename(projectToRename.id, newName);
            setProjectToRename(null);
          }}
        />
      )}
    </div>
  );
}
