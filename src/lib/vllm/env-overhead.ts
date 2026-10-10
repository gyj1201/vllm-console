/**
 * vLLM 运行环境：操作系统 / PyTorch / vLLM 版本组合。
 *
 * 用途：计算「vLLM 启动前，运行环境本身占多少显存」，
 * 即还没加载任何模型权重时的固定开销。
 */

export type Backend = 'cuda' | 'rocm' | 'cpu'

export interface OsSpec {
  id: string
  label: string
  backend: Backend
  /** 支持的 CUDA 上限（不含则为该后端默认） */
  maxCuda?: string
  /**
   * 该系统上可安装的 NVIDIA 驱动分支上限。
   * 用于粗判 CUDA 版本要求是否可达 —— 用户若已手动安装更高分支则不受此限。
   */
  minDriver?: string
  /** 国内发行版归属 */
  domestic?: boolean
  note?: string
}

export const OS_LIST: OsSpec[] = [
  // ---- 国际发行版 ----
  {
    id: 'ubuntu2204',
    label: 'Ubuntu 22.04 LTS',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '580',
    note: 'vLLM 官方文档首选，wheel 覆盖最全',
  },
  {
    id: 'ubuntu2404',
    label: 'Ubuntu 24.04 LTS',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '580',
    note: 'CUDA 13 需 570+ 驱动；部分旧 wheel 无预编译包',
  },
  {
    id: 'ubuntu2004',
    label: 'Ubuntu 20.04 LTS',
    backend: 'cuda',
    maxCuda: '12.4',
    minDriver: '580',
    note: '较旧，PyTorch 2.x 官方 wheel 已逐步停供',
  },
  {
    id: 'debian12',
    label: 'Debian 12',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '580',
    note: '社区方案，官方未列为主力平台',
  },

  // ---- 国内发行版 ----
  {
    id: 'openeuler2403',
    label: 'openEuler 24.03 LTS SP3',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '525',
    domestic: true,
    note: '官方社区有 vLLM 实测报告，支持 x86 / 鲲鹏 / NVIDIA 与昇腾',
  },
  {
    id: 'openeuler2203',
    label: 'openEuler 22.03 LTS SP4',
    backend: 'cuda',
    maxCuda: '12.4',
    minDriver: '525',
    domestic: true,
    note: '鲲peng生态常用版本（ARM64），社区有 vLLM 适配实践',
  },
  {
    id: 'anolis23',
    label: 'Anolis OS 23（龙蜥）',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '525',
    domestic: true,
    note: 'CentOS 替代方案，内置 NVIDIA 驱动与 CUDA 一键安装',
  },
  {
    id: 'kylin-v10-sp3',
    label: '银河麒麟 Kylin V10 SP3',
    backend: 'cuda',
    maxCuda: '12.4',
    minDriver: '525',
    domestic: true,
    note: '政企常见。ARM 麒麟 V10 SP2 + 鲲鹏 + 昇腾有社区部署实践',
  },
  {
    id: 'uos-server20',
    label: '统信 UOS Server 20',
    backend: 'cuda',
    maxCuda: '12.4',
    minDriver: '525',
    domestic: true,
    note: '基于 CentOS 8，社区实测可用；wheel 覆盖不如 openEuler',
  },
  {
    id: 'centos-stream9',
    label: 'CentOS Stream 9',
    backend: 'cuda',
    maxCuda: '12.9',
    minDriver: '580',
    note: 'CentOS 替代方案，社区实测可用',
  },
  {
    id: 'centos7',
    label: 'CentOS 7.9',
    backend: 'cuda',
    maxCuda: '12.4',
    minDriver: '470',
    note: '需源码编译，vLLM 官方不提供 CentOS 预编译包；Python 3.6/3.7 无法运行',
  },

  // ---- 其他 ----
  {
    id: 'rocm-ubuntu2204',
    label: 'Ubuntu 22.04 · ROCm（AMD）',
    backend: 'rocm',
    note: 'AMD GPU 专用，需 ROCm 驱动与 MI 系列卡',
  },
  {
    id: 'cpu',
    label: '任意 Linux（CPU only）',
    backend: 'cpu',
    note: '不占用 GPU 显存，仅供测试',
  },
]

// ---------------------------------------------------------------------------
// 版本选项
// ---------------------------------------------------------------------------

export const TORCH_CHOICES = ['2.11.0', '2.10.0', '2.9.0', '2.8.0', '2.7.1']
export const VLLM_CHOICES = ['0.29.0', '0.28.0', '0.20.2', '0.20.1', '0.10.0', 'latest']

/** 常见 CUDA 版本 */
export const CUDA_CHOICES = ['12.4', '12.6', '12.8', '12.9', '13.0']

// ---------------------------------------------------------------------------
// 显存开销
// ---------------------------------------------------------------------------

/**
 * 各组件的空载显存开销（单卡，GB）。
 *
 * 注意区分两件事：
 * - 常规开销：任何 CUDA 程序的固定底线
 * - 已知 bug：特定版本组合触发的异常额外分配，属个案而非常态
 *
 * 【数据来源，逐项有出处】
 *
 * 1. CUDA context ≈ 0.3 GB
 *    来源：PyTorch 官方论坛 discuss.pytorch.org/t/122079（PyTorch 维护者回复）
 *    "a bare CUDA context on a GPU will use about 300MiB VRAM"
 *    第一次调用 .cuda() 时初始化，不可避免也无法释放。
 *
 * 2. libtorch_cuda.so ≈ 0.5 GB
 *    来源：同上。"libtorch_cuda.so (containing all GPU kernels for various tensor
 *    operators) will be loaded into VRAM taking another 500MiB or so"
 *    之后加载 cuDNN / cuBLAS 还会再加数十到数百 MB。
 *
 * 3. caching allocator 预留 ≈ 0.4 GB
 *    来源：同上。"the caching allocator may reserve additional GPU memory
 *    ahead of time even before it is required"
 *    社区实测：`torch.zeros(1, device='cuda')` 后 nvidia-smi 显示约 1.2 GB，
 *    其中 tensor 本身可忽略，剩下全是 context + 库 + allocator。
 *
 * 4. NCCL 通信缓冲 ≈ 0.5 GB（单卡）
 *    多卡场景显著更高。vLLM 官方 Rubin 博客在 GB300（288GB 卡 + TP8）上测到 2.90 GiB，
 *    那是多卡大显存的场景，单卡远低于此。
 *
 * 5. driver overhead ≈ 0.5 GB
 *    vLLM 官方 Rubin 博客实测 2.28 GiB @ GB300，同样是大显存多卡系统。
 *    消费级卡通常明显低于此。
 *
 * 结论：单卡空载开销合理区间约 2-3 GB，超出部分留给具体硬件差异
 * （ECC 卡、A100 等服务器卡会更高）。
 *
 * 【关于版本差异的说明】
 * PyTorch 官方从未公布「不同版本占不同显存」的官方数据。实际差异主要来自
 * 随版本加载的 kernel 库体积（libtorch_cuda.so 数百 MB 级）与 FlashAttention / cuDNN 版本，
 * 而非某个固定系数。因此各版本取值相同 —— 与其编造差异化系数，不如诚实对待。
 */

/** CUDA context：约 0.3 GB（PyTorch 官方论坛实测） */
const CUDA_CONTEXT_GB = 0.3
/** libtorch_cuda.so 及依赖库：约 0.5 GB（同上） */
const LIBTORCH_GB = 0.5
/** caching allocator 预留：0.3-0.5 GB，取中值 */
const ALLOCATOR_GB = 0.4
/** NCCL 通信缓冲：单卡百 MB 量级 */
const NCCL_GB = 0.5
/** 驱动侧开销，与卡型/系统相关 */
const DRIVER_GB = 0.5

/** ROCm 无官方实测数据，取保守值 */
const CONTEXT_GB_ROCM = 2.5

/** PyTorch 运行时开销 = libtorch + allocator + context */
const TORCH_NORMAL_GB: Record<string, number> = {
  '2.11.0': LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB,
  '2.10.0': LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB,
  '2.9.0': LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB,
  '2.8.0': LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB,
  '2.7.1': LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB,
}

/**
 * 已知会异常占用显存的版本组合。
 *
 * 目前仅一条：vllm 0.20.1 硬锁 torch 2.11.0，在 cu130 上初始化即吃约 22 GB。
 * 来源：GitHub issue #42049 —— 同一台 3×RTX 4090 机器，
 * torch 2.10.0+cu130 开销约 0 GiB，torch 2.11.0+cu130 则为 22-23 GiB。
 * 这说明不是 PyTorch 本身的常规开销，而是该版本的 ABI 兼容缺陷。
 */
const BUGGY_COMBOS: Array<{ vllm: string, torch: string, cuda: string, extraGB: number, issue: string }> = [
  { vllm: '0.20.1', torch: '2.11.0', cuda: '13.0', extraGB: 22.0, issue: '#42049' },
]

export interface EnvOverhead {
  /** 驱动与 CUDA context */
  contextGB: number
  /** PyTorch 运行时 + 库加载 */
  torchGB: number
  /** NCCL 通信缓冲与分配器 */
  ncclGB: number
  /** 已知 bug 导致的额外占用，非正常开销 */
  bugExtraGB: number
  /** 合计 */
  totalGB: number
  /** 版本兼容性问题 */
  compatIssues: string[]
  caveat?: string
}

/**
 * PyTorch 官方公布的 CUDA wheel 组合（摘自 pytorch.org 与 PyG 安装文档）。
 * 用于校验用户选的 CUDA × PyTorch 是否存在官方预编译包。
 */
const TORCH_CUDA_SUPPORT: Record<string, string[]> = {
  '2.11.0': ['12.6', '12.8', '13.0'],
  '2.10.0': ['12.6', '12.8', '13.0'],
  '2.9.0': ['12.6', '12.8', '12.9', '13.0'],
  '2.8.0': ['12.6', '12.8', '12.9'],
  '2.7.1': ['11.8', '12.6', '12.8'],
}

/** 各 CUDA 版本要求的最低 NVIDIA 驱动 */
const CUDA_MIN_DRIVER: Record<string, string> = {
  '11.8': '450',
  '12.4': '525',
  '12.6': '525',
  '12.8': '525',
  '12.9': '525',
  '13.0': '570',
}

/**
 * NVIDIA 官方公布的驱动支持发行版（节选自 docs.nvidia.com 驱动安装指南）。
 * 未列出的发行版属于「RHEL 兼容」或「社区支持」，问题不在 NVIDIA 支持范围内。
 */
const NVIDIA_OFFICIAL_OS = new Set([
  'ubuntu2204',
  'ubuntu2404',
  'ubuntu2004',
  'debian12',
  'centos-stream9',
  'centos7',
  'kylin-v10-sp3', // 麒麟OS V10 SP3 在官方支持列表中
])

/** NVIDIA 未正式列出的发行版 —— 说明是社区方案 */
const NVIDIA_UNLISTED_OS: Record<string, string> = {
  openeuler2403: 'openEuler',
  openeuler2203: 'openEuler',
  anolis23: 'Anolis OS（龙蜥）',
  'uos-server20': '统信 UOS',
}

function checkCompat(
  os: OsSpec,
  gpu: { name: string, computeMajor?: number },
  torch: string,
  cuda: string,
): string[] {
  const issues: string[] = []

  // 1. PyTorch × CUDA 是否有官方 wheel
  const supported = TORCH_CUDA_SUPPORT[torch]
  if (supported && !supported.includes(cuda)) {
    issues.push(
      `PyTorch ${torch} 官方未提供 CUDA ${cuda} 的预编译 wheel`
      + `（该版本支持：${supported.map(c => `cu${c}`).join(' / ')}），此组合需从源码编译。`,
    )
  }

  // 2. GPU 架构 × CUDA 版本
  //    官方矩阵：sm_70 及以下（Maxwell / Pascal / Volta）在 CUDA 13.0 移除离线编译支持
  if (gpu.computeMajor && gpu.computeMajor < 75 && Number(cuda) >= 13) {
    issues.push(
      `${gpu.name}（sm_${gpu.computeMajor}）属老架构，CUDA 13.0 已移除对其的离线编译支持，`
      + '最高只能用 CUDA 12.x。',
    )
  }

  // 3. 驱动版本要求
  //    只在系统标注的驱动明确低于要求时提示。标注值为「常见配套版本」，
  //    用户实际可自行升级驱动到更高分支，故不作硬性拦截。
  const minDriver = CUDA_MIN_DRIVER[cuda]
  if (minDriver && os.minDriver && Number(os.minDriver) < Number(minDriver)) {
    const gap = Number(minDriver) - Number(os.minDriver)
    if (gap >= 40) {
      issues.push(
        `CUDA ${cuda} 需要 NVIDIA 驱动 ≥ ${minDriver}，而 ${os.label} 常见配套驱动为 ${os.minDriver}。`
        + '若已安装更高版本分支的驱动可忽略。',
      )
    }
  }

  // 4. NVIDIA 官方支持范围
  if (!NVIDIA_OFFICIAL_OS.has(os.id)) {
    const name = NVIDIA_UNLISTED_OS[os.id]
    if (name) {
      issues.push(
        `${name} 不在 NVIDIA 官方驱动的支持列表中（属 RHEL 兼容或社区方案）。`
        + '驱动能装上，但遇到问题时官方不受理。',
      )
    }
  }

  return issues
}

export function envOverhead(
  os: OsSpec,
  torch: string,
  vllm: string,
  cuda: string,
  gpu?: { name: string, computeMajor?: number },
): EnvOverhead {
  if (os.backend === 'cpu') {
    return {
      contextGB: 0,
      torchGB: 0,
      ncclGB: 0,
      bugExtraGB: 0,
      totalGB: 0,
      compatIssues: [],
      caveat: 'CPU 推理不占用 GPU 显存',
    }
  }

  const contextGB = os.backend === 'rocm' ? CONTEXT_GB_ROCM : DRIVER_GB + CUDA_CONTEXT_GB
  const torchGB = TORCH_NORMAL_GB[torch] ?? (LIBTORCH_GB + ALLOCATOR_GB + CUDA_CONTEXT_GB)
  const ncclGB = NCCL_GB

  const bug = BUGGY_COMBOS.find(b => b.vllm === vllm && b.torch === torch && b.cuda === cuda)
  const bugExtraGB = bug?.extraGB ?? 0

  const totalGB = contextGB + torchGB + ncclGB + bugExtraGB

  const compatIssues = gpu ? checkCompat(os, gpu, torch, cuda) : checkCompat(os, { name: '' }, torch, cuda)

  return {
    contextGB: Math.round(contextGB * 100) / 100,
    torchGB: Math.round(torchGB * 100) / 100,
    ncclGB: Math.round(ncclGB * 100) / 100,
    bugExtraGB: Math.round(bugExtraGB * 10) / 10,
    totalGB: Math.round(totalGB * 100) / 100,
    compatIssues,
    caveat: bug
      ? `此组合命中已知缺陷（vLLM GitHub ${bug.issue}）：vllm 0.20.1 锁定的 torch ${bug.torch} 在 CUDA ${bug.cuda} 上初始化时额外占用约 ${bug.extraGB} GB。这不是 PyTorch 的常规开销 —— 同机器换成 torch 2.10.0 即恢复正常。规避方式：vllm 升到 0.20.2，或 CUDA 降到 12.9。`
      : os.note,
  }
}