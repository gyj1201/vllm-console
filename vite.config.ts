import type { PluginOption } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'
import AutoImport from 'unplugin-auto-import/vite'
import Component from 'unplugin-vue-components/vite'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vitest/config'
import { VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'

const RouteGenerateExclude = ['**/components/**', '**/layouts/**', '**/data/**', '**/types/**']

/**
 * 站点 base 路径解析优先级：
 * 1. SITE_BASE 环境变量 —— 配自定义域名时设为 '/'，站点在根路径
 * 2. GITHUB_PAGES      —— GitHub Pages 默认部署在 /<仓库名>/ 子路径
 * 3. 默认 './'         —— 本地开发
 *
 * 说明：相对路径 './' 在 hash 路由下资源引用正常，但 HTML 里手写的相对链接
 * （如 favicon）会随路由深度解析出错，因此生产构建统一用绝对路径。
 */
function resolveBase(): string {
  const explicit = process.env.SITE_BASE
  if (explicit)
    return explicit.endsWith('/') ? explicit : `${explicit}/`

  if (process.env.GITHUB_PAGES) {
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
    return `/${repo ?? ''}/`
  }

  return './'
}

export default defineConfig({
  base: resolveBase(),
  plugins: [
    VueRouter({
      exclude: RouteGenerateExclude,
      dts: 'src/types/route-map.d.ts',
    }),
    vue(),
    tailwindcss(),
    ...(process.env.ANALYZE
      ? [visualizer({ gzipSize: true, brotliSize: true }) as PluginOption]
      : []),
    Layouts({
      defaultLayout: 'default',
    }),
    AutoImport({
      include: [
        /\.[tj]sx?$/,
        /\.vue$/,
      ],
      imports: [
        'vue',
        VueRouterAutoImports,
      ],
      dirs: [
        'src/composables/**/*.ts',
        'src/constants/**/*.ts',
        'src/stores/**/*.ts',
      ],
      defaultExportByFilename: true,
      dts: 'src/types/auto-import.d.ts',
    }),
    Component({
      dirs: [
        'src/components',
      ],
      collapseSamePrefixes: true,
      directoryAsNamespace: true,
      dts: 'src/types/auto-import-components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
        'src/composables/**/*.ts',
        'src/utils/**/*.ts',
        'src/validators/**/*.ts',
        'src/router/guard/**/*.ts',
      ],
      exclude: ['src/**/*.d.ts'],
    },
  },
})
