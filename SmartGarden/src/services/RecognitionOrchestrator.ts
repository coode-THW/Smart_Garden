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
} from './ErrorHandler';
import logger from './LoggerService';

export type RecognitionStatus =
  | 'success'
  | 'rejected'
  | 'low_confidence'
  | 'llm_error';

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
  description?: string;
  careGuide?: CareGuide;
  allClasses?: Array<{ name: string; probability: number }>;
  inferenceTimeMs: number;
  llmLatencyMs?: number;
  yoloResult?: YoloInferenceResult;
  errorMessage?: string;
}

interface RecognitionDecision {
  action: 'reject' | 'use_local' | 'call_llm';
  reason: string;
}

function buildCareGuide(flower: LlmFlowerInfo): CareGuide {
  return {
    flowerId: 0,
    flowerName: flower.name,
    scientificName: flower.scientificName,
    family: flower.family,
    origin: flower.origin,
    bloomPeriod: flower.bloomPeriod,
    watering: {
      frequency: flower.careGuide?.water || '',
      amount: '',
      timing: '',
      method: '',
    },
    fertilizing: {
      period: flower.careGuide?.fertilize || '',
      amount: '',
      recommended: [],
    },
    lighting: {
      requirement: flower.careGuide?.sunlight || '',
      bestLocation: '',
    },
    environment: {
      temperature: flower.careGuide?.temperature || '',
      humidity: '',
      ventilation: '',
    },
    pests: [],
    operations: [],
  };
}

function analyzeYoloResult(result: YoloInferenceResult): RecognitionDecision {
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

class RecognitionOrchestrator {
  private static instance: RecognitionOrchestrator;
  private yoloService: YoloService;
  private llmService: LlmService;
  private cache: RecognitionCache;

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

  async recognize(imagePath: string): Promise<RecognitionResult> {
    const startTime = Date.now();

    try {
      logger.info('Orchestrator', '开始识别:', imagePath);

      const cacheKey = this.generateCacheKey(imagePath);

      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        logger.info('Orchestrator', '命中缓存，跳过推理');
        return {
          ...cachedResult,
          inferenceTimeMs: Date.now() - startTime,
        };
      }

      const yoloResult = await this.yoloService.detect(imagePath);
      const decision = analyzeYoloResult(yoloResult);

      logger.info(
        'Orchestrator',
        `决策: ${decision.action}`,
        `| 原因: ${decision.reason}`,
      );

      switch (decision.action) {
        case 'reject': {
          const rejectInfo = getErrorInfo(ErrorCode.NO_FLOWER_DETECTED);
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
            yoloResult,
            errorMessage: rejectInfo.fullMessage,
          };
          this.cache.set(cacheKey, rejectResult);
          return rejectResult;
        }

        case 'use_local': {
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
          };
          this.cache.set(cacheKey, localResult);
          return localResult;
        }

        case 'call_llm':
          const llmResponse = await this.llmService.identify(
            imagePath,
            yoloResult.topClass,
          );

          if (llmResponse.success && llmResponse.flowerInfo) {
            const flower = llmResponse.flowerInfo;

            if (flower.confidence < 0.5) {
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
              };
              this.cache.set(cacheKey, llmRejectResult);
              return llmRejectResult;
            }

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
              description: flower.description,
              careGuide: buildCareGuide(flower),
              allClasses: yoloResult.allClasses,
              inferenceTimeMs: Date.now() - startTime,
              llmLatencyMs: llmResponse.latencyMs,
              yoloResult,
            };
            this.cache.set(cacheKey, llmSuccessResult);
            return llmSuccessResult;
          } else {
            logger.info('Orchestrator', 'LLM 失败，回退到本地结果');

            // 根据错误信息映射到对应错误码的 UI 文案
            const isTimeout =
              llmResponse.errorMessage?.includes('超时') ||
              llmResponse.errorMessage?.includes('timeout');
            const llmErrorInfo = getErrorInfo(
              isTimeout ? ErrorCode.LLM_TIMEOUT : ErrorCode.LLM_CALL_FAILED,
            );

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
              errorMessage: `${llmErrorInfo.title}。${llmErrorInfo.suggestion}`,
            };
            this.cache.set(cacheKey, fallbackResult);
            return fallbackResult;
          }
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Orchestrator', '识别异常:', err.message);

      // 使用 ErrorHandler 将异常映射为用户友好的错误文案
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
          description: flower.description,
          careGuide: buildCareGuide(flower),
          inferenceTimeMs: Date.now() - startTime,
          llmLatencyMs: llmResponse.latencyMs,
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
