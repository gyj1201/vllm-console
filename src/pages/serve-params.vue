<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GROUPS, PARAMS } from '@/lib/vllm/serve-params'

import type { ParamGroup } from '@/lib/vllm/serve-params'

const activeGroup = ref<ParamGroup | 'all'>('all')
const copiedName = ref('')

/** 按当前分组筛选，无搜索 */
const results = computed(() =>
  Object.entries(PARAMS)
    .map(([key, items]) => {
      if (activeGroup.value !== 'all' && activeGroup.value !== key)
        return null
      const meta = GROUPS.find(g => g.key === key)!
      return { ...meta, key: key as ParamGroup, items }
    })
    .filter(Boolean) as Array<{ key: ParamGroup, title: string, summary: string, items: typeof PARAMS.core }>,
)

async function copy(text: string, name: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedName.value = name
    setTimeout(() => (copiedName.value = ''), 1600)
  }
  catch {
    // 剪贴板不可用时静默失败，用户可手动选中
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6">
    <!-- 标题 -->
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        启动参数
      </h1>
      <p class="text-sm text-muted-foreground">
        vLLM serve 常用参数速查。每个参数都标注了什么时候才需要动它。
      </p>
    </div>

    <!-- 分组筛选 -->
    <div class="flex flex-wrap gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        class="h-6 px-2.5 text-xs"
        :class="activeGroup === 'all' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        @click="activeGroup = 'all'"
      >
        全部
      </Button>
      <Button
        v-for="g in GROUPS"
        :key="g.key"
        variant="ghost"
        size="sm"
        class="h-6 px-2.5 text-xs"
        :class="activeGroup === g.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'"
        @click="activeGroup = g.key"
      >
        {{ g.title }}
      </Button>
    </div>

    <!-- 参数分组 -->
    <div v-if="results.length" class="space-y-6">
      <section v-for="g in results" :key="g.key" class="space-y-2">
        <div class="flex items-baseline gap-2">
          <h2 class="text-sm font-medium">
            {{ g.title }}
          </h2>
          <span class="text-xs text-muted-foreground">
            {{ g.summary }}
          </span>
        </div>

        <div class="overflow-hidden rounded-lg border">
          <div
            v-for="(p, i) in g.items"
            :key="p.name"
            class="px-4 py-3"
            :class="i > 0 ? 'border-t' : ''"
          >
            <div class="flex flex-wrap items-center gap-2">
              <code class="font-mono text-xs text-foreground">
                {{ p.name }}
              </code>
              <code
                v-if="p.example"
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
              >
                {{ p.example }}
              </code>
              <Badge v-if="p.default" variant="outline" class="text-[10px]">
                默认 {{ p.default }}
              </Badge>
              <button
                class="ml-auto opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                :title="`复制 ${p.name}`"
                @click="copy(p.name, p.name)"
              >
                <CheckIcon v-if="copiedName === p.name" class="size-3.5 text-green-600 dark:text-green-500" />
                <CopyIcon v-else class="size-3.5" />
              </button>
            </div>

            <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {{ p.desc }}
            </p>

            <p
              v-if="p.when"
              class="mt-1.5 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-muted-foreground"
            >
              <span class="text-foreground/70">何时调：</span>{{ p.when }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>