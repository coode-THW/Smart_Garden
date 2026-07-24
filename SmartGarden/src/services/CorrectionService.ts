import logger from './LoggerService';
import { CorrectionRepository } from '../database/correctionRepository';
import { UserService } from './UserService';
import { FeedbackEntity } from '../types';
import { RecognitionResult } from './RecognitionOrchestrator';
import { InferenceResult } from './YoloService';

export type CorrectionResultType = RecognitionResult | InferenceResult;

export interface CorrectionParams {
  imageHash: string;
  recognitionResult: CorrectionResultType;
  userCorrection: string;
}

export interface CorrectionResult {
  success: boolean;
  id?: number;
  message: string;
}

export class CorrectionService {
  private static instance: CorrectionService;

  private correctionRepo = new CorrectionRepository();
  private userService = UserService.getInstance();

  static getInstance(): CorrectionService {
    if (!CorrectionService.instance) {
      CorrectionService.instance = new CorrectionService();
    }
    return CorrectionService.instance;
  }

  async submit(params: CorrectionParams): Promise<CorrectionResult> {
    const userId = this.userService.getUserId();
    if (!userId) {
      return {
        success: false,
        message: '用户未初始化，请重启应用',
      };
    }

    const existing = await this.correctionRepo.findByImageHash(
      params.imageHash,
    );
    if (existing) {
      return {
        success: false,
        message: '此图片已有纠错记录',
      };
    }

    try {
      const result = params.recognitionResult;
      const id = await this.correctionRepo.add({
        userId,
        imageHash: params.imageHash,
        yoloResult: JSON.stringify(result),
        confidence: result.confidence,
        userCorrection: params.userCorrection || '不是花卉',
        source: (result as RecognitionResult).source || 'yolov11',
      });

      logger.info('CorrectionService', '纠错记录已保存:', id);
      return {
        success: true,
        id,
        message: '感谢您的反馈，我们会持续优化识别模型',
      };
    } catch (error) {
      logger.error('CorrectionService', '保存纠错记录失败:', error);
      return {
        success: false,
        message: '保存失败，请稍后重试',
      };
    }
  }

  async getHistory(): Promise<FeedbackEntity[]> {
    const userId = this.userService.getUserId();
    if (!userId) {
      return [];
    }

    return this.correctionRepo.findByUserId(userId);
  }

  async getDetail(id: number): Promise<FeedbackEntity | null> {
    return this.correctionRepo.findById(id);
  }

  async getCount(): Promise<number> {
    const userId = this.userService.getUserId();
    if (!userId) {
      return 0;
    }

    return this.correctionRepo.countByUserId(userId);
  }

  async delete(id: number): Promise<boolean> {
    return this.correctionRepo.delete(id);
  }
}
