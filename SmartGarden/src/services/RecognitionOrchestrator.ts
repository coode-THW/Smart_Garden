import {
  HIGH_CONFIDENCE,
  MID_CONFIDENCE,
  LOW_CONFIDENCE,
  DROP_OFF_THRESHOLD,
  BOTTOM_SUM_MAX,
  GREEN_RATIO_MAX,
  SATURATION_MIN,
} from '../constants';
import YoloService, {
  InferenceResult as YoloInferenceResult,
} from './YoloService';
import LlmService, { LlmFlowerInfo } from './LlmService';
import { RecognitionSource, CareGuide, ErrorCode } from '../types';
import { RecognitionCache } from './RecognitionCache';
import {
  getErrorInfo,
  getErrorMessage,
  getErrorInfoFromError,
  inferErrorCode,
} from './ErrorHandler';
import { getKnowledge } from './KnowledgeService';
import {
  LatencyTracker,
  LatencyStats,
  type LatencySnapshot,
} from './LatencyTracker';
import {
  INITIAL_STATE,
  NO_ADVANCED_STAGES,
  createContext,
  isTerminal,
  skipEventIfUnavailable,
  transition,
  type MachineContext,
  type MachineEvent,
  type RecognitionState,
} from './RecognitionStateMachine';
import type { LatencyBreakdown } from '../types';
import logger from './LoggerService';

export type RecognitionStatus = 'success' | 'rejected' | 'low_confidence';

export interface RecognitionResult {
  status: RecognitionStatus;
  source: RecognitionSource;
  flowerName: string;
  topClass: string;
  confidence: number;
  margin: number;
  entropy: number;
  dropOff: number;
  bottomSum: number;
  greenRatio: number;
  avgSaturation: number;
  scientificName?: string;
  family?: string;
  origin?: string;
  bloomPeriod?: string;
  careGuide?: CareGuide;
  allClasses?: Array<{ name: string; probability: number }>;
  inferenceTimeMs: number;
  llmLatencyMs?: number;
  /** 延迟分解（F1 度量）。inferenceTimeMs 是端到端单值，这里是它的分段归因 */
  latency?: LatencyBreakdown;
  yoloResult?: YoloInferenceResult;
  errorMessage?: string;
  llmUsed?: boolean;
  /**
   * 本轮识别在状态机中的终态（诊断/测试用）。
   * 缓存命中时不跑状态机，因此为空。
   */
  finalState?: RecognitionState;
}

export interface RecognitionDecision {
  action: 'reject' | 'use_local' | 'call_llm';
  reason: string;
}

function buildCareGuide(flower: LlmFlowerInfo): CareGuide {
  const care = flower.careGuide || {};
  return {
    flowerId: 0,
    flowerName: flower.name,
    scientificName: flower.scientificName,
    family: flower.family,
    origin: flower.origin,
    bloomPeriod: flower.bloomPeriod,
    watering: {
      frequency: care.water?.frequency || '',
      amount: care.water?.amount || '',
      timing: care.water?.timing || '',
      method: care.water?.method || '',
    },
    fertilizing: {
      period: care.fertilize?.period || '',
      amount: care.fertilize?.amount || '',
      recommended: care.fertilize?.recommended || [],
    },
    lighting: {
      requirement: care.sunlight?.requirement || '',
      bestLocation: care.sunlight?.bestLocation || '',
    },
    environment: {
      temperature: care.temperature?.ideal || care.temperature?.minimum || '',
      humidity: care.environment?.humidity || '',
      ventilation: care.environment?.ventilation || '',
    },
    pests: (care.pests?.common || []).map(name => ({
      name,
      symptom: '',
      treatment: care.pests?.treatment || '',
    })),
    operations: [],
  };
}

/**
 * 本地模型结果 → 三分支决策（reject / use_local / call_llm）。
 *
 * 只使用 3 个信号：greenRatio、avgSaturation、confidence。
 * margin / entropy / dropOff / bottomSum 会随结果返回，但**不参与门控**。
 * 把它们接进来会改变拒识语义 —— 属于精度红线，需显式评审。
 *
 * 导出仅为便于直接测试生产实现（过去测试文件里有一份更严格的拷贝，
 * 导致生产代码从未被覆盖）。
 */
export function analyzeYoloResult(
  result: YoloInferenceResult,
): RecognitionDecision {
  const { confidence, greenRatio, avgSaturation } = result;

  if (greenRatio > GREEN_RATIO_MAX) {
    return {
      action: 'reject',
      reason: `绿色占比 ${(greenRatio * 100).toFixed(0)}% > ${(
        GREEN_RATIO_MAX * 100
      ).toFixed(0)}%，可能是叶子`,
    };
  }

  if (avgSaturation < SATURATION_MIN) {
    return {
      action: 'reject',
      reason: `饱和度 ${avgSaturation.toFixed(
        0,
      )} < ${SATURATION_MIN}，可能是墙壁/天空`,
    };
  }

  if (confidence >= HIGH_CONFIDENCE) {
    return {
      action: 'use_local',
      reason: `置信度 ${(confidence * 100).toFixed(1)}% ≥ ${(
        HIGH_CONFIDENCE * 100
      ).toFixed(0)}%，使用本地识别结果`,
    };
  }

  return {
    action: 'call_llm',
    reason: `置信度 ${(confidence * 100).toFixed(1)}% < ${(
      HIGH_CONFIDENCE * 100
    ).toFixed(0)}%，调用 LLM 优化结果`,
  };
}

/**
 * 发事件推进状态机。
 *
 * 非法转移**立即抛错**，而不是静默跳到默认状态 —— 隐藏非法转移会让流程 bug
 * 极难发现。错误由 recognizeInternal 的外层 catch 统一降级为 low_confidence，
 * 不会让 APP 崩溃。
 */
function advance(
  state: RecognitionState,
  event: MachineEvent,
  context: MachineContext,
): RecognitionState {
  const next = transition(state, event, context);
  if (next === null) {
    throw new Error(`识别状态机非法转移: ${state} --${event}-->`);
  }
  return next;
}

class RecognitionOrchestrator {
  private static instance: RecognitionOrchestrator;
  private yoloService: YoloService;
  private llmService: LlmService;
  private cache: RecognitionCache;
  /** 延迟采样（滚动窗口），供设备端度量取值 */
  private latencyStats = new LatencyStats();

  private constructor() {
    this.yoloService = YoloService.getInstance();
    this.llmService = LlmService.getInstance();
    this.cache = RecognitionCache.getInstance();
  }

  static getInstance(): RecognitionOrchestrator {
    if (!RecognitionOrchestrator.instance) {
      RecognitionOrchestrator.instance = new RecognitionOrchestrator();
    }
    return RecognitionOrchestrator.instance;
  }

  get isModelLoaded(): boolean {
    return this.yoloService.isLoaded;
  }

  get executionProvider(): string | undefined {
    return this.yoloService.info?.executionProvider;
  }

  async loadModels(): Promise<void> {
    logger.info('Orchestrator', '加载模型...');
    await this.yoloService.loadModel();
    logger.info('Orchestrator', '✅ 模型加载完成');
  }

  /**
   * 识别入口。负责挂上延迟分解（F1），具体流程在 recognizeInternal。
   *
   * 为什么拆成两段：内部有 7 个返回点（缓存命中 / 本地成功 / LLM 三种结局 /
   * 拒绝 / 异常）。若在每个返回点各自拼 breakdown，很容易漏一处。这里只在
   * **唯一出口**统一取快照，内部只管打标记。
   */
  async recognize(imagePath: string): Promise<RecognitionResult> {
    const tracker = new LatencyTracker();
    const result = await this.recognizeInternal(imagePath, tracker);

    const latency = tracker.freeze();
    this.latencyStats.record(latency);
    this.logLatency(latency);

    return {...result, latency};
  }

  /** 最近若干次识别的延迟分布（供设备端度量取值） */
  getLatencyStats(): LatencySnapshot | null {
    return this.latencyStats.snapshot();
  }

  /** 清空延迟统计 */
  resetLatencyStats(): void {
    this.latencyStats.reset();
  }

  private logLatency(b: LatencyBreakdown): void {
    // 单行、键值固定 —— 在设备日志里可以直接 grep 'Latency' 汇总，
    // 不必解析多行。
    logger.info(
      'Latency',
      `total=${b.totalMs} pre=${b.preprocessMs} infer=${b.inferenceMs} ` +
        `decision=${b.decisionMs} knowledge=${b.knowledgeMs} ` +
        `llm=${b.llmMs} cache=${b.cacheHit ? 1 : 0}`,
    );
  }

  /**
   * 从 IDLE 推进到「需要真正执行本地分类」的状态。
   *
   * 当前四个高级阶段（质量检查 / 植物二分类 / 主体定位 / 主体裁剪）都还没有
   * 模型，skipEventIfUnavailable 会把它们**显式降级**，最终落到
   * ORIGINAL_CLASSIFY_FALLBACK（原图分类）。这条降级路径与接线前的实现完全
   * 一致，由 RecognitionStateMachine.test.ts 的等价性测试锁定。
   *
   * ⚠️ 这些是**当前能力**下的路径。将来某个阶段有了模型，不能只把
   * NO_ADVANCED_STAGES 里对应项改成 true —— 必须同时在本方法里补该阶段的
   * 实际工作代码，否则会提前返回，随后因非法转移降级为 low_confidence。
   */
  private advanceToClassification(context: MachineContext): RecognitionState {
    let state: RecognitionState = INITIAL_STATE;
    state = advance(state, 'START', context);
    state = advance(state, 'IMAGE_ACQUIRED', context);

    for (;;) {
      if (isTerminal(state)) {
        // 分类还没开始就终止了 —— 说明转移表或能力配置写错了
        throw new Error(`状态机在分类前意外终止: ${state}`);
      }

      const skip = skipEventIfUnavailable(state, NO_ADVANCED_STAGES);
      if (skip) {
        state = advance(state, skip, context);
        continue;
      }

      switch (state) {
        case 'PLANT_CONFIRMED':
          state = advance(state, 'PLANT_OK', context);
          continue;
        // 定位失败是两跳：PLANT_LOCATE → LOCATION_FAILED → 原图备用
        // （与文档第 4 节一致，不是可以合并的一步）
        case 'LOCATION_FAILED':
          state = advance(state, 'USE_ORIGINAL', context);
          continue;
        default:
          return state;
      }
    }
  }

  private async recognizeInternal(
    imagePath: string,
    tracker: LatencyTracker,
  ): Promise<RecognitionResult> {
    const startTime = Date.now();

    try {
      logger.info('Orchestrator', '开始识别:', imagePath);

      const cacheKey = this.generateCacheKey(imagePath);

      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        logger.info('Orchestrator', '命中缓存，跳过推理');
        // 命中意味着整条链路都没跑，各阶段必须归零
        tracker.markCacheHit();
        return {
          ...cachedResult,
          inferenceTimeMs: Date.now() - startTime,
          // 本轮没有跑状态机，不要沿用缓存对象里的旧终态
          finalState: undefined,
        };
      }

      // ━━━ 状态机推进（v1.0）━━━
      // 目前走到 ORIGINAL_CLASSIFY_FALLBACK：原图 → 9 类分类。
      // 其余高级阶段缺失时的降级路径全部由状态机显式定义。
      const context = createContext();
      let state = this.advanceToClassification(context);

      const yoloResult = await this.yoloService.detect(imagePath);
      // 预处理与推理分别取自 YoloService 内部的实测值 —— 在那里测才不含调度噪声
      tracker.markPreprocess(yoloResult.preprocessMs);
      tracker.markInference(yoloResult.inferenceTimeMs);

      state = advance(state, 'CLASSIFIED', context); // → RESULT_VALIDATE

      const decisionStart = Date.now();
      const decision = analyzeYoloResult(yoloResult);
      tracker.markDecision(Date.now() - decisionStart);

      logger.info(
        'Orchestrator',
        `决策: ${decision.action}`,
        `| 原因: ${decision.reason}`,
      );

      switch (decision.action) {
        case 'use_local': {
          state = advance(state, 'VALIDATE_RELIABLE', context); // → LOCAL_SUCCESS

          const localResult: RecognitionResult = {
            status: 'success',
            source: 'yolov11',
            flowerName: yoloResult.topClass,
            topClass: yoloResult.topClass,
            confidence: yoloResult.confidence,
            margin: yoloResult.margin,
            entropy: yoloResult.entropy,
            dropOff: yoloResult.dropOff,
            bottomSum: yoloResult.bottomSum,
            greenRatio: yoloResult.greenRatio,
            avgSaturation: yoloResult.avgSaturation,
            allClasses: yoloResult.allClasses,
            inferenceTimeMs: Date.now() - startTime,
            yoloResult,
            llmUsed: false,
            finalState: state,
          };

          // 检查本地知识库是否存在，不存在则调用LLM获取养护指南。
          // 这段耗时记在 knowledgeMs（知识获取），跟 llmMs（识别兜底）区分开 ——
          // 两者都是网络等待，但优化手段不同。
          const knowledgeStart = Date.now();
          const localKnowledge = getKnowledge(yoloResult.topClass);
          if (!localKnowledge) {
            logger.info(
              'Orchestrator',
              `本地知识库无${yoloResult.topClass}数据，调用LLM补充养护指南`,
            );
            try {
              const llmResponse = await this.llmService.identify(
                imagePath,
                yoloResult.topClass,
              );
              if (llmResponse.success && llmResponse.flowerInfo) {
                const flower = llmResponse.flowerInfo;
                if (flower.confidence >= 0.3) {
                  localResult.careGuide = buildCareGuide(flower);
                  localResult.scientificName = flower.scientificName;
                  localResult.family = flower.family;
                  localResult.origin = flower.origin;
                  localResult.bloomPeriod = flower.bloomPeriod;
                  localResult.llmUsed = true;
                  localResult.llmLatencyMs = llmResponse.latencyMs;

                  // 修正：当本地知识库无该花卉数据时，YOLO 可能识别错误（如把荷花识别为非洲菊）。
                  // 如果 LLM 返回了有效花名且与 YOLO 结果不同、且 LLM 置信度足够高，
                  // 则以 LLM 识别结果覆盖 YOLO 的花名/置信度/来源，保证显示一致性。
                  const llmName = (flower.name || '').trim();
                  const isLlmNameValid =
                    llmName && llmName !== '未知' && llmName !== 'unknown';
                  const isLlmDisagrees =
                    isLlmNameValid && llmName !== yoloResult.topClass;

                  if (isLlmDisagrees && flower.confidence >= 0.5) {
                    logger.info(
                      'Orchestrator',
                      `LLM 纠正识别结果: YOLO="${
                        yoloResult.topClass
                      }" → LLM="${llmName}" (置信度 ${(
                        flower.confidence * 100
                      ).toFixed(1)}%)`,
                    );
                    localResult.flowerName = llmName;
                    localResult.topClass = llmName;
                    localResult.confidence = flower.confidence;
                    localResult.source = 'llm';
                  }
                }
              }
            } catch (error) {
              logger.warn('Orchestrator', 'LLM补充养护指南失败:', error);
            }
          }
          tracker.markKnowledge(Date.now() - knowledgeStart);

          this.cache.set(cacheKey, localResult);
          return localResult;
        }

        case 'reject':
        case 'call_llm': {
          // 注意：当前生产把 reject 也交给 LLM 复核，因此两者都映射到
          // VALIDATE_UNCERTAIN。VALIDATE_REJECT → SESSION_REJECTED 这条边
          // 留给未来引入强拒识信号时使用 —— 启用它会改变识别语义（精度红线），
          // 需显式评审，不能顺手改。
          state = advance(state, 'VALIDATE_UNCERTAIN', context); // → LLM_FALLBACK

          const llmStart = Date.now();
          const llmResponse = await this.llmService.identify(
            imagePath,
            yoloResult.topClass,
          );
          tracker.markLLM(Date.now() - llmStart);

          if (llmResponse.success && llmResponse.flowerInfo) {
            const flower = llmResponse.flowerInfo;

            if (flower.confidence >= 0.3) {
              state = advance(state, 'LLM_OK', context); // → LLM_CONFIRMED

              const llmSuccessResult: RecognitionResult = {
                status: 'success',
                source: 'llm',
                flowerName: flower.name,
                topClass: flower.name,
                confidence: flower.confidence,
                margin: yoloResult.margin,
                entropy: yoloResult.entropy,
                dropOff: yoloResult.dropOff,
                bottomSum: yoloResult.bottomSum,
                greenRatio: yoloResult.greenRatio,
                avgSaturation: yoloResult.avgSaturation,
                scientificName: flower.scientificName,
                family: flower.family,
                origin: flower.origin,
                bloomPeriod: flower.bloomPeriod,
                careGuide: buildCareGuide(flower),
                allClasses: yoloResult.allClasses,
                inferenceTimeMs: Date.now() - startTime,
                llmLatencyMs: llmResponse.latencyMs,
                yoloResult,
                llmUsed: true,
                finalState: state,
              };
              this.cache.set(cacheKey, llmSuccessResult);
              return llmSuccessResult;
            } else {
              // LLM 有响应，但认为置信度不足 / 不是花 → 最终拒绝
              state = advance(state, 'LLM_REJECT', context); // → LLM_REJECTED
              state = advance(state, 'LLM_REJECT_FINAL', context); // → SESSION_REJECTED

              const noFlowerInfo = getErrorInfo(ErrorCode.NO_FLOWER_DETECTED);
              const llmRejectResult: RecognitionResult = {
                status: 'rejected',
                source: 'llm',
                flowerName: '未知',
                topClass: yoloResult.topClass,
                confidence: flower.confidence,
                margin: yoloResult.margin,
                entropy: yoloResult.entropy,
                dropOff: yoloResult.dropOff,
                bottomSum: yoloResult.bottomSum,
                greenRatio: yoloResult.greenRatio,
                avgSaturation: yoloResult.avgSaturation,
                allClasses: yoloResult.allClasses,
                inferenceTimeMs: Date.now() - startTime,
                llmLatencyMs: llmResponse.latencyMs,
                yoloResult,
                errorMessage: noFlowerInfo.fullMessage,

                llmUsed: true,
                finalState: state,
              };
              this.cache.set(cacheKey, llmRejectResult);
              return llmRejectResult;
            }
          } else {
            state = advance(state, 'LLM_ERROR', context); // → LLM_FAILED

            const errorCode = llmResponse.errorMessage
              ? inferErrorCode(llmResponse.errorMessage)
              : ErrorCode.LLM_CALL_FAILED;
            const errorInfo = getErrorInfo(errorCode);

            const isLikelyNotFlower =
              decision.action === 'reject' ||
              yoloResult.confidence < LOW_CONFIDENCE;

            if (isLikelyNotFlower) {
              state = advance(state, 'LLM_FAILED_FINAL', context); // → SESSION_REJECTED

              const noFlowerInfo = getErrorInfo(ErrorCode.NO_FLOWER_DETECTED);
              const rejectResult: RecognitionResult = {
                status: 'rejected',
                source: 'yolov11',
                flowerName: '未知',
                topClass: yoloResult.topClass,
                confidence: yoloResult.confidence,
                margin: yoloResult.margin,
                entropy: yoloResult.entropy,
                dropOff: yoloResult.dropOff,
                bottomSum: yoloResult.bottomSum,
                greenRatio: yoloResult.greenRatio,
                avgSaturation: yoloResult.avgSaturation,
                allClasses: yoloResult.allClasses,
                inferenceTimeMs: Date.now() - startTime,
                llmLatencyMs: llmResponse.latencyMs,
                yoloResult,
                errorMessage: noFlowerInfo.fullMessage,
                llmUsed: false,
                finalState: state,
              };
              this.cache.set(cacheKey, rejectResult);
              return rejectResult;
            }

            state = advance(state, 'LLM_FAILED_DEGRADE', context); // → LOW_CONFIDENCE

            const fallbackResult: RecognitionResult = {
              status: 'low_confidence',
              source: 'yolov11',
              flowerName: yoloResult.topClass,
              topClass: yoloResult.topClass,
              confidence: yoloResult.confidence,
              margin: yoloResult.margin,
              entropy: yoloResult.entropy,
              dropOff: yoloResult.dropOff,
              bottomSum: yoloResult.bottomSum,
              greenRatio: yoloResult.greenRatio,
              avgSaturation: yoloResult.avgSaturation,
              allClasses: yoloResult.allClasses,
              inferenceTimeMs: Date.now() - startTime,
              llmLatencyMs: llmResponse.latencyMs,
              yoloResult,
              errorMessage: errorInfo.fullMessage,
              llmUsed: false,
              finalState: state,
            };
            this.cache.set(cacheKey, fallbackResult);
            return fallbackResult;
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Orchestrator', '识别异常:', err.message);

      const errorInfo = getErrorInfoFromError(
        err,
        ErrorCode.RECOGNITION_FAILED,
      );
      const errorResult: RecognitionResult = {
        status: 'low_confidence',
        source: 'yolov11',
        flowerName: '未知',
        topClass: '未知',
        confidence: 0,
        margin: 0,
        entropy: 0,
        dropOff: 0,
        bottomSum: 0,
        greenRatio: 0,
        avgSaturation: 0,
        inferenceTimeMs: Date.now() - startTime,
        errorMessage: errorInfo.fullMessage,
        llmUsed: false,
        // 异常属于状态机之外的兜底路径，统一视为低置信度终态
        finalState: 'LOW_CONFIDENCE',
      };
      return errorResult;
    }
  }

  private generateCacheKey(imagePath: string): string {
    let hash = 0;
    for (let i = 0; i < imagePath.length; i++) {
      hash = (hash << 5) - hash + imagePath.charCodeAt(i);
      hash |= 0;
    }
    return `img_${hash.toString(16)}`;
  }

  async getFlowerDetails(name: string): Promise<RecognitionResult | null> {
    const startTime = Date.now();

    try {
      const llmResponse = await this.llmService.describeFlower(name);

      if (llmResponse.success && llmResponse.flowerInfo) {
        const flower = llmResponse.flowerInfo;

        return {
          status: 'success',
          source: 'llm',
          flowerName: flower.name,
          topClass: flower.name,
          confidence: flower.confidence,
          margin: 0,
          entropy: 0,
          dropOff: 0,
          bottomSum: 0,
          greenRatio: 0,
          avgSaturation: 0,
          scientificName: flower.scientificName,
          family: flower.family,
          origin: flower.origin,
          bloomPeriod: flower.bloomPeriod,
          careGuide: buildCareGuide(flower),
          inferenceTimeMs: Date.now() - startTime,
          llmLatencyMs: llmResponse.latencyMs,
          llmUsed: true,
        };
      }
    } catch (error) {
      logger.error('Orchestrator', '获取花卉详情失败:', error);
    }

    return null;
  }

  async release(): Promise<void> {
    await this.yoloService.release();
  }
}

export default RecognitionOrchestrator;
