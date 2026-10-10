<script setup lang="ts">
import { AlertCircleIcon, InfoIcon, TriangleAlertIcon } from '@lucide/vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buildVllmConfig, estimateMemory } from '@/lib/vllm/mapper'
import { fetchModelConfig, parseModelInput } from '@/lib/vllm/sources'

import type { VllmResult } from '@/lib/vllm/mapper'
import type { ModelSource } from '@/lib/vllm/sources'

const EXAMPLES = [
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct-AWQ',
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'Qwen/Qwen3-8B',
]

const SOURCE_LABEL: Record<ModelSource, string> = {
  ms: '魔搭 ModelScope',
  hf: 'HuggingFace',
}

const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低' } as const

const input = ref('Qwen/Qwen2.5-7B-Instruct')
const loading = ref(false)
const error = ref('')

const source = ref<ModelSource | null>(null)
const repo = ref('')
const degraded = ref(false)
const result = ref<VllmResult | null>(null)
const rawConfig = ref<Record<string, any> | null>(null)

const memory = computed(() => (result.value ? estimateMemory(result.value) : null))

const contextText = computed(() => {
  const n = result.value?.contextLength
  return n ? n.toLocaleString('en-US') : null
})

const modalityText = computed(() => {
  const types = result.value?.modalities.types ?? []
  if (!types.length)
    return '纯文本'
  return types.map(t => (t === 'vision' ? '视觉' : '音频')).join(' + ')
})

const samplingEntries = computed(() => Object.entries(result.value?.sampling ?? {}))

/**
 * 显卡配置建议：按实际占用算，而不是拍脑袋的倍数。
 * 占用 = 权重 + KV cache（按原生上下文 × vLLM 默认并发 8）+ 激活值 + 运行时开销
 */
const ASSUMED_CONCURRENCY = 8
const GIB = 1024 ** 3

const gpuAdvice = computed(() => {
  const m = memory.value
  const ctx = result.value?.contextLength
  if (!m)
    return null

  const kvGB = m.kvBytesPerToken && ctx
    ? (m.kvBytesPerToken * ctx * ASSUMED_CONCURRENCY) / GIB
    : null
  const activation = m.weightsGB * 0.07
  const overhead = 2.5
  const needed = m.weightsGB + (kvGB ?? 0) + activation + overhead

  const tiers = [24, 48, 80]
  const fit = tiers.find(t => needed <= t * 0.92)
  const text = fit
    ? `1 × ${fit}G`
    : `${Math.ceil(needed / (80 * 0.92))} × 80G`

  return {
    text,
    ok: !!fit,
    needed: Math.round(needed * 10) / 10,
    kvGB: kvGB === null ? null : Math.round(kvGB * 10) / 10,
  }
})

async function search() {
  if (loading.value)
    return

  loading.value = true
  error.value = ''

  try {
    const parsed = parseModelInput(input.value)
    const data = await fetchModelConfig(parsed)

    rawConfig.value = data.config
    result.value = buildVllmConfig(data)
    source.value = data.source
    repo.value = data.repo
    degraded.value = data.degraded
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    rawConfig.value = null
    result.value = null
    source.value = null
    repo.value = ''
  }
  finally {
    loading.value = false
  }
}

function useExample(name: string) {
  input.value = name
  search()
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4">
    <!-- 标题 + 输入：有结果时让位给结果区 -->
    <div class="space-y-4">
      <h1 class="text-2xl font-semibold tracking-tight">
        模型参数解析
      </h1>

      <div v-if="!result" class="space-y-3">
        <div class="flex gap-2">
          <Input
            v-model="input"
            placeholder="模型名或仓库地址，如 Qwen/Qwen2.5-7B-Instruct"
            class="h-9 font-mono text-sm"
            spellcheck="false"
            autofocus
            @keyup.enter="search"
          />
          <Button class="h-9 px-5" :disabled="loading" @click="search">
            {{ loading ? '解析中' : '解析' }}
          </Button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-muted-foreground">示例</span>
          <Button
            v-for="ex in EXAMPLES"
            :key="ex"
            variant="ghost"
            size="sm"
            class="h-6 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
            @click="useExample(ex)"
          >
            {{ ex }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 加载中 -->
    <Card v-if="loading">
      <CardHeader>
        <CardTitle class="text-base">
          正在读取模型配置
        </CardTitle>
        <CardDescription>从模型仓库拉取 config.json，请稍候</CardDescription>
      </CardHeader>
      <CardContent class="space-y-2">
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
        <Skeleton class="h-20 w-full" />
      </CardContent>
    </Card>

    <!-- 错误 -->
    <Alert v-if="error" variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>获取失败</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <!-- 空状态 -->
    <Card v-if="!result && !loading && !error">
      <CardHeader>
        <CardTitle class="text-base">
          输入模型名开始
        </CardTitle>
        <CardDescription>支持魔搭与 HuggingFace 仓库，也可直接粘贴仓库链接</CardDescription>
      </CardHeader>
      <CardContent class="text-sm text-muted-foreground">
        <p>
          输入模型名后，本工具会读取它的配置文件并解析出：
        </p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>量化方式与计算精度（对应 --quantization / --dtype）</li>
          <li>上下文长度上限（对应 --max-model-len）</li>
          <li>多模态等特殊架构所需的额外参数</li>
          <li>参数量与显存占用的粗略估算</li>
        </ul>
      </CardContent>
    </Card>

    <template v-if="result && rawConfig">
      <!-- 当前查询对象 + 快速换模型 -->
      <div class="flex items-center gap-2 rounded-lg border px-3 py-2">
        <span class="font-mono text-sm">{{ repo }}</span>
        <Badge v-if="source" variant="outline" class="text-xs">
          {{ SOURCE_LABEL[source] }}
        </Badge>
        <div class="ml-auto flex gap-2">
          <Input
            v-model="input"
            placeholder="换个模型试试"
            class="h-7 w-56 font-mono text-xs"
            spellcheck="false"
            @keyup.enter="search"
          />
          <Button size="sm" class="h-7" :disabled="loading" @click="search">
            {{ loading ? '解析中' : '解析' }}
          </Button>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-5">
        <!-- 左栏 -->
        <div class="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle class="text-base">
                模型规格
              </CardTitle>
            </CardHeader>
            <CardContent class="px-0 pb-0">
              <dl class="text-sm">
                <div class="flex gap-3 border-b px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    架构
                  </dt>
                  <dd class="min-w-0 flex-1 truncate font-mono" :title="result.architectures.join(', ')">
                    {{ result.architectures[0] || '未知' }}
                  </dd>
                </div>
                <div class="flex gap-3 border-b px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    模型类型
                  </dt>
                  <dd class="min-w-0 flex-1 truncate font-mono">
                    {{ result.sourceModelType }}
                  </dd>
                </div>
                <div class="flex gap-3 border-b px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    参数量
                  </dt>
                  <dd class="font-mono">
                    <template v-if="result.paramsBillion">{{ result.paramsBillion }} B</template>
                    <span v-else class="text-xs text-muted-foreground">配置未提供，无法计算</span>
                  </dd>
                </div>
                <div v-if="contextText" class="flex gap-3 border-b px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    上下文
                  </dt>
                  <dd class="font-mono">
                    {{ contextText }}
                  </dd>
                </div>
                <div class="flex gap-3 border-b px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    量化
                  </dt>
                  <dd class="font-mono">
                    <template v-if="result.quant">
                      {{ result.quant.method }}<template v-if="result.quant.bits"> · {{ result.quant.bits }}bit</template>
                    </template>
                    <template v-else>无</template>
                  </dd>
                </div>
                <div class="flex gap-3 px-6 py-2">
                  <dt class="w-20 shrink-0 text-muted-foreground">
                    模态
                  </dt>
                  <dd class="font-mono">
                    {{ modalityText }}
                  </dd>
                </div>
              </dl>
              <div
                v-if="memory || gpuAdvice"
                class="space-y-1 border-t bg-muted/40 px-6 py-2.5 text-xs text-muted-foreground"
              >
                <div class="flex flex-wrap gap-x-6 gap-y-1">
                  <span v-if="memory">权重 <b class="font-mono font-medium text-foreground">{{ memory.weightsGB }} GB</b></span>
                  <span v-if="gpuAdvice?.kvGB !== null && gpuAdvice?.kvGB !== undefined">
                    KV cache
                    <b class="font-mono font-medium text-foreground">{{ gpuAdvice.kvGB }} GB</b>
                    <span class="opacity-70">（{{ contextText }} × {{ ASSUMED_CONCURRENCY }} 并发）</span>
                  </span>
                  <span v-if="gpuAdvice">
                    建议配置
                    <b
                      class="font-mono font-medium"
                      :class="gpuAdvice.ok ? 'text-foreground' : 'text-amber-600 dark:text-amber-500'"
                    >{{ gpuAdvice.text }}</b>
                  </span>
                </div>
                <p v-if="gpuAdvice" class="text-xs opacity-80">
                  含权重、KV cache、激活值与运行时开销，合计约 {{ gpuAdvice.needed }} GB
                </p>
              </div>
            </CardContent>
          </Card>

          <Card v-if="samplingEntries.length">
            <CardHeader>
              <div class="flex items-center gap-2">
                <CardTitle class="text-base">
                  采样默认值
                </CardTitle>
                <Badge variant="outline" class="ml-auto text-xs">
                  generation_config
                </Badge>
              </div>
            </CardHeader>
            <CardContent class="px-0 pb-0">
              <dl class="text-sm">
                <div
                  v-for="[key, val] in samplingEntries"
                  :key="key"
                  class="flex gap-3 border-b px-6 py-2 last:border-b-0"
                >
                  <dt class="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                    {{ key }}
                  </dt>
                  <dd class="font-mono">
                    {{ val }}
                  </dd>
                </div>
              </dl>
              <p class="border-t bg-muted/40 px-6 py-2.5 text-xs text-muted-foreground">
                模型推荐的采样默认值，可在请求时按需覆盖。
              </p>
            </CardContent>
          </Card>
        </div>

        <!-- 右栏 -->
        <div class="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle class="text-base">
                参数解析依据
              </CardTitle>
              <CardDescription>每个参数都标注了来源字段与置信度，便于判断是否可信</CardDescription>
            </CardHeader>
            <CardContent class="px-0 pb-0">
              <Table v-if="result.params.length">
                <TableHeader>
                  <TableRow>
                    <TableHead>参数</TableHead>
                    <TableHead>取值</TableHead>
                    <TableHead>来源字段</TableHead>
                    <TableHead class="text-right">置信度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="p in result.params" :key="p.name">
                    <TableCell class="font-mono text-xs">
                      {{ p.name }}
                    </TableCell>
                    <TableCell class="font-mono text-xs">
                      {{ p.value ?? '开关' }}
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground">
                      {{ p.from }}
                    </TableCell>
                    <TableCell class="text-right">
                      <Badge
                        variant="outline"
                        class="text-xs"
                        :class="{
                          'border-green-500/40 text-green-600 dark:text-green-500': p.confidence === 'high',
                          'border-amber-500/40 text-amber-600 dark:text-amber-500': p.confidence === 'medium',
                          'border-red-500/40 text-red-600 dark:text-red-500': p.confidence === 'low',
                        }"
                      >
                        {{ CONFIDENCE_LABEL[p.confidence] }}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p v-else class="px-6 pb-6 text-sm text-muted-foreground">
                无需额外参数，直接
                <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">vllm serve &lt;模型名&gt;</code>
                即可启动。
              </p>
            </CardContent>
          </Card>

          <div v-if="result.warnings.length || result.hints.length" class="space-y-2">
            <Alert
              v-for="(w, i) in result.warnings"
              :key="`w${i}`"
              :variant="w.level === 'err' ? 'destructive' : 'default'"
            >
              <TriangleAlertIcon v-if="w.level === 'warn'" />
              <InfoIcon v-else />
              <AlertDescription>{{ w.text }}</AlertDescription>
            </Alert>
            <Alert v-for="(h, i) in result.hints" :key="`h${i}`">
              <InfoIcon />
              <AlertTitle>{{ h.title }}</AlertTitle>
              <AlertDescription>{{ h.detail }}</AlertDescription>
            </Alert>
          </div>

          <Alert v-if="memory">
            <InfoIcon />
            <AlertDescription>{{ memory.note }}</AlertDescription>
          </Alert>

          <Alert v-if="degraded">
            <TriangleAlertIcon />
            <AlertTitle>数据源降级</AlertTitle>
            <AlertDescription>
              指定的数据源获取失败，已自动切换到 {{ source ? SOURCE_LABEL[source] : '备用源' }}。
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">
            原始 config.json
          </CardTitle>
          <CardDescription>模型仓库中的原始配置，用于核对解析是否准确</CardDescription>
        </CardHeader>
        <CardContent>
          <pre class="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed"><code>{{ JSON.stringify(rawConfig, null, 2) }}</code></pre>
        </CardContent>
      </Card>
    </template>
  </div>
</template>