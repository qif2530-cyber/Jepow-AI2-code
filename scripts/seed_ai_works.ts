import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// 动态判断本地环境还是服务器环境的数据路径
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(os.homedir(), '.jepow-data'));
const PersistentDataDir = isProd ? path.join(os.homedir(), '.jepow-data') : process.cwd();
const DB_FILE = process.env.DB_PATH || path.join(PersistentDataDir, 'db.json');
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_PATH || path.join(PersistentDataDir, 'uploads'));

const ASSETS_DIR = path.join(process.cwd(), 'ai_assets');

async function main() {
  console.log('🤖 Jepow AI - 批量导入 AI 作品脚本启动...');
  
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    console.log(`⚠️  请先将你生成的 20 多张图片/视频放入左侧文件管理器的 ai_assets 文件夹中，然后再执行此脚本！`);
    process.exit(1);
  }

  const files = fs.readdirSync(ASSETS_DIR).filter(f => !f.startsWith('.'));
  if (files.length === 0) {
    console.log(`⚠️  ai_assets 文件夹为空，请放入文件后再运行本脚本。`);
    process.exit(0);
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ db.json 数据库文件不存在，请先启动一次服务器 (${DB_FILE})`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // 1. 生成 5 个个性鲜明的虚拟 AI 画师用户
  const virtualUsers = [];
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
      id: `u_virtual_${crypto.randomBytes(8).toString('hex')}`,
      username: nameList[i],
      accountName: accountName,
      email: `${accountName}@example.com`,
      password: "", 
      role: "user",
      credits: 0,
      status: "active",
      createdAt: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
      avatar: avatarList[i],
      bio: "AI 视觉探索者 | 专注于风格化生成与前沿测试"
    };
    virtualUsers.push(user);
    db.users.push(user);
  }
  console.log(`✅ 成功创建 ${virtualUsers.length} 个虚拟用户帐号`);

  // 2. 遍历处理所有图片视频文件
  let uploadCount = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
    
    // 生成防冲突的文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const newFilename = uniqueSuffix + ext;
    const sourcePath = path.join(ASSETS_DIR, file);
    const targetPath = path.join(UPLOADS_DIR, newFilename);
    
    // 拷贝文件到系统的 uploads 目录
    fs.copyFileSync(sourcePath, targetPath);
    
    // 随机抽取一个虚拟创作者
    const randomUser = virtualUsers[Math.floor(Math.random() * virtualUsers.length)];
    
    // 生成随机的曝光数据（避免内容“0赞”起步，假装很活跃）
    const views = Math.floor(Math.random() * 600) + 120;
    const likesCount = Math.floor(Math.random() * 60) + 10;
    
    // 将文件名处理一下作为默认标题
    const rawTitle = file.replace(ext, '').replace(/[-_]/g, ' ');
    const titleStr = rawTitle.length > 20 ? "作品分享 #" + Math.floor(Math.random() * 1000) : rawTitle;

    // 构建符合项目路由规则的媒体地址读取方式
    const mediaUrl = `/api/media/${Buffer.from(newFilename).toString('base64url')}`;

    const newPost = {
      id: "p_" + crypto.randomBytes(8).toString('hex'),
      userId: randomUser.id,
      title: titleStr || (isVideo ? "电影感 AI 运动视频测试" : "极客风格 AI 艺术插画"),
      description: "本周最新炼丹成果，参数效果挺满意的。使用了最先进的工作流生成，如果有需要提示词的可以留言交流探讨~ 整体动态和光影控制都有进步。",
      mediaUrl: mediaUrl,
      coverUrl: "", 
      projectData: null,
      price: 0,
      canDownload: true,
      category: isVideo ? "视频" : "插画",
      status: "approved", // 直接标记为通过，展示在社区中心
      grade: Math.random() > 0.8 ? 'S' : 'none', 
      likes: [], 
      collections: [],
      likesCount: likesCount,
      commentCount: 0,
      viewsCount: views,
      views: views,
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() // 随机分布在最近7天
    };
    
    db.posts.push(newPost);
    uploadCount++;
  }

  // 3. 将改动保存回文件
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log(`✅ 成功批量发布了 ${uploadCount} 个 AI 作品！数据已入库。`);
  console.log(`\n🎉 一切准备就绪！请重新启动服务器以便重新加数据库缓存，或者在浏览器刷新直接查看探索页。`);
}

main().catch(console.error);
