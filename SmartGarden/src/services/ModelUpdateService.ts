import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import logger from './LoggerService';
import {MODEL_ASSET} from '../constants';

export interface ModelVersionInfo {
  version: string;
  url: string;
  checksum: string;
  size: number;
  releaseDate: string;
  changelog: string;
}

export interface ModelUpdateStatus {
  state: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  progress: number;
  version?: string;
  errorMessage?: string;
}

const MODEL_VERSION_FILE = 'model_version.json';
const MODEL_CACHE_DIR = Platform.OS === 'ios'
  ? `${RNFS.DocumentDirectoryPath}/model`
  : `${RNFS.CachesDirectoryPath}/model`;

const REMOTE_VERSION_URL = 'https://your-server.com/model/version.json';

class ModelUpdateService {
  private static instance: ModelUpdateService;
  private currentVersion: string = '1.0.0';
  private cachedVersion: ModelVersionInfo | null = null;

  static getInstance(): ModelUpdateService {
    if (!ModelUpdateService.instance) {
      ModelUpdateService.instance = new ModelUpdateService();
    }
    return ModelUpdateService.instance;
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      const exists = await RNFS.exists(MODEL_CACHE_DIR);
      if (!exists) {
        await RNFS.mkdir(MODEL_CACHE_DIR);
        logger.info('ModelUpdateService', '创建模型缓存目录:', MODEL_CACHE_DIR);
      }
    } catch (e) {
      logger.error('ModelUpdateService', '创建目录失败:', e);
    }
  }

  private async loadLocalVersion(): Promise<string> {
    try {
      const versionPath = `${MODEL_CACHE_DIR}/${MODEL_VERSION_FILE}`;
      if (await RNFS.exists(versionPath)) {
        const content = await RNFS.readFile(versionPath, 'utf8');
        const info = JSON.parse(content);
        this.currentVersion = info.version || '1.0.0';
        logger.info('ModelUpdateService', '本地模型版本:', this.currentVersion);
      }
    } catch (e) {
      logger.warn('ModelUpdateService', '读取本地版本失败:', e);
    }
    return this.currentVersion;
  }

  async checkForUpdate(): Promise<ModelVersionInfo | null> {
    try {
      const state = await NetInfo.fetch();
      if (!(state.isConnected ?? false)) {
        logger.info('ModelUpdateService', '网络未连接，跳过版本检查');
        return null;
      }

      const response = await fetch(REMOTE_VERSION_URL);
      if (!response.ok) {
        logger.warn('ModelUpdateService', '版本检查失败:', response.status);
        return null;
      }

      const info = (await response.json()) as ModelVersionInfo;
      this.cachedVersion = info;
      logger.info('ModelUpdateService', '最新版本:', info.version);

      if (this.compareVersions(info.version, this.currentVersion) > 0) {
        logger.info('ModelUpdateService', '发现新版本:', info.version);
        return info;
      }

      logger.info('ModelUpdateService', '当前已是最新版本');
      return null;
    } catch (e) {
      logger.error('ModelUpdateService', '版本检查异常:', e);
      return null;
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  async downloadModel(
    versionInfo: ModelVersionInfo,
    onProgress?: (progress: number) => void,
  ): Promise<string | null> {
    try {
      await this.ensureCacheDir();

      const fileName = `yolov11n-flower-${versionInfo.version}.onnx`;
      const filePath = `${MODEL_CACHE_DIR}/${fileName}`;

      logger.info('ModelUpdateService', '开始下载模型:', filePath);

      const downloadResult = await RNFS.downloadFile({
        fromUrl: versionInfo.url,
        toFile: filePath,
        progress: (res) => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          onProgress?.(progress);
          logger.debug('ModelUpdateService', `下载进度: ${progress.toFixed(1)}%`);
        },
      }).promise;

      if (downloadResult.statusCode !== 200) {
        throw new Error(`下载失败: ${downloadResult.statusCode}`);
      }

      const stats = await RNFS.stat(filePath);
      logger.info('ModelUpdateService', `模型下载完成，大小: ${stats.size} bytes`);

      await this.saveVersionInfo(versionInfo, fileName);

      return filePath;
    } catch (e) {
      logger.error('ModelUpdateService', '下载失败:', e);
      return null;
    }
  }

  private async saveVersionInfo(
    versionInfo: ModelVersionInfo,
    fileName: string,
  ): Promise<void> {
    const versionPath = `${MODEL_CACHE_DIR}/${MODEL_VERSION_FILE}`;
    const info = {
      ...versionInfo,
      localPath: fileName,
      installedDate: new Date().toISOString(),
    };
    await RNFS.writeFile(versionPath, JSON.stringify(info), 'utf8');
    this.currentVersion = versionInfo.version;
    logger.info('ModelUpdateService', '版本信息已保存');
  }

  async getCachedModelPath(): Promise<string | null> {
    try {
      await this.loadLocalVersion();
      const versionPath = `${MODEL_CACHE_DIR}/${MODEL_VERSION_FILE}`;
      if (await RNFS.exists(versionPath)) {
        const content = await RNFS.readFile(versionPath, 'utf8');
        const info = JSON.parse(content);
        const filePath = `${MODEL_CACHE_DIR}/${info.localPath}`;
        if (await RNFS.exists(filePath)) {
          return filePath;
        }
      }
    } catch (e) {
      logger.warn('ModelUpdateService', '获取缓存模型失败:', e);
    }
    return null;
  }

  async initialize(): Promise<void> {
    await this.loadLocalVersion();
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }
}

export default ModelUpdateService;
