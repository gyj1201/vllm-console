import { navData } from '@/constants/sidebar-data'

import type { SidebarData } from '../types'

/**
 * 侧边栏数据入口。
 * 目前只保留导航主菜单 —— 品牌信息直接写在 nav-footer / index.vue 中，
 * 不再维护演示用的 teams 与 user。若将来要加多工作区切换，可在此恢复 teams 字段。
 */
export const sidebarData: SidebarData = {
  navMain: navData,
}