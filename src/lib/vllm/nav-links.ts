/**
 * 常用导航数据。
 *
 * 来源：Desktop/menav/config/user/pages/common.yml（用户手写的收藏）
 * 迁移时间：2026-10-10
 *
 * 字段说明：
 * - icon: Lucide 图标名（不带 Icon 后缀），对应 @lucide/vue
 */

export interface NavSite {
  name: string
  url: string
  /** Lucide 图标名，如 'github' → GithubIcon */
  icon?: string
  desc?: string
}

export interface NavCategory {
  name: string
  sites: NavSite[]
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    name: '置顶',
    sites: [
      { name: '谷歌', url: 'https://www.google.com', icon: 'search', desc: '全球搜索引擎' },
      { name: '百度', url: 'https://www.baidu.com', icon: 'search', desc: '中文搜索引擎' },
      { name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'bot', desc: 'AI 智能助手' },
      { name: 'DeepSeek', url: 'https://chat.deepseek.com/', icon: 'message-circle', desc: 'DeepSeek AI 助手' },
      { name: '豆包', url: 'https://www.doubao.com/', icon: 'message-square', desc: '豆包 AI 助手' },
      { name: 'GitHub', url: 'https://github.com/', icon: 'code-2', desc: '代码托管平台' },
      { name: 'ModelScope', url: 'https://www.modelscope.cn/', icon: 'box', desc: '模型社区与下载' },
      { name: 'AutoDL', url: 'https://www.autodl.com/home', icon: 'server', desc: 'AI 算力租用平台' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com/questions', icon: 'message-square', desc: '程序员问答社区' },
      { name: 'Reddit', url: 'https://www.reddit.com', icon: 'users', desc: '社区讨论平台' },
      { name: 'AI 日报', url: 'https://ai-bot.cn/daily-ai-news/', icon: 'newspaper', desc: '每日 AI 资讯' },
    ],
  },
  {
    name: '在线工具',
    sites: [
      { name: 'JSON Editor', url: 'https://jsoneditoronline.org', icon: 'file-json', desc: 'JSON 在线编辑器' },
      { name: '代码对比', url: 'https://www.mergely.com/', icon: 'git-compare', desc: '免费在线代码对比' },
      { name: '测网速', url: 'https://fast.com/', icon: 'gauge', desc: '免费在线测速' },
      { name: 'Vercel', url: 'https://vercel.com', icon: 'server', desc: '前端部署平台' },
      { name: '智谱', url: 'https://open.bigmodel.cn/', icon: 'brain', desc: '智谱 AI 开放平台' },
      { name: '阿里云', url: 'https://www.aliyun.com/', icon: 'cloud', desc: '阿里云计算平台' },
      { name: '腾讯云', url: 'https://cloud.tencent.com/', icon: 'cloud', desc: '腾讯云计算平台' },
      { name: 'Cloudflare', url: 'https://www.cloudflare.com/', icon: 'cloud', desc: 'CDN 与安全服务' },
      { name: 'AWS', url: 'https://aws.amazon.com/', icon: 'cloud', desc: '亚马逊云服务' },
    ],
  },
  {
    name: '官方文档',
    sites: [
      {
        name: 'Linux 命令手册',
        url: 'https://www.freecodecamp.org/chinese/news/the-linux-commands-handbook/',
        icon: 'terminal',
        desc: 'Linux 命令参考',
      },
      { name: 'Python', url: 'https://docs.python.org/zh-cn/', icon: 'file-code', desc: 'Python 官方文档' },
      { name: 'vLLM', url: 'https://docs.vllm.ai/', icon: 'zap', desc: 'vLLM 推理框架官方文档' },
      { name: 'FFmpeg', url: 'https://ffmpeg.org/documentation.html', icon: 'film', desc: '音视频处理工具' },
      { name: '哔哩哔哩', url: 'https://www.bilibili.com', icon: 'circle-play', desc: '视频学习平台' },
    ],
  },
]