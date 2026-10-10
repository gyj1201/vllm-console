<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import {
  BotIcon,
  BoxIcon,
  BrainIcon,
  CirclePlayIcon,
  CloudIcon,
  Code2Icon,
  FileCodeIcon,
  FileJsonIcon,
  FilmIcon,
  GaugeIcon,
  GitCompareIcon,
  GraduationCapIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  NewspaperIcon,
  SearchIcon,
  ServerIcon,
  StarIcon,
  TerminalIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue'
import type { Component } from 'vue'

import { NAV_CATEGORIES } from '@/lib/vllm/nav-links'
import type { NavSite } from '@/lib/vllm/nav-links'

const ICON_MAP: Record<string, Component> = {
  bot: BotIcon,
  box: BoxIcon,
  brain: BrainIcon,
  'circle-play': CirclePlayIcon,
  cloud: CloudIcon,
  'code-2': Code2Icon,
  'file-code': FileCodeIcon,
  'file-json': FileJsonIcon,
  film: FilmIcon,
  gauge: GaugeIcon,
  'git-compare': GitCompareIcon,
  'graduation-cap': GraduationCapIcon,
  'message-circle': MessageCircleIcon,
  'message-square': MessageSquareIcon,
  newspaper: NewspaperIcon,
  search: SearchIcon,
  server: ServerIcon,
  star: StarIcon,
  terminal: TerminalIcon,
  users: UsersIcon,
  wrench: WrenchIcon,
  zap: ZapIcon,
}

function resolveIcon(name?: string): Component | null {
  return name ? ICON_MAP[name] ?? null : null
}

/** 分类标题图标（对应 nav-links.ts 里各分类的 icon） */
const CATEGORY_ICONS: Record<string, string> = {
  置顶: 'star',
  在线工具: 'wrench',
  官方文档: 'graduation-cap',
}

// ---------------------------------------------------------------------------
// favicon 加载（参考 Desktop/menav 实现）
//
// 走 Google faviconV2 服务，一张图统一域名，不会把访客 IP 分散暴露给几十个站点。
// 三态流转：loading → loaded / error
// 主域失败换另一个 gstatic 域名重试一次，仍失败则降级到本地 Lucide 图标。
// ---------------------------------------------------------------------------

const REGION_CN = true

type IconState = 'loading' | 'loaded' | 'error'

/**
 * 状态表在渲染前建好，不在模板里写入响应式状态 ——
 * 否则 Vue 会在渲染期间触发更新，导致转圈一直停不下来。
 */
const iconStates = reactive<Record<string, IconState>>(
  Object.fromEntries(
    NAV_CATEGORIES.flatMap(c => c.sites).map(s => [s.url, 'loading' as IconState]),
  ),
)

function stateOf(url: string): IconState {
  return iconStates[url] ?? 'loading'
}

function buildFaviconUrl(siteUrl: string, cn: boolean): string {
  const domain = cn ? 't3.gstatic.cn' : 't3.gstatic.com'
  const q = encodeURIComponent(siteUrl)
  return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${q}&size=32&drop_404_icon=true`
}

function faviconUrl(url: string): string {
  return buildFaviconUrl(url, REGION_CN)
}

function faviconFallbackUrl(url: string): string {
  return buildFaviconUrl(url, !REGION_CN)
}

/**
 * load 事件触发即认为成功。
 * 不检查 naturalWidth —— 部分站点返回的图标尺寸为 0 但能正常显示，
 * 用它做判断会导致图标显示了、转圈却停不下来。
 */
function onLoad(_el: unknown, url: string) {
  clearTimers(url)
  iconStates[url] = 'loaded'
}

function onError(el: unknown, url: string) {
  const img = el as HTMLImageElement
  if (!img.dataset.triedFallback) {
    // 第一次失败：换另一个 gstatic 域名再试
    img.dataset.triedFallback = '1'
    img.src = faviconFallbackUrl(url)
    return
  }
  // 两次都失败：降级到本地图标
  clearTimers(url)
  iconStates[url] = 'error'
}

/**
 * 超时兜底：8 秒还没结果就降级。
 * 网络异常时 load / error 都不触发，卡片会一直转圈。
 */
const TIMEOUT = 8000
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function armTimer(url: string) {
  if (timers.has(url))
    return
  timers.set(url, setTimeout(() => {
    if (iconStates[url] === 'loading') {
      iconStates[url] = 'error'
      timers.delete(url)
    }
  }, TIMEOUT))
}

function clearTimers(url: string) {
  const t = timers.get(url)
  if (t) {
    clearTimeout(t)
    timers.delete(url)
  }
}

// 首次渲染后为每个站点挂上超时保护
onMounted(() => {
  for (const s of NAV_CATEGORIES.flatMap(c => c.sites))
    armTimer(s.url)
})

onBeforeUnmount(() => {
  for (const t of timers.values())
    clearTimeout(t)
  timers.clear()
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        导航
      </h1>
      <p class="text-sm text-muted-foreground">
        常用的模型平台、云服务与开发文档。
      </p>
    </div>

    <section v-for="cat in NAV_CATEGORIES" :key="cat.name" class="space-y-2.5">
      <!-- 分类标题 -->
      <h2 class="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/30">
        <component
          :is="resolveIcon(CATEGORY_ICONS[cat.name])"
          v-if="resolveIcon(CATEGORY_ICONS[cat.name])"
          class="size-3.5 shrink-0 text-primary"
        />
        <span>{{ cat.name }}</span>
        <span class="text-xs font-normal text-muted-foreground">
          {{ cat.sites.length }}
        </span>
      </h2>

      <!-- minmax(200px, 1fr)：列宽自适应，容器变窄自动减列 -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        <a
          v-for="site in cat.sites as NavSite[]"
          :key="site.url"
          :href="site.url"
          target="_blank"
          rel="noopener noreferrer"
          class="group relative flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <!-- 图标容器：固定尺寸，三态靠 class 切换，不重建 img 元素 -->
          <span class="relative flex size-5 shrink-0 items-center justify-center overflow-hidden transition-transform duration-200 group-hover:scale-110">
            <!-- 加载中：转圈 -->
            <span
              class="absolute size-3 animate-spin rounded-full border-2 border-muted border-t-transparent transition-opacity duration-200"
              :class="stateOf(site.url) === 'loading' ? 'opacity-100' : 'opacity-0'"
            />

            <!-- 加载失败：降级为本地图标 -->
            <component
              :is="resolveIcon(site.icon)"
              v-if="resolveIcon(site.icon)"
              class="size-3.5 text-muted-foreground transition-opacity duration-200"
              :class="stateOf(site.url) === 'error' ? 'opacity-100' : 'opacity-0'"
            />

            <!-- favicon -->
            <img
              :src="faviconUrl(site.url)"
              :alt="`${site.name} 图标`"
              class="size-[18px] rounded-sm object-contain transition-opacity duration-200"
              :class="stateOf(site.url) === 'error' ? 'opacity-0' : 'opacity-100'"
              loading="lazy"
              referrerpolicy="no-referrer"
              @load="onLoad($event, site.url)"
              @error="onError($event, site.url)"
            >
          </span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-foreground">
              {{ site.name }}
            </p>
            <p v-if="site.desc" class="truncate text-xs text-muted-foreground">
              {{ site.desc }}
            </p>
          </div>
        </a>
      </div>
    </section>
  </div>
</template>