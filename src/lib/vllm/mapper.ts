/**
 * 映射引擎：把 config.json / generation_config.json 的字段翻译成 vLLM 启动参数。
 *
 * 设计原则：
 * 1. 只输出「有依据」的参数 —— 每个参数都要能追溯到 config 里的某个字段，
 *    避免给出一堆看起来专业但其实是瞎猜的默认值。
 * 2. 区分「自动推断」与「需要人工决策」——后者以 warning 形式提示，而非直接塞进命令。
 */

import { detectModalities as detectNormalizedModalities, normalizeConfig } from './normalize'

export type Confidence = 'high' | 'medium' | 'low'

export interface VllmParam {
  name: string
  /** flag 型参数（无值）为 true */
  value: string | null
  /** 该参数的推断依据，展示给用户看 */
  from: string
  confidence: Confidence
  flag?: boolean
}

export interface VllmWarning {
  level: 'info' | 'warn' | 'err'
  text: string
}

export interface VllmHint {
  title: string
  detail: string
}

export interface QuantInfo {
  method: string
  bits: number | null
  raw: Record<string, any>
  notes: string[]
}

export interface ModalitiesInfo {
  types: Array<'vision' | 'audio'>
  isMultimodal: boolean
  architectures: string[]
}

export interface VllmResult {
  params: VllmParam[]
  warnings: VllmWarning[]
  hints: VllmHint[]
  quant: QuantInfo | null
  modalities: ModalitiesInfo
  contextLength: number | null
  /** 估算参数量，单位 B */
  paramsBillion: number | null
  /** KV cache 特征，用于显存估算 */
  kvShape: {
    layers: number | null
    kvHeads: number | null
    headDim: number | null
  }
  sampling: Record<string, any>
  architectures: string[]
  sourceModelType: string
  trustRemoteCode: boolean
}

export interface BuildInput {
  config: Record<string, any>
  generationConfig?: Record<string, any> | null
  tokenizerConfig?: Record<string, any> | null
  preprocessorConfig?: Record<string, any> | null
}

// ---------------------------------------------------------------------------
// 量化方式识别
// ---------------------------------------------------------------------------

const QUANT_METHOD_MAP: Record<string, string> = {
  gptq: 'gptq',
  awq: 'awq',
  awq_gemm: 'awq',
  awq_marlin: 'awq_marlin',
  gptq_marlin: 'gptq_marlin',
  gptq_marlin_24: 'gptq_marlin',
  compressed_tensors: 'compressed-tensors',
  bitsandbytes: 'bitsandbytes',
  gguf: 'gguf',
  fp8: 'fp8',
  modelopt: 'modelopt',
  fbgemm_fp8: 'fbgemm_fp8',
  mxfp4: 'mxfp4',
  aqlm: 'aqlm',
  squeezellm: 'squeezellm',
  quark: 'quark',
}

function detectQuantization(config: Record<string, any>): QuantInfo | null {
  const qc = config?.quantization_config
  if (!qc)
    return null

  const method = String(qc.quant_method ?? '').toLowerCase()
  const bits = qc.bits ?? qc.weight_bits ?? qc.w_bit ?? null

  let vllmQuant = QUANT_METHOD_MAP[method] ?? null
  if (!vllmQuant) {
    const weightType = qc.weight_type ?? qc.quant_type
    if (weightType === 'fp8')
      vllmQuant = 'fp8'
    else if (method)
      vllmQuant = method
  }

  if (!vllmQuant)
    return null

  const notes: string[] = []
  if (Array.isArray(qc.ignore) && qc.ignore.includes('lm_head'))
    notes.push('lm_head 未量化，vLLM 会在该层保留较高精度')
  if (qc.group_size && qc.group_size !== -1)
    notes.push(`group_size=${qc.group_size}`)
  if (bits)
    notes.push(`${bits} bit`)

  return { method: vllmQuant, bits, raw: qc, notes }
}

// ---------------------------------------------------------------------------
// 上下文长度推断
// ---------------------------------------------------------------------------

function inferContextLength(config: Record<string, any>): { value: number | null, notes: string[] } {
  const maxPos = typeof config?.max_position_embeddings === 'number' ? config.max_position_embeddings : null
  const rope = config?.rope_scaling
  const sliding = config?.sliding_window
  const useSliding = config?.use_sliding_window
  const notes: string[] = []

  // 注意：Llama-3 这类模型 sliding_window 是「某几层用的窗口」，
  // 若 use_sliding_window 为 false，它并不限制整体上下文，不要误报。
  const isEffectiveSliding = useSliding === true && typeof sliding === 'number'

  if (rope && typeof rope === 'object') {
    const ropeType = rope.type ?? rope.rope_type
    if (ropeType === 'linear' && typeof rope.factor === 'number')
      notes.push(`rope_scaling=linear，factor=${rope.factor}，vLLM 会自动应用`)
    else if (['dynamic', 'yarn', 'llama3'].includes(ropeType))
      notes.push(`rope_scaling=${ropeType}，vLLM 已内建支持`)
    else if (ropeType === 'mrope')
      notes.push('rope_scaling=mrope，属于多模态位置编码')
  }

  if (isEffectiveSliding && maxPos && sliding < maxPos)
    notes.push(`启用了 sliding_window=${sliding}（仅作用于部分层）`)
  else if (sliding && sliding > (maxPos ?? 0))
    notes.push(`sliding_window=${sliding} 大于 max_position_embeddings，实际以后者为准`)

  return { value: maxPos, notes }
}

// ---------------------------------------------------------------------------
// 模态与架构识别
// ---------------------------------------------------------------------------

function detectModalities(config: Record<string, any>): ModalitiesInfo {
  const architectures: string[] = config?.architectures ?? []
  // 归一化模块做了三路判断：显式字段 → 视觉/音频塔 → 架构名
  const types = detectNormalizedModalities(config)
  return { types, isMultimodal: types.length > 0, architectures }
}

// ---------------------------------------------------------------------------
// 参数量估算
// ---------------------------------------------------------------------------

/**
 * 用 config 字段粗算参数量（B），避免依赖仓库上的文件大小。
 * 公式按 SwiGLU + GQA 的常见结构推导，误差约 1-3%。
 *
 * 注意：GQA 下 K/V 投影是 hidden→kvHeads*headDim，不能按全尺寸算，
 * 否则 Qwen2.5-7B 会算成 8.33B（实际 7.62B）。
 */
function estimateParams(config: Record<string, any>): number | null {
  const L = config?.num_hidden_layers
  const H = config?.hidden_size
  const I = config?.intermediate_size
  if (!L || !H || !I)
    return null

  const vocabSize = config?.vocab_size ?? 32000
  const heads = config?.num_attention_heads
  const kvHeads = config?.num_key_value_heads ?? heads
  const headDim = config?.head_dim ?? (heads && H ? Math.floor(H / heads) : null)

  // 每层注意力：Q/O 为 hidden→heads*headDim，K/V 为 hidden→kvHeads*headDim
  const qoDim = heads && headDim ? heads * headDim : H
  const kdDim = kvHeads && headDim ? kvHeads * headDim : H
  const attnPerLayer = 2 * H * qoDim + 2 * H * kdDim

  // 每层 FFN：SwiGLU 有 gate / up / down 三个矩阵
  const ffnPerLayer = 3 * H * I

  // 每层两个 RMSNorm（input_layernorm + post_attention_layernorm），各 H 个参数
  const normsPerLayer = 2 * H

  const backbone = L * (attnPerLayer + ffnPerLayer + normsPerLayer)
  const embedCount = config?.tie_word_embeddings ? 1 : 2
  const embeddings = embedCount * vocabSize * H

  // 视觉塔 / 音频塔（字段名已由 normalize 统一为 num_hidden_layers）
  let towerParams = 0
  for (const tower of [config?._vision, config?._audio]) {
    if (!tower?.hidden_size || !tower?.num_hidden_layers)
      continue
    const th = tower.hidden_size
    const tl = tower.num_hidden_layers
    const ti = tower.intermediate_size
    const theads = tower.num_attention_heads || 1
    const theadDim = tower.head_dim ?? Math.floor(th / theads)
    const tkv = tower.num_key_value_heads ?? theads

    // 注意力 + FFN + 每层两个 norm
    let perLayer = 2 * th * theads * theadDim + 2 * th * tkv * theadDim + 2 * th
    if (ti)
      perLayer += 3 * th * ti
    else if (tower.intermediate_size === undefined && tower.ffn_dim)
      perLayer += 2 * th * tower.ffn_dim

    towerParams += tl * perLayer

    // 位置编码（部分模型有）
    if (tower.image_size && tower.patch_size)
      towerParams += (tower.image_size / tower.patch_size) ** 2 * th
  }

  const vision = towerParams

  // 模型末尾的 final_norm，H 个参数
  const finalNorm = H

  return Math.round(((backbone + embeddings + vision + finalNorm) / 1e9) * 100) / 100
}

// ---------------------------------------------------------------------------
// dtype 决策
// ---------------------------------------------------------------------------

function decideDtype(config: Record<string, any>, quant: QuantInfo | null): { value: string | null, reason: string } {
  // 量化模型：vLLM 会自行处理激活精度，dtype 一般不用手动指定
  if (quant)
    return { value: null, reason: '量化模型由 vLLM 自动处理计算精度，无需手动指定 dtype' }

  const td = config?.torch_dtype ?? config?.dtype
  if (!td)
    return { value: null, reason: 'config 未声明 torch_dtype，留给 vLLM 自动判定' }

  const map: Record<string, string> = {
    bfloat16: 'bfloat16',
    float16: 'float16',
    float32: 'float32',
    float64: 'float64',
    half: 'float16',
    bfloat16_lean: 'bfloat16',
  }
  const v = map[String(td).toLowerCase()]
  if (!v)
    return { value: null, reason: `torch_dtype=${td} 不在常见取值内` }

  return { value: v, reason: `来自 config.torch_dtype=${td}` }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export function buildVllmConfig(input: BuildInput): VllmResult {
  const { config: rawConfig, generationConfig, tokenizerConfig, preprocessorConfig } = input

  // 先归一化：处理 text_config 嵌套、视觉塔 depth/num_hidden_layers 命名差异
  const config = normalizeConfig(rawConfig)

  const params: VllmParam[] = []
  const warnings: VllmWarning[] = []
  const hints: VllmHint[] = []

  const quant = detectQuantization(config)
  const mod = detectModalities(config)
  const ctx = inferContextLength(config)
  const dtype = decideDtype(config, quant)
  const paramsB = estimateParams(config)

  // 配置本身不完整时明确告知，而不是显示「未知」
  if (!paramsB) {
    hints.push({
      title: '配置不完整',
      detail: '该模型的 config.json 未提供层数 / hidden_size / intermediate_size 等结构字段，'
        + '无法计算参数量与 KV cache 特征。这类情况多见于多模态模型把参数放在嵌套结构里，'
        + '可查看下方原始 JSON 确认。',
    })
  }

  // --- 量化 ---
  if (quant) {
    params.push({
      name: '--quantization',
      value: quant.method,
      from: 'config.quantization_config.quant_method',
      confidence: 'high',
    })
    if (quant.notes.length)
      hints.push({ title: '量化配置', detail: quant.notes.join('，') })
    if (quant.method === 'gguf') {
      warnings.push({ level: 'warn', text: 'GGUF 模型建议直接用 llama.cpp 系列工具，vLLM 对其支持有限' })
    }
    if (quant.method === 'gptq' && quant.bits === 4) {
      hints.push({ title: 'GPTQ 加速', detail: '可追加 --quantization gptq_marlin 以启用 Marlin kernel（需较新 vLLM）' })
    }
  }

  // --- dtype ---
  if (dtype.value) {
    params.push({ name: '--dtype', value: dtype.value, from: dtype.reason, confidence: 'high' })
  }

  // --- 上下文长度 ---
  if (ctx.value) {
    params.push({
      name: '--max-model-len',
      value: String(ctx.value),
      from: 'config.max_position_embeddings',
      confidence: 'high',
    })
    if (ctx.value >= 131072) {
      warnings.push({
        level: 'warn',
        text: `原生 ${ctx.value} 上下文很大，直接开满会显著吃 KV cache 显存，建议先用 --max-model-len 32768 起步验证`,
      })
    }
    if (ctx.notes.length)
      hints.push({ title: '上下文说明', detail: ctx.notes.join('；') })
  }
  else {
    warnings.push({ level: 'warn', text: 'config 中未找到 max_position_embeddings，需手动确认模型实际支持的上下文长度' })
  }

  // --- 多模态 ---
  if (mod.isMultimodal) {
    const label = mod.types.map(t => (t === 'vision' ? '视觉' : '音频')).join('+')
    params.push({
      name: '--limit-mm-per-prompt',
      value: '{"image": 1}',
      from: `architectures 识别为多模态（${label}）`,
      confidence: 'medium',
    })
    hints.push({
      title: '多模态模型',
      detail: `检测到${label}能力。上面的 --limit-mm-per-prompt 是保守默认值，请按业务实际需要调整；纯文本场景可直接去掉。`,
    })
    if (preprocessorConfig?.patch_size) {
      hints.push({ title: '图像切分', detail: `patch_size=${preprocessorConfig.patch_size}，若显存紧张可降低 max_pixels` })
    }
  }

  // --- 特殊 rope ---
  // 注意：rope_scaling 含 mrope_section（Qwen2-VL 等）时，vLLM 内部会自动应用，
  // 不需要、也不应该手动传 --mm-processor-kwargs。此处只做提示。
  const rope = config?.rope_scaling
  if (rope && typeof rope === 'object' && (rope.type === 'mrope' || rope.mrope_section)) {
    hints.push({
      title: '多模态位置编码',
      detail: 'rope_scaling 含 mrope_section，vLLM 会自动处理，无需手动传 --mm-processor-kwargs',
    })
  }

  // --- trust-remote-code 提示 ---
  const needsTrust = Boolean(
    tokenizerConfig?.processor_class
    || config?.auto_map
    || mod.architectures.some((a) => /InternVLChatModel|ChatGLMForConditionalGeneration|XlmR/.test(a)),
  )

  if (needsTrust) {
    warnings.push({
      level: 'info',
      text: '该模型使用自定义代码实现，大概率需要追加 --trust-remote-code，请确认来源可信后再开启',
    })
    params.push({
      name: '--trust-remote-code',
      value: null,
      from: '检测到自定义模型代码',
      confidence: 'medium',
      flag: true,
    })
  }

  // --- chat template ---
  if (tokenizerConfig && !tokenizerConfig.chat_template) {
    hints.push({
      title: '缺少 chat template',
      detail: '未找到 chat_template，对话接口可能无法正常工作，需通过 --chat-template 指定外部模板文件',
    })
  }

  // --- 采样默认值（仅展示，不进启动命令）---
  const sampling: Record<string, any> = {}
  if (generationConfig) {
    for (const k of ['temperature', 'top_p', 'top_k', 'repetition_penalty', 'do_sample']) {
      if (generationConfig[k] !== undefined && generationConfig[k] !== null)
        sampling[k] = generationConfig[k]
    }
  }

  return {
    params,
    warnings,
    hints,
    quant,
    modalities: mod,
    contextLength: ctx.value,
    paramsBillion: paramsB,
    kvShape: {
      layers: config?.num_hidden_layers ?? null,
      kvHeads: config?.num_key_value_heads ?? null,
      headDim: config?.head_dim ?? (config?.hidden_size && config?.num_attention_heads
        ? Math.floor(config.hidden_size / config.num_attention_heads)
        : null),
    },
    sampling,
    architectures: mod.architectures,
    sourceModelType: config?.model_type ?? '未知',
    trustRemoteCode: needsTrust,
  }
}

// ---------------------------------------------------------------------------
// 命令渲染
// ---------------------------------------------------------------------------

function quoteIfNeeded(v: unknown): string {
  if (v === null || v === undefined)
    return ''
  const s = String(v)
  if (!s)
    return '""'

  // 含 JSON 对象时必须用单引号包裹 —— 双引号会与 JSON 内的双引号冲突。
  // 例：--limit-mm-per-prompt='{"image": 1}'
  // 若写成 --limit-mm-per-prompt="{"image": 1}"，bash 会把内层引号当成结束符，
  // 最终传成 {image: 1}，vLLM 解析 JSON 失败。
  if (/[\s"']/.test(s)) {
    if (s.includes('"')) {
      return `'${s.replace(/'/g, '\'\\\'\'')}'`
    }
    return `"${s}"`
  }
  return s
}

export function renderCommand(params: VllmParam[], modelPath: string): string {
  const parts = ['vllm serve', quoteIfNeeded(modelPath)]
  for (const p of params) {
    parts.push(p.flag ? p.name : `${p.name}=${quoteIfNeeded(p.value)}`)
  }
  return parts.join(' \\\n  ')
}

export interface MemoryEstimate {
  /** 权重占用（单卡，GiB） */
  weightsGB: number
  /** 单 token 的 KV cache 字节数 */
  kvBytesPerToken: number | null
  note: string
}

const GIB = 1024 ** 3

export function estimateMemory(result: VllmResult): MemoryEstimate | null {
  if (!result?.paramsBillion)
    return null
  const { paramsBillion: B, quant, kvShape } = result

  let bytesPerParam = 2
  if (quant?.bits === 4)
    bytesPerParam = 0.5
  else if (quant?.bits === 8)
    bytesPerParam = 1

  // 注意：显存与磁盘都用 GiB（1024³），不是十进制 GB。
  // 7.62B × 2 字节 = 15.24e9 字节 = 14.20 GiB，两者差 1 GB。
  const weightsBytes = B * 1e9 * bytesPerParam
  const weightsGB = Math.round((weightsBytes / GIB) * 10) / 10

  // KV cache 每 token = 2(K+V) × 层数 × kvHeads × headDim × 精度字节
  const kvBytes = quant?.bits === 4 ? 0.5 : 2
  const kvBytesPerToken = kvShape.layers && kvShape.kvHeads && kvShape.headDim
    ? 2 * kvShape.layers * kvShape.kvHeads * kvShape.headDim * kvBytes
    : null

  return {
    weightsGB,
    kvBytesPerToken,
    note: quant?.bits === 4
      ? '权重按 4bit 估算；运行时还需为激活值与 KV cache 预留显存，建议 gpu-memory-utilization 从 0.85 起调'
      : '权重按 16bit 估算；运行时还需为激活值与 KV cache 预留显存，建议 gpu-memory-utilization 从 0.85 起调',
  }
}