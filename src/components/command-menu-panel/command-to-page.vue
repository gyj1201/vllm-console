<script setup lang="ts">
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { navData, otherPages } from '@/constants/sidebar-data'

import type { NavGroup, NavItem } from '../app-sidebar/types'

import CommandItemHasIcon from './command-item-has-icon.vue'

const emit = defineEmits<{
  click: []
}>()

/**
 * 把多级导航拍平成仅含「可跳转叶子节点」的列表。
 *
 * 导航里存在两种中间节点：
 * - 分组节点（只有 items，没有 url）
 * - 叶子节点（有 url）
 * 递归时必须逐层下探，且只收集带 url 的叶子，
 * 否则会往 router.push 传 undefined 导致路由报错、整个 layout 崩溃。
 */
function flatten(items: Array<NavItem | NavGroup['items'][number]>): NavItem[] {
  const out: NavItem[] = []
  for (const item of items) {
    if (!item)
      continue
    const children = (item as { items?: unknown[] }).items
    if (Array.isArray(children) && children.length) {
      out.push(...flatten(children as NavItem[]))
    }
    else if (typeof (item as { url?: unknown }).url === 'string') {
      out.push(item as NavItem)
    }
  }
  return out
}

const commands = flatten([...navData.flatMap(g => g.items), ...otherPages.flatMap(g => g.items)])

const router = useRouter()
const route = useRoute()

function commandItemClick(url?: string) {
  emit('click')
  if (!url)
    return

  // 外链交给浏览器，不走内部路由
  if (/^https?:\/\//.test(url)) {
    window.open(url, '_blank', 'noopener')
    return
  }

  // hash 路由下 path 不含 query/hash，直接比较即可
  if (route.path !== url) {
    router.push(url).catch(() => {
      // 目标不存在时不打断命令面板
    })
  }
}
</script>

<template>
  <CommandGroup v-if="commands.length" heading="Pages">
    <CommandItem
      v-for="command in commands"
      :key="`${command.title}-${command.url}`"
      :value="`${command.title} ${command.url}`"
      @click="commandItemClick(command.url)"
    >
      <CommandItemHasIcon :name="command.title" :icon="command.icon" />
    </CommandItem>
  </CommandGroup>
</template>