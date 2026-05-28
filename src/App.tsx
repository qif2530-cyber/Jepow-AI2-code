import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Label } from "@/src/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Loader2,
  Image as ImageIcon,
  Video,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  Hand,
  MousePointer2,
  Upload,
  LayoutGrid,
  FileText,
  Play,
  Type as TypeIcon,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Sparkles,
  Send,
  Bot,
  MessageSquare,
  Palette,
  Pen,
  Film,
  Edit2,
  Box,
  Camera,
  Zap,
  Layers,
  Plus,
  LogOut,
  CreditCard,
  Clock,
  Save,
  Trash2,
  ShieldCheck,
  Users,
  BarChart3,
  Search,
  Ban,
  UserCheck,
  MoreVertical,
  Settings2,
  Lock,
  Unlock,
  UserPlus,
  UserMinus,
  Key,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Move,
} from "lucide-react";
import api from "./lib/api";
import {
  getAppOrigin,
  isCanvasOnlyMode,
  canUseInfiniteCanvas,
  shouldStoreProjectsLocally,
  shouldUseLocalCanvasAssets,
  openJepowWeb,
  DESKTOP_WEB_PATHS,
  isDesktopLoginOnWeb,
  startDesktopBrowserLogin,
} from "./lib/runtime";
import { ingestBlendProjectFile, ingestDroppedModelFile } from "./lib/local-assets";
import { mergeBlendImportGraph } from "./lib/blend-project-import";
import { getLocalUserId } from "./lib/local-user-id";
import {
  listLocalProjects,
  loadLocalProject,
  saveLocalProject,
  deleteLocalProject,
  renameLocalProject,
  createLocalProjectAtPath,
} from "./lib/local-projects";
import { DesktopLoginGate } from "./components/DesktopLoginGate";
import { DesktopDownloadPrompt } from "./components/DesktopDownloadPrompt";
import { DesktopHomeScreen } from "./components/DesktopHomeScreen";
import { NewProjectSaveDialog } from "./components/NewProjectSaveDialog";

import { HistoryItem, Shot, UserData, CloudProject } from "./types";
import { Logo } from "./components/Logo";
import { motion, AnimatePresence } from "motion/react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import dagre from "dagre";
import { ImageShotNode } from "./components/ImageShotNode";
import { VideoShotNode } from "./components/VideoShotNode";
import { MediaNode } from "./components/MediaNode";
import { ImageNode } from "./components/ImageNode";
import { TextNode } from "./components/TextNode";
import { ScriptNode } from "./components/ScriptNode";
import { GroupNode } from "./components/GroupNode";
import { ImageTo3DNode } from "./components/ImageTo3DNode";
import { MaterialGenNode } from "./components/MaterialGenNode";
import { MaterialReplaceNode } from "./components/MaterialReplaceNode";
import { ThreeDEditorNode } from "./components/ThreeDEditorNode";
import { ModelAssetNode } from "./components/ModelAssetNode";
import { ThreeDRenderNode } from "./components/ThreeDRenderNode";
import { CyclesLightNode } from "./components/CyclesLightNode";
import { CyclesCameraNode } from "./components/CyclesCameraNode";
import { CyclesRenderSettingsNode } from "./components/CyclesRenderSettingsNode";
import { CyclesPrincipledNode } from "./components/cycles/CyclesPrincipledNode";
import { CyclesImageTextureNode } from "./components/cycles/CyclesImageTextureNode";
import { CyclesNormalMapNode } from "./components/cycles/CyclesNormalMapNode";
import { CyclesDisplacementNode } from "./components/cycles/CyclesDisplacementNode";
import {
  CyclesGammaNode,
  CyclesBrightContrastNode,
  CyclesRgbCurvesNode,
  CyclesRgbRampNode,
  CyclesMixColorNode,
  CyclesMapRangeNode,
  CyclesRgbToBwNode,
} from "./components/cycles/CyclesColorAdjustNodes";
import { CyclesPaletteMenu } from "./components/cycles/CyclesPaletteMenu";
import { PaneNodeContextMenu } from "./components/canvas/PaneNodeContextMenu";
import {
  CYCLES_NODE_PALETTE,
  getCyclesNodeDefaultData,
} from "./lib/cycles-node-registry";
import {
  edgeStyleForNative3dConnection,
  normalizeNative3dConnection,
  validateNative3dConnection,
} from "./lib/native-3d-pipeline";
import { DeletableEdge } from "./components/DeletableEdge";
import { ShotContext } from "./ShotContext";
import { useHistory } from "./hooks/useHistory";
import { KLING_MODELS, KlingModelId } from "./lib/kling-models";
import { IMAGE_MODELS } from "./lib/model-config";
import { socket } from "./lib/socket";

import { AuthModal } from "./components/AuthModal";
import { BindPhoneModal } from "./components/BindPhoneModal";
import { UserActionModal } from "./components/UserActionModal";
import { ProjectListModal } from "./components/ProjectListModal";
import { RechargeModal } from "./components/RechargeModal";
import { PostViewModal } from "./components/PostViewModal";
import { CreditsModal } from "./components/CreditsModal";
import { MessagesPanel } from "./components/MessagesPanel";
import { BroadcastBanner } from "./components/BroadcastBanner";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { LandingPage } from "./components/LandingPage";
import { EditProfileModal } from "./components/EditProfileModal";
import { AccountManagementModal } from "./components/AccountManagementModal";

const AdminPanel = React.lazy(() =>
  import("./components/AdminPanel").then((m) => ({ default: m.AdminPanel })),
);
import { PublicProfileModal } from "./components/PublicProfileModal";
import { ActivityDetailModal } from "./components/ActivityDetailModal";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const extractApiError = (
  res: Response,
  data: any,
  text: string,
  context: string,
) => {
  if (
    !res.ok ||
    data?.error ||
    (data?.code !== undefined && data?.code !== 0)
  ) {
    let errorMsg = `${context} failed`;
    if (res.status) errorMsg += ` (HTTP ${res.status})`;

    const apiMsg =
      data?.error?.message || data?.message || data?.error_msg || data?.msg;
    const apiCode = data?.error?.code || data?.code;
    const apiDetails = data?.error?.details || data?.details;

    if (apiMsg) {
      errorMsg += `: ${apiMsg}`;
    } else if (typeof data?.error === "string") {
      errorMsg += `: ${data.error}`;
    } else if (text && !apiMsg) {
      errorMsg += `: ${text.substring(0, 150)}...`;
    }

    if (apiCode) errorMsg += ` [Code: ${apiCode}]`;
    if (apiDetails) {
      try {
        errorMsg += ` - Details: ${typeof apiDetails === "object" ? JSON.stringify(apiDetails) : apiDetails}`;
      } catch (e) {}
    }

    return new Error(errorMsg);
  }
  return null;
};

export const parseDataUri = (uri: string) => {
  let finalBase64 = uri;
  let finalMime = "image/png";
  if (typeof uri === "string" && uri.startsWith("data:")) {
    const idx = uri.indexOf(",");
    if (idx !== -1) {
      const header = uri.substring(0, idx);
      finalBase64 = uri.substring(idx + 1).replace(/[\r\n\s]+/g, "");
      const mimeMatch = header.match(/data:([^;]+)/);
      const rawMime = mimeMatch ? mimeMatch[1] : "image/png";
      finalMime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
    }
  } else if (typeof uri === "string" && uri.includes(",")) {
    finalBase64 = uri.substring(uri.indexOf(",") + 1).replace(/[\r\n\s]+/g, "");
  } else if (typeof uri === "string") {
    finalBase64 = uri.replace(/[\r\n\s]+/g, "");
  }
  return { mimeType: finalMime, data: finalBase64 };
};

let lastCursorEmitTimestamp = 0;

export default function App() {
  const [viewMode, setViewMode] = useState<"node" | "video">("node");
  const canvasOnly = isCanvasOnlyMode();
  const projectsLocal = shouldStoreProjectsLocally();
  const [view, setView] = useState<"landing" | "canvas">(
    canvasOnly ? "canvas" : "landing",
  );
  const [desktopScreen, setDesktopScreen] = useState<"home" | "canvas">("home");
  const [showNewProjectSaveDialog, setShowNewProjectSaveDialog] =
    useState(false);
  const [script, setScript] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("未命名原型");
  const [jepowKey, setJepowKey] = useState("");
  const [jepowBaseUrl, setJepowBaseUrl] = useState(
    `${getAppOrigin()}/api/jepow-proxy`,
  );
  const [textModel, setTextModel] = useState("deepseek-chat");
  const [imageModel, setImageModel] = useState(
    "gemini-3.1-flash-image-preview",
  );
  const [klingAccessKey, setKlingAccessKey] = useState("");
  const [klingSecretKey, setKlingSecretKey] = useState("");

  const [hasApiKey, setHasApiKey] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [canvasColor, setCanvasColor] = useState<string>("#3b3d40");
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showAccountManagementModal, setShowAccountManagementModal] =
    useState(false);
  const [activeChatUser, setActiveChatUser] = useState<string | null>(null);

  // --- Navigation Stack for "Return to previous level" ---
  const [navStack, setNavStack] = useState<
    {
      type:
        | "profile"
        | "post"
        | "messages"
        | "credits"
        | "admin"
        | "projects"
        | "activity";
      data?: any;
    }[]
  >([]);

  const pushView = useCallback(
    (
      type:
        | "profile"
        | "post"
        | "messages"
        | "credits"
        | "admin"
        | "projects"
        | "activity",
      data?: any,
    ) => {
      if (canvasOnly && type !== "projects") {
        openJepowWeb(DESKTOP_WEB_PATHS[type] || "/");
        return;
      }
      // Only clear states for other types to prevent flickering
      if (type !== "profile") setShowPublicProfile(null);
      if (type !== "post") setViewingPost(null);
      if (type !== "activity") setViewingActivity(null);
      if (type !== "messages") setShowMessagesPanel(false);
      if (type !== "credits") setShowCreditsModal(false);
      if (type !== "admin") setShowAdminPanel(false);
      if (type !== "projects") setShowProjectList(false);
      if (type !== "messages") setActiveChatUser(null);

      setNavStack((prev) => [...prev, { type, data }]);

      // Actually show the new one
      if (type === "profile") setShowPublicProfile(data);
      if (type === "post") setViewingPost(data);
      if (type === "activity") setViewingActivity(data);
      if (type === "messages") {
        setShowMessagesPanel(true);
        if (typeof data === "string") setActiveChatUser(data);
        else if (data?.userId) setActiveChatUser(data.userId);
      }
      if (type === "credits") setShowCreditsModal(true);
      if (type === "admin") setShowAdminPanel(true);
      if (type === "projects") setShowProjectList(true);
    },
    [canvasOnly],
  );

  const replaceView = useCallback(
    (
      type:
        | "profile"
        | "post"
        | "messages"
        | "credits"
        | "admin"
        | "projects"
        | "activity",
      data?: any,
    ) => {
      if (canvasOnly && type !== "projects") {
        openJepowWeb(DESKTOP_WEB_PATHS[type] || "/");
        return;
      }
      // Only clear states for other types to prevent flickering
      if (type !== "profile") setShowPublicProfile(null);
      if (type !== "post") setViewingPost(null);
      if (type !== "activity") setViewingActivity(null);
      if (type !== "messages") setShowMessagesPanel(false);
      if (type !== "credits") setShowCreditsModal(false);
      if (type !== "admin") setShowAdminPanel(false);
      if (type !== "projects") setShowProjectList(false);
      if (type !== "messages") setActiveChatUser(null);

      setNavStack((prev) => {
        const newStack = [...prev];
        if (newStack.length > 0) {
          newStack[newStack.length - 1] = { type, data };
        } else {
          newStack.push({ type, data });
        }
        return newStack;
      });

      // Actually show the new one
      if (type === "profile") setShowPublicProfile(data);
      if (type === "post") setViewingPost(data);
      if (type === "activity") setViewingActivity(data);
      if (type === "messages") {
        setShowMessagesPanel(true);
        if (typeof data === "string") setActiveChatUser(data);
        else if (data?.userId) setActiveChatUser(data.userId);
      }
      if (type === "credits") setShowCreditsModal(true);
      if (type === "admin") setShowAdminPanel(true);
      if (type === "projects") setShowProjectList(true);
    },
    [canvasOnly],
  );
  const popView = useCallback(() => {
    setNavStack((prev) => {
      // Close all regardless
      setShowPublicProfile(null);
      setViewingPost(null);
      setViewingActivity(null);
      setShowMessagesPanel(false);
      setShowCreditsModal(false);
      setShowAdminPanel(false);
      setShowProjectList(false);
      setActiveChatUser(null);

      if (prev.length <= 1) {
        return [];
      }

      const nextStack = prev.slice(0, -1);
      const last = nextStack[nextStack.length - 1];

      // Restore last
      if (last.type === "profile") setShowPublicProfile(last.data);
      if (last.type === "post") setViewingPost(last.data);
      if (last.type === "activity") setViewingActivity(last.data);
      if (last.type === "messages") {
        setShowMessagesPanel(true);
        if (typeof last.data === "string") setActiveChatUser(last.data);
        else if (last.data?.userId) setActiveChatUser(last.data.userId);
      }
      if (last.type === "credits") setShowCreditsModal(true);
      if (last.type === "admin") setShowAdminPanel(true);
      if (last.type === "projects") setShowProjectList(true);

      return nextStack;
    });
  }, []);

  // Utility to clear stack (e.g. going back to main canvas)
  const resetNav = useCallback(() => {
    setNavStack([]);
    setShowPublicProfile(null);
    setViewingPost(null);
    setViewingActivity(null);
    setShowMessagesPanel(false);
    setShowCreditsModal(false);
    setShowAdminPanel(false);
    setShowProjectList(false);
    setActiveChatUser(null);
  }, []);

  const updateCurrentViewData = useCallback((newData: any) => {
    setNavStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const current = next[next.length - 1];
      const mergedData =
        typeof current.data === "object" && current.data !== null
          ? { ...current.data, ...newData }
          : newData;
      next[next.length - 1] = { ...current, data: mergedData };
      return next;
    });
  }, []);

  useEffect(() => {
    // Call analytics endpoint
    api.post("/analytics/visit").catch(() => {});
  }, []);

  const [nodes, setNodes] = useState<Node[]>(() => {
    try {
      // First try to load user-specific state if possible (though we don't have user object yet)
      // We will re-read when user mounts but for initial state:
      const savedUser =
        localStorage.getItem(
          "ais-nodes-" + (localStorage.getItem("ais-token") ? "auth" : "guest"),
        ) || localStorage.getItem("ais-nodes");
      const parsed = savedUser ? JSON.parse(savedUser) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Error parsing nodes from localStorage:", e);
      return [];
    }
  });
  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const [edges, setEdges] = useState<Edge[]>(() => {
    try {
      const savedUser =
        localStorage.getItem(
          "ais-edges-" + (localStorage.getItem("ais-token") ? "auth" : "guest"),
        ) || localStorage.getItem("ais-edges");
      const parsed = savedUser ? JSON.parse(savedUser) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Error parsing edges from localStorage:", e);
      return [];
    }
  });

  useEffect(() => {
    try {
      const uid = user?.id || "guest";
      localStorage.setItem(`ais-nodes-${uid}`, JSON.stringify(nodes));
      localStorage.setItem(`ais-edges-${uid}`, JSON.stringify(edges));
      if (currentProjectId) {
        localStorage.setItem(`ais-project-id-${uid}`, currentProjectId);
      } else {
        localStorage.removeItem(`ais-project-id-${uid}`);
      }
      localStorage.setItem(
        `ais-project-name-${uid}`,
        projectName || "未命名原型",
      );
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" ||
          e.name === "NS_ERROR_DOM_QUOTA_REACHED")
      ) {
        console.warn(
          "LocalStorage quota exceeded. Changes might not be saved.",
        );
        // Optionally notify the user via toast, but we need to be careful not to spam
      } else {
        console.error("Error saving to localStorage:", e);
      }
    }
  }, [nodes, edges, currentProjectId, projectName]);

  const [cursors, setCursors] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const shots = useMemo(() => {
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter(
        (n) => n && (n.type === "imageShotNode" || n.type === "videoShotNode"),
      )
      .map((n) => n.data?.shot as Shot)
      .filter(Boolean);
  }, [nodes]);

  const isRemoteUpdate = useRef(false);
  const lastStateTimestamp = useRef<number>(Date.now());
  const lastReceivedTimestamp = useRef<number>(0);
  const generatingShotsRef = useRef<Set<string>>(new Set());
  const generatingShotProjectMap = useRef<Map<string, string | null>>(
    new Map(),
  );
  const currentProjectRef = useRef<string | null>(currentProjectId);

  useEffect(() => {
    currentProjectRef.current = currentProjectId;
  }, [currentProjectId]);

  useEffect(() => {
    socket.on("init_state", (state) => {
      if (state.projectId !== currentProjectRef.current) return;
      if (state.nodes?.length > 0) {
        // Only accept if it's actually newer or our local state is essentially empty
        if (
          (state.lastUpdated || 0) > lastStateTimestamp.current ||
          nodesRef.current.length === 0
        ) {
          isRemoteUpdate.current = true;
          lastReceivedTimestamp.current = state.lastUpdated || 0;
          lastStateTimestamp.current = state.lastUpdated || Date.now();
          setNodes(state.nodes || []);
          setEdges(state.edges || []);
          // Use a longer timeout to ensure all components see the flag during their render cycle
          setTimeout(() => {
            isRemoteUpdate.current = false;
          }, 200);
        }
      }
    });

    socket.on("state_updated", (state) => {
      if (state.projectId !== currentProjectRef.current) return;
      // Only update if the incoming state is strictly newer than our local state
      if (
        !state.lastUpdated ||
        state.lastUpdated <= lastStateTimestamp.current
      ) {
        return;
      }

      // If we are currently the ones generating changes (e.g. dragging), we might want to be careful
      // but for now, the source-of-truth from server wins if it's newer.

      isRemoteUpdate.current = true;
      lastReceivedTimestamp.current = state.lastUpdated;
      lastStateTimestamp.current = state.lastUpdated;
      setNodes(state.nodes || []);
      setEdges(state.edges || []);
      setTimeout(() => {
        isRemoteUpdate.current = false;
      }, 200);
    });

    socket.on("cursor_moved", (cursor) => {
      setCursors((prev) => ({
        ...prev,
        [cursor.id]: { x: cursor.x, y: cursor.y },
      }));
    });

    socket.on("cursor_removed", (id) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on("site_config_updated", (config) => {
      setSiteConfig(config);
    });

    socket.on("user_profile_updated", (data) => {
      // Update current logged-in user if it matches
      setUser((prev) => {
        if (prev && String(prev.id) === String(data.userId)) {
          const { password: _, ...safeUser } = data.user;
          const updated = { ...prev, ...safeUser };
          localStorage.setItem("ais-user", JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    });

    socket.on("credits_updated", (data: { credits: number }) => {
      setUser((prev) => (prev ? { ...prev, credits: data.credits } : null));
      fetchTransactions();
    });

    socket.on("projects_updated", () => {
      if (projectsLocal) return;
      api
        .get("/projects/list")
        .then((res) => setCloudProjects(res.data))
        .catch(console.error);
    });

    socket.on(
      "follow_changed",
      (data: {
        followerId: string;
        followingId: string;
        isFollowing: boolean;
      }) => {
        setUser((prev) => {
          if (!prev || String(prev.id) !== String(data.followerId)) return prev;

          const following = Array.isArray(prev.following)
            ? [...prev.following]
            : [];
          if (data.isFollowing) {
            if (!following.includes(data.followingId)) {
              following.push(data.followingId);
            }
          } else {
            const index = following.indexOf(data.followingId);
            if (index > -1) {
              following.splice(index, 1);
            }
          }

          return {
            ...prev,
            following,
            followingCount: following.length,
          };
        });
      },
    );

    return () => {
      socket.off("init_state");
      socket.off("state_updated");
      socket.off("cursor_moved");
      socket.off("cursor_removed");
      socket.off("site_config_updated");
      socket.off("user_profile_updated");
      socket.off("credits_updated");
      socket.off("projects_updated");
      socket.off("follow_changed");
    };
  }, []);

  // Keyboard listener for 'X' to toggle collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't toggle if typing in an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === "x") {
        setIsCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Emit state changes
  useEffect(() => {
    if (isRemoteUpdate.current) {
      return;
    }

    // Immediately update local timestamp to protect against incoming old states during debounce
    const currentLocalTimestamp = Date.now();
    lastStateTimestamp.current = currentLocalTimestamp;

    // Debounce the emit to avoid flooding the server
    const timeoutId = setTimeout(() => {
      // Check if we actually have nodes/edges to send
      if (nodes.length === 0) return;

      const now = Date.now();
      // Ensure we don't send an older state if we somehow received a newer one during debounce
      if (now <= lastReceivedTimestamp.current) return;

      lastStateTimestamp.current = now;
      socket.emit("update_state", {
        projectId: currentProjectRef.current,
        nodes,
        edges,
        lastUpdated: now,
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [nodes, edges]);

  // Reset remote update flag is now handled in the socket listeners directly.

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showNewProjectConfirm, setShowNewProjectConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTransferMenu, setShowTransferMenu] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<any | null>(null);

  // --- User & Cloud State ---
  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const saved = localStorage.getItem("ais-user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error parsing user from localStorage:", e);
      return null;
    }
  });

  useEffect(() => {
    if (user?.id) {
      const handleConnect = () => {
        socket.emit("authenticate", user.id);
      };

      if (socket.connected) {
        handleConnect();
      }

      socket.on("connect", handleConnect);
      return () => {
        socket.off("connect", handleConnect);
      };
    }
  }, [user?.id]);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("ais-token"),
  );
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDesktopDownloadPrompt, setShowDesktopDownloadPrompt] =
    useState(false);
  const [desktopAuthPending, setDesktopAuthPending] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [selectedRechargePkg, setSelectedRechargePkg] = useState<any>(null);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showPublicProfile, setShowPublicProfile] = useState<string | null>(
    null,
  );
  const [viewingPost, setViewingPost] = useState<any>(null);
  const [viewingActivity, setViewingActivity] = useState<any>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsTab, setCreditsTab] = useState<"recharge" | "history">(
    "recharge",
  );
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [triggerUpload, setTriggerUpload] = useState(false);
  const [siteConfig, setSiteConfig] = useState<any>(null);

  const fetchTransactions = async () => {
    if (!localStorage.getItem("ais-token")) return;
    setLoadingTransactions(true);
    try {
      const res = await api.get("/user/transactions");
      setTransactions(res.data);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    if (showCreditsModal) {
      fetchTransactions();
    }
  }, [showCreditsModal]);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Isolate local storage per user port
  useEffect(() => {
    const uid = user?.id || "guest";

    // Attempt to load per-user state
    try {
      const savedNodes = localStorage.getItem(`ais-nodes-${uid}`);
      if (savedNodes) {
        const parsed = JSON.parse(savedNodes);
        if (Array.isArray(parsed) && parsed.length > 0) setNodes(parsed);
        else setNodes([]);
      } else setNodes([]);

      const savedEdges = localStorage.getItem(`ais-edges-${uid}`);
      if (savedEdges) {
        const parsed = JSON.parse(savedEdges);
        if (Array.isArray(parsed) && parsed.length > 0) setEdges(parsed);
        else setEdges([]);
      } else setEdges([]);

      const savedProjectId = localStorage.getItem(`ais-project-id-${uid}`);
      setCurrentProjectId(savedProjectId || null);

      const savedProjectName = localStorage.getItem(`ais-project-name-${uid}`);
      setProjectName(savedProjectName || "未命名原型");
    } catch (err) {
      console.warn("Failed to load isolated storage", err);
    }
  }, [user?.id]); // Note: This runs on login/logout

  const [isInvitationVerified, setIsInvitationVerified] = useState(() => {
    return localStorage.getItem("ais-invitation-verified") === "true";
  });
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [invitationCode, setInvitationCode] = useState("");
  const [isVerifyingInv, setIsVerifyingInv] = useState(false);

  const handleVerifyInvitation = async () => {
    if (!invitationCode.trim()) {
      toast.error("请输入邀请码");
      return;
    }
    setIsVerifyingInv(true);
    try {
      await api.post("/invitations/verify", { code: invitationCode });
      setIsInvitationVerified(true);
      localStorage.setItem("ais-invitation-verified", "true");
      setShowInvitationModal(false);
      toast.success("邀请码验证成功。欢迎加入。");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "验证失败");
    } finally {
      setIsVerifyingInv(false);
    }
  };
  const [profileData, setProfileData] = useState({
    name: "",
    bio: "",
    avatar: "",
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.username || "OPERATOR",
        bio: user.bio || "IDENTITY_DATA_NULL_UNDEFINED...",
        avatar: user.avatar || "https://picsum.photos/seed/avatar/200/200",
      });
    }
  }, [user]);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);

  useEffect(() => {
    (window as any).jepowKey = jepowKey;
    (window as any).jepowBaseUrl = jepowBaseUrl;
  }, [jepowKey, jepowBaseUrl]);

  // Fetch global config on mount to populate jepowKey and jepowBaseUrl
  useEffect(() => {
    const fetchGlobalConfig = async () => {
      if (!token) return;
      try {
        const res = await api.get("/admin/config", { showToast: false } as any);
        if (res.data) {
          if (res.data.geminiApiKey && !jepowKey) {
            setJepowKey(res.data.geminiApiKey);
          }
          if (res.data.geminiBaseUrl && !jepowBaseUrl) {
            setJepowBaseUrl(res.data.geminiBaseUrl);
          }
        }
      } catch (err) {
        // Silently fail if not admin or error
        console.log("Failed to fetch global config (likely not admin)");
      }
    };
    fetchGlobalConfig();
  }, [token]);

  useEffect(() => {
    if (siteConfig) {
      if (siteConfig.name) {
        document.title = siteConfig.name;
      }

      const icons = document.querySelectorAll(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
      );
      const targetIconUrl = siteConfig.favicon || siteConfig.logo;
      if (icons.length > 0 && targetIconUrl) {
        icons.forEach((icon) => {
          icon.setAttribute("href", targetIconUrl);
          icon.removeAttribute("type");
        });
      } else if (targetIconUrl) {
        // Fallback: create if not exists
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = targetIconUrl;
        document.head.appendChild(link);
      }
    }
  }, [siteConfig]);

  const fetchSiteConfig = useCallback(async () => {
    try {
      const res = await api.get("/site-config");
      setSiteConfig(res.data);
    } catch (err) {
      console.error("Failed to fetch site config:", err);
    }
  }, []);

  useEffect(() => {
    fetchSiteConfig();
  }, [fetchSiteConfig]);

  useEffect(() => {
    if (!canvasOnly && isDesktopLoginOnWeb()) {
      setShowAuthModal(true);
    }
  }, [canvasOnly]);

  const applyAuthSession = useCallback(
    (userData: UserData, authToken: string) => {
      setUser(userData);
      setToken(authToken);
      localStorage.setItem("ais-token", authToken);
      localStorage.setItem("ais-user", JSON.stringify(userData));
      setDesktopAuthPending(false);
      setShowAuthModal(false);
      if (canvasOnly) {
        setDesktopScreen("home");
        setView("canvas");
      }
      toast.success(`欢迎回来，${userData.username}`);
    },
    [canvasOnly],
  );

  useEffect(() => {
    if (!canvasOnly || !window.jepowDesktop?.onAuth) return;
    window.jepowDesktop.onAuth(({ token: authToken, user: userData }) => {
      applyAuthSession(userData as unknown as UserData, authToken);
    });
  }, [canvasOnly, applyAuthSession]);

  useEffect(() => {
    if (token) {
      try {
        localStorage.setItem("ais-token", token);
      } catch (e) {
        console.warn("Failed to save token to localStorage:", e);
      }
      fetchProfile();
    } else {
      localStorage.removeItem("ais-token");
    }
  }, [token]);

  useEffect(() => {
    if (canvasOnly && desktopScreen === "home" && token) {
      fetchProfile();
    }
  }, [canvasOnly, desktopScreen, token]);

  const fetchProjects = useCallback(async () => {
    if (!user?.id) return;
    try {
      if (projectsLocal) {
        setCloudProjects(await listLocalProjects(user.id));
      } else {
        const res = await api.get("/projects/list");
        setCloudProjects(res.data);
      }
    } catch (err) {
      console.error("Fetch projects failed:", err);
    }
  }, [user?.id, projectsLocal]);

  useEffect(() => {
    if (user?.id) fetchProjects();
  }, [user?.id, fetchProjects]);

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem("ais-user", JSON.stringify(user));
      } catch (e) {
        console.warn("Failed to save user to localStorage:", e);
      }
    } else {
      localStorage.removeItem("ais-user");
    }
  }, [user]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setToken(null);
      setNodes([]);
      setEdges([]);
      setCurrentProjectId(null);
      setProjectName("未命名原型");
      localStorage.removeItem("ais-user");
      localStorage.removeItem("ais-token");
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/user/profile");
      setUser(res.data);
      localStorage.setItem("ais-user", JSON.stringify(res.data));
    } catch (err) {
      console.error("Fetch profile failed:", err);
      // api interceptor handles 401
    }
  };

  const handleUpdateProfile = async (data: {
    name: string;
    bio: string;
    avatar: string;
    industry?: string;
    coverUrl?: string;
  }) => {
    try {
      const res = await api.post("/user/profile", {
        username: data.name,
        bio: data.bio,
        avatar: data.avatar,
        industry: data.industry,
        coverUrl: data.coverUrl,
      });
      setUser(res.data.user);
      toast.success("个人资料已同步");
    } catch (err) {
      console.error("Update profile failed:", err);
    }
  };

  const handleRecharge = async (userData?: UserData) => {
    if (userData) {
      setUser(userData);
    } else {
      await fetchProfile();
    }
  };

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const isSavingRef = useRef(false);

  const handleCloudSave = useCallback(
    async (
      isAuto = false,
      specificNodes?: Node[],
      specificEdges?: Edge[],
      specificProjectId?: string | null,
    ) => {
      if (!token) {
        if (!isAuto) setShowAuthModal(true);
        return null;
      }

      if (isSavingRef.current) return null;

      isSavingRef.current = true;
      setSaveStatus("saving");

      const savingNodes = specificNodes || nodes;
      const savingEdges = specificEdges || edges;
      const projectData = {
        nodes: savingNodes,
        edges: savingEdges,
        canvasColor,
      };

      // Extract thumbnail from nodes
      const firstMediaNode = savingNodes.find(
        (n: any) =>
          (n.type === "mediaNode" && n.data?.url) ||
          (n.type === "imageShotNode" && (n.data?.shot as any)?.imageUrl) ||
          (n.type === "videoShotNode" && (n.data?.shot as any)?.videoUrl) ||
          (n.type === "imageNode" && n.data?.url) ||
          (n.type === "videoProjectNode" &&
            n.data?.incomingVideos &&
            (n.data.incomingVideos as string[]).length > 0),
      );
      let thumbnail = "";
      if (firstMediaNode) {
        if (firstMediaNode.type === "videoProjectNode") {
          thumbnail = (firstMediaNode.data.incomingVideos as string[])[0] || "";
        } else {
          thumbnail =
            ((firstMediaNode.data?.url ||
              (firstMediaNode.data?.shot as any)?.imageUrl ||
              (firstMediaNode.data?.shot as any)?.videoUrl) as string) || "";
        }
      }

      try {
        const savingId =
          specificProjectId !== undefined
            ? specificProjectId
            : currentProjectRef.current || currentProjectId;

        // If auto-saving an unnamed/empty draft project, don't ping the server
        const hasSubstantialContent =
          savingNodes.some(
            (n: any) =>
              n.type === "mediaNode" ||
              n.type === "imageNode" ||
              n.type === "photoEditorNode" ||
              n.type === "videoProjectNode" ||
              n.type === "imageEditorNode" ||
              ((n.type === "imageShotNode" || n.type === "videoShotNode") &&
                (n.data?.shot as any)?.status !== "pending"),
          ) || savingNodes.length >= 3;

        if (isAuto && !savingId && !hasSubstantialContent) {
          isSavingRef.current = false;
          setSaveStatus("idle");
          return null;
        }

        const payload = {
          id: savingId || undefined,
          name: projectName || "未命名原型",
          data: projectData,
          thumbnail,
        };

        if (projectsLocal && user?.id) {
          const resData = await saveLocalProject(user.id, {
            id: payload.id,
            name: payload.name,
            data: projectData,
            thumbnail,
          });
          const isStillEditingSameProject =
            savingId === currentProjectRef.current ||
            (savingId === undefined && currentProjectRef.current === null);
          if (
            isStillEditingSameProject &&
            resData.id &&
            specificProjectId === undefined &&
            resData.id !== currentProjectRef.current
          ) {
            currentProjectRef.current = resData.id;
            setCurrentProjectId(resData.id);
            if (user) {
              localStorage.setItem(`ais-project-id-${user.id}`, resData.id);
              localStorage.setItem(
                `ais-project-name-${user.id}`,
                payload.name,
              );
            }
          }
          if (!isAuto) toast.success("工程已保存到本机");
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
          isSavingRef.current = false;
          await fetchProjects();
          return resData;
        }

        // Use robust HTTP REST API for project saving, since Nginx/Express are configured for 500MB payload limit, bypassing the need for WebSocket which drops connections
        const res = await api.post("/projects/save", payload);
        const resData = res.data;

        if (resData) {
          // Only update current project ID if we haven't loaded a different project while saving
          const isStillEditingSameProject =
            savingId === currentProjectRef.current ||
            (savingId === undefined && currentProjectRef.current === null);

          if (
            isStillEditingSameProject &&
            resData.id &&
            specificProjectId === undefined &&
            resData.id !== currentProjectRef.current
          ) {
            currentProjectRef.current = resData.id;
            setCurrentProjectId(resData.id);
          }
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }
        isSavingRef.current = false;
        return resData;
      } catch (err: any) {
        console.error("Cloud save via API failed:", err);

        // Handle project deleted on server
        if (err.response?.status === 404 && err.response?.data?.deleted) {
          toast.error("该工程已被同步删除。已重置工作区。");
          setProjectName("未命名原型");
          setNodes([]);
          setEdges([]);
          setCurrentProjectId(null);
          currentProjectRef.current = null;
          if (user) {
            localStorage.removeItem(`ais-nodes-${user.id}`);
            localStorage.removeItem(`ais-edges-${user.id}`);
            localStorage.removeItem(`ais-project-id-${user.id}`);
            localStorage.removeItem(`ais-project-name-${user.id}`);
          }
        } else {
          if (!isAuto) toast.error("网络连接超时或同步失败，请重试");
        }

        setSaveStatus("idle");
        isSavingRef.current = false;
        return null;
      }
    },
    [
      token,
      nodes,
      edges,
      canvasColor,
      currentProjectId,
      projectName,
      projectsLocal,
      user,
      fetchProjects,
    ],
  );

  // Ctrl+S Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleCloudSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloudSave]);

  const handleLoadCloudProject = async (id: string) => {
    if (!canUseInfiniteCanvas()) {
      setShowDesktopDownloadPrompt(true);
      return;
    }
    if (!user) {
      if (canvasOnly) setDesktopAuthPending(true);
      else setShowAuthModal(true);
      return;
    }

    if (currentProjectId) {
      handleCloudSave(false).catch(console.error);
    }

    if (
      siteConfig?.infiniteCanvasEnabled === false &&
      user.role !== "admin" &&
      user.role !== "super_admin"
    ) {
      if (siteConfig?.isByInvitationOnly && !isInvitationVerified) {
        setShowInvitationModal(true);
        return;
      }
      toast.error(
        siteConfig?.infiniteCanvasClosedMessage || "系统维护中：请稍后重试",
      );
      return;
    }

    try {
      const project = projectsLocal
        ? await loadLocalProject(user.id, id)
        : (await api.get(`/projects/${id}`)).data;

      if (project && project.data) {
        setNodes((project.data.nodes || []) as Node[]);
        setEdges((project.data.edges || []) as Edge[]);
        setCanvasColor(
          project.data.canvasColor && project.data.canvasColor !== "#ffffff"
            ? project.data.canvasColor
            : "#3b3d40",
        );
        setCurrentProjectId(project.id);
        currentProjectRef.current = project.id;
        setProjectName(project.name);
        setShowProjectList(false);
        setDesktopScreen("canvas");
        setView("canvas");

        toast.success(
          projectsLocal
            ? `已从本机加载: ${project.name}`
            : `数据流已加载: ${project.name}`,
        );
        if (reactFlowInstance) {
          setTimeout(
            () =>
              reactFlowInstance.fitView({
                padding: 0.5,
                duration: 800,
                minZoom: 0.01,
              }),
            100,
          );
        }
      } else {
        toast.error("工程序列解析失败");
      }
    } catch (err) {
      console.error("Load cloud project failed:", err);
      toast.error("获取序列失败");
    }
  };

  const handleDeleteCloudProject = async (id: string) => {
    setProjectToDelete(id);
  };

  const handleRenameCloudProject = async (id: string, newName: string) => {
    try {
      if (projectsLocal && user?.id) {
        await renameLocalProject(user.id, id, newName);
      } else {
        await api.put(`/projects/${id}/name`, { name: newName });
      }
      await fetchProjects();
      if (currentProjectId === id) {
        setProjectName(newName);
      }
      toast.success("标识更新成功");
    } catch (err) {
      console.error("Rename project failed:", err);
      toast.error("标识符重写失败");
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      if (projectsLocal && user?.id) {
        await deleteLocalProject(user.id, projectToDelete);
      } else {
        await api.delete(`/projects/${projectToDelete}`);
      }
      await fetchProjects();
      if (currentProjectId === projectToDelete) {
        currentProjectRef.current = null;
        setCurrentProjectId(null);
        setProjectName("UNTITLED_PROTO");
        setNodes([]);
        setEdges([]);
        localStorage.removeItem(`ais-nodes-${user?.id || "guest"}`);
        localStorage.removeItem(`ais-edges-${user?.id || "guest"}`);
        localStorage.removeItem(`ais-project-id-${user?.id || "guest"}`);
        localStorage.removeItem(`ais-project-name-${user?.id || "guest"}`);
        if (canvasOnly) setDesktopScreen("home");
      }
      toast.success("清理序列完成。云端数据已移除。");
      setProjectToDelete(null);
    } catch (err: any) {
      console.error("Delete project failed:", err);
      const errorMsg =
        err.response?.data?.error ||
        "PURGE_INTERRUPTED_FAILURE. RETRY_SEQUENCE.";
      toast.error(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveProject = useCallback(async () => {
    try {
      // ACQUIRE LATEST CONTEXT_STATE
      const project = {
        nodes,
        edges,
        canvasColor,
        timestamp: Date.now(),
        version: "1.0",
      };

      // ENCAPSULATION & CRYPTO: JSON -> BASE64 -> APPEND_PLATFORM_HEADER
      const jsonString = JSON.stringify(project);
      const encryptedData =
        "AIS_PROPRIETARY_WORKFLOW_V1_SECURE_DATA_BLOCK:" +
        btoa(unescape(encodeURIComponent(jsonString)));

      // FALLBACK TO LEGACY DOWNLOAD_SEQUENCE (IFRAME_RESTRICTION_BYPASS)
      const blob = new Blob([encryptedData], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `project-${new Date().toISOString().split("T")[0]}.AI.json`;

      // APPEND LINK TO DOM_TREE TO INITIATE TRIGGER
      document.body.appendChild(link);
      link.click();

      // TEMPORAL DELAY FOR RESOURCE_DEALLOCATION
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      toast.success("项目已加密并导出", {
        description: "桌面主格式为 .AI 文件夹；此为单文件快照备份",
      });
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("IO 导出错误", {
        description: "请验证权限或重试",
      });
    }
  }, [nodes, edges, canvasColor]);

  const handleLoadProject = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!user) {
        setShowAuthModal(true);
        e.target.value = "";
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const rawData = event.target?.result as string;

          // VERIFY_HEADER_SIGNATURE
          if (
            !rawData.startsWith(
              "AIS_PROPRIETARY_WORKFLOW_V1_SECURE_DATA_BLOCK:",
            )
          ) {
            throw new Error(
              "UNRECOGNIZED_FORMAT: CORRUPT_OR_FOREIGN_DATA_DETECTED.",
            );
          }

          // DECRYPT & PARSE_STREAM
          const base64Data = rawData.replace(
            "AIS_PROPRIETARY_WORKFLOW_V1_SECURE_DATA_BLOCK:",
            "",
          );
          const jsonString = decodeURIComponent(escape(atob(base64Data)));
          const project = JSON.parse(jsonString);

          if (project.nodes && project.edges) {
            setNodes(project.nodes);
            setEdges(project.edges);
            if (project.canvasColor) {
              setCanvasColor(project.canvasColor === "#ffffff" ? "#3b3d40" : project.canvasColor);
            }

            toast.success("项目已恢复稳定", {
              description: `RESTORED: ${project.nodes.length} NODES | ${project.edges.length} LINKS`,
            });

            if (reactFlowInstance) {
              setTimeout(
                () =>
                  reactFlowInstance.fitView({
                    padding: 0.5,
                    duration: 800,
                    minZoom: 0.01,
                    maxZoom: 1,
                  }),
                100,
              );
            }
          }
        } catch (err) {
          console.error("Failed to load project:", err);
          toast.error("IO 导入错误", {
            description: err instanceof Error ? err.message : "数据语法错误",
          });
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [reactFlowInstance],
  );

  const handleConfirmNewProjectSave = useCallback(
    async ({
      name,
      filePath,
    }: {
      name: string;
      filePath: string;
    }) => {
      if (!user?.id) return;
      try {
        const result = await createLocalProjectAtPath(user.id, name, filePath);
        if (!result) {
          toast.error("请在桌面客户端中选择保存位置");
          return;
        }
        setNodes([]);
        setEdges([]);
        setCanvasColor("#3b3d40");
        setCurrentProjectId(result.record.id);
        currentProjectRef.current = result.record.id;
        setProjectName(result.record.name);
        setShowNewProjectSaveDialog(false);
        setDesktopScreen("canvas");
        setView("canvas");
        await fetchProjects();
        toast.success(`已创建: ${result.record.name}`);
        if (reactFlowInstance) {
          setTimeout(
            () =>
              reactFlowInstance.fitView({
                padding: 0.5,
                duration: 800,
                minZoom: 0.01,
                maxZoom: 1,
              }),
            100,
          );
        }
      } catch (e) {
        console.error(e);
        toast.error("创建工程失败");
      }
    },
    [user?.id, fetchProjects, reactFlowInstance],
  );

  const handleNewProject = useCallback(() => {
    if (!canUseInfiniteCanvas()) {
      setShowDesktopDownloadPrompt(true);
      setShowNewProjectConfirm(false);
      return;
    }
    if (!user) {
      if (canvasOnly) setDesktopAuthPending(true);
      else setShowAuthModal(true);
      setShowNewProjectConfirm(false);
      return;
    }

    if (canvasOnly && projectsLocal) {
      setShowNewProjectSaveDialog(true);
      setShowNewProjectConfirm(false);
      return;
    }

    // Check canvas access
    if (
      siteConfig?.infiniteCanvasEnabled === false &&
      user.role !== "admin" &&
      user.role !== "super_admin"
    ) {
      if (siteConfig?.isByInvitationOnly && !isInvitationVerified) {
        setShowInvitationModal(true);
        setShowNewProjectConfirm(false);
        return;
      }
      toast.error(
        siteConfig?.infiniteCanvasClosedMessage || "系统维护中：请稍后重试",
      );
      setShowNewProjectConfirm(false);
      return;
    }

    setNodes([]);
    setEdges([]);
    setCanvasColor("#3b3d40");
    currentProjectRef.current = null;
    setCurrentProjectId(null);
    setProjectName("未命名原型");
    localStorage.removeItem(`ais-nodes-${user?.id || "guest"}`);
    localStorage.removeItem(`ais-edges-${user?.id || "guest"}`);
    localStorage.removeItem(`ais-project-id-${user?.id || "guest"}`);
    localStorage.removeItem(`ais-project-name-${user?.id || "guest"}`);
    setShowNewProjectConfirm(false);
    setView("canvas");
    toast.success("已初始化空白项目");
    if (reactFlowInstance) {
      setTimeout(
        () =>
          reactFlowInstance.fitView({
            padding: 0.5,
            duration: 800,
            minZoom: 0.01,
            maxZoom: 1,
          }),
        100,
      );
    }
  }, [reactFlowInstance, user]);
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [shouldAutoLayout, setShouldAutoLayout] = useState(false);
  const [globalLayoutDirection, setGlobalLayoutDirection] = useState<
    "LR" | "TB" | "GRID"
  >("LR");
  const [paneContextMenu, setPaneContextMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const [lastPaneClickTime, setLastPaneClickTime] = useState(0);
  const [, setRadialMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get("/history", {
        params: { projectId: currentProjectId || "default" },
      });
      if (res.data && Array.isArray(res.data)) {
        setHistory(res.data);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, [token, currentProjectId]);

  useEffect(() => {
    if (user && token) {
      fetchHistory();
    }
  }, [user, token, fetchHistory]);

  const handleClearHistory = useCallback(async () => {
    // Optimistic update
    setHistory([]);

    // Persistent update
    if (token) {
      try {
        await api.delete("/history/clear", {
          params: { projectId: currentProjectId || "default" },
        });
        toast.success("历史记录已清空");
      } catch (err) {
        console.error("Failed to clear history on server:", err);
        toast.error("清空历史失败");
        fetchHistory(); // Restore if failed
      }
    }
  }, [token, fetchHistory, currentProjectId]);

  const addToHistory = useCallback(
    async (item: Omit<HistoryItem, "id" | "timestamp">) => {
      const newItem: HistoryItem = {
        ...item,
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: item.source || "generated",
      };

      let isDupe = false;
      setHistory((prev) => {
        // Final guard inside state update
        if (
          prev.some(
            (h) =>
              Math.abs(h.timestamp - newItem.timestamp) < 1000 &&
              h.url === newItem.url,
          )
        ) {
          isDupe = true;
          return prev;
        }
        return [newItem, ...prev].slice(0, 500); // Increased local limit
      });

      if (isDupe) return;
      if (history.some((h) => h.url === item.url)) return;

      // Persistent update
      if (token) {
        if (
          newItem.url &&
          newItem.url.startsWith("data:") &&
          newItem.url.length > 500000
        ) {
          // Skip huge base64 in history to prevent 413 payload too large
          return;
        }
        try {
          await api.post(
            "/history",
            { item: newItem, projectId: currentProjectId || "default" },
            { showToast: false } as any,
          );
        } catch (err) {
          console.error("Failed to save history item to server:", err);
        }
      }
    },
    [token, history, currentProjectId],
  );

  const handleSyncFromCanvas = useCallback(
    (silentArg: boolean | unknown = false) => {
      const silent = typeof silentArg === "boolean" ? silentArg : false;
      const itemsToSync: Omit<HistoryItem, "id" | "timestamp">[] = [];
      nodes.forEach((node) => {
        const shot = (node.data as any)?.shot as Shot;
        if (shot) {
          if (shot.imageUrl) {
            itemsToSync.push({
              type: "image",
              url: shot.imageUrl,
              prompt: shot.imagePrompt || shot.description || "Canvas Image",
            });
          }
          if (shot.imageUrls) {
            shot.imageUrls.forEach((url) => {
              itemsToSync.push({
                type: "image",
                url,
                prompt: shot.imagePrompt || shot.description || "Canvas Image",
              });
            });
          }
          if (shot.videoUrl) {
            itemsToSync.push({
              type: "video",
              url: shot.videoUrl,
              prompt: shot.imagePrompt || shot.description || "Canvas Video",
            });
          }
        } else if (
          node.type === "imageNode" ||
          node.type === "mediaNode" ||
          node.type === "photoEditorNode" ||
          node.type === "imageEditorNode"
        ) {
          const url = (node.data as any).url;
          if (url) {
            const type =
              node.type === "mediaNode" && (node.data as any).type === "video"
                ? "video"
                : "image";
            itemsToSync.push({
              type,
              url,
              prompt: (node.data as any).label || "Media Item",
            });
          }
        }
      });

      if (itemsToSync.length === 0) {
        if (!silent) toast.info("画布上没有发现可以同步的图像或视频");
        return;
      }

      // Filter out duplicates currently in history
      const existingUrls = new Set(history.map((h) => h.url));
      const newItemsToAdd = itemsToSync.filter(
        (item) => !existingUrls.has(item.url),
      );

      // Deduplicate within the items being synced themselves
      const uniqueNewItems: Omit<HistoryItem, "id" | "timestamp">[] = [];
      const seenNewUrls = new Set<string>();
      newItemsToAdd.forEach((item) => {
        if (!seenNewUrls.has(item.url)) {
          uniqueNewItems.push(item);
          seenNewUrls.add(item.url);
        }
      });

      if (uniqueNewItems.length === 0) {
        if (!silent) toast.info("所有画布内容已在历史记录中");
        return;
      }

      // Add them to history
      if (silent) {
        (async () => {
          const syncedUrls = new Set(history.map((h) => h.url));
          for (const item of uniqueNewItems) {
            if (!syncedUrls.has(item.url)) {
              await addToHistory(item);
              syncedUrls.add(item.url);
            }
          }
        })();
      } else {
        toast.promise(
          (async () => {
            const syncedUrls = new Set(history.map((h) => h.url));
            for (const item of uniqueNewItems) {
              if (!syncedUrls.has(item.url)) {
                await addToHistory(item);
                syncedUrls.add(item.url);
              }
            }
          })(),
          {
            loading: `正在同步 ${uniqueNewItems.length} 个项目...`,
            success: `成功同步 ${uniqueNewItems.length} 个项目到历史记录`,
            error: "部分项目同步失败",
          },
        );
      }
    },
    [nodes, history, addToHistory],
  );

  const [rightPanelMode, setRightPanelMode] = useState<"properties" | "ai">("properties");
  const [rightPanelWidth, setRightPanelWidth] = useState(304);
  const [rightPanelOutlinerHeight, setRightPanelOutlinerHeight] = useState(320);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renamingNodeLabel, setRenamingNodeLabel] = useState("");
  const [sceneRenameMenu, setSceneRenameMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    label: string;
  } | null>(null);
  const [collapsedSceneGroupIds, setCollapsedSceneGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeTopMenu, setActiveTopMenu] = useState<
    "file" | "edit" | "window" | "help" | null
  >(null);
  const [aiInput, setAiInput] = useState("");
  const [aiMode, setAiMode] = useState("自动识别");
  const [aiModelSelect, setAiModelSelect] = useState("自动分配");
  const [aiRatio, setAiRatio] = useState("16:9");
  const [aiRes, setAiRes] = useState("1K");
  const [aiDuration, setAiDuration] = useState("5s");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const aiPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sceneRenameMenu) return;
    const closeMenu = () => setSceneRenameMenu(null);
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("wheel", closeMenu, { passive: true });
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("wheel", closeMenu);
    };
  }, [sceneRenameMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isInside = event
        .composedPath()
        .some((node) => node === aiPanelRef.current);
      if (!isInside) {
        setShowAiChat(false);
      }
    };

    if (showAiChat) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [showAiChat]);
  const [aiMessages, setAiMessages] = useState<
    { role: "user" | "model"; content: string; referenceImages?: string[] }[]
  >([]);
  const [aiReferenceImages, setAiReferenceImages] = useState<string[]>([]);
  const [isSelectingAiReference, setIsSelectingAiReference] = useState(false);
  const [showAiReferenceMenu, setShowAiReferenceMenu] = useState(false);
  const [clipboard, setClipboard] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiMessages, isAiLoading]);

  const handleRightPanelResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = rightPanelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = startWidth - (moveEvent.clientX - startX);
        setRightPanelWidth(Math.min(560, Math.max(286, nextWidth)));
      };
      const handleMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [rightPanelWidth],
  );

  const handleOutlinerResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = rightPanelOutlinerHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextHeight = startHeight + (moveEvent.clientY - startY);
        setRightPanelOutlinerHeight(Math.min(460, Math.max(160, nextHeight)));
      };
      const handleMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [rightPanelOutlinerHeight],
  );

  useEffect(() => {
    const handleAddToHistory = (
      e: CustomEvent<Omit<HistoryItem, "id" | "timestamp">>,
    ) => {
      addToHistory(e.detail);
    };
    window.addEventListener(
      "add-to-history",
      handleAddToHistory as EventListener,
    );
    return () => {
      window.removeEventListener(
        "add-to-history",
        handleAddToHistory as EventListener,
      );
    };
  }, [addToHistory]);

  const createNodeViaAi = useCallback(
    (
      type: string,
      data: any,
      x?: number,
      y?: number,
      referenceUrls?: string[],
    ) => {
      const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      let position = { x: 100, y: 100 };
      if (x !== undefined && y !== undefined) {
        position = { x, y };
      } else if (reactFlowInstance) {
        const viewport = reactFlowInstance.getViewport();
        // Calculate center of viewport
        position = {
          x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
          y: (window.innerHeight / 2 - viewport.y) / viewport.zoom,
        };
      }

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          ...data,
          id,
          onDelete: (id: string) =>
            setNodes((nds) => nds.filter((node) => node.id !== id)),
        },
      };

      setNodes((nds) => [...nds, newNode]);

      if (referenceUrls && referenceUrls.length > 0) {
        setEdges((eds) => {
          const newEdges = [...eds];
          const currentNodes = reactFlowInstance
            ? reactFlowInstance.getNodes()
            : [];
          referenceUrls.forEach((url) => {
            const sourceNode = currentNodes.find((n) => {
              if (n.type === "imageNode" && (n.data as any).url === url)
                return true;
              if (
                (n.type === "imageShotNode" || n.type === "videoShotNode") &&
                ((n.data as any).shot?.imageUrl === url ||
                  (n.data as any).shot?.imageUrls?.[0] === url)
              )
                return true;
              return false;
            });
            if (sourceNode) {
              newEdges.push({
                id: `e-${sourceNode.id}-${id}`,
                source: sourceNode.id,
                target: id,
                type: "deletable",
                animated: true,
                style: { stroke: "#3b82f6", strokeWidth: 2 },
              });
            }
          });
          return newEdges;
        });
      }

      return id;
    },
    [reactFlowInstance, setNodes, setEdges],
  );

  const handleAiSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage = aiInput;
    const currentRefImages = [...aiReferenceImages];
    // Keep reference images from current message or fallback to the most recent ones in history
    const activeRefImages =
      currentRefImages.length > 0
        ? currentRefImages
        : aiMessages
            .slice()
            .reverse()
            .find((m) => m.referenceImages && m.referenceImages.length > 0)
            ?.referenceImages || [];

    // Add context about currently selected nodes if any
    const selectedNodesInfo =
      selectedNodes.length > 0
        ? `\n[当前选中的节点: ${selectedNodes
            .map((n) => {
              if (
                (n.type === "imageShotNode" || n.type === "videoShotNode") &&
                n.data.shot
              ) {
                const s: any = n.data.shot;
                return `类型=${n.type}, Prompt="${s.imagePrompt || s.videoPrompt || s.description || ""}", 比例=${s.aspectRatio || ""}, 分辨率=${s.resolution || ""}, 模型=${s.klingModel || s.imageModel || ""}`;
              }
              return `类型=${n.type}`;
            })
            .join("; ")}]`
        : "";

    const enrichedMessage = `${userMessage}\n\n[用户当前功能面板设置: 模式=${aiMode}, 模型=${aiModelSelect}, 比例=${aiRatio}, 分辨率=${aiRes}, 时长=${aiDuration}。如果模式为“自动识别”或模型为“自动分配”，请你自主根据用户的需求和语义决定最合适的节点类型、模型名称和参数，并且如果用户没有特别说明且没有面板指定信息，默认图片生成使用 doubao-seedream-5.0-lite 模型，默认视频生成使用 kling-video-o1 模型。如果面板有明确设置（即非自动/非默认），请必须使用面板当前的参数。]${activeRefImages.length > 0 ? `\n[重要上下文：用户当前或前文中已提供了 ${activeRefImages.length} 张垫图，请在调用生成工具时，告知使用者正在使用垫图进行生成，并且根据这些垫图和用户描述完善完整的前文提示词参数。]` : ""}${selectedNodesInfo}`;
    setAiInput("");
    setAiReferenceImages([]);
    setIsSelectingAiReference(false);
    setIsAiLoading(true);
    setAiMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userMessage,
        referenceImages:
          currentRefImages.length > 0 ? currentRefImages : undefined,
      },
    ]);

    try {
      const ai = getGenAI();

      const tools = [
        {
          functionDeclarations: [
            {
              name: "createImageShot",
              description:
                "Create a new image shot node on the canvas with a given prompt.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: {
                    type: Type.STRING,
                    description: "The prompt for the image generation.",
                  },
                  model: {
                    type: Type.STRING,
                    description:
                      "The image model to use (e.g. doubao-seedream-5.0-lite, gemini-3.1-flash-image-preview).",
                  },
                  resolution: {
                    type: Type.STRING,
                    description: "Resolution (e.g. 1K, 2K, 4K).",
                  },
                  aspectRatio: {
                    type: Type.STRING,
                    description: "Aspect ratio (e.g. 16:9, 1:1, 9:16).",
                  },
                  count: {
                    type: Type.NUMBER,
                    description: "Number of images to generate (default 1).",
                  },
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
                required: ["prompt"],
              },
            },
            {
              name: "createVideoShot",
              description:
                "Create a new video shot node on the canvas with a given prompt.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  prompt: {
                    type: Type.STRING,
                    description: "The prompt for the video generation.",
                  },
                  model: {
                    type: Type.STRING,
                    description:
                      "The video model to use (e.g. kling-video-o1, sora-2, veo-3.1).",
                  },
                  resolution: {
                    type: Type.STRING,
                    description: "Resolution (e.g. 720p, 1080p, 4K).",
                  },
                  aspectRatio: {
                    type: Type.STRING,
                    description: "Aspect ratio (e.g. 16:9, 1:1, 9:16).",
                  },
                  duration: {
                    type: Type.STRING,
                    description: "Duration (e.g. 5s, 10s).",
                  },
                  count: {
                    type: Type.NUMBER,
                    description: "Number of videos to generate (default 1).",
                  },
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
                required: ["prompt"],
              },
            },
            {
              name: "createTextNode",
              description: "Create a new text node on the canvas.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  content: {
                    type: Type.STRING,
                    description: "The text content.",
                  },
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
                required: ["content"],
              },
            },
            {
              name: "createScriptNode",
              description:
                "Create a new script node on the canvas for writing animation scripts.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  script: {
                    type: Type.STRING,
                    description: "The animation script content.",
                  },
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
                required: ["script"],
              },
            },
            {
              name: "createPhotoEditorNode",
              description: "Create a new photo editor node on the canvas.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
              },
            },
            {
              name: "createVideoProjectNode",
              description: "Create a new video project node on the canvas.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "Optional X position." },
                  y: { type: Type.NUMBER, description: "Optional Y position." },
                },
              },
            },
            {
              name: "clearCanvas",
              description: "Clear all nodes and edges from the canvas.",
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
            {
              name: "updateShotNode",
              description:
                "Update an existing image or video shot node with new prompt, sizes, etc., and optionally trigger regeneration. You must use this when user asks to update or regenerate an existing node.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  nodeId: {
                    type: Type.STRING,
                    description:
                      "The ID of the node to update. You can find this in the selected nodes info.",
                  },
                  prompt: { type: Type.STRING, description: "The new prompt." },
                  model: {
                    type: Type.STRING,
                    description: "The model to use.",
                  },
                  resolution: {
                    type: Type.STRING,
                    description: "Resolution (e.g. 1K, 2K, 4K, 720p).",
                  },
                  aspectRatio: {
                    type: Type.STRING,
                    description: "Aspect ratio (e.g. 16:9, 1:1, 9:16).",
                  },
                  duration: {
                    type: Type.STRING,
                    description: "Duration for video (e.g. 5s, 10s).",
                  },
                  count: {
                    type: Type.NUMBER,
                    description: "Number of generations.",
                  },
                  triggerGenerate: {
                    type: Type.BOOLEAN,
                    description:
                      "Set to false if you just want to update settings without generating.",
                  },
                },
                required: ["nodeId"],
              },
            },
          ],
        },
      ];

      const model = ai.getGenerativeModel({
        model: textModel || "deepseek-chat",
        systemInstruction:
          "你是Jepow智能体（Jepow Agent），专业的设计与创新助手。你完全掌控无限画布的所有节点与功能，能通过工具去专项调动、生成和处理（文本、图片、视频、修图等）。\n\n核心工作流：\n1. 意图与需求分析：结合与用户所有的沟通聊天记录数据，精准判断用户的需求意图：要生成什么主体？比例、尺寸、数量、模型是什么？用户的想法是什么？\n2. 轮询与信息收集：当用户的指令不够清晰、存在严重不确定性时，你可以进行轮询提问以明确需求。当获取到足够的信息后，立即执行生成。（注：如果只是未指定比例或尺寸，可直接根据语义推断或沿用面板环境信息默认值如16:9、1K，避免过度死板轮询）。\n3. 专项调动与处理：结合你的判断意图，主动调用对应工具进行生成或处理！例如用户说“换一套瑜伽服重新生成”并选中了节点，你需要结合前文的提示词修改并复用尺寸参数，然后立刻调用工具。\n\n关键规则：\n- 缺乏明确模型时：图片生成默认使用doubao-seedream-5.0-lite，视频生成默认使用kling-video-o1。\n- 如果用户选中了节点并且要求修改或重新生成，必须调用 `updateShotNode` 工具来修改选中节点，而不能只调用 `createImageShot` 创建新节点。\n- 响应回复：只使用纯文本回答，禁用Emoji。当成功调用生成工具时，告知用户“已成功发送生成请求，正在根据您的需求在画布上生成专项节点，请稍后查看进度”。\n- 执行力：所有控制都取决于你的意图判断，一旦目标明确，必须直接调用Tool（不要光说不做）。",
        tools,
      });

      const chat = model.startChat({
        history: aiMessages.map((msg) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        })),
      });

      const result = await chat.sendMessage(enrichedMessage);
      let response = result.response;

      // Handle function calls
      let calls = response.functionCalls();
      while (calls && calls.length > 0) {
        const functionResponses = [];
        for (const call of calls) {
          try {
            if (call.name === "createImageShot") {
              const shot: Shot = {
                id: `shot-${Date.now()}`,
                shotNumber:
                  nodes.filter(
                    (n) =>
                      n.type === "imageShotNode" || n.type === "videoShotNode",
                  ).length + 1,
                description: call.args.prompt as string,
                imagePrompt: call.args.prompt as string,
                status: "pending",
                aspectRatio:
                  (call.args.aspectRatio as string) ||
                  (aiRatio !== "16:9" ? aiRatio : "16:9"),
                resolution:
                  (call.args.resolution as string) ||
                  (aiRes !== "1K" ? aiRes : "1K"),
                numberOfImages: (call.args.count as number) || 1,
                type: "image",
                imageModel:
                  (aiModelSelect !== "自动分配" && (aiModelSelect in IMAGE_MODELS))
                    ? aiModelSelect
                    : (call.args.model as string) || "imagen-4.0-fast-generate-001",
                referenceImages:
                  activeRefImages.length > 0 ? [...activeRefImages] : undefined,
              };
              createNodeViaAi(
                "imageShotNode",
                { shot },
                call.args.x as number,
                call.args.y as number,
                activeRefImages,
              );

              const shotIdToGenerate = shot.id;
              setTimeout(() => {
                handleGenerateImage(shotIdToGenerate);
              }, 500);
            } else if (call.name === "createVideoShot") {
              const shot: Shot = {
                id: `shot-${Date.now()}`,
                shotNumber:
                  nodes.filter(
                    (n) =>
                      n.type === "imageShotNode" || n.type === "videoShotNode",
                  ).length + 1,
                description: call.args.prompt as string,
                videoPrompt: call.args.prompt as string,
                imagePrompt: call.args.prompt as string,
                status: "pending",
                aspectRatio:
                  (call.args.aspectRatio as string) ||
                  (aiRatio !== "16:9" ? aiRatio : "16:9"),
                resolution:
                  (call.args.resolution as string) ||
                  (aiRes !== "1K" ? aiRes : "720p"),
                klingDuration:
                  (call.args.duration as string) ||
                  (aiDuration !== "5s" ? aiDuration : "5s"),
                numberOfImages: (call.args.count as number) || 1,
                type: "video",
                klingModel:
                  (aiModelSelect !== "自动分配" && (aiModelSelect in KLING_MODELS))
                    ? aiModelSelect
                    : (call.args.model as string) || "kling-video-o1",
                referenceImages:
                  activeRefImages.length > 0 ? [...activeRefImages] : undefined,
              };
              createNodeViaAi(
                "videoShotNode",
                { shot },
                call.args.x as number,
                call.args.y as number,
                activeRefImages,
              );

              const shotIdToGenerate = shot.id;
              setTimeout(() => {
                handleGenerateVideo(shotIdToGenerate);
              }, 500);
            } else if (call.name === "createTextNode") {
              createNodeViaAi(
                "textNode",
                { text: call.args.content },
                call.args.x as number,
                call.args.y as number,
              );
            } else if (call.name === "createScriptNode") {
              createNodeViaAi(
                "scriptNode",
                { script: call.args.script },
                call.args.x as number,
                call.args.y as number,
              );
            } else if (call.name === "createPhotoEditorNode") {
              createNodeViaAi(
                "photoEditorNode",
                {},
                call.args.x as number,
                call.args.y as number,
              );
            } else if (call.name === "createVideoProjectNode") {
              createNodeViaAi(
                "videoProjectNode",
                {},
                call.args.x as number,
                call.args.y as number,
              );
            } else if (call.name === "clearCanvas") {
              setNodes([]);
              setEdges([]);
            } else if (call.name === "updateShotNode") {
              const {
                nodeId,
                prompt,
                model,
                resolution,
                aspectRatio,
                duration,
                count,
                triggerGenerate,
              } = call.args;
              setNodes((nds) =>
                nds.map((n) => {
                  if (
                    n.id === nodeId &&
                    (n.type === "imageShotNode" || n.type === "videoShotNode")
                  ) {
                    const shot = n.data.shot as any;
                    const newShot = { ...shot };
                    if (prompt) {
                      newShot.description = prompt;
                      if (n.type === "imageShotNode")
                        newShot.imagePrompt = prompt;
                      if (n.type === "videoShotNode")
                        newShot.videoPrompt = prompt;
                    }
                    if (aiModelSelect !== "自动分配") {
                      if (n.type === "imageShotNode")
                        newShot.imageModel = aiModelSelect;
                      if (n.type === "videoShotNode")
                        newShot.klingModel = aiModelSelect;
                    } else if (model) {
                      if (n.type === "imageShotNode")
                        newShot.imageModel = model;
                      if (n.type === "videoShotNode")
                        newShot.klingModel = model;
                    }
                    if (resolution) newShot.resolution = resolution;
                    if (aspectRatio) newShot.aspectRatio = aspectRatio;
                    if (duration) newShot.klingDuration = duration;
                    if (count) newShot.numberOfImages = count;
                    if (activeRefImages && activeRefImages.length > 0)
                      newShot.referenceImages = [...activeRefImages];
                    return { ...n, data: { ...n.data, shot: newShot } };
                  }
                  return n;
                }),
              );

              if (triggerGenerate !== false) {
                setTimeout(() => {
                  setNodes((nds) => {
                    const node = nds.find((n) => n.id === nodeId);
                    if (node) {
                      const underlyingShot = (node.data as any).shot;
                      if (node.type === "imageShotNode")
                        handleGenerateImage(underlyingShot.id);
                      if (node.type === "videoShotNode")
                        handleGenerateVideo(underlyingShot.id);
                    }
                    return nds;
                  });
                }, 500);
              }
            }

            let resultMessage = "Operation successful";
            if (call.name === "createImageShot") {
              resultMessage =
                "Node created and image generation started automatically in the background. Tell the user it is generating.";
            } else if (call.name === "createVideoShot") {
              resultMessage =
                "Node created and video generation started automatically in the background. Tell the user it is generating.";
            } else if (call.name === "updateShotNode") {
              resultMessage =
                "Node updated successfully" +
                (call.args.triggerGenerate !== false
                  ? " and generation started automatically."
                  : ".");
            }

            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { result: resultMessage },
              },
            });
          } catch (fnError) {
            console.error("Function call error:", fnError);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: String(fnError) },
              },
            });
          }
        }

        const nextResult = await chat.sendMessage(functionResponses);
        response = nextResult.response;
        calls = response.functionCalls();
      }

      // Update credits if returned in the proxy response
      if ((response as any)._remainingCredits !== undefined) {
        setUser((prev) =>
          prev
            ? { ...prev, credits: (response as any)._remainingCredits }
            : null,
        );
      }

      const finalText = response.text();
      setAiMessages((prev) => [...prev, { role: "model", content: finalText }]);
    } catch (error: any) {
      console.error("AI Error:", error);
      let errorDetail = error.message || String(error);

      // Try to extract more detailed error from the response if available
      if (error.response?.data?.error) {
        errorDetail = error.response.data.error;
      } else if (errorDetail.includes("API_KEY_INVALID")) {
        errorDetail = "Invalid API Key. Please check your settings.";
      } else if (
        errorDetail.includes("402") ||
        errorDetail.toLowerCase().includes("credits")
      ) {
        errorDetail = "INSUFFICIENT_CREDITS. RECHARGE_PROTOCOL_REQUIRED.";
      }

      setAiMessages((prev) => [
        ...prev,
        { role: "model", content: `Error: ${errorDetail}` },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getAbsolutePosition = useCallback(
    (node: Node, nds: Node[]): { x: number; y: number } => {
      let x = node.position.x;
      let y = node.position.y;
      let currentParentId = node.parentId;

      while (currentParentId) {
        const parent = nds.find((n) => n.id === currentParentId);
        if (parent) {
          x += parent.position.x;
          y += parent.position.y;
          currentParentId = parent.parentId;
        } else {
          break;
        }
      }
      return { x, y };
    },
    [],
  );

  const handleGroupNodes = useCallback(() => {
    // Allow grouping any nodes
    const nodesToGroup = selectedNodes;
    if (nodesToGroup.length < 2) return;

    // Calculate bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodesToGroup.forEach((node) => {
      const liveNode = nodes.find((item) => item.id === node.id) || node;
      let cardWidth =
        Number(liveNode.measured?.width || liveNode.width || liveNode.style?.width) ||
        300;
      let cardHeight =
        Number(liveNode.measured?.height || liveNode.height || liveNode.style?.height) ||
        200;

      if (liveNode.type === "imageShotNode" || liveNode.type === "videoShotNode") {
        cardWidth = Math.max(cardWidth, 420);
        cardHeight = Math.max(cardHeight, 260);
      } else if (liveNode.type === "mediaNode") {
        cardWidth = Math.max(cardWidth, 420);
        cardHeight = Math.max(cardHeight, 260);
      } else if (liveNode.type === "threeDEditorNode") {
        cardWidth = Math.max(cardWidth, 420);
        cardHeight = Math.max(cardHeight, 260);
      }

      // Get absolute position for bounding box calculation
      const absPos = getAbsolutePosition(liveNode, nodes);
      const absX = absPos.x;
      const absY = absPos.y;

      minX = Math.min(minX, absX);
      minY = Math.min(minY, absY);
      maxX = Math.max(maxX, absX + cardWidth);
      maxY = Math.max(maxY, absY + cardHeight);
    });

    const padding = 32;
    const groupX = minX - padding;
    const groupY = minY - padding;
    const groupWidth = Math.max(300, maxX - minX + padding * 2);
    const groupHeight = Math.max(300, maxY - minY + padding * 2);

    const groupId = `group-${Date.now()}`;
    const groupName = `组${nodes.filter((node) => node.type === "groupNode").length + 1}`;
    const newGroupNode: Node = {
      id: groupId,
      type: "groupNode",
      position: { x: groupX, y: groupY },
      style: { width: groupWidth, height: groupHeight, zIndex: 0 },
      selected: true,
      data: {
        label: groupName,
        title: groupName,
        layoutMode: "free",
        onChangeTitle: (id: string, title: string) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, title } } : n,
            ),
          );
        },
        onLayoutChange: (
          id: string,
          mode: "horizontal" | "vertical" | "grid" | "free",
        ) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, layoutMode: mode } } : n,
            ),
          );
          setTimeout(() => {
            setShouldAutoLayout(true);
          }, 50);
        },
        onColorChange: (id: string, color: string) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, color } } : n,
            ),
          );
        },
      },
    };

    setNodes((nds) => {
      const updatedNodes = nds.map((node) => {
        if (nodesToGroup.find((n) => n.id === node.id)) {
          // Calculate new relative position
          const absPos = getAbsolutePosition(node, nds);
          return {
            ...node,
            selected: false,
            parentId: groupId,
            position: {
              x: absPos.x - groupX,
              y: absPos.y - groupY,
            },
          };
        }
        return { ...node, selected: false };
      });
      return [newGroupNode, ...updatedNodes];
    });

    setSelectedNodes([newGroupNode]);
  }, [selectedNodes, nodes, setNodes, getAbsolutePosition]);

  const handleUngroupNodes = useCallback(() => {
    const groupNodes = selectedNodes.filter((n) => n.type === "groupNode");
    if (groupNodes.length === 0) return;

    setNodes((nds) => {
      let updatedNodes = [...nds];

      groupNodes.forEach((groupNode) => {
        // Remove group node
        updatedNodes = updatedNodes.filter((n) => n.id !== groupNode.id);

        // Update children
        updatedNodes = updatedNodes.map((node) => {
          if (node.parentId === groupNode.id) {
            return {
              ...node,
              parentId: undefined,
              position: {
                x: node.position.x + groupNode.position.x,
                y: node.position.y + groupNode.position.y,
              },
            };
          }
          return node;
        });
      });

      return updatedNodes;
    });

    setSelectedNodes([]);
  }, [selectedNodes, setNodes]);

  const handleCopy = useCallback(() => {
    if (selectedNodes.length > 0) {
      // Find edges connected to any of the selected nodes
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      const connectedEdges = edges.filter(
        (e) => selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target),
      );

      // Store nodes with their absolute positions to ensure correct placement on paste
      const nodesToCopy = selectedNodes.map((node) => {
        const absPos = getAbsolutePosition(node, nodes);
        return {
          ...node,
          position: absPos, // Use absolute position for the clipboard
          _originalParentId: node.parentId, // Keep track of parent to restore hierarchy if possible
        };
      });

      setClipboard({
        nodes: JSON.parse(JSON.stringify(nodesToCopy)),
        edges: JSON.parse(JSON.stringify(connectedEdges)),
      });
    }
  }, [selectedNodes, edges, nodes, getAbsolutePosition]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;

    const idMap: Record<string, string> = {};
    const now = Date.now();

    // Calculate how many shots we already have
    let currentShotCount = nodes.filter(
      (n) => n.type === "imageShotNode" || n.type === "videoShotNode",
    ).length;

    // First pass: Create new nodes with new IDs and absolute positions
    const newNodes = clipboard.nodes.map((node: any) => {
      const newId = `${node.type}-${now}-${Math.random().toString(36).substr(2, 9)}`;
      idMap[node.id] = newId;

      const newData = {
        ...JSON.parse(JSON.stringify(node.data)), // Deep copy data
        id: newId,
        onDelete: (id: string) =>
          setNodes((nds) => nds.filter((node) => node.id !== id)),
      };

      if (node.type === "groupNode") {
        newData.onChangeTitle = (id: string, title: string) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, title } } : n,
            ),
          );
        };
        newData.onLayoutChange = (
          id: string,
          mode: "horizontal" | "vertical" | "grid" | "free",
        ) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, layoutMode: mode } } : n,
            ),
          );
          setTimeout(() => {
            setShouldAutoLayout(true);
          }, 50);
        };
        newData.onColorChange = (id: string, color: string) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, color } } : n,
            ),
          );
        };
      }

      if (newData.shot) {
        currentShotCount++;
        const newShot = {
          ...(newData.shot as Shot),
          id: `shot-${now}-${Math.random().toString(36).substr(2, 9)}`,
          shotNumber: currentShotCount,
        };
        newData.shot = newShot;
      }

      const newNode = {
        ...node,
        id: newId,
        parentId: undefined, // Clear parentId initially, will restore in second pass
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        data: newData,
        selected: true,
      };
      delete newNode.extent;
      delete newNode.expandParent;
      return newNode;
    });

    // Second pass: Restore parentId if the parent was also copied
    const finalNodes = newNodes.map((node: any) => {
      const originalNode = clipboard.nodes.find(
        (n: any) => idMap[n.id] === node.id,
      ) as any;
      if (
        originalNode &&
        originalNode._originalParentId &&
        idMap[originalNode._originalParentId]
      ) {
        const newParentId = idMap[originalNode._originalParentId];
        const newParent = newNodes.find((n) => n.id === newParentId);

        if (newParent) {
          // Make position relative to the new parent
          return {
            ...node,
            parentId: newParentId,
            extent: "parent",
            expandParent: true,
            position: {
              x: node.position.x - newParent.position.x,
              y: node.position.y - newParent.position.y,
            },
          };
        }
      }
      return node;
    });

    const newEdges = clipboard.edges
      .map((edge: any) => {
        if (!idMap[edge.source] && !idMap[edge.target]) {
          return null;
        }

        return {
          ...edge,
          id: `edge-${now}-${Math.random().toString(36).substr(2, 9)}`,
          source: idMap[edge.source] || edge.source,
          target: idMap[edge.target] || edge.target,
          selected: true,
        };
      })
      .filter((e: any) => e !== null);

    // BATCH_UPDATE: PREVENT_INTERMEDIATE_DISCONNECTS
    isRemoteUpdate.current = false; // Ensure this is treated as a local change
    setNodes((nds) =>
      nds.map((n) => ({ ...n, selected: false })).concat(finalNodes),
    );
    setEdges((eds) =>
      eds.map((e) => ({ ...e, selected: false })).concat(newEdges),
    );
  }, [clipboard, nodes]);

  const historyInput = useMemo(() => ({ nodes, edges }), [nodes, edges]);
  const { undo, redo, canUndo, canRedo } = useHistory(historyInput, 500);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we are typing in an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (
        e.key.toLowerCase() === "s" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        const nodeToCenter =
          selectedNodes[0] || nodes.find((node) => node.selected);
        if (nodeToCenter && reactFlowInstance) {
          e.preventDefault();
          const absolute = getAbsolutePosition(nodeToCenter, nodes);
          const width =
            nodeToCenter.measured?.width || nodeToCenter.width || 300;
          const height =
            nodeToCenter.measured?.height || nodeToCenter.height || 220;
          reactFlowInstance.setCenter(
            absolute.x + Number(width) / 2,
            absolute.y + Number(height) / 2,
            { zoom: 1, duration: 500 },
          );
        }
      }

      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "g"
      ) {
        e.preventDefault();
        handleGroupNodes();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          // Redo: Ctrl+Shift+Z
          const nextState = redo();
          if (nextState) {
            setNodes(nextState.nodes);
            setEdges(nextState.edges);
          }
        } else {
          // Undo: Ctrl+Z
          const prevState = undo();
          if (prevState) {
            setNodes(prevState.nodes);
            setEdges(prevState.edges);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        // Redo: Ctrl+Y
        e.preventDefault();
        const nextState = redo();
        if (nextState) {
          setNodes(nextState.nodes);
          setEdges(nextState.edges);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        // Group: Ctrl+G
        e.preventDefault();
        handleGroupNodes();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        // Ungroup: Ctrl+U
        e.preventDefault();
        handleUngroupNodes();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        // Copy: Ctrl+C
        e.preventDefault();
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        // Paste: Ctrl+V
        e.preventDefault();
        handlePaste();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    undo,
    redo,
    reactFlowInstance,
    selectedNodes,
    nodes,
    getAbsolutePosition,
    handleGroupNodes,
    handleUngroupNodes,
    handleCopy,
    handlePaste,
  ]);

  const nodeTypes = useMemo(
    () => ({
      imageShotNode: ImageShotNode,
      videoShotNode: VideoShotNode,
      mediaNode: MediaNode,
      imageNode: ImageNode,
      textNode: TextNode,
      scriptNode: ScriptNode,
      groupNode: GroupNode,
      imageTo3DNode: ImageTo3DNode,
      materialGenNode: MaterialGenNode,
      materialReplaceNode: MaterialReplaceNode,
      threeDEditorNode: ThreeDEditorNode,
      threeDRenderNode: ThreeDRenderNode,
      modelAssetNode: ModelAssetNode,
      cyclesPrincipledNode: CyclesPrincipledNode,
      cyclesImageTextureNode: CyclesImageTextureNode,
      cyclesNormalMapNode: CyclesNormalMapNode,
      cyclesDisplacementNode: CyclesDisplacementNode,
      cyclesGammaNode: CyclesGammaNode,
      cyclesBrightContrastNode: CyclesBrightContrastNode,
      cyclesRgbCurvesNode: CyclesRgbCurvesNode,
      cyclesRgbRampNode: CyclesRgbRampNode,
      cyclesMixColorNode: CyclesMixColorNode,
      cyclesMapRangeNode: CyclesMapRangeNode,
      cyclesRgbToBwNode: CyclesRgbToBwNode,
      cyclesLightNode: CyclesLightNode,
      cyclesCameraNode: CyclesCameraNode,
      cyclesRenderSettingsNode: CyclesRenderSettingsNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      deletable: DeletableEdge,
      deletableEdge: DeletableEdge,
    }),
    [],
  );

  const getChildWidth = useCallback(
    (child: Node, groupLayouts?: Map<string, any>) => {
      if (child.measured?.width) return child.measured.width;
      if (child.width) return child.width;
      if (child.type === "groupNode")
        return groupLayouts?.get(child.id)?.width || 300;
      if (child.type === "imageShotNode") return 420;
      if (child.type === "videoShotNode") return 420;
      if (child.type === "mediaNode") return 420;
      if (child.type === "threeDEditorNode") return 420;
      if (child.type === "scriptNode") return 720;
      if (child.type === "textNode") return 720;
      if (child.type === "photoEditorNode")
        return (child.data.width as number) || 400;
      if (child.type === "threeDNode") return 280;
      return 300;
    },
    [],
  );

  const getChildHeight = useCallback(
    (child: Node, groupLayouts?: Map<string, any>) => {
      if (child.measured?.height) return child.measured.height;
      if (child.height) return child.height;
      if (child.type === "groupNode")
        return groupLayouts?.get(child.id)?.height || 200;
      if (child.type === "imageShotNode") return 260;
      if (child.type === "videoShotNode") return 260;
      if (child.type === "mediaNode") return 260;
      if (child.type === "threeDEditorNode") return 260;
      if (child.type === "scriptNode") return 405;
      if (child.type === "textNode") return 405;
      if (child.type === "photoEditorNode")
        return (child.data.height as number) || 300;
      if (child.type === "threeDNode") return 300;
      return 200;
    },
    [],
  );

  const onLayout = useCallback(
    (direction?: "LR" | "TB" | "GRID") => {
      const layoutDir = direction || globalLayoutDirection;
      if (direction) {
        setGlobalLayoutDirection(direction);
      }
      setNodes((nds) => {
        // First, calculate layouts for all groups, starting from the deepest ones
        const groupLayouts = new Map(); // groupId -> { width, height, childrenPositions: Map<childId, {x, y}> }

        // Helper to get nesting depth
        const getDepth = (id: string): number => {
          let depth = 0;
          let current = nds.find((n) => n.id === id);
          while (current && current.parentId) {
            depth++;
            current = nds.find((n) => n.id === current.parentId);
          }
          return depth;
        };

        const groupNodes = nds
          .filter((n) => n.type === "groupNode")
          .sort((a, b) => getDepth(b.id) - getDepth(a.id)); // Deepest first

        groupNodes.forEach((groupNode) => {
          const children = nds.filter((n) => n.parentId === groupNode.id);
          if (children.length === 0) {
            groupLayouts.set(groupNode.id, {
              width: 300,
              height: 200,
              childrenPositions: new Map(),
            });
            return;
          }

          const layoutMode = groupNode.data.layoutMode || "grid";
          const padding = 50;
          const bottomPadding = 100; // Extra padding at the bottom for the toolbar
          const gap = 40;

          const childrenPositions = new Map();
          let maxX = 0;
          let maxY = 0;

          if (layoutMode === "free") {
            // In free mode, we just calculate the bounding box of children's current positions
            let minX = Infinity,
              minY = Infinity;
            let currentMaxX = -Infinity,
              currentMaxY = -Infinity;

            children.forEach((child) => {
              const childWidth = getChildWidth(child, groupLayouts);
              const childHeight = getChildHeight(child, groupLayouts);

              minX = Math.min(minX, child.position.x);
              minY = Math.min(minY, child.position.y);
              currentMaxX = Math.max(
                currentMaxX,
                child.position.x + childWidth,
              );
              currentMaxY = Math.max(
                currentMaxY,
                child.position.y + childHeight,
              );
            });

            // If there are no children, minX/minY will be Infinity
            if (minX === Infinity) {
              maxX = 300;
              maxY = 200;
            } else {
              // We need to shift all children so the minimum X/Y starts at padding
              const shiftX = padding - minX;
              const shiftY = padding - minY;

              children.forEach((child) => {
                childrenPositions.set(child.id, {
                  x: child.position.x + shiftX,
                  y: child.position.y + shiftY,
                });
              });

              // The new max coordinates after shifting
              maxX = currentMaxX + shiftX + padding;
              maxY = currentMaxY + shiftY + bottomPadding;
            }
          } else if (layoutMode === "horizontal") {
            let currentX = padding;
            children.forEach((child) => {
              const childWidth = getChildWidth(child, groupLayouts);
              const childHeight = getChildHeight(child, groupLayouts);

              childrenPositions.set(child.id, { x: currentX, y: padding });
              currentX += childWidth + gap;
              maxY = Math.max(maxY, padding + childHeight + bottomPadding);
            });
            // The last child added 'gap' to currentX, so we subtract it, then add padding
            maxX = currentX - gap + padding;
          } else if (layoutMode === "vertical") {
            let currentY = padding;
            children.forEach((child) => {
              const childWidth = getChildWidth(child, groupLayouts);
              const childHeight = getChildHeight(child, groupLayouts);

              childrenPositions.set(child.id, { x: padding, y: currentY });
              currentY += childHeight + gap;
              maxX = Math.max(maxX, padding + childWidth + padding);
            });
            maxY = currentY - gap + bottomPadding;
          } else {
            // Grid layout
            const cols = Math.ceil(Math.sqrt(children.length));
            let rowHeights: number[] = [];
            let colWidths: number[] = [];

            children.forEach((child, index) => {
              const col = index % cols;
              const row = Math.floor(index / cols);
              const childWidth = getChildWidth(child, groupLayouts);
              const childHeight = getChildHeight(child, groupLayouts);

              colWidths[col] = Math.max(colWidths[col] || 0, childWidth);
              rowHeights[row] = Math.max(rowHeights[row] || 0, childHeight);
            });

            children.forEach((child, index) => {
              const col = index % cols;
              const row = Math.floor(index / cols);

              let x = padding;
              for (let i = 0; i < col; i++) x += colWidths[i] + gap;

              let y = padding;
              for (let i = 0; i < row; i++) y += rowHeights[i] + gap;

              childrenPositions.set(child.id, { x, y });
            });

            maxX =
              padding +
              colWidths.reduce((a, b) => a + b + gap, 0) -
              gap +
              padding;
            maxY =
              padding +
              rowHeights.reduce((a, b) => a + b + gap, 0) -
              gap +
              bottomPadding;
          }

          groupLayouts.set(groupNode.id, {
            width: Math.max(maxX, 300),
            height: Math.max(maxY, 200),
            childrenPositions,
          });
        });

        const updateNode = (
          node: Node,
          topLevelPositions: Map<string, { x: number; y: number }>,
        ) => {
          let newNode = { ...node };

          // Update width/height if it's a group
          if (node.type === "groupNode" && groupLayouts.has(node.id)) {
            const layout = groupLayouts.get(node.id);
            newNode.width = layout.width;
            newNode.height = layout.height;
            newNode.style = {
              ...newNode.style,
              width: layout.width,
              height: layout.height,
            };
          }

          // Update position
          if (node.parentId && groupLayouts.has(node.parentId)) {
            const parentLayout = groupLayouts.get(node.parentId);
            if (parentLayout.childrenPositions.has(node.id)) {
              newNode.position = parentLayout.childrenPositions.get(node.id);
            }
          } else if (topLevelPositions.has(node.id)) {
            newNode.position = topLevelPositions.get(node.id);
          }

          return newNode;
        };

        if (layoutDir === "GRID") {
          const topLevelNodes = nds.filter((n) => !n.parentId);
          const cols = Math.ceil(Math.sqrt(topLevelNodes.length));
          const spacingX = 500;
          const spacingY = 800;

          const newPositions = new Map();
          topLevelNodes.forEach((node, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            newPositions.set(node.id, {
              x: col * spacingX,
              y: row * spacingY,
            });
          });

          return nds.map((node) => updateNode(node, newPositions));
        }

        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: layoutDir, nodesep: 120, ranksep: 120 });

        const topLevelNodes = nds.filter((n) => !n.parentId);

        topLevelNodes.forEach((node) => {
          let width = 300;
          let height = 300;

          if (node.type === "imageShotNode" || node.type === "videoShotNode") {
            width = 1024;
            height = 600;
          } else if (node.type === "scriptNode") {
            width = 720;
            height = 405;
          } else if (node.type === "textNode") {
            width = 720;
            height = 405;
          } else if (node.type === "mediaNode") {
            width = 1024;
            height = 600;
          } else if (node.type === "groupNode") {
            if (groupLayouts.has(node.id)) {
              width = groupLayouts.get(node.id).width;
              height = groupLayouts.get(node.id).height;
            } else {
              width = parseInt(node.style?.width as string) || 600;
              height = parseInt(node.style?.height as string) || 600;
            }
          }

          dagreGraph.setNode(node.id, { width, height });
        });

        edges.forEach((edge) => {
          // Only add edges between top-level nodes
          const sourceNode = nds.find((n) => n.id === edge.source);
          const targetNode = nds.find((n) => n.id === edge.target);
          if (
            sourceNode &&
            !sourceNode.parentId &&
            targetNode &&
            !targetNode.parentId
          ) {
            dagreGraph.setEdge(edge.source, edge.target);
          }
        });

        dagre.layout(dagreGraph);

        const dagrePositions = new Map();
        topLevelNodes.forEach((node) => {
          const nodeWithPosition = dagreGraph.node(node.id);
          if (nodeWithPosition) {
            let width = 300;
            let height = 300;
            if (
              node.type === "imageShotNode" ||
              node.type === "videoShotNode"
            ) {
              width = 420;
              height = 750;
            } else if (node.type === "textNode") {
              width = 300;
              height = 200;
            } else if (node.type === "mediaNode") {
              width = 300;
              height = 300;
            } else if (node.type === "groupNode") {
              if (groupLayouts.has(node.id)) {
                width = groupLayouts.get(node.id).width;
                height = groupLayouts.get(node.id).height;
              } else {
                width = parseInt(node.style?.width as string) || 600;
                height = parseInt(node.style?.height as string) || 600;
              }
            }
            dagrePositions.set(node.id, {
              x: nodeWithPosition.x - width / 2,
              y: nodeWithPosition.y - height / 2,
            });
          }
        });

        return nds.map((node) => updateNode(node, dagrePositions));
      });
    },
    [edges, setNodes, globalLayoutDirection],
  );

  useEffect(() => {
    if (shouldAutoLayout && nodes.length > 0) {
      // Small timeout to ensure nodes are fully rendered and dimensions are set
      const timer = setTimeout(() => {
        onLayout();
        setShouldAutoLayout(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoLayout, nodes.length, onLayout]);

  const handleCanvasMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    let centerPos = { x: Math.random() * 200, y: Math.random() * 200 };
    if (reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    files.forEach(async (file, index) => {
      let fileUrl = "";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          showToast: false,
        } as any);
        fileUrl = res.data.url;
      } catch (err) {
        console.warn("Upload to server failed, falling back to Base64", err);
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = resolve;
          reader.readAsDataURL(file);
        });
        fileUrl = reader.result as string;
      }

      const isVideo = file.type.startsWith("video/");
      if (isVideo) {
        const id = `media-${Date.now()}-${index}`;
        setNodes((nds) => [
          ...nds,
          {
            id,
            type: "mediaNode",
            position: {
              x: centerPos.x + index * 20,
              y: centerPos.y + index * 20,
            },
            data: {
              url: fileUrl,
              type: "video",
            },
          },
        ]);

        window.dispatchEvent(
          new CustomEvent("add-to-history", {
            detail: {
              type: "video",
              url: fileUrl,
              prompt: "Uploaded Video",
              source: "uploaded",
            },
          }),
        );
      } else {
        // It's an image, create ImageNode with dimensions
        const img = new Image();
        img.onload = () => {
          const id = `image-${Date.now()}-${index}`;
          let w = img.width;
          let h = img.height;

          setNodes((nds) => [
            ...nds,
            {
              id,
              type: "imageNode",
              position: {
                x: centerPos.x + index * 20,
                y: centerPos.y + index * 20,
              },
              data: {
                url: fileUrl,
                width: w,
                height: h,
              },
            },
          ]);

          window.dispatchEvent(
            new CustomEvent("add-to-history", {
              detail: {
                type: "image",
                url: fileUrl,
                prompt: "Uploaded Image",
                source: "uploaded",
              },
            }),
          );
        };
        img.src = fileUrl;
      }
    });

    e.target.value = "";
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const dropPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const historyData = event.dataTransfer.getData(
        "application/reactflow-history",
      );
      if (historyData) {
        const item = JSON.parse(historyData) as HistoryItem;
        if (item.type === "image") {
          const img = new Image();
          img.onload = () => {
            const id = `image-${Date.now()}`;
            let w = img.width;
            let h = img.height;
            setNodes((nds) => [
              ...nds,
              {
                id,
                type: "imageNode",
                position: dropPosition,
                data: { url: item.url, width: w, height: h },
              },
            ]);
          };
          img.src = item.url;
        } else {
          const id = `media-${Date.now()}`;
          setNodes((nds) => [
            ...nds,
            {
              id,
              type: "mediaNode",
              position: dropPosition,
              data: { url: item.url, type: "video" },
            },
          ]);
        }
        return;
      }

      const files = Array.from(event.dataTransfer.files) as File[];
      if (files.length === 0) return;

      files.forEach(async (file, index) => {
        const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        const isBlend = fileExt === ".blend";
        const isModel = fileExt === ".glb" || fileExt === ".gltf" || fileExt === ".fbx" || fileExt === ".obj" || file.type.startsWith("model/");
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isModel && !isBlend)
          return;

        if (isBlend && shouldUseLocalCanvasAssets()) {
          const position = {
            x: dropPosition.x + index * 20,
            y: dropPosition.y + index * 20,
          };
          void (async () => {
            try {
              const ingested = await ingestBlendProjectFile(
                getLocalUserId(),
                file,
                position,
              );
              if (!ingested.ok || !ingested.graph) {
                toast.error(
                  ingested.error ||
                    "Blender 工程导入失败，请确认已安装 Blender",
                );
                return;
              }
              mergeBlendImportGraph(setNodes, setEdges, ingested.graph);
              toast.success(
                "已导入 Blender 工程：请将绿色模型线连到 3D 编辑器，或直接使用自动生成的编辑器节点",
              );
            } catch (err: unknown) {
              console.error("Blend project drop failed:", err);
              toast.error(
                err instanceof Error ? err.message : "Blender 工程导入失败",
              );
            }
          })();
          return;
        }

        if (isModel) {
          const nodeId = `model-${Date.now()}-${index}`;
          const position = {
            x: dropPosition.x + index * 20,
            y: dropPosition.y + index * 20,
          };

          if (shouldUseLocalCanvasAssets()) {
            void (async () => {
              try {
                const ingested = await ingestDroppedModelFile(
                  getLocalUserId(),
                  file,
                );
                if (!ingested.ok || !ingested.nodeData) {
                  toast.error(
                    ingested.error ||
                      "拖入模型未能写入本地工程，请用「从磁盘选择大场景」",
                  );
                  return;
                }
                setNodes((nds) => [
                  ...nds,
                  {
                    id: nodeId,
                    type: "modelAssetNode",
                    position,
                    data: ingested.nodeData,
                  },
                ]);
                toast.success(
                  `已导入 ${ingested.nodeData.modelName} 到工程 assets/models`,
                );
              } catch (err: unknown) {
                console.error("Desktop model drop failed:", err);
                toast.error(
                  err instanceof Error ? err.message : "拖入模型失败",
                );
              }
            })();
            return;
          }

          const localBlobUrl = URL.createObjectURL(file);
          setNodes((nds) => [
            ...nds,
            {
              id: nodeId,
              type: "modelAssetNode",
              position,
              data: {
                glbUrl: localBlobUrl,
                modelName: file.name,
              },
            },
          ]);

          const formData = new FormData();
          formData.append("file", file);
          api
            .post("/upload", formData, {
              headers: { "Content-Type": "multipart/form-data" },
              showToast: false,
            } as any)
            .then((res) => {
              if (res.data && res.data.url) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === nodeId
                      ? { ...n, data: { ...n.data, glbUrl: res.data.url } }
                      : n,
                  ),
                );
              }
            })
            .catch((err) => {
              console.warn(
                "Model background upload failed, keeping memory blob preview:",
                err,
              );
              const statusText =
                err.response?.status === 413
                  ? " (大小超出服务器限制)"
                  : " (服务器存储或通信限制)";
              toast.info(
                `模型文件较重${statusText}，已启用本地浏览器内存极速加载，保存此项目已正常放行。`,
                { duration: 8000 },
              );
            });

          return;
        }

        const reader = new FileReader();

        reader.onloadend = async () => {
          const isVideo = file.type.startsWith("video/");
          const tempBase64 = reader.result as string;

          let fileUrl = tempBase64;
          // Optimistically upload to server to prevent huge DB bloat
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/upload", formData, {
              headers: { "Content-Type": "multipart/form-data" },
              showToast: false,
            } as any);
            if (res.data && res.data.url) {
              fileUrl = res.data.url;
            }
          } catch (err) {
            console.warn(
              "Upload from drop failed, falling back to base64",
              err,
            );
          }

          if (isVideo) {
            const id = `media-${Date.now()}-${index}`;
            setNodes((nds) => [
              ...nds,
              {
                id,
                type: "mediaNode",
                position: {
                  x: dropPosition.x + index * 20,
                  y: dropPosition.y + index * 20,
                },
                data: {
                  url: fileUrl,
                  type: "video",
                },
              },
            ]);

            window.dispatchEvent(
              new CustomEvent("add-to-history", {
                detail: {
                  type: "video",
                  url: fileUrl,
                  prompt: "Dropped Video",
                  source: "uploaded",
                },
              }),
            );
          } else {
            const img = new Image();
            img.onload = () => {
              const id = `image-${Date.now()}-${index}`;
              let w = img.width;
              let h = img.height;
              setNodes((nds) => [
                ...nds,
                {
                  id,
                  type: "imageNode",
                  position: {
                    x: dropPosition.x + index * 20,
                    y: dropPosition.y + index * 20,
                  },
                  data: {
                    url: fileUrl,
                    width: w,
                    height: h,
                  },
                },
              ]);

              window.dispatchEvent(
                new CustomEvent("add-to-history", {
                  detail: {
                    type: "image",
                    url: fileUrl,
                    prompt: "Dropped Image",
                    source: "uploaded",
                  },
                }),
              );
            };
            img.src = tempBase64; // Need dataurl for img.onload dimension check
          }
        };

        reader.readAsDataURL(file);
      });
    },
    [reactFlowInstance, setNodes, setEdges],
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setNodes((nds) => {
        // Find absolute center of the dragged node
        const absPos = getAbsolutePosition(node, nds);
        const nodeCenterX = absPos.x + (node.measured?.width || 100) / 2;
        const nodeCenterY = absPos.y + (node.measured?.height || 100) / 2;

        // Find the topmost group node that contains this point (excluding the node itself and its descendants)
        const groupNodes = nds.filter(
          (n) => n.type === "groupNode" && n.id !== node.id,
        );

        // Helper to check if a node is a descendant of another
        const isDescendant = (childId: string, parentId: string): boolean => {
          let current = nds.find((n) => n.id === childId);
          while (current && current.parentId) {
            if (current.parentId === parentId) return true;
            current = nds.find((n) => n.id === current.parentId);
          }
          return false;
        };

        let targetGroupId: string | undefined;
        let targetGroup: Node | undefined;

        // Iterate backwards to find the topmost group (highest z-index/last in array)
        for (let i = groupNodes.length - 1; i >= 0; i--) {
          const group = groupNodes[i];

          // Prevent circular nesting
          if (isDescendant(group.id, node.id)) continue;

          const groupAbsPos = getAbsolutePosition(group, nds);
          const groupWidth = Number(
            group.style?.width || group.measured?.width || 200,
          );
          const groupHeight = Number(
            group.style?.height || group.measured?.height || 100,
          );

          if (
            nodeCenterX >= groupAbsPos.x &&
            nodeCenterX <= groupAbsPos.x + groupWidth &&
            nodeCenterY >= groupAbsPos.y &&
            nodeCenterY <= groupAbsPos.y + groupHeight
          ) {
            targetGroupId = group.id;
            targetGroup = group;
            break;
          }
        }

        if (targetGroupId && targetGroup) {
          // Only re-parent if it's a different group
          if (node.parentId === targetGroupId) return nds;

          const updatedNodes = nds.map((n) => {
            if (n.id === node.id) {
              return {
                ...n,
                parentId: targetGroupId,
                position: {
                  x: absPos.x - getAbsolutePosition(targetGroup!, nds).x,
                  y: absPos.y - getAbsolutePosition(targetGroup!, nds).y,
                },
              };
            }
            return n;
          });

          return updatedNodes;
        } else if (node.parentId) {
          // Dropped on background, remove from group
          const updatedNodes = nds.map((n) => {
            if (n.id === node.id) {
              return {
                ...n,
                parentId: undefined,
                position: absPos,
              };
            }
            return n;
          });

          return updatedNodes;
        }

        return nds;
      });
    },
    [setNodes, getAbsolutePosition],
  );

  const centerViewportOnNode = useCallback(
    (nodeId: string) => {
      if (reactFlowInstance) {
        setTimeout(() => {
          const node = reactFlowInstance.getNode(nodeId);
          if (node && node.position) {
            let width = 300;
            let height = 300;
            if (node.measured?.width && node.measured?.height) {
              width = node.measured.width;
              height = node.measured.height;
            } else if (node.type === "videoProjectNode") {
              width = 400;
              height = 300;
            } else if (
              node.type === "photoEditorNode" ||
              node.type === "imageEditorNode"
            ) {
              width = 300;
              height = 200;
            }
            reactFlowInstance.setCenter(
              node.position.x + width / 2,
              node.position.y + height / 2,
              { zoom: 1, duration: 800 },
            );
          }
        }, 50);
      }
    },
    [reactFlowInstance],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (isRemoteUpdate.current) {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds);
        nodesRef.current = nextNodes;
        return nextNodes;
      });
      return;
    }
    setNodes((nds) => {
      let nextNodes = applyNodeChanges(changes, nds);

      // Handle overlap prevention and group constraints
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const node = nextNodes.find((n) => n.id === change.id);
          if (!node) continue;

          // Collision detection removed to allow stacking
        }
      }

      // 2. Dynamic Group Resizing & Tight Fit
      const groupsToResize = new Set<string>();
      for (const change of changes) {
        if (change.type === "position" || change.type === "dimensions") {
          const node = nextNodes.find((n) => n.id === change.id);
          if (node?.parentId) {
            groupsToResize.add(node.parentId);
          }
        }
        if (change.type === "remove") {
          const removedNode = nds.find((n) => n.id === change.id);
          if (removedNode?.parentId) {
            groupsToResize.add(removedNode.parentId);
          }
        }
      }

      if (groupsToResize.size > 0) {
        groupsToResize.forEach((groupId) => {
          const children = nextNodes.filter((n) => n.parentId === groupId);
          if (children.length === 0) return;

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          children.forEach((child) => {
            const cardWidth = getChildWidth(child);
            const cardHeight = getChildHeight(child);

            minX = Math.min(minX, child.position.x);
            minY = Math.min(minY, child.position.y);
            maxX = Math.max(maxX, child.position.x + cardWidth);
            maxY = Math.max(maxY, child.position.y + cardHeight);
          });

          const padding = 32;

          // If minX or minY is not at the padding offset, we move the group and adjust children
          const offsetX = minX - padding;
          const offsetY = minY - padding;

          if (Math.abs(offsetX) > 0.1 || Math.abs(offsetY) > 0.1) {
            nextNodes = nextNodes.map((node) => {
              if (node.id === groupId) {
                return {
                  ...node,
                  position: {
                    x: node.position.x + offsetX,
                    y: node.position.y + offsetY,
                  },
                  style: {
                    ...(node as any).style,
                    width: maxX - minX + padding * 2,
                    height: maxY - minY + padding * 2,
                  },
                };
              }
              if (node.parentId === groupId) {
                return {
                  ...node,
                  position: {
                    x: node.position.x - offsetX,
                    y: node.position.y - offsetY,
                  },
                };
              }
              return node;
            });
          } else {
            // Just update dimensions
            nextNodes = nextNodes.map((node) => {
              if (node.id === groupId) {
                return {
                  ...node,
                  style: {
                    ...(node as any).style,
                    width: maxX - minX + padding * 2,
                    height: maxY - minY + padding * 2,
                  },
                };
              }
              return node;
            });
          }
        });
      }

      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === "imageShotNode" || node.type === "videoShotNode") {
            const shot = node.data.shot as Shot;
            const imageNodeId = `${shot.id}-image`;
            const videoNodeId = `${shot.id}-video`;

            let shotUpdates: Partial<Shot> = {};

            // Handle text description deletion
            const deletedTextEdges = deleted.filter(
              (edge) =>
                edge.target === node.id &&
                edge.targetHandle === "target-description",
            );

            if (deletedTextEdges.length > 0) {
              shotUpdates.description = "";
            }

            // Handle image edge deletions
            const deletedImageEdges = deleted.filter(
              (edge) =>
                edge.target === node.id && edge.targetHandle === "target",
            );

            if (deletedImageEdges.length > 0) {
              deletedImageEdges.forEach((edge) => {
                const sourceNode = nds.find((n) => n.id === edge.source);
                if (sourceNode) {
                  const sourceData = sourceNode.data as any;
                  let sourceImageUrl = "";
                  if (
                    sourceNode.type === "mediaNode" &&
                    sourceData.type === "image"
                  )
                    sourceImageUrl = sourceData.url;
                  else if (
                    sourceNode.type === "imageNode" ||
                    sourceNode.type === "photoEditorNode" ||
                    sourceNode.type === "imageEditorNode"
                  )
                    sourceImageUrl = sourceData.url;
                  else if (
                    sourceNode.type === "imageShotNode" &&
                    sourceData.shot?.imageUrl
                  )
                    sourceImageUrl = sourceData.shot.imageUrl;

                  if (sourceImageUrl) {
                    if (node.type === "videoShotNode") {
                      let poolType = (edge.data?.poolType as string) || "videoReferenceImage";
                      if (edge.targetHandle && edge.targetHandle.startsWith("target-") && edge.targetHandle !== "target-description") {
                        poolType = edge.targetHandle.replace("target-", "");
                      }

                      if ((shot as any)[poolType] === sourceImageUrl) {
                        (shotUpdates as any)[poolType] = "";
                      }
                    } else if (node.type === "imageShotNode") {
                      const poolType =
                        (edge.data?.poolType as string) || "referenceImages";
                      const existing =
                        (shotUpdates as any)[poolType] ||
                        (shot as any)[poolType] ||
                        [];
                      if (existing.includes(sourceImageUrl)) {
                        (shotUpdates as any)[poolType] = existing.filter(
                          (url: string) => url !== sourceImageUrl,
                        );
                      }
                    }
                  }
                }
              });
            }

            if (Object.keys(shotUpdates).length > 0) {
              return {
                ...node,
                data: {
                  ...node.data,
                  shot: { ...shot, ...shotUpdates },
                },
              };
            }
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      setNodes((nds) => {
        let nextNodes = [...nds];
        deleted.forEach((deletedNode) => {
          if (deletedNode.type === "groupNode") {
            // Ungroup children
            nextNodes = nextNodes.map((node) => {
              if (node.parentId === deletedNode.id) {
                return {
                  ...node,
                  parentId: undefined,
                  position: {
                    x: node.position.x + deletedNode.position.x,
                    y: node.position.y + deletedNode.position.y,
                  },
                };
              }
              return node;
            });
          }
        });
        return nextNodes;
      });

      // If a group is deleted, remove parentId from its children
      const deletedGroupIds = deleted
        .filter((n) => n.type === "groupNode")
        .map((n) => n.id);
      if (deletedGroupIds.length > 0) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.parentId && deletedGroupIds.includes(node.parentId)) {
              // Find the deleted group to get its position
              const group = deleted.find((n) => n.id === node.parentId);
              return {
                ...node,
                parentId: undefined,
                position: {
                  x: node.position.x + (group?.position.x || 0),
                  y: node.position.y + (group?.position.y || 0),
                },
              };
            }
            return node;
          }),
        );
      }
    },
    [setNodes],
  );

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const normalized = normalizeNative3dConnection(params, nodesRef.current);
      const validation = validateNative3dConnection(normalized, nodesRef.current);
      if (!validation.ok) {
        toast.error(validation.reason || "该连接不符合 3D 原生链路规范");
        return eds;
      }

      const sourceNode = nodesRef.current.find((n) => n.id === normalized.source);
      const targetNode = nodesRef.current.find((n) => n.id === normalized.target);
      const edgeStyle = edgeStyleForNative3dConnection(normalized, nodesRef.current);

      let newEdgesToAdd: Edge[] = [];

      if (sourceNode?.selected) {
        const selectedNodes = nodesRef.current.filter(
          (n) => n.selected && n.id !== params.target,
        );
        selectedNodes.forEach((node) => {
          newEdgesToAdd.push({
            ...normalized,
            source: node.id,
            type: "deletable",
            animated: true,
            style: { stroke: edgeStyle.stroke, strokeWidth: edgeStyle.strokeWidth },
          } as Edge);
        });
      } else {
        newEdgesToAdd.push({
          ...normalized,
          type: "deletable",
          animated: true,
          style: { stroke: edgeStyle.stroke, strokeWidth: edgeStyle.strokeWidth },
        } as Edge);
      }

      let nextEds = eds.filter(
        (e) =>
          !(
            e.target === normalized.target &&
            e.targetHandle === normalized.targetHandle
          ),
      );

      for (const edge of newEdgesToAdd) {
        if (targetNode?.type === "imageShotNode") {
          const incomingEdges = nextEds.filter(
            (e) => e.target === params.target,
          );
          let imageEdgeCount = 0;
          incomingEdges.forEach((e) => {
            const srcNode = nodesRef.current.find((n) => n.id === e.source);
            if (
              srcNode &&
              [
                "imageNode",
                "mediaNode",
                "photoEditorNode",
                "imageEditorNode",
                "imageShotNode",
              ].includes(srcNode.type || "")
            ) {
              imageEdgeCount++;
            }
          });
          const srcNode = nodesRef.current.find((n) => n.id === edge.source);
          if (
            srcNode &&
            [
              "imageNode",
              "mediaNode",
              "photoEditorNode",
              "imageEditorNode",
              "imageShotNode",
            ].includes(srcNode.type || "")
          ) {
            if (imageEdgeCount >= 9) {
              continue;
            }
          }
        }
        nextEds = addEdge(edge, nextEds);
      }

      return nextEds;
    });
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const targetNode = nodesRef.current.find((n) => n.id === connection.target);
      if (!targetNode) return true;
      if (targetNode.type === "videoShotNode") {
        if (connection.targetHandle && connection.targetHandle.startsWith("target-video")) {
          const vMode = (targetNode.data as any)?.shot?.videoInputMode || "t2v";
          if (vMode === "t2v") {
            return false;
          }
        }
      }
      const normalized = normalizeNative3dConnection(connection, nodesRef.current);
      const validation = validateNative3dConnection(normalized, nodesRef.current);
      if (!validation.ok) return false;
      return true;
    },
    []
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: any) => {
      if (!connectionState.isValid) {
        let clientX, clientY;
        if ("changedTouches" in event) {
          clientX = event.changedTouches[0].clientX;
          clientY = event.changedTouches[0].clientY;
        } else {
          clientX = (event as MouseEvent).clientX;
          clientY = (event as MouseEvent).clientY;
        }

        const target = document.elementFromPoint(
          clientX,
          clientY,
        ) as HTMLElement;
        const dropTarget = target?.closest("[data-drop-target]");
        if (dropTarget) {
          const poolType = dropTarget.getAttribute("data-drop-target");
          const targetNodeId = dropTarget.getAttribute("data-node-id");

          if (poolType && targetNodeId && connectionState.fromNode?.id) {
            const sourceNode = nodesRef.current.find(
              (n) => n.id === connectionState.fromNode.id,
            );
            let edgesToAdd: Edge[] = [];

            if (sourceNode?.selected) {
              const selectedNodes = nodesRef.current.filter(
                (n) => n.selected && n.id !== targetNodeId,
              );
              selectedNodes.forEach((node) => {
                edgesToAdd.push({
                  id: `e-${node.id}-${targetNodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  source: node.id,
                  sourceHandle: connectionState.fromHandle?.id,
                  target: targetNodeId,
                  targetHandle: "target",
                  type: "deletable",
                  animated: true,
                  style: { stroke: "#8b5cf6", strokeWidth: 3 },
                  data: { poolType },
                } as Edge);
              });
            } else {
              edgesToAdd.push({
                id: `e-${connectionState.fromNode.id}-${targetNodeId}-${Date.now()}`,
                source: connectionState.fromNode.id,
                sourceHandle: connectionState.fromHandle?.id,
                target: targetNodeId,
                targetHandle: "target",
                type: "deletable",
                animated: true,
                style: { stroke: "#8b5cf6", strokeWidth: 3 },
                data: { poolType },
              } as Edge);
            }

            setEdges((eds) => {
              let nextEds = [...eds];
              edgesToAdd.forEach((edge) => {
                nextEds = addEdge(edge, nextEds);
              });
              return nextEds;
            });
          }
        }
      }
    },
    [setEdges],
  );

  // Optimized Data Propagation Engine
  // This effect automatically synchronizes data between connected nodes
  useEffect(() => {
    // CRITICAL: Do not propagate if the update came from the server
    if (nodes.length === 0 || edges.length === 0 || isRemoteUpdate.current)
      return;

    const timeoutId = setTimeout(() => {
      // Re-check conditions after timeout
      if (isRemoteUpdate.current) return;

      setNodes((nds) => {
        let changed = false;
        const nextNodes = nds.map((targetNode) => {
          // Find all edges pointing to this node
          const incomingEdges = edges.filter((e) => e.target === targetNode.id);
          if (incomingEdges.length === 0) return targetNode;

          let updatedData = { ...targetNode.data };
          let nodeChanged = false;

          let accumulatedShotUpdates: Partial<Shot> = {};
          let imageNodeUpdated = false;
          let scriptNodeUpdated = false;

          // Build desired state from all incoming edges
          let desiredShotState: Partial<Shot> = {};
          let desiredIncomingRefImages: string[] = [];

          incomingEdges.forEach((edge) => {
            const sourceNode = nds.find((n) => n.id === edge.source);
            if (!sourceNode) return;

            // Logic based on source and target types
            if (
              targetNode.type === "imageShotNode" ||
              targetNode.type === "videoShotNode"
            ) {
              // Get source image URL if applicable
              let sourceImageUrl: string | null = null;
              const sourceData = sourceNode.data as any;
              if (
                sourceNode.type === "mediaNode" &&
                sourceData.type === "image"
              ) {
                sourceImageUrl = sourceData.url;
              } else if (
                sourceNode.type === "imageNode" ||
                sourceNode.type === "photoEditorNode" ||
                sourceNode.type === "imageEditorNode"
              ) {
                sourceImageUrl = sourceData.url;
              } else if (
                sourceNode.type === "imageShotNode" &&
                sourceData.shot?.imageUrl
              ) {
                sourceImageUrl = sourceData.shot.imageUrl;
              }

              // Route data based on source type
              if (sourceNode.type === "scriptNode") {
                // Script Analyzer -> Shot: Sync prompt, characters, scene
                if (targetNode.type === "videoShotNode") {
                  if (sourceData.prompt)
                    desiredShotState.videoPrompt = sourceData.prompt;
                } else {
                  if (sourceData.prompt)
                    desiredShotState.imagePrompt = sourceData.prompt;
                }
                if (sourceData.characters)
                  desiredShotState.characterDescription = sourceData.characters;
                if (sourceData.scene)
                  desiredShotState.sceneDescription = sourceData.scene;
                if (sourceData.script)
                  desiredShotState.description = sourceData.script;
              } else if (sourceNode.type === "textNode") {
                // Text Node -> Shot: Sync description
                if (sourceData.text !== undefined)
                  desiredShotState.description = sourceData.text;
              } else if (sourceImageUrl) {
                // Image Source -> Shot: Route to primary image slot
                if (targetNode.type === "imageShotNode") {
                  if (!desiredShotState.referenceImages) {
                    desiredShotState.referenceImages = [
                      ...((targetNode.data.shot as any)
                        ?.uploadedReferenceImages || []),
                    ];
                  }
                  if (
                    !desiredShotState.referenceImages.includes(
                      sourceImageUrl,
                    ) &&
                    desiredShotState.referenceImages.length < 9
                  ) {
                    desiredShotState.referenceImages.push(sourceImageUrl);
                  }
                } else {
                  // For video shots, route to specific slot based on edge data or handle name, default to videoReferenceImage
                  let vMode = (targetNode.data as any)?.shot?.videoInputMode || "t2v";
                  if (vMode === "all") vMode = "i2v";
                  if (vMode === "t2v") {
                    return; // Ignore image connections in Text-to-Video mode
                  }

                  let poolType = (edge.data?.poolType as string) || "videoReferenceImage";
                  if (edge.targetHandle && edge.targetHandle.startsWith("target-") && edge.targetHandle !== "target-description") {
                    poolType = edge.targetHandle.replace("target-", "");
                  }
                  
                  // The last edge overwrites previous ones for the same poolType
                  (desiredShotState as any)[poolType] = sourceImageUrl;

                  if (poolType === "videoReferenceImage") {
                    desiredIncomingRefImages.push(sourceImageUrl);
                  }
                }
              }
            } else if (targetNode.type === "videoProjectNode") {
              const incomingVideos: string[] = [];
              incomingEdges.forEach((edge) => {
                const sourceNode = nds.find((n) => n.id === edge.source);
                if (!sourceNode) return;
                const sourceData = sourceNode.data as any;
                if (
                  sourceNode.type === "videoShotNode" &&
                  sourceData.shot?.videoUrl
                ) {
                  incomingVideos.push(sourceData.shot.videoUrl);
                } else if (
                  sourceNode.type === "imageShotNode" &&
                  sourceData.shot?.imageUrl
                ) {
                  incomingVideos.push(sourceData.shot.imageUrl);
                } else if (sourceNode.type === "imageNode" && sourceData.url) {
                  incomingVideos.push(sourceData.url);
                } else if (sourceNode.type === "mediaNode" && sourceData.url) {
                  incomingVideos.push(sourceData.url);
                }
              });

              const currentIncoming =
                (targetNode.data.incomingVideos as string[]) || [];
              if (
                JSON.stringify(incomingVideos) !==
                JSON.stringify(currentIncoming)
              ) {
                updatedData.incomingVideos = incomingVideos;
                nodeChanged = true;
              }
            } else if (targetNode.type === "imageNode") {
              if (imageNodeUpdated) return; // Only process the first valid image source to prevent oscillation
              // Any image source -> Image Node: Update image URL
              let sourceImageUrl: string | null = null;
              const sourceData = sourceNode.data as any;
              if (
                sourceNode.type === "mediaNode" &&
                sourceData.type === "image"
              ) {
                sourceImageUrl = sourceData.url;
              } else if (
                sourceNode.type === "imageNode" ||
                sourceNode.type === "photoEditorNode" ||
                sourceNode.type === "imageEditorNode"
              ) {
                sourceImageUrl = sourceData.url;
              } else if (
                sourceNode.type === "imageShotNode" &&
                sourceData.shot?.imageUrl
              ) {
                sourceImageUrl = sourceData.shot.imageUrl;
              }

              if (sourceImageUrl) {
                imageNodeUpdated = true;
                if (targetNode.data.url !== sourceImageUrl) {
                  updatedData.url = sourceImageUrl;
                  nodeChanged = true;
                }
              }
            } else if (targetNode.type === "scriptNode") {
              if (scriptNodeUpdated) return; // Only process the first text source to prevent oscillation
              // Text Node -> Script Analyzer: Sync script content
              if (
                sourceNode.type === "textNode" &&
                sourceNode.data.text !== undefined
              ) {
                scriptNodeUpdated = true;
                if (targetNode.data.script !== sourceNode.data.text) {
                  updatedData.script = sourceNode.data.text;
                  nodeChanged = true;
                }
              }
            }
          });

          if (
            targetNode.type === "imageEditorNode" ||
            targetNode.type === "photoEditorNode"
          ) {
            const incomingImages: string[] = [];
            incomingEdges.forEach((edge) => {
              const sourceNode = nds.find((n) => n.id === edge.source);
              if (!sourceNode) return;
              const sourceData = sourceNode.data as any;
              if (
                sourceNode.type === "mediaNode" &&
                sourceData.type === "image" &&
                sourceData.url
              ) {
                incomingImages.push(sourceData.url);
              } else if (
                (sourceNode.type === "imageNode" ||
                  sourceNode.type === "photoEditorNode" ||
                  sourceNode.type === "imageEditorNode") &&
                sourceData.url
              ) {
                incomingImages.push(sourceData.url);
              } else if (
                sourceNode.type === "imageShotNode" &&
                sourceData.shot?.imageUrl
              ) {
                incomingImages.push(sourceData.shot.imageUrl);
              }
            });

            const currentIncoming =
              (targetNode.data.incomingImages as string[]) || [];
            if (
              JSON.stringify(incomingImages) !== JSON.stringify(currentIncoming)
            ) {
              updatedData.incomingImages = incomingImages;
              nodeChanged = true;
            }
          }

          if (
            targetNode.type === "imageShotNode" ||
            targetNode.type === "videoShotNode"
          ) {
            const shot = (updatedData.shot || targetNode.data.shot) as Shot;

            // Compare desired state with current state
            let hasActualChanges = false;
            let actualUpdates: Partial<Shot> = {};

            for (const key in desiredShotState) {
              const newValue = (desiredShotState as any)[key];
              const oldValue = (shot as any)[key];
              if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
                hasActualChanges = true;
                (actualUpdates as any)[key] = newValue;
              }
            }

            if (hasActualChanges) {
              updatedData.shot = { ...shot, ...actualUpdates };
              nodeChanged = true;
            }

            if (targetNode.type === "videoShotNode") {
              const currentIncoming =
                (targetNode.data.incomingRefImages as string[]) || [];
              if (
                JSON.stringify(desiredIncomingRefImages) !==
                JSON.stringify(currentIncoming)
              ) {
                updatedData.incomingRefImages = desiredIncomingRefImages;
                nodeChanged = true;
              }
            }
          }

          if (nodeChanged) {
            changed = true;
            return { ...targetNode, data: updatedData };
          }
          return targetNode;
        });

        if (changed) {
          // We no longer need the isPropagating hack because we check for actual changes
          return nextNodes;
        }
        return nds;
      });
    }, 100); // Debounce propagation to stabilize connections

    return () => clearTimeout(timeoutId);
  }, [nodes, edges]);

  const handleShotImageUpload = (
    shotId: string,
    type:
      | "productImages"
      | "characterImages"
      | "sceneImages"
      | "videoReferenceImage"
      | "videoLastFrameImage"
      | "videoReferenceVideo"
      | "videoReferenceImages"
      | "videoReferenceVideos"
      | "referenceImages",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      const promises = files.map((file) => {
        return new Promise<string>(async (resolve) => {
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/upload", formData, {
              headers: { "Content-Type": "multipart/form-data" },
              showToast: false,
            } as any);
            resolve(res.data.url);
          } catch (err) {
            console.warn(
              "Upload to server failed, falling back to Base64",
              err,
            );
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          }
        });
      });
      Promise.all(promises).then((uploadedUrls) => {
        uploadedUrls.forEach((img) => {
          if (
            type !== "videoReferenceVideo" &&
            type !== "videoReferenceVideos"
          ) {
            window.dispatchEvent(
              new CustomEvent("add-to-history", {
                detail: {
                  type: "image",
                  url: img,
                  prompt: "Uploaded Image",
                  source: "uploaded",
                },
              }),
            );
          }
        });
        setNodes((nds) =>
          nds.map((n) => {
            const data = n.data as any;
            if (
              (n.type === "imageShotNode" || n.type === "videoShotNode") &&
              data.shot?.id === shotId
            ) {
              const s = data.shot;

              // Handle plural types or types that should be plural
              if (
                type === "videoReferenceImages" ||
                type === "videoReferenceVideos" ||
                type === "productImages" ||
                type === "characterImages" ||
                type === "sceneImages" ||
                type === "referenceImages"
              ) {
                const existing = s[type] || [];
                const newUrls = [...existing, ...uploadedUrls];

                const updates: any = {
                  [type]:
                    type === "referenceImages" ? newUrls.slice(0, 9) : newUrls,
                  ...(type === "videoReferenceImages" &&
                    !s.videoReferenceImage && {
                      videoReferenceImage: uploadedUrls[0],
                    }),
                  ...(type === "videoReferenceVideos" &&
                    !s.videoReferenceVideo && {
                      videoReferenceVideo: uploadedUrls[0],
                    }),
                };

                if (type === "referenceImages") {
                  const existingUploaded = s.uploadedReferenceImages || [];
                  updates.uploadedReferenceImages = [
                    ...existingUploaded,
                    ...uploadedUrls,
                  ].slice(0, 9);
                }

                return {
                  ...n,
                  data: {
                    ...data,
                    shot: {
                      ...s,
                      ...updates,
                    },
                  },
                };
              }

              if (
                type === "videoReferenceImage" ||
                type === "videoLastFrameImage" ||
                type === "videoReferenceVideo"
              ) {
                return {
                  ...n,
                  data: {
                    ...data,
                    shot: {
                      ...s,
                      [type]: uploadedUrls[0],
                      // Also update plural if applicable
                      ...(type === "videoReferenceImage" && {
                        videoReferenceImages: [
                          ...(s.videoReferenceImages || []),
                          ...uploadedUrls,
                        ],
                      }),
                      ...(type === "videoReferenceVideo" && {
                        videoReferenceVideos: [
                          ...(s.videoReferenceVideos || []),
                          ...uploadedUrls,
                        ],
                      }),
                    },
                  },
                };
              }
            }
            return n;
          }),
        );
      });
    }
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    const sourceProjectId =
      generatingShotProjectMap.current.get(id) ?? currentProjectRef.current;

    // 1. Update React state if the project is still open
    if (sourceProjectId === currentProjectRef.current) {
      setNodes((nds) =>
        nds.map((n) => {
          const data = n.data as any;
          if (
            (n.type === "imageShotNode" || n.type === "videoShotNode") &&
            data.shot?.id === id
          ) {
            // Status protection: don't revert from done/error to generating unless explicit
            const currentShot = data.shot as Shot;
            const hasResult = !!(
              currentShot.imageUrl ||
              (currentShot.imageUrls && currentShot.imageUrls.length > 0) ||
              currentShot.videoUrl
            );

            let finalUpdates = { ...updates };

            // Status protection: prevent reverting to "generating" if we already have a result,
            // unless this is a clear intention to start a new generation (e.g. progress is 0)
            if (
              hasResult &&
              (updates.status === "generating_image" ||
                updates.status === "pending" ||
                updates.status === "generating_video")
            ) {
              const isStartingNew =
                updates.progress === 0 ||
                updates.imageUrl === null ||
                (updates as any).imageUrl === "";
              if (!isStartingNew) {
                delete finalUpdates.status;
              }
            }

            if (
              n.type === "videoShotNode" &&
              updates.videoInputMode &&
              updates.videoInputMode !== data.shot.videoInputMode
            ) {
              // Disconnect image edges when switching input modes
              setEdges((eds) =>
                eds.filter((e) => {
                  if (
                    e.target === n.id &&
                    (e.targetHandle === "target-videoReferenceImage" ||
                      e.targetHandle === "target-videoLastFrameImage")
                  ) {
                    return false;
                  }
                  return true;
                }),
              );

              // Clear the image data
              updates.videoReferenceImage = "";
              updates.videoLastFrameImage = "";

              return {
                ...n,
                data: {
                  ...data,
                  incomingRefImages: [],
                  shot: { ...data.shot, ...finalUpdates },
                },
              };
            }

            return {
              ...n,
              data: {
                ...data,
                shot: { ...data.shot, ...finalUpdates },
              },
            };
          }
          return n;
        }),
      );
    }

    // 2. Direct DB Sync using websocket (skipped when projects are stored locally)
    if (sourceProjectId && !projectsLocal) {
      socket.emit(
        "update_shot",
        { projectId: sourceProjectId, shotId: id, updates },
        (response: any) => {
          if (response && response.error) {
            console.error(
              "Failed to sync shot updates to db directly:",
              response.error,
            );
          }
        },
      );
    }
  };

  const analyzeScript = async (ai: any) => {
    setProgressText("Analyzing script and generating storyboard...");
    const model = ai.getGenerativeModel({
      model: textModel,
      systemInstruction:
        "You are jepow AI, an expert at analyzing scripts and generating detailed storyboard shots. Your goal is to break down a script into visual shots with descriptions and image prompts.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              shotNumber: {
                type: Type.INTEGER,
                description: "The sequential number of the shot",
              },
              description: {
                type: Type.STRING,
                description:
                  "The description of the action in the original language",
              },
              imagePrompt: {
                type: Type.STRING,
                description: "The highly detailed English image prompt",
              },
            },
            required: ["shotNumber", "description", "imagePrompt"],
          },
        },
      },
    });

    const result = await model.generateContent(
      `You are a professional animation director. Analyze the following animation script. Break down the script into a sequence of storyboard shots. For each shot, provide a shotNumber, a description of the action, and an imagePrompt. The description MUST be in the original language of the script (e.g., Chinese if the script is in Chinese). The imagePrompt MUST be in English, highly detailed, and optimized for the jepow Pro image generation model to generate the storyboard frame.\n\nScript:\n${script}`,
    );
    const response = await result.response;

    if ((response as any)._remainingCredits !== undefined) {
      setUser((prev) =>
        prev ? { ...prev, credits: (response as any)._remainingCredits } : null,
      );
    }

    const center = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        })
      : { x: 0, y: 0 };

    const text = response.text() || "[]";
    const cleanedText =
      text
        .replace(/```json\n?/gi, "")
        .replace(/```\n?/g, "")
        .trim() || "[]";
    let parsed = [];
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse storyboard JSON:", e, cleanedText);
      parsed = [];
    }
    const newNodes: Node[] = parsed.map((s: any, index: number) => {
      const id = Math.random().toString(36).substring(7);
      const shot: Shot = {
        id,
        shotNumber: s.shotNumber,
        description: s.description,
        imagePrompt: s.imagePrompt,
        status: "pending",
        aspectRatio: "16:9",
        resolution: "1K",
        numberOfImages: 1,
        type: "image",
      };

      // Calculate position in a grid or line relative to center
      const x = center.x + (index % 3) * 450;
      const y = center.y + Math.floor(index / 3) * 850;

      return {
        id: `${id}-image`,
        type: "imageShotNode",
        position: { x, y },
        data: { shot },
      };
    });

    setNodes((prev) => [...prev, ...newNodes]);
    return newNodes.map((n) => n.data.shot);
  };

  const sanitizeBaseUrl = (url: string) => {
    if (!url) return undefined;
    // Remove trailing slashes and common version suffixes that the SDK appends automatically
    return url.replace(/\/+$/, "").replace(/\/(v1|v1beta)$/, "");
  };

  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const getGenAI = (key?: string, baseUrl?: string): any => {
    return {
      getGenerativeModel: (modelOptions: any) => {
        return {
          generateContent: async (params: any) => {
            let prompt = "";
            let referenceImage = undefined;

            if (typeof params === "string") {
              prompt = params;
            } else if (params.contents) {
              const content = params.contents[0];
              prompt =
                content?.parts
                  ?.map((p: any) => p.text)
                  .filter(Boolean)
                  .join("\n") || "";

              // Find any inlineData for image
              const inlinePart = content?.parts?.find((p: any) => p.inlineData);
              if (inlinePart) {
                referenceImage = `data:${inlinePart.inlineData.mimeType};base64,${inlinePart.inlineData.data}`;
              }
            }

            // Allow system instructions to be prepended
            if (modelOptions.systemInstruction) {
              prompt = `System: ${modelOptions.systemInstruction}\n\nUser: ${prompt}`;
            }

            const isMatrixModel = modelOptions.model?.startsWith("deepseek");

            const reqBody: any = {
              model: modelOptions.model,
              prompt: prompt || "hello",
              tools: modelOptions.tools,
            };

            if (referenceImage) {
              reqBody.referenceImage = referenceImage;
            }

            const endpoint = isMatrixModel
              ? `/matrix-proxy/${modelOptions.model}`
              : "/omni-router/generate";
            const response = await api.post(endpoint, reqBody);
            const data = response.data;

            let responseText = "";
            let functionCallsResult: any[] = [];

            if (isMatrixModel) {
              // OpenAI standard format
              if (data.choices && data.choices[0]?.message) {
                responseText = data.choices[0].message.content || "";
                if (data.choices[0].message.tool_calls) {
                  functionCallsResult = data.choices[0].message.tool_calls.map(
                    (tc: any) => ({
                      name: tc.function.name,
                      args: JSON.parse(tc.function.arguments || "{}"),
                    }),
                  );
                }
              } else if (data.error) {
                throw new Error(data.error.message || data.error);
              } else {
                responseText = JSON.stringify(data);
              }
            } else {
              if (!data.success) {
                throw new Error(data.message || "Omni-Router gateway error");
              }
              responseText = data.text;
            }

            return {
              response: {
                functionCalls: () => functionCallsResult,
                text: () => responseText,
                _remainingCredits: 999999,
              },
            };
          },
          startChat: (chatOptions: any) => {
            // Mock startChat with single turn fallback
            let history = chatOptions.history || [];
            return {
              sendMessage: async (message: any) => {
                let msgText = "";
                if (typeof message === "string") {
                  msgText = message;
                } else if (Array.isArray(message)) {
                  msgText =
                    "System Action Details:\n" +
                    JSON.stringify(message) +
                    "\n\n(Action applied, you can reply directly now.)";
                } else if (message?.message) {
                  msgText = message.message;
                } else {
                  msgText = JSON.stringify(message);
                }

                const isMatrixModel =
                  modelOptions.model?.startsWith("deepseek");

                const apiMessages: any[] = [];
                if (modelOptions.systemInstruction) {
                  apiMessages.push({
                    role: "system",
                    content: String(modelOptions.systemInstruction),
                  });
                }
                history.forEach((h: any) => {
                  const content = (
                    h.parts?.[0]?.text ||
                    h.content ||
                    ""
                  ).trim();
                  if (content) {
                    apiMessages.push({
                      role: h.role === "model" ? "assistant" : "user",
                      content: content,
                    });
                  }
                });
                apiMessages.push({ role: "user", content: msgText });

                const reqBody: any = {
                  model: modelOptions.model,
                  messages: apiMessages,
                  prompt: isMatrixModel
                    ? msgText
                    : `History context: ${JSON.stringify(history)}\n\nUser: ${msgText}`,
                  tools: modelOptions.tools,
                };

                const endpoint = isMatrixModel
                  ? `/matrix-proxy/${modelOptions.model}`
                  : "/omni-router/generate";
                const response = await api.post(endpoint, reqBody);

                const data = response.data;
                let responseText = "";
                let functionCallsResult: any[] = [];

                if (isMatrixModel) {
                  if (data.choices && data.choices[0]?.message) {
                    responseText = data.choices[0].message.content || "";
                    if (data.choices[0].message.tool_calls) {
                      functionCallsResult =
                        data.choices[0].message.tool_calls.map((tc: any) => ({
                          name: tc.function.name,
                          args: JSON.parse(tc.function.arguments || "{}"),
                        }));
                    }
                  } else if (data.error) {
                    throw new Error(data.error.message || data.error);
                  } else {
                    responseText = JSON.stringify(data);
                  }
                } else {
                  if (!data.success) {
                    throw new Error(
                      data.message || "Omni-Router gateway error",
                    );
                  }
                  responseText = data.text;
                }

                history.push({ role: "user", parts: [{ text: msgText }] });
                history.push({
                  role: "model",
                  parts: [{ text: responseText }],
                });

                return {
                  response: {
                    functionCalls: () => functionCallsResult,
                    text: () => responseText,
                    _remainingCredits: 999999,
                  },
                };
              },
            };
          },
        };
      },
    };
  };

  const testjepowConnection = async () => {
    setTestStatus("testing");
    setTestError(null);
    try {
      const ai = getGenAI();
      const model = ai.getGenerativeModel({
        model: textModel,
        systemInstruction:
          "You are jepow AI, checking if the connection is working.",
      });
      const result = await model.generateContent("Hello, are you working?");
      const response = await result.response;

      // Update credits if returned
      if ((response as any)._remainingCredits !== undefined) {
        setUser((prev) =>
          prev
            ? { ...prev, credits: (response as any)._remainingCredits }
            : null,
        );
      }

      const text = response.text();
      if (text) {
        setTestStatus("success");
        setTimeout(() => setTestStatus("idle"), 3000);
      } else {
        console.warn("No response text received from jepow AI");
        throw new Error("No response text received.");
      }
    } catch (e: any) {
      console.error("Connection test failed:", e);
      setTestStatus("error");
      setTestError(e.message || String(e));
    }
  };

  const generateImage = async (shot: Shot) => {
    generatingShotProjectMap.current.set(shot.id, currentProjectRef.current);
    const ai = getGenAI();
    updateShot(shot.id, {
      status: "generating_image",
      progress: 0,
      error: undefined,
    });

    const startTime = Date.now();
    const expectedDuration = 15000; // 15 seconds expected for image

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(
        95,
        Math.floor((elapsed / expectedDuration) * 100),
      );
      updateShot(shot.id, { progress: newProgress });
    }, 500);

    try {
      const productParts: any[] = [];
      const characterParts: any[] = [];
      const sceneParts: any[] = [];

      (shot.referenceImages || []).forEach((img) => {
        const category = shot.imageCategories?.[img] || "productImages";
        const parsed = parseDataUri(img);
        const part = {
          inlineData: { data: parsed.data, mimeType: parsed.mimeType },
        };
        if (category === "productImages") productParts.push(part);
        else if (category === "characterImages") characterParts.push(part);
        else if (category === "sceneImages") sceneParts.push(part);
      });

      const count = shot.numberOfImages || 1;
      let completedCount = 0;
      let lastErrorMessage = "";

      const generateSingleImage = async (index: number) => {
        try {
          const currentModel = (shot.imageModel && (shot.imageModel in IMAGE_MODELS)) 
            ? shot.imageModel 
            : (imageModel || "imagen-4.0-fast-generate-001");

          const ratio = shot.aspectRatio || "1:1";
          const res = shot.resolution || "1024x1024";

          let imageUrlsForPayload: string[] = [];
          if (shot.referenceImages && shot.referenceImages.length > 0) {
            for (const img of shot.referenceImages) {
              if (img.startsWith("data:")) {
                imageUrlsForPayload.push(img);
              } else if (img.startsWith("blob:")) {
                try {
                  const blobRes = await fetch(img);
                  const blob = await blobRes.blob();
                  const base64 = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    },
                  );
                  imageUrlsForPayload.push(base64);
                } catch (e) {
                  console.error("Failed to convert blob URL to base64", e);
                }
              } else {
                imageUrlsForPayload.push(
                  img.startsWith("/") ? window.location.origin + img : img,
                );
              }
            }
          }

          const isGemini = currentModel.includes("gemini-3");
          const isImagen = currentModel.includes("imagen-3") || currentModel.includes("imagen-4");
          const isDALLE = currentModel === "dall-e-3";

          let payloadObj: any = {
            model: currentModel,
            prompt:
              shot.imagePrompt ||
              shot.description ||
              "masterpiece, high quality",
          };

          if (isDALLE) {
            payloadObj.quality = shot.resolution === "hd" ? "hd" : "standard";
            payloadObj.size =
              ratio === "1:1"
                ? "1024x1024"
                : ratio === "16:9"
                  ? "1792x1024"
                  : "1024x1792";
          } else {
            if (ratio && ratio !== "") {
              payloadObj.aspectRatio = ratio;
              payloadObj.aspect_ratio = ratio;

              // Standardize 'size' based on ratio for compatibility with OpenAI-like integrations (like Doubao/Omni)
              if (ratio === "1:1") {
                payloadObj.size =
                  shot.resolution === "4K"
                    ? "2048x2048"
                    : shot.resolution === "2K"
                      ? "1024x1024"
                      : "1024x1024";
                payloadObj.width = shot.resolution === "4K" ? 2048 : 1024;
                payloadObj.height = shot.resolution === "4K" ? 2048 : 1024;
              } else if (ratio === "16:9") {
                payloadObj.size =
                  shot.resolution === "4K"
                    ? "3840x2160"
                    : shot.resolution === "2K"
                      ? "2560x1440"
                      : "1280x720";
                payloadObj.width =
                  shot.resolution === "4K"
                    ? 3840
                    : shot.resolution === "2K"
                      ? 2560
                      : 1280;
                payloadObj.height =
                  shot.resolution === "4K"
                    ? 2160
                    : shot.resolution === "2K"
                      ? 1440
                      : 720;
              } else if (ratio === "9:16") {
                payloadObj.size =
                  shot.resolution === "4K"
                    ? "2160x3840"
                    : shot.resolution === "2K"
                      ? "1440x2560"
                      : "720x1280";
                payloadObj.width =
                  shot.resolution === "4K"
                    ? 2160
                    : shot.resolution === "2K"
                      ? 1440
                      : 720;
                payloadObj.height =
                  shot.resolution === "4K"
                    ? 3840
                    : shot.resolution === "2K"
                      ? 2560
                      : 1280;
              } else if (ratio === "4:3") {
                payloadObj.size =
                  shot.resolution === "4K"
                    ? "2048x1536"
                    : shot.resolution === "2K"
                      ? "1024x768"
                      : "1024x768";
                payloadObj.width = shot.resolution === "4K" ? 2048 : 1024;
                payloadObj.height = shot.resolution === "4K" ? 1536 : 768;
              } else if (ratio === "3:4") {
                payloadObj.size =
                  shot.resolution === "4K"
                    ? "1536x2048"
                    : shot.resolution === "2K"
                      ? "768x1024"
                      : "768x1024";
                payloadObj.width = shot.resolution === "4K" ? 1536 : 768;
                payloadObj.height = shot.resolution === "4K" ? 2048 : 1024;
              } else {
                payloadObj.size = "1024x1024";
                payloadObj.width = 1024;
                payloadObj.height = 1024;
              }
            }

            payloadObj.imageSize = (shot.resolution || "1K").toUpperCase();
            payloadObj.image_size = payloadObj.imageSize;
          }

          if (imageUrlsForPayload.length > 0) {
            const refImg = imageUrlsForPayload[0];
            if (isDALLE) {
              // DALL-E doesn't natively support image reference in standard API,
              // but some proxies use 'image' or 'image_url' or 'image_urls'
              payloadObj.image = refImg;
            } else {
              payloadObj.referenceImage = refImg;
            }
          }

          const response = await api.post(`/matrix-proxy/${currentModel}`, {
            payload: payloadObj,
          });
          const resData = response.data;
          console.log(
            `[matrix-proxy] Response for ${currentModel} (Task ${index}):`,
            resData,
          );

          const choicesContent =
            resData.choices?.[0]?.message?.content ||
            resData.choices?.[0]?.text;
          const dataImg = resData.data?.[0];
          const hasGeminiCandidates =
            resData.candidates?.[0]?.content?.parts?.[0] !== undefined;

          let url = undefined;
          let isTaskAsync = false;
          let taskIdStr = resData.task_id || resData.id;

          if (!taskIdStr && Array.isArray(resData) && resData.length > 0) {
            taskIdStr = resData[0].task_id;
          } else if (
            !taskIdStr &&
            resData.data &&
            Array.isArray(resData.data) &&
            resData.data.length > 0
          ) {
            taskIdStr = resData.data[0].task_id;
          }

          if (taskIdStr) {
            isTaskAsync = true;
            url = await new Promise<string>((resolve, reject) => {
              let attempts = 0;
              const interval = setInterval(async () => {
                attempts++;
                if (attempts > 60) {
                  clearInterval(interval);
                  reject(
                    new Error("Timeout waiting for image generation task"),
                  );
                  return;
                }
                try {
                  const pollRes = await api.post(
                    `/matrix-proxy/${currentModel}`,
                    {
                      method: "GET",
                      path: `v1/tasks/${taskIdStr}`,
                      payload: {},
                    },
                  );
                  const pData = pollRes.data;

                  const taskStatus =
                    pData.status ||
                    pData.data?.status ||
                    pData.data?.[0]?.status;
                  const isSuccess =
                    taskStatus === "SUCCESS" ||
                    taskStatus === "SUCCEEDED" ||
                    taskStatus === "finished" ||
                    taskStatus === "success";
                  const isFail =
                    taskStatus === "FAILED" ||
                    taskStatus === "FAIL" ||
                    taskStatus === "failed";

                  let finalUrl =
                    pData.url ||
                    pData.imageUrl ||
                    pData.image ||
                    pData.image_url ||
                    pData.data?.url ||
                    pData.data?.image_url ||
                    pData.data?.[0]?.url ||
                    pData.data?.[0]?.image_url;
                  if (!finalUrl && pData.images?.[0])
                    finalUrl =
                      typeof pData.images[0] === "string"
                        ? pData.images[0]
                        : pData.images[0].url;

                  if (isFail) {
                    clearInterval(interval);
                    reject(new Error(`Task failed: ${JSON.stringify(pData)}`));
                  } else if (isSuccess || finalUrl) {
                    clearInterval(interval);
                    resolve(finalUrl || "");
                  }
                } catch (e: any) {
                  console.error("Poll error:", e);
                  if (e.response?.status !== 404 && attempts > 30) {
                    clearInterval(interval);
                    reject(e);
                  }
                }
              }, 3000);
            });
          } else if (
            dataImg?.url ||
            dataImg?.b64_json ||
            resData.url ||
            resData.imageUrl ||
            resData.image ||
            resData.image_url ||
            resData.image_urls?.[0] ||
            choicesContent ||
            hasGeminiCandidates
          ) {
            url =
              dataImg?.url ||
              resData.url ||
              resData.imageUrl ||
              resData.image ||
              resData.image_url ||
              resData.image_urls?.[0];

            if (!url && resData.images && resData.images[0]) {
              const img = resData.images[0];
              url = typeof img === "string" ? img : img.url;
            }
            if (!url && resData.results && resData.results[0]) {
              url = resData.results[0].url || resData.results[0].image;
            }
            if (!url && dataImg?.b64_json) {
              url = `data:image/png;base64,${dataImg.b64_json}`;
            }
            if (!url && choicesContent) {
              const mdMatch = choicesContent.match(
                /!\[.*?\]\((https?:\/\/[^\s\)\"\']+)\)/,
              );
              if (mdMatch) url = mdMatch[1];
              else {
                const httpMatch = choicesContent.match(
                  /https?:\/\/[^\s\)\"\']+/,
                );
                if (httpMatch) url = httpMatch[0].replace(/[\"\'\>]/g, "");
              }
            }
            if (!url && resData.candidates?.[0]?.content?.parts?.[0]) {
              const part = resData.candidates[0].content.parts[0];
              if (part.inlineData?.data) {
                url = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
              } else if (part.text) {
                const match = part.text.match(/https?:\/\/[^\s\)]+/);
                if (match) url = match[0].replace(/[\"\'\>\*]/g, "");
              }
            }
          }

          if (!url) {
            console.error(
              "Unparseable response data:",
              JSON.stringify(resData),
            );
            let apiError = resData.error || resData.message || resData.details;
            if (
              !apiError &&
              resData.rawResponse &&
              resData.rawResponse.toLowerCase().includes("doctype html")
            ) {
              apiError =
                "中转网关没有返回有效的接口数据，而是返回了一个网页 (HTML)。请检查你的 API Base 链接是否正确。";
            }
            throw new Error(
              apiError
                ? `[矩阵报错] ${typeof apiError === "object" ? JSON.stringify(apiError) : apiError}`
                : "Could not parse image URL from matrix response.",
            );
          }

          // Convert any base64 generated images into uploaded backend files to prevent massive payload size on save.
          if (url && url.startsWith("data:image/")) {
            try {
              let uploadSuccess = false;
              if (socket.connected) {
                try {
                  const socketRes = await new Promise<any>(
                    (resolve, reject) => {
                      socket.emit(
                        "upload_image",
                        { base64: url, filename: "generated.png" },
                        (response: any) => {
                          if (response?.error) {
                            reject(new Error(response.error));
                          } else {
                            resolve(response);
                          }
                        },
                      );
                      setTimeout(
                        () => reject(new Error("WebSocket upload timeout")),
                        180000,
                      );
                    },
                  );
                  if (socketRes && socketRes.url) {
                    url = socketRes.url;
                    uploadSuccess = true;
                  }
                } catch (e) {
                  console.warn(
                    "Socket upload failed, falling back to HTTP:",
                    e,
                  );
                }
              }

              if (!uploadSuccess) {
                const bRes = await fetch(url);
                const blob = await bRes.blob();
                const formData = new FormData();
                formData.append("file", blob, "generated.png");
                const uploadRes = await api.post("/upload", formData, {
                  headers: { "Content-Type": "multipart/form-data" },
                  showToast: false,
                } as any);
                if (uploadRes.data && uploadRes.data.url) {
                  url = uploadRes.data.url;
                }
              }
            } catch (err) {
              console.error(
                "Failed to upload base64 generated image, defaulting to base64 fallback:",
                err,
              );
            }
          }

          addToHistory({
            type: "image",
            url: url,
            prompt: shot.imagePrompt || "Image generation",
          });

          if (resData.data?._remainingCredits !== undefined) {
            setUser((prev) =>
              prev
                ? { ...prev, credits: resData.data._remainingCredits }
                : null,
            );
          }

          return url;
        } catch (e: any) {
          console.error("Error generating image:", e);

          let errorMessage =
            e.response?.data?.error ||
            e.response?.data?.message ||
            e.message ||
            String(e);
          // If the gateway threw an HTML page, e.response.data would be string, and we need to detect 502
          if (
            typeof e.response?.data === "string" &&
            (e.response?.status === 502 || e.response?.data.includes("502"))
          ) {
            errorMessage =
              "API Error: 中转服务器 (APIMart等) 发生 502 Bad Gateway 丢弃了请求。可能是不支持该比例或分辨率。";
          } else if (typeof errorMessage === "object") {
            errorMessage = JSON.stringify(errorMessage);
          }

          lastErrorMessage = errorMessage.includes("[矩阵报错]")
            ? errorMessage
            : `API Error: ${errorMessage}`;
          return null; // Return null on error so Promise.all completes
        }
      };

      const results = await Promise.all(
        Array.from({ length: count }).map((_, i) => generateSingleImage(i)),
      );

      const newImageUrls = results.filter((url): url is string => url !== null);

      if (newImageUrls.length > 0) {
        updateShot(shot.id, {
          imageUrls: [...newImageUrls],
          imageUrl: shot.imageUrl || newImageUrls[0],
          status: "image_done",
          progress: 100,
        });
      }

      if (newImageUrls.length === 0) {
        let finalError =
          lastErrorMessage ||
          "Could not generate image. Check console for details.";
        if (typeof finalError === "object")
          finalError = JSON.stringify(finalError);
        throw new Error(finalError);
      }

      clearInterval(progressInterval);
      // Final fallback update just in case
      updateShot(shot.id, {
        status: "image_done",
        imageUrl: newImageUrls[0],
        imageUrls: newImageUrls,
        progress: 100,
      });
      return newImageUrls[0];
    } catch (error: any) {
      clearInterval(progressInterval);
      let errorStr = error.message || String(error);
      if (typeof errorStr === "object") errorStr = JSON.stringify(errorStr);
      updateShot(shot.id, { status: "error", error: errorStr, progress: 0 });
      throw error;
    }
  };

  const extractStoryboard = async () => {
    if (!script.trim()) {
      setGlobalError("请输入您的灵感剧本。");
      return;
    }

    setGlobalError(null);
    setIsProcessing(true);
    setNodes((prev) =>
      prev.filter(
        (n) => n.type !== "imageShotNode" && n.type !== "videoShotNode",
      ),
    );

    try {
      const targetProjectId = currentProjectRef.current;
      const ai = getGenAI();
      await analyzeScript(ai);

      setProgressText("分镜解析完成！现在您可以继续编辑内容和提示词。");
      setShowScriptModal(false);
      setShouldAutoLayout(true);

      // Fire-and-forget save in case the user navigates away before debounce
      if (targetProjectId) {
        setTimeout(() => handleCloudSave(false).catch(console.error), 2000);
      }
    } catch (error: any) {
      setGlobalError(error.message || "提取过程发生错误。");
    } finally {
      setIsProcessing(false);
    }
  };

  const regeneratePrompt = async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;

    generatingShotProjectMap.current.set(shotId, currentProjectRef.current);
    updateShot(shotId, { status: "generating_prompt", error: undefined });
    try {
      const ai = getGenAI();
      const model = ai.getGenerativeModel({
        model: textModel,
        systemInstruction:
          "You are jepow AI, an expert at refining image prompts for high-quality generation.",
      });

      const productParts: any[] = [];
      const characterParts: any[] = [];
      const sceneParts: any[] = [];

      (shot.referenceImages || []).forEach((img) => {
        const category = shot.imageCategories?.[img] || "productImages";
        const parsed = parseDataUri(img);
        const part = {
          inlineData: { data: parsed.data, mimeType: parsed.mimeType },
        };
        if (category === "productImages") productParts.push(part);
        else if (category === "characterImages") characterParts.push(part);
        else if (category === "sceneImages") sceneParts.push(part);
      });

      const styleMap: Record<string, string> = {
        cinematic:
          "Cinematic, cinematic lighting, dramatic shadows, 8k, highly detailed movie shot.",
        vivid:
          "Vivid colors, high saturation, sharp focus, vibrant atmosphere.",
        natural:
          "Natural lighting, photorealistic, raw style, realistic textures, no filters.",
        studio:
          "Studio lighting, portrait setup, soft shadows, clean background, professional photography.",
        photorealistic:
          "Hyper-realistic, photorealistic, 8k, detailed skin textures, realistic materials.",
        creative:
          "Creative illustration, artistic style, unique color palette, stylized brushstrokes.",
      };

      const selectedStyleStr =
        styleMap[shot.imageStyle || "cinematic"] || styleMap.cinematic;

      const result = await model.generateContent({
        parts: [
          ...productParts,
          ...characterParts,
          ...sceneParts,
          {
            text: `You are an expert prompt engineer for ultra-high-end image generation. Based on the provided reference images and the storyboard description, write a masterpiece-level, highly detailed image generation prompt (in English). 
          
          Requirements:
          1. Style: ${selectedStyleStr}
          2. Details: Describe the characters' expressions, specific clothing, environmental details, textures, and atmosphere with sensory richness.
          3. Technical: Specify precise camera angles (e.g., anamorphic lens, low angle, medium shot) and complex lighting (e.g., chiaroscuro, rim lighting, neon-noir).
          4. Quality: Ensure the prompt implies extreme quality (e.g., highly detailed, masterpiece, 8k).
          
          Description: ${shot.description}
          
          Output ONLY the final English prompt text. No preamble.`,
          },
        ],
      });
      const response = await result.response;

      const newPrompt = response.text()?.trim() || "";
      updateShot(shotId, { imagePrompt: newPrompt, status: "pending" });
    } catch (error: any) {
      updateShot(shotId, { status: "error", error: error.message });
    }
  };

  const handleGenerateImage = async (shotId: string) => {
    if (generatingShotsRef.current.has(shotId)) return;

    // Use nodesRef to get the latest shot data, especially when called from setTimeout
    const currentNodes = nodesRef.current;
    const shotNode = currentNodes.find(
      (n) =>
        (n.type === "imageShotNode" || n.type === "videoShotNode") &&
        (n.data as any)?.shot?.id === shotId,
    );
    const shot = (shotNode?.data as any)?.shot as Shot;

    if (!shot) return;

    // If already has results, create a new node and generate there
    if (shot.imageUrl || (shot.imageUrls && shot.imageUrls.length > 0)) {
      const newId = `shot-${Date.now()}`;
      const currentNode = currentNodes.find(
        (n) => (n.data as any)?.shot?.id === shotId,
      );
      const newPos = currentNode
        ? { x: currentNode.position.x, y: currentNode.position.y + 400 }
        : { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 };

      const newShot: Shot = {
        ...shot,
        id: newId,
        shotNumber:
          currentNodes.filter(
            (n) => n.type === "imageShotNode" || n.type === "videoShotNode",
          ).length + 1,
        status: "pending",
        imageUrl: undefined,
        imageUrls: undefined,
        videoUrl: undefined,
        videoUrls: undefined,
        error: undefined,
        progress: 0,
      };

      const newNode: Node = {
        id: `${newId}-image`,
        type: "imageShotNode",
        position: newPos,
        data: { shot: newShot },
      };

      // Copy both incoming and outgoing edges from the old node to the new node to maintain data flow
      const relatedEdges = edges.filter(
        (edge) =>
          edge.target === currentNode?.id || edge.source === currentNode?.id,
      );
      const newEdges = relatedEdges.map((edge) => {
        const isIncoming = edge.target === currentNode?.id;
        return {
          ...edge,
          id: `e-${isIncoming ? edge.source : newNode.id}-${isIncoming ? newNode.id : edge.target}-${Date.now()}`,
          [isIncoming ? "target" : "source"]: newNode.id,
        };
      });

      setNodes((nds) => [...nds, newNode]);
      if (newEdges.length > 0) {
        setEdges((eds) => [...eds, ...newEdges]);
      }

      // Select the new node
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => ({ ...n, selected: n.id === newNode.id })),
        );
        handleGenerateImage(newId);
      }, 100);
      return;
    }

    generatingShotsRef.current.add(shotId);
    try {
      await generateImage(shot);
    } catch (e: any) {
      console.error(e);
      if (
        e.message &&
        typeof e.message === "string" &&
        (e.message.includes("403") || e.message.includes("permission"))
      ) {
        updateShot(shotId, {
          status: "error",
          error:
            "Permission Denied (403). The current API key does not have access to this model. Please ensure you have selected a paid Google Cloud API key.",
        });
      } else {
        let errorMsg = e.message || "Failed to generate image";
        if (typeof errorMsg === "object") errorMsg = JSON.stringify(errorMsg);
        updateShot(shotId, { status: "error", error: errorMsg });
      }
    } finally {
      generatingShotsRef.current.delete(shotId);
    }
  };

  const handleGenerateVideo = async (shotId: string) => {
    // Use nodesRef to get the latest shot data
    const currentNodes = nodesRef.current;
    const shotNode = currentNodes.find(
      (n) =>
        (n.type === "imageShotNode" || n.type === "videoShotNode") &&
        (n.data as any)?.shot?.id === shotId,
    );
    const shot = (shotNode?.data as any)?.shot as Shot;

    if (!shot) return;

    generatingShotProjectMap.current.set(shotId, currentProjectRef.current);

    // If already has results, create a new node and generate there
    if (shot.videoUrl) {
      const newId = `shot-${Date.now()}`;
      const currentNode = currentNodes.find(
        (n) => (n.data as any)?.shot?.id === shotId,
      );
      const newPos = currentNode
        ? { x: currentNode.position.x, y: currentNode.position.y + 350 }
        : { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 };

      const newShot: Shot = {
        ...shot,
        id: newId,
        shotNumber:
          currentNodes.filter(
            (n) => n.type === "imageShotNode" || n.type === "videoShotNode",
          ).length + 1,
        status: "pending",
        videoUrl: undefined,
        videoUrls: undefined,
        imageUrl: undefined,
        imageUrls: undefined,
        error: undefined,
        progress: 0,
        initialPosition: newPos,
      };

      const newNodeId = `${newId}-video`;
      const originalNodeId = currentNode?.id;

      setNodes((prev) => [
        ...prev.map((n) => ({ ...n, selected: false })),
        {
          id: newNodeId,
          type: "videoShotNode",
          position: newPos,
          data: { shot: newShot },
          selected: true,
        },
      ]);

      if (originalNodeId) {
        setEdges((prev) => {
          const relatedEdges = prev.filter(
            (e) => e.target === originalNodeId || e.source === originalNodeId,
          );
          const newEdges = relatedEdges.map((e) => {
            const isIncoming = e.target === originalNodeId;
            return {
              ...e,
              id: `e-${isIncoming ? e.source : newNodeId}-${isIncoming ? newNodeId : e.target}-${Date.now()}`,
              [isIncoming ? "target" : "source"]: newNodeId,
            };
          });
          return [...prev, ...newEdges];
        });
      }

      // Small delay to ensure state is updated and shots memo is recalculated
      setTimeout(() => handleGenerateVideo(newId), 100);
      return;
    }

    updateShot(shotId, {
      status: "generating_video",
      error: undefined,
      progress: 0,
    });

    try {
      const currentToken = token || localStorage.getItem("ais-token");

      // 1. Prepare API Request
      let modelIdRaw = shot.klingModel as string;
      let modelId = (modelIdRaw && (modelIdRaw in KLING_MODELS)) ? (modelIdRaw as KlingModelId) : "kling-v3";

      const modelDef = KLING_MODELS[modelId] || KLING_MODELS["kling-v3"];
      let modelName: string = modelId;

      // Map custom UI model IDs to valid Kling / Seedance model names for Matrix Proxy if needed
      if (modelId === "kling-v3") {
        modelName = "kling-v3";
      }

      const mode = shot.klingMode || "std";
      const duration = shot.klingDuration || "5s";
      const features = modelDef.getSupport(mode as any, duration as any);

      let inputMode: any = shot.videoInputMode;
      if (inputMode === "all") inputMode = "i2v";

      if (
        !inputMode ||
        (inputMode === "t2v" && !features.t2v) ||
        (inputMode === "i2v" && !features.i2v) ||
        (inputMode === "firstLastFrame" && !features.firstLastFrame) ||
        (inputMode === "subjectControl" && !features.subjectControl) ||
        (inputMode === "actionControl" && !features.actionControl) ||
        (inputMode === "videoEdit" && !features.videoEdit)
      ) {
        if (features.t2v) inputMode = "t2v";
        else if (features.i2v) inputMode = "i2v";
        else if (features.firstLastFrame) inputMode = "firstLastFrame";
        else if (features.subjectControl) inputMode = "subjectControl";
        else if (features.actionControl) inputMode = "actionControl";
        else if (features.videoEdit) inputMode = "videoEdit";
      }

      const useImage2Video =
        inputMode === "i2v" ||
        inputMode === "firstLastFrame" ||
        inputMode === "subjectControl" ||
        inputMode === "actionControl";
      const useVideoEdit = inputMode === "videoEdit";

      if (inputMode === "t2v" && !features.t2v) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support Text to Video.",
        });
        return;
      }

      if (inputMode === "i2v" && !features.i2v) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support Image to Video.",
        });
        return;
      }

      if (inputMode === "firstLastFrame" && !features.firstLastFrame) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support First & Last Frame.",
        });
        return;
      }

      if (inputMode === "subjectControl" && !features.subjectControl) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support Subject Control.",
        });
        return;
      }

      if (inputMode === "actionControl" && !features.actionControl) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support Action Control.",
        });
        return;
      }

      // All video models are uniformly connected and routed through the unified third-party API relay station / matrix proxy.
      const isMatrixVideo = true;

      if (inputMode === "videoEdit" && !features.videoEdit) {
        updateShot(shotId, {
          status: "error",
          error:
            "This model/mode/duration combination does not support Video Editing.",
        });
        return;
      }

      let endpointPath = "v1/videos/text2video";
      if (useVideoEdit) {
        endpointPath = "v1/videos/video2video";
      } else if (useImage2Video) {
        endpointPath = "v1/videos/image2video";
      }
      if (isMatrixVideo && !modelId.includes('kling')) {
        endpointPath = "v1/videos/generations";
      }
      let payload: any = {
        model_name: modelName,
      };

      if (mode !== "none") {
        payload.mode = mode;
      }

      if (duration !== "other") {
        payload.duration = duration.replace("s", "");
      }

      const prompt = shot.videoPrompt || shot.imagePrompt || shot.description;

      if (!prompt?.trim() && !useImage2Video && !useVideoEdit) {
        updateShot(shotId, {
          status: "error",
          error: "A prompt is required for text-to-video generation.",
        });
        return;
      }

      if (shot.aspectRatio) {
        payload.aspect_ratio = shot.aspectRatio;
      }

      if (shot.negativePrompt) {
        payload.negative_prompt = shot.negativePrompt;
      }

      if (
        features.cameraControl &&
        shot.cameraControl &&
        shot.cameraControl !== "none"
      ) {
        payload.camera_control = { type: shot.cameraControl, value: 0.5 };
      }

      if (inputMode === "firstLastFrame" && shot.videoLastFrameImage) {
        payload.tail_image = parseDataUri(shot.videoLastFrameImage).data;
      }

      if (useImage2Video && !shot.videoReferenceImage) {
        updateShot(shotId, {
          status: "error",
          error: "A reference image is required for this input mode.",
        });
        return;
      }

      if (
        useVideoEdit &&
        !shot.videoReferenceVideo &&
        (!shot.videoReferenceVideos || shot.videoReferenceVideos.length === 0)
      ) {
        updateShot(shotId, {
          status: "error",
          error: "A reference video is required for video editing.",
        });
        return;
      }

      if (useVideoEdit) {
        const refVideo =
          shot.videoReferenceVideo ||
          (shot.videoReferenceVideos && shot.videoReferenceVideos[0]);
        if (refVideo) {
          payload.video = parseDataUri(refVideo).data;
          payload.video_url = refVideo;
        }

        const refImage =
          shot.videoReferenceImage ||
          (shot.videoReferenceImages && shot.videoReferenceImages[0]);
        if (refImage) {
          payload.image = parseDataUri(refImage).data;
          payload.image_url = refImage;
        }
        payload.prompt = prompt;
      } else if (useImage2Video) {
        const refImage =
          shot.videoReferenceImage ||
          (shot.videoReferenceImages && shot.videoReferenceImages[0]);
        if (refImage) {
          payload.image = parseDataUri(refImage).data;
          payload.image_url = refImage;
        }
        payload.prompt = prompt;
      } else {
        payload.prompt = prompt;
      }

      // 2. Submit Tasks via Proxy
      const count = shot.numberOfVideos || 1;
      const newVideoUrls: string[] = [];
      let completedCount = 0;
      let hasError = false;

      const isJimeng = false;

      const proxyBase = isMatrixVideo
        ? `/api/matrix-proxy/${modelId}`
        : isJimeng
          ? "/api/jimeng-proxy"
          : "/api/kling-proxy";
      const statusProxyBase = isJimeng
        ? "/api/jimeng-status-proxy"
        : "/api/kling-status-proxy";

      const promises = Array.from({ length: count }).map(async () => {
        try {
          const isKlingOmniModel = modelId === "kling-video-o1" || modelId === "kling-v3-omni" || modelId.toLowerCase().includes("omni") || modelId.toLowerCase().includes("o1");
          const targetPath = isKlingOmniModel ? "v1/videos/omni-video" : "v1/videos/generations";
          let bodyPayload;
          if (isMatrixVideo) {
            let mappedModelName = modelName;
            if (useImage2Video && !modelName.includes('kling')) {
              mappedModelName = `${modelName}-image2video`;
            } else if (useVideoEdit && !modelName.includes('kling')) {
              mappedModelName = `${modelName}-video2video`;
            }
            bodyPayload = {
              path: targetPath,
              payload: {
                model: mappedModelName,
                prompt: prompt,
                aspect_ratio: shot.aspectRatio || "16:9",
                duration: shot.klingDuration || "5s",
                resolution: shot.resolution || "720p",
                ...payload // Include image, image_url, tail_image, video etc.
              }
            };
          } else {
            bodyPayload = payload;
          }

          let submitData: any = {};
          
          if (isMatrixVideo && socket.connected) {
             submitData = await new Promise((resolve, reject) => {
                 socket.emit("matrix_proxy", {
                     provider: modelId,
                     method: "POST",
                     path: targetPath,
                     payload: bodyPayload.payload,
                     token: currentToken
                 }, (response: any) => {
                     if (response && response.error) {
                         reject(new Error(response.error));
                     } else {
                         resolve(response);
                     }
                 });
                 // 10 minutes timeout
                 setTimeout(() => reject(new Error("Gateway Time-out (10m)")), 600000);
             });
          } else {
            const submitResponse = await fetch(
              `${isMatrixVideo ? proxyBase : proxyBase + "/" + endpointPath}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${currentToken}`,
                  ...(!isMatrixVideo &&
                    klingAccessKey &&
                    !isJimeng && { "x-kling-access-key": klingAccessKey }),
                  ...(!isMatrixVideo &&
                    klingSecretKey &&
                    !isJimeng && { "x-kling-secret-key": klingSecretKey }),
                },
                body: JSON.stringify(bodyPayload),
              },
            );

            if (!submitResponse.ok) {
              let errorMsg = submitResponse.statusText;
              try {
                const err = await submitResponse.json();
                errorMsg = err.error || err.message || submitResponse.statusText;
              } catch (e) {}
              throw new Error(`Submission failed: ${errorMsg}`);
            }

            submitData = await submitResponse.json();
          }

          if (submitData._remainingCredits !== undefined) {
            setUser((prev) =>
              prev ? { ...prev, credits: submitData._remainingCredits } : null,
            );
          }

          // Matrix models might return the URL directly if they are wrappers or OpenAI-styled
          if (isMatrixVideo) {
            const choiceContent = submitData.choices?.[0]?.message?.content;
            const videoUrl =
              submitData.url ||
              submitData.videoUrl ||
              submitData.video_url ||
              (Array.isArray(submitData.data) ? submitData.data[0]?.url : undefined) ||
              submitData.data?.task_result?.videos?.[0]?.url ||
              submitData.data?.url ||
              submitData.output?.url ||
              (choiceContent && choiceContent.match(/https?:\/\/[^\s"'<]+/)?.[0]);
              
            if (videoUrl) {
              newVideoUrls.push(videoUrl);
              completedCount++;
              updateShot(shot.id, {
                videoUrls: [...newVideoUrls],
                videoUrl: shot.videoUrl || videoUrl,
                status:
                  completedCount === count ? "video_done" : "generating_video",
                progress: completedCount === count ? 100 : shot.progress,
              });

              addToHistory({
                type: "video",
                url: videoUrl,
                prompt: prompt,
              });
              return; // Done for this specific video
            } else if (!submitData.data?.task_id && !submitData.id) {
              throw new Error(
                `Matrix API Error: ${submitData.message || submitData.error?.message || "Failed to return video URL or task ID"}`,
              );
            }
          }

          if (!isMatrixVideo && submitData.code !== 0) {
            throw new Error(`Kling API Error: ${submitData.message}`);
          }

          const taskId =
            submitData.data?.task_id || submitData.id || submitData.data?.id;
          if (!taskId) {
            throw new Error("No task ID returned from API.");
          }

          // 3. Poll for Status via Status Proxy (or Matrix Proxy for status)
          return new Promise<void>((resolve, reject) => {
            let pollAttempts = 0;
            const pollInterval = setInterval(async () => {
              pollAttempts++;
              if (pollAttempts > 120) {
                // 10 minutes timeout
                clearInterval(pollInterval);
                reject(
                  new Error(
                    "Timeout waiting for video generation task (10 minutes)",
                  ),
                );
                return;
              }
              try {
                let statusEndpointPath = `v1/videos/text2video/${taskId}`;
                if (useVideoEdit) {
                  statusEndpointPath = `v1/videos/video2video/${taskId}`;
                } else if (useImage2Video) {
                  statusEndpointPath = `v1/videos/image2video/${taskId}`;
                }

                let statusResponse;
                if (isMatrixVideo) {
                  // For matrix models, we poll from v1/videos/generations/${taskId} or v1/videos/omni-video/${taskId} to align with Singapore Gateway's unified route
                  const isKlingOmniModel = modelId === "kling-video-o1" || modelId === "kling-v3-omni" || modelId.toLowerCase().includes("omni") || modelId.toLowerCase().includes("o1");
                  const targetPollPath = isKlingOmniModel ? `v1/videos/omni-video/${taskId}` : `v1/videos/generations/${taskId}`;
                  statusResponse = await fetch(`${proxyBase}`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${currentToken}`,
                    },
                    body: JSON.stringify({
                      method: "GET",
                      path: targetPollPath,
                      payload: {},
                    }),
                  });
                } else {
                  statusResponse = await fetch(
                    `${statusProxyBase}/${statusEndpointPath}`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${currentToken}`,
                        ...(klingAccessKey &&
                          !isJimeng && {
                            "x-kling-access-key": klingAccessKey,
                          }),
                        ...(klingSecretKey &&
                          !isJimeng && {
                            "x-kling-secret-key": klingSecretKey,
                          }),
                      },
                    },
                  );
                }

                if (!statusResponse.ok) {
                  if (pollAttempts > 5 && isMatrixVideo) {
                    let errText = "Unknown error";
                    try { errText = await statusResponse.text(); } catch(e) {}
                    clearInterval(pollInterval);
                    reject(new Error(`Matrix Polling Failed (${statusResponse.status}): ${errText}`));
                  }
                  return; // Keep polling on transient errors
                }

                const statusData = await statusResponse.json();

                if (!isMatrixVideo && statusData.code !== 0) {
                  clearInterval(pollInterval);
                  reject(
                    new Error(`Kling Polling Error: ${statusData.message}`),
                  );
                  return;
                }

                let taskStatus = statusData.data?.task_status;
                let taskStatusMsg = "Unknown error from matrix provider";

                // Precise error decoding from the updated upstream format of Singapore Gateway / Kling
                const detailedMsg = statusData.data?.task_status_msg || statusData.data?.task_status_desc || statusData.error_msg || statusData.error?.message;
                if (detailedMsg) {
                  taskStatusMsg = detailedMsg;
                } else if (statusData.error) {
                  taskStatusMsg = typeof statusData.error === 'string' ? statusData.error : (statusData.error.message || JSON.stringify(statusData.error));
                } else if (statusData.message && statusData.message !== 'success' && statusData.message !== 'ok') {
                  taskStatusMsg = statusData.message;
                }

                if (isMatrixVideo) {
                   let s = (statusData.status || statusData.state || taskStatus || "").toLowerCase();
                   if (s === 'completed' || s === 'success' || s === 'succeeded' || s === 'done') {
                      taskStatus = 'succeed';
                   } else if (s === 'failed' || s === 'error') {
                      taskStatus = 'failed';
                   } else if (s === 'processing' || s === 'running' || s === 'pending') {
                      taskStatus = 'processing';
                   } else if (s === '') {
                      // Some APIs don't return status directly but return output
                      if (statusData.url || statusData.output?.url || statusData.video?.url) {
                         taskStatus = 'succeed';
                      }
                   }
                }

                if (taskStatus === "succeed") {
                  clearInterval(pollInterval);
                  const videoUrl =
                    statusData.data?.task_result?.videos?.[0]?.url ||
                    statusData.url ||
                    statusData.output?.url ||
                    statusData.video?.url ||
                    statusData.data?.url ||
                    statusData.data?.video?.url;
                  if (videoUrl) {
                    newVideoUrls.push(videoUrl);
                    completedCount++;
                    updateShot(shot.id, {
                      videoUrls: [...newVideoUrls],
                      videoUrl: shot.videoUrl || videoUrl,
                      status:
                        completedCount === count
                          ? "video_done"
                          : "generating_video",
                      progress: completedCount === count ? 100 : shot.progress,
                    });

                    addToHistory({
                      type: "video",
                      url: videoUrl,
                      prompt: prompt,
                    });
                    resolve();
                  } else {
                    reject(
                      new Error(
                        "Video generation succeeded but no URL was returned.",
                      ),
                    );
                  }
                } else if (taskStatus === "failed") {
                  clearInterval(pollInterval);
                  const errorMsg = `Video generation failed: ${taskStatusMsg}`;

                  // Request refund for failed task
                  try {
                    const refundRes = await api.post("/user/refund", {
                      amount: 200, // Standard video cost
                      reason: `VIDEO_SYNTHESIS_REJECTED (Task: ${taskId})`,
                    });
                    if (refundRes.data.success) {
                      setUser((prev) =>
                        prev
                          ? { ...prev, credits: refundRes.data.credits }
                          : null,
                      );
                      toast.info("视频生成失败：积分已退回");
                    }
                  } catch (refundErr) {
                    console.error("Refund failed:", refundErr);
                  }

                  reject(new Error(errorMsg));
                } else {
                  // Still processing
                  updateShot(shotId, { progress: 50 });
                }
              } catch (pollError) {
                console.error("Polling error:", pollError);
              }
            }, 5000);
          });
        } catch (e: any) {
          console.error("Error generating one of the videos:", e);
          hasError = true;
          completedCount++;
          if (completedCount === count && newVideoUrls.length > 0) {
            updateShot(shot.id, { status: "video_done", progress: 100 });
          } else if (completedCount === count && newVideoUrls.length === 0) {
            updateShot(shotId, { status: "error", error: e.message });
          }
        }
      });

      await Promise.all(promises);

      if (newVideoUrls.length === 0 && !hasError) {
        throw new Error("视频生成失败。");
      }

      if (newVideoUrls.length > 0) {
        updateShot(shot.id, {
          status: "video_done",
          videoUrl: newVideoUrls[0],
          videoUrls: newVideoUrls,
          progress: 100,
        });
      }
    } catch (error: any) {
      console.error("Video Generation Error:", error);
      let errorMsg = error.message || String(error);
      if (typeof errorMsg === "object") errorMsg = JSON.stringify(errorMsg);
      updateShot(shotId, { status: "error", error: errorMsg });
    }
  };

  const handleAddImageNode = (flowPos?: { x: number; y: number }) => {
    let finalPos = flowPos;
    if (!finalPos && reactFlowInstance) {
      finalPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    const id = `shot-${Date.now()}`;
    const newShot: Shot = {
      id,
      shotNumber: shots.length + 1,
      description: "新图片分镜",
      imagePrompt: "",
      status: "pending",
      initialPosition: finalPos,
      aspectRatio: "16:9",
      resolution: "1K",
      numberOfImages: 1,
      type: "image",
    };

    setNodes((prev) => [
      ...prev,
      {
        id: `${id}-image`,
        type: "imageShotNode",
        position: finalPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: { label: "图片生成", shot: newShot },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddVideoNode = (flowPos?: { x: number; y: number }) => {
    let finalPos = flowPos;
    if (!finalPos && reactFlowInstance) {
      finalPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    const id = `shot-${Date.now()}`;
    const newShot: Shot = {
      id,
      shotNumber: shots.length + 1,
      description: "新视频分镜",
      imagePrompt: "",
      videoPrompt: "",
      status: "pending",
      initialPosition: finalPos,
      type: "video",
      klingModel: "kling-v3",
      klingMode: "std",
      klingDuration: "5s",
    };

    setNodes((prev) => [
      ...prev,
      {
        id: `${id}-video`,
        type: "videoShotNode",
        position: finalPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: { label: "视频生成", shot: newShot },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddGenericNode = (
    type: string,
    flowPos?: { x: number; y: number },
  ) => {
    const id = `${type}-${Date.now()}`;
    const manualNodeLabels: Record<string, string> = {
      imageTo3DNode: "3D 图像转模型",
      materialGenNode: "3D PBR材质生成",
      materialReplaceNode: "3D 材质贴附重贴",
      threeDEditorNode: "3D 场景编辑器",
      threeDRenderNode: "3D AI场景渲染",
    };
    const nodeLabel =
      manualNodeLabels[type] ||
      CYCLES_NODE_PALETTE.find((item) => item.type === type)?.label ||
      "节点";
    const defaultData = getCyclesNodeDefaultData(type) ?? {};
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: { ...defaultData, label: nodeLabel },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddTextNode = (flowPos?: { x: number; y: number }) => {
    const id = `text-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "textNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: { label: "文本", text: "" },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddScriptNode = (flowPos?: { x: number; y: number }) => {
    const id = `script-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "scriptNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: {
          label: "脚本",
          script: "",
          apiKey: jepowKey,
        },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddMediaNode = (flowPos?: { x: number; y: number }) => {
    const id = `media-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "mediaNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: {
          url: "https://picsum.photos/seed/media/800/600",
          type: "image",
        },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddImageTo3DNode = (flowPos?: { x: number; y: number }) => {
    handleAddGenericNode("imageTo3DNode", flowPos);
  };

  const handleAddMaterialGenNode = (flowPos?: { x: number; y: number }) => {
    handleAddGenericNode("materialGenNode", flowPos);
  };

  const handleAddMaterialReplaceNode = (flowPos?: { x: number; y: number }) => {
    handleAddGenericNode("materialReplaceNode", flowPos);
  };

  const handleAddThreeDEditorNode = (flowPos?: { x: number; y: number }) => {
    handleAddGenericNode("threeDEditorNode", flowPos);
  };

  const handleAddThreeDRenderNode = (flowPos?: { x: number; y: number }) => {
    handleAddGenericNode("threeDRenderNode", flowPos);
  };

  const handleAddImageAsset = (flowPos?: { x: number; y: number }) => {
    const id = `image-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "imageNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: { url: "", width: 300, height: 300 },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddVideoAsset = (flowPos?: { x: number; y: number }) => {
    const id = `video-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "mediaNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        data: {
          url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          type: "video",
        },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleAddGroupNode = (flowPos?: { x: number; y: number }) => {
    const id = `group-${Date.now()}`;
    let centerPos = flowPos;
    if (!centerPos && reactFlowInstance) {
      centerPos = reactFlowInstance.screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
    }

    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "groupNode",
        position: centerPos || {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
        },
        style: { width: 600, height: 600 },
        data: {
          title: "新分组",
          layoutMode: "free",
        },
      },
    ]);
    setRadialMenu(null);
    setPaneContextMenu(null);
  };

  const handleDownloadImage = (imageUrl: string, shotNumber: number) => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `shot-${shotNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadVideo = (videoUrl: string, shotNumber: number) => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `shot-${shotNumber}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Auto-save logic
  const lastSavedDataSignature = useRef<string>("");

  useEffect(() => {
    if (!token) return;
    if (view === "landing") return; // Do not auto-save when on landing page

    const currentSignature = JSON.stringify({
      nodes,
      edges,
      canvasColor,
      currentProjectRef: currentProjectRef.current,
    });
    if (currentSignature === lastSavedDataSignature.current) return;

    const timeoutId = setTimeout(() => {
      lastSavedDataSignature.current = currentSignature;
      handleCloudSave(true);
    }, 5000); // Debounce save every 5 seconds

    return () => clearTimeout(timeoutId);
  }, [nodes, edges, canvasColor, token, view, handleCloudSave]);

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      // Close other menus when opening context menu
      setShowUserMenu(false);
      setShowTransferMenu(false);
      setShowLayoutMenu(false);

      if (reactFlowInstance) {
        const flowPos = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setPaneContextMenu({
          x: event.clientX,
          y: event.clientY,
          flowX: flowPos.x,
          flowY: flowPos.y,
        });
      }
    },
    [reactFlowInstance],
  );

  const handlePaneClick = useCallback(() => {
    setPaneContextMenu(null);
    setShowUserMenu(false);
    setShowTransferMenu(false);
    setShowLayoutMenu(false);
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setPaneContextMenu(null);
      setShowUserMenu(false);
      setShowTransferMenu(false);
      setShowLayoutMenu(false);

      if (isSelectingAiReference) {
        // Find image URL from node
        let url = "";
        if (node.type === "imageNode") url = (node.data as any).url;
        else if (node.type === "imageShotNode")
          url =
            (node.data as any).shot?.imageUrl ||
            (node.data as any).shot?.imageUrls?.[0];

        if (url) {
          setAiReferenceImages((prev) => {
            if (prev.includes(url)) return prev; // already added
            if (prev.length >= 8) {
              toast.error("最大支持8张垫图");
              return prev;
            }
            toast.success("已加入垫图");
            return [...prev, url];
          });
        }
      }
    },
    [isSelectingAiReference],
  );

  const handleAddHistoryToCanvas = useCallback(
    (item: HistoryItem) => {
      // Add to center of viewport
      const center = reactFlowInstance
        ? reactFlowInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
        : { x: 0, y: 0 };

      if (item.type === "image") {
        const img = new Image();
        img.onload = () => {
          const id = `image-${Date.now()}`;
          let w = img.width;
          let h = img.height;
          setNodes((nds) => [
            ...nds,
            {
              id,
              type: "imageNode",
              position: center,
              data: { url: item.url, width: w, height: h },
            },
          ]);
        };
        img.src = item.url;
      } else {
        const id = `media-${Date.now()}`;
        setNodes((nds) => [
          ...nds,
          {
            id,
            type: "mediaNode",
            position: center,
            data: {
              url: item.url,
              type: "video",
            },
          },
        ]);
      }
    },
    [reactFlowInstance, setNodes],
  );

  useEffect(() => {
    if (showUserMenu && token) {
      fetchProfile();
    }
  }, [showUserMenu]);

  useEffect(() => {
    if (!user && view === "canvas" && !canvasOnly) {
      setView("landing");
      setShowAuthModal(true);
    }
  }, [user, view, canvasOnly]);

  const isAnyModalOpen =
    showAuthModal ||
    showRechargeModal ||
    showProjectList ||
    showAdminPanel ||
    !!showPublicProfile ||
    !!viewingPost ||
    !!viewingActivity ||
    showCreditsModal ||
    triggerUpload ||
    showEditProfileModal ||
    showAccountManagementModal ||
    showInvitationModal ||
    showAiChat ||
    showSettings ||
    showScriptModal ||
    showTransferMenu ||
    showNewProjectConfirm ||
    showUserMenu ||
    showAiReferenceMenu ||
    !!fullscreenImage ||
    !!fullscreenVideo ||
    !!selectedRechargePkg ||
    showMessagesPanel;

  const selectedPrimaryNode =
    (selectedNodes[0] && nodes.find((n) => n.id === selectedNodes[0].id)) ||
    nodes.find((n) => n.selected) ||
    selectedNodes[0];
  const selectedTypeLabel = selectedPrimaryNode?.type
    ? String(selectedPrimaryNode.type)
        .replace(/Node$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
    : "未选择对象";
  const formatNodeTreeLabel = useCallback((node: Node) => {
    const typeLabels: Record<string, string> = {
      modelAssetNode: "模型资产",
      threeDEditorNode: "3D 场景编辑器",
      imageTo3DNode: "3D 图像转模型",
      materialGenNode: "3D PBR材质生成",
      materialReplaceNode: "3D 材质贴附重贴",
      threeDRenderNode: "3D AI场景渲染",
      imageShotNode: "图片生成",
      videoShotNode: "视频生成",
      scriptNode: "脚本",
      groupNode: "分组",
      textNode: "文本",
    };
    return (
      (node.data as any)?.label ||
      (node.data as any)?.title ||
      (node.data as any)?.shot?.title ||
      typeLabels[String(node.type || "")] ||
      "节点"
    );
  }, []);
  const renameNodeInTree = useCallback(
    (nodeId: string, label: string) => {
      const nextLabel = label.trim();
      setRenamingNodeId(null);
      if (!nextLabel) return;
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node.data as Record<string, unknown>),
                  label: nextLabel,
                  ...((node.data as any)?.title ? { title: nextLabel } : {}),
                  ...((node.data as any)?.shot
                    ? {
                        shot: {
                          ...(node.data as any).shot,
                          title: nextLabel,
                        },
                      }
                    : {}),
                },
              }
            : node,
        ),
      );
    },
    [setNodes],
  );
  const focusCanvasNode = useCallback(
    (node: Node) => {
      const absolute = getAbsolutePosition(node, nodes);
      const width = node.measured?.width || node.width || 300;
      const height = node.measured?.height || node.height || 220;
      reactFlowInstance?.setCenter(
        absolute.x + Number(width) / 2,
        absolute.y + Number(height) / 2,
        { zoom: 1, duration: 500 },
      );
    },
    [getAbsolutePosition, nodes, reactFlowInstance],
  );
  const desktopStartupLocked = canvasOnly && (!user || desktopScreen === "home");
  const sceneChildrenByParentId = useMemo(() => {
    const childrenByParentId = new Map<string, Node[]>();
    for (const node of desktopStartupLocked ? [] : nodes) {
      if (!node.parentId) continue;
      const siblings = childrenByParentId.get(node.parentId) || [];
      siblings.push(node);
      childrenByParentId.set(node.parentId, siblings);
    }
    return childrenByParentId;
  }, [desktopStartupLocked, nodes]);
  const sceneRootNodes = useMemo(() => {
    if (desktopStartupLocked) return [];
    return nodes.filter((node) => {
      if (!node.parentId) return true;
      return !nodes.some((parent) => parent.id === node.parentId);
    });
  }, [desktopStartupLocked, nodes]);
  const renderSceneTreeNode = (node: Node, depth = 0): React.ReactNode => {
    const children = sceneChildrenByParentId.get(node.id) || [];
    const isGroup = node.type === "groupNode";
    const isCollapsed = collapsedSceneGroupIds.has(node.id);
    const isSelected =
      node.id === selectedPrimaryNode?.id ||
      selectedNodes.some((selected) => selected.id === node.id);
    const nodeLabel = formatNodeTreeLabel(node);

    return (
      <React.Fragment key={node.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setSelectedNodes([node]);
            setNodes((currentNodes) =>
              currentNodes.map((item) => ({
                ...item,
                selected: item.id === node.id,
              })),
            );
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelectedNodes([node]);
              setNodes((currentNodes) =>
                currentNodes.map((item) => ({
                  ...item,
                  selected: item.id === node.id,
                })),
              );
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setSelectedNodes([node]);
            setNodes((currentNodes) =>
              currentNodes.map((item) => ({
                ...item,
                selected: item.id === node.id,
              })),
            );
            setSceneRenameMenu({
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
              label: String(nodeLabel),
            });
          }}
          className={`flex h-6 w-full items-center gap-1 px-2 text-left text-[10px] transition-colors outline-none ${
            isSelected
              ? "bg-blue-500/20 text-blue-100"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {isGroup ? (
            <button
              type="button"
              aria-label={isCollapsed ? "展开组" : "收起组"}
              onClick={(event) => {
                event.stopPropagation();
                setCollapsedSceneGroupIds((current) => {
                  const next = new Set(current);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-neutral-500 hover:bg-white/[0.08] hover:text-neutral-200"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <Box className="h-3.5 w-3.5 shrink-0 text-orange-300/80" />
          {renamingNodeId === node.id ? (
            <input
              autoFocus
              value={renamingNodeLabel}
              onChange={(e) => setRenamingNodeLabel(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={() => renameNodeInTree(node.id, renamingNodeLabel)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  renameNodeInTree(node.id, renamingNodeLabel);
                } else if (e.key === "Escape") {
                  setRenamingNodeId(null);
                }
              }}
              className="min-w-0 flex-1 rounded-[3px] border border-[#4772b3]/60 bg-[#111214] px-1 py-0.5 text-[10px] text-white outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {String(nodeLabel)}
            </span>
          )}
        </div>
        {!isCollapsed &&
          children.map((child) => renderSceneTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };
  const professionalModes = [
    { id: "node", label: "无限画布", active: true },
    { id: "3d", label: "三维视窗", active: false },
    { id: "reference", label: "参考修图", active: false },
    { id: "compose", label: "剪辑合成", active: false },
  ];
  const hiddenNodePropertyPattern =
    /(url|uri|href|path|preview|thumbnail|dataurl|base64|blob|output|result|error|status|local|remote|cache|file|image|video|glb|fbx|obj)$/i;
  const editableNestedPropertyKeys = new Set([
    "shot",
    "transform",
    "lights",
    "renderSettings",
    "cyclesLight",
    "cyclesCamera",
    "cyclesMaterial",
    "material",
    "viewportCamera",
    "cyclesViewportCamera",
    "previewCamera",
    "settings",
  ]);
  const formatPropertyLabel = (key: string) => {
    const labels: Record<string, string> = {
      label: "名称",
      title: "标题",
      layoutMode: "布局模式",
      text: "文本",
      script: "脚本",
      apiKey: "接口密钥",
      width: "宽度",
      height: "高度",
      x: "横向位置",
      y: "纵向位置",
      transform: "变换",
      settings: "设置",
      previewCamera: "预览相机",
      viewportCamera: "视口相机",
      cyclesViewportCamera: "Cycles 视口相机",
    };
    return (
      labels[key] ||
      key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
    );
  };
  const formatPropertyValue = (value: unknown) => {
    const values: Record<string, string> = {
      free: "自由",
      horizontal: "水平",
      vertical: "垂直",
      grid: "网格",
    };
    return typeof value === "string" ? values[value] || value : String(value ?? "");
  };
  const parsePropertyValue = (value: string) => {
    const values: Record<string, string> = {
      自由: "free",
      水平: "horizontal",
      垂直: "vertical",
      网格: "grid",
    };
    return values[value] || value;
  };
  const updateSelectedNodeDataPath = useCallback(
    (path: string[], value: unknown) => {
      if (!selectedPrimaryNode) return;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== selectedPrimaryNode.id) return node;
          const nextData = { ...(node.data as Record<string, unknown>) };
          let cursor: Record<string, unknown> = nextData;
          path.slice(0, -1).forEach((segment) => {
            const nextValue = cursor[segment];
            const nextObject =
              nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
                ? { ...(nextValue as Record<string, unknown>) }
                : {};
            cursor[segment] = nextObject;
            cursor = nextObject;
          });
          cursor[path[path.length - 1]] = value;
          return { ...node, data: nextData };
        }),
      );
    },
    [selectedPrimaryNode?.id, setNodes],
  );
  const updateSelectedNodeLayout = useCallback(
    (key: "x" | "y", value: number) => {
      if (!selectedPrimaryNode) return;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === selectedPrimaryNode.id
            ? { ...node, position: { ...node.position, [key]: value } }
            : node,
        ),
      );
    },
    [selectedPrimaryNode?.id, setNodes],
  );
  const selectedNodePropertyGroups = useMemo(() => {
    if (!selectedPrimaryNode) return [];
    const groups: {
      title: string;
      items: {
        key: string;
        label: string;
        value: unknown;
        path: string[];
        type: "string" | "number" | "boolean";
      }[];
    }[] = [];
    const addPrimitiveProperties = (
      title: string,
      source: Record<string, unknown>,
      basePath: string[] = [],
    ) => {
      const items = Object.entries(source)
        .filter(([key, value]) => {
          if (typeof value === "function" || key.startsWith("on") || key === "id") return false;
          if (hiddenNodePropertyPattern.test(key)) return false;
          return (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          );
        })
        .map(([key, value]) => ({
          key: [...basePath, key].join("."),
          label: formatPropertyLabel(key),
          value,
          path: [...basePath, key],
          type: typeof value as "string" | "number" | "boolean",
        }));
      if (items.length) groups.push({ title, items });
    };

    const data = (selectedPrimaryNode.data || {}) as Record<string, unknown>;
    addPrimitiveProperties("基础参数", data);
    Object.entries(data).forEach(([key, value]) => {
      if (
        key === "shot" &&
        (selectedPrimaryNode.type === "imageShotNode" ||
          selectedPrimaryNode.type === "videoShotNode")
      ) {
        return;
      }
      if (
        !editableNestedPropertyKeys.has(key) ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        return;
      }
      addPrimitiveProperties(formatPropertyLabel(key), value as Record<string, unknown>, [key]);
    });
    return groups;
  }, [selectedPrimaryNode, hiddenNodePropertyPattern]);

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [isAnyModalOpen]);

  return (
    <div
      className={`w-full text-neutral-900 font-sans transition-colors duration-300 ${view === "landing" ? "min-h-screen overflow-y-auto overflow-x-hidden" : "h-screen overflow-hidden"}`}
      style={{ backgroundColor: view === "landing" ? "#ffffff" : canvasColor }}
      onPointerMove={(e) => {
        if (!socket || !socket.connected || !user) return;
        const now = Date.now();
        if (now - lastCursorEmitTimestamp > 300) {
          lastCursorEmitTimestamp = now;
          socket.emit("cursor_move", { x: e.clientX, y: e.clientY });
        }
      }}
    >
      {!canvasOnly && view === "landing" && navStack.length === 0 && !showAuthModal && (
        <BroadcastBanner />
      )}
      {!hasApiKey ? (
        <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans w-full h-full">
          <Card className="w-full max-w-md p-6 space-y-6 text-center bg-white border-black/10">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-neutral-900">
                需要 API 密钥
              </h2>
              <p className="text-neutral-600 text-sm">
                图像生成模型（如 jepow AI Pro）需要付费的 Google Cloud API
                密钥。
              </p>
            </div>
            <div className="p-4 bg-amber-500/10 text-amber-500 rounded-md text-sm text-left border border-amber-500/20">
              <p className="font-semibold mb-1">重要提示:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>您必须从付费的 Google Cloud 项目中选择一个 API 密钥。</li>
                <li>
                  <a
                    href="https://jepow.ai/docs/billing"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-amber-400"
                  >
                    在此了解更多关于账单的信息。
                  </a>
                </li>
              </ul>
            </div>
            <Button
              onClick={handleSelectKey}
              className="w-full bg-blue-600 hover:bg-blue-700 text-neutral-900 h-12 rounded-md"
              size="lg"
            >
              选择 API 密钥
            </Button>
          </Card>
        </div>
      ) : !canvasOnly && view === "landing" ? (
        <LandingPage
          onNewProject={handleNewProject}
          onOpenProject={handleLoadCloudProject}
          user={user}
          onLogout={() => {
            setToken(null);
            setUser(null);
            setNodes([]);
            setEdges([]);
            setCurrentProjectId(null);
            setProjectName("未命名原型");
            localStorage.removeItem(`ais-nodes-${user?.id || "guest"}`);
            localStorage.removeItem(`ais-edges-${user?.id || "guest"}`);
            localStorage.removeItem(`ais-project-id-${user?.id || "guest"}`);
            localStorage.removeItem(`ais-project-name-${user?.id || "guest"}`);
            localStorage.removeItem("ais-user");
            setView("landing");
            toast.info("已成功登出");
          }}
          onLogin={() => setShowAuthModal(true)}
          onOpenAdmin={() => pushView("admin")}
          onOpenProfile={(uid) => pushView("profile", uid || user?.id || null)}
          onCloseProfile={() => popView()}
          onOpenCredits={() => pushView("credits")}
          onUpdateProfile={handleUpdateProfile}
          onOpenEditProfile={() => setShowEditProfileModal(true)}
          onCloseEditProfile={() => setShowEditProfileModal(false)}
          onOpenAccountManagement={() => setShowAccountManagementModal(true)}
          onRecharge={() => setShowRechargeModal(true)}
          onProjectPurchased={fetchProjects}
          onDeleteProject={handleDeleteCloudProject}
          onRenameProject={handleRenameCloudProject}
          onManageProjects={() => pushView("projects")}
          projects={cloudProjects}
          currentProjectId={currentProjectId}
          triggerUpload={triggerUpload}
          onUploadTriggered={() => setTriggerUpload(false)}
          siteConfig={siteConfig}
          showMessagesPanel={showMessagesPanel}
          setShowMessagesPanel={(val) => {
            if (val) pushView("messages");
            else popView();
          }}
          onOpenMessagesTab={(tab) => {
            pushView("messages", { tab });
          }}
          activeChatUser={activeChatUser}
          setActiveChatUser={setActiveChatUser}
          showPublicProfile={showPublicProfile}
          setShowPublicProfile={(val) => {
            if (val) pushView("profile", val);
            else popView();
          }}
          viewingPost={viewingPost}
          setViewingPost={(val) => {
            if (val) pushView("post", val);
            else popView();
          }}
          setViewingActivity={(val) => {
            if (val) pushView("activity", val);
            else popView();
          }}
          showEditProfileModal={showEditProfileModal}
          setShowEditProfileModal={setShowEditProfileModal}
        />
      ) : (
        <>
          {/* Render remote cursors */}
          {Object.entries(cursors).map(([id, cursor]: [string, any]) => (
            <div
              key={id}
              className="absolute z-[9999] pointer-events-none transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
            >
              <MousePointer2 className="w-5 h-5 text-neutral-700 fill-blue-500 drop-shadow-md" />
              <div className="bg-white text-black text-[10px] px-1.5 py-0.5 rounded-md mt-1 ml-3 whitespace-nowrap shadow-sm">
                协作者
              </div>
            </div>
          ))}
          <div className="w-full h-full flex flex-col relative overflow-hidden bg-[#101113] text-neutral-100">
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .react-flow__node [id*="floating-panel"],
                  .react-flow__node [class*="z-[9999]"][class*="top-full"],
                  .react-flow__node [class*="z-[9999]"][class*="slide-in-from-top-4"] {
                    display: none !important;
                  }
                  .react-flow__node.selected {
                    filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.85)) drop-shadow(0 0 28px rgba(59, 130, 246, 0.48));
                  }
                  .react-flow__node.selected > div:first-child {
                    outline: none !important;
                    border-color: rgba(38, 38, 38, 0.9) !important;
                  }
                  .react-flow__node.selected [class*="border-blue"],
                  .react-flow__node.selected [class*="border-purple"],
                  .react-flow__node.selected [class*="border-emerald"],
                  .react-flow__node.selected [class*="border-cyan"],
                  .react-flow__node.selected [class*="border-amber"] {
                    border-color: rgba(38, 38, 38, 0.9) !important;
                  }
                `,
              }}
            />
            <header className="h-8 shrink-0 border-b border-[#151619] bg-[#1f2023] flex items-center px-1.5 select-none z-[120]">
              <div className="flex items-center gap-1 min-w-0 h-full">
                <button
                  className="h-7 w-7 rounded bg-transparent flex items-center justify-center hover:bg-white/10 transition-colors"
                  onClick={async () => {
                    if (canvasOnly) {
                      if (currentProjectId) await handleCloudSave(false);
                      setDesktopScreen("home");
                      fetchProjects();
                    } else {
                      setView("landing");
                    }
                  }}
                  title={canvasOnly ? "返回工程首页" : "返回首页"}
                  type="button"
                >
                  <Logo className="w-5 h-5 drop-shadow-md" />
                </button>

                {[
                  {
                    id: "file" as const,
                    label: "文件",
                    items: [
                      { label: "新建", shortcut: "⌘ N", action: handleNewProject },
                      { label: "打开...", shortcut: "⌘ O", action: () => document.getElementById("project-load-input")?.click() },
                      { label: "保存", shortcut: "⌘ S", action: handleSaveProject },
                      { label: "导出", action: handleSaveProject },
                      { label: "导入工程", action: () => document.getElementById("project-load-input")?.click() },
                      { label: "退出", shortcut: "⌘ Q", action: () => canvasOnly ? setDesktopScreen("home") : setView("landing") },
                    ],
                  },
                  {
                    id: "edit" as const,
                    label: "编辑",
                    items: [
                      {
                        label: "撤销",
                        shortcut: "⌘ Z",
                        disabled: !canUndo,
                        action: () => {
                          const prevState = undo();
                          if (prevState) {
                            setNodes(prevState.nodes);
                            setEdges(prevState.edges);
                          }
                        },
                      },
                      {
                        label: "重做",
                        shortcut: "⇧ ⌘ Z",
                        disabled: !canRedo,
                        action: () => {
                          const nextState = redo();
                          if (nextState) {
                            setNodes(nextState.nodes);
                            setEdges(nextState.edges);
                          }
                        },
                      },
                      {
                        label: "历史工程",
                        shortcut: "⇧ ⌘ O",
                        historyProjects: true,
                        action: fetchProjects,
                      },
                      { label: snapToGrid ? "关闭吸附" : "开启吸附", action: () => setSnapToGrid(!snapToGrid) },
                      { label: "画布颜色...", action: () => document.getElementById("canvas-color-input")?.click() },
                      { label: "菜单搜索...", shortcut: "F3", action: () => toast.info("搜索功能即将接入") },
                      { label: "偏好设置...", shortcut: "⌘ ,", action: () => setShowSettings(true) },
                    ],
                  },
                  {
                    id: "window" as const,
                    label: "窗口",
                    items: [
                      {
                        label: user ? "用户档案" : "登录/注册",
                        action: () => {
                          if (user) setShowUserMenu(!showUserMenu);
                          else setShowAuthModal(true);
                        },
                      },
                      { label: "显示属性面板", action: () => setRightPanelMode("properties") },
                      { label: "显示 AI 助手", action: () => setRightPanelMode("ai") },
                      { label: "设置", action: () => setShowSettings(true) },
                      { label: "保存屏幕截图...", action: () => toast.info("截图功能即将接入") },
                    ],
                  },
                  {
                    id: "help" as const,
                    label: "帮助",
                    items: [
                      { label: "手册", action: () => openJepowWeb("/") },
                      { label: "支持", action: () => openJepowWeb("/") },
                      { label: "报告问题", action: () => openJepowWeb("/") },
                      { label: "保存系统信息...", action: () => toast.info("系统信息导出即将接入") },
                    ],
                  },
                ].map((menu) => (
                  <div key={menu.id} className="relative h-full flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTopMenu(activeTopMenu === menu.id ? null : menu.id)
                      }
                      className={`h-6 px-2 rounded text-[12px] font-medium transition-colors ${
                        activeTopMenu === menu.id
                          ? "bg-white/12 text-white"
                          : "text-neutral-300 hover:text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      {menu.label}
                    </button>
                    {activeTopMenu === menu.id && (
                      <div className="absolute left-0 top-full mt-1 min-w-[230px] rounded-[4px] border border-[#151619] bg-[#252629]/98 p-1 shadow-2xl backdrop-blur-xl z-[200]">
                        {menu.items.map((item, index) => {
                          const isHistoryProjects = "historyProjects" in item;
                          return (
                            <div
                              key={`${item.label}-${index}`}
                              className="group/menuitem relative"
                              onMouseEnter={() => {
                                if (isHistoryProjects) void fetchProjects();
                              }}
                            >
                              <button
                                type="button"
                                disabled={item.disabled}
                                onClick={() => {
                                  if (item.disabled) return;
                                  void item.action();
                                  if (!isHistoryProjects) setActiveTopMenu(null);
                                }}
                                className="w-full h-7 rounded-[3px] px-2.5 text-left text-[12px] text-neutral-200 hover:bg-[#3a3d42] disabled:opacity-35 disabled:hover:bg-transparent flex items-center justify-between gap-4"
                              >
                                <span>{item.label}</span>
                                <span className="flex items-center gap-2 text-[11px] text-neutral-500">
                                  {item.shortcut}
                                  {isHistoryProjects && <ChevronRight className="h-3 w-3" />}
                                </span>
                              </button>
                              {isHistoryProjects && (
                                <div className="invisible absolute left-full top-0 ml-1 w-[360px] rounded-[4px] border border-[#151619] bg-[#252629]/98 p-1 shadow-2xl opacity-0 backdrop-blur-xl transition-all group-hover/menuitem:visible group-hover/menuitem:opacity-100">
                                  <div className="border-b border-[#34363a] px-2 py-1.5 text-[10px] font-bold tracking-wide text-neutral-500">
                                    历史工程
                                  </div>
                                  {cloudProjects.length === 0 ? (
                                    <div className="px-2 py-4 text-center text-[11px] text-neutral-500">
                                      暂无历史工程
                                    </div>
                                  ) : (
                                    <div className="max-h-[320px] overflow-y-auto">
                                      {cloudProjects.map((project) => {
                                        const saveLocation =
                                          (project as any).path ||
                                          (project as any).localPath ||
                                          (project as any).directory ||
                                          (projectsLocal
                                            ? "本机 · 本地工程档案"
                                            : "云端 · Jepow 账户");
                                        return (
                                          <button
                                            key={project.id}
                                            type="button"
                                            onClick={() => {
                                              setActiveTopMenu(null);
                                              void handleLoadCloudProject(project.id);
                                            }}
                                            className="w-full rounded-[3px] px-2 py-2 text-left hover:bg-[#3a3d42]"
                                          >
                                            <div className="truncate text-[12px] font-semibold text-neutral-100">
                                              {project.name || "未命名工程"}
                                            </div>
                                            <div className="mt-1 truncate text-[10px] text-neutral-500">
                                              保存位置：{saveLocation}
                                            </div>
                                            <div className="mt-0.5 text-[10px] text-neutral-500">
                                              最新保存：
                                              {new Date(project.updatedAt).toLocaleString("zh-CN", {
                                                year: "numeric",
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="ml-5 hidden md:flex items-center gap-1 rounded-[3px] bg-[#2b2d31] border border-[#151619] p-0.5">
                {professionalModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                      className={`h-6 px-2.5 rounded-sm text-[10px] font-bold tracking-wide transition-all ${
                      mode.active
                        ? "bg-[#4772b3] text-white"
                        : "text-neutral-400 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </header>

            <input
              type="file"
              id="project-load-input"
              className="hidden"
              accept=".aiswork,.AI.json,.json"
              onChange={(e: any) => {
                handleLoadProject(e);
                setShowTransferMenu(false);
              }}
            />
            <input
              type="color"
              id="canvas-color-input"
              className="hidden"
              value={canvasColor}
              onChange={(e) => setCanvasColor(e.target.value)}
            />

            <div className="flex flex-1 min-h-0 bg-[#1f2023]">
              <main className="relative min-w-0 flex-1 p-0.5">
                <div className="absolute inset-0.5 overflow-hidden rounded-[12px] border border-[#25272b] bg-[#3b3d40] shadow-none">
              <ShotContext.Provider
                value={{
                  globalImageModel: imageModel,
                  isCollapsed,
                  updateShot,
                  handleGenerateImage,
                  handleGenerateVideo,
                  handleShotImageUpload,
                  setFullscreenImage,
                  setFullscreenVideo,
                  setZoomLevel,
                  handleDownloadImage,
                  handleDownloadVideo,
                  regeneratePrompt,
                }}
              >
                <ReactFlow
                  nodes={desktopStartupLocked ? [] : nodes}
                  edges={desktopStartupLocked ? [] : edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodesDelete={onNodesDelete}
                  onEdgesDelete={onEdgesDelete}
                  onConnect={onConnect}
                  isValidConnection={isValidConnection}
                  onConnectEnd={onConnectEnd}
                  onSelectionChange={({ nodes }) => setSelectedNodes(nodes)}
                  onNodeDragStop={onNodeDragStop}
                  onInit={setReactFlowInstance}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onPaneContextMenu={handlePaneContextMenu}
                  onPaneClick={handlePaneClick}
                  onNodeClick={handleNodeClick}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  defaultEdgeOptions={{ type: "deletable", animated: true }}
                  snapToGrid={snapToGrid}
                  snapGrid={[16, 16]}
                  style={{ backgroundColor: desktopStartupLocked ? "#3b3d40" : canvasColor }}
                  className="transition-colors duration-300"
                  minZoom={0.01}
                  maxZoom={2}
                  fitView
                  fitViewOptions={{ padding: 0.5, minZoom: 0.05, maxZoom: 1 }}
                  panOnDrag={!isSelectMode}
                  selectionOnDrag={isSelectMode}
                  panOnScroll={true}
                  zoomOnDoubleClick={false}
                  selectionMode={SelectionMode.Partial}
                  selectionKeyCode={["Control", "Meta"]}
                  multiSelectionKeyCode={["Control", "Meta"]}
                  deleteKeyCode={["Backspace", "Delete"]}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="rgba(255,255,255,0.12)" gap={24} size={1.1} />

                  {false && (
                  <Panel
                    position="top-right"
                    className={`fixed top-6 bottom-6 right-4 flex flex-col transition-[width,background,box-shadow,border-color] duration-300 ease-in-out z-[95] pointer-events-none rounded-l-3xl rounded-r-2xl ${
                      showAiChat
                        ? "bg-[#101012]/98 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] border border-white/10"
                        : "bg-transparent border-l-0 shadow-none"
                    }`}
                    style={{
                      height: "calc(100vh - 48px)",
                      width: showAiChat ? "360px" : "0px",
                    }}
                  >
                    {/* Synchronized sliding tab button */}
                    <button
                      onClick={() => setShowAiChat(!showAiChat)}
                      className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer transition-all duration-300 pointer-events-auto ${
                        showAiChat
                          ? "-left-9 h-14 w-9 rounded-l-2xl border-y border-l border-white/10 bg-[#101012]/95 shadow-2xl text-neutral-300 hover:text-white hover:bg-neutral-900"
                          : "-left-3 h-10 w-3 border-0 bg-transparent shadow-none text-transparent hover:-left-4 hover:w-4"
                      }`}
                      title={showAiChat ? "收起 AI 助手" : "打开 AI 助手"}
                      type="button"
                    >
                      {showAiChat ? (
                        <ChevronRight className="w-4 h-4 transition-transform" />
                      ) : (
                        <span className="block w-0 h-0 border-y-[7px] border-y-transparent border-r-[10px] border-r-neutral-950 drop-shadow-[0_0_6px_rgba(0,0,0,0.35)]" />
                      )}
                    </button>

                    {showAiChat && (
                    <div
                      ref={aiPanelRef}
                      className="h-full w-full flex flex-col overflow-hidden pointer-events-auto relative rounded-l-3xl rounded-r-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Sidebar Header */}
                      <div className="relative flex items-center justify-between px-4 py-3.5 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_38%),linear-gradient(180deg,#151519,#0f0f12)] shrink-0 select-none overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-2xl bg-emerald-400/10 border border-emerald-400/25 flex items-center justify-center shadow-[0_0_22px_rgba(16,185,129,0.12)]">
                            <Sparkles className="w-4 h-4 text-emerald-300" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-neutral-100 leading-tight">
                              AI 创作助手
                            </span>
                            <span className="text-[10px] text-emerald-300/70 font-mono tracking-wide">
                              Canvas Agent
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAiChat(false)}
                          className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer border border-white/5"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scrollbar-hide bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_22%)]">
                        {aiMessages.length === 0 ? (
                          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center px-5 text-neutral-500 gap-4 select-none">
                            <div className="relative w-14 h-14 rounded-3xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.12)]">
                              <div className="absolute inset-2 rounded-2xl border border-white/5" />
                              <Sparkles className="w-6 h-6 text-emerald-300/90" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-neutral-200 mb-1">
                                今天想创作什么？
                              </p>
                              <p className="text-xs max-w-[260px] leading-relaxed text-neutral-500">
                                输入指令、添加参考图，或让助手读取画布节点并继续生成。
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2 text-[10px] text-neutral-500">
                              <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
                                图片
                              </span>
                              <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
                                视频
                              </span>
                              <span className="px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
                                脚本
                              </span>
                            </div>
                          </div>
                        ) : (
                          aiMessages.map((msg, i) => (
                            <div
                              key={i}
                              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}
                            >
                              {msg.role !== "user" && (
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mr-2.5 mt-1 shrink-0">
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                              )}
                              <div
                                onClick={() => {
                                  if (
                                    msg.role === "user" &&
                                    !isAiLoading &&
                                    !isSelectingAiReference
                                  ) {
                                    setAiInput(msg.content);
                                    if (msg.referenceImages)
                                      setAiReferenceImages([
                                        ...msg.referenceImages,
                                      ]);
                                  }
                                }}
                                className={`relative max-w-[88%] px-3.5 py-3 rounded-2xl text-sm leading-relaxed ${
                                  msg.role === "user"
                                    ? `bg-neutral-800 border border-neutral-700 text-neutral-100 ${isAiLoading ? "opacity-80" : "cursor-pointer hover:bg-neutral-700 transition-all"}`
                                    : "bg-neutral-900/80 border border-neutral-800 text-neutral-300"
                                } ${msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"}`}
                                title={
                                  msg.role === "user"
                                    ? "点击复用此消息"
                                    : undefined
                                }
                              >
                                {msg.content}
                                {msg.referenceImages &&
                                  msg.referenceImages.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto mt-3 flex-wrap">
                                      {msg.referenceImages.map(
                                        (imgUrl, idx) => (
                                          <div
                                            key={idx}
                                            className="relative group"
                                          >
                                            <img
                                              src={imgUrl}
                                              className="w-12 h-12 rounded-lg shrink-0 object-cover border border-black/10 shadow-sm"
                                              alt="ref"
                                            />
                                            <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-lg pointer-events-none" />
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))
                        )}
                        {isAiLoading && (
                          <div className="flex justify-start animate-in fade-in">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mr-2.5 shrink-0">
                              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                            </div>
                            <div className="bg-neutral-900/80 border border-neutral-800 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-3">
                              <div className="flex gap-1">
                                <div
                                  className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce"
                                  style={{ animationDelay: "0ms" }}
                                />
                                <div
                                  className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce"
                                  style={{ animationDelay: "150ms" }}
                                />
                                <div
                                  className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-bounce"
                                  style={{ animationDelay: "300ms" }}
                                />
                              </div>
                              <span className="text-xs text-neutral-400 font-medium">
                                正在生成...
                              </span>
                            </div>
                          </div>
                        )}
                        <div ref={aiChatEndRef} />
                      </div>

                      <div className="shrink-0 border-t border-white/10 bg-[linear-gradient(180deg,#101012,#0b0b0d)] p-3.5 shadow-[0_-18px_40px_rgba(0,0,0,0.18)]">
                        <form
                          onSubmit={handleAiSubmit}
                          className="flex flex-col gap-3"
                        >
                          {showAiChat && (
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={aiMode}
                                onChange={(e) => setAiMode(e.target.value)}
                                className="h-9 w-full min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500/50 hover:border-neutral-700 appearance-none transition-colors cursor-pointer"
                              >
                                <option
                                  value="自动识别"
                                  className="bg-neutral-900 text-neutral-300"
                                >
                                  模式：自动
                                </option>
                                <option
                                  value="图像生成"
                                  className="bg-neutral-900 text-neutral-300"
                                >
                                  模式：图片
                                </option>
                                <option
                                  value="视频生成"
                                  className="bg-neutral-900 text-neutral-300"
                                >
                                  模式：视频
                                </option>
                                <option
                                  value="脚本生成"
                                  className="bg-neutral-900 text-neutral-300"
                                >
                                  模式：脚本
                                </option>
                              </select>

                              {aiMode !== "脚本生成" && (
                                <select
                                  value={aiModelSelect}
                                  onChange={(e) =>
                                    setAiModelSelect(e.target.value)
                                  }
                                  className="h-9 w-full min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500/50 hover:border-neutral-700 appearance-none transition-colors cursor-pointer truncate"
                                >
                                  <option
                                    value="自动分配"
                                    className="bg-neutral-900 text-neutral-300"
                                  >
                                    模型：自动
                                  </option>
                                  {aiMode === "图像生成" &&
                                    Object.entries(IMAGE_MODELS).map(
                                      ([k, m]) => (
                                        <option
                                          key={k}
                                          value={k}
                                          className="bg-neutral-900 text-neutral-300"
                                        >
                                          {m.name}
                                        </option>
                                      ),
                                    )}
                                  {aiMode === "视频生成" &&
                                    Object.entries(KLING_MODELS).map(
                                      ([k, m]) => (
                                        <option
                                          key={k}
                                          value={k}
                                          className="bg-neutral-900 text-neutral-300"
                                        >
                                          {m.name}
                                        </option>
                                      ),
                                    )}
                                  {aiMode === "自动识别" && (
                                    <>
                                      <optgroup
                                        label="图像生成模型"
                                        className="bg-neutral-900 text-neutral-500"
                                      >
                                        {Object.entries(IMAGE_MODELS).map(
                                          ([k, m]) => (
                                            <option
                                              key={k}
                                              value={k}
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              {m.name}
                                            </option>
                                          ),
                                        )}
                                      </optgroup>
                                      <optgroup
                                        label="视频生成模型"
                                        className="bg-neutral-900 text-neutral-500"
                                      >
                                        {Object.entries(KLING_MODELS).map(
                                          ([k, m]) => (
                                            <option
                                              key={k}
                                              value={k}
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              {m.name}
                                            </option>
                                          ),
                                        )}
                                      </optgroup>
                                    </>
                                  )}
                                </select>
                              )}

                              {aiMode !== "脚本生成" &&
                                aiModelSelect !== "自动分配" && (
                                  <>
                                    <select
                                      value={aiRatio}
                                      onChange={(e) =>
                                        setAiRatio(e.target.value)
                                      }
                                      className="h-9 w-full min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500/50 hover:border-neutral-700 appearance-none transition-colors cursor-pointer"
                                    >
                                      {IMAGE_MODELS[aiModelSelect]?.ratios ? (
                                        IMAGE_MODELS[aiModelSelect].ratios.map(
                                          (r) => (
                                            <option
                                              key={r.value}
                                              value={r.value}
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              {r.label}
                                            </option>
                                          ),
                                        )
                                      ) : KLING_MODELS[
                                          aiModelSelect as KlingModelId
                                        ] ? (
                                        <>
                                          <option
                                            value="16:9"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            16:9 电影感
                                          </option>
                                          <option
                                            value="9:16"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            9:16 竖屏
                                          </option>
                                          <option
                                            value="1:1"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            1:1 正方形
                                          </option>
                                        </>
                                      ) : (
                                        <>
                                          <option
                                            value="16:9"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            16:9
                                          </option>
                                          <option
                                            value="9:16"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            9:16
                                          </option>
                                          <option
                                            value="1:1"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            1:1
                                          </option>
                                          <option
                                            value="4:3"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            4:3
                                          </option>
                                          <option
                                            value="3:4"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            3:4
                                          </option>
                                        </>
                                      )}
                                    </select>

                                    <select
                                      value={aiRes}
                                      onChange={(e) => setAiRes(e.target.value)}
                                      className="h-9 w-full min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500/50 hover:border-neutral-700 appearance-none transition-colors cursor-pointer"
                                    >
                                      {IMAGE_MODELS[aiModelSelect]
                                        ?.resolutions ? (
                                        IMAGE_MODELS[
                                          aiModelSelect
                                        ].resolutions.map((r) => (
                                          <option
                                            key={r.value}
                                            value={r.value}
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            {r.label}
                                          </option>
                                        ))
                                      ) : KLING_MODELS[
                                          aiModelSelect as KlingModelId
                                        ] ? (
                                        <>
                                          <option
                                            value="720p"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            720p
                                          </option>
                                          <option
                                            value="1080p"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            1080p
                                          </option>
                                          <option
                                            value="4K"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            4K
                                          </option>
                                        </>
                                      ) : (
                                        <>
                                          <option
                                            value="1K"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            1K
                                          </option>
                                          <option
                                            value="2K"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            2K
                                          </option>
                                          <option
                                            value="4K"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            4K
                                          </option>
                                          <option
                                            value="720p"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            720p
                                          </option>
                                          <option
                                            value="1080p"
                                            className="bg-neutral-900 text-neutral-300"
                                          >
                                            1080p
                                          </option>
                                        </>
                                      )}
                                    </select>

                                    {KLING_MODELS[
                                      aiModelSelect as KlingModelId
                                    ] && (
                                      <select
                                        value={aiDuration}
                                        onChange={(e) =>
                                          setAiDuration(e.target.value)
                                        }
                                        className="h-9 w-full min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500/50 hover:border-neutral-700 appearance-none transition-colors cursor-pointer"
                                      >
                                        {KLING_MODELS[
                                          aiModelSelect as KlingModelId
                                        ]?.durations ? (
                                          KLING_MODELS[
                                            aiModelSelect as KlingModelId
                                          ].durations.map((d) => (
                                            <option
                                              key={d}
                                              value={d}
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              {d}
                                            </option>
                                          ))
                                        ) : (
                                          <>
                                            <option
                                              value="5s"
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              5s
                                            </option>
                                            <option
                                              value="10s"
                                              className="bg-neutral-900 text-neutral-300"
                                            >
                                              10s
                                            </option>
                                          </>
                                        )}
                                      </select>
                                    )}
                                  </>
                                )}
                            </div>
                          )}
                          {/* Reference Images Preview */}
                          {aiReferenceImages.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-xl mb-1 items-center custom-scrollbar">
                              <span className="text-xs text-neutral-400 shrink-0 font-medium tracking-wide">
                                参考图
                              </span>
                              <div className="w-px h-6 bg-neutral-800 shrink-0 mx-1" />
                              {aiReferenceImages.map((imgUrl, i) => (
                                <div
                                  key={i}
                                  className="relative w-12 h-12 shrink-0 group"
                                >
                                  <img
                                    src={imgUrl}
                                    className="w-full h-full object-cover rounded-md border border-neutral-700 shadow-sm"
                                    alt="ref"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAiReferenceImages((prev) =>
                                          prev.filter((url) => url !== imgUrl),
                                        )
                                      }
                                      className="bg-red-500/80 rounded-full w-6 h-6 flex items-center justify-center transform scale-50 group-hover:scale-100 transition-all active:scale-90"
                                    >
                                      <X className="w-3.5 h-3.5 text-white" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isSelectingAiReference) {
                                    setIsSelectingAiReference(false);
                                  } else {
                                    setShowAiReferenceMenu(
                                      !showAiReferenceMenu,
                                    );
                                  }
                                }}
                                className={`p-3 rounded-2xl flex items-center justify-center transition-all shrink-0 ${isSelectingAiReference || showAiReferenceMenu ? "bg-emerald-500 text-neutral-950 shadow-lg shadow-emerald-500/20" : "bg-white/[0.04] text-neutral-400 border border-white/[0.08] hover:border-emerald-400/30 hover:text-white"}`}
                                title="添加垫图"
                              >
                                {isSelectingAiReference ? (
                                  <X className="w-5 h-5" />
                                ) : (
                                  <Plus className="w-5 h-5" />
                                )}
                              </button>

                              {showAiReferenceMenu &&
                                !isSelectingAiReference && (
                                  <div className="absolute bottom-full left-0 mb-3 w-44 bg-neutral-950/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 z-[60] backdrop-blur-xl">
                                    <button
                                      type="button"
                                      className="w-full text-left px-5 py-3 text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-3 group"
                                      onClick={() => {
                                        setShowAiReferenceMenu(false);
                                        setIsSelectingAiReference(true);
                                        toast.success(
                                          "请点击画布上的图片来添加垫图。再次点击工具栏按钮完成。",
                                        );
                                      }}
                                    >
                                      <MousePointer2 className="w-4 h-4 text-neutral-400 group-hover:text-blue-400 transition-colors" />
                                      从画布选择
                                    </button>
                                    <div className="h-px w-full bg-white/10" />
                                    <button
                                      type="button"
                                      className="w-full text-left px-5 py-3 text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-3 group"
                                      onClick={() => {
                                        setShowAiReferenceMenu(false);
                                        const input =
                                          document.createElement("input");
                                        input.type = "file";
                                        input.accept =
                                          "image/png, image/jpeg, image/webp";
                                        input.multiple = true;
                                        input.onchange = async (e: any) => {
                                          const files: File[] = Array.from(
                                            e.target.files,
                                          );
                                          if (files.length === 0) return;

                                          if (
                                            aiReferenceImages.length +
                                              files.length >
                                            8
                                          ) {
                                            toast.error(
                                              `最多只能添加 8 张垫图`,
                                            );
                                            return;
                                          }

                                          let uploadedUrls: string[] = [];
                                          const toastId =
                                            toast.loading("正在上传...");

                                          for (const file of files) {
                                            if (file.size > 10 * 1024 * 1024) {
                                              toast.error(
                                                `${file.name} 超过10MB限制`,
                                              );
                                              continue;
                                            }
                                            try {
                                              const formData = new FormData();
                                              formData.append("file", file);
                                              // The backend must have this endpoint or we can just send it via the standard path
                                              // The user code uses api.post directly to '/upload' which expects multipart
                                              const res = await api.post(
                                                "/upload",
                                                formData,
                                                {
                                                  headers: {
                                                    "Content-Type":
                                                      "multipart/form-data",
                                                  },
                                                  showToast: false,
                                                } as any,
                                              );
                                              if (res.data && res.data.url) {
                                                uploadedUrls.push(res.data.url);

                                                // Autocreate image node on canvas per user instruction
                                                setNodes((nds) => [
                                                  ...nds,
                                                  {
                                                    id: `image-${Date.now()}-${Math.random()}`,
                                                    type: "imageNode",
                                                    position: reactFlowInstance
                                                      ? reactFlowInstance.screenToFlowPosition(
                                                          {
                                                            x:
                                                              window.innerWidth /
                                                                2 +
                                                              Math.random() *
                                                                50,
                                                            y:
                                                              window.innerHeight /
                                                                2 +
                                                              Math.random() *
                                                                50,
                                                          },
                                                        )
                                                      : {
                                                          x:
                                                            window.innerWidth /
                                                            2,
                                                          y:
                                                            window.innerHeight /
                                                            2,
                                                        },
                                                    data: {
                                                      url: res.data.url,
                                                      width: 300,
                                                      height: 300,
                                                    },
                                                  },
                                                ]);
                                              }
                                            } catch (err: any) {
                                              console.error(
                                                "Upload local image error:",
                                                err,
                                              );
                                            }
                                          }

                                          if (uploadedUrls.length > 0) {
                                            setAiReferenceImages((prev) =>
                                              [...prev, ...uploadedUrls].slice(
                                                0,
                                                8,
                                              ),
                                            );
                                            toast.success(
                                              `成功添加 ${uploadedUrls.length} 张垫图`,
                                              { id: toastId },
                                            );
                                          } else {
                                            toast.error("上传失败", {
                                              id: toastId,
                                            });
                                          }
                                        };
                                        input.click();
                                      }}
                                    >
                                      <Upload className="w-4 h-4 text-neutral-400 group-hover:text-purple-400 transition-colors" />
                                      上传本地图片
                                    </button>
                                  </div>
                                )}
                            </div>
                            <input
                              type="text"
                              value={aiInput}
                              onChange={(e) => setAiInput(e.target.value)}
                              onFocus={() => setShowAiChat(true)}
                              placeholder={
                                isSelectingAiReference
                                  ? "正在选择垫图... 请点击画布上的图片"
                                  : "输入合成命令..."
                              }
                              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-neutral-100 focus:outline-none focus:border-emerald-400/50 focus:bg-white/[0.06] transition-colors placeholder:text-neutral-500 disabled:opacity-50"
                              disabled={isAiLoading || isSelectingAiReference}
                            />
                            <button
                              type="submit"
                              disabled={
                                !aiInput.trim() ||
                                isAiLoading ||
                                isSelectingAiReference
                              }
                              className="px-5 h-[46px] rounded-2xl bg-emerald-500 text-neutral-950 flex items-center justify-center hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 transition-all text-sm font-bold shrink-0 relative group shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                            >
                              <span className="truncate mr-2">传输</span>
                              <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                              <div className="absolute -top-1 -right-1 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full px-1.5 py-0.5 shadow-sm border border-[#1E1E1E] flex items-center">
                                <Zap className="w-2 h-2 text-neutral-900 fill-white mr-0.5" />
                                <span className="text-[8px] font-black tracking-tighter text-neutral-900">
                                  10
                                </span>
                              </div>
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                    )}
                  </Panel>
                  )}
                  {nodes.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0 text-neutral-600 select-none">
                      <p className="text-lg font-medium tracking-wide opacity-60">
                        双击画布以打开菜单
                      </p>
                    </div>
                  )}
                </ReactFlow>
              </ShotContext.Provider>
                </div>
              </main>

              <div
                className="hidden lg:block w-px shrink-0 cursor-col-resize bg-[#1f2023] hover:bg-[#4772b3] transition-colors"
                onMouseDown={handleRightPanelResizeStart}
                title="拖拽调整右侧面板宽度"
              />

              <aside
                className="hidden lg:flex shrink-0 bg-[#1f2023] flex-col overflow-hidden rounded-l-[8px]"
                style={{ width: rightPanelWidth }}
              >
                <div
                  className="shrink-0 bg-[#1f2023] overflow-hidden rounded-tl-[8px]"
                  style={{ height: rightPanelOutlinerHeight }}
                >
                  <div className="h-6 border-b border-[#25272b] px-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-black tracking-wide text-neutral-300">
                      <Layers className="h-3.5 w-3.5 text-neutral-500" />
                      场景集合
                    </div>
                    <Search className="h-3.5 w-3.5 text-neutral-600" />
                  </div>
                  <div className="h-[calc(100%-1.5rem)] overflow-y-auto custom-scrollbar p-px">
                    <div className="h-full rounded-[8px] border border-[#25272b] bg-[#252629] overflow-hidden">
                      <div className="flex items-center gap-1.5 border-b border-[#2b2d31] px-2 py-1 text-[10px] font-bold text-neutral-400">
                        <ChevronDown className="h-3 w-3" />
                        集合
                      </div>
                      {sceneRootNodes.map((node) => renderSceneTreeNode(node))}
                    </div>
                  </div>
                </div>

                <div
                  className="h-px shrink-0 cursor-row-resize bg-[#1f2023] hover:bg-[#4772b3] transition-colors"
                  onMouseDown={handleOutlinerResizeStart}
                  title="拖拽调整大纲高度"
                />

                <div className="m-1 flex min-h-0 flex-1 overflow-hidden rounded-[12px] border border-[#25272b] bg-[#252629]">
                  <div className="w-8 shrink-0 border-r border-[#2b2d31] bg-transparent py-2 flex flex-col items-center gap-1">
                    {[
                      { id: "properties" as const, label: "属性", icon: Settings2 },
                      { id: "ai" as const, label: "AI 助手", icon: Sparkles },
                    ].map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        title={label}
                        onClick={() => setRightPanelMode(id)}
                        className={`h-6 w-6 rounded-[5px] flex items-center justify-center transition-colors ${
                          rightPanelMode === id
                            ? "bg-[#4772b3] text-white"
                            : "text-[#a8a8a8] hover:bg-[#3f4145] hover:text-white"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>

                  <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar p-2">
                  {rightPanelMode === "ai" ? (
                    <div className="h-full flex flex-col gap-1">
                      <div className="min-h-[220px] flex-1 overflow-y-auto rounded-[8px] bg-[#252629] p-2 space-y-2">
                        {aiMessages.length === 0 ? (
                          <div className="h-full min-h-[180px] flex items-center justify-center text-center text-[10px] leading-relaxed text-neutral-500">
                            暂无对话，输入指令开始生成。
                          </div>
                        ) : (
                          aiMessages.map((msg, index) => (
                            <div
                              key={index}
                              className={`rounded-lg border px-3 py-2 text-[10px] leading-relaxed ${
                                msg.role === "user"
                                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-50"
                                  : "border-white/10 bg-white/[0.04] text-neutral-300"
                              }`}
                            >
                              {msg.content}
                            </div>
                          ))
                        )}
                        {isAiLoading && (
                          <div className="flex items-center gap-2 text-[10px] text-emerald-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在生成...
                          </div>
                        )}
                        <div ref={aiChatEndRef} />
                      </div>

                      <form onSubmit={handleAiSubmit} className="shrink-0 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={aiMode}
                            onChange={(e) => setAiMode(e.target.value)}
                            className="h-8 rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none"
                          >
                            <option value="自动识别">模式：自动</option>
                            <option value="图像生成">模式：图片</option>
                            <option value="视频生成">模式：视频</option>
                            <option value="脚本生成">模式：脚本</option>
                          </select>
                          <select
                            value={aiModelSelect}
                            onChange={(e) => setAiModelSelect(e.target.value)}
                            className="h-8 rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none"
                          >
                            <option value="自动分配">模型：自动</option>
                            {Object.entries(IMAGE_MODELS).map(([key, model]) => (
                              <option key={key} value={key}>
                                {model.name}
                              </option>
                            ))}
                            {Object.entries(KLING_MODELS).map(([key, model]) => (
                              <option key={key} value={key}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder="输入 AI 命令..."
                          disabled={isAiLoading || isSelectingAiReference}
                          className="min-h-[90px] w-full resize-y rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px] text-neutral-100 outline-none focus:border-emerald-400/50"
                        />
                        <Button
                          type="submit"
                          disabled={!aiInput.trim() || isAiLoading || isSelectingAiReference}
                          className="h-9 w-full rounded-lg bg-emerald-500 text-[11px] font-black text-neutral-950 hover:bg-emerald-400"
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          发送
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <>
                  {!selectedPrimaryNode ? (
                    <div className="h-full min-h-[420px] rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center flex flex-col items-center justify-center">
                      <MousePointer2 className="mb-3 h-8 w-8 text-neutral-600" />
                      <div className="text-[12px] font-black text-neutral-300">
                        选择一个节点
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                        点击画布中的任意节点后，只在这里显示它的可编辑参数。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(selectedPrimaryNode.type === "imageShotNode" ||
                        selectedPrimaryNode.type === "videoShotNode") &&
                        (() => {
                          const shot = ((selectedPrimaryNode.data as any)?.shot || {}) as Shot;
                          const selectClass =
                            "h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-purple-400/50";
                          const inputClass =
                            "h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-purple-400/50";
                          const labelClass =
                            "mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500";

                          if (selectedPrimaryNode.type === "imageShotNode") {
                            const currentModel =
                              shot.imageModel ||
                              imageModel ||
                              "gemini-3.1-flash-image-preview";
                            const modelConfig =
                              IMAGE_MODELS[currentModel] ||
                              IMAGE_MODELS["gemini-3.1-flash-image-preview"];
                            const countOptions = Array.from(
                              { length: modelConfig?.maxCount || 4 },
                              (_, index) => index + 1,
                            );

                            return (
                              <section className="rounded-xl border border-purple-400/20 bg-purple-400/[0.045] p-3">
                                <div className="mb-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-100">
                                    <ImageIcon className="h-3.5 w-3.5 text-purple-300" />
                                    图片生成参数
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleGenerateImage(shot.id)}
                                    disabled={shot.status === "generating_image"}
                                    className="h-7 rounded-md bg-purple-500 px-2 text-[10px] font-black text-white hover:bg-purple-400"
                                  >
                                    {shot.status === "generating_image"
                                      ? `生成中 ${shot.progress || 0}%`
                                      : "生成图片"}
                                  </Button>
                                </div>

                                <div className="space-y-3">
                                  <label className="block">
                                    <span className={labelClass}>模型</span>
                                    <select
                                      value={currentModel}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "imageModel"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {Object.values(IMAGE_MODELS).map((model) => (
                                        <option key={model.id} value={model.id}>
                                          {model.name}
                                        </option>
                                      ))}
                                    </select>
                                    {modelConfig?.description && (
                                      <p className="mt-1 text-[9px] leading-relaxed text-neutral-500">
                                        {modelConfig.description}
                                      </p>
                                    )}
                                  </label>

                                  <label className="block">
                                    <span className={labelClass}>提示词</span>
                                    <textarea
                                      value={shot.description || ""}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "description"],
                                          e.target.value,
                                        )
                                      }
                                      placeholder="描述你想要生成的画面内容"
                                      className="min-h-[92px] w-full resize-y rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-200 outline-none focus:border-purple-400/50"
                                    />
                                  </label>

                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="block">
                                      <span className={labelClass}>比例</span>
                                      <select
                                        value={shot.aspectRatio || "16:9"}
                                        onChange={(e) =>
                                          updateSelectedNodeDataPath(
                                            ["shot", "aspectRatio"],
                                            e.target.value,
                                          )
                                        }
                                        className={selectClass}
                                      >
                                        {(modelConfig?.ratios?.length
                                          ? modelConfig.ratios
                                          : [
                                              { label: "16:9", value: "16:9" },
                                              { label: "9:16", value: "9:16" },
                                              { label: "1:1", value: "1:1" },
                                            ]
                                        ).map((ratio) => (
                                          <option key={ratio.value} value={ratio.value}>
                                            {ratio.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className={labelClass}>分辨率</span>
                                      <select
                                        value={shot.resolution || "2K"}
                                        onChange={(e) =>
                                          updateSelectedNodeDataPath(
                                            ["shot", "resolution"],
                                            e.target.value,
                                          )
                                        }
                                        className={selectClass}
                                      >
                                        {(modelConfig?.resolutions?.length
                                          ? modelConfig.resolutions
                                          : [
                                              { label: "1K", value: "1K" },
                                              { label: "2K", value: "2K" },
                                              { label: "4K", value: "4K" },
                                            ]
                                        ).map((resolution) => (
                                          <option
                                            key={resolution.value}
                                            value={resolution.value}
                                          >
                                            {resolution.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>

                                  <label className="block">
                                    <span className={labelClass}>生成数量</span>
                                    <select
                                      value={shot.numberOfImages || 1}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "numberOfImages"],
                                          Number(e.target.value),
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {countOptions.map((count) => (
                                        <option key={count} value={count}>
                                          {count} 张
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  {modelConfig?.styles?.length ? (
                                    <label className="block">
                                      <span className={labelClass}>风格</span>
                                      <select
                                        value={shot.imageStyle || modelConfig.styles[0].value}
                                        onChange={(e) =>
                                          updateSelectedNodeDataPath(
                                            ["shot", "imageStyle"],
                                            e.target.value,
                                          )
                                        }
                                        className={selectClass}
                                      >
                                        {modelConfig.styles.map((style) => (
                                          <option key={style.value} value={style.value}>
                                            {style.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                </div>
                              </section>
                            );
                          }

                          const currentVideoModel =
                            (shot.klingModel as KlingModelId | undefined) ||
                            "kling-video-o1";
                          const videoConfig =
                            KLING_MODELS[currentVideoModel] ||
                            KLING_MODELS["kling-video-o1"];
                          return (
                            <section className="rounded-xl border border-blue-400/20 bg-blue-400/[0.04] p-3">
                              <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-100">
                                  <Video className="h-3.5 w-3.5 text-blue-300" />
                                  视频生成参数
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleGenerateVideo(shot.id)}
                                  disabled={shot.status === "generating_video"}
                                  className="h-7 rounded-md bg-blue-500 px-2 text-[10px] font-black text-white hover:bg-blue-400"
                                >
                                  {shot.status === "generating_video"
                                    ? `生成中 ${shot.progress || 0}%`
                                    : "生成视频"}
                                </Button>
                              </div>

                              <div className="space-y-3">
                                <label className="block">
                                  <span className={labelClass}>模型</span>
                                  <select
                                    value={currentVideoModel}
                                    onChange={(e) =>
                                      updateSelectedNodeDataPath(
                                        ["shot", "klingModel"],
                                        e.target.value,
                                      )
                                    }
                                    className={selectClass}
                                  >
                                    {Object.entries(KLING_MODELS).map(([key, model]) => (
                                      <option key={key} value={key}>
                                        {model.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="block">
                                  <span className={labelClass}>提示词</span>
                                  <textarea
                                    value={shot.description || shot.videoPrompt || ""}
                                    onChange={(e) =>
                                      updateSelectedNodeDataPath(
                                        ["shot", "description"],
                                        e.target.value,
                                      )
                                    }
                                    placeholder="描述你想要生成的视频内容"
                                    className="min-h-[92px] w-full resize-y rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-200 outline-none focus:border-blue-400/50"
                                  />
                                </label>

                                <div className="grid grid-cols-2 gap-2">
                                  <label className="block">
                                    <span className={labelClass}>模式</span>
                                    <select
                                      value={shot.klingMode || videoConfig.modes[0] || "std"}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "klingMode"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {videoConfig.modes.map((mode) => (
                                        <option key={mode} value={mode}>
                                          {mode === "std"
                                            ? "标准"
                                            : mode === "pro"
                                              ? "专业"
                                              : "默认"}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className={labelClass}>输入方式</span>
                                    <select
                                      value={shot.videoInputMode || "t2v"}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "videoInputMode"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      <option value="t2v">文生视频</option>
                                      <option value="i2v">全能参考</option>
                                      <option value="firstLastFrame">首尾帧</option>
                                      <option value="subjectControl">主体控制</option>
                                      <option value="videoEdit">视频编辑</option>
                                    </select>
                                  </label>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <label className="block">
                                    <span className={labelClass}>比例</span>
                                    <select
                                      value={shot.aspectRatio || "16:9"}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "aspectRatio"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {videoConfig.aspectRatios.map((ratio) => (
                                        <option key={ratio} value={ratio}>
                                          {ratio}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className={labelClass}>时长</span>
                                    <select
                                      value={shot.klingDuration || videoConfig.durations[0] || "5s"}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "klingDuration"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {videoConfig.durations.map((duration) => (
                                        <option key={duration} value={duration}>
                                          {duration}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className={labelClass}>清晰度</span>
                                    <select
                                      value={shot.resolution || videoConfig.resolutions[0] || "1080p"}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          ["shot", "resolution"],
                                          e.target.value,
                                        )
                                      }
                                      className={selectClass}
                                    >
                                      {videoConfig.resolutions.map((resolution) => (
                                        <option key={resolution} value={resolution}>
                                          {resolution}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <label className="block">
                                  <span className={labelClass}>负面提示词</span>
                                  <input
                                    type="text"
                                    value={shot.negativePrompt || ""}
                                    onChange={(e) =>
                                      updateSelectedNodeDataPath(
                                        ["shot", "negativePrompt"],
                                        e.target.value,
                                      )
                                    }
                                    className={inputClass}
                                  />
                                </label>
                              </div>
                            </section>
                          );
                        })()}

                      {selectedNodePropertyGroups.length === 0 ? (
                        <section className="rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] leading-relaxed text-neutral-500">
                          这个节点没有可编辑参数，或它的内容是输出结果/资源链接，已从属性栏中过滤。
                        </section>
                      ) : (
                        selectedNodePropertyGroups.map((group) => (
                          <section
                            key={group.title}
                            className="rounded-xl border border-white/10 bg-black/20 p-3"
                          >
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-neutral-200">
                              <Settings2 className="h-3.5 w-3.5 text-purple-300" />
                              {group.title}
                            </div>
                            <div className="space-y-2">
                              {group.items.map((item) => (
                                <label key={item.key} className="block">
                                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500">
                                    {item.label}
                                  </span>
                                  {item.type === "boolean" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateSelectedNodeDataPath(item.path, !item.value)
                                      }
                                      className={`h-8 w-full rounded-md border px-2 text-left text-[10px] font-bold transition-colors ${
                                        item.value
                                          ? "border-emerald-400/25 bg-emerald-400/15 text-emerald-100"
                                          : "border-white/[0.08] bg-black/25 text-neutral-400"
                                      }`}
                                    >
                                      {item.value ? "开启" : "关闭"}
                                    </button>
                                  ) : item.type === "number" ? (
                                    <input
                                      type="number"
                                      value={
                                        Number.isFinite(item.value as number)
                                          ? (item.value as number)
                                          : 0
                                      }
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          item.path,
                                          Number(e.target.value),
                                        )
                                      }
                                      className="h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 font-mono text-[10px] text-neutral-200 outline-none focus:border-purple-400/50"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={formatPropertyValue(item.value)}
                                      onChange={(e) =>
                                        updateSelectedNodeDataPath(
                                          item.path,
                                          parsePropertyValue(e.target.value),
                                        )
                                      }
                                      className="h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-purple-400/50"
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                          </section>
                        ))
                      )}
                    </div>
                  )}
                    </>
                  )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}

      {showScriptModal && (
        <div className="fixed inset-0 z-50 bg-black/5 flex items-center justify-center p-4 transition-all duration-300">
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-neutral-900 shadow-2xl border border-neutral-800 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-row items-center justify-between px-6 py-5 border-b border-neutral-800 bg-neutral-900/50">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <FileText className="w-5 h-5 mr-2 text-neutral-400" />
                动画脚本
              </h2>
              <button
                className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                onClick={() => setShowScriptModal(false)}
                disabled={isProcessing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-black uppercase tracking-widest text-neutral-500 ml-1">
                  脚本数据
                </Label>
                <Textarea
                  placeholder="请输入动画脚本解析内容..."
                  className="min-h-[300px] resize-none bg-neutral-800 border-neutral-700 text-neutral-300 focus:bg-neutral-800 focus:ring-2 focus:ring-blue-500/50 transition-all rounded-md p-4 leading-relaxed shadow-sm placeholder:text-neutral-600"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  disabled={isProcessing}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {globalError && (
                <div className="p-4 bg-red-50/80 border border-red-100 text-red-600 rounded-md text-sm flex items-start ">
                  <AlertCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{globalError}</span>
                </div>
              )}

              {isProcessing && (
                <div className="space-y-3 py-4 bg-black/50 rounded-md p-4 border border-black/20">
                  <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden relative">
                    <div className="absolute top-0 bottom-0 left-0 w-full bg-neutral-100 rounded-full animate-pulse origin-left" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-tighter text-center text-neutral-600 leading-relaxed">
                    {progressText || "正在审阅脚本。正在合成场景..."}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-neutral-800 bg-neutral-900/50">
              <Button
                className="w-full h-12 rounded-md text-base font-medium shadow-sm hover:shadow-md transition-all"
                onClick={extractStoryboard}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    信号处理中...
                  </>
                ) : (
                  "片段提取"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/5 flex items-center justify-center p-4 transition-all duration-300">
          <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-neutral-900 shadow-2xl border border-neutral-800 rounded-lg overflow-hidden">
            <div className="flex flex-row items-center justify-between px-6 py-5 border-b border-neutral-800 bg-neutral-900/50 sticky top-0 z-10">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <Settings2 className="w-5 h-5 mr-2 text-neutral-400" />
                协议偏好
              </h2>
              <button
                className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                onClick={() => setShowSettings(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-md">
                <p className="text-xs text-blue-400 leading-relaxed">
                  全局系统加密激活。API核心受保护。每次合成请求将扣除积分。
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-black uppercase tracking-widest text-neutral-600 ml-1">
                  文本生成引擎
                </Label>
                <select
                  className="flex h-11 w-full rounded-md border border-black/20 bg-black/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                  value={textModel}
                  onChange={(e) => setTextModel(e.target.value)}
                >
                  <option value="gemini-3.1-pro-preview">
                    Gemini 3.1 Pro 预览版
                  </option>
                  <option value="gemini-3-flash-preview">
                    Gemini 3 Flash 预览版
                  </option>
                  <option value="gemini-3.1-flash-lite-preview">
                    Gemini 3.1 Flash Lite 预览版
                  </option>
                  <option value="deepseek-chat">DeepSeek Chat</option>
                  <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-black uppercase tracking-widest text-neutral-600 ml-1">
                  图像生成引擎
                </Label>
                <select
                  className="flex h-11 w-full rounded-md border border-black/20 bg-black/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                >
                  {Object.values(IMAGE_MODELS).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-2">
                <button
                  onClick={testjepowConnection}
                  disabled={testStatus === "testing"}
                  className={`w-full py-2.5 rounded-md font-medium transition-all flex items-center justify-center ${
                    testStatus === "testing"
                      ? "bg-neutral-100 text-neutral-600 cursor-not-allowed"
                      : testStatus === "success"
                        ? "bg-green-50 text-green-600 border border-green-200"
                        : testStatus === "error"
                          ? "bg-red-50 text-red-600 border border-red-200"
                          : "bg-white text-neutral-900 hover:bg-neutral-100 shadow-sm"
                  }`}
                >
                  {testStatus === "testing" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/20 border-t-neutral-600 rounded-full animate-spin mr-2" />
                      正在检测核心...
                    </>
                  ) : testStatus === "success" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      核心稳定
                    </>
                  ) : testStatus === "error" ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      核心故障
                    </>
                  ) : (
                    "诊断核心上行"
                  )}
                </button>
                {testStatus === "error" && testError && (
                  <p className="mt-2 text-xs text-red-500 bg-red-50/50 p-2 rounded-lg border border-red-100">
                    {testError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {sceneRenameMenu && (
        <div
          className="fixed z-[300] min-w-[108px] rounded-[6px] border border-[#34363a] bg-[#252629]/98 p-1 shadow-2xl backdrop-blur-sm"
          style={{ left: sceneRenameMenu.x, top: sceneRenameMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="flex h-7 w-full items-center rounded-[4px] px-2 text-left text-[11px] font-medium text-neutral-200 hover:bg-[#34363a]"
            onClick={() => {
              setRenamingNodeId(sceneRenameMenu.nodeId);
              setRenamingNodeLabel(sceneRenameMenu.label);
              setSceneRenameMenu(null);
            }}
          >
            重命名
          </button>
        </div>
      )}

      {paneContextMenu && (
        <PaneNodeContextMenu x={paneContextMenu.x} y={paneContextMenu.y}>
          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddTextNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <TypeIcon className="w-4 h-4 mr-2.5 text-neutral-500" />
            文本
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddScriptNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <FileText className="w-4 h-4 mr-2.5 text-neutral-500" />
            脚本
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddImageNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <ImageIcon className="w-4 h-4 mr-2.5 text-neutral-500" />
            图片生成
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddVideoNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Video className="w-4 h-4 mr-2.5 text-neutral-500" />
            视频生成
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <div className="px-2 py-0.5 text-[8px] font-semibold tracking-wide text-neutral-400 uppercase select-none">
            3D · AI 工作流
          </div>

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddImageTo3DNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Box className="w-4 h-4 mr-2.5 text-neutral-500" />
            3D 图像转模型
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddMaterialGenNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Layers className="w-4 h-4 mr-2.5 text-neutral-500" />
            3D PBR材质生成
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddMaterialReplaceNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Palette className="w-4 h-4 mr-2.5 text-neutral-500" />
            3D 材质贴附重贴
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddThreeDEditorNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Box className="w-4 h-4 mr-2.5 text-neutral-500" />
            3D 场景编辑器
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <button
            className="flex items-center justify-start h-9 px-3 rounded-md text-xs font-medium transition-all duration-200 bg-transparent text-neutral-600 hover:bg-black/5 hover:text-neutral-900"
            onClick={() => {
              handleAddThreeDRenderNode({
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          >
            <Camera className="w-4 h-4 mr-2.5 text-neutral-500" />
            3D AI场景渲染
          </button>

          <div className="h-px w-full bg-neutral-100 my-0.5" />

          <CyclesPaletteMenu
            onAdd={(type) => {
              handleAddGenericNode(type, {
                x: paneContextMenu.flowX,
                y: paneContextMenu.flowY,
              });
              setPaneContextMenu(null);
            }}
          />
        </PaneNodeContextMenu>
      )}

      {fullscreenImage && (
        <div className="fixed inset-0 z-50 bg-white/90 flex items-center justify-center p-4 overflow-hidden">
          <div className="fixed top-4 right-4 flex items-center gap-2 z-50 bg-black/50 p-2 rounded-lg ">
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-900 hover:bg-white/60"
              onClick={() => setZoomLevel((z) => Math.max(0.25, z - 0.25))}
              title="缩小"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <span className="text-neutral-900 text-sm font-mono w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-900 hover:bg-white/60"
              onClick={() => setZoomLevel((z) => Math.min(5, z + 0.25))}
              title="放大"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <div className="w-px h-6 bg-white/60 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-900 hover:bg-white/60"
              onClick={() => {
                setFullscreenImage(null);
                setZoomLevel(1);
              }}
              title="关闭"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
          <div
            className="flex items-center justify-center min-h-full min-w-full transition-transform duration-200 ease-in-out origin-center"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <img
              src={fullscreenImage}
              alt="Fullscreen view"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {fullscreenVideo && (
        <div className="fixed inset-0 z-50 bg-white/90 flex items-center justify-center p-4 overflow-hidden">
          <div className="fixed top-4 right-4 flex items-center gap-2 z-50 bg-black/50 p-2 rounded-lg ">
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-900 hover:bg-white/60"
              onClick={() => {
                setFullscreenVideo(null);
              }}
              title="关闭"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
          <div className="flex items-center justify-center min-h-full min-w-full">
            <video
              src={fullscreenVideo}
              autoPlay
              controls
              loop
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* --- User Management Modals --- */}
      {user && !user.phone && (
        <BindPhoneModal
          onSuccess={(phone) => {
            const updatedUser = { ...user, phone };
            setUser(updatedUser);
            localStorage.setItem("ais-user", JSON.stringify(updatedUser));
          }}
        />
      )}

      {showDesktopDownloadPrompt && (
        <DesktopDownloadPrompt
          onClose={() => setShowDesktopDownloadPrompt(false)}
        />
      )}

      {canvasOnly && !user && (
        <div className="fixed inset-0 z-[90000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <DesktopLoginGate
            waiting={desktopAuthPending || !!token}
            onOpenLogin={async () => {
              setDesktopAuthPending(true);
              await startDesktopBrowserLogin();
            }}
          />
        </div>
      )}

      {canvasOnly && user && desktopScreen === "home" && (
        <div className="fixed inset-0 z-[90000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
          <DesktopHomeScreen
            user={user}
            onStart={() => {
              setDesktopScreen("canvas");
              setView("canvas");
            }}
            onLogout={() => {
              setToken(null);
              setUser(null);
              setNodes([]);
              setEdges([]);
              setCurrentProjectId(null);
              setDesktopScreen("home");
              localStorage.removeItem("ais-user");
              localStorage.removeItem("ais-token");
              toast.info("已退出登录");
            }}
          />
        </div>
      )}

      {canvasOnly && user && (
        <NewProjectSaveDialog
          userId={String(user.id)}
          open={showNewProjectSaveDialog}
          onClose={() => setShowNewProjectSaveDialog(false)}
          onCreated={handleConfirmNewProjectSave}
        />
      )}

      {showAuthModal && !canvasOnly && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={(userData, authToken) =>
            applyAuthSession(userData, authToken)
          }
        />
      )}

      {!canvasOnly && showProjectList && (
        <ProjectListModal
          projects={cloudProjects}
          onClose={popView}
          onLoad={handleLoadCloudProject}
          onDelete={handleDeleteCloudProject}
          onRename={handleRenameCloudProject}
        />
      )}

      {!canvasOnly && showRechargeModal && user && (
        <RechargeModal
          user={user}
          initialPkg={selectedRechargePkg}
          onClose={() => {
            setShowRechargeModal(false);
            setSelectedRechargePkg(null);
          }}
          onSuccess={() => handleRecharge()}
        />
      )}

      {/* --- User Menu Popover --- */}
      {showUserMenu && user && (
        <div
          className="fixed top-[4rem] md:top-[5rem] left-[4rem] md:left-[5rem] z-[20000] bg-white border border-black/10 rounded-md shadow-2xl p-4 w-64 animate-in slide-in-from-left-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-black/5">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-neutral-900 font-bold text-lg">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900">
                {user.username}
              </p>
              <p className="text-[10px] text-neutral-500">
                UID: {user.id.slice(-6)}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between p-2 rounded-lg bg-black/5 border border-black/5 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-neutral-700">能量储备</span>
              </div>
              <span className="text-sm font-bold text-amber-500">
                {user.credits}
              </span>
            </div>

            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg text-xs text-neutral-600 hover:bg-black/5 hover:text-neutral-900 transition-all"
              onClick={() => {
                setShowProjectList(true);
                setShowUserMenu(false);
              }}
            >
              <Clock className="w-4 h-4" />
              项目归档
            </button>

            {!canvasOnly &&
              (user.role === "admin" || user.role === "super_admin") && (
              <button
                className="w-full flex items-center gap-3 p-2 rounded-lg text-xs text-blue-400 hover:bg-blue-400/10 transition-all"
                onClick={() => {
                  setShowAdminPanel(true);
                  setShowUserMenu(false);
                }}
              >
                <ShieldCheck className="w-4 h-4" />
                指令中心
              </button>
            )}

            {canvasOnly && (
              <button
                className="w-full flex items-center gap-3 p-2 rounded-lg text-xs text-amber-600 hover:bg-amber-500/10 transition-all"
                onClick={() => {
                  openJepowWeb("/");
                  setShowUserMenu(false);
                }}
              >
                <CreditCard className="w-4 h-4" />
                前往网站充值
              </button>
            )}

            <div className="h-px bg-black/5 my-2" />
            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg text-xs text-red-500 hover:bg-red-500/10 transition-all font-black uppercase tracking-widest"
              onClick={() => {
                setToken(null);
                setUser(null);
                setShowUserMenu(false);
                setNodes([]);
                setEdges([]);
                setCurrentProjectId(null);
                setProjectName("未命名原型");
                localStorage.removeItem(`ais-nodes-${user?.id || "guest"}`);
                localStorage.removeItem(`ais-edges-${user?.id || "guest"}`);
                localStorage.removeItem(
                  `ais-project-id-${user?.id || "guest"}`,
                );
                localStorage.removeItem(
                  `ais-project-name-${user?.id || "guest"}`,
                );
                localStorage.removeItem("ais-user");
                toast.info("已成功登出");
              }}
            >
              <LogOut className="w-4 h-4" />
              登出
            </button>
          </div>
        </div>
      )}

      {!canvasOnly &&
        showAdminPanel &&
        (user?.role === "admin" || user?.role === "super_admin") && (
          <React.Suspense
            fallback={
              <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-white/80">
                <Loader2 className="w-8 h-8 animate-spin text-neutral-900" />
              </div>
            }
          >
            <AdminPanel
              onClose={popView}
              currentUser={user}
              onConfigUpdate={fetchSiteConfig}
            />
          </React.Suspense>
        )}

      {showNewProjectConfirm && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-white/60 animate-in fade-in duration-200">
          <Card className="w-full max-w-sm bg-white border-black/10 shadow-2xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-neutral-900 font-black uppercase tracking-widest">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                初始化新工作区？
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              <p className="text-[11px] text-neutral-500 leading-relaxed font-bold uppercase tracking-widest px-4">
                这将清除所有当前的画布节点。在继续之前，必须确保已保存的数据已同步。
              </p>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="ghost"
                  className="flex-1 bg-black/5 hover:bg-black/10 text-neutral-500 font-black uppercase tracking-[0.2em] h-12 rounded-md transition-all"
                  onClick={() => setShowNewProjectConfirm(false)}
                >
                  放弃
                </Button>
                <Button
                  className="flex-1 bg-white hover:bg-neutral-200 text-black font-black uppercase tracking-[0.2em] h-12 rounded-md transition-all border-none"
                  onClick={handleNewProject}
                >
                  确认
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AnimatePresence>
        {!canvasOnly && showPublicProfile && (
          <PublicProfileModal
            userId={showPublicProfile}
            currentUser={user}
            onClose={popView}
            onLogout={() => {
              setToken(null);
              setUser(null);
              setNodes([]);
              setEdges([]);
              setCurrentProjectId(null);
              setProjectName("未命名原型");
              localStorage.removeItem(`ais-nodes-${user?.id || "guest"}`);
              localStorage.removeItem(`ais-edges-${user?.id || "guest"}`);
              localStorage.removeItem(`ais-project-id-${user?.id || "guest"}`);
              localStorage.removeItem(
                `ais-project-name-${user?.id || "guest"}`,
              );
              localStorage.removeItem("ais-user");
              setView("landing");
              popView();
              toast.info("已成功登出");
            }}
            onPurchaseProject={(postId) => {
              // Handle purchase in App if needed, or just show success
            }}
            onOpenProfile={(id) => pushView("profile", id)}
            onOpenChat={(id) => {
              pushView("messages", id);
            }}
            onUpdateProfile={(updatedUser) => {
              setUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
            }}
            onUploadWork={() => {
              setTriggerUpload(true);
            }}
            onViewPost={(post) => pushView("post", post)}
            onOpenEditProfile={() => setShowEditProfileModal(true)}
          />
        )}

        {showEditProfileModal && (
          <EditProfileModal
            user={user}
            onClose={() => setShowEditProfileModal(false)}
            onUpdate={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {showAccountManagementModal && (
          <AccountManagementModal
            user={user}
            onClose={() => setShowAccountManagementModal(false)}
            onUpdate={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {!canvasOnly && viewingActivity && (
          <ActivityDetailModal
            activity={viewingActivity}
            onClose={popView}
            onViewPost={(post) => pushView("post", post)}
          />
        )}

        {!canvasOnly && viewingPost && (
          <PostViewModal
            key="post-view"
            post={viewingPost}
            currentUser={user}
            onLogin={() => setShowAuthModal(true)}
            onClose={popView}
            onNavigate={(p) => replaceView("post", p)}
            onPurchaseProject={(postId) => {
              // Handle purchase
            }}
            onOpenProfile={(id) => {
              pushView("profile", id);
            }}
          />
        )}

        {!canvasOnly && showCreditsModal && (
          <CreditsModal
            user={user}
            creditsTab={creditsTab}
            setCreditsTab={setCreditsTab}
            loadingTransactions={loadingTransactions}
            transactions={transactions}
            onClose={popView}
            onRecharge={(pkg) => {
              if (pkg) setSelectedRechargePkg(pkg);
              setShowRechargeModal(true);
            }}
          />
        )}

        {!canvasOnly && showMessagesPanel && user && (
          <MessagesPanel
            isOpen={showMessagesPanel}
            currentUserId={user.id}
            currentUser={user}
            activeTab={
              navStack[navStack.length - 1]?.type === "messages"
                ? navStack[navStack.length - 1]?.data?.tab
                : undefined
            }
            onTabChange={(tab) => updateCurrentViewData({ tab })}
            activeChatUser={activeChatUser}
            setActiveChatUser={setActiveChatUser}
            onOpenProfile={(id) => {
              pushView("profile", id);
            }}
            onOpenPost={(postId) => {
              api
                .get(`/community/posts/${postId}`)
                .then((res) => {
                  if (res.data && res.data.id) {
                    pushView("post", res.data);
                  } else {
                    toast.error("获取资源信息失败");
                  }
                })
                .catch(() => {
                  // Toast already handled by axios interceptor
                });
            }}
            onClose={popView}
          />
        )}

        {showInvitationModal && (
          <div className="fixed inset-0 z-[200000] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/80 "
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-md border border-black/10 overflow-hidden shadow-2xl p-8"
            >
              <div className="w-16 h-16 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
                <Key className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-neutral-900 text-center mb-2 uppercase tracking-tighter">
                协议识别
              </h3>
              <p className="text-xs text-neutral-500 text-center mb-8 px-4 leading-relaxed font-bold uppercase tracking-[0.1em]">
                受限矩阵访问。输入 8 位访问密钥以启动上行链路。
              </p>

              <div className="space-y-4">
                <Input
                  value={invitationCode}
                  onChange={(e) =>
                    setInvitationCode(e.target.value.toUpperCase())
                  }
                  placeholder="接入协议密钥"
                  className="h-14 bg-black/5 border-black/5 rounded-md text-center font-mono text-xl tracking-[0.2em] uppercase focus:ring-black/10"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleVerifyInvitation()
                  }
                />

                <Button
                  onClick={handleVerifyInvitation}
                  disabled={isVerifyingInv}
                  className="w-full h-14 bg-white text-black hover:bg-neutral-200 rounded-md font-black text-xs uppercase tracking-[0.3em] shadow-lg disabled:opacity-50 transition-all active:scale-95"
                >
                  {isVerifyingInv ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      验证中...
                    </div>
                  ) : (
                    "启动认证"
                  )}
                </Button>

                <button
                  onClick={() => setShowInvitationModal(false)}
                  className="w-full text-[10px] text-neutral-600 hover:text-neutral-900 transition-colors py-2 font-black uppercase tracking-widest"
                >
                  终止
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/80 "
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-md border border-black/10 overflow-hidden shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-neutral-900 mb-3">
                清除项目数据？
              </h3>
              <p className="text-base text-neutral-600 mb-10 leading-relaxed px-4">
                此操作将永久抹除所有归档数据，无法恢复。
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={confirmDeleteProject}
                  disabled={isDeleting}
                  className="w-full h-14 bg-red-600 text-neutral-900 hover:bg-red-500 rounded-md font-bold text-lg shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  {isDeleting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      清除中...
                    </div>
                  ) : (
                    "确认永久清除"
                  )}
                </Button>
                <Button
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                  variant="ghost"
                  className="w-full h-14 text-neutral-600 hover:text-neutral-900 hover:bg-black/5 rounded-md font-bold transition-all"
                >
                  放弃
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster position="top-center" richColors />
    </div>
  );
}
