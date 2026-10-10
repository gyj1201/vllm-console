/**
 * config.json 归一化：处理不同模型家族的结构差异。
 *
 * 实测发现三类问题：
 *
 * 1. 文本参数被包在子对象里
 *    - Qwen2-Audio：`{ audio_config, text_config: { num_hidden_layers, ... } }`
 *    - 顶层没有 num_hidden_layers，直接取会得到 undefined
 *
 * 2. 视觉塔字段名不统一
 *    - Qwen2.5-VL：`vision_config.num_hidden_layers`
 *    - MiniCPM-V：`vision_config.depth`
 *
 * 3. 模态标识分散
 *    - 有 vision_config 字段（多数）
 *    - 只有 architectures 名字带 VL / Vision（部分）
 *    - 有 image_token_index / audio_token_index（部分）
 *
 * 本模块把 config 拉平成统一的形状，让下游算法只需处理一种结构。
 */

export interface NormalizedConfig {
  [key: string]: any
  /** 文本骨干的参数字段（原样透传） */
  num_hidden_layers?: number
  hidden_size?: number
  num_attention_heads?: number
  num_key_value_heads?: number
  head_dim?: number
  intermediate_size?: number
  vocab_size?: number
  max_position_embeddings?: number

  /** 归一化后的视觉塔配置（字段名统一为 num_hidden_layers） */
  _vision?: NormalizedSubConfig | null
  /** 归一化后的音频塔配置 */
  _audio?: NormalizedSubConfig | null
  /** 原本是否已有顶层文本字段 */
  _hasTopLevelText: boolean
}

export interface NormalizedSubConfig {
  hidden_size?: number
  num_hidden_layers?: number
  depth?: number
  num_attention_heads?: number
  num_key_value_heads?: number
  intermediate_size?: number
  [key: string]: any
}

/** 存放文本参数的子对象候选键名（按优先级） */
const TEXT_CONFIG_KEYS = ['text_config', 'llm_config', 'language_config', 'thinker_config']

/** 视觉塔候选键名 */
const VISION_KEYS = ['vision_config', 'vision_tower_config', 'visual_config', 'vision_tower']

/** 音频塔候选键名 */
const AUDIO_KEYS = ['audio_config', 'audio_tower_config', 'audio_tower', 'speech_config']

/** architectures 里的模态关键词 */
const VISION_ARCH_PATTERNS = [
  /vl/i, /vision/i, /internvl/i, /llava/i, /minicpmv/i, /idefics/i,
  /aria/i, /phi.*vision/i, /visual/i, /image/i,
]
const AUDIO_ARCH_PATTERNS = [/audio/i, /whisper/i, /omni/i, /speech/i]

function pick(cfg: Record<string, any>, keys: string[]): Record<string, any> | null {
  for (const k of keys) {
    const v = cfg[k]
    if (v && typeof v === 'object' && !Array.isArray(v))
      return v
  }
  return null
}

/** 视觉塔层数字段在不同家族里叫法不同 */
function normalizeSub(sub: Record<string, any>): NormalizedSubConfig {
  return {
    ...sub,
    num_hidden_layers: sub.num_hidden_layers ?? sub.depth ?? sub.layers,
    intermediate_size: sub.intermediate_size ?? sub.ffn_dim,
    num_key_value_heads: sub.num_key_value_heads ?? sub.num_attention_heads,
  }
}

export function normalizeConfig(raw: Record<string, any>): NormalizedConfig {
  const cfg: NormalizedConfig = { ...raw, _hasTopLevelText: false, _vision: null, _audio: null }

  // 1. 视觉塔 / 音频塔：统一字段名
  const vision = pick(raw, VISION_KEYS)
  if (vision)
    cfg._vision = normalizeSub(vision)

  const audio = pick(raw, AUDIO_KEYS)
  if (audio)
    cfg._audio = normalizeSub(audio)

  // 2. 文本骨干：顶层缺失时从子对象里取
  const hasTopLevel = raw.num_hidden_layers !== undefined
  cfg._hasTopLevelText = hasTopLevel

  if (!hasTopLevel) {
    const text = pick(raw, TEXT_CONFIG_KEYS)
    if (text) {
      for (const key of TEXT_FIELDS) {
        if (raw[key] === undefined && text[key] !== undefined)
          cfg[key] = text[key]
      }
      // 模型类型也一并带出来
      if (cfg.model_type === undefined && text.model_type !== undefined)
        cfg.model_type = text.model_type
    }
  }

  return cfg
}

/** 需要从子对象提取的文本字段 */
const TEXT_FIELDS = [
  'num_hidden_layers',
  'hidden_size',
  'intermediate_size',
  'num_attention_heads',
  'num_key_value_heads',
  'head_dim',
  'vocab_size',
  'max_position_embeddings',
  'max_window_layers',
  'rope_theta',
  'rms_norm_eps',
  'tie_word_embeddings',
  'torch_dtype',
  'sliding_window',
  'use_sliding_window',
  'rope_scaling',
]

/**
 * 识别模态类型。
 * 三路判断：显式字段 → 视觉/音频塔 → architectures 名称。
 */
export function detectModalities(cfg: Record<string, any>): Array<'vision' | 'audio'> {
  const types: Array<'vision' | 'audio'> = []
  const archs: string[] = cfg.architectures ?? []
  const archStr = archs.join(' ')

  if (cfg._vision)
    types.push('vision')
  if (cfg._audio)
    types.push('audio')

  // 显式的 token index 字段
  if (cfg.image_token_index !== undefined || cfg.video_token_index !== undefined) {
    if (!types.includes('vision'))
      types.push('vision')
  }
  if (cfg.audio_token_index !== undefined) {
    if (!types.includes('audio'))
      types.push('audio')
  }

  // 从架构名兜底
  if (!types.includes('vision') && VISION_ARCH_PATTERNS.some(re => re.test(archStr)))
    types.push('vision')
  if (!types.includes('audio') && AUDIO_ARCH_PATTERNS.some(re => re.test(archStr)))
    types.push('audio')

  return types
}