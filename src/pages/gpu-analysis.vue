<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CUDA_CHOICES, OS_LIST, TORCH_CHOICES, VLLM_CHOICES, envOverhead } from '@/lib/vllm/env-overhead'
import { GPUS, groupByVendor } from '@/lib/vllm/gpus'

// ---- 选择项 ----
const gpuId = ref('rtx4090')
const osId = ref('ubuntu2204')
const cudaId = ref('12.9')
const torchId = ref('2.10.0')
const vllmId = ref('0.29.0')

const gpu = computed(() => GPUS.find(g => g.id === gpuId.value)!)
const os = computed(() => OS_LIST.find(o => o.id === osId.value)!)

const gpuGroups = groupByVendor(GPUS)

/** 操作系统按国内外分组 */
const osGroups = computed(() => [
  { label: '国际发行版', items: OS_LIST.filter(o => !o.domestic) },
  { label: '国内发行版', items: OS_LIST.filter(o => o.domestic) },
  { label: '其他后端', items: OS_LIST.filter(o => o.backend !== 'cuda') },
].filter(g => g.items.length))

/** CUDA 可选项按操作系统过滤（不超过该系统上限） */
const cudaChoices = computed(() => {
  if (os.value.backend !== 'cuda')
    return CUDA_CHOICES
  const max = os.value.maxCuda
  if (!max)
    return CUDA_CHOICES
  return CUDA_CHOICES.filter(c => Number(c) <= Number(max))
})

// 选国内系统时，若当前选的是 Nvidia 卡则提示国产卡选项
const gpuHint = computed(() => {
  if (!os.value.domestic || gpu.value.vendor === 'nvidia')
    return ''
  return `${gpu.value.name} 属于国产芯片，与当前系统组合需对应的厂商适配包`
})

// 系统切换后，若当前 CUDA 超出上限则自动下调
watch(osId, () => {
  const list = cudaChoices.value
  if (list.length && !list.includes(cudaId.value))
    cudaId.value = list[list.length - 1]!
})

const overhead = computed(() =>
  envOverhead(os.value, torchId.value, vllmId.value, cudaId.value, {
    name: gpu.value.name,
    computeMajor: gpu.value.computeMajor,
  }),
)

/** 环境开销占整卡的比例 */
const ratio = computed(() => (gpu.value.vram > 0 ? (overhead.value.totalGB / gpu.value.vram) * 100 : 0))

const breakdown = computed(() => [
  { name: '驱动与 CUDA context', value: overhead.value.contextGB, color: 'bg-slate-500', bug: false },
  { name: `PyTorch ${torchId.value} 运行时`, value: overhead.value.torchGB, color: 'bg-blue-500', bug: false },
  { name: 'NCCL 缓冲与分配器', value: overhead.value.ncclGB, color: 'bg-violet-500', bug: false },
  ...(overhead.value.bugExtraGB > 0
    ? [{ name: '版本缺陷额外占用', value: overhead.value.bugExtraGB, color: 'bg-red-500', bug: true }]
    : []),
])

const verdict = computed(() => {
  const o = overhead.value
  const vram = gpu.value.vram

  if (os.value.backend === 'cpu')
    return { level: 'info' as const, title: 'CPU 推理', text: '该配置不使用 GPU，无显存开销。' }

  if (o.totalGB >= vram)
    return { level: 'error' as const, title: '环境即占满显存', text: `开销 ${o.totalGB} GB 已超过 ${gpu.value.name} 的 ${vram} GB，加载任何模型都会 OOM。` }

  if (ratio.value > 30)
    return { level: 'warn' as const, title: '环境开销偏高', text: `占整卡 ${ratio.value.toFixed(0)}%，留给模型权重的空间不多。` }

  return {
    level: 'ok' as const,
    title: '环境可正常启动',
    text: `占整卡 ${ratio.value.toFixed(0)}%，剩余约 ${(vram - o.totalGB).toFixed(1)} GB 可用于加载模型权重与 KV cache。`,
  }
})

/** 系统层面的兼容性问题 */
const osWarnings = computed(() => {
  const list: string[] = []
  const id = os.value.id

  if (id === 'centos7') {
    list.push('CentOS 7 默认 Python 3.6，无法运行 vLLM，需先升级 Python 或源码编译指定 3.9+。')
    list.push('vLLM 官方不提供 CentOS 预编译 wheel，必须源码编译。')
  }
  if (id === 'ubuntu2004') {
    list.push('Ubuntu 20.04 上 PyTorch 2.x 官方 wheel 覆盖有限，部分版本可能需源码编译。')
  }
  if (os.value.backend === 'rocm') {
    list.push('ROCm 仅支持 AMD MI 系列卡，Nvidia 卡无法使用。')
  }

  // 国产系统特有提示
  if (id === 'kylin-v10-sp3') {
    list.push('麒麟分 x86 与 ARM（鲲鹏）两个版本。ARM 版上 vLLM 需从源码编译，官方未提供 ARM wheel。')
  }
  if (id === 'uos-server20') {
    list.push('统信 UOS 基于 CentOS 8，社区实测可运行，但 PyTorch wheel 覆盖不如 openEuler，缺包时需源码编译。')
  }
  if (id === 'anolis23') {
    list.push('龙蜥 Anolis OS 声明支持一键安装 NVIDIA 驱动与 CUDA，如遇驱动问题优先用其官方仓库。')
  }
  if (id.startsWith('openeuler')) {
    list.push('openEuler 社区提供 AI 容器镜像（SDK / 框架 / 模型应用三层），可避开宿主机依赖问题。')
  }

  return list
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        GPU 分析
      </h1>
      <p class="text-sm text-muted-foreground">
        选择显卡与运行环境，计算 vLLM 启动前环境本身占用的显存。
      </p>
    </div>

    <!-- 选择区 -->
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">显卡型号</Label>
        <Select v-model="gpuId">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <template v-for="grp in gpuGroups" :key="grp.label">
              <div class="px-2 py-1 text-[11px] text-muted-foreground">
                {{ grp.label }}
              </div>
              <SelectItem v-for="g in grp.items" :key="g.id" :value="g.id">
                {{ g.name }} · {{ g.vram }}GB
              </SelectItem>
            </template>
          </SelectContent>
        </Select>
        <p class="text-xs text-muted-foreground">
          {{ gpu.arch }}<template v-if="gpu.computeMajor"> · sm_{{ gpu.computeMajor }}</template><template v-if="gpu.note"> · {{ gpu.note }}</template>
        </p>
        <p v-if="gpuHint" class="text-xs text-amber-600 dark:text-amber-500">
          {{ gpuHint }}
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">操作系统</Label>
        <Select v-model="osId">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <template v-for="grp in osGroups" :key="grp.label">
              <div class="px-2 py-1 text-[11px] text-muted-foreground">
                {{ grp.label }}
              </div>
              <SelectItem v-for="o in grp.items" :key="o.id" :value="o.id">
                {{ o.label }}
              </SelectItem>
            </template>
          </SelectContent>
        </Select>
        <p class="text-xs text-muted-foreground">
          <template v-if="os.minDriver">驱动 ≥ {{ os.minDriver }}</template>
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">CUDA 版本</Label>
        <Select v-model="cudaId">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="c in cudaChoices" :key="c" :value="c">
              CUDA {{ c }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p class="text-xs text-muted-foreground">
          <template v-if="os.maxCuda && os.backend === 'cuda'">{{ os.label }} 最高支持 CUDA {{ os.maxCuda }}</template>
          <template v-else>{{ os.backend === 'rocm' ? 'ROCm 专用' : '不适用' }}</template>
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">PyTorch 版本</Label>
        <Select v-model="torchId">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="t in TORCH_CHOICES" :key="t" :value="t">
              PyTorch {{ t }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs text-muted-foreground">vLLM 版本</Label>
        <Select v-model="vllmId">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="v in VLLM_CHOICES" :key="v" :value="v">
              vLLM {{ v }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- 结果 -->
    <div class="rounded-lg border p-5">
      <div class="flex items-baseline gap-2">
        <span class="text-sm text-muted-foreground">环境显存开销</span>
        <span class="ml-auto text-3xl font-medium tabular-nums">{{ overhead.totalGB }}</span>
        <span class="text-sm text-muted-foreground">GB</span>
      </div>

      <div class="mt-4">
        <div class="flex h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            v-for="b in breakdown"
            :key="b.name"
            class="h-full"
            :class="b.color"
            :style="{ width: `${(b.value / gpu.vram) * 100}%` }"
            :title="`${b.name} ${b.value} GB`"
          />
        </div>
        <div class="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{{ gpu.name }} · {{ gpu.vram }} GB</span>
          <span>占 {{ ratio.toFixed(0) }}%</span>
        </div>
      </div>

      <div class="mt-4 overflow-hidden rounded-lg border">
        <div
          v-for="b in breakdown"
          :key="b.name"
          class="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0"
        >
          <span class="size-2.5 shrink-0 rounded-sm" :class="b.color" />
          <span class="flex-1" :class="b.bug ? 'text-red-600 dark:text-red-500' : ''">
            {{ b.name }}
          </span>
          <span class="font-mono tabular-nums text-muted-foreground">{{ b.value }} GB</span>
        </div>
      </div>
    </div>

    <!-- 结论 -->
    <Alert :variant="verdict.level === 'error' ? 'destructive' : 'default'">
      <AlertTitle>{{ verdict.title }}</AlertTitle>
      <AlertDescription>{{ verdict.text }}</AlertDescription>
    </Alert>

    <Alert v-for="w in osWarnings" :key="w">
      <AlertTitle>注意</AlertTitle>
      <AlertDescription>{{ w }}</AlertDescription>
    </Alert>

    <Alert v-for="(c, i) in overhead.compatIssues" :key="`c${i}`" variant="destructive">
      <AlertTitle>版本不兼容</AlertTitle>
      <AlertDescription>{{ c }}</AlertDescription>
    </Alert>

    <Alert v-if="overhead.caveat && !osWarnings.includes(overhead.caveat)">
      <AlertTitle>注意</AlertTitle>
      <AlertDescription>{{ overhead.caveat }}</AlertDescription>
    </Alert>

    <details class="rounded-lg border px-4 py-3">
      <summary class="cursor-pointer text-sm font-medium">
        计算依据
      </summary>
      <div class="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p class="font-medium text-foreground">
          数据来源
        </p>
        <p>
          <b class="text-foreground">CUDA context 约 0.3 GB</b> —— PyTorch 官方论坛（discuss.pytorch.org/t/122079）
          维护者说明：裸 CUDA context 首次调用 .cuda() 时占约 300 MiB，不可避免也无法释放。
        </p>
        <p>
          <b class="text-foreground">libtorch_cuda.so 约 0.5 GB</b> —— 同上来源。
          加载所有 GPU kernel 库，再加 cuDNN / cuBLAS 数十到数百 MB。
        </p>
        <p>
          <b class="text-foreground">caching allocator 约 0.4 GB</b> —— 同上来源。
          分配器会预留显存备用。社区实测 <code class="font-mono">torch.zeros(1, device='cuda')</code>
          后 nvidia-smi 显示约 1.2 GB，tensor 本身可忽略，剩下全是上述开销。
        </p>
        <p>
          <b class="text-foreground">NCCL 缓冲约 0.5 GB</b> —— 单卡量级。
          vLLM 官方 Rubin 博客在 GB300（288GB + TP8）上测到 2.90 GiB，那是多卡大显存场景。
        </p>
        <p>
          <b class="text-foreground">驱动开销约 0.5 GB</b> —— 官方博客在 GB300 上测到 2.28 GiB，
          消费级卡通常明显低于此；ECC 服务器卡（A100 等）会更高。
        </p>

        <p class="border-t pt-1 font-medium text-foreground">
          关于版本差异
        </p>
        <p>
          PyTorch 官方从未公布「不同版本占用不同显存」的数据。实际差异主要来自随版本加载的
          kernel 库体积与 FlashAttention / cuDNN 版本，而非固定系数。所以各 PyTorch 版本取值相同 ——
          与其编造差异化系数，不如诚实对待。
        </p>
        <p class="border-t pt-1">
          版本兼容性校验用的是官方公布的三张矩阵：
        </p>
        <p>
          ① PyTorch CUDA wheel —— 例如 torch 2.8.0 支持 cu126 / cu128 / cu129，不含 cu130
        </p>
        <p>
          ② NVIDIA 架构支持 —— sm_70 及以下（Maxwell / Pascal / Volta）在 CUDA 13.0
          已移除离线编译支持，最高只能 CUDA 12.x（来源 NVIDIA 开发者博客）
        </p>
        <p>
          ③ NVIDIA 驱动支持发行版 —— 麒麟 OS V10 在列；openEuler / 龙蜥 / 统信不在列，
          属社区方案（来源 NVIDIA 驱动安装指南）
        </p>

        <p class="border-t pt-1">
          若列表出现「版本缺陷额外占用」，说明该组合命中已知 bug，不是常规开销。
          已知一例：vllm 0.20.1 锁定的 torch 2.11.0 在 CUDA 13.0 上初始化多占约 22 GB
          （vLLM GitHub #42049，同机器换 torch 2.10.0 即恢复正常）。
        </p>
        <p class="border-t pt-1">
          以上都是「未加载模型」时的空载开销。加载模型后还需叠加权重与 KV cache 显存。
        </p>
      </div>
    </details>
  </div>
</template>