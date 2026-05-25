const fs = require('fs');

const mediaSources = [
  { url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_5MB.mp4', type: 'video' },
  { url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4', type: 'video' },
  { url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_5MB.mp4', type: 'video' },
  { url: 'https://www.w3schools.com/html/mov_bbb.mp4', type: 'video' },
  { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop', type: 'image' },
  { url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=2674&auto=format&fit=crop', type: 'image' },
  { url: 'https://images.unsplash.com/photo-1620121692029-d088224ddc74?q=80&w=2832&auto=format&fit=crop', type: 'image' },
  { url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=3000&auto=format&fit=crop', type: 'image' },
  { url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2940&auto=format&fit=crop', type: 'image' },
  { url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2940&auto=format&fit=crop', type: 'image' }
];

const bannerVideos = [
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_5MB.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_5MB.mp4',
];

const dbData = JSON.parse(fs.readFileSync('db.json', 'utf8'));

dbData.siteConfig.banners = bannerVideos;

dbData.posts = mediaSources.map((source, i) => ({
  id: `post_${Date.now()}_${i}`,
  userId: 'user_1',
  projectId: `project_${Date.now()}_${i}`,
  title: `精彩创意 ${i + 1}`,
  description: source.type === 'video' ? '基于视觉生成模型渲染的动态视频作品，展示了无尽的粒子与交互效果。' : '基于高质量生成模型生成的静态画面，充满未来科技感。',
  mediaUrl: source.url,
  category: i % 2 === 0 ? 'FLUX' : 'MIDJOURNEY',
  grade: 'SSS',
  likes: [],
  likesCount: Math.floor(Math.random() * 500) + 50,
  createdAt: new Date(Date.now() - i * 3600000).toISOString()
}));

fs.writeFileSync('db.json', JSON.stringify(dbData, null, 2));

console.log('Database seeded with 10 mixed media posts and updated banners.');
