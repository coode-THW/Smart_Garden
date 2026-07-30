import {RecognitionResult} from './RecognitionOrchestrator';
import logger from './LoggerService';

interface CacheEntry {
  result: RecognitionResult;
  timestamp: number;
  hitCount: number;
}

export class RecognitionCache {
  private static instance: RecognitionCache;

  private readonly MAX_CACHE_SIZE = 50;
  private readonly CACHE_TTL = 3600000;

  private cache = new Map<string, CacheEntry>();

  static getInstance(): RecognitionCache {
    if (!RecognitionCache.instance) {
      RecognitionCache.instance = new RecognitionCache();
    }
    return RecognitionCache.instance;
  }

  get(imageHash: string): RecognitionResult | null {
    const entry = this.cache.get(imageHash);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(imageHash);
      return null;
    }

    entry.hitCount++;
    entry.timestamp = now;

    logger.info('RecognitionCache', `缓存命中: ${imageHash} (命中次数: ${entry.hitCount})`);
    return entry.result;
  }

  set(imageHash: string, result: RecognitionResult): void {
    this.cleanupExpired();

    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    this.cache.set(imageHash, {
      result,
      timestamp: Date.now(),
      hitCount: 1,
    });

    logger.info('RecognitionCache', `缓存写入: ${imageHash} (当前缓存数: ${this.cache.size})`);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.info('RecognitionCache', `清理过期缓存: ${removed} 条`);
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.info('RecognitionCache', `LRU 淘汰: ${oldestKey}`);
    }
  }

  clear(): void {
    this.cache.clear();
    logger.info('RecognitionCache', '缓存已清空');
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): {
    size: number;
    maxSize: number;
    totalHits: number;
  } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      totalHits,
    };
  }

  delete(imageHash: string): boolean {
    const existed = this.cache.has(imageHash);
    this.cache.delete(imageHash);
    return existed;
  }
}