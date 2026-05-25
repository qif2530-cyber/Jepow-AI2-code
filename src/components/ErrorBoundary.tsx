import React, { Component, ErrorInfo, ReactNode } from "react";
import { toast } from "sonner";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    toast.error(`Error: ${error.message}`);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-white text-red-400 p-4 text-center">
          <div>
            <h2 className="text-lg font-bold mb-2">出错了</h2>
            <p className="text-sm">请尝试刷新页面或清除本地缓存。</p>
            {this.state.error && (
              <pre className="text-left bg-white text-red-300 p-4 mt-4 overflow-auto max-w-2xl text-xs rounded">
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2 justify-center mt-4">
              <button
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-700 text-neutral-900 rounded text-sm"
                onClick={() => this.setState({ hasError: false })}
              >
                重试
              </button>
              <button
                className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-200 border border-red-500/30 rounded text-sm"
                onClick={() => {
                  localStorage.removeItem("ais-nodes");
                  localStorage.removeItem("ais-edges");
                  localStorage.removeItem("ais-user");
                  localStorage.removeItem("ais-token");
                  window.location.reload();
                }}
              >
                清除本地数据
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
