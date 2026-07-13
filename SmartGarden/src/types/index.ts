/**
 * 智慧花园 — TypeScript 类型定义
 * ==============================
 * 与架构文档 5.3 节养护指南查询协议一致。
 * 所有 JSON 知识库文件的结构由此接口约束。
 */

// ━━━━━ 养护指南子字段 ━━━━━

export interface WateringGuide {
  frequency: string;
  amount: string;
  timing: string;
  method: string;
}

export interface FertilizingGuide {
  period: string;
  amount: string;
  recommended: string[];
}

export interface LightingGuide {
  requirement: string;
  bestLocation: string;
}

export interface EnvironmentGuide {
  temperature: string;
  humidity: string;
  ventilation: string;
}

export interface PestInfo {
  name: string;
  symptom: string;
  treatment: string;
}

export interface OperationGuide {
  name: string;
  frequency: string;
  steps: string[];
}

// ━━━━━ 主养护指南结构 ━━━━━

export interface CareGuide {
  flowerId: number;
  flowerName: string;
  scientificName: string;
  family: string;
  origin: string;
  bloomPeriod: string;
  watering: WateringGuide;
  fertilizing: FertilizingGuide;
  lighting: LightingGuide;
  environment: EnvironmentGuide;
  pests: PestInfo[];
  operations: OperationGuide[];
}

// ━━━━━ 通用 API 响应包装（架构文档 5.1.2 节） ━━━━━

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

// ━━━━━ 错误码定义（架构文档 5.1.3 节） ━━━━━

export enum ErrorCode {
  SUCCESS = 0,
  INVALID_PARAM = 1001,
  IMAGE_FORMAT_UNSUPPORTED = 1002,
  IMAGE_SIZE_EXCEEDED = 1003,
  RECOGNITION_FAILED = 2001,
  MODEL_NOT_LOADED = 2002,
  NO_FLOWER_DETECTED = 2003,
  LLM_CALL_FAILED = 3001,
  LLM_TIMEOUT = 3002,
  DATA_QUERY_FAILED = 4001,
}

// ━━━━━ 识别结果类型（架构文档 5.2 节） ━━━━━

export type RecognitionSource = 'yolov11' | 'llm';

export type ConfidenceStatus = 'recognized' | 'uncertain' | 'unknown';

export type RecognitionStatus =
  | 'success'
  | 'rejected'
  | 'low_confidence'
  | 'llm_error';

export interface RecognitionResult {
  status?: RecognitionStatus;
  flowerName: string;
  confidence: number;
  scientificName?: string;
  family?: string;
  origin?: string;
  bloomPeriod?: string;
  similarFlowers?: string[];
  source: RecognitionSource;
  flowerId?: number;
  careGuide?: CareGuide;
  description?: string;
  allClasses?: Array<{ name: string; probability: number }>;
  inferenceTimeMs?: number;
  llmLatencyMs?: number;
  errorMessage?: string;
}

// ━━━━━ 数据库实体类型（对应 SQLite 三张表） ━━━━━

export interface UserEntity {
  userId: string; // UUID v4
  createdAt: string; // ISO 8601
  phone: string | null;
  passwordHash: string | null;
  nickname: string; // default '花友'
  avatarPath: string | null;
}

export interface GardenEntity {
  gardenId?: number; // AUTOINCREMENT, undefined 表示新增
  userId: string;
  flowerId: number;
  customName: string | null;
  location: string | null;
  addedDate: string | null;
  photoPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackEntity {
  id?: number; // AUTOINCREMENT
  userId: string;
  imageHash: string;
  yoloResult: string;
  confidence: number;
  userCorrection: string;
  timestamp: string;
  source: string; // 'yolov11' | 'llm'
  synced: number; // 0 | 1
}

// ━━━━━ 提醒类型（Phase 2 预留） ━━━━━

export type ReminderType = 'water' | 'fertilize' | 'pest' | 'check';
export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReminderEntity {
  reminderId?: number;
  userId: string;
  gardenId: number;
  type: ReminderType;
  frequency: ReminderFrequency;
  intervalValue: number | null;
  daysOfWeek: string | null; // e.g. "2,4,6"
  dayOfMonth: number | null;
  time: string; // HH:mm
  nextRemindTime: string;
  title: string | null;
  note: string | null;
  enabled: number; // 0 | 1
  createdAt: string;
}
