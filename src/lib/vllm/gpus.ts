/**
 * GPU 显存容量表。
 *
 * 只记录容量与基本规格，用于「环境显存开销能否装进这张卡」的判断。
 * 数据来自各厂商公开规格（2026）。
 */

export interface GpuSpec {
  id: string
  name: string
  /** 显存 GB */
  vram: number
  arch: string
  /**
   * CUDA 计算能力（sm_XX）。决定该卡能被哪些 CUDA 版本支持。
   * 来源：docs.nvidia.com/cuda/cuda-toolkit-driver-and-architecture-matrix
   */
  computeMajor?: number
  /** CUDA 之外的平台 */
  vendor?: 'nvidia' | 'ascend' | 'musa' | 'mlu' | 'dcu' | 'maca' | 'xpu'
  note?: string
}

/**
 * 各架构的 CUDA 12.x 支持情况（来源：NVIDIA 官方架构矩阵）。
 * sm_75 以下（Maxwell / Pascal / Volta）在 CUDA 13.0 中已移除离线编译支持。
 */
export const ARCH_CUDA_MAX: Record<number, string> = {
  5: '12.8', // Maxwell
  6: '12.8', // Pascal
  7: '12.8', // Volta（sm_70/72）
  75: '13.0', // Turing
  80: '13.0', // Ampere
  86: '13.0', // Ampere
  89: '13.0', // Ada
  90: '13.0', // Hopper
  100: '13.0', // Blackwell
}

export const GPUS: GpuSpec[] = [
  // NVIDIA 数据中心
  { id: 'b200', name: 'NVIDIA B200', vram: 192, arch: 'Blackwell', computeMajor: 100, vendor: 'nvidia' },
  { id: 'h200', name: 'NVIDIA H200', vram: 141, arch: 'Hopper', computeMajor: 90, vendor: 'nvidia' },
  { id: 'h100-nvl', name: 'NVIDIA H100 NVL', vram: 94, arch: 'Hopper', computeMajor: 90, vendor: 'nvidia' },
  { id: 'h100', name: 'NVIDIA H100 SXM / PCIe', vram: 80, arch: 'Hopper', computeMajor: 90, vendor: 'nvidia' },
  { id: 'a100-80', name: 'NVIDIA A100 80GB', vram: 80, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'a100-40', name: 'NVIDIA A100 40GB', vram: 40, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'l40s', name: 'NVIDIA L40S', vram: 48, arch: 'Ada Lovelace', computeMajor: 89, vendor: 'nvidia' },
  { id: 'l40', name: 'NVIDIA L40', vram: 48, arch: 'Ada Lovelace', computeMajor: 89, vendor: 'nvidia' },
  { id: 'rtx-pro-6000', name: 'NVIDIA RTX PRO 6000 Blackwell', vram: 96, arch: 'Blackwell', computeMajor: 100, vendor: 'nvidia' },
  { id: 'rtx6000-ada', name: 'NVIDIA RTX 6000 Ada', vram: 48, arch: 'Ada Lovelace', computeMajor: 89, vendor: 'nvidia' },
  { id: 'a6000', name: 'NVIDIA A6000', vram: 48, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'l4', name: 'NVIDIA L4', vram: 24, arch: 'Ada Lovelace', computeMajor: 89, vendor: 'nvidia' },
  { id: 'a30', name: 'NVIDIA A30', vram: 24, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'a10g', name: 'NVIDIA A10G', vram: 24, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'a10', name: 'NVIDIA A10', vram: 24, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 'rtx-a5000', name: 'NVIDIA RTX A5000', vram: 24, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },
  { id: 't4', name: 'NVIDIA T4', vram: 16, arch: 'Turing', vendor: 'nvidia', note: '不支持 bf16，需转 fp16' },

  // NVIDIA 消费级
  { id: 'rtx5090', name: 'NVIDIA RTX 5090', vram: 32, arch: 'Blackwell', computeMajor: 100, vendor: 'nvidia' },
  { id: 'rtx4090', name: 'NVIDIA RTX 4090', vram: 24, arch: 'Ada Lovelace', vendor: 'nvidia', note: '无 NVLink，多卡通信走 PCIe' },
  { id: 'rtx4080s', name: 'NVIDIA RTX 4080 SUPER', vram: 16, arch: 'Ada Lovelace', computeMajor: 89, vendor: 'nvidia' },
  { id: 'rtx3090', name: 'NVIDIA RTX 3090', vram: 24, arch: 'Ampere', vendor: 'nvidia', note: '无 NVLink，多卡通信走 PCIe' },
  { id: 'rtx3080', name: 'NVIDIA RTX 3080', vram: 10, arch: 'Ampere', computeMajor: 86, vendor: 'nvidia' },

  // 国产芯片
  { id: 'ascend910b', name: '华为昇腾 910B', vram: 64, arch: '达芬奇', vendor: 'ascend', note: '需 vllm-ascend 适配包' },
  { id: 'ascend910c', name: '华为昇腾 910C', vram: 64, arch: '达芬奇', vendor: 'ascend', note: '需 vllm-ascend 适配包' },
  { id: 'mthreads-s4000', name: '摩尔线程 MTT S4000', vram: 48, arch: 'MUSA', vendor: 'musa', note: '需 vllm-musa，建议 --enforce-eager' },
  { id: 'mlu590', name: '寒武纪 MLU590', vram: 96, arch: 'MLA', vendor: 'mlu', note: '需 vllm-mlu' },
  { id: 'dcu-z100', name: '海光 DCU Z100', vram: 32, arch: 'DCU', vendor: 'dcu', note: '基于 ROCm 生态' },
  { id: 'metax-c500', name: '沐曦 MXC C500', vram: 64, arch: 'MACA', vendor: 'maca', note: 'CUDA 风格 API，兼容性最好' },
  { id: 'kunlun-p800', name: '百度昆仑芯 P800', vram: 32, arch: 'XPU', vendor: 'xpu', note: '需 vllm-kunlun' },
]

/** 按厂商分组 */
export function groupByVendor(gpus: GpuSpec[]): Array<{ label: string, items: GpuSpec[] }> {
  const domestic = gpus.filter(g => g.vendor && g.vendor !== 'nvidia')
  const nvidia = gpus.filter(g => !g.vendor || g.vendor === 'nvidia')
  return [
    { label: 'NVIDIA', items: nvidia },
    { label: '国产芯片', items: domestic },
  ].filter(g => g.items.length)
}