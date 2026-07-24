/**
 * react-native-fs Jest mock
 *
 * LoggerService 依赖 RNFS 进行本地文件读写，
 * 测试环境中用内存 mock 替代原生模块。
 */

const path = require('path');

const mockFiles = new Map();
const MOCK_DOCUMENT_DIR = '/mock/document/dir';

const RNFS = {
  DocumentDirectoryPath: MOCK_DOCUMENT_DIR,
  CachesDirectoryPath: '/mock/cache/dir',

  // ── 目录操作 ──

  async mkdir(dirPath) {
    // no-op in mock
  },

  async exists(filePath) {
    return mockFiles.has(filePath);
  },

  async readDir(dirPath) {
    const entries = [];
    for (const [filePath] of mockFiles) {
      if (filePath.startsWith(dirPath + '/') || filePath.startsWith(dirPath + path.sep)) {
        entries.push({
          name: path.basename(filePath),
          path: filePath,
          size: mockFiles.get(filePath).length,
          isFile: () => true,
          isDirectory: () => false,
        });
      }
    }
    return entries;
  },

  async unlink(filePath) {
    mockFiles.delete(filePath);
  },

  // ── 文件读写 ──

  async readFile(filePath, encoding) {
    if (!mockFiles.has(filePath)) {
      throw new Error(`ENOENT: no such file: ${filePath}`);
    }
    return mockFiles.get(filePath);
  },

  async writeFile(filePath, content, encoding) {
    mockFiles.set(filePath, content);
  },

  async appendFile(filePath, content, encoding) {
    const existing = mockFiles.get(filePath) || '';
    mockFiles.set(filePath, existing + content);
  },

  // ── 辅助（测试用） ──

  _reset() {
    mockFiles.clear();
  },

  _dump() {
    return Object.fromEntries(mockFiles);
  },
};

module.exports = RNFS;
