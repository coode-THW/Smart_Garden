import { CorrectionService } from '../CorrectionService';
import { RecognitionResult } from '../RecognitionOrchestrator';

const mockResult: RecognitionResult = {
  status: 'success',
  source: 'yolov11',
  flowerName: '玫瑰',
  topClass: '玫瑰',
  confidence: 0.9,
  margin: 0.2,
  entropy: 0.5,
  dropOff: 3.0,
  bottomSum: 0.05,
  greenRatio: 0.1,
  avgSaturation: 100,
  inferenceTimeMs: 100,
};

describe('CorrectionService', () => {
  let service: CorrectionService;
  let mockCorrectionRepo: any;
  let mockUserService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCorrectionRepo = {
      add: jest.fn().mockResolvedValue(1),
      findByUserId: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      countByUserId: jest.fn().mockResolvedValue(0),
      findByImageHash: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
    };

    mockUserService = {
      getUserId: jest.fn().mockReturnValue('test-user-id'),
    };

    jest.doMock('../database/correctionRepository', () => ({
      CorrectionRepository: jest.fn().mockReturnValue(mockCorrectionRepo),
    }));

    jest.doMock('./UserService', () => ({
      UserService: {
        getInstance: jest.fn().mockReturnValue(mockUserService),
      },
    }));

    jest.resetModules();

    const CorrectionServiceClass =
      require('./CorrectionService').CorrectionService;
    (CorrectionServiceClass as any).instance = undefined;
    service = CorrectionServiceClass.getInstance();
  });

  describe('submit', () => {
    it('应能成功提交纠错反馈', async () => {
      const result = await service.submit({
        imageHash: 'test-image-hash',
        recognitionResult: mockResult,
        userCorrection: '月季',
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
      expect(result.message).toContain('感谢');
    });

    it('重复提交同一图片应返回失败', async () => {
      mockCorrectionRepo.findByImageHash = jest
        .fn()
        .mockResolvedValue({ id: 1 });

      const result = await service.submit({
        imageHash: 'test-image-hash',
        recognitionResult: mockResult,
        userCorrection: '月季',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('已有纠错记录');
    });

    it('用户纠正为空时应记录为"不是花卉"', async () => {
      await service.submit({
        imageHash: 'test-image-hash',
        recognitionResult: mockResult,
        userCorrection: '',
      });

      expect(mockCorrectionRepo.add).toHaveBeenCalled();
      const callArgs = mockCorrectionRepo.add.mock.calls[0][0];
      expect(callArgs.userCorrection).toBe('不是花卉');
    });
  });

  describe('查询与统计', () => {
    it('应能获取纠错历史', async () => {
      const history = await service.getHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('应能获取纠错记录数量', async () => {
      const count = await service.getCount();
      expect(typeof count).toBe('number');
    });

    it('应能获取单条记录详情', async () => {
      const detail = await service.getDetail(1);
      expect(detail).toBeNull();
    });

    it('应能删除纠错记录', async () => {
      const result = await service.delete(1);
      expect(result).toBe(true);
    });
  });
});
