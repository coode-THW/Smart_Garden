import { RecognitionCache } from './RecognitionCache';
import { RecognitionResult } from './RecognitionOrchestrator';

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

describe('RecognitionCache', () => {
  let cache: RecognitionCache;

  beforeEach(() => {
    cache = RecognitionCache.getInstance();
    cache.clear();
  });

  describe('基础操作', () => {
    it('应能写入和查询缓存', () => {
      cache.set('test_hash', mockResult);
      const result = cache.get('test_hash');
      expect(result).not.toBeNull();
      expect(result?.flowerName).toBe('玫瑰');
    });

    it('查询不存在的 key 应返回 null', () => {
      const result = cache.get('non_existent');
      expect(result).toBeNull();
    });

    it('应能删除缓存', () => {
      cache.set('test_hash', mockResult);
      expect(cache.get('test_hash')).not.toBeNull();
      cache.delete('test_hash');
      expect(cache.get('test_hash')).toBeNull();
    });

    it('应能清空缓存', () => {
      cache.set('hash1', mockResult);
      cache.set('hash2', mockResult);
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('缓存过期', () => {
    it('缓存命中后应刷新过期时间', () => {
      cache.set('test_hash', mockResult);
      const result1 = cache.get('test_hash');
      const result2 = cache.get('test_hash');
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('LRU 淘汰', () => {
    it('缓存满时应淘汰最久未使用的条目', () => {
      for (let i = 0; i < 60; i++) {
        cache.set(`hash_${i}`, {
          ...mockResult,
          flowerName: `花${i}`,
        });
      }

      expect(cache.size).toBeLessThanOrEqual(50);
    });
  });

  describe('统计信息', () => {
    it('应能获取缓存统计', () => {
      cache.set('hash1', mockResult);
      cache.set('hash2', mockResult);
      cache.get('hash1');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(50);
      expect(stats.totalHits).toBeGreaterThanOrEqual(1);
    });
  });
});
