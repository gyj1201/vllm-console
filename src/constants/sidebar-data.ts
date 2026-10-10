import {
  MonitorIcon,
  SlidersIcon,
} from '@lucide/vue'

import type { NavGroup, NavItem } from '@/components/app-sidebar/types'

type SidebarLink = Extract<NavItem, { url: string }>

/**
 * 侧边栏导航配置。
 *
 * 新增模块的步骤：
 * 1. 在 src/pages/ 下建对应页面（路由由文件自动生成，无需手写路由表）
 * 2. 在下面的数组里加一项 { title, url, icon }
 * 3. 完成，不需要改动任何布局代码
 */
export const settingsNavItems: SidebarLink[] = [
  { title: '外观', url: '/settings/appearance', icon: SlidersIcon },
  { title: '显示', url: '/settings/display', icon: MonitorIcon },
]

export const navData: NavGroup[] = [
  {
    title: '导航',
    items: [
      { title: '常用', url: '/nav' },
    ],
  },
  {
    title: 'vLLM 部署',
    items: [
      { title: '模型参数解析', url: '/' },
      { title: 'GPU 分析', url: '/gpu-analysis' },
      { title: '启动参数', url: '/serve-params' },
    ],
  },
  {
    title: 'vLLM 文档',
    items: [
      { title: '中文文档', url: 'https://docs.vllm.com.cn/' },
    ],
  },
  {
    title: '国产芯片',
    items: [
      {
        title: '昇腾',
        items: [
          { title: '中文文档', url: 'https://vllm-ascend-cn.readthedocs.io/zh-cn/latest/' },
          { title: '安装部署', url: 'https://vllm-ascend.readthedocs.io/en/latest/installation.html' },
          { title: '源码', url: 'https://github.com/vllm-project/vllm-ascend' },
        ],
      },
      {
        title: '摩尔线程',
        items: [
          { title: '安装部署', url: 'https://docs.mthreads.com/vllm-musa-m1000/vllm-musa-m1000-doc-online/AIBook/AIBook1.3.3/environment_setup' },
          { title: '源码', url: 'https://github.com/MooreThreads/vllm-musa' },
        ],
      },
      {
        title: '寒武纪',
        items: [
          { title: '源码', url: 'https://github.com/Cambricon/vllm-mlu' },
          { title: 'SDK 申请', url: 'https://www.cambricon.com/' },
        ],
      },
      {
        title: '海光',
        items: [
          { title: '光合社区', url: 'https://developer.sourcefind.cn' },
          { title: 'DCU 镜像', url: 'https://sourcefind.cn' },
        ],
      },
      {
        title: '沐曦',
        items: [
          { title: '文档', url: 'https://developer.metax-tech.com/api/client/document/preview/1220/index.html' },
          { title: '软件栈', url: 'https://developer.metax-tech.com/softnova/category?ai_frame=vllm' },
        ],
      },
      {
        title: '昆仑芯',
        items: [{ title: '源码', url: 'https://github.com/baidu/vLLM-Kunlun' }],
      },
    ],
  },
]

/**
 * 额外的命令面板条目，不出现在侧边栏。
 * command-menu-panel 会把 navData 与本数组合并后做成 ⌘K 面板，
 * 因此这里必须保留导出（可为空数组）。
 */
export const otherPages: NavGroup[] = []