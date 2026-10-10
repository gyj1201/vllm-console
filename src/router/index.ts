import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import { setupRouterGuard } from './guard'

const router = createRouter({
  // GitHub Pages 是静态托管，没有服务端 rewrite 配置，
  // 用 hash 路由才能保证直接访问 /settings/appearance 这类子路径时不 404。
  // 若之后改用 Nginx / Cloudflare 等支持 rewrite 的托管，可换回 createWebHistory。
  history: createWebHashHistory(),
  routes: setupLayouts(routes),

  scrollBehavior() {
    return { left: 0, top: 0, behavior: 'smooth' }
  },
})

setupRouterGuard(router)

export default router

if (import.meta.hot) {
  handleHotUpdate(router)
}