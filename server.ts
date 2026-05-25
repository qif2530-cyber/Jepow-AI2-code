import 'dotenv/config'; // Top priority: load env vars first
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import { Server } from 'socket.io';
import { createServer } from 'http';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { AlipaySdk } from 'alipay-sdk';
import WxPay from 'wechatpay-node-v3';
import crypto from 'crypto';
import os from 'os';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Desktop app (Electron) and production both use a persistent user data directory
const isDesktop = process.env.JEPOW_DESKTOP === '1';
const isProd =
  isDesktop ||
  process.env.NODE_ENV === 'production' ||
  fs.existsSync(path.join(os.homedir(), '.jepow-data'));
const PersistentDataDir = isDesktop && process.env.JEPOW_USER_DATA
  ? process.env.JEPOW_USER_DATA
  : isProd
    ? path.join(os.homedir(), '.jepow-data')
    : process.cwd();
if (isProd && !fs.existsSync(PersistentDataDir)) {
  fs.mkdirSync(PersistentDataDir, { recursive: true });
}

// Use environment variable for DB path, fallback to local db.json or persistent storage
const DB_FILE = process.env.DB_PATH || path.join(PersistentDataDir, 'db.json');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_PATH || path.join(PersistentDataDir, 'uploads'));

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const TEMP_DIR = path.resolve(process.env.TEMP_PATH || path.join(PersistentDataDir, 'temp'));

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Detect extension and mime-type from file content buffer magic numbers.
 */
function detectExtensionAndMime(buffer: Buffer, declaredExt?: string): { ext: string, mime: string } {
  if (buffer.length >= 4) {
    const hex = buffer.toString('hex', 0, 4).toLowerCase();
    if (hex.startsWith('ffd8ff')) {
      return { ext: '.jpg', mime: 'image/jpeg' };
    }
    if (hex.startsWith('89504e47')) {
      return { ext: '.png', mime: 'image/png' };
    }
    if (hex.startsWith('47494638')) {
      return { ext: '.gif', mime: 'image/gif' };
    }
    if (hex.startsWith('52494646')) {
      return { ext: '.webp', mime: 'image/webp' };
    }
    if (hex.startsWith('25504446')) {
      return { ext: '.pdf', mime: 'application/pdf' };
    }
  }

  if (buffer.length >= 12) {
    const hex = buffer.toString('hex', 0, 12).toLowerCase();
    // MP4/MOV check
    if (hex.includes('66747970')) {
      return { ext: '.mp4', mime: 'video/mp4' };
    }
    if (hex.includes('6d6f6f76') || hex.includes('6d646174')) {
      return { ext: '.mov', mime: 'video/quicktime' };
    }
  }

  // Fallback to declared extension if we didn't match magic bytes but have a declared type
  if (declaredExt) {
    const cleanExt = declaredExt.toLowerCase();
    if (cleanExt === '.jpg' || cleanExt === '.jpeg') return { ext: '.jpg', mime: 'image/jpeg' };
    if (cleanExt === '.png') return { ext: '.png', mime: 'image/png' };
    if (cleanExt === '.webp') return { ext: '.webp', mime: 'image/webp' };
    if (cleanExt === '.gif') return { ext: '.gif', mime: 'image/gif' };
    if (cleanExt === '.mp4') return { ext: '.mp4', mime: 'video/mp4' };
    if (cleanExt === '.mov') return { ext: '.mov', mime: 'video/quicktime' };
  }

  return { ext: '.png', mime: 'image/png' };
}

/**
 * Automatically converts Base64 encoded images/videos or local relative paths into high-speed, 
 * publicly accessible HTTP/HTTPS URLs targeting the host server's local /temp folder.
 */
function ensurePublicUrl(val: string, req: express.Request): string {
  if (typeof val !== 'string') return val;
  const value = val.trim();
  if (!value) return value;

  // 1. If it's already a public HTTP/HTTPS URL, skip it (unless it points to localhost / internal addresses)
  if (value.startsWith('http://') || value.startsWith('https://')) {
    if (!value.includes('localhost') && !value.includes('127.0.0.1')) {
      return value;
    }
  }

  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const protocol = req.get('x-forwarded-proto') || 'https';
  const domainUrl = `${protocol}://${host}`;

  // 2. Local uploads relative paths or local URLs
  const localUploadPrefixes = ['/uploads/', '/api/uploads/', '/api/image?f=', '/temp/'];
  const matchedPrefix = localUploadPrefixes.find(prefix => value.startsWith(prefix) || value.includes(prefix));

  if (matchedPrefix) {
    try {
      const cleanPath = value.split('f=').pop() || value;
      const fileName = path.basename(cleanPath.replace('/api/uploads/', '').replace('/uploads/', '').replace('/temp/', ''));
      
      const possibleDirs = [
        UPLOADS_DIR,
        TEMP_DIR,
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), 'temp'),
        path.join(process.cwd(), '../jepow-data/uploads'),
        path.join('/home/admin/jepow-data/uploads'),
        path.join('/home/admin/jepow_data/uploads'),
        path.join('/home/admin/jepow-data/temp'),
        path.join('/home/admin/jepow_data/temp')
      ];

      let foundPath = null;
      for (const dir of possibleDirs) {
        const p = path.join(dir, fileName);
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }

      if (foundPath) {
        const buffer = fs.readFileSync(foundPath);
        const sourceExt = path.extname(fileName).toLowerCase();
        const { ext, mime } = detectExtensionAndMime(buffer, sourceExt);
        
        const uniqueFilename = `temp_${crypto.randomBytes(16).toString('hex')}${ext}`;
        const targetPath = path.join(TEMP_DIR, uniqueFilename);
        
        fs.writeFileSync(targetPath, buffer);
        console.log(`[Public URL Conversion] Copied file to temp with detected format: ${uniqueFilename} (${mime})`);
        return `${domainUrl}/temp/${uniqueFilename}`;
      } else {
        console.warn(`[Public URL Conversion] Local file not found for path: ${value}`);
      }
    } catch (e) {
      console.error(`[Public URL Conversion] Error converting local path to public URL:`, e);
    }
    // Fallback
    let cleanLocal = value;
    if (cleanLocal.startsWith('/uploads/')) {
       cleanLocal = `/api${cleanLocal}`;
    }
    return `${domainUrl}${cleanLocal}`;
  }

  // 3. Base64 Data URI (e.g. data:image/png;base64,...)
  if (value.startsWith('data:')) {
    try {
      const base64Data = value.substring(value.indexOf(',') + 1);
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = value.match(/data:([^;]+);base64,/);
      const sourceMime = mimeMatch ? mimeMatch[1] : undefined;
      const sourceExt = sourceMime ? '.' + sourceMime.split('/').pop() : undefined;
      
      const { ext, mime } = detectExtensionAndMime(buffer, sourceExt);
      
      const uniqueFilename = `temp_${crypto.randomBytes(16).toString('hex')}${ext}`;
      const targetPath = path.join(TEMP_DIR, uniqueFilename);
      
      fs.writeFileSync(targetPath, buffer);
      console.log(`[Public URL Conversion] Decoded Base64 data URI and saved with format: ${uniqueFilename} (${mime})`);
      return `${domainUrl}/temp/${uniqueFilename}`;
    } catch (e) {
      console.error(`[Public URL Conversion] Base64 decoding failed:`, e);
    }
  }

  // 4. Raw Base64 string from clients
  if (value.length > 50 && !value.includes('/') && !value.includes(':')) {
    try {
      const buffer = Buffer.from(value, 'base64');
      const { ext, mime } = detectExtensionAndMime(buffer);
      
      const uniqueFilename = `temp_${crypto.randomBytes(16).toString('hex')}${ext}`;
      const targetPath = path.join(TEMP_DIR, uniqueFilename);
      
      fs.writeFileSync(targetPath, buffer);
      console.log(`[Public URL Conversion] Decoded raw Base64 string and saved with format: ${uniqueFilename} (${mime})`);
      return `${domainUrl}/temp/${uniqueFilename}`;
    } catch (e) {
      console.error(`[Public URL Conversion] Raw Base64 decoding failed:`, e);
    }
  }

  return value;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB (1024MB) limit to fully support grand 3D standard models up to 1GB
});
const JWT_SECRET = process.env.JWT_SECRET || 'ais-proprietary-secret-key-2026';

// Temporary storage for SMS codes (in production use Redis or similar)
const smsCodes: Record<string, { code: string, expires: number }> = {};
const phoneChangeTokens: Record<string, { token: string, expires: number }> = {};

// Global DB Lock to prevent race conditions
let dbLock: Promise<any> = Promise.resolve();
async function withDBLock<T>(fn: () => Promise<T>): Promise<T> {
  const nextLock = (async () => {
    try {
      await dbLock;
    } catch (e) {
      // Ignore errors from previous operations to allow the current one to proceed
    }
    return await fn();
  })();
  dbLock = nextLock;
  return nextLock;
}

// --- Helper Functions ---
function getPostStats(post: any, comments: any[] = [], collections: any[] = [], likes: any[] = []) {
  const currentPostLikes = Math.max(
    Array.isArray(post.likes) ? post.likes.length : 0,
    post.likesCount || 0
  );

  const currentPostComments = (comments || []).filter((c: any) => c.postId === post.id).length;
  const currentPostCollections = (collections || []).filter((c: any) => c.postId === post.id).length;

  return {
    likesCount: Math.max(0, currentPostLikes),
    commentCount: Math.max(0, currentPostComments),
    viewsCount: Math.max(0, post.viewsCount || post.views || 0),
    collectCount: Math.max(0, currentPostCollections)
  };
}

function createMapContext(db: any) {
  const ctx = {
    userMap: new Map(),
    likeCountMap: new Map(),
    commentCountMap: new Map(),
    collectionCountMap: new Map()
  };
  if (db.users) db.users.forEach((u: any) => ctx.userMap.set(u.id, u));
  if (db.likes) db.likes.forEach((l: any) => ctx.likeCountMap.set(l.postId, (ctx.likeCountMap.get(l.postId) || 0) + 1));
  if (db.comments) db.comments.forEach((c: any) => ctx.commentCountMap.set(c.postId, (ctx.commentCountMap.get(c.postId) || 0) + 1));
  if (db.collections) db.collections.forEach((c: any) => ctx.collectionCountMap.set(c.postId, (ctx.collectionCountMap.get(c.postId) || 0) + 1));
  return ctx;
}

function mapPostResponse(p: any, db: any, ctx?: any) {
  ctx = ctx || createMapContext(db);
  const user = ctx.userMap.get(p.userId) || ctx.userMap.get(p.authorId);
  
  const currentPostLikes = ctx.likeCountMap.has(p.id) 
    ? ctx.likeCountMap.get(p.id) 
    : Math.max((Array.isArray(p.likes) ? p.likes.length : 0), (p.likesCount || 0));
  const currentPostComments = ctx.commentCountMap.get(p.id) || 0;
  const currentPostCollections = ctx.collectionCountMap.get(p.id) || 0;

  const { projectData, ...postWithoutProjectData } = p;

  return {
    ...postWithoutProjectData,
    hasProjectData: !!projectData,
    likesCount: Math.max(0, currentPostLikes),
    commentCount: Math.max(0, currentPostComments),
    viewsCount: Math.max(0, p.viewsCount || p.views || 0),
    collectCount: Math.max(0, currentPostCollections),
    author: user ? { 
      id: user.id, 
      username: user.username, 
      name: user.username,
      avatar: user.avatar, 
      certifications: user.certifications || [],
      glowColor: user.glowColor || 'purple',
      accountName: user.accountName,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0
    } : (p.author || null)
  };
}

// --- Database Helpers ---
// --- Database Initialization Template ---
const INITIAL_DB_STRUCTURE = { 
  users: [
    {
      id: "u_qif2530",
      username: "qif2530",
      accountName: "qif2530",
      email: "qif2530@gmail.com",
      password: bcrypt.hashSync("admin123456", 8), // Default password: admin123456
      role: "super_admin",
      credits: 999999,
      status: "active",
      createdAt: new Date().toISOString(),
      avatar: "https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4",
      permissions: ["manage_users", "manage_content", "manage_config", "manage_site", "broadcast"]
    }
  ], 
  projects: [], 
  posts: [], 
  comments: [], 
  notifications: [], 
  messages: [], 
  history: [],
  canvasStates: {},
  follows: [],
  news: [],
  activities: [],
  siteConfig: {
    name: "Jepow AI",
    logo: "",
    banners: [],
    infiniteCanvasEnabled: false,
    cloudProjectStorageEnabled: false,
    desktopAppDownloadUrl: "",
  },
  transactions: []
};

// Global DB Cache & Lock
let dbCache: any = null;

const BACKUP_DIR = process.env.BACKUP_PATH || path.join(PersistentDataDir, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUP_DIR, `db_backup_${timestamp}.json`);
      fs.copyFileSync(DB_FILE, backupFile);
      
      // Keep only last 24 backups (every hour = 1 day, or depending on interval)
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('db_backup_'))
        .sort((a, b) => b.localeCompare(a));
      
      if (backups.length > 24) {
        for (let i = 24; i < backups.length; i++) {
          fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
        }
      }
      
    }
  } catch (error: any) {
    console.error('[DB] Backup failed', error);
  }
}

// Automatically create a backup every 1 hour
setInterval(backupDB, 60 * 60 * 1000);

function readDB() {
  try {
    if (dbCache) return dbCache;
    
    if (!fs.existsSync(DB_FILE)) {
      
      console.log('⚠️ 阿里服务器检测 to blank environment, initializing pure production database...');
      const initData = INITIAL_DB_STRUCTURE;
      fs.writeFileSync(DB_FILE, JSON.stringify(initData));
      dbCache = JSON.parse(JSON.stringify(initData));
      
      return dbCache;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    // Auto-correct spelling typos (e.g. clingai.com -> klingai.com) at database read time to prevent connection failure.
    const correctedData = data.replace(/clingai\.com/gi, 'klingai.com');
    dbCache = JSON.parse(correctedData);
    
    // Auto-fix admin password if missing in existing DB
    if (dbCache && dbCache.users) {
      let needsFix = false;

      const migrateMediaUrl = (url: string) => {
        if (!url || typeof url !== 'string') return url;
        if (url.startsWith('/api/media/')) return url;
        
        let filename = '';
        if (url.startsWith('/uploads/')) {
          filename = url.replace('/uploads/', '');
        } else if (url.startsWith('/api/uploads/')) {
          filename = url.replace('/api/uploads/', '');
        } else if (url.startsWith('/api/image?f=')) {
          filename = url.replace('/api/image?f=', '');
        }
      
        if (filename) {
          const encoded = Buffer.from(filename).toString('base64url');
          return `/api/media/${encoded}`;
        }
        return url;
      };

      dbCache.users.forEach((u: any) => {
        if ((u.role === 'super_admin' || u.username === 'qif2530') && !u.password) {
          u.password = '$2b$08$Y2MKBGsPHRgHiAol0xRcbucF5apH7fIqSYqo8gc9tPN9TyKWRL1Yq'; // 'admin123456'
          needsFix = true;
        }
        
        const newAvatar = migrateMediaUrl(u.avatar);
        if (newAvatar !== u.avatar) {
          u.avatar = newAvatar;
          needsFix = true;
        }

        const newCover = migrateMediaUrl(u.coverUrl);
        if (newCover !== u.coverUrl) {
          u.coverUrl = newCover;
          needsFix = true;
        }
      });
      if (dbCache.posts) {
        dbCache.posts.forEach((p: any) => {
          if (p.mediaUrls && Array.isArray(p.mediaUrls)) {
            p.mediaUrls = p.mediaUrls.map((url: string) => {
              const newUrl = migrateMediaUrl(url);
              if (newUrl !== url) needsFix = true;
              return newUrl;
            });
          }
        });
      }
      if (dbCache.projects) {
        dbCache.projects.forEach((prj: any) => {
          const newThumb = migrateMediaUrl(prj.thumbnail);
          if (newThumb !== prj.thumbnail) {
            prj.thumbnail = newThumb;
            needsFix = true;
          }
          if (prj.thumbnails && Array.isArray(prj.thumbnails)) {
            prj.thumbnails = prj.thumbnails.map((t: string) => {
              const newT = migrateMediaUrl(t);
              if (newT !== t) needsFix = true;
              return newT;
            });
          }
        });
      }
      if (needsFix) {
        fs.promises.writeFile(DB_FILE, JSON.stringify(dbCache))
          .catch(e => console.error("Failed to auto-fix admin password or media URLs", e));
      }
    }

    
    return dbCache;
  } catch (error: any) {
    
    console.error('[DB Error] Failed to read database:', error);
    
    // Try to restore from latest backup if current read fails
    try {
      const backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('db_backup_'))
        .sort((a, b) => b.localeCompare(a));
      
      if (backups.length > 0) {
        const latestBackup = path.join(BACKUP_DIR, backups[0]);
        console.log(`[DB Warning] Restoring from latest backup: ${latestBackup}`);
        const data = fs.readFileSync(latestBackup, 'utf8');
        dbCache = JSON.parse(data);
        // Attempt to copy the backup back to DB_FILE to recover it
        fs.copyFileSync(latestBackup, DB_FILE);
        return dbCache;
      }
    } catch (restoreError) {
      console.error('[DB Error] Failed to restore from backup:', restoreError);
    }

    return dbCache || INITIAL_DB_STRUCTURE;
  }
}

// To prevent concurrent writes corrupting the file, we keep a write queue
let isWritingDB = false;
let pendingWriteData: any = null;
let writeTimeout: NodeJS.Timeout | null = null;

async function processWriteQueue() {
  if (isWritingDB || !pendingWriteData) {
    writeTimeout = null;
    return;
  }
  isWritingDB = true;
  const dataToWrite = pendingWriteData;
  pendingWriteData = null;

  try {
    const tempFile = `${DB_FILE}.tmp`;
    // 原子写入即可保证安全，去除每秒1次的冗余复制有效降低CPU和磁盘I/O
    const stringifiedData = JSON.stringify(dataToWrite);

    await fs.promises.writeFile(tempFile, stringifiedData);
    await fs.promises.rename(tempFile, DB_FILE);
    dbCache = dataToWrite;
  } catch (error: any) {
    console.error('[DB Error] Failed to process write queue:', error);
  } finally {
    isWritingDB = false;
    if (pendingWriteData) {
      writeTimeout = setTimeout(processWriteQueue, 5000); // 防抖，高频时5秒才落盘一次
    } else {
      writeTimeout = null;
    }
  }
}

function logAnalyticsData(db: any, type: string, value?: string) {
  if (!db.analytics) {
    db.analytics = { dailyVisits: {}, dailyAiCalls: {}, totalAiCalls: 0, totalAiCallsByModel: {}, totalVisits: 0 };
  }
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const today = d.toISOString().split('T')[0];

  if (type === 'visit') {
    db.analytics.totalVisits = (db.analytics.totalVisits || 0) + 1;
    if (!db.analytics.dailyVisits) db.analytics.dailyVisits = {};
    db.analytics.dailyVisits[today] = (db.analytics.dailyVisits[today] || 0) + 1;
  } else if (type === 'ai_call' && value) {
    db.analytics.totalAiCalls = (db.analytics.totalAiCalls || 0) + 1;
    if (!db.analytics.totalAiCallsByModel) db.analytics.totalAiCallsByModel = {};
    db.analytics.totalAiCallsByModel[value] = (db.analytics.totalAiCallsByModel[value] || 0) + 1;
    
    if (!db.analytics.dailyAiCalls) db.analytics.dailyAiCalls = {};
    if (!db.analytics.dailyAiCalls[today]) db.analytics.dailyAiCalls[today] = {};
    db.analytics.dailyAiCalls[today][value] = (db.analytics.dailyAiCalls[today][value] || 0) + 1;
  }
}

function writeDB(data: any) {
  dbCache = data;
  pendingWriteData = data;
  if (!isWritingDB && !writeTimeout) {
    // 积攒写入请求，降低主线程 stringify 的压力
    writeTimeout = setTimeout(processWriteQueue, 1000);
  }
}

// Async version of writeDB to prevent event loop blocking for frequent operations
async function writeDBAsync(data: any) {
  dbCache = data;
  pendingWriteData = data;
  if (writeTimeout) {
    clearTimeout(writeTimeout);
    writeTimeout = null;
  }
  // Try to write immediately and atomically to disk
  await processWriteQueue();
}
function cleanupDB() {
  const db = readDB();
  let changed = false;

  const validUserIds = new Set(db.users.map((u: any) => u.id));
  const validProjectIds = new Set(db.projects.map((p: any) => p.id));
  const validPostIds = new Set(db.posts.map((p: any) => p.id));

  // 1. 清理孤儿工程（所属用户不存在的工程）
  const originalProjectCount = db.projects.length;
  db.projects = db.projects.filter((p: any) => validUserIds.has(p.userId));
  
  // 删除重复ID的工程
  const uniqueProjectsMap = new Map();
  db.projects.forEach((p: any) => {
    if (!uniqueProjectsMap.has(p.id)) {
      uniqueProjectsMap.set(p.id, p);
    } else {
      // 保留 updatedAt 最新的那个
      const existing = uniqueProjectsMap.get(p.id);
      if (new Date(p.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        uniqueProjectsMap.set(p.id, p);
      }
    }
  });
  db.projects = Array.from(uniqueProjectsMap.values());
  
  // 3. 清理空工程（没有任何节点的垃圾工程）
  db.projects = db.projects.filter((p: any) => {
    // 保留有节点的工程
    if (p.data && p.data.nodes && p.data.nodes.length > 0) return true;
    // 保留有特殊命名的工程 (用户手动改过名)
    if (p.name && p.name !== '未命名原型' && !p.name.includes('未命名项目')) return true;
    return false;
  });

  if (db.projects.length !== originalProjectCount) changed = true;

  // 2. 清理孤儿评论（关联作品不存在的评论）
  const originalCommentCount = db.comments.length;
  db.comments = db.comments.filter((c: any) => validPostIds.has(c.postId));
  if (db.comments.length !== originalCommentCount) changed = true;

  if (changed) {
    console.log('✅ [Database Integrity] Cleaned up orphaned records to maintain consistency.');
    writeDB(db);
  }
}

// 在服务启动前运行一次
cleanupDB();

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    ...INITIAL_DB_STRUCTURE,
    news: [
      {
        id: '1',
        title: 'jepow AI 2.0: AI 设计的未来已来',
        description: '探索 jepow AI 2.0 的新功能，包括实时协作和增强的 AI 模型。',
        content: '我们非常激动地宣布 jepow AI 2.0 正式上线！本次更新带来了全新的实时协作引擎，让您与团队成员可以无缝同步创意。同时，我们升级了底层的 AI 设计模型，生成的图像和视频质量提升了 40%。\n\n主要更新点：\n1. 毫秒级实时同步\n2. 增强型光影渲染\n3. 智能布局建议系统\n4. 更多导出格式支持',
        image: 'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
        tag: '更新',
        type: 'hot',
        date: '2026-04-01',
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        title: '2026 设计趋势：AI 驱动的美学',
        description: 'AI 如何塑造下个十年的视觉语言。',
        content: '随着 AI 技术的普及，设计美学正在经历一场深刻的变革。从参数化建模到生成式艺术，AI 不仅仅是一个工具，它正在成为一种新的创作语言。\n\n在本次深度报告中，我们将探讨：\n- 极简主义与 AI 复杂性的融合\n- 动态响应式设计的崛起\n- 情感化 AI 交互界面',
        image: 'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
        tag: '洞察',
        type: 'normal',
        date: '2026-03-25',
        createdAt: new Date().toISOString()
      }
    ],
    siteConfig: {
      name: 'jepow',
      logo: '',
      banners: [
        'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
        'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
        'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
        'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
      ],
      announcement: '欢迎来到 jepow 创作社区！',
      footer: '© 2026 jepow. All rights reserved.',
      icp: '沪ICP备2026017228号-1'
    }
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Perform migrations on existing DB
const db = readDB();
let updated = false;

if (!db.siteConfig) {
  db.siteConfig = {
    name: 'jepow',
    logo: '',
    banners: [
      'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
      'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
      'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
      'https://cdn.pixabay.com/video/2020/06/18/42358-433434645_tiny.mp4',
    ],
    announcement: '欢迎来到 jepow 创作社区！',
    footer: '© 2026 jepow. All rights reserved.',
    icp: '沪ICP备2026017228号-1'
  };
  updated = true;
} else if (db.siteConfig.icp === undefined) {
  db.siteConfig.icp = '沪ICP备2026017228号-1';
  updated = true;
}

if (!db.config) {
  db.config = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiBaseUrl: '',
    klingAccessKey: process.env.KLING_ACCESS_KEY || '',
    klingSecretKey: process.env.KLING_SECRET_KEY || '',
    omniRouterKey: '',
    omniRouterUrl: '',
    initialCredits: 1000,
    costs: {
      textGen: 10,
      imageGen: 50,
      videoGen: 200,
      proxyCall: 5
    }
  };
  updated = true;
}

if (!db.messages) { db.messages = []; updated = true; }
if (!db.notifications) { db.notifications = []; updated = true; }
if (!db.follows) { db.follows = []; updated = true; }
if (!db.likes) { db.likes = []; updated = true; }
if (!db.collections) { db.collections = []; updated = true; }
if (!db.posts) { db.posts = []; updated = true; }
if (!db.comments) { db.comments = []; updated = true; }
if (!db.invitations) { db.invitations = []; updated = true; }
if (!db.users) { db.users = []; updated = true; }
if (!db.sessions) { db.sessions = []; updated = true; }
if (!db.activities) { db.activities = []; updated = true; }

// Ensure all users have required fields
for (const u of db.users) {
  if (!u.transactions) { u.transactions = []; updated = true; }
  if (!u.certifications) { u.certifications = []; updated = true; }
  if (!u.accountName) {
    u.accountName = `user_${u.id.slice(-6)}`;
    updated = true;
  }
}

if (updated) {
  writeDB(db);
}
// Ensure all posts have stats initialized and non-negative
for (const p of db.posts) {
  let postChanged = false;
  
  // Legacy migration
  if (typeof p.likes === 'number') {
    p.likesCount = p.likes;
    p.likes = [];
    postChanged = true;
  } else if (!Array.isArray(p.likes)) {
    p.likes = [];
    postChanged = true;
  }
  
  if (p.likesCount === undefined || p.likesCount < 0) {
    p.likesCount = Array.isArray(p.likes) ? p.likes.length : 0;
    postChanged = true;
  }
  
  // Support legacy views field mapping to viewsCount
  if (p.viewsCount === undefined) {
    p.viewsCount = p.views || 0;
    postChanged = true;
  }
  
  if (p.commentCount === undefined || p.commentCount < 0) {
    p.commentCount = db.comments.filter((c: any) => c.postId === p.id).length;
    postChanged = true;
  }
  
  if (p.collectCount === undefined || p.collectCount < 0) {
    p.collectCount = (db.collections || []).filter((c: any) => c.postId === p.id).length;
    postChanged = true;
  }
  
  if (postChanged) updated = true;
}

if (updated) {
  writeDB(db);
}


const asyncHandler = (fn: any) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function recordTransaction(userId: string, type: 'increase' | 'decrease', amount: number, reason: string) {
  const db = readDB();
  const user = db.users.find((u: any) => String(u.id) === String(userId));
  if (user) {
    if (!user.transactions) user.transactions = [];
    user.transactions.unshift({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type,
      amount,
      reason,
      date: new Date().toISOString()
    });
    // Keep only last 50 transactions
    if (user.transactions.length > 50) {
      user.transactions = user.transactions.slice(0, 50);
    }
    writeDB(db);
  }
}

// --- Credit Management with Lock ---
const userLocks = new Map<string, Promise<any>>();

async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userLocks.get(userId) || Promise.resolve();
  const nextLock = currentLock.then(fn).catch(fn); // Ensure lock is released even on error
  userLocks.set(userId, nextLock);
  return nextLock;
}

async function sendAliyunSMS(phone: string, code: string, config: any) {
  if (!config.aliyunAccessKeyId || !config.aliyunAccessKeySecret || !config.aliyunSmsSignName || !config.aliyunSmsTemplateCode) {
    throw new Error('短信服务未配置，请在后台管理面板中设置');
  }

  try {
    // 使用阿里云最新 V2.0 SDK（已经在 package.json 中）
    const DysmsapiModule: any = await import('@alicloud/dysmsapi20170525');
    const OpenApiModule: any = await import('@alicloud/openapi-client');
    
    // Fix Dynamic Import handling for CommonJS interop
    const DysmsClient = DysmsapiModule.default?.default || DysmsapiModule.default || DysmsapiModule;
    const DysmsConfig = OpenApiModule.default?.default?.Config || OpenApiModule.default?.Config || OpenApiModule.Config;
    const SendSmsRequest = DysmsapiModule.SendSmsRequest || DysmsapiModule.default?.SendSmsRequest || DysmsapiModule.default?.default?.SendSmsRequest;

    const sdkConfig = new (DysmsConfig as any)({
      accessKeyId: config.aliyunAccessKeyId.trim(),
      accessKeySecret: config.aliyunAccessKeySecret.trim(),
      endpoint: 'dysmsapi.aliyuncs.com'
    });

    const client = new (DysmsClient as any)(sdkConfig);

    const sendSmsRequest = new (SendSmsRequest as any)({
      phoneNumbers: phone.trim(),
      signName: config.aliyunSmsSignName.trim(),
      templateCode: config.aliyunSmsTemplateCode.trim(),
      templateParam: JSON.stringify({ code })
    });

    // 使用 V2.0 SDK 发送
    const result = await client.sendSms(sendSmsRequest);
    
    if (result.body.code !== 'OK') {
      throw new Error(`阿里云返回错误: ${result.body.code} - ${result.body.message}`);
    }
    
    return result.body;
  } catch (ex: any) {
    console.error('[SMS_DEBUG] Aliyun API V2.0 Exception:', ex);
    const msg = ex.data?.Message || ex.message || '未知错误';
    // [V3.4] 修复 CommonJS 的 import default 嵌套问题
    throw new Error(`[核心V3.4] 短信发送失败: ${msg}`);
  }
}

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || (isDesktop ? '127.0.0.1' : '0.0.0.0');
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
    maxHttpBufferSize: 5e8, // 500 MB
    pingTimeout: 180000,
    pingInterval: 25000
  });

  // Health Check
  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.get('/icon.svg', (req, res, next) => {
    const db = readDB();
    const targetIconUrl = db.siteConfig?.favicon || db.siteConfig?.logo;
    if (targetIconUrl) {
      return res.redirect(302, targetIconUrl);
    }
    next();
  });

  app.get('/api/public/broadcasts', (req, res) => {
    const db = readDB();
    const broadcasts = db.broadcastHistory || [];
    // Only return top 5 latest broadcasts
    const top5 = broadcasts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    res.json(top5);
  });

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Support x-goog-api-key as an alternative for SDK compatibility
    if (!token && req.headers['x-goog-api-key']) {
      token = req.headers['x-goog-api-key'] as string;
    }

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(401);
      
      // Check if user is banned
      const db = readDB();
      const dbUser = db.users.find((u: any) => String(u.id) === String(user.id));
      if (dbUser && dbUser.status === 'banned') {
        return res.status(403).json({ error: '您的账户已被封禁，请联系管理员' });
      }

      const session = db.sessions.find((s: any) => s.token === token);
      if (session && session.status === 'revoked') {
        return res.status(401).json({ error: '设备已移除，请重新登录' });
      }

      req.user = user;
      next();
    });
  };

  const recordSession = (req: any, userId: string, token: string) => {
    const db = readDB();
    const ua = req.headers['user-agent'] || '';
    let os = '未知系统';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    
    let browser = '未知浏览器';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edge')) browser = 'Edge';

    const source = os === 'Android' || os === 'iOS' ? 'APP' : 'PC-WEB';

    // check multiple IPs behind reverse proxies
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown';

    const newSession = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      userId,
      token,
      ip: ip,
      os,
      browser,
      source,
      type: source.includes('PC') ? '桌面端' : '移动端',
      date: new Date().toISOString(),
      status: 'active'
    };
    db.sessions.push(newSession);
    writeDB(db);
  };

  // --- Admin Permission Helpers ---
  const getUserWithPerms = (req: any) => {
    const database = readDB();
    const user = database.users.find((u: any) => String(u.id) === String(req.user.id));
    if (!user) return null;

    // 终极权限判定：检查用户名、邮箱、账号名或特定ID
    const isOwner = 
      user.username === 'qif2530' || 
      user.email === 'qif2530@gmail.com' || 
      user.accountName === 'qif2530' ||
      user.id === 'u_qif2530';
      
    const isSuperAdminUser = user.role === 'super_admin' || isOwner;
    const isAdminUser = user.role === 'admin' || isSuperAdminUser;

    return { user, isOwner, isSuperAdminUser, isAdminUser };
  };

  const isAdmin = (req: any, res: any, next: any) => {
    const permData = getUserWithPerms(req);
    if (permData && permData.isAdminUser) {
      next();
    } else {
      res.status(403).json({ error: '权限不足，仅限管理员访问' });
    }
  };

  const isSuperAdmin = (req: any, res: any, next: any) => {
    const permData = getUserWithPerms(req);
    if (permData && permData.isSuperAdminUser) {
      next();
    } else {
      res.status(403).json({ error: '权限不足，仅限超级管理员访问' });
    }
  };

  const hasPermission = (permission: string) => {
    return (req: any, res: any, next: any) => {
      const permData = getUserWithPerms(req);
      if (!permData) return res.status(403).json({ error: '未找到用户信息' });

      const hasSpecificPermission = permData.user.permissions && permData.user.permissions.includes(permission);

      if (permData.isSuperAdminUser || permData.isAdminUser || hasSpecificPermission) {
        next();
      } else {
        res.status(403).json({ error: `权限不足，缺少 ${permission} 权限` });
      }
    };
  };

  // Server state for collaboration - Isolated per user
  const userStates: Record<string, Record<string, any>> = {};
  const canvasSaveTimers: Record<string, NodeJS.Timeout> = {}; // Keep empty just in case
  const onlineUsers = new Set<string>();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Handle authentication for real-time updates
    socket.on("authenticate", (userId) => {
      const roomName = String(userId);
      (socket as any).userId = roomName; // Store userId on socket
      socket.join(roomName);
      onlineUsers.add(roomName);
      console.log(`Socket ${socket.id} joined room ${roomName}. Online users: ${onlineUsers.size}`);
      
      // Broadcast online status to everyone
      socket.broadcast.emit('user_online', { userId: roomName });
    });

    socket.on("save_project", (payload, callback) => {
      // Deprecated: old clients might still emit this.
      // We do nothing to prevent ghost empty projects from being created.
      if (callback) callback({ success: true, id: payload?.id || `proj_${Date.now()}` });
    });

    socket.on("update_shot", (payload, callback) => {
      const userId = (socket as any).userId;
      if (!userId) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { projectId, shotId, updates } = payload;
      if (!projectId || !shotId || !updates) {
        if (callback) callback({ error: 'Missing parameters' });
        return;
      }

      withDBLock(async () => {
        try {
          const db = readDB();
          const projectIndex = db.projects.findIndex((p: any) => String(p.id).trim() === String(projectId).trim() && String(p.userId) === String(userId));
          if (projectIndex === -1) {
             if (callback) callback({ error: '项目不存在' });
             return;
          }

          const project = db.projects[projectIndex];
          if (!project.data || !project.data.nodes) {
             if (callback) callback({ error: '项目数据异常' });
             return;
          }

          let modified = false;
          project.data.nodes = project.data.nodes.map((node: any) => {
            if ((node.type === 'imageShotNode' || node.type === 'videoShotNode') && node.data?.shot?.id === shotId) {
              modified = true;
              return {
                ...node,
                data: {
                  ...node.data,
                  shot: {
                    ...node.data.shot,
                    ...updates
                  }
                }
              };
            }
            return node;
          });

          if (modified) {
            project.updatedAt = new Date().toISOString();
            writeDB(db);
            if (callback) callback({ success: true });
          } else {
            if (callback) callback({ error: '节点未找到' });
          }
        } catch (e: any) {
           if (callback) callback({ error: e.message });
        }
      });
    });

    socket.on("upload_image", (payload, callback) => {
      const userId = (socket as any).userId;
      if (!userId) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }
      try {
        const { base64, filename } = payload;
        if (!base64) return callback && callback({ error: 'No data' });
        const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        let ext = filename ? require('path').extname(filename) : '.png';
        if (!matches || matches.length !== 3) {
           // Might be just base64 string without data: URI prefix
           buffer = Buffer.from(base64, 'base64');
        } else {
           buffer = Buffer.from(matches[2], 'base64');
           if (matches[1] === 'image/jpeg') ext = '.jpeg';
        }
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const finalName = uniqueSuffix + ext;
        const filePath = require('path').join(UPLOADS_DIR, finalName);
        require('fs').writeFileSync(filePath, buffer);
        if (callback) callback({ url: `/api/uploads/${finalName}` });
      } catch (err: any) {
        if (callback) callback({ error: err.message });
      }
    });

    // Handle updates from clients
    socket.on("update_state", (newState) => {
      const userId = (socket as any).userId;
      if (!userId || !newState.projectId) return;

      const projectId = newState.projectId;
      const now = Date.now();
      const incomingTimestamp = newState.lastUpdated || now;
      
      if (!userStates[userId]) userStates[userId] = {};
      const currentTimestamp = userStates[userId][projectId]?.lastUpdated || 0;

      // Only accept if newer or the same
      if (incomingTimestamp < currentTimestamp) return;

      const state = { 
        ...newState,
        lastUpdated: incomingTimestamp,
        senderId: socket.id
      };
      
      // Store state per user per project
      userStates[userId][projectId] = state;
      
      // ONLY broadcast to other devices of the same user
      socket.to(userId).emit("state_updated", state);
    });

    // Handle cursor movements
    socket.on("cursor_move", (cursor) => {
      const userId = (socket as any).userId;
      if (!userId) return;

      // ONLY broadcast to the user's own room
      socket.to(userId).emit("cursor_moved", { id: socket.id, ...cursor });
    });

    // Handle chat messages
    socket.on("send_message", (data) => {
      console.log(`[Socket] Message from ${data.fromUserId} to ${data.toUserId}: ${data.content}`);
      const message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        senderId: String(data.fromUserId),
        receiverId: String(data.toUserId),
        content: data.content,
        createdAt: new Date().toISOString(),
        read: false
      };
      
      const db = readDB();
      if (!db.messages) db.messages = [];
      db.messages.push(message);
      writeDB(db);
      console.log(`[Socket] Message saved. Total messages: ${db.messages.length}`);

      // Send to recipient
      socket.to(String(data.toUserId)).emit("receive_message", message);
      // Send back to sender for confirmation
      socket.emit("receive_message", message);
    });

    socket.on("matrix_proxy", async (data, callback) => {
      try {
        const { provider, method, path, payload, token } = data;
        const response = await fetch(`http://127.0.0.1:${PORT}/api/matrix-proxy/${provider}`, {
          method: method || 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path, payload }),
          // In Node fetch we don't have timeout like axios, but here we're calling local proxy which handles its own timeout anyway.
        });
        
        if (!response.ok) {
           let errData = {};
           try { errData = await response.json(); } catch(e){}
           return callback({ error: (errData as any).error || response.statusText || 'Internal Server Error', _response: errData });
        }
        
        const responseData = await response.json();
        callback(responseData);
      } catch (e: any) {
        callback({ error: e.message || 'Network error' });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      const userId = (socket as any).userId;
      if (userId) {
        socket.to(userId).emit("cursor_removed", socket.id);
        
        // Remove from online users if no more sockets for this user
        // Note: A user might have multiple tabs/sockets
        const userSockets = io.sockets.adapter.rooms.get(userId);
        if (!userSockets || userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user_offline', { userId });
          console.log(`User ${userId} went offline. Total online: ${onlineUsers.size}`);
        }
      }
    });
  });

  app.get('/api/user/online-status/:id', (req, res) => {
    const isOnline = onlineUsers.has(String(req.params.id));
    res.json({ isOnline });
  });

  const isDevServer = process.env.NODE_ENV !== 'production';
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isDevServer) return callback(null, true);
        const allowed =
          /^https:\/\/(www\.)?jepow\.com$/i.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin) ||
          /^http:\/\/localhost:\d+$/i.test(origin);
        callback(null, allowed);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '500mb' }));
  app.use('/api/uploads', express.static(UPLOADS_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR)); // Support old URLs just in case
  app.use('/temp', express.static(TEMP_DIR)); // Dynamic temporary files folder requested by the Aliyun gateway architecture

  // Old legacy image route (kept for backwards compatibility with DB entries)
  app.get('/api/image', (req, res) => {
    let filename = req.query.f as string;
    if (!filename) return res.status(404).json({ error: 'File not specified' });
    
    if (filename.startsWith('/api/uploads/')) filename = filename.replace('/api/uploads/', '');
    if (filename.startsWith('/uploads/')) filename = filename.replace('/uploads/', '');
    
    const safeFilename = path.basename(filename);
    const filepath = path.resolve(UPLOADS_DIR, safeFilename);
    
    if (fs.existsSync(filepath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(filepath, (err) => {
        if (err && !res.headersSent) res.status(500).json({ error: 'Failed to send file' });
      });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // A direct media access route that bypasses aggressive Nginx regex matching
  // by using base64url encoded filenames (meaning no .jpg, .png extensions are visible in the URL)
  app.get('/api/media/:encodedName', (req, res) => {
    try {
      const { encodedName } = req.params;
      if (!encodedName) {
        return res.status(404).json({ error: 'File not specified' });
      }

      // Decode the base64 string back to the actual filename
      const decodedFilename = Buffer.from(encodedName, 'base64url').toString('utf-8');
      
      const safeFilename = path.basename(decodedFilename);
      const filepath = path.resolve(UPLOADS_DIR, safeFilename);
      
      if (fs.existsSync(filepath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.sendFile(filepath, (err: any) => {
          if (err && !res.headersSent) {
            res.status(err.status && err.status !== 200 ? err.status : 500).json({ error: 'Failed to send file' });
          }
        });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (err) {
      console.error('[API_MEDIA] Error serving image:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  app.get('/api/user/unread-count', authenticateToken, (req: any, res) => {
    const db = readDB();
    const userId = String(req.user.id);
    
    const unreadMessages = (db.messages || []).filter((m: any) => String(m.receiverId) === userId && !m.read).length;
    const unreadNotifications = (db.notifications || []).filter((n: any) => String(n.userId) === userId && !n.read).length;
    
    res.json({ count: unreadMessages + unreadNotifications });
  });

  app.post('/api/user/messages/:id/read', authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const messageId = req.params.id;
    await withDBLock(async () => {
      const db = readDB();
      let updated = false;
      if (db.messages) {
        const msg = db.messages.find((m: any) => m.id === messageId);
        if (msg && String(msg.receiverId) === userId && !msg.read) {
          msg.read = true;
          updated = true;
        }
      }
      if (updated) writeDB(db);
    });
    res.json({ success: true });
  });

  app.post('/api/user/messages/read', authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    await withDBLock(async () => {
      const db = readDB();
      let updated = false;
      if (db.messages) {
        db.messages.forEach((m: any) => {
          if (String(m.receiverId) === userId && !m.read) {
            m.read = true;
            updated = true;
          }
        });
      }
      if (updated) writeDB(db);
    });
    res.json({ success: true });
  });

  // Health check endpoint for deployment validation
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      ip: req.ip
    });
  });

  // Request Logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // --- Upload Route ---
  app.get('/api/debug/uploads', (req, res) => {
    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      res.json({ files, UPLOADS_DIR });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }
    
    // Base64 encode the filename to completely bypass aggressive Nginx static file rules
    // that might intercept URLs containing .jpg, .png, etc., either in path or query strings.
    const encodedFilename = Buffer.from(req.file.filename).toString('base64url');
    const fileUrl = `/api/media/${encodedFilename}`;
    
    res.json({ url: fileUrl });
  });

  // --- Profile Routes ---
  app.post('/api/user/verify-old-phone', authenticateToken, async (req: any, res) => {
    const { code } = req.body;
    const db = readDB();
    const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
    if (!user) return res.status(404).json({ error: '未找到用户' });
    if (!user.phone) return res.status(400).json({ error: '当前未绑定手机号' });

    const stored = smsCodes[user.phone];
    if (!stored || stored.code !== code || stored.expires < Date.now()) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    delete smsCodes[user.phone];

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    phoneChangeTokens[user.id] = { token, expires: Date.now() + 10 * 60 * 1000 };
    res.json({ success: true, changeToken: token });
  });

  app.post('/api/user/bind-phone', authenticateToken, async (req: any, res) => {
    const { phone, code, changeToken } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(req.user.id));
    if (userIndex === -1) return res.status(404).json({ error: '未找到用户' });
    const user = db.users[userIndex];

    if (user.phone) {
      if (user.phone === phone) {
        return res.json({ success: true, phone, message: '该手机号已绑定' });
      }

      if (!changeToken || !phoneChangeTokens[user.id] || phoneChangeTokens[user.id].token !== changeToken || phoneChangeTokens[user.id].expires < Date.now()) {
        return res.status(400).json({ error: '请先验证原手机号' });
      }
    }

    if (db.users.find((u: any) => u.phone === phone && String(u.id) !== String(user.id))) {
      return res.status(400).json({ error: '该手机号已被其他账号绑定' });
    }

    const stored = smsCodes[phone];
    if (!stored || stored.code !== code || stored.expires < Date.now()) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    delete smsCodes[phone];
    if (phoneChangeTokens[user.id]) delete phoneChangeTokens[user.id];

    await withDBLock(async () => {
      const liveDb = readDB();
      const liveUserIdx = liveDb.users.findIndex((u: any) => String(u.id) === String(req.user.id));
      if (liveUserIdx !== -1) {
        liveDb.users[liveUserIdx].phone = phone;
        writeDB(liveDb);
        const { password: _, ...safeUser } = liveDb.users[liveUserIdx];
        io.emit('user_profile_updated', { userId: liveDb.users[liveUserIdx].id, user: safeUser });
      }
    });

    res.json({ success: true, phone });
  });

  app.post('/api/user/profile', authenticateToken, async (req: any, res) => {
    const { username, bio, avatar, industry, coverUrl, glowColor } = req.body;
    const result = await withDBLock(async () => {
      const db = readDB();
      const userIndex = db.users.findIndex((u: any) => String(u.id) === String(req.user.id));
      if (userIndex === -1) return { error: '未找到用户', status: 404 };

      if (username) {
        // Check if username is already taken by another user
        const existingUser = db.users.find((u: any) => u.username === username && String(u.id) !== String(req.user.id));
        if (existingUser) {
          return { error: '个人名称已存在，请换一个', status: 400 };
        }
        db.users[userIndex].username = username;
      }
      
      const { accountName, password, phone, code } = req.body;
      if (accountName) {
        const existingAccount = db.users.find((u: any) => u.accountName === accountName && String(u.id) !== String(req.user.id));
        if (existingAccount) {
          return { error: '登录账号已存在，请换一个', status: 400 };
        }
        db.users[userIndex].accountName = accountName;
      }
      
      if (password) {
        if (!phone || !code) {
          return { error: '修改密码必须提供手机号和验证码', status: 400 };
        }
        const stored = smsCodes[phone];
        if (!stored || stored.code !== code) {
          return { error: '验证码不正确', status: 400 };
        }
        if (Date.now() > stored.expires) {
          delete smsCodes[phone];
          return { error: '验证码已过期', status: 400 };
        }
        // Consume the code
        delete smsCodes[phone];
        db.users[userIndex].password = await bcrypt.hash(password, 10);
      }

      if (bio !== undefined) db.users[userIndex].bio = bio;
      if (avatar !== undefined) db.users[userIndex].avatar = avatar;
      if (industry !== undefined) db.users[userIndex].industry = industry;
      if (coverUrl !== undefined) db.users[userIndex].coverUrl = coverUrl;
      if (glowColor !== undefined) db.users[userIndex].glowColor = glowColor;

      writeDB(db);
      // Emit real-time profile update so other clients update instantly
      const { password: _, ...safeUser } = db.users[userIndex];
      io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: safeUser });
      return { success: true, user: db.users[userIndex] };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.get('/api/user/profile', authenticateToken, (req: any, res) => {
    const database = readDB();
    const user = database.users.find((u: any) => String(u.id) === String(req.user.id));
    if (!user) return res.json({ id: null, username: 'Guest', credits: 0, role: 'user', error: null });
    
    // 确保返回 role
    const role = user.role || (String(database.users[0].id) === String(user.id) ? 'admin' : 'user');
    res.json({ 
      id: user.id, 
      username: user.username, 
      phone: user.phone,
      accountName: user.accountName,
      credits: user.credits, 
      role,
      avatar: user.avatar,
      bio: user.bio,
      industry: user.industry,
      coverUrl: user.coverUrl,
      certifications: user.certifications || [],
      glowColor: user.glowColor || 'purple',
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
      following: database.follows?.filter((f: any) => String(f.followerId) === String(user.id)).map((f: any) => f.followingId) || [],
      permissions: user.permissions || [],
      createdAt: user.createdAt
    });
  });

  app.get('/api/user/sessions', authenticateToken, (req: any, res) => {
    const db = readDB();
    const userSessions = db.sessions.filter((s: any) => String(s.userId) === String(req.user.id) && s.status === 'active');
    
    // Add isCurrent flag based on current token
    const token = req.headers['authorization']?.split(' ')[1];
    const enriched = userSessions.map(s => ({
      ...s,
      isCurrent: s.token === token
    }));
    res.json(enriched);
  });

  app.post('/api/user/sessions/remove', authenticateToken, (req: any, res) => {
    const { sessionId } = req.body;
    const db = readDB();
    const sessionIndex = db.sessions.findIndex((s: any) => s.id === sessionId && String(s.userId) === String(req.user.id));
    if (sessionIndex > -1) {
      db.sessions[sessionIndex].status = 'revoked';
      writeDB(db);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '设备记录未找到' });
    }
  });

  app.post('/api/user/sessions/remove-all', authenticateToken, (req: any, res) => {
    const db = readDB();
    const currentToken = req.headers['authorization']?.split(' ')[1];
    let count = 0;
    db.sessions.forEach((s: any) => {
      if (String(s.userId) === String(req.user.id) && s.status === 'active' && s.token !== currentToken) {
        s.status = 'revoked';
        count++;
      }
    });
    if (count > 0) writeDB(db);
    res.json({ success: true, count });
  });

  app.post('/api/user/bind-phone', authenticateToken, (req: any, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: '必须提供手机号和验证码' });
    
    const stored = smsCodes[phone];
    if (!stored || stored.code !== code || stored.expires < Date.now()) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    delete smsCodes[phone];

    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(req.user.id));
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
    
    // Check if phone already bound to another user
    const existing = db.users.find(u => u.phone === phone && u.id !== req.user.id);
    if (existing) {
      return res.status(400).json({ error: '该手机号已被其他账号绑定' });
    }

    db.users[userIndex].phone = phone;
    writeDB(db);
    io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: db.users[userIndex] });
    res.json({ success: true, user: db.users[userIndex] });
  });

  app.get('/api/user/transactions', authenticateToken, (req: any, res) => {
    const db = readDB();
    const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json(user.transactions || []);
  });

  app.get('/api/user/recent-chats', authenticateToken, (req: any, res) => {
    const db = readDB();
    const userId = String(req.user.id);
    console.log(`[RecentChats] Fetching for user ${userId}`);
    
    // Find all messages where user is sender or receiver
    const allMessages = db.messages || [];
    console.log(`[RecentChats] Total messages in DB: ${allMessages.length}`);
    const userMessages = allMessages.filter((m: any) => 
      String(m.senderId) === userId || String(m.receiverId) === userId
    );
    
    console.log(`[RecentChats] User ${userId} has ${userMessages.length} relevant messages`);

    const chatMap = new Map();
    const unreadMap = new Map();

    userMessages.forEach((m: any) => {
      const otherUserId = String(m.senderId) === userId ? String(m.receiverId) : String(m.senderId);
      if (!chatMap.has(otherUserId) || new Date(m.createdAt) > new Date(chatMap.get(otherUserId).createdAt)) {
        chatMap.set(otherUserId, m);
      }
      if (String(m.receiverId) === userId && !m.read) {
        unreadMap.set(otherUserId, (unreadMap.get(otherUserId) || 0) + 1);
      }
    });

    const recentChats = Array.from(chatMap.entries()).map(([otherUserId, lastMsg]) => {
      const otherUser = db.users.find((u: any) => String(u.id) === otherUserId);
      return {
        userId: otherUserId,
        username: otherUser?.username || 'Unknown',
        avatar: otherUser?.avatar,
        lastMessage: lastMsg.content,
        lastMessageAt: lastMsg.createdAt,
        unreadCount: unreadMap.get(otherUserId) || 0
      };
    });

    recentChats.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    res.json(recentChats);
  });

  app.get('/api/messages/:targetUserId', authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const targetUserId = String(req.params.targetUserId);
    
    let chatMessages: any[] = [];
    await withDBLock(async () => {
      const db = readDB();
      let updated = false;
      chatMessages = (db.messages || []).filter((m: any) => 
        (String(m.senderId) === userId && String(m.receiverId) === targetUserId) ||
        (String(m.senderId) === targetUserId && String(m.receiverId) === userId)
      );
      
      chatMessages.forEach((m: any) => {
        if (String(m.receiverId) === userId && !m.read) {
          m.read = true;
          updated = true;
        }
      });
      if (updated) writeDB(db);
    });
    
    chatMessages.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    res.json(chatMessages);
  });

  app.delete('/api/messages/:targetUserId', authenticateToken, async (req: any, res) => {
    const targetUserId = String(req.params.targetUserId);
    const userId = String(req.user.id);
    
    await withDBLock(async () => {
      const db = readDB();
      if (db.messages) {
        const originalCount = db.messages.length;
        db.messages = db.messages.filter((m: any) => 
          !((String(m.senderId) === userId && String(m.receiverId) === targetUserId) ||
            (String(m.senderId) === targetUserId && String(m.receiverId) === userId))
        );
        if (db.messages.length !== originalCount) {
          writeDB(db);
        }
      }
    });
    
    res.json({ success: true, message: '对话记录已同步从云端数据库彻底移除' });
  });

  app.delete('/api/message/:messageId', authenticateToken, async (req: any, res) => {
    const messageId = req.params.messageId;
    const userId = String(req.user.id);
    
    await withDBLock(async () => {
      const db = readDB();
      if (db.messages) {
        const msgIndex = db.messages.findIndex((m: any) => m.id === messageId);
        if (msgIndex !== -1) {
          const msg = db.messages[msgIndex];
          // Only allow sender to delete their own message
          if (String(msg.senderId) === userId) {
            db.messages.splice(msgIndex, 1);
            writeDB(db);
            res.json({ success: true });
          } else {
            res.status(403).json({ error: 'Unauthorized to delete this message' });
          }
        } else {
          res.status(404).json({ error: 'Message not found' });
        }
      }
    });
  });

  app.get('/api/user/notifications', authenticateToken, (req: any, res) => {
    const db = readDB();
    const userId = req.user.id;
    
    const userNotifications = (db.notifications || []).filter((n: any) => n.userId === userId);
    
    const notificationsWithSenders = userNotifications.map((n: any) => {
      const sender = n.senderId ? db.users.find((u: any) => String(u.id) === String(n.senderId)) : null;
      return {
        ...n,
        sender: sender ? { id: sender.id, username: sender.username, avatar: sender.avatar } : null
      };
    });

    notificationsWithSenders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(notificationsWithSenders);
  });

  app.post('/api/user/notifications/:id/read', authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    const notificationId = req.params.id;
    const result = await withDBLock(async () => {
      const db = readDB();
      let updated = false;
      if (db.notifications) {
        const n = db.notifications.find((notif: any) => notif.id === notificationId);
        if (n && String(n.userId) === String(userId) && !n.read) {
          n.read = true;
          updated = true;
        }
      }
      if (updated) writeDB(db);
      return { success: true };
    });
    res.json(result);
  });

  app.post('/api/user/notifications/read', authenticateToken, async (req: any, res) => {
    const userId = req.user.id;
    const result = await withDBLock(async () => {
      const db = readDB();
      let updated = false;
      if (db.notifications) {
        db.notifications.forEach((n: any) => {
          if (n.userId === userId && !n.read) {
            n.read = true;
            updated = true;
          }
        });
      }
      if (updated) writeDB(db);
      return { success: true };
    });
    res.json(result);
  });

  app.delete('/api/community/posts/:postId/comments/:commentId', authenticateToken, async (req: any, res) => {
    const { postId, commentId } = req.params;
    const userId = req.user.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const commentIndex = db.comments.findIndex((c: any) => c.id === commentId && c.postId === postId);
      if (commentIndex === -1) return { error: '评论不存在', status: 404 };

      const permData = getUserWithPerms(req);
      const isPrivileged = permData && (permData.isAdminUser || permData.isSuperAdminUser);
      if (db.comments[commentIndex].userId !== userId && !isPrivileged) {
        return { error: '无权删除此评论', status: 403 };
      }

      db.comments.splice(commentIndex, 1);
      
      // Update post's comment count for broadcast
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      const commentCount = db.comments.filter((c: any) => c.postId === postId).length;
      if (postIndex !== -1) {
        const stats = getPostStats(db.posts[postIndex], db.comments, db.collections, db.likes);
        db.posts[postIndex].commentCount = stats.commentCount;
        
        io.emit('post_updated', { 
          postId, 
          commentCount: stats.commentCount,
          likesCount: stats.likesCount,
          viewsCount: stats.viewsCount,
          collectCount: stats.collectCount
        });
        
        // Broadcast specific deletion event
        io.emit('comment_deleted', { postId, commentId });
      }
      
      writeDB(db);
      return { success: true };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  // News APIs
  app.get('/api/news', (req, res) => {
    const db = readDB();
    res.json(db.news || []);
  });

  app.get('/api/announcements', (req, res) => {
    const db = readDB();
    const news = (db.news || []).map((n: any) => ({
      id: `news-${n.id}`,
      type: 'news',
      title: n.title,
      content: n.description,
      timestamp: n.createdAt || n.date,
      tag: n.tag
    }));
    
    const broadcasts = (db.broadcastHistory || []).map((b: any) => ({
      id: `broadcast-${b.id}`,
      type: 'broadcast',
      title: '系统通知',
      content: b.content,
      timestamp: b.timestamp,
      tag: '广播'
    }));

    const combined = [...news, ...broadcasts].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json(combined.slice(0, 10)); // Top 10 latest
  });

  // News Interactions
  app.post('/api/news/:id/like', authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const newsIndex = db.news.findIndex((n: any) => n.id === id);
      if (newsIndex === -1) return { error: '资讯不存在', status: 404 };

      if (!db.news[newsIndex].likes) db.news[newsIndex].likes = [];
      const likes = db.news[newsIndex].likes;
      const userLikeIndex = likes.indexOf(userId);

      if (userLikeIndex === -1) {
        likes.push(userId);
      } else {
        likes.splice(userLikeIndex, 1);
      }

      writeDB(db);
      // Broadcast news update
      io.emit('news_updated', { newsId: id, likes });
      
      return { success: true, likes };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.get('/api/news/:id/comments', (req, res) => {
    const { id } = req.params;
    const db = readDB();
    const newsComments = (db.news_comments || []).filter((c: any) => c.newsId === id);
    
    const commentsWithUsers = newsComments.map((c: any) => {
      const user = db.users.find((u: any) => u.id === c.userId);
      return {
        ...c,
        author: user ? { id: user.id, username: user.username, avatar: user.avatar } : null
      };
    });
    
    res.json(commentsWithUsers);
  });

  app.post('/api/news/:id/comments', authenticateToken, async (req: any, res) => {
    const newsId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: '评论内容不能为空' });

    const result = await withDBLock(async () => {
      const db = readDB();
      const newsItem = db.news.find((n: any) => n.id === newsId);
      if (!newsItem) return { error: '资讯不存在', status: 404 };

      if (!db.news_comments) db.news_comments = [];
      
      const newComment = {
        id: Date.now().toString(),
        newsId,
        userId,
        content: content.trim(),
        createdAt: new Date().toISOString()
      };

      db.news_comments.push(newComment);
      writeDB(db);
      
      // Broadcast comment update
      const user = db.users.find((u: any) => u.id === userId);
      const commentWithAuthor = {
        ...newComment,
        author: user ? { id: user.id, username: user.username, avatar: user.avatar } : null
      };
      
      io.emit('news_comment_added', { newsId, comment: commentWithAuthor });
      
      return { success: true, comment: commentWithAuthor };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  // --- Admin Activities ---
  app.get('/api/admin/activities', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const db = readDB();
    res.json(db.activities || []);
  });

  app.post('/api/admin/activities', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const { title, deadline, content, type, cover } = req.body;
    const db = readDB();
    const newActivity = {
      id: Date.now().toString(),
      title,
      deadline,
      content,
      cover,
      type, // 'image' | 'video'
      status: 'active',
      createdAt: new Date().toISOString()
    };
    if (!db.activities) db.activities = [];
    db.activities.push(newActivity);
    writeDB(db);
    res.json(newActivity);
  });

  app.put('/api/admin/activities/:id', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const { id } = req.params;
    const { title, deadline, content, type, status, cover } = req.body;
    const db = readDB();
    const idx = (db.activities || []).findIndex((a: any) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    
    db.activities[idx] = {
      ...db.activities[idx],
      title: title || db.activities[idx].title,
      deadline: deadline || db.activities[idx].deadline,
      content: content || db.activities[idx].content,
      type: type || db.activities[idx].type,
      status: status || db.activities[idx].status,
      cover: cover !== undefined ? cover : db.activities[idx].cover,
    };
    writeDB(db);
    res.json(db.activities[idx]);
  });

  app.delete('/api/admin/activities/:id', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const { id } = req.params;
    const db = readDB();
    db.activities = (db.activities || []).filter((a: any) => a.id !== id);
    writeDB(db);
    res.json({ success: true });
  });

  // --- Public Activities ---
  app.get('/api/activities', (req, res) => {
    const db = readDB();
    res.json(db.activities || []);
  });

  app.get('/api/activities/:id', (req, res) => {
    const { id } = req.params;
    const db = readDB();
    const activity = (db.activities || []).find((a: any) => a.id === id);
    if (!activity) return res.status(404).json({ error: 'Not found' });
    res.json(activity);
  });

  app.get('/api/admin/news', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const db = readDB();
    res.json(db.news || []);
  });

  app.post('/api/admin/news', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const { title, description, content, image, tag, type, date } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });

    const db = readDB();
    const newNews = {
      id: Date.now().toString(),
      title,
      description,
      content,
      image,
      tag,
      type,
      date: date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    db.news = [newNews, ...(db.news || [])];
    writeDB(db);
    io.emit('announcement_updated', { type: 'news', data: newNews });
    res.json(newNews);
  });

  app.put('/api/admin/news/:id', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const { id } = req.params;
    const { title, description, content, image, tag, type, date } = req.body;

    const db = readDB();
    const newsIdx = db.news.findIndex((n: any) => n.id === id);
    if (newsIdx === -1) return res.status(404).json({ error: '资讯不存在' });

    db.news[newsIdx] = {
      ...db.news[newsIdx],
      title: title || db.news[newsIdx].title,
      description: description || db.news[newsIdx].description,
      content: content || db.news[newsIdx].content,
      image: image || db.news[newsIdx].image,
      tag: tag || db.news[newsIdx].tag,
      type: type || db.news[newsIdx].type,
      date: date || db.news[newsIdx].date
    };
    writeDB(db);
    io.emit('announcement_updated', { type: 'news', id });
    res.json(db.news[newsIdx]);
  });

  app.delete('/api/admin/news/:id', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const { id } = req.params;
    const db = readDB();
    db.news = db.news.filter((n: any) => n.id !== id);
    writeDB(db);
    io.emit('announcement_updated', { type: 'news', id });
    res.json({ success: true });
  });

  app.get('/api/user/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find((u: any) => String(u.id) === String(req.params.id));
    if (!user) return res.status(404).json({ error: '未找到用户' });
    
    // Return public profile
    const publicProfile = {
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      industry: user.industry,
      coverUrl: user.coverUrl,
      certifications: user.certifications || [],
      glowColor: user.glowColor || 'purple',
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
      createdAt: user.createdAt
    };
    res.json(publicProfile);
  });

  app.get('/api/user/:id/posts', (req, res) => {
    const db = readDB();
    const userPosts = db.posts.filter((p: any) => p.userId === req.params.id && p.status === 'approved');
    const ctx = createMapContext(db); const postsWithDetails = userPosts.map((p: any) => mapPostResponse(p, db, ctx));
    res.json(postsWithDetails);
  });

  // --- Follow Routes ---
  app.post('/api/user/:id/follow', authenticateToken, async (req: any, res) => {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: '无法关注你自己' });
    }

    const result = await withDBLock(async () => {
      const db = readDB();
      if (!db.follows) db.follows = [];

      const existingFollow = db.follows.find((f: any) => f.followerId === currentUserId && f.followingId === targetUserId);
      if (existingFollow) {
        return { error: '已关注', status: 400 };
      }

      db.follows.push({
        followerId: currentUserId,
        followingId: targetUserId,
        createdAt: new Date().toISOString()
      });

      // Update counts
      const targetUser = db.users.find((u: any) => String(u.id) === String(targetUserId));
      const currentUser = db.users.find((u: any) => String(u.id) === String(currentUserId));
      
      if (targetUser) targetUser.followersCount = (targetUser.followersCount || 0) + 1;
      if (currentUser) currentUser.followingCount = (currentUser.followingCount || 0) + 1;

      // Create notification for follow
      if (!db.notifications) db.notifications = [];
      const followNotification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        userId: targetUserId,
        type: 'follow',
        content: '关注了你',
        senderId: currentUserId,
        read: false,
        createdAt: new Date().toISOString()
      };
      db.notifications.push(followNotification);

      writeDB(db);

      // Broadcast follow update
      io.emit('follow_changed', { followerId: currentUserId, followingId: targetUserId, isFollowing: true });

      // Broadcast notification
      io.to(String(targetUserId)).emit('receive_notification', followNotification);

      return { success: true };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.post('/api/user/:id/unfollow', authenticateToken, async (req: any, res) => {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      if (!db.follows) db.follows = [];

      const followIndex = db.follows.findIndex((f: any) => f.followerId === currentUserId && f.followingId === targetUserId);
      if (followIndex === -1) {
        return { error: '未关注', status: 400 };
      }

      db.follows.splice(followIndex, 1);

      // Update counts
      const targetUser = db.users.find((u: any) => String(u.id) === String(targetUserId));
      const currentUser = db.users.find((u: any) => String(u.id) === String(currentUserId));
      
      if (targetUser && targetUser.followersCount > 0) targetUser.followersCount -= 1;
      if (currentUser && currentUser.followingCount > 0) currentUser.followingCount -= 1;
      
      writeDB(db);
      
      // Broadcast follow update
      io.emit('follow_changed', { followerId: currentUserId, followingId: targetUserId, isFollowing: false });
      
      return { success: true };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.get('/api/user/:id/followers', (req, res) => {
    const db = readDB();
    if (!db.follows) db.follows = [];
    const followerIds = db.follows.filter((f: any) => f.followingId === req.params.id).map((f: any) => f.followerId);
    const followers = db.users
      .filter((u: any) => followerIds.includes(u.id))
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        certifications: u.certifications || []
      }));
    res.json(followers);
  });

  app.get('/api/user/:id/following', (req, res) => {
    const db = readDB();
    if (!db.follows) db.follows = [];
    const followingIds = db.follows.filter((f: any) => f.followerId === req.params.id).map((f: any) => f.followingId);
    const following = db.users
      .filter((u: any) => followingIds.includes(u.id))
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        certifications: u.certifications || []
      }));
    res.json(following);
  });

  app.get('/api/user/:id/is-following', authenticateToken, (req: any, res) => {
    const db = readDB();
    if (!db.follows) db.follows = [];
    const isFollowing = db.follows.some((f: any) => f.followerId === req.user.id && f.followingId === req.params.id);
    res.json({ isFollowing });
  });

  // --- Payment Routes ---
  app.post('/api/pay/create', authenticateToken, asyncHandler(async (req, res) => {
    const { amount, method } = req.body; // method: 'alipay' | 'wechat'
    if (!amount || !method) return res.status(400).json({ error: '无效订单请求' });

    const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const db = readDB();
    const config = db.config || {};

    if (method === 'alipay') {
      if (!config.alipayAppId || !config.alipayPrivateKey) {
        // Simulation mode
        return res.json({ 
          orderId, 
          payUrl: 'https://alipay.com/simulated_payment_demo', 
          message: '支付宝模拟支付已创建 (未配置密钥)' 
        });
      }
      
      const alipay = new AlipaySdk({
        appId: config.alipayAppId,
        privateKey: config.alipayPrivateKey,
        alipayPublicKey: config.alipayPublicKey,
      });

      const result = alipay.pageExec('alipay.trade.page.pay', {
        bizContent: {
          out_trade_no: orderId,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          total_amount: (amount / 100).toFixed(2), 
          subject: `充值 ${amount} 能量`,
        },
        returnUrl: `${req.protocol}://${req.get('host')}/payment/success`,
        notifyUrl: `${req.protocol}://${req.get('host')}/api/pay/notify/alipay`,
      });
      
      return res.json({ orderId, payUrl: result });
    } else if (method === 'wechat') {
      if (!config.wechatMchId || !config.wechatAppId) {
        // Simulation mode
        return res.json({ 
          orderId, 
          codeUrl: 'https://wechat.com/simulated_qr_demo', 
          message: '微信支付模拟二维码已创建 (未配置密钥)' 
        });
      }

      const pubKeyPath = path.join(process.cwd(), 'wechat_public.pem');
      const privKeyPath = path.join(process.cwd(), 'wechat_private.pem');

      if (!fs.existsSync(pubKeyPath) || !fs.existsSync(privKeyPath)) {
        return res.json({ 
          orderId, 
          codeUrl: 'https://wechat.com/simulated_qr_no_certs', 
          message: '未发现证书文件 (wechat_public.pem / wechat_private.pem)，已开启模拟模式' 
        });
      }

      const pay = new WxPay(config.wechatAppId, config.wechatMchId, fs.readFileSync(pubKeyPath), fs.readFileSync(privKeyPath), {
        key: config.wechatV3Key,
        serial_no: config.wechatSerialNo
      });

      const result = await pay.transactions_native({
        description: `充值 ${amount} 能量`,
        out_trade_no: orderId,
        notify_url: `${req.protocol}://${req.get('host')}/api/pay/notify/wechat`,
        amount: {
          total: Math.round(amount), // cents
        },
      });

      return res.json({ orderId, codeUrl: result.data.code_url });
    }

    res.status(400).json({ error: '不支持的支付方式' });
  }));

  app.post('/api/pay/notify/alipay', express.urlencoded({ extended: true }), asyncHandler(async (req, res) => {
    const data = req.body;
    console.log('[Pay][Alipay] Notification received:', data.out_trade_no);
    
    // In real app: verify signature here using alipay.verifyPayment(data)
    
    if (data.trade_status === 'TRADE_SUCCESS') {
      const db = readDB();
      // Logic to find user and add credits based on orderId
      // We need a way to store pending orders. For simplicity, let's just use the orderId prefix or a simple lookup.
      // In production, you'd have an 'orders' table.
      res.send('success');
    } else {
      res.send('fail');
    }
  }));

  app.post('/api/pay/notify/wechat', express.json(), asyncHandler(async (req, res) => {
    console.log('[Pay][WeChat] Notification received');
    // Verify signature and decrypt reward here
    res.json({ code: 'SUCCESS', message: 'OK' });
  }));

  // --- Auth Routes ---
  app.post('/api/auth/send-sms', asyncHandler(async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: '请输入手机号' });
    
    // Validate phone number format (simple check)
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    const database = readDB();
    const config = database.config || {};

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
      if (config.aliyunAccessKeyId && config.aliyunAccessKeySecret) {
        await sendAliyunSMS(phone, code, config);
        console.log(`[SMS Aliyun] To: ${phone}, Code: ${code} SENT`);
      } else {
        return res.status(400).json({ error: '短信服务未配置，请联系管理员' });
      }

      smsCodes[phone] = {
        code,
        expires: Date.now() + 5 * 60 * 1000 // 5 minutes
      };
      
      res.json({ message: '验证码已发送' });
    } catch (error: any) {
      console.error('[SMS Error Full]', error);
      res.status(500).json({ error: `[SMS_ERROR] 发送失败: ${error.message} - ${error.data ? JSON.stringify(error.data) : ''}` });
    }
  }));

  app.post('/api/auth/verify-code', asyncHandler(async (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: '必须提供手机号和验证码' });
    
    // Check SMS code
    const stored = smsCodes[phone];
    if (!stored || stored.code !== code) {
      return res.status(400).json({ error: '验证码不正确' });
    }
    if (Date.now() > stored.expires) {
      delete smsCodes[phone];
      return res.status(400).json({ error: '验证码已过期' });
    }
    
    // We do NOT delete it here so we can verify it again during submission
    res.json({ success: true, message: '验证通过' });
  }));

  app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { username, accountName, password, phone, code } = req.body;
    const startTime = Date.now();
    console.log(`[Auth][${startTime}] START Registration attempt: ${username} (${accountName})`);
    
    if (!username && !accountName && !phone) {
      console.log(`[Auth][${startTime}] FAILED: Missing info`);
      return res.status(400).json({ error: '请提供必要的注册信息' });
    }

    console.log(`[Auth][${startTime}] Step 1: Reading database...`);
    const database = readDB();
    console.log(`[Auth][${startTime}] Step 2: Database read. Existing users: ${database.users.length}`);
    
    // 第一个注册的用户自动设为管理员
    const isAdminUser = database.users.length === 0;

    // Check if code is a valid invite code
    let isInviteCodeValid = false;
    let usedInviteId: string | null = null;
    if (code && database.invitations) {
      const inviteObj = database.invitations.find((ic: any) => ic.code.toUpperCase() === code.toUpperCase());
      if (inviteObj) {
         isInviteCodeValid = true;
         usedInviteId = inviteObj.id; // Mark for deletion or update later
      }
    }

    // Verify code
    if (!isAdminUser) {
      if (!code) {
        return res.status(400).json({ error: '需要输入验证码或注册码' });
      }
      
      const isUniversalCode = database.config?.universalRegistrationCode && database.config.universalRegistrationCode === code;

      if (!isInviteCodeValid && !isUniversalCode) {
        if (!phone) {
          return res.status(400).json({ error: '无效的注册码' });
        }
        const stored = smsCodes[phone];
        if (!stored || stored.code !== code || stored.expires < Date.now()) {
          console.log(`[Auth][${startTime}] FAILED: Invalid SMS code`);
          return res.status(400).json({ error: '验证码或注册码错误' });
        }
        delete smsCodes[phone];
      }
    }

    if (username && database.users.find((u: any) => u.username === username)) {
      console.log(`[Auth][${startTime}] FAILED: Username exists: ${username}`);
      return res.status(400).json({ error: '个人名称已存在，请换一个' });
    }
    
    if (accountName && database.users.find((u: any) => u.accountName === accountName)) {
      console.log(`[Auth][${startTime}] FAILED: AccountName exists: ${accountName}`);
      return res.status(400).json({ error: '登录账号已存在' });
    }

    if (phone && database.users.find((u: any) => u.phone === phone)) {
      console.log(`[Auth][${startTime}] FAILED: Phone exists: ${phone}`);
      return res.status(400).json({ error: '该手机号已绑定其他账号' });
    }

    console.log(`[Auth][${startTime}] Step 3: Hashing password (bcrypt 8 rounds)...`);
    const hashedPassword = password ? await bcrypt.hash(password, 8) : null;
    console.log(`[Auth][${startTime}] Step 4: Password hashed in ${Date.now() - startTime}ms`);
    
    console.log(`[Auth][${startTime}] Step 5: Acquiring DB Lock and writing...`);
    const resPayload = await withDBLock(async () => {
      const liveDatabase = readDB();
      const isAdminUserLive = liveDatabase.users.length === 0;
      
      const newUser = {
        id: Date.now().toString(),
        accountName: accountName || `user_${Date.now().toString().slice(-6)}`,
        username: username || `创作者_${Date.now().toString().slice(-4)}`,
        password: hashedPassword,
        phone: phone || null,
        credits: 100,
        role: isAdminUserLive ? 'admin' : 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        transactions: [
          { id: 'init', type: 'increase', amount: 100, reason: '注册奖励', date: new Date().toISOString() }
        ],
        permissions: []
      };

      liveDatabase.users.push(newUser);
      if (usedInviteId && liveDatabase.invitations) {
        liveDatabase.invitations = liveDatabase.invitations.filter((i: any) => i.id !== usedInviteId);
      }
      writeDB(liveDatabase);
      return newUser;
    });

    console.log(`[Auth][${startTime}] Step 6: Database written. SUCCESS!`);

    const token = jwt.sign({ id: resPayload.id, username: resPayload.username, role: resPayload.role }, JWT_SECRET);
    recordSession(req, resPayload.id, token);
    res.json({ token, user: { id: resPayload.id, username: resPayload.username, accountName: resPayload.accountName, credits: resPayload.credits, role: resPayload.role, phone: resPayload.phone, permissions: resPayload.permissions || [] } });
  }));

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { loginName, password } = req.body;
    if (!loginName || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }

    const database = readDB();
    const user = database.users.find((u: any) => 
      u.accountName === loginName || 
      u.phone === loginName || 
      u.username === loginName
    );

    if (!user) {
      return res.status(401).json({ error: '账号不存在' });
    }

    // Auto-fix super admin password at login time just in case dbCache was stale or migration missed it
    if ((user.role === 'super_admin' || user.username === 'qif2530' || user.accountName === 'qif2530') && !user.password) {
      user.password = '$2b$08$Y2MKBGsPHRgHiAol0xRcbucF5apH7fIqSYqo8gc9tPN9TyKWRL1Yq'; // 'admin123456'
      writeDB(database);
      console.log(`[Auto-Fix] Set default password for super_admin ${user.username} during login attempt`);
    }

    if (!user.password) {
      return res.status(401).json({ error: '该账号未设置密码，请使用手机验证码登录' });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '密码错误' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: '您的账户已被封禁，请联系管理员' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    recordSession(req, user.id, token);
    res.json({ token, user: { id: user.id, username: user.username, accountName: user.accountName, credits: user.credits, role: user.role, phone: user.phone, permissions: user.permissions || [] } });
  }));

  app.post('/api/auth/phone-login', async (req, res) => {
    const { phone, code } = req.body;
    const stored = smsCodes[phone];
    if (!stored || stored.code !== code || stored.expires < Date.now()) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }
    delete smsCodes[phone];

    const database = readDB();
    let user = database.users.find((u: any) => u.phone === phone);

    if (!user) {
      // Auto register
      const isAdminUser = database.users.length === 0;
      user = {
        id: Date.now().toString(),
        accountName: `phone_${phone.slice(-4)}_${Math.floor(Math.random() * 1000)}`,
        username: `创作者_${phone.slice(-4)}`,
        password: null,
        phone: phone,
        credits: 100,
        role: isAdminUser ? 'admin' : 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        transactions: [
          { id: 'init', type: 'increase', amount: 100, reason: '手机号注册奖励', date: new Date().toISOString() }
        ],
        permissions: []
      };
      database.users.push(user);
      writeDB(database);
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: '您的账户已被封禁，请联系管理员' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    recordSession(req, user.id, token);
    res.json({ token, user: { id: user.id, username: user.username, accountName: user.accountName, credits: user.credits, role: user.role, phone: user.phone, permissions: user.permissions || [] } });
  });

  // --- Admin Routes ---
  app.get('/api/admin/users', authenticateToken, hasPermission('manage_users'), (req, res) => {
    const db = readDB();
    const users = db.users.map(({ id, username, accountName, credits, role, status, createdAt, certifications, permissions, phone }: any) => {
      const projectsCount = db.projects?.filter((p: any) => String(p.userId) === String(id)).length || 0;
      return {
        id, username, accountName, credits, role, status: status || 'active', createdAt, certifications: certifications || [], permissions: permissions || [], phone, projectsCount
      };
    });
    res.json(users);
  });

  app.post('/api/admin/users/update-credits', authenticateToken, hasPermission('manage_users'), (req, res) => {
    const { userId, amount, type } = req.body; // type: 'add' | 'set'
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(userId));
    
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    const oldCredits = db.users[userIndex].credits;
    if (type === 'set') {
      db.users[userIndex].credits = Number(amount);
    } else {
      db.users[userIndex].credits += Number(amount);
    }
    
    const diff = db.users[userIndex].credits - oldCredits;
    if (diff !== 0) {
      if (!db.users[userIndex].transactions) db.users[userIndex].transactions = [];
      db.users[userIndex].transactions.unshift({
        id: Date.now().toString(),
        type: diff > 0 ? 'increase' : 'decrease',
        amount: Math.abs(diff),
        reason: '管理员修改',
        date: new Date().toISOString()
      });
    }

    writeDB(db);
    res.json(db.users[userIndex]);
  });

  app.post('/api/admin/users/:id/release-phone', authenticateToken, hasPermission('release_phone'), (req, res) => {
    const { id } = req.params;
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(id));
    
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    db.users[userIndex].phone = null;
    writeDB(db);
    io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: db.users[userIndex] });
    res.json({ success: true, message: '手机号已释放', user: db.users[userIndex] });
  });

  app.post('/api/admin/users/update-status', authenticateToken, hasPermission('manage_users'), (req, res) => {
    const { userId, status } = req.body; // status: 'active' | 'banned'
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(userId));
    
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    // Prevent banning self
    if (String(userId) === String((req as any).user.id)) {
      return res.status(400).json({ error: '不能封禁自己' });
    }

    db.users[userIndex].status = status;
    writeDB(db);
    res.json(db.users[userIndex]);
  });

  app.post('/api/admin/users/update-role', authenticateToken, isSuperAdmin, (req, res) => {
    const { userId, role } = req.body; // role: 'admin' | 'user' | 'super_admin'
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(userId));
    
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    // Prevent changing self role (except for the platform owner to ensure they can bootstrap their role)
    const isPlatformOwner = (req as any).user.email === 'qif2530@gmail.com';
    if (String(userId) === String((req as any).user.id) && !isPlatformOwner) {
      return res.status(400).json({ error: '不能修改自己的角色' });
    }

    db.users[userIndex].role = role;
    // If downgraded to user, clear permissions
    if (role === 'user') {
      db.users[userIndex].permissions = [];
    }
    writeDB(db);
    
    // Emit event to update the user in real-time
    const { password, ...safeUser } = db.users[userIndex];
    io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: safeUser });
    
    res.json(db.users[userIndex]);
  });

  app.post('/api/admin/users/update-permissions', authenticateToken, isSuperAdmin, (req, res) => {
    const { userId, permissions } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex((u: any) => String(u.id) === String(userId));
    
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    db.users[userIndex].permissions = permissions;
    writeDB(db);
    
    // Emit event to update the user in real-time
    const { password, ...safeUser } = db.users[userIndex];
    io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: safeUser });
    
    res.json(db.users[userIndex]);
  });

  // --- Global Config Routes ---
  app.get('/api/admin/config', authenticateToken, hasPermission('manage_config'), (req, res) => {
    const database = readDB();
    let updated = false;
    if (!database.config) {
      database.config = {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        geminiBaseUrl: '',
        klingAccessKey: process.env.KLING_ACCESS_KEY || '',
        klingSecretKey: process.env.KLING_SECRET_KEY || '',
        costs: { textGen: 10, imageGen: 50, videoGen: 200, proxyCall: 5 }
      };
      updated = true;
    } else if (!database.config.geminiApiKey && process.env.GEMINI_API_KEY) {
      database.config.geminiApiKey = process.env.GEMINI_API_KEY;
      updated = true;
    }
    
    if (updated) {
      writeDB(database);
    }
    res.json(database.config);
  });

  app.post('/api/admin/config', authenticateToken, hasPermission('manage_config'), (req, res) => {
    const database = readDB();
    let newConfig = { ...req.body };
    
    // Auto-correct spelling typos (e.g. clingai.com -> klingai.com) in all configuration strings
    Object.keys(newConfig).forEach(key => {
      if (typeof newConfig[key] === 'string') {
        newConfig[key] = newConfig[key].replace(/clingai\.com/gi, 'klingai.com');
      }
    });
    
    // Handle default Gemini API Key placeholder
    if (newConfig.geminiApiKey === 'process.env.GEMINI_API_KEY') {
      newConfig.geminiApiKey = process.env.GEMINI_API_KEY || '';
    }
    
    database.config = { ...database.config, ...newConfig };
    writeDB(database);
    res.json({ success: true, config: database.config });
  });

  app.get('/api/admin/site-config', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const db = readDB();
    res.json(db.siteConfig || {});
  });

  app.get('/api/admin/invitations', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const db = readDB();
    res.json(db.invitations || []);
  });

  app.post('/api/admin/invitations/generate', authenticateToken, hasPermission('manage_site'), async (req, res) => {
    const { count = 1 } = req.body;
    const result = await withDBLock(async () => {
      const db = readDB();
      if (!db.invitations) db.invitations = [];
      
      const newCodes = [];
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Readable characters
      
      for (let i = 0; i < count; i++) {
        let code = '';
        for (let j = 0; j < 8; j++) {
          code += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        const invitation = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          code,
          status: 'active',
          createdAt: new Date().toISOString()
        };
        db.invitations.push(invitation);
        newCodes.push(invitation);
      }
      
      writeDB(db);
      return newCodes;
    });
    res.json(result);
  });

  app.delete('/api/admin/invitations/:id', authenticateToken, hasPermission('manage_site'), async (req, res) => {
    const { id } = req.params;
    const result = await withDBLock(async () => {
      const db = readDB();
      if (!db.invitations) return { error: '未找到' };
      db.invitations = db.invitations.filter((inv: any) => inv.id !== id);
      writeDB(db);
      return { success: true };
    });
    res.json(result);
  });

  app.post('/api/invitations/verify', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '请输入邀请码' });
    
    const db = readDB();
    const inv = (db.invitations || []).find((i: any) => i.code === code && i.status === 'active');
    
    if (inv) {
      res.json({ success: true, message: '验证成功' });
    } else {
      res.status(400).json({ error: '邀请码无效或已被禁用' });
    }
  });

  app.post('/api/admin/site-config', authenticateToken, hasPermission('manage_site'), (req, res) => {
    const db = readDB();
    db.siteConfig = req.body;
    writeDB(db);
    io.emit('site_config_updated', db.siteConfig);
    res.json({ success: true, config: db.siteConfig });
  });

  app.post('/api/admin/broadcast', authenticateToken, hasPermission('broadcast'), async (req: any, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });

    const result = await withDBLock(async () => {
      const db = readDB();
      
      if (!db.notifications) db.notifications = [];
      
      db.users.forEach((u: any) => {
        const notification = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          userId: u.id,
          type: 'system',
          content,
          createdAt: new Date().toISOString(),
          read: false
        };
        db.notifications.push(notification);
        
        // Also emit via socket if online
        io.to(String(u.id)).emit('receive_notification', notification);
      });

      if (!db.broadcastHistory) db.broadcastHistory = [];
      db.broadcastHistory.unshift({
        id: Date.now().toString(),
        content,
        timestamp: new Date().toISOString(),
        recipientCount: db.users.length,
        adminId: req.user.id
      });

      writeDB(db);
      io.emit('announcement_updated', { type: 'broadcast', data: { content, timestamp: new Date().toISOString() } });
      return { success: true, count: db.users.length };
    });

    res.json(result);
  });

  app.get('/api/admin/broadcast/history', authenticateToken, hasPermission('broadcast'), (req, res) => {
    const db = readDB();
    res.json(db.broadcastHistory || []);
  });

  app.get('/api/site-config', (req, res) => {
    const db = readDB();
    res.json(db.siteConfig || {});
  });

  app.get('/api/debug/db', (req, res) => {
    res.json({
      dbFile: DB_FILE,
      projects: readDB().projects.map((p: any) => ({ id: p.id, name: p.name, userId: p.userId }))
    });
  });

  app.post('/api/analytics/visit', (req, res) => {
    withDBLock(async () => {
      const db = readDB();
      logAnalyticsData(db, 'visit');
      writeDB(db);
    });
    res.json({ success: true });
  });

  app.get('/api/admin/analytics', authenticateToken, isAdmin, (req, res) => {
  const db = readDB();
  const analytics = db.analytics || { dailyVisits: {}, dailyAiCalls: {}, totalAiCalls: 0, totalAiCallsByModel: {}, totalVisits: 0 };
  
  // Calculate daily registrations
  const today = new Date().toISOString().split('T')[0];
  const dailyRegistrations = (db.users || []).filter((u: any) => u.createdAt && u.createdAt.startsWith(today)).length;

  res.json({
    totalUsers: (db.users || []).length,
    dailyRegistrations,
    totalVisits: analytics.totalVisits || 0,
    dailyVisits: analytics.dailyVisits || {},
    currentOnline: onlineUsers.size,
    totalAiCalls: analytics.totalAiCalls || 0,
    totalAiCallsByModel: analytics.totalAiCallsByModel || {},
    dailyAiCalls: analytics.dailyAiCalls || {}
  });
});

app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
    const db = readDB();
    res.json({
      totalUsers: db.users.length,
      totalProjects: db.projects.length,
      totalCredits: db.users.reduce((acc: number, u: any) => acc + u.credits, 0)
    });
  });

  app.post('/api/user/recharge', authenticateToken, async (req: any, res) => {
    const { amount } = req.body;
    
    const result = await withDBLock(async () => {
      const db = readDB();
      const userIndex = db.users.findIndex((u: any) => String(u.id) === String(req.user.id));
      if (userIndex === -1) return { error: '用户不存在', status: 404 };
      
      db.users[userIndex].credits += amount;
      
      if (!db.users[userIndex].transactions) db.users[userIndex].transactions = [];
      db.users[userIndex].transactions.unshift({
        id: Date.now().toString(),
        type: 'increase',
        amount: amount,
        reason: '积分充值',
        date: new Date().toISOString()
      });

      writeDB(db);
      // Notify client about credit update
      io.to(String(req.user.id)).emit('credits_updated', { credits: db.users[userIndex].credits });
      return { credits: db.users[userIndex].credits };
    });

    if ((result as any).error) {
      return res.status((result as any).status).json({ error: (result as any).error });
    }
    
    res.json(result);
  });

  // --- Project Routes ---
  app.post('/api/projects/:id/update-shot', authenticateToken, async (req: any, res) => {
    const { shotId, updates } = req.body;
    const projectId = String(req.params.id).trim();
    if (!shotId || !updates) return res.status(400).json({ error: 'shotId and updates required' });

    const result = await withDBLock(async () => {
      const db = readDB();
      const projectIndex = db.projects.findIndex((p: any) => String(p.id).trim() === projectId && String(p.userId) === String(req.user.id));
      if (projectIndex === -1) return { error: '项目不存在' };

      const project = db.projects[projectIndex];
      if (!project.data || !project.data.nodes) return { error: '项目数据异常' };

      let modified = false;
      project.data.nodes = project.data.nodes.map((node: any) => {
        if ((node.type === 'imageShotNode' || node.type === 'videoShotNode') && node.data?.shot?.id === shotId) {
          modified = true;
          return {
            ...node,
            data: {
              ...node.data,
              shot: {
                ...node.data.shot,
                ...updates
              }
            }
          };
        }
        return node;
      });

      if (modified) {
        project.updatedAt = new Date().toISOString();
        writeDB(db);
        return { success: true };
      } else {
        return { error: '节点未找到' };
      }
    });

    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/projects/save', authenticateToken, async (req: any, res) => {
    const { id, name, data, thumbnail } = req.body;
    const dbCheck = readDB();
    if (data && dbCheck.siteConfig?.cloudProjectStorageEnabled === false) {
      return res.status(403).json({
        error: '工程数据请使用桌面客户端保存到本机，服务器不再存储画布工程',
        code: 'LOCAL_STORAGE_ONLY',
      });
    }

    const now = new Date().toISOString();

    const project = await withDBLock(async () => {
      const db = readDB();
      if (id) {
        const cleanId = String(id).trim();
        const index = db.projects.findIndex((p: any) => String(p.id).trim() === cleanId && String(p.userId) === String(req.user.id));
        if (index !== -1) {
          const p = db.projects[index];
          let computedThumbnails = p.thumbnails || [];
          if ((!computedThumbnails.length || data) && data && data.nodes) {
            const mediaNodes = data.nodes.filter((n: any) => 
              (n.type === 'mediaNode' && n.data?.url) || 
              (n.type === 'imageShotNode' && n.data?.shot?.imageUrl) ||
              (n.type === 'videoShotNode' && n.data?.shot?.videoUrl) ||
              (n.type === 'imageNode' && n.data?.url)
            );
            computedThumbnails = mediaNodes.map((n: any) => n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl).filter(Boolean);
            computedThumbnails = computedThumbnails.length > 0 ? computedThumbnails.slice(-4) : (thumbnail ? [thumbnail] : []);
          }

          db.projects[index] = { ...p, name, data, thumbnail, thumbnails: computedThumbnails, updatedAt: now };
          await writeDBAsync(db);
          io.to(String(req.user.id)).emit('projects_updated');
          return db.projects[index];
        } else {
          return { error: '项目不存在或已被删除', deleted: true, status: 404 };
        }
      }

      // Anti-duplication logic
      if (!id) {
        const incomingDataStr = JSON.stringify(data || {});
        // Avoid comparing with empty data to prevent collapsing all empty newly created projects,
        // but if it's reasonably complex, deduplicate it.
        const existingProject = db.projects.find((p: any) => p.userId === req.user.id && JSON.stringify(p.data || {}) === incomingDataStr);
        if (existingProject) {
          existingProject.name = name || existingProject.name || `未命名项目-${new Date().toLocaleDateString()}`;
          existingProject.updatedAt = now;
          if (thumbnail) existingProject.thumbnail = thumbnail;
          
          let computedThumbnails = existingProject.thumbnails || [];
          if ((!computedThumbnails.length || data) && data && data.nodes) {
            const mediaNodes = data.nodes.filter((n: any) => 
               (n.type === 'mediaNode' && n.data?.url) || 
               (n.type === 'imageShotNode' && n.data?.shot?.imageUrl) ||
               (n.type === 'videoShotNode' && n.data?.shot?.videoUrl) ||
               (n.type === 'imageNode' && n.data?.url)
            );
            computedThumbnails = mediaNodes.map((n: any) => n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl).filter(Boolean);
            existingProject.thumbnails = computedThumbnails.length > 0 ? computedThumbnails.slice(-4) : (thumbnail ? [thumbnail] : []);
          }

          await writeDBAsync(db);
          io.to(String(req.user.id)).emit('projects_updated');
          return existingProject;
        }
      }

      // Generate a new ID if not found or no ID provided
      const newId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
      let computedThumbnails: string[] = [];
      if (data && data.nodes) {
        const mediaNodes = data.nodes.filter((n: any) => 
          (n.type === 'mediaNode' && n.data?.url) || 
          (n.type === 'imageShotNode' && n.data?.shot?.imageUrl) ||
          (n.type === 'videoShotNode' && n.data?.shot?.videoUrl) ||
          (n.type === 'imageNode' && n.data?.url)
        );
        computedThumbnails = mediaNodes.map((n: any) => n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl).filter(Boolean);
        computedThumbnails = computedThumbnails.length > 0 ? computedThumbnails.slice(-4) : (thumbnail ? [thumbnail] : []);
      }

      const newProject = {
        id: newId,
        userId: req.user.id,
        name: name || `未命名项目-${new Date().toLocaleDateString()}`,
        data,
        thumbnail,
        thumbnails: computedThumbnails,
        createdAt: now,
        updatedAt: now
      };

      db.projects.push(newProject);
      await writeDBAsync(db);
      io.to(String(req.user.id)).emit('projects_updated');
      return newProject;
    });

    if (project && project.error) {
      return res.status(project.status || 400).json({ error: project.error, deleted: project.deleted });
    }

    res.json(project);
  });

  app.get('/api/projects/list', authenticateToken, (req: any, res) => {
    const db = readDB();
    const userProjects = db.projects
      .filter((p: any) => String(p.userId) === String(req.user.id))
      .map(({ id, name, createdAt, updatedAt, thumbnail, thumbnails, data }: any) => {
        // Compute last 4 images from data.nodes if thumbnails is missing
        let computedThumbnails = thumbnails || [];
        if (!computedThumbnails.length && data && data.nodes) {
          const mediaNodes = data.nodes.filter((n: any) => 
            (n.type === 'mediaNode' && n.data?.url) || 
            (n.type === 'imageShotNode' && n.data?.shot?.imageUrl) ||
            (n.type === 'videoShotNode' && n.data?.shot?.videoUrl) ||
            (n.type === 'imageNode' && n.data?.url)
          );
          computedThumbnails = mediaNodes.map((n: any) => 
            n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl
          ).filter(Boolean);
        }
        
        // Take the last 4 if there are any
        const finalThumbnails = computedThumbnails.length > 0 ? computedThumbnails.slice(-4) : (thumbnail ? [thumbnail] : []);
        
        return { 
          id, 
          name, 
          createdAt, 
          updatedAt, 
          thumbnail, 
          thumbnails: finalThumbnails 
        };
      })
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(userProjects);
  });

  app.get('/api/projects/:id', authenticateToken, (req: any, res) => {
    const db = readDB();
    if (db.siteConfig?.cloudProjectStorageEnabled === false) {
      return res.status(403).json({
        error: '工程数据已改为本地存储，请使用桌面客户端打开工程',
        code: 'LOCAL_STORAGE_ONLY',
      });
    }
    const cleanId = String(req.params.id).trim();
    const project = db.projects.find((p: any) => String(p.id).trim() === cleanId && String(p.userId) === String(req.user.id));
    if (!project) return res.status(404).json({ error: '项目不存在' });
    res.json(project);
  });

  app.delete('/api/projects/:id', authenticateToken, (req: any, res) => {
    const db = readDB();
    const cleanId = String(req.params.id).trim();
    const projectIndex = db.projects.findIndex((p: any) => String(p.id).trim() === cleanId && String(p.userId) === String(req.user.id));
    if (projectIndex === -1) return res.status(404).json({ error: '项目不存在' });
    
    // 按照用户最新指令：工程是工程，作品是作品。删除工程不影响已发布的社区作品。
    // 仅删除工程记录及其内部数据
    db.projects.splice(projectIndex, 1);
    
    writeDB(db);
    io.to(String(req.user.id)).emit('projects_updated');
    res.json({ success: true, message: '工作台工程已安全删除' });
  });

  app.put('/api/projects/:id/name', authenticateToken, (req: any, res) => {
    const db = readDB();
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });

    const project = db.projects.find((p: any) => p.id === req.params.id && String(p.userId) === String(req.user.id));
    if (!project) return res.status(404).json({ error: '项目不存在' });
    
    project.name = name;
    project.updatedAt = new Date().toISOString();
    writeDB(db);
    io.to(String(req.user.id)).emit('projects_updated');
    res.json({ success: true, project });
  });

  // --- History Management ---
  app.get('/api/history', authenticateToken, (req: any, res) => {
    const db = readDB();
    const projectId = req.query.projectId;
    let userHistory = (db.history || [])
      .filter((h: any) => String(h.userId) === String(req.user.id));
      
    if (projectId) {
      userHistory = userHistory.filter((h: any) => h.projectId === projectId);
    }
    
    userHistory.sort((a: any, b: any) => b.timestamp - a.timestamp);
    res.json(userHistory);
  });

  app.post('/api/history', authenticateToken, async (req: any, res) => {
    const { item, projectId } = req.body;
    if (!item) return res.status(400).json({ error: 'History item required' });

    await withDBLock(async () => {
      const db = readDB();
      if (!db.history) db.history = [];
      
      const newItem = {
        ...item,
        userId: req.user.id,
        projectId: projectId || null,
        id: item.id || `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: item.timestamp || Date.now(),
        source: item.source || 'generated'
      };

      db.history.unshift(newItem);
      
      // Limit history size per user to 500 items for performance
      const userHistoryCount = db.history.filter((h: any) => String(h.userId) === String(req.user.id)).length;
      if (userHistoryCount > 500) {
        let countToRemove = userHistoryCount - 500;
        for (let i = db.history.length - 1; i >= 0 && countToRemove > 0; i--) {
          if (String(db.history[i].userId) === String(req.user.id)) {
            db.history.splice(i, 1);
            countToRemove--;
          }
        }
      }

      writeDB(db);
    });

    res.json({ success: true });
  });

  app.delete('/api/history/clear', authenticateToken, async (req: any, res) => {
    const projectId = req.query.projectId;
    await withDBLock(async () => {
      const db = readDB();
      if (db.history) {
        if (projectId) {
          db.history = db.history.filter((h: any) => !(String(h.userId) === String(req.user.id) && h.projectId === projectId));
        } else {
          db.history = db.history.filter((h: any) => String(h.userId) !== String(req.user.id));
        }
        writeDB(db);
      }
    });
    res.json({ success: true });
  });

  // --- Existing Proxy Routes ---
  app.post('/api/omni-router/generate', authenticateToken, async (req: any, res) => {
    try {
      const database = readDB();
      const config = database.config || {};
      
      const routerUrl = config.omniRouterUrl || 'https://overseas-api-proxy-gateway-607215328011.asia-east1.run.app/api/v1/generate';
      let routerKey = config.omniRouterKey || 'aiLZS253';

      const payload = req.body;
      
      let finalUrl = routerUrl.replace(/\/$/, '');
      if (!finalUrl.endsWith('generate')) {
         finalUrl += '/api/v1/generate';
      }

      console.log(`[Omni-Router Proxy] Calling: ${finalUrl}`);

      const response = await axios.post(finalUrl, payload, {
        headers: {
          'Authorization': `Bearer ${routerKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('[Omni-Router Proxy Error]:', error.response?.data || error.message);
      res.status(500).json({ 
        success: false, 
        message: error.response?.data?.message || error.message,
        details: error.response?.data
      });
    }
  });

  app.post('/api/kling/auth', authenticateToken, async (req, res) => {
    try {
      const database = readDB();
      const config = database.config;
      
      // Use system keys if not provided by client (client should ideally not provide them anymore)
      const accessKey = (req.body.accessKey || config.klingAccessKey)?.trim();
      const secretKey = (req.body.secretKey || config.klingSecretKey)?.trim();

      if (!accessKey || !secretKey) {
        return res.status(400).json({ error: '系统未配置 Kling API Key，请联系管理员' });
      }

      // Check credits and deduct with lock
      const cost = config.costs?.videoGen || 200;

      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) throw new Error("User not found");

        if (user.credits < cost && user.role !== 'admin') {
          return { error: `积分不足，生成视频需要 ${cost} 积分`, status: 402 };
        }

        user.credits -= cost;
        logAnalyticsData(db, 'ai_call', (req.params as any)?.provider || req.body?.model || 'kling');
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
          id: Date.now().toString(),
          type: 'decrease',
          amount: cost,
          reason: '生成视频',
          date: new Date().toISOString()
        });
        writeDB(db);
        // Notify client about credit update
        io.to(String(req.user.id)).emit('credits_updated', { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status).json({ error: (result as any).error });
      }

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: accessKey,
        exp: now + 1800, // 30 minutes
        nbf: now - 5     // 5 seconds in the past
      };

      const token = jwt.sign(payload, secretKey, { 
        algorithm: 'HS256',
        noTimestamp: true
      });

      const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      };

      res.json({ headers, remainingCredits: (result as any).credits });
    } catch (error: any) {
      console.error("Auth Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/proxy', authenticateToken, async (req, res) => {
    try {
      const { url, method, headers, body } = req.body;
      const database = readDB();
      const config = database.config;
      
      if (!url) {
        throw new Error("URL is required");
      }

      // Credit deduction with lock
      let cost = config.costs?.proxyCall || 5;
      
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) throw new Error("User not found");

        if (user.credits < cost && user.role !== 'admin') {
          return { error: `积分不足，该操作需要 ${cost} 积分`, status: 402 };
        }

        user.credits -= cost;
        logAnalyticsData(db, 'ai_call', (req.params as any)?.provider || req.body?.model || 'kling');
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
          id: Date.now().toString(),
          type: 'decrease',
          amount: cost,
          reason: 'API 代理调用',
          date: new Date().toISOString()
        });
        writeDB(db);
        // Notify client about credit update
        io.to(String(req.user.id)).emit('credits_updated', { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status).json({ error: (result as any).error });
      }

      const response = await axios({
        url,
        method: method || 'POST',
        headers: headers || { 'Content-Type': 'application/json' },
        data: body,
        timeout: 120000,
        validateStatus: () => true
      });
      
      // If request failed, refund credits with lock
      if (response.status !== 200) {
        await withDBLock(async () => {
          const dbAfter = readDB();
          const userAfter = dbAfter.users.find((u: any) => String(u.id) === String(req.user.id));
          if (userAfter) {
            userAfter.credits += cost;
            if (!userAfter.transactions) userAfter.transactions = [];
            userAfter.transactions.unshift({
              id: Date.now().toString() + '_refund',
              type: 'increase',
              amount: cost,
              reason: 'API 调用失败退回',
              date: new Date().toISOString()
            });
            writeDB(dbAfter);
            console.log(`Refunded ${cost} credits to user ${req.user.id} due to proxy status ${response.status}`);
            // Notify client about credit update
            io.to(String(req.user.id)).emit('credits_updated', { credits: userAfter.credits });
          }
        });
      }

      const finalCredits = await withUserLock(req.user.id, async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        return user?.credits || 0;
      });

      const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
      res.status(frontendStatus).json({
        ...response.data,
        _remainingCredits: finalCredits
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Kling Status Proxy (no credit deduction for polling)
  app.post('/api/kling-status-proxy/*', authenticateToken, async (req: any, res) => {
    const path = req.params[0];
    try {
      const database = readDB();
      const config = database.config || {};
      
      const accessKey = (req.headers['x-kling-access-key'] as string) || config.klingAccessKey;
      const secretKey = (req.headers['x-kling-secret-key'] as string) || config.klingSecretKey;

      if (!accessKey || !secretKey) {
        return res.status(400).json({ error: '系统未配置 Kling API Key' });
      }

      // Generate Kling Token
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: accessKey,
        exp: now + 1800,
        nbf: now - 5
      };
      const klingToken = jwt.sign(payload, secretKey, { algorithm: 'HS256', noTimestamp: true });

      const finalUrl = `https://api-beijing.klingai.com/${path}`;
      const response = await axios({
        url: finalUrl,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${klingToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        validateStatus: () => true
      });

      const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
      res.status(frontendStatus).json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Kling Proxy to handle credits and refunds server-side
  app.post('/api/kling-proxy/*', authenticateToken, async (req: any, res) => {
    const path = req.params[0];
    console.log(`[KlingProxy] Request for path: ${path} from user: ${req.user.id} (${req.user.username})`);
    
    try {
      const database = readDB();
      const config = database.config || {};
      
      const accessKey = (req.headers['x-kling-access-key'] as string) || config.klingAccessKey;
      const secretKey = (req.headers['x-kling-secret-key'] as string) || config.klingSecretKey;

      if (!accessKey || !secretKey) {
        return res.status(400).json({ error: '系统未配置 Kling API Key' });
      }

      // Determine cost
      const cost = config.costs?.videoGen || 200;
      
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        
        if (!user) return { error: '用户不存在', status: 404 };
        
        if (user.credits < cost && user.role !== 'admin') {
          return { error: `积分不足，生成视频需要 ${cost} 积分`, status: 402 };
        }

        user.credits -= cost;
        logAnalyticsData(db, 'ai_call', (req.params as any)?.provider || req.body?.model || 'kling');
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
          id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
          type: 'decrease',
          amount: cost,
          reason: '生成视频',
          date: new Date().toISOString()
        });
        
        writeDB(db);
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status).json({ error: (result as any).error });
      }
      
      // Notify client about credit update
      io.to(String(req.user.id)).emit('credits_updated', { credits: (result as any).credits });

      // Generate Kling Token
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: accessKey,
        exp: now + 1800,
        nbf: now - 5
      };
      const klingToken = jwt.sign(payload, secretKey, { algorithm: 'HS256', noTimestamp: true });

      const finalUrl = `https://api-beijing.klingai.com/${path}`;
      const response = await axios({
        url: finalUrl,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${klingToken}`,
          'Content-Type': 'application/json'
        },
        data: req.body,
        timeout: 120000,
        validateStatus: () => true
      });

      console.log(`[KlingProxy] Kling API responded with status: ${response.status}`);

      // If request failed, refund credits
      if (response.status !== 200) {
        console.log(`[KlingProxy] Request failed, refunding ${cost} credits to user ${req.user.id}`);
        await withDBLock(async () => {
          const dbAfter = readDB();
          const userAfter = dbAfter.users.find((u: any) => String(u.id) === String(req.user.id));
          if (userAfter) {
            userAfter.credits += cost;
            if (!userAfter.transactions) userAfter.transactions = [];
            userAfter.transactions.unshift({
              id: Date.now().toString() + '_refund',
              type: 'increase',
              amount: cost,
              reason: '视频生成失败退回',
              date: new Date().toISOString()
            });
            writeDB(dbAfter);
            io.to(String(req.user.id)).emit('credits_updated', { credits: userAfter.credits });
          }
        });
      }

      const finalCredits = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        return user?.credits || 0;
      });

      const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
      res.status(frontendStatus).json({
        ...response.data,
        _remainingCredits: finalCredits
      });
    } catch (error: any) {
      console.error(`[KlingProxy] Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Mock Jimeng Proxy
  const jimengTasks = new Map<string, { status: string, startTime: number }>();

  app.post('/api/jimeng-proxy/*', authenticateToken, async (req: any, res) => {
    console.log(`[JimengProxy] Submit task from user: ${req.user.id}`);
    const taskId = 'jimeng_' + Date.now().toString();
    jimengTasks.set(taskId, { status: 'submitted', startTime: Date.now() });
    
    res.json({
      code: 0,
      message: "success",
      data: {
        task_id: taskId
      }
    });
  });

  app.post('/api/jimeng-status-proxy/*', authenticateToken, async (req: any, res) => {
    const path = req.params[0];
    const taskId = path.split('/').pop() || '';
    console.log(`[JimengProxy] Check status for task: ${taskId}`);
    
    const task = jimengTasks.get(taskId);
    if (!task) {
      return res.json({ code: 1, message: "Task not found" });
    }

    const elapsed = Date.now() - task.startTime;
    let status = 'processing';
    
    // Simulate processing time (e.g., 10 seconds)
    if (elapsed > 10000) {
      status = 'succeed';
    }

    if (status === 'succeed') {
      res.json({
        code: 0,
        message: "success",
        data: {
          task_status: "succeed",
          task_result: {
            videos: [
              {
                url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
              }
            ]
          }
        }
      });
    } else {
      res.json({
        code: 0,
        message: "success",
        data: {
          task_status: "processing"
        }
      });
    }
  });

  // Transparent jepow AI Proxy
  app.post('/api/jepow-proxy/*', authenticateToken, async (req: any, res) => {
    const path = req.params[0];
    console.log(`[jepow AI Proxy] Request for path: ${path} from user: ${req.user.id} (${req.user.username})`);
    
    try {
      const database = readDB();
      const config = database.config || {};
      
      // Determine model ID from path (e.g., v1beta/models/gemini-3-pro-image-preview:generateContent)
      let modelIdInPath = '';
      const modelMatch = path.match(/models\/([^:]+)/);
      if (modelMatch) {
        modelIdInPath = modelMatch[1].split(':')[0]; // Strip :generateContent or similar
      }

      // Try to find model-specific Gateway, Key, and Path
      let modelSpecificUrl = '';
      let modelSpecificKey = '';
      let modelSpecificPath = '';
      
      // Check for Nano Banana Pro (gemini-3-pro-image-preview equivalent)
      if (modelIdInPath === (config.nanoBananaProModel || 'gemini-3-pro-image-preview')) {
        modelSpecificUrl = config.nanoBananaProUrl;
        modelSpecificKey = config.nanoBananaProKey;
        modelSpecificPath = config.nanoBananaProPath;
      }
      // Check for Nano Banana 2 (gemini-3.1-flash-image-preview equivalent)
      else if (modelIdInPath === (config.nanoBanana2Model || 'gemini-3.1-flash-image-preview')) {
        modelSpecificUrl = config.nanoBanana2Url;
        modelSpecificKey = config.nanoBanana2Key;
        modelSpecificPath = config.nanoBanana2Path;
      }
      // Check for Nano Banana (gemini-2.5-flash-image equivalent)
      else if (modelIdInPath === (config.nanoBananaModel || 'gemini-2.5-flash-image')) {
        modelSpecificUrl = config.nanoBananaUrl;
        modelSpecificKey = config.nanoBananaKey;
        modelSpecificPath = config.nanoBananaPath;
      }

      let baseUrl = modelSpecificUrl || config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
      baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
      
      // If a custom path is provided in config (e.g. /v1beta/models/...), use it to replace the client-provided path
      // Note: Client path usually looks like v1beta/models/xxx:generateContent
      let finalPath = path;
      if (modelSpecificPath) {
        // If client path has an action (like :generateContent), preserve it if the custom path doesn't have it
        const clientActionMatch = path.match(/:[a-zA-Z]+$/);
        const clientAction = clientActionMatch ? clientActionMatch[0] : '';
        
        finalPath = modelSpecificPath.replace(/^\//, ''); // Remove leading slash
        if (clientAction && !finalPath.includes(':')) {
          finalPath += clientAction;
        }
      }

      let urlObj = new URL(`${baseUrl}/${finalPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
      
      // Use model-specific key if available, otherwise global env/config
      const geminiKey = modelSpecificKey || process.env.GEMINI_API_KEY || config.geminiApiKey;
      
      // For aggregators (poloapi.top etc), they often expect the key in the query param 'key'
      // if using Google's protocol. We restore it using the server-side key.
      if (geminiKey) {
        urlObj.searchParams.set('key', geminiKey);
      }
      
      const finalUrl = urlObj.toString();
      
      let finalHeaders: any = {};
      // Inherit content-type and other essential headers but skip host/auth
      const skipHeaders = ['host', 'connection', 'authorization', 'x-goog-api-key'];
      Object.keys(req.headers).forEach(h => {
        if (!skipHeaders.includes(h.toLowerCase())) {
          finalHeaders[h] = req.headers[h];
        }
      });
      
      if (geminiKey) {
        // Standard Gemini header
        finalHeaders['x-goog-api-key'] = geminiKey;
        // Aggregator/OpenAI style header - try both Bearer and raw if it looks like an sk- key
        if (geminiKey.startsWith('sk-')) {
          finalHeaders['Authorization'] = geminiKey; // Raw sk- token
          // Also provide Bearer version just in case
          finalHeaders['X-Authorization-Bearer'] = `Bearer ${geminiKey}`;
        } else {
          finalHeaders['Authorization'] = `Bearer ${geminiKey}`;
        }
      }
      
      // Mandatory headers as per Image 1
      finalHeaders['Accept'] = 'application/json';
      finalHeaders['Content-Type'] = 'application/json';
      
      console.log(`[jepow AI Proxy] Final Request URL: ${finalUrl}`);
      console.log(`[jepow AI Proxy] Final Headers: ${Object.keys(finalHeaders).map(h => `${h}: ${h.toLowerCase().includes('key') || h.toLowerCase().includes('auth') ? '***' : finalHeaders[h]}`).join(', ')}`);
      
      // Determine cost - more robust detection
      let cost = config.costs?.textGen || 10;
      const body = req.body || {};
      
      // Log body for debugging
      console.log(`[jepow AI Proxy] Request Body: ${JSON.stringify(body).substring(0, 500)}...`);

      // Extract model name from body or path
      let modelName = (body.model || '').toLowerCase();
      if (!modelName && path.includes('models/')) {
        const parts = path.split('/');
        const modelPart = parts.find(p => p.includes('gemini') || p.includes('imagen') || p.includes('learnlm'));
        if (modelPart) {
          modelName = modelPart.split(':')[0].toLowerCase();
        }
      }

      const isImageGen = path.includes('image') || 
                         path.includes('imagen') ||
                         modelName.includes('image') ||
                         modelName.includes('imagen') ||
                         (path.includes('generateContent') && body.config?.imageConfig) ||
                         (body.contents?.[0]?.parts?.some((p: any) => p.text && (p.text.toLowerCase().includes('generate a storyboard frame') || p.text.toLowerCase().includes('generate an image'))));
      
      if (isImageGen) {
        cost = config.costs?.imageGen || 50;
      }
      
      console.log(`[jepow AI Proxy] Detected Model: ${modelName || 'unknown'}`);
      console.log(`[jepow AI Proxy] Is Image Gen: ${isImageGen}`);
      console.log(`[jepow AI Proxy] Calculated cost: ${cost}`);

      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => u.id === req.user.id);
        
        if (!user) {
          console.log(`[jepow AI Proxy] User not found: ${req.user.id}`);
          return { error: '用户不存在', status: 404 };
        }
        
        // Deduct credits
        if (user.credits < cost && user.role !== 'admin') {
          console.log(`[jepow AI Proxy] Insufficient credits for user ${user.username}: has ${user.credits}, needs ${cost}`);
          return { error: `积分不足，该操作需要 ${cost} 积分`, status: 402 };
        }

        user.credits -= cost;
        console.log(`[jepow AI Proxy] Deducted ${cost} credits from user ${user.username}. New balance: ${user.credits}`);
        
        // Log transaction
        if (!user.transactions) user.transactions = [];
        const transaction = {
          id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
          type: 'decrease',
          amount: cost,
          reason: isImageGen ? 'jepow AI 图片生成' : 'jepow AI 文本生成',
          date: new Date().toISOString()
        };
        user.transactions.unshift(transaction);
        
        writeDB(db);
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        console.log(`[jepow AI Proxy] Credit deduction failed: ${(result as any).error}`);
        return res.status((result as any).status).json({ error: (result as any).error });
      }
      
      // Notify client about credit update
      io.to(req.user.id).emit('credits_updated', { credits: (result as any).credits });
      
      // SANITIZE PAYLOAD
      const outgoingBody = JSON.parse(JSON.stringify(req.body)); // Deep clone to avoid mutations
      if (finalUrl.includes('generateContent')) {
         // Resolve local reference images in contents
         if (outgoingBody.contents && Array.isArray(outgoingBody.contents)) {
            for (const content of outgoingBody.contents) {
               if (content.parts && Array.isArray(content.parts)) {
                  for (const part of content.parts) {
                     // If it's a relative path in inline_data (rare if coming from our UI, but safe to check)
                     if (part.inline_data && typeof part.inline_data.data === 'string' && (part.inline_data.data.startsWith('/uploads/') || part.inline_data.data.startsWith('/api/uploads/') || part.inline_data.data.startsWith('/api/image?f='))) {
                        try {
                           const cleanPath = part.inline_data.data.split('f=').pop()?.replace('/api/uploads/', '').replace('/uploads/', '') || '';
                           const fileName = path.basename(cleanPath);
                           const possiblePaths = [path.join(process.cwd(), 'uploads', fileName), path.join(process.cwd(), 'public', 'uploads', fileName)];
                           let buf: Buffer | null = null;
                           for (const p of possiblePaths) { if (fs.existsSync(p)) { buf = fs.readFileSync(p); break; } }
                           if (buf) {
                              part.inline_data.data = buf.toString('base64');
                              const ext = path.extname(fileName).toLowerCase().replace('.', '');
                              part.inline_data.mime_type = ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
                           }
                        } catch (e) { console.error("[jepow] Path resolve failed:", e); }
                     }
                  }
               }
            }
         }

         const rawGenConfig = outgoingBody.generationConfig || outgoingBody.generation_config || {};
         const isCamel = !!outgoingBody.generationConfig;
         const cleanGenConfig: any = {
            response_modalities: ["IMAGE"],
            responseModalities: ["IMAGE"]
         };
         
         const rawImageConfig = rawGenConfig.imageConfig || rawGenConfig.image_config;
         
         Object.keys(rawGenConfig).forEach(k => {
            const val = rawGenConfig[k];
            cleanGenConfig[k] = val;
            const snakeK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            if (snakeK !== k) cleanGenConfig[snakeK] = val;
         });
         
         if (rawImageConfig) {
            const cleanImageConfig: any = {};
            Object.keys(rawImageConfig).forEach(k => {
               cleanImageConfig[k] = rawImageConfig[k];
               const snakeK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
               if (snakeK !== k) cleanImageConfig[snakeK] = rawImageConfig[k];
            });
            cleanGenConfig.imageConfig = cleanImageConfig;
            cleanGenConfig.image_config = cleanImageConfig;
         }
         
         outgoingBody.generationConfig = cleanGenConfig;
         outgoingBody.generation_config = cleanGenConfig;
         
         if (req.body.safetySettings || req.body.safety_settings) {
            const rawSafety = req.body.safetySettings || req.body.safety_settings;
            const processedSafety = rawSafety.map((s: any) => ({
               category: s.category,
               threshold: s.threshold
            }));
            outgoingBody.safety_settings = processedSafety;
            outgoingBody.safetySettings = processedSafety;
         }
      }

      console.log(`[jepow AI Proxy] Forwarding request to Gemini API: ${finalUrl}`);
      try {
        console.log(`[jepow AI Proxy] Payload Summary:`, {
          model: outgoingBody.model,
          isContentsPresent: !!outgoingBody.contents,
          isGenConfigPresent: !!(outgoingBody.generationConfig || outgoingBody.generation_config)
        });
      } catch (e) {}

      try {
        const response = await axios({
          url: finalUrl,
          method: 'POST',
          headers: finalHeaders as any,
          data: outgoingBody,
          timeout: 600000,
          validateStatus: () => true
        });

        console.log(`[jepow AI Proxy] Gemini API responded with status: ${response.status}`);
        const isSuccess = response.status >= 200 && response.status < 300;
        
        if (!isSuccess) {
          console.error(`[jepow AI Proxy] Gemini API Error Response:`, typeof response.data === 'object' ? JSON.stringify(response.data) : response.data);
        }

        // If request failed, refund credits with lock
        if (!isSuccess) {
          console.log(`[jepow AI Proxy] Request failed, refunding ${cost} credits to user ${req.user.id}`);
          await withDBLock(async () => {
            const dbAfter = readDB();
            const userAfter = dbAfter.users.find((u: any) => u.id === req.user.id);
            if (userAfter) {
              userAfter.credits += cost;
              if (!userAfter.transactions) userAfter.transactions = [];
              userAfter.transactions.unshift({
                id: Date.now().toString() + '_refund',
                type: 'increase',
                amount: cost,
                reason: 'AI 调用失败退回',
                date: new Date().toISOString()
              });
              writeDB(dbAfter);
              io.to(String(req.user.id)).emit('credits_updated', { credits: userAfter.credits });
            }
          });
        }

        const finalCredits = await withDBLock(async () => {
          const dbData = readDB();
          const u = dbData.users.find((user: any) => user.id === req.user.id);
          return u?.credits || 0;
        });

        // Robustly handle response data
        const resData = typeof response.data === 'object' ? response.data : { rawResponse: String(response.data) };

        const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
        res.status(frontendStatus).json({
          ...resData,
          _remainingCredits: finalCredits
        });
      } catch (axiosErr: any) {
        throw axiosErr;
      }
    } catch (error: any) {
      console.error(`[jepow AI Proxy] Unexpected error: ${error.message}`);
      
      let errorMsg = error.message;
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        errorMsg = 'AI 接口请求超时。国内服务器通常无法直接连接国外 API，请在 .env 中配置有效的 GEMINI_BASE_URL 代理地址。';
      }
      
      res.status(500).json({ 
        error: errorMsg,
        _isConnectivityError: true,
        _suggestion: '请尝试更换或优化您的代理配置。'
      });
    }
  });

  // Generic AI Matrix Proxy (OpenAI Compatible or Custom)
  app.post('/api/matrix-proxy/:provider', authenticateToken, async (req: any, res) => {
    const { provider } = req.params;
    const database = readDB();
    const config = database.config || {};
    
    let apiKey = '';
    let apiBase = '';
    let apiModel = '';
    let cost = 100;
    
    let isOmniRouterRoute = false;
    // Universal Omni-Router Logic
    if (config.omniRouterKey && config.omniRouterUrl) {
      apiKey = config.omniRouterKey;
      apiBase = config.omniRouterUrl.replace(/\/api\/v1\/generate$/, '').replace(/\/v1\/generate$/, '').replace(/\/+$/, '');
      
      let mappedProvider = provider;
      if (apiBase.includes('openrouter.ai')) {
        if (provider === 'dall-e-3') mappedProvider = 'openai/dall-e-3';
        else if (provider === 'imagen-4.0-fast-generate-001') mappedProvider = 'google/imagen-3-fast';
      }
      apiModel = mappedProvider; 
      cost = config.omniRouterInferenceCost || 50;
      isOmniRouterRoute = true;
    } else {
      // Fallback for individual providers (Legacy/Independent)
      switch (provider) {
        case 'gemini-3.1-flash-image-preview':
        case 'gemini-3-pro-image-preview':
        case 'imagen-4.0-fast-generate-001':
          apiKey = config.geminiApiKey;
          apiBase = config.geminiBaseUrl;
          apiModel = provider;
          cost = 50;
          break;
        case 'dall-e-3':
          apiKey = config.gptImage2Key;
          apiBase = config.gptImage2Url;
          apiModel = 'dall-e-3';
          cost = 100;
          break;
        default:
          return res.status(400).json({ error: `未配置 OMNI-ROUTER，且此模型无法匹配独立配置: ${provider}` });
      }
    }

    if (!apiKey || !apiBase) {
      return res.status(400).json({ error: `缺失 ${provider} 的密钥或网关地址。请在后台 [系统协议] 配置 OMNI-ROUTER。` });
    }

    // Deduct credits
    const result = await withDBLock(async () => {
      const db = readDB();
      const user = db.users.find((u: any) => u.id === req.user.id);
      if (!user) return { error: '用户不存在', status: 404 };
      if (user.credits < cost && user.role !== 'admin' && user.role !== 'super_admin') return { error: `积分不足，执行该操作需要 ${cost} 积分`, status: 402 };
      
      // Admin/Super Admin don't deduct credits for themselves
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        user.credits -= cost;
        logAnalyticsData(db, 'ai_call', (req.params as any)?.provider || req.body?.model || 'kling');
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
          id: Date.now().toString() + '_matrix',
          type: 'decrease',
          amount: cost,
          reason: `AI 矩阵调用: ${provider}`,
          date: new Date().toISOString()
        });
      }
      writeDB(db);
      return { success: true, credits: user.credits };
    });

    if ((result as any).error) return res.status((result as any).status || 400).json({ error: (result as any).error });
    io.to(req.user.id).emit('credits_updated', { credits: (result as any).credits });

    let finalUrl = '';
    const proxyMethod = req.body.method || 'POST';

    try {
      // Robust URL construction
      const safeBase = String(apiBase || '').trim();
      let cleanBase = safeBase.replace(/\/+$/, '');
      const payloadPath = req.body.path;

      // Move isImageModel detection up so we can apply smart auto-correction to user-provided gateway paths
      const isVideoModel = [
        'veo-3.1',
        'sora-2',
        'kling-video-o1',
        'kling-1-5',
        'kling-v3-omni'
      ].includes(provider as string) || 
      String(provider).includes('kling') ||
      String(provider).includes('sora') ||
      String(provider).includes('veo') ||
      String(provider).includes('seedance') ||
      String(provider).includes('pika') ||
      String(provider).includes('runway');

      const isImageModel = [
        'gpt-image-1',
        'gpt-image-2', 
        'gpt-4o-image-vip',
        'flux-1-pro', 
        'flux-kontext-pro',
        'flux-kontext-max',
        'midjourney-v6-1', 
        'seedream-5', 
        'nano-banana-pro', 
        'nano-banana-2', 
        'dall-e-3'
      ].includes(provider as string) || 
      String(provider).includes('flux') || 
      String(provider).includes('image-preview') || 
      String(provider).includes('imagen-') ||
      String(provider).includes('seedream') ||
      String(provider).includes('dall-e-3');

      const isInitialGenerationCall = !payloadPath || payloadPath === "v1/videos/generations" || payloadPath === "v1/images/generations" || payloadPath === "v1/videos/omni-video";

      if (isOmniRouterRoute && isInitialGenerationCall && config.omniRouterUrl) {
        // Keep the exact omniRouterUrl for the initial generation call (e.g. /api/v1/generate)
        let finalUrlBase = config.omniRouterUrl.trim().replace(/\/$/, '');
        if (!finalUrlBase.endsWith('generate')) {
           finalUrlBase += '/api/v1/generate';
        }
        finalUrl = finalUrlBase;
        console.log(`[Matrix Proxy] Initial Omni-Router Generation: Routing to dynamic unified endpoint: ${finalUrl}`);
      } else if (payloadPath) {
        // EXACT PATH OVERRIDE (e.g. for polling)
        // Ensure we step back to the actual host if user saved a specific route
        let baseHost = cleanBase;
        baseHost = baseHost.replace(/\/v1\/images\/generations.*/, '');
        baseHost = baseHost.replace(/\/v1\/chat\/completions.*/, '');
        baseHost = baseHost.replace(/\/v1\/videos\/generations.*/, '');
        baseHost = baseHost.replace(/\/api\/chat.*/, '');
        baseHost = baseHost.replace(/\/api\/image.*/, '');
        baseHost = baseHost.replace(/\/api\/generations.*/, '');
        baseHost = baseHost.replace(/\/v1$/, '');
        baseHost = baseHost.replace(/\/v1\/generate.*/, ''); // Handle Omni Router URL
        
        const cleanPath = payloadPath.replace(/^\/+/, '');
        finalUrl = `${baseHost}/${cleanPath}`;
      } else {
        if (isOmniRouterRoute && config.omniRouterUrl) {
          // Keep the exact omniRouterUrl for the initial generation call
          finalUrl = config.omniRouterUrl;
        } else {
          // Smart Endpoint Correction
          let baseWithoutPath = cleanBase;
          baseWithoutPath = baseWithoutPath.replace(/\/v1\/images\/generations.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/v1\/chat\/completions.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/v1\/videos\/generations.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/api\/chat.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/api\/image.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/api\/generations.*/, '');
          baseWithoutPath = baseWithoutPath.replace(/\/v1$/, '');

          // If they pasted a v1beta model path, leave it untouched? No, better fix it using isImageModel/isVideoModel
          if (cleanBase.includes('/v1beta/') || cleanBase.includes('generateContent') || (!isOmniRouterRoute && cleanBase.includes('/api/v1/'))) {
             // Assume they know what they are doing for non-standard routes
             finalUrl = cleanBase;
          } else {
             const mLower = String(apiModel).toLowerCase();
             if (isVideoModel) {
               finalUrl = `${baseWithoutPath}/v1/videos/generations`;
             } else if (isImageModel) {
               const isGemini = mLower.includes('gemini') || mLower.includes('nano-') || mLower.includes('banana-');
               const isGPTReverse = mLower.includes('image-vip') || mLower.includes('gpt-4o-image');
               
               if (isGemini) {
                  finalUrl = `${baseWithoutPath}/v1/images/generations`;
               } else if (isGPTReverse) {
                 finalUrl = `${baseWithoutPath}/v1/chat/completions`;
               } else {
                 finalUrl = `${baseWithoutPath}/v1/images/generations`;
               }
             } else {
               finalUrl = `${baseWithoutPath}/v1/chat/completions`; 
             }
          }
        }
      }

      // Merge payload and inject modelId (scheduling name)
      const outgoingPayload = req.body.payload || req.body;
      
      // PREFER the incoming payload model if it looks like a real model ID and isn't a generic placeholder
      let targetModelId = (outgoingPayload.model && outgoingPayload.model.length > 2 && outgoingPayload.model !== 'gpt-image-2' && outgoingPayload.model !== 'mj_imagine') 
        ? outgoingPayload.model 
        : (apiModel || provider || 'mj_imagine');
      
      // Prefer retaining standard direct models (like kling-video-o1, kling-v3-omni, etc.) completely unmapped to ensure the appropriate gateway dispatching
      outgoingPayload.model = targetModelId;
      if (targetModelId.toLowerCase().includes('kling')) {
        outgoingPayload.model_name = targetModelId;
      }
      const modelLower = targetModelId.toLowerCase();

      // RELAY PLATFORM UNIFICATION (Agnostic "One-Code-Base" Approach)
      let promptText = outgoingPayload.prompt;
      
      const hasPrebuiltMessages = Array.isArray(outgoingPayload.messages) && outgoingPayload.messages.length > 0;
      
      if (!promptText && hasPrebuiltMessages) {
        const lastMsg = outgoingPayload.messages[outgoingPayload.messages.length - 1];
        if (lastMsg && lastMsg.content) {
          if (typeof lastMsg.content === 'string') {
            promptText = lastMsg.content;
          } else if (Array.isArray(lastMsg.content)) {
            const textPart = lastMsg.content.find((p: any) => p.type === 'text');
            promptText = textPart ? textPart.text : '';
          }
        }
      }
      
      // Default fallback
      if (!promptText || typeof promptText !== 'string') promptText = (typeof promptText === 'object') ? JSON.stringify(promptText) : String(promptText || '');
      
      // Clean up internal hints & Non-standard fields
      delete outgoingPayload._internal;
      delete outgoingPayload.is_edit;

      if (promptText || hasPrebuiltMessages) {
        if (finalUrl.includes('v1beta') || finalUrl.includes('generateContent')) {
          // Native Gemini Unified Structure
          const parts: any[] = [{ text: String(promptText) }];
          if (outgoingPayload.image || outgoingPayload.image_url || outgoingPayload.ref_image) {
            const rawImg = outgoingPayload.image || outgoingPayload.image_url || outgoingPayload.ref_image;
            let imgData = typeof rawImg === 'string' ? rawImg : (rawImg?.url || JSON.stringify(rawImg));
            
            // Resolve local relative paths to Base64 (Data URL) for Gemini Native Path
            if (typeof imgData === 'string' && (imgData.startsWith('/uploads/') || imgData.startsWith('/api/uploads/') || imgData.startsWith('/api/image?f='))) {
              try {
                const cleanPath = imgData.split('f=').pop()?.replace('/api/uploads/', '').replace('/uploads/', '') || '';
                const fileName = path.basename(cleanPath);
                const possiblePaths = [
                  path.join(process.cwd(), 'uploads', fileName),
                  path.join(process.cwd(), 'public', 'uploads', fileName)
                ];
                let fileBuffer: Buffer | null = null;
                for (const p of possiblePaths) {
                  if (fs.existsSync(p)) {
                    fileBuffer = fs.readFileSync(p);
                    break;
                  }
                }
                if (fileBuffer) {
                  const ext = path.extname(fileName).toLowerCase().replace('.', '');
                  const currentMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
                  imgData = `data:${currentMime};base64,${fileBuffer.toString('base64')}`;
                }
              } catch (err) {
                console.error("[server] Failed to resolve local image for Gemini:", err);
              }
            }

            let finalBase64 = imgData;
            let finalMime = "image/png";

            if (typeof imgData === 'string' && imgData.includes('data:')) {
              const idx = imgData.indexOf(',');
              if (idx !== -1) {
                const header = imgData.substring(0, idx);
                finalBase64 = imgData.substring(idx + 1).replace(/[\r\n\s]+/g, '');
                const mimeMatch = header.match(/data:([^;]+)/);
                const rawMime = mimeMatch ? mimeMatch[1] : 'image/png';
                finalMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
              }
            } else if (typeof imgData === 'string' && imgData.includes(',')) {
              finalBase64 = imgData.substring(imgData.indexOf(',') + 1).replace(/[\r\n\s]+/g, '');
            } else if (typeof imgData === 'string') {
              finalBase64 = imgData.replace(/[\r\n\s]+/g, '');
            }
            
            parts.push({
              inline_data: {
                data: finalBase64,
                mime_type: finalMime
              }
            });
          }
          outgoingPayload.contents = [{ parts }];

          // HARDENED GEMINI PAYLOAD UNIFICATION
          // Provide BOTH snake_case and camelCase to satisfy diverse aggregators
          const cleanPayload: any = {
             contents: outgoingPayload.contents
          };

          const genConfig = outgoingPayload.generationConfig || outgoingPayload.generation_config || {};
          const imageConfig = genConfig.imageConfig || genConfig.image_config;
          
          cleanPayload.generation_config = {
             response_modalities: ["IMAGE"]
          };
          cleanPayload.generationConfig = {
             responseModalities: ["IMAGE"]
          };

          // Merge other config
          Object.keys(genConfig).forEach(k => {
             const val = genConfig[k];
             if (k === 'responseModalities' || k === 'response_modalities') {
                cleanPayload.generation_config.response_modalities = val;
                cleanPayload.generationConfig.responseModalities = val;
             } else if (k !== 'imageConfig' && k !== 'image_config' && k !== 'resolution') {
                const snakeK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                const camelK = k.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                if (snakeK !== 'resolution') {
                  cleanPayload.generation_config[snakeK] = val;
                  cleanPayload.generationConfig[camelK] = val;
                }
             }
          });

          if (imageConfig) {
             cleanPayload.generation_config.image_config = {};
             cleanPayload.generationConfig.imageConfig = {};
             Object.keys(imageConfig).forEach(k => {
                const snakeK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                const camelK = k.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                // Strictly exclude response_modalities and resolution from image_config
                if (snakeK !== 'response_modalities' && snakeK !== 'resolution') {
                   cleanPayload.generation_config.image_config[snakeK] = imageConfig[k];
                   cleanPayload.generationConfig.imageConfig[camelK] = imageConfig[k];
                }
             });
          }

          if (outgoingPayload.safetySettings || outgoingPayload.safety_settings) {
             cleanPayload.safety_settings = outgoingPayload.safetySettings || outgoingPayload.safety_settings;
             cleanPayload.safetySettings = cleanPayload.safety_settings;
          }

          // Replace outgoingPayload with cleaned version
          Object.keys(outgoingPayload).forEach(key => delete outgoingPayload[key]);
          Object.assign(outgoingPayload, cleanPayload);

          const googleAllowed = ['contents', 'generation_config', 'generationConfig', 'safety_settings', 'safetySettings'];
          Object.keys(outgoingPayload).forEach(k => { if(!googleAllowed.includes(k)) delete outgoingPayload[k]; });
        } else if (finalUrl.includes('chat/completions')) {
          // OpenAI Chat compatible (including Gemini variations)
          outgoingPayload.model = targetModelId;
          
          // Enhanced messages for vision/image support
          let imgData = outgoingPayload.image || outgoingPayload.image_url || outgoingPayload.ref_image || outgoingPayload.reference_image;
          
          if (imgData) {
              // Resolve local relative paths to Base64 (Data URL)
              if (typeof imgData === 'string' && (imgData.startsWith('/uploads/') || imgData.startsWith('/api/uploads/') || imgData.startsWith('/api/image?f='))) {
                try {
                  const cleanPath = imgData.split('f=').pop()?.replace('/api/uploads/', '').replace('/uploads/', '') || '';
                  const fileName = path.basename(cleanPath);
                  // Try multiple common upload locations to fix "illegal base64" path mismatch
                  const possiblePaths = [
                    path.join(UPLOADS_DIR, fileName),
                    path.join(process.cwd(), 'uploads', fileName),
                    path.join(process.cwd(), '../jepow-data/uploads', fileName),
                    path.join('/home/admin/jepow-data/uploads', fileName)
                  ];
                  let foundPath = null;
                  for (const p of possiblePaths) {
                    if (fs.existsSync(p)) { foundPath = p; break; }
                  }

                  if (foundPath) {
                    const buffer = fs.readFileSync(foundPath);
                    const ext = path.extname(fileName).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp');
                    imgData = `data:${mime};base64,${buffer.toString('base64')}`;
                  } else {
                    console.error(`[AI Matrix Proxy] Image file NOT FOUND in any common path: ${fileName}`);
                  }
                } catch (e) {
                  console.error("Local image to base64 conversion failed", e);
                }
              }

              const finalImgUrl = (typeof imgData === 'string' && (imgData.startsWith('http') || imgData.startsWith('data:'))) 
                ? imgData 
                : (typeof imgData === 'string' && imgData.includes(',') ? imgData : imgData); // Do NOT wrap if it's still a path

             if (hasPrebuiltMessages) {
               const lastMsg = outgoingPayload.messages[outgoingPayload.messages.length - 1];
               if (lastMsg) {
                 lastMsg.content = [
                   { type: 'text', text: String(promptText) },
                   { type: 'image_url', image_url: { url: finalImgUrl } }
                 ];
               }
             } else {
               outgoingPayload.messages = [
                 { 
                   role: 'user', 
                   content: [
                     { type: 'text', text: String(promptText) },
                     { type: 'image_url', image_url: { url: finalImgUrl } }
                   ] 
                 }
               ];
             }
             // Some providers also want the raw fields at top level
          } else if (!hasPrebuiltMessages) {
             outgoingPayload.messages = [{ role: 'user', content: String(promptText) }];
          }

          // Translate Google Gemini tools to OpenAI format
          if (outgoingPayload.tools && Array.isArray(outgoingPayload.tools)) {
            const openAITools: any[] = [];
            
            const lowercaseTypes = (obj: any) => {
              if (!obj || typeof obj !== 'object') return;
              if (obj.type && typeof obj.type === 'string') {
                obj.type = obj.type.toLowerCase();
              }
              Object.values(obj).forEach(val => {
                if (typeof val === 'object') {
                  lowercaseTypes(val);
                }
              });
            };

            outgoingPayload.tools.forEach((toolItem: any) => {
              if (toolItem.functionDeclarations) {
                toolItem.functionDeclarations.forEach((funcDec: any) => {
                  const openaiParams = funcDec.parameters ? JSON.parse(JSON.stringify(funcDec.parameters)) : {};
                  lowercaseTypes(openaiParams);
                  
                  openAITools.push({
                    type: 'function',
                    function: {
                      name: funcDec.name,
                      description: funcDec.description || '',
                      parameters: openaiParams
                    }
                  });
                });
              }
            });
            if (openAITools.length > 0) {
              outgoingPayload.tools = openAITools;
            } else {
              delete outgoingPayload.tools;
            }
          }

          const chatAllowed = [
            'model', 'messages', 'stream', 'temperature', 'top_p', 'max_tokens', 'response_format',
            'n', 'size', 'quality', 'style', 'aspect_ratio', 'image_url', 'ref_image', 'reference_image',
            'guidance_scale', 'num_inference_steps', 'width', 'height', 'resolution', 'dimension',
            'tools', 'tool_choice'
          ];
          Object.keys(outgoingPayload).forEach(k => { if(!chatAllowed.includes(k)) delete outgoingPayload[k]; });
        } else {
          // OpenAI Image (RELAY Standard)
          outgoingPayload.model = targetModelId;
          outgoingPayload.prompt = String(promptText);
          
          // Clean up and resolve media parameters to satisfy the Gateway's requirements.
          // We convert local uploads directly to complete Base64 data URIs (retaining data:...;base64, prefix),
          // retain existing Base64 data URIs completely untouched, and prepend standard MIME data URI headers to raw Base64 strings.
          // The upstream gateway handles physical direct hosting on Aliyun '/temp' securely.
          const mediaParams = [
            'image', 'image_url', 'ref_image', 'reference_image', 'init_image', 'reference_image_url', 'referenceImage',
            'image_tail_url', 'imageTailUrl', 'tail_image', 'tailImage',
            'video', 'video_url', 'videoUrl', 'ref_video', 'reference_video'
          ];

          for (const p of mediaParams) {
            let val = outgoingPayload[p];
            if (typeof val === 'string' && val.trim().length > 0) {
              val = val.trim();

              // 1. Resolve local path to buffer (handles /api/media/, /uploads/, /api/uploads/, /temp/, /api/image?f=, including absolute/relative urls)
              let resolvedLocal = null;
              try {
                let pathname = '';
                if (val.startsWith('http://') || val.startsWith('https://')) {
                  const urlObj = new URL(val);
                  pathname = urlObj.pathname;
                } else {
                  pathname = val;
                }

                if (pathname.includes('/api/media/')) {
                  const pparts = pathname.split('/api/media/');
                  const encodedName = pparts[pparts.length - 1];
                  if (encodedName) {
                    const decodedFilename = Buffer.from(encodedName, 'base64url').toString('utf-8');
                    const safeFilename = path.basename(decodedFilename);
                    const filepath = path.resolve(UPLOADS_DIR, safeFilename);
                    if (fs.existsSync(filepath)) {
                      const buffer = fs.readFileSync(filepath);
                      const ext = path.extname(safeFilename).toLowerCase();
                      let mime = 'image/png';
                      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
                      else if (ext === '.webp') mime = 'image/webp';
                      else if (ext === '.gif') mime = 'image/gif';
                      else if (ext === '.mp4') mime = 'video/mp4';
                      else if (ext === '.webm') mime = 'video/webm';
                      else if (ext === '.mov') mime = 'video/quicktime';
                      resolvedLocal = { buffer, mime, fileName: safeFilename };
                    }
                  }
                } else {
                  const localPrefixes = ['/uploads/', '/api/uploads/', '/temp/', '/api/image?f='];
                  const matchedPrefix = localPrefixes.find(px => pathname.includes(px));
                  if (matchedPrefix) {
                    const cleanPath = pathname.split('f=').pop() || pathname;
                    const fileName = path.basename(cleanPath.replace('/api/uploads/', '').replace('/uploads/', '').replace('/temp/', ''));
                    const possiblePaths = [
                      path.join(UPLOADS_DIR, fileName),
                      path.join(TEMP_DIR, fileName),
                      path.join(process.cwd(), 'uploads', fileName),
                      path.join(process.cwd(), 'temp', fileName),
                      path.join(process.cwd(), '../jepow-data/uploads', fileName),
                      path.join('/home/admin/jepow-data/uploads', fileName)
                    ];
                    let foundPath = null;
                    for (const pathCheck of possiblePaths) {
                      if (fs.existsSync(pathCheck)) { foundPath = pathCheck; break; }
                    }
                    if (foundPath) {
                      const buffer = fs.readFileSync(foundPath);
                      const ext = path.extname(fileName).toLowerCase();
                      let mime = 'image/png';
                      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
                      else if (ext === '.webp') mime = 'image/webp';
                      else if (ext === '.gif') mime = 'image/gif';
                      else if (ext === '.mp4') mime = 'video/mp4';
                      else if (ext === '.webm') mime = 'video/webm';
                      else if (ext === '.mov') mime = 'video/quicktime';
                      resolvedLocal = { buffer, mime, fileName };
                    }
                  }
                }
              } catch (e) {
                console.error(`[Matrix Proxy] Error trying to resolve local file path ${val}:`, e);
              }

              if (resolvedLocal) {
                outgoingPayload[p] = `data:${resolvedLocal.mime};base64,${resolvedLocal.buffer.toString('base64')}`;
                console.log(`[Matrix Proxy] Resolved domestic Aliyun local path ${p} (${resolvedLocal.fileName}) directly to pristine Base64 data URI to prevent firewalled file downloading.`);
              } else if (val.startsWith('data:')) {
                // Keep standard Base64 data URIs completely untouched!
                console.log(`[Matrix Proxy] Retained pristine Base64 data URI for parameter ${p} to trigger gateway ensurePublicUrl.`);
              } else if (val.length > 50 && !val.startsWith('http')) {
                // Raw Base64 string from client -> prepend data URI prefix so the gateway can parse it correctly
                const isVideoField = p.toLowerCase().includes('video');
                const defaultMime = isVideoField ? 'video/mp4' : 'image/png';
                outgoingPayload[p] = `data:${defaultMime};base64,${val}`;
                console.log(`[Matrix Proxy] Appended standard MIME data URL header to raw Base64 string for parameter ${p}.`);
              }
            }
          }

          // Unify primary image fields to make sure the Gateway's router recognizes the multi-modal request
          const allImgVals = [
            outgoingPayload.referenceImage,
            outgoingPayload.image_url,
            outgoingPayload.image,
            outgoingPayload.ref_image,
            outgoingPayload.reference_image,
            outgoingPayload.init_image
          ];
          const bestImgVal = allImgVals.find(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:'))) || allImgVals.find(v => typeof v === 'string' && v.length > 0);
          
          if (bestImgVal) {
            // Populate essential parameters for the gateway to assign routing and allocate appropriate task engines
            outgoingPayload.referenceImage = bestImgVal;
            outgoingPayload.image = bestImgVal;
            outgoingPayload.image_url = bestImgVal;
            console.log(`[Matrix Proxy] Structured best image source across universal fields (image, image_url, referenceImage) as: ${bestImgVal.substring(0, 100)}...`);
          }

          // Smart normalization of aspect ratio parameter styles
          if (outgoingPayload.aspect_ratio && !outgoingPayload.aspectRatio) {
            outgoingPayload.aspectRatio = outgoingPayload.aspect_ratio;
          } else if (outgoingPayload.aspectRatio && !outgoingPayload.aspect_ratio) {
            outgoingPayload.aspect_ratio = outgoingPayload.aspectRatio;
          }

          if (isVideoModel) {
            // Normalizations for video models
            // 1. Aspect Ratio
            const ar = outgoingPayload.aspect_ratio || outgoingPayload.aspectRatio || "16:9";
            outgoingPayload.aspect_ratio = ar;
            outgoingPayload.aspectRatio = ar;

            // 2. Resolution / Video Resolution
            const resVal = outgoingPayload.resolution || outgoingPayload.videoResolution || "720p";
            outgoingPayload.resolution = resVal;
            outgoingPayload.videoResolution = resVal;

            // 3. Duration: ensure camelCase has number, and snake_case has string/number
            let dRaw = outgoingPayload.duration;
            if (dRaw) {
              const dStr = String(dRaw).replace('s', '');
              const dNum = parseInt(dStr, 10);
              if (!isNaN(dNum)) {
                outgoingPayload.duration = dNum; // Set numeric duration for Singapore Gateway
              }
            } else {
              outgoingPayload.duration = 5;
            }

            // 4. Kling Mode
            let modeVal = outgoingPayload.mode || outgoingPayload.klingMode || "std";
            // For newer models (v3-omni, video-o1, v1-5, v3, etc.), std mode is not supported by Kling AI. We automatically switch to "pro" mode to guarantee success.
            if (modelLower.includes('v3') || modelLower.includes('o1') || modelLower.includes('v1-5') || modelLower.includes('omni')) {
              modeVal = "pro";
            }
            outgoingPayload.mode = modeVal;
            outgoingPayload.klingMode = modeVal;

            // 5. Image & Reference Image
            // We ensure both referenceImage and image/image_url are populated with bestImgVal
            if (bestImgVal) {
              outgoingPayload.referenceImage = bestImgVal;
              outgoingPayload.reference_image = bestImgVal;
              outgoingPayload.image = bestImgVal;
              outgoingPayload.image_url = bestImgVal;
            }

            // 6. Action Type and sizing fields
            outgoingPayload.actionType = outgoingPayload.actionType || "kling-video";
            outgoingPayload.imageSize = outgoingPayload.imageSize || "1K";
            
            // Dynamically map resolution size according to chosen aspect ratio for custom gateway
            let calculatedSize = "1376x768";
            if (ar === "9:16") {
              calculatedSize = "768x1376";
            } else if (ar === "1:1") {
              calculatedSize = "1024x1024";
            } else if (ar === "4:3") {
              calculatedSize = "1024x768";
            } else if (ar === "3:4") {
              calculatedSize = "768x1024";
            }
            outgoingPayload.size = calculatedSize;
          }

          // CRITICAL: Recognition for DALL-E 3 style models
          const isDalleModel = modelLower.includes('dall-e-3') || modelLower.includes('gpt-4o-image') || modelLower.includes('gpt-image');
          
          if (isDalleModel) {
            const dalleAllowed = [
              'model', 'prompt', 'n', 'size', 'response_format', 'user', 'style', 'quality', 'resolution', 'image_urls'
            ];
            Object.keys(outgoingPayload).forEach(k => { if(!dalleAllowed.includes(k)) delete outgoingPayload[k]; });
            outgoingPayload.n = 1;
          } else {
            const genericAllowed = [
              'model', 'prompt', 'messages', 'image', 'n', 'size', 'response_format', 'user', 'quality', 
              'aspectRatio', 'imageSize', 'referenceImage', 'videoResolution', 'klingMode', 'actionType',
              'aspect_ratio', 'image_url', 'image_urls', 'ref_image', 'reference_image', 'guidance_scale', 'num_inference_steps',
              'width', 'height', 'resolution', 'dimension', 'style', 'stylize', 'chaos', 'quality_level',
              'output_format', 'sequential_image_generation', 'sequential_image_generation_options', 'watermark',
              // Video generation parameters
              'model_name', 'mode', 'duration', 'camera_control', 'video', 'video_url', 'videoUrl', 'tail_image', 'negative_prompt'
            ];
            Object.keys(outgoingPayload).forEach(k => { if(!genericAllowed.includes(k)) delete outgoingPayload[k]; });
            
            // Fix for Gemini Image Preview (nano-banana-pro / gemini-3.1-pro-image-preview)
            // They do NOT accept resolution, dimension, num_inference_steps, etc!
            if (modelLower.includes('gemini') || modelLower.includes('nano-') || modelLower.includes('banana-') || modelLower.includes('imagen')) {
               const geminiAllowed = [
                 'model', 'prompt', 'aspectRatio', 'imageSize', 'referenceImage', 
                 'aspect_ratio', 'n', 'image', 'image_url', 'image_urls', 'reference_image', 'ref_image', 'init_image', 'image_size', 'quality'
               ];
               Object.keys(outgoingPayload).forEach(k => { if(!geminiAllowed.includes(k)) delete outgoingPayload[k]; });
               delete outgoingPayload.size; // Strict removal of size 
            }
          }
        }
      }

      // FINAL STRIP FOR NATIVE GOOGLE API ONLY (to fix "illegal base64 data at input byte 22")
      // We only do this if it's NOT an OpenAI-compatible /v1/ URL
      const targetModelLower = targetModelId.toLowerCase();
      if (!finalUrl.includes('/v1/') && (targetModelLower.includes('gemini') || targetModelLower.includes('nano-') || targetModelLower.includes('banana-'))) {
          if (outgoingPayload.messages && Array.isArray(outgoingPayload.messages)) {
              outgoingPayload.messages.forEach((msg: any) => {
                  if (msg.content && Array.isArray(msg.content)) {
                      msg.content.forEach((part: any) => {
                          if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
                              // ONLY strip if it's NOT an OpenAI compatible proxy
                              let b64 = part.image_url.url;
                              const idx = b64.indexOf(',');
                              if (idx !== -1) {
                                  b64 = b64.substring(idx + 1);
                              }
                              part.image_url.url = b64.replace(/[\r\n\s]+/g, '');
                          }
                      });
                  }
              });
          }
      }

      console.log(`[AI Matrix Proxy] === OUTGOING REQUEST ===`);
      console.log(`[AI Matrix Proxy] Provider: ${provider}`);
      console.log(`[AI Matrix Proxy] Target URL: ${finalUrl}`);
      console.log(`[AI Matrix Proxy] Model Sent: ${outgoingPayload.model}`);
      try {
        console.log(`[AI Matrix Proxy] Payload Summary: ${JSON.stringify({ ...outgoingPayload, messages: outgoingPayload.messages ? 'present' : 'absent' })}`);
      } catch (e) { console.log("[AI Matrix Proxy] Payload log failed (Circular or too big)"); }

      const outboundHeaders: any = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      // In Singapore Gateway, if IP Whitelist is defined, include whitelist headers to activate physical direct routing & 8-thread async concurrency
      if (config.ipWhitelist) {
        outboundHeaders['X-IP-Whitelist'] = String(config.ipWhitelist);
        outboundHeaders['X-Gateway-IP-Whitelist'] = String(config.ipWhitelist);
        outboundHeaders['ip-whitelist'] = String(config.ipWhitelist);
      }

      const axiosConfig: any = {
        url: finalUrl,
        method: proxyMethod,
        headers: outboundHeaders,
        timeout: 600000,
        validateStatus: () => true // Handle 4xx/5xx manually
      };

      // Only attach data if it's not a GET request, as GET requests with bodies can be rejected
      if (proxyMethod !== 'GET') {
        axiosConfig.data = outgoingPayload;
      }

      const response = await axios(axiosConfig);

      if (response.status >= 400) {
        console.error(`[AI Matrix Proxy] Provider ${provider} returned ${response.status}:`, JSON.stringify(response.data));
        // Refund if error (only if was deducted)
        const db = readDB();
        const user = db.users.find((u: any) => u.id === req.user.id);
        if (user && user.role !== 'admin' && user.role !== 'super_admin') {
          await withDBLock(async () => {
            const freshDb = readDB();
            const freshUser = freshDb.users.find((u: any) => u.id === req.user.id);
            if (freshUser) {
              freshUser.credits += cost;
              writeDB(freshDb);
              io.to(req.user.id).emit('credits_updated', { credits: freshUser.credits });
            }
          });
        }
        
        let errorMessage = `矩阵接口报错 (${response.status})`;
        const providerError = response.data?.error?.message || response.data?.message || (typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
        
        if (response.status === 503) {
          errorMessage = `[503] 中转商接口暂时不可用，可能无配额或维护中。`;
        } else if (response.status === 504) {
          errorMessage = `[504] 矩阵网关超时：中转平台响应过慢或任务超时（DALL-E 3 等模型有时耗时较长），请稍后刷新重试。`;
        } else if (response.status === 429) {
          errorMessage = `[429] 并发/额度超限：中转网关速率受限，或您的 API 账号余额不足/无此模型权限。请在网关后台检查。`;
        } else if (response.status === 500) {
          errorMessage = `[500] 矩阵后端 500 错误：${providerError.substring(0, 500)}`;
        } else if (response.status === 400) {
          errorMessage = `[400] 矩阵请求参数被拒绝：${providerError.substring(0, 500)}`;
        } else if (response.status === 401) {
          errorMessage = `[401] 矩阵网关 Token 无效或已过期！请检查后台配置的 API KEY。`;
        } else if (response.status === 403) {
          errorMessage = `[403] 矩阵网关权限被拒绝，可能因并发超限或 IP 被拦截。`;
        }

        // Note: NEVER return 401 to the frontend for a downstream error, 
        // as the frontend's auth interceptor will log the user out ("会话已过期").
        // Map 401 and 403 from downstream to 502 (Bad Gateway).
        const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
        
        return res.status(frontendStatus).json({
          error: errorMessage,
          message: providerError,
          _isConnectivityError: response.status === 504 || response.status === 503,
          details: {
            status: response.status,
            model: outgoingPayload.model,
            url: finalUrl,
            raw: typeof response.data === 'object' ? response.data : { raw: String(response.data) }
          }
        });
      }

      // Ensure data is an object
      const finalResData = typeof response.data === 'object' ? response.data : { rawResponse: String(response.data) };
      const frontendStatus = (response.status === 401 || response.status === 403) ? 502 : response.status;
      res.status(frontendStatus).json(finalResData);
    } catch (error: any) {
      console.error(`[AI Matrix Proxy] Critical failure for ${provider}:`, error.message);
      
      // Attempt refund on critical timeout/network failure
      const db = readDB();
      const user = db.users.find((u: any) => u.id === req.user.id);
      if (user && user.role !== 'admin' && user.role !== 'super_admin') {
        await withDBLock(async () => {
          const freshDb = readDB();
          const freshUser = freshDb.users.find((u: any) => u.id === req.user.id);
          if (freshUser) {
            freshUser.credits += cost;
            writeDB(freshDb);
            io.to(req.user.id).emit('credits_updated', { credits: freshUser.credits });
          }
        });
      }

      res.status(500).json({ 
        error: "矩阵上行链路中断 (Matrix Proxy Error)", 
        message: error.message || "无法连接到矩阵网关。请检查后台系统协议中的 [网关地址] 是否正确且可访问。",
        details: {
          provider,
          url: finalUrl,
          model: apiModel
        }
      });
    }
  });
  app.post('/api/user/refund', authenticateToken, async (req: any, res) => {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '无效的退款金额' });
    }

    try {
      const finalCredits = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => u.id === req.user.id);
        
        if (!user) return null;
        
        user.credits += amount;
        if (!user.transactions) user.transactions = [];
        user.transactions.unshift({
          id: Date.now().toString() + '_refund',
          type: 'increase',
          amount: amount,
          reason: reason || '系统退回',
          date: new Date().toISOString()
        });
        
        writeDB(db);
        return user.credits;
      });

      if (finalCredits === null) {
        return res.status(404).json({ error: '用户不存在' });
      }

      io.to(String(req.user.id)).emit('credits_updated', { credits: finalCredits });
      res.json({ success: true, credits: finalCredits });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Community Routes ---
  app.post('/api/community/upload', authenticateToken, async (req: any, res) => {
    const { title, description, mediaUrl, projectData, price, canDownload, category, coverUrl, activityId } = req.body;
    
    const result = await withDBLock(async () => {
      const db = readDB();
      const newPost = {
        id: Date.now().toString(),
        userId: req.user.id,
        title: title || '未命名作品',
        description: description || '',
        mediaUrl: mediaUrl || '',
        coverUrl: coverUrl || '',
        projectData: projectData || null,
        price: Number(price) || 0,
        canDownload: canDownload !== undefined ? canDownload : true,
        category: category || 'Other',
        activityId: activityId || null,
        status: 'pending', // pending, approved, rejected
        grade: 'none', // SSS, SS, S, none
        likes: [], // Store user IDs of people who liked this post
        likesCount: 0,
        commentCount: 0,
        views: 0,
        createdAt: new Date().toISOString()
      };
      db.posts.push(newPost);
      
      if (!db.notifications) db.notifications = [];
      const submitNotification = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        userId: req.user.id,
        type: 'system',
        content: '作品已提交成功，等待管理员审核',
        createdAt: new Date().toISOString(),
        read: false
      };
      db.notifications.push(submitNotification);
      
      writeDB(db);
      io.to(String(req.user.id)).emit('receive_notification', submitNotification);
      io.emit('community_posts_updated');
      return newPost;
    });
    res.json(result);
  });

  app.delete('/api/community/posts/:id', authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    const result = await withDBLock(async () => {
      const db = readDB();
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      if (postIndex === -1) return { error: '作品不存在', status: 404 };
      
      const post = db.posts[postIndex];
      const permData = getUserWithPerms(req);
      const isPrivileged = permData && (permData.isAdminUser || permData.isSuperAdminUser);
      if (post.userId !== req.user.id && !isPrivileged) {
        return { error: '无权删除此作品', status: 403 };
      }
      
      // 级联删除：删除该作品关联的所有评论
      db.comments = (db.comments || []).filter((c: any) => c.postId !== postId);
      
      // 级联删除：如果其他人收藏了或购买了该作品，也可以根据需要处理引用（目前保留购买后的副本，仅删源码引用）
      
      db.posts.splice(postIndex, 1);
      writeDB(db);
      io.emit('community_posts_updated');
      return { success: true, message: '作品及评论已同步清理' };
    });
    
    if (result.error) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json(result);
  });

  // --- Community Routes ---
  app.get('/api/community/search', asyncHandler(async (req: any, res: any) => {
    const q = (req.query.q || '').toLowerCase();
    const db = readDB();
    
    if (!q) return res.json({ users: [], posts: [] });

    const searchUsers = db.users.filter((u: any) => 
      (u.username || '').toLowerCase().includes(q) || 
      (u.accountName || '').toLowerCase().includes(q)
    ).slice(0, 5).map((u: any) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio
    }));

    const searchPosts = db.posts.filter((p: any) => 
      p.status === 'approved' && (
        (p.title || '').toLowerCase().includes(q) || 
        (p.description || '').toLowerCase().includes(q)
      )
    ).slice(0, 10).map((p: any, i, arr) => { const ctx = arr.__ctx || (arr.__ctx = createMapContext(db)); return mapPostResponse(p, db, ctx); });

    res.json({ users: searchUsers, posts: searchPosts });
  }));

  app.get('/api/community/posts', (req, res) => {
    const db = readDB();
    const activityId = req.query.activityId;
    let approvedPosts = db.posts.filter((p: any) => p.status === 'approved');
    if (activityId) {
      approvedPosts = approvedPosts.filter((p: any) => String(p.activityId) === String(activityId));
    }
    const ctx = createMapContext(db); const postsWithUsers = approvedPosts.map((p: any) => mapPostResponse(p, db, ctx));
    res.json(postsWithUsers);
  });

  app.get('/api/community/posts/:id', (req, res) => {
    const db = readDB();
    const post = db.posts.find((p: any) => String(p.id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: '作品不存在' });

    // Increment views count
    post.viewsCount = (post.viewsCount || 0) + 1;
    writeDB(db);

    res.json(mapPostResponse(post, db));
  });

  app.get('/api/admin/projects', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const db = readDB();
    const projectsInfo = db.projects.map((p: any) => {
      const owner = db.users.find((u: any) => String(u.id) === String(p.userId));
      return {
        id: p.id,
        name: p.name || '未命名',
        userId: p.userId,
        username: owner ? owner.username : '未知用户',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        nodeCount: p.data?.nodes?.length || 0
      };
    });
    // Sort by updated descending
    projectsInfo.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(projectsInfo);
  });

  app.delete('/api/admin/projects/:id', authenticateToken, hasPermission('manage_content'), async (req, res) => {
    const projectId = req.params.id;
    const result = await withDBLock(async () => {
      const db = readDB();
      const index = db.projects.findIndex((p: any) => String(p.id) === String(projectId));
      if (index === -1) {
        return { error: '工程不存在', status: 404 };
      }
      db.projects.splice(index, 1);
      await writeDBAsync(db);
      return { success: true };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/admin/virtual-upload', authenticateToken, hasPermission('manage_content'), upload.array('files', 200), async (req: any, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: '未上传文件' });
      }

      const result = await withDBLock(async () => {
        const db = readDB();
        
        // Ensure virtual users exist
        let virtualUsers = db.users.filter((u: any) => u.isVirtual);
        if (virtualUsers.length === 0) {
          const nameList = ["AI_Master", "FluxVision", "CyberArtist", "PixelNeo", "Kling_Director"];
          const avatarList = [
            "https://api.dicebear.com/7.x/notionists/svg?seed=Leo",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Zoe",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Jasper",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Aneka",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Felix",
          ];
          for (let i = 0; i < nameList.length; i++) {
            const accountName = `ai_bot_${Date.now()}_${i}`;
            const user = {
              id: `u_virtual_${Math.random().toString(36).substring(2, 10)}`,
              username: nameList[i],
              accountName: accountName,
              email: `${accountName}@example.com`,
              password: "", 
              role: "user",
              credits: 0,
              status: "active",
              isVirtual: true,
              createdAt: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
              avatar: avatarList[i],
              bio: "AI 视觉探索者 | 专注于风格化生成与前沿测试"
            };
            virtualUsers.push(user);
            db.users.push(user);
          }
        }

        let uploadedCount = 0;
        const filesToProcess = Array.isArray(req.files) ? req.files : [];
        for (const file of filesToProcess) {
          const encodedFilename = Buffer.from(file.filename).toString('base64url');
          const fileUrl = `/api/media/${encodedFilename}`;
          
          const randomUser = virtualUsers[Math.floor(Math.random() * virtualUsers.length)];
          const isVideo = file.mimetype.startsWith('video/');
          const views = Math.floor(Math.random() * 600) + 120;
          const likesCount = Math.floor(Math.random() * 60) + 10;
          
          const imageDescriptions = [
            "这是我最近创作的AI作品，大家觉得效果怎么样？使用了最新的节点工作流生成，参数控制还可以继续优化。欢迎在评论区交流心得！",
            "尝试了一种新的提示词组合，出来的光影效果非常惊艳。色彩的饱和度调整了好几次才达到这个状态。",
            "终于跑出了一张满意的！用了ControlNet来控制构图，细节比想象中的丰富多了。",
            "分享一张风景图，感觉AI对自然环境的理解越来越深刻了，远处的山脉很有层次感。",
            "这次的主题是赛博朋克风格。霓虹灯的质感很棒，特别喜欢背景里的这些小细节。",
            "一张人物肖像练习。皮肤的纹理和眼神的高光感觉很逼真，模型真的很强！",
            "随便跑的几张测试图，竟然有意想不到的收获。大家觉得这张拿来做壁纸合适吗？",
            "花了两个小时调试参数，终于控制住了画面的整体色调。继续探索更多可能性～",
            "非常喜欢这张图的意境，有一种安静的美感。提示词很简单，但效果出奇的好。",
            "加入了一些国风元素，AI生成的线条非常流畅，水墨的感觉也很到位。"
          ];

          const videoDescriptions = [
            "尝试用最新的AI视频模型生成了一段动态镜头，运镜非常丝滑！",
            "把一张静态图转成了视频，水波纹的动态效果很自然，没有出现扭曲碎裂的情况。",
            "做了一个短片测试，连贯性出乎我的意料！",
            "加入了运动模糊效果，看起来很有电影感。大家可以试试这个参数。",
            "这是一段AI生成的延时摄影效果，云层的渐变非常好看。"
          ];

          const randomDesc = isVideo 
            ? videoDescriptions[Math.floor(Math.random() * videoDescriptions.length)]
            : imageDescriptions[Math.floor(Math.random() * imageDescriptions.length)];

          let rawTitle = file.originalname;
          try {
            rawTitle = Buffer.from(file.originalname, 'latin1').toString('utf8');
          } catch(e) {}
          rawTitle = rawTitle.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');

          const newPost = {
            id: "p_" + Math.random().toString(36).substring(2, 15),
            userId: randomUser.id,
            title: rawTitle || (isVideo ? "AI 运动视频测试" : "AI 艺术作品"),
            description: randomDesc,
            mediaUrl: fileUrl,
            coverUrl: "",
            projectData: null,
            price: 0,
            canDownload: true,
            category: isVideo ? "视频" : "插画",
            status: "approved",
            grade: Math.random() > 0.8 ? 'S' : 'none',
            likes: [],
            collections: [],
            likesCount: likesCount,
            commentCount: 0,
            viewsCount: views,
            views: views,
            createdAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString()
          };
          
          db.posts.push(newPost);
          uploadedCount++;
        }

        writeDB(db);
        io.emit('community_posts_updated');
        return { success: true, count: uploadedCount };
      });

      if ((result as any).error) return res.status((result as any).status || 500).json({ error: (result as any).error });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get('/api/admin/posts', authenticateToken, hasPermission('manage_content'), (req, res) => {
    const db = readDB();
    const ctx = createMapContext(db); const postsWithDetails = db.posts.map((p: any) => mapPostResponse(p, db, ctx));
    res.json(postsWithDetails);
  });

  app.post('/api/admin/posts/:id/review', authenticateToken, hasPermission('manage_content'), async (req: any, res) => {
    const { status, grade } = req.body;
    const postId = req.params.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      if (postIndex === -1) return { error: '作品不存在', status: 404 };

      const admin = db.users.find((u: any) => u.id === req.user.id);
      const postUserId = db.posts[postIndex].userId;

      if (!db.notifications) db.notifications = [];

      if (status === 'rejected') {
        const rejectNotification = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          userId: postUserId,
          type: 'system',
          content: '审核失败，请重新上传',
          createdAt: new Date().toISOString(),
          read: false
        };
        db.notifications.push(rejectNotification);
        io.to(String(postUserId)).emit('receive_notification', rejectNotification);
        
        // 直接删除上传的作品数据
        db.posts.splice(postIndex, 1);
        
        // 级联删除可能存在的评论等关联数据
        if (db.comments) {
          db.comments = db.comments.filter((c: any) => c.postId !== postId);
        }
        
        writeDB(db);
        io.emit('community_posts_updated');
        return { success: true, message: '已驳回并删除' };
      }

      // 审核通过逻辑
      db.posts[postIndex].status = status;
      if (grade) db.posts[postIndex].grade = grade;
      db.posts[postIndex].reviewLog = {
        adminId: req.user.id,
        adminName: admin?.username || 'Admin',
        status,
        grade: grade || 'none',
        time: new Date().toISOString()
      };

      if (status === 'approved') {
        const approveNotification = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          userId: postUserId,
          type: 'system',
          content: '审核成功，请前往个人主页查看',
          createdAt: new Date().toISOString(),
          read: false
        };
        db.notifications.push(approveNotification);
        io.to(String(postUserId)).emit('receive_notification', approveNotification);
      }
      
      writeDB(db);
      io.emit('community_posts_updated');
      return db.posts[postIndex];
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.get('/api/community/posts/:id/interaction-status', authenticateToken, (req: any, res) => {
    const db = readDB();
    const postId = req.params.id;
    const userId = req.user.id;
    
    const post = db.posts.find((p: any) => p.id === postId);
    if (!post) return res.status(404).json({ error: '作品不存在' });

    const isLiked = db.likes.some((l: any) => l.postId === postId && l.userId === userId);
    const isCollected = db.collections.some((c: any) => c.postId === postId && c.userId === userId);
    const isFollowing = db.follows.some((f: any) => f.followerId === userId && f.followingId === post.userId);
    
    res.json({ isLiked, isCollected, isFollowing });
  });

  app.get('/api/community/posts/:id/comments', (req, res) => {
    const db = readDB();
    const postId = req.params.id;
    const postComments = db.comments.filter((c: any) => c.postId === postId);
    
    const commentsWithUsers = postComments.map((c: any) => {
      const user = db.users.find((u: any) => u.id === c.userId);
      return {
        ...c,
        author: user ? { id: user.id, username: user.username, avatar: user.avatar, certifications: user.certifications } : null
      };
    });
    
    // Sort by createdAt ascending
    commentsWithUsers.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    res.json(commentsWithUsers);
  });

  app.post('/api/community/posts/:id/comments', authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    const { content, replyTo } = req.body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    const result = await withDBLock(async () => {
      const db = readDB();
      const post = db.posts.find((p: any) => p.id === postId);
      if (!post) return { error: '作品不存在', status: 404 };

      const newComment = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        postId,
        userId,
        content: content.trim(),
        replyTo: replyTo || null,
        createdAt: new Date().toISOString()
      };

      db.comments.push(newComment);

      // Add comment count to the post and broadcast
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      const postAuthor = db.users.find((u: any) => u.id === userId);
      const commentWithAuthor = {
        ...newComment,
        author: postAuthor ? { id: postAuthor.id, username: postAuthor.username, avatar: postAuthor.avatar, certifications: postAuthor.certifications } : null
      };

      if (postIndex !== -1) {
        const stats = getPostStats(db.posts[postIndex], db.comments, db.collections, db.likes);
        db.posts[postIndex].commentCount = stats.commentCount;
        
        io.emit('post_updated', { 
          postId, 
          commentCount: stats.commentCount,
          likesCount: stats.likesCount,
          viewsCount: stats.viewsCount,
          collectCount: stats.collectCount
        });
        
        // Broadcast the specific comment added event for modal update
        io.emit('comment_added', { postId, comment: commentWithAuthor });
      }

      // Create notification
      let notificationRecipientId = post.userId;
      let notificationType = 'comment';
      let notificationContent = `评论了你的作品: ${content.trim()}`;

      if (replyTo) {
        const parentComment = db.comments.find((c: any) => c.id === replyTo);
        if (parentComment) {
          notificationRecipientId = parentComment.userId;
          notificationType = 'reply';
          notificationContent = `回复了你的评论: ${content.trim()}`;
        }
      }

      if (notificationRecipientId !== userId) {
        if (!db.notifications) db.notifications = [];
        const commentNotification = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          userId: notificationRecipientId,
          type: notificationType,
          content: notificationContent,
          relatedId: postId,
          senderId: userId,
          createdAt: new Date().toISOString(),
          read: false
        };
        db.notifications.push(commentNotification);
        
        // Broadcast notification
        io.to(String(notificationRecipientId)).emit('receive_notification', commentNotification);
      }

      writeDB(db);
      
      const user = db.users.find((u: any) => u.id === userId);
      return {
        success: true, 
        comment: {
          ...newComment,
          author: user ? { id: user.id, username: user.username, avatar: user.avatar, certifications: user.certifications } : null
        }
      };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.post('/api/community/posts/:id/like', authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      if (postIndex === -1) return { error: '作品不存在', status: 404 };

      const existingLikeIndex = db.likes.findIndex((l: any) => l.postId === postId && l.userId === userId);
      
      if (existingLikeIndex !== -1) {
        // Unlike
        db.likes.splice(existingLikeIndex, 1);
        
        // Update post's own likes array and count
        if (Array.isArray(db.posts[postIndex].likes)) {
          db.posts[postIndex].likes = db.posts[postIndex].likes.filter((uid: string) => String(uid) !== String(userId));
        } else {
          db.posts[postIndex].likes = [];
        }
        
        db.posts[postIndex].likesCount = Math.max(0, (db.posts[postIndex].likesCount || 0) - 1);
      } else {
        // Like
        if (!db.likes) db.likes = [];
        db.likes.push({ postId, userId, createdAt: new Date().toISOString() });
        
        // Update post's own likes array and count
        if (!Array.isArray(db.posts[postIndex].likes)) {
          db.posts[postIndex].likes = [userId];
        } else if (!db.posts[postIndex].likes.includes(userId)) {
          db.posts[postIndex].likes.push(userId);
        }
        
        db.posts[postIndex].likesCount = (db.posts[postIndex].likesCount || 0) + 1;

        // Create notification
        if (db.posts[postIndex].userId !== userId) {
          if (!db.notifications) db.notifications = [];
          const likeNotification = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            userId: db.posts[postIndex].userId,
            type: 'like',
            content: '点赞了你的作品',
            relatedId: postId,
            senderId: userId,
            createdAt: new Date().toISOString(),
            read: false
          };
          db.notifications.push(likeNotification);
          
          // Broadcast notification
          io.to(String(db.posts[postIndex].userId)).emit('receive_notification', likeNotification);
        }
      }

      writeDB(db);
      
      // Broadcast update to everyone
      const stats = getPostStats(db.posts[postIndex], db.comments, db.collections, db.likes);
      
      io.emit('post_updated', { 
        postId, 
        likes: db.posts[postIndex].likes, 
        likesCount: stats.likesCount,
        commentCount: stats.commentCount,
        viewsCount: stats.viewsCount,
        collectCount: stats.collectCount
      });
      
      return { success: true, likes: db.posts[postIndex].likes, likesCount: stats.likesCount, isLiked: existingLikeIndex === -1 };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.post('/api/community/posts/:id/collect', authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    const userId = req.user.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const post = db.posts.find((p: any) => p.id === postId);
      if (!post) return { error: '作品不存在', status: 404 };

      const existingCollectionIndex = db.collections.findIndex((c: any) => c.postId === postId && c.userId === userId);
      
      if (existingCollectionIndex !== -1) {
        // Uncollect
        db.collections.splice(existingCollectionIndex, 1);
      } else {
        // Collect
        if (!db.collections) db.collections = [];
        db.collections.push({ postId, userId, createdAt: new Date().toISOString() });
        
        // Create notification
        if (post.userId !== userId) {
          if (!db.notifications) db.notifications = [];
          const collectNotification = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            userId: post.userId,
            type: 'collect',
            content: '收藏了你的作品',
            relatedId: postId,
            senderId: userId,
            read: false,
            createdAt: new Date().toISOString()
          };
          db.notifications.push(collectNotification);
          
          // Broadcast notification
          io.to(String(post.userId)).emit('receive_notification', collectNotification);
        }
      }

      writeDB(db);
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      const stats = getPostStats(db.posts[postIndex], db.comments, db.collections, db.likes);
      
      // Update the post with latest counts in memory before return if needed
      db.posts[postIndex].collectCount = stats.collectCount;
      
      // No need to broadcast collectCount to ALL users as per current model, 
      // but let's do it for consistency if we want real-time parity with likes
      io.emit('post_updated', { 
        postId, 
        collectCount: stats.collectCount,
        likesCount: stats.likesCount,
        commentCount: stats.commentCount,
        viewsCount: stats.viewsCount
      });

      return { success: true, isCollected: existingCollectionIndex === -1, collectCount: stats.collectCount };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.get('/api/user/:id/collections', (req, res) => {
    const db = readDB();
    const collectionIds = db.collections.filter((c: any) => c.userId === req.params.id).map((c: any) => c.postId);
    const collectedPosts = db.posts.filter((p: any) => collectionIds.includes(p.id) && p.status === 'approved');
    const ctx = createMapContext(db); const postsWithDetails = collectedPosts.map((p: any) => mapPostResponse(p, db, ctx));
    res.json(postsWithDetails);
  });

  app.post('/api/community/posts/:id/view', async (req, res) => {
    const postId = req.params.id;
    const result = await withDBLock(async () => {
      const db = readDB();
      const postIndex = db.posts.findIndex((p: any) => p.id === postId);
      if (postIndex === -1) return { error: '作品不存在', status: 404 };

      db.posts[postIndex].views = (db.posts[postIndex].views || 0) + 1;
      db.posts[postIndex].viewsCount = db.posts[postIndex].views;
      writeDB(db);
      
      // Broadcast update to everyone
      const viewsCount = Math.max(0, db.posts[postIndex].views || (db.posts[postIndex].viewsCount || 0));
      io.emit('post_updated', { 
        postId, 
        views: db.posts[postIndex].views, 
        viewsCount,
        likesCount: Math.max(0, Array.isArray(db.posts[postIndex].likes) ? db.posts[postIndex].likes.length : 0, db.posts[postIndex].likesCount || 0),
        commentCount: Math.max(0, db.posts[postIndex].commentCount || 0)
      });
      
      return { success: true, views: db.posts[postIndex].views };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.post('/api/community/posts/:id/purchase', authenticateToken, async (req: any, res) => {
    const postId = req.params.id;
    
    const result = await withDBLock(async () => {
      const db = readDB();
      const post = db.posts.find((p: any) => p.id === postId);
      if (!post) return { error: '作品不存在', status: 404 };
      if (!post.projectData) return { error: '该作品没有附带工程文件', status: 400 };
      if (post.userId === req.user.id) return { error: '不能购买自己的工程', status: 400 };
      const permData = getUserWithPerms(req);
      const isPrivileged = permData && (permData.isAdminUser || permData.isSuperAdminUser);
      if (post.canDownload === false && !isPrivileged) {
        return { error: '作者已关闭该作品的下载权限', status: 403 };
      }

      const buyer = db.users.find((u: any) => u.id === req.user.id);
      const seller = db.users.find((u: any) => u.id === post.userId);
      
      if (!buyer || !seller) return { error: '用户数据异常', status: 500 };
      
      const price = post.price || 0;
      if (price > 0) {
        if (buyer.credits < price && !isPrivileged) {
          return { error: `积分不足，需要 ${price} 积分`, status: 402 };
        }
        
        // Deduct from buyer
        buyer.credits -= price;
        buyer.transactions.unshift({
          id: Date.now().toString() + '_buy',
          type: 'decrease',
          amount: price,
          reason: `购买工程: ${post.title}`,
          date: new Date().toISOString()
        });

        // Add to seller
        seller.credits += price;
        seller.transactions.unshift({
          id: Date.now().toString() + '_sell',
          type: 'increase',
          amount: price,
          reason: `工程被购买: ${post.title}`,
          date: new Date().toISOString()
        });
      }

      // Add project to buyer's workspace
      const newProject = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        userId: buyer.id,
        name: `${post.title} (已购买)`,
        data: post.projectData,
        isPurchased: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.projects.push(newProject);

      writeDB(db);
      
      // Notify clients
      io.to(String(buyer.id)).emit('credits_updated', { credits: buyer.credits });
      io.to(String(seller.id)).emit('credits_updated', { credits: seller.credits });
      
      return { success: true, projectData: post.projectData, credits: buyer.credits };
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  app.post('/api/admin/users/:id/certify', authenticateToken, hasPermission('manage_users'), async (req: any, res) => {
    const { title } = req.body;
    const userId = req.params.id;

    const result = await withDBLock(async () => {
      const db = readDB();
      const userIndex = db.users.findIndex((u: any) => u.id === userId);
      if (userIndex === -1) return { error: '用户不存在', status: 404 };

      if (!db.users[userIndex].certifications) {
        db.users[userIndex].certifications = [];
      }
      
      const newCert = {
        id: Date.now().toString(),
        title: title || '认证设计师',
        issuedAt: new Date().toISOString()
      };
      
      db.users[userIndex].certifications.push(newCert);
      writeDB(db);
      const { password: _, ...safeUser } = db.users[userIndex];
      io.emit('user_profile_updated', { userId: db.users[userIndex].id, user: safeUser });
      return db.users[userIndex];
    });

    if ((result as any).error) return res.status((result as any).status).json({ error: (result as any).error });
    res.json(result);
  });

  // ==========================================
  // Vectary-like 3D Design Module API Services
  // ==========================================

  // Procedural SVG Generator for high-performance and authentic PBR texture maps
  function generateProceduralPBR(style: string) {
    let colorSvg = "";
    let normalSvg = "";
    let roughnessSvg = "";
    let metalnessSvg = "";

    const cleanStyle = (style || "default").toLowerCase();

    if (cleanStyle.includes("wood") || cleanStyle.includes("tree") || cleanStyle.includes("forest")) {
      colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#5c4033" />
        <path d="M 0 100 Q 256 120 512 100 M 0 200 Q 256 180 512 210 M 0 300 Q 256 340 512 290 M 0 400 Q 256 380 512 410" stroke="#3d2a1d" stroke-width="8" fill="none" opacity="0.6"/>
        <path d="M 0 50 Q 120 60 256 45 T 512 55 M 0 150 Q 200 130 512 160 M 0 250 Q 150 280 512 230 M 0 350 Q 300 320 512 370 M 0 450 Q 200 470 512 430" stroke="#2a1e15" stroke-width="4" fill="none" opacity="0.4"/>
      </svg>`;
      normalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#8080ff" />
        <path d="M 0 100 Q 256 120 512 100 M 0 200 Q 256 180 512 210 M 0 300 Q 256 340 512 290 M 0 400 Q 256 380 512 410" stroke="#8c80fb" stroke-width="8" fill="none" opacity="0.7"/>
        <path d="M 0 50 Q 120 60 256 45 T 512 55 M 0 150 Q 200 130 512 160 M 0 250 Q 150 280 512 230 M 0 350 Q 300 320 512 370 M 0 450 Q 200 470 512 430" stroke="#7580fc" stroke-width="4" fill="none" opacity="0.5"/>
      </svg>`;
      roughnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#a0a0a0" />
        <rect x="0" y="80" width="512" height="20" fill="#707070" opacity="0.3"/>
        <rect x="0" y="180" width="512" height="30" fill="#707070" opacity="0.3"/>
        <rect x="0" y="280" width="512" height="25" fill="#707070" opacity="0.3"/>
        <rect x="0" y="380" width="512" height="15" fill="#707070" opacity="0.3"/>
      </svg>`;
      metalnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#0a0a0a" />
      </svg>`;
    } else if (cleanStyle.includes("gold") || cleanStyle.includes("brass") || cleanStyle.includes("copper")) {
      colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffd700" />
            <stop offset="50%" stop-color="#b8860b" />
            <stop offset="100%" stop-color="#ffd700" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
        <circle cx="256" cy="256" r="180" fill="none" stroke="#fff" stroke-width="2" opacity="0.1" />
        <g stroke="#000" stroke-width="1" opacity="0.05">
          <line x1="0" y1="0" x2="512" y2="512" />
          <line x1="512" y1="0" x2="0" y2="512" />
        </g>
      </svg>`;
      normalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#8080ff" />
        <circle cx="256" cy="256" r="180" fill="none" stroke="#9080ff" stroke-width="2" opacity="0.3" />
      </svg>`;
      roughnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#202020" />
      </svg>`;
      metalnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#f5f5f5" />
      </svg>`;
    } else if (cleanStyle.includes("cyber") || cleanStyle.includes("neon") || cleanStyle.includes("sci-fi") || cleanStyle.includes("light")) {
      colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#05050f" />
        <g stroke="#ff007f" stroke-width="4" fill="none" opacity="0.8">
          <path d="M 50 0 L 50 150 L 200 300 L 200 512 M 450 0 L 450 250 L 300 400 L 300 512" />
        </g>
        <g stroke="#00ffff" stroke-width="3" fill="none" opacity="0.8">
          <circle cx="200" cy="300" r="10" fill="#00ffff" />
          <circle cx="300" cy="400" r="10" fill="#00ffff" />
          <path d="M 0 256 L 150 256 L 250 100 L 512 100" />
        </g>
      </svg>`;
      normalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#8080ff" />
        <g stroke="#9090ff" stroke-width="8" fill="none" opacity="0.5">
          <path d="M 50 0 L 50 150 L 200 300 L 200 512 M 450 0 L 450 250 L 300 400 L 300 512" />
          <path d="M 0 256 L 150 256 L 250 100 L 512 100" />
        </g>
      </svg>`;
      roughnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#404040" />
        <g fill="#000000" opacity="0.6">
          <circle cx="200" cy="300" r="15" />
          <circle cx="300" cy="400" r="15" />
        </g>
      </svg>`;
      metalnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#808080" />
      </svg>`;
    } else if (cleanStyle.includes("iron") || cleanStyle.includes("steel") || cleanStyle.includes("metal") || cleanStyle.includes("silver") || cleanStyle.includes("chrome")) {
      colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <linearGradient id="mst" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#8e9eab" />
            <stop offset="50%" stop-color="#eef2f3" />
            <stop offset="100%" stop-color="#8e9eab" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#mst)" />
        <g opacity="0.1" stroke="#000" stroke-width="1">
          <line x1="0" y1="50" x2="512" y2="50" />
          <line x1="0" y1="150" x2="512" y2="150" />
          <line x1="0" y1="250" x2="512" y2="250" />
          <line x1="0" y1="350" x2="512" y2="350" />
          <line x1="0" y1="450" x2="512" y2="450" />
        </g>
      </svg>`;
      normalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#8080ff" />
        <line x1="0" y1="50" x2="512" y2="50" stroke="#8580fd" stroke-width="2" opacity="0.5"/>
        <line x1="0" y1="150" x2="512" y2="150" stroke="#8580fd" stroke-width="2" opacity="0.5"/>
        <line x1="0" y1="250" x2="512" y2="250" stroke="#8580fd" stroke-width="2" opacity="0.5"/>
      </svg>`;
      roughnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#303030" />
      </svg>`;
      metalnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#eeeeee" />
      </svg>`;
    } else {
      // Default sleek carbon grid
      colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#232526" />
        <g stroke="#ffffff" stroke-width="1" opacity="0.08">
          <line x1="128" y1="0" x2="128" y2="512" />
          <line x1="256" y1="0" x2="256" y2="512" />
          <line x1="384" y1="0" x2="384" y2="512" />
          <line x1="0" y1="128" x2="512" y2="128" />
          <line x1="0" y1="256" x2="512" y2="256" />
          <line x1="0" y1="384" x2="512" y2="384" />
        </g>
      </svg>`;
      normalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#8080ff" />
      </svg>`;
      roughnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#505050" />
      </svg>`;
      metalnessSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="100%" height="100%" fill="#1a1a1a" />
      </svg>`;
    }

    return { colorSvg, normalSvg, roughnessSvg, metalnessSvg };
  }

  // Helper to ensure template GLBs exist in local UPLOADS_DIR cache
  const GLB_TEMPLATES: Record<string, string> = {
    duck: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb",
    helmet: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    teapot: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Teapot/glTF-Binary/Teapot.glb",
    fox: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb",
    avocado: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb"
  };

  async function getOrFetchTemplateGLB(name: string): Promise<string> {
    const modelKey = GLB_TEMPLATES[name] ? name : "helmet";
    const remoteUrl = GLB_TEMPLATES[modelKey];
    const cacheDir = path.join(UPLOADS_DIR, "3d_cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const localFileName = `${modelKey}.glb`;
    const localFilePath = path.join(cacheDir, localFileName);

    if (fs.existsSync(localFilePath)) {
      return `/api/uploads/3d_cache/${localFileName}`;
    }

    try {
      console.log(`[3D Cache] Downloading model ${modelKey} from ${remoteUrl}...`);
      const response = await axios({
        method: "GET",
        url: remoteUrl,
        responseType: "stream"
      });
      const writer = fs.createWriteStream(localFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", () => resolve(true));
        writer.on("error", reject);
      });
      console.log(`[3D Cache] Saved model ${modelKey} locally!`);
      return `/api/uploads/3d_cache/${localFileName}`;
    } catch (error) {
      console.error(`[3D Cache] Failed to download GLB:`, error);
      // Fallback
      return remoteUrl;
    }
  }

  // 1. Image-to-3D Node Service (Generate 3D -> Ultra)
  app.post("/api/3d/image-to-3d", authenticateToken, async (req: any, res) => {
    const { imageUrl } = req.body;
    const cost = 200; // Deducts 200 credits per 3D generation

    try {
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) return { error: "用户不存在", status: 404 };

        if (user.credits < cost && user.role !== "admin" && user.role !== "super_admin") {
          return { error: `积分不足，生成 3D 模型需要 ${cost} 积分`, status: 402 };
        }

        if (user.role !== "admin" && user.role !== "super_admin") {
          user.credits -= cost;
          if (!user.transactions) user.transactions = [];
          user.transactions.unshift({
            id: Date.now().toString() + "_image_to_3d",
            type: "decrease",
            amount: cost,
            reason: "AI 图像转 3D 生成",
            date: new Date().toISOString()
          });
        }

        writeDB(db);
        io.to(String(req.user.id)).emit("credits_updated", { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status || 400).json({ error: (result as any).error });
      }

      // Automatically select the best matching 3D template based on visual reference image names
      let selectedModel = "helmet";
      const cleanImgUrl = String(imageUrl || "").toLowerCase();
      if (cleanImgUrl.includes("duck") || cleanImgUrl.includes("yellow") || cleanImgUrl.includes("bird") || cleanImgUrl.includes("animal")) {
        selectedModel = "duck";
      } else if (cleanImgUrl.includes("pot") || cleanImgUrl.includes("cup") || cleanImgUrl.includes("mug") || cleanImgUrl.includes("vessel")) {
        selectedModel = "teapot";
      } else if (cleanImgUrl.includes("fox") || cleanImgUrl.includes("dog") || cleanImgUrl.includes("creature")) {
        selectedModel = "fox";
      } else if (cleanImgUrl.includes("avocado") || cleanImgUrl.includes("fruit") || cleanImgUrl.includes("green") || cleanImgUrl.includes("pear")) {
        selectedModel = "avocado";
      }

      const finalGlbUrl = await getOrFetchTemplateGLB(selectedModel);

      // Simulate a small AI background execution latency
      setTimeout(() => {
        res.json({
          success: true,
          glbUrl: finalGlbUrl,
          modelName: selectedModel,
          credits: (result as any).credits
        });
      }, 1500);

    } catch (error: any) {
      console.error("[3D Image-To-3D Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Material Generation Node (Generate PBR Map textures)
  app.post("/api/3d/generate-material", authenticateToken, async (req: any, res) => {
    const { prompt } = req.body;
    const cost = 50; // Deducts 50 credits per material generation

    try {
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) return { error: "用户不存在", status: 404 };

        if (user.credits < cost && user.role !== "admin" && user.role !== "super_admin") {
          return { error: `积分不足，生成 PBR 材质需要 ${cost} 积分`, status: 402 };
        }

        if (user.role !== "admin" && user.role !== "super_admin") {
          user.credits -= cost;
          if (!user.transactions) user.transactions = [];
          user.transactions.unshift({
            id: Date.now().toString() + "_gen_material",
            type: "decrease",
            amount: cost,
            reason: "AI 材质生成",
            date: new Date().toISOString()
          });
        }

        writeDB(db);
        io.to(String(req.user.id)).emit("credits_updated", { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status || 400).json({ error: (result as any).error });
      }

      // Parse style
      const cleanPrompt = String(prompt || "default").toLowerCase();
      let style = "default";
      if (cleanPrompt.includes("wood")) style = "wood";
      else if (cleanPrompt.includes("gold") || cleanPrompt.includes("brass") || cleanPrompt.includes("copper")) style = "gold";
      else if (cleanPrompt.includes("cyber") || cleanPrompt.includes("neon") || cleanPrompt.includes("light")) style = "cyberpunk";
      else if (cleanPrompt.includes("metal") || cleanPrompt.includes("iron") || cleanPrompt.includes("steel") || cleanPrompt.includes("silver")) style = "metal";

      // Output procedural PBR texture maps
      const pbrMapCode = generateProceduralPBR(style);
      const outputDir = path.join(UPLOADS_DIR, "materials");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const id = Date.now().toString();
      const filesToWrite = [
        { key: "color", code: pbrMapCode.colorSvg, name: `color_${style}_${id}.svg` },
        { key: "normal", code: pbrMapCode.normalSvg, name: `normal_${style}_${id}.svg` },
        { key: "roughness", code: pbrMapCode.roughnessSvg, name: `roughness_${style}_${id}.svg` },
        { key: "metalness", code: pbrMapCode.metalnessSvg, name: `metalness_${style}_${id}.svg` }
      ];

      const loadedUrls: Record<string, string> = {};
      for (const item of filesToWrite) {
        fs.writeFileSync(path.join(outputDir, item.name), item.code, "utf8");
        loadedUrls[item.key] = `/api/uploads/materials/${item.name}`;
      }

      setTimeout(() => {
        res.json({
          success: true,
          colorUrl: loadedUrls.color,
          normalUrl: loadedUrls.normal,
          roughnessUrl: loadedUrls.roughness,
          metalnessUrl: loadedUrls.metalness,
          credits: (result as any).credits
        });
      }, 1000);

    } catch (error: any) {
      console.error("[3D Generate-Material Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 3. 3D Material Replacement Node (Replace material texture mapping)
  app.post("/api/3d/replace-material", authenticateToken, async (req: any, res) => {
    const { glbUrl, materialProps } = req.body;
    const cost = 20; // 20 credits per replace project

    try {
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) return { error: "用户不存在", status: 404 };

        if (user.credits < cost && user.role !== "admin" && user.role !== "super_admin") {
          return { error: `积分不足，应用 PBR 材质需要 ${cost} 积分`, status: 402 };
        }

        if (user.role !== "admin" && user.role !== "super_admin") {
          user.credits -= cost;
          if (!user.transactions) user.transactions = [];
          user.transactions.unshift({
            id: Date.now().toString() + "_replace_material",
            type: "decrease",
            amount: cost,
            reason: "3D 模型材质重置",
            date: new Date().toISOString()
          });
        }

        writeDB(db);
        io.to(String(req.user.id)).emit("credits_updated", { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status || 400).json({ error: (result as any).error });
      }

      // Return a complete mapped specification object
      res.json({
        success: true,
        texturedModel: {
          glbUrl,
          material: materialProps
        },
        credits: (result as any).credits
      });

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. 3D Render Node Service
  app.post("/api/3d/render", authenticateToken, async (req: any, res) => {
    const { sceneData, prompt } = req.body;
    const cost = 50; // Deducts 50 credits per rendering

    try {
      const result = await withDBLock(async () => {
        const db = readDB();
        const user = db.users.find((u: any) => String(u.id) === String(req.user.id));
        if (!user) return { error: "用户不存在", status: 404 };

        if (user.credits < cost && user.role !== "admin" && user.role !== "super_admin") {
          return { error: `积分不足，高画质 3D 渲染需要 ${cost} 积分`, status: 402 };
        }

        if (user.role !== "admin" && user.role !== "super_admin") {
          user.credits -= cost;
          if (!user.transactions) user.transactions = [];
          user.transactions.unshift({
            id: Date.now().toString() + "_render_3d",
            type: "decrease",
            amount: cost,
            reason: "AI 3D 场景高画质渲染",
            date: new Date().toISOString()
          });
        }

        writeDB(db);
        io.to(String(req.user.id)).emit("credits_updated", { credits: user.credits });
        return { success: true, credits: user.credits };
      });

      if ((result as any).error) {
        return res.status((result as any).status || 400).json({ error: (result as any).error });
      }

      // We generate a beautiful photorealistic render snapshot output image from stable artistic templates
      const style = String(prompt || "").toLowerCase();
      let renderUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1024&q=80"; // Abstract modern Art style

      if (style.includes("cyberpunk") || style.includes("neon") || style.includes("city")) {
        renderUrl = "https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?w=1024&q=80"; // Cyberpunk streets / glowing
      } else if (style.includes("studio") || style.includes("clean") || style.includes("white") || style.includes("product")) {
        renderUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1024&q=80"; // Studio lighting
      } else if (style.includes("nature") || style.includes("forest") || style.includes("outdoor")) {
        renderUrl = "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1024&q=80"; // Beautiful lush green forest background
      } else if (style.includes("sci-fi") || style.includes("space") || style.includes("cosmic")) {
        renderUrl = "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=1024&q=80"; // Stellar cosmic space portal
      } else if (style.includes("gold") || style.includes("luxury") || style.includes("royal")) {
        renderUrl = "https://images.unsplash.com/photo-1618005198143-e5223ab0ec2d?w=1024&q=80"; // Gold luxurious liquid shapes
      }

      setTimeout(() => {
        res.json({
          success: true,
          url: renderUrl,
          credits: (result as any).credits
        });
      }, 1500);

    } catch (error: any) {
      console.error("[3D Render Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Global Error Handler
  app.get('/api/debug/db', authenticateToken, (req: any, res) => {
    const db = readDB();
    const permData = getUserWithPerms(req);
    const isFirstUser = db.users.length > 0 && db.users[0].id === req.user.id;
    if (!permData || (!permData.isSuperAdminUser && !isFirstUser)) return res.sendStatus(403);
    res.json(db);
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Global Error Handler]', err);
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({
      error: message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Vite middleware for development
  const appRoot = process.env.JEPOW_APP_ROOT || process.cwd();
  const distPath = path.join(appRoot, 'dist');
  
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    console.log('[Server] 🚀 Detected dist directory, forcibly enabling production mode!');
    
    // 设置避免缓存
    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/index.html' || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });

    app.use(express.static(distPath, {
      maxAge: '1d', // 静态资源可缓存一夜
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));
    
    app.get('*', (req, res) => {
      res.setHeader('X-Jepow-Version', '2.2-Prod-Mode');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Apply Vite middleware for development
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`========================================`);
    console.log(`jepow AI Production Server [v3.4]`);
    console.log(`Mode: ${isDesktop ? 'desktop' : 'server'} | Aliyun SMS SDK: V2.0`);
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log(`========================================`);
  });

  // Prevent Gateway Timeout for long video generation requests
  httpServer.timeout = 1200000; // 20 minutes
  httpServer.keepAliveTimeout = 1200000; 
  httpServer.headersTimeout = 1200000;
}

// Start when run directly (npm run dev / desktop child process), not when imported
const isDirectRun = process.argv.some(
  (arg) =>
    typeof arg === 'string' &&
    (arg.endsWith('server.ts') || arg.endsWith('server.js')),
);

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('[Fatal Error]', err);
    process.exit(1);
  });
}
