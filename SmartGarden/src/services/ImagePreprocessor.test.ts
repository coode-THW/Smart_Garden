function computeImageHash(data: Uint8Array): string {
  let hash = 0x811c9dc5;
  const prime = 0x01000193;

  const step = Math.max(1, Math.floor(data.length / 1024));
  for (let i = 0; i < data.length; i += step) {
    hash ^= data[i];
    hash *= prime;
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateCacheKey(
  imagePath: string,
  fileModifiedTime?: number,
): string {
  let hash = 0;
  for (let i = 0; i < imagePath.length; i++) {
    hash = (hash << 5) - hash + imagePath.charCodeAt(i);
    hash |= 0;
  }
  if (fileModifiedTime !== undefined) {
    hash = (hash << 5) - hash + fileModifiedTime;
    hash |= 0;
  }
  return `img_${hash.toString(16)}`;
}

describe('ImagePreprocessor - 哈希计算', () => {
  describe('computeImageHash', () => {
    it('应能计算 Uint8Array 的哈希', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash = computeImageHash(data);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('相同数据应产生相同哈希', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5]);
      const hash1 = computeImageHash(data1);
      const hash2 = computeImageHash(data2);
      expect(hash1).toBe(hash2);
    });

    it('不同数据应产生不同哈希', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 6]);
      const hash1 = computeImageHash(data1);
      const hash2 = computeImageHash(data2);
      expect(hash1).not.toBe(hash2);
    });

    it('空数组应产生有效哈希', () => {
      const data = new Uint8Array(0);
      const hash = computeImageHash(data);
      expect(typeof hash).toBe('string');
    });
  });

  describe('generateCacheKey', () => {
    it('应能根据图片路径生成缓存 key', () => {
      const path = '/path/to/image.jpg';
      const key = generateCacheKey(path);
      expect(typeof key).toBe('string');
      expect(key.startsWith('img_')).toBe(true);
    });

    it('相同路径应产生相同 key', () => {
      const path = '/path/to/image.jpg';
      const key1 = generateCacheKey(path);
      const key2 = generateCacheKey(path);
      expect(key1).toBe(key2);
    });

    it('不同路径应产生不同 key', () => {
      const key1 = generateCacheKey('/path/to/image1.jpg');
      const key2 = generateCacheKey('/path/to/image2.jpg');
      expect(key1).not.toBe(key2);
    });

    it('相同路径不同修改时间应产生不同 key', () => {
      const path = '/path/to/image.jpg';
      const key1 = generateCacheKey(path, 1234567890);
      const key2 = generateCacheKey(path, 9876543210);
      expect(key1).not.toBe(key2);
    });
  });
});
