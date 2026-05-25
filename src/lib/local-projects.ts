import type { CloudProject } from '../types';
import { compress, decompress } from 'lz-string';

export interface LocalProjectData {
  nodes: unknown[];
  edges: unknown[];
  canvasColor?: string;
}

export interface LocalProjectRecord {
  id: string;
  userId: string;
  name: string;
  data: LocalProjectData;
  thumbnail?: string;
  thumbnails?: string[];
  createdAt: string;
  updatedAt: string;
}

const IDB_NAME = 'jepow-local-projects';
const IDB_STORE = 'projects';
const IDB_VERSION = 1;

function newProjectId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function extractThumbnails(data: LocalProjectData, fallback?: string) {
  const nodes = data?.nodes || [];
  const urls = nodes
    .filter((n: any) => {
      const t = n?.type;
      return (
        (t === 'mediaNode' && n.data?.url) ||
        (t === 'imageShotNode' && n.data?.shot?.imageUrl) ||
        (t === 'videoShotNode' && n.data?.shot?.videoUrl) ||
        (t === 'imageNode' && n.data?.url)
      );
    })
    .map(
      (n: any) =>
        n.data?.url || n.data?.shot?.imageUrl || n.data?.shot?.videoUrl,
    )
    .filter(Boolean);
  const thumbnails = urls.length > 0 ? urls.slice(-4) : fallback ? [fallback] : [];
  return { thumbnail: thumbnails[thumbnails.length - 1] || fallback || '', thumbnails };
}

function toMeta(record: LocalProjectRecord): CloudProject {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    thumbnail: record.thumbnail,
    thumbnails: record.thumbnails,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
  });
}

async function idbList(userId: string): Promise<CloudProject[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const index = store.index('userId');
    const req = index.getAll(userId);
    req.onsuccess = () => {
      const rows = (req.result as LocalProjectRecord[]) || [];
      resolve(
        rows
          .map(toMeta)
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbRead(userId: string, id: string): Promise<LocalProjectRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => {
      const row = req.result as LocalProjectRecord | undefined;
      if (!row || row.userId !== userId) resolve(null);
      else resolve(row);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbWrite(userId: string, input: {
  id?: string;
  name: string;
  data: LocalProjectData;
  thumbnail?: string;
}): Promise<CloudProject> {
  const now = new Date().toISOString();
  const id = input.id || newProjectId();
  const existing = input.id ? await idbRead(userId, id) : null;
  const thumbs = extractThumbnails(input.data, input.thumbnail);
  const record: LocalProjectRecord = {
    id,
    userId,
    name: input.name || '未命名原型',
    data: input.data,
    thumbnail: thumbs.thumbnail,
    thumbnails: thumbs.thumbnails,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return toMeta(record);
}

async function idbRemove(userId: string, id: string): Promise<void> {
  const existing = await idbRead(userId, id);
  if (!existing) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbRename(userId: string, id: string, name: string): Promise<void> {
  const existing = await idbRead(userId, id);
  if (!existing) throw new Error('项目不存在');
  await idbWrite(userId, {
    id,
    name,
    data: existing.data,
    thumbnail: existing.thumbnail,
  });
}

function desktopProjects() {
  return typeof window !== 'undefined' ? window.jepowDesktop?.projects : undefined;
}

export async function listLocalProjects(userId: string): Promise<CloudProject[]> {
  const fsApi = desktopProjects();
  if (fsApi) return fsApi.list(userId);
  return idbList(userId);
}

export async function loadLocalProject(
  userId: string,
  id: string,
): Promise<LocalProjectRecord | null> {
  const fsApi = desktopProjects();
  if (fsApi) return fsApi.read(userId, id);
  return idbRead(userId, id);
}

export async function saveLocalProject(
  userId: string,
  input: {
    id?: string;
    name: string;
    data: LocalProjectData;
    thumbnail?: string;
  },
): Promise<CloudProject> {
  const fsApi = desktopProjects();
  if (fsApi) {
    const now = new Date().toISOString();
    const id = input.id || newProjectId();
    const existing = input.id ? await fsApi.read(userId, id) : null;
    const thumbs = extractThumbnails(input.data, input.thumbnail);
    const record: LocalProjectRecord = {
      id,
      userId,
      name: input.name,
      data: input.data,
      thumbnail: thumbs.thumbnail,
      thumbnails: thumbs.thumbnails,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    return fsApi.write(userId, record);
  }
  return idbWrite(userId, input);
}

export async function deleteLocalProject(userId: string, id: string): Promise<void> {
  const fsApi = desktopProjects();
  if (fsApi) return fsApi.remove(userId, id);
  return idbRemove(userId, id);
}

export async function renameLocalProject(
  userId: string,
  id: string,
  name: string,
): Promise<void> {
  const fsApi = desktopProjects();
  if (fsApi) return fsApi.rename(userId, id, name);
  return idbRename(userId, id, name);
}

export async function pickProjectSavePath(
  userId: string,
  defaultName: string,
): Promise<string | null> {
  const fsApi = desktopProjects();
  if (!fsApi?.pickSavePath) return null;
  const res = await fsApi.pickSavePath(userId, defaultName);
  if (res.canceled || !res.filePath) return null;
  return res.filePath;
}

export async function createLocalProjectAtPath(
  userId: string,
  name: string,
  filePath: string,
): Promise<{ meta: CloudProject; record: LocalProjectRecord } | null> {
  const fsApi = desktopProjects();
  if (!fsApi?.createAtPath) return null;
  const res = await fsApi.createAtPath(userId, name, filePath);
  if (res.error) throw new Error(res.error);
  return { meta: res.meta, record: res.record };
}

/** Export .aiswork file payload */
export function serializeProjectFile(record: LocalProjectRecord): string {
  return compress(
    JSON.stringify({
      version: 1,
      name: record.name,
      data: record.data,
      exportedAt: new Date().toISOString(),
    }),
  );
}

export function parseProjectFile(raw: string): {
  name: string;
  data: LocalProjectData;
} {
  const json = decompress(raw);
  if (!json) throw new Error('无效的工程文件');
  const parsed = JSON.parse(json);
  return { name: parsed.name || '导入的工程', data: parsed.data };
}
