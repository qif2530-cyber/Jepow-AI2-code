const fs = require('fs');
const path = require('path');
const os = require('os');

const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(os.homedir(), '.jepow-data'));
const PersistentDataDir = isProd ? path.join(os.homedir(), '.jepow-data') : process.cwd();
const DB_FILE = process.env.DB_PATH || path.join(PersistentDataDir, 'db.json');

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

try {
  let rawDb = fs.readFileSync(DB_FILE, 'utf-8');
  let db = JSON.parse(rawDb);
  
  if (db.posts) {
    db.posts.forEach((post) => {
      // clear garbage title
      if (post.title && post.title.includes('æ')) {
        post.title = "AI 艺术作品";
      }
      if (post.description === "这是我最近创作的AI作品，大家觉得效果怎么样？使用了最新的节点工作流生成，参数控制还可以继续优化。欢迎在评论区交流心得！") {
        post.description = imageDescriptions[Math.floor(Math.random() * imageDescriptions.length)];
      }
      
      if (!post.likesCount) {
        post.likesCount = Math.floor(Math.random() * 60) + 10;
      }
    });
    
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log('Fixed db posts properties!');
  }
} catch (e) {
  console.error(e);
}
