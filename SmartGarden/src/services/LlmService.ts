import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';
import NetInfo from '@react-native-community/netinfo';
import logger from './LoggerService';
import { QWEN_API_KEY, DOUBAO_API_KEY } from '@env';

import {
  LLM_PRIMARY_URL,
  LLM_SECONDARY_URL,
  LLM_TIMEOUT_MS,
  LLM_MAX_RETRIES,
  LLM_MODEL_NAME,
  LLM_SECONDARY_MODEL,
  LLM_TEMPERATURE,
  LLM_PRIMARY_KEY_ENV,
  LLM_SECONDARY_KEY_ENV,
} from '../constants';

export interface LlmFlowerInfo {
  name: string;
  confidence: number;
  scientificName: string;
  family: string;
  origin: string;
  bloomPeriod: string;
  description: string;
  imageContent?: string;
  careGuide: {
    water: string;
    fertilize: string;
    sunlight: string;
    temperature: string;
  };
}

export interface LlmResponse {
  success: boolean;
  flowerInfo?: LlmFlowerInfo;
  errorMessage?: string;
  rawResponse?: string;
  modelUsed: 'primary' | 'secondary';
  latencyMs: number;
}

interface LlmApiConfig {
  url: string;
  model: string;
  apiKey: string;
}

const getApiKey = (keyName: string): string => {
  const envKeys: Record<string, string | undefined> = {
    QWEN_API_KEY,
    DOUBAO_API_KEY,
  };

  const result = envKeys[keyName] || '';
  const keyLength = result?.length || 0;
  // 使用 console.log 确保在 Logcat 中可见
  console.log(`[LlmService] getApiKey("${keyName}") 值长度: ${keyLength}`);
  logger.info('LlmService', `getApiKey("${keyName}")`, `值长度: ${keyLength}`);
  if (!result) {
    console.warn(`[LlmService] API Key "${keyName}" 未配置，请检查 .env 文件`);
    logger.warn('LlmService', `API Key "${keyName}" 未配置，请检查 .env 文件`);
  }
  return result;
};

const getApiConfig = (
  useSecondary: boolean,
): LlmApiConfig & { supportsImage: boolean } => {
  const apiKey = useSecondary
    ? getApiKey(LLM_SECONDARY_KEY_ENV)
    : getApiKey(LLM_PRIMARY_KEY_ENV);

  return {
    url: useSecondary ? LLM_SECONDARY_URL : LLM_PRIMARY_URL,
    model: useSecondary ? LLM_SECONDARY_MODEL : LLM_MODEL_NAME,
    apiKey,
    supportsImage: true,
  };
};

const IMAGE_MAX_WIDTH = 1024;
const IMAGE_MAX_HEIGHT = 1024;
const IMAGE_QUALITY = 80;

async function readImageAsBase64(imagePath: string): Promise<string> {
  try {
    const resizedImage = await ImageResizer.createResizedImage(
      imagePath,
      IMAGE_MAX_WIDTH,
      IMAGE_MAX_HEIGHT,
      'JPEG',
      IMAGE_QUALITY,
    );

    const filePath =
      Platform.OS === 'android'
        ? resizedImage.uri.replace('file://', '')
        : resizedImage.uri;
    const base64 = await RNFS.readFile(filePath, 'base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    logger.warn('LlmService', '图片压缩失败，使用原始图片:', e);
    const filePath =
      Platform.OS === 'android' ? imagePath.replace('file://', '') : imagePath;
    const base64 = await RNFS.readFile(filePath, 'base64');
    return `data:image/jpeg;base64,${base64}`;
  }
}

function buildPrompt(base64Image: string, localGuess?: string): string {
  const guessText = localGuess
    ? `本地模型初步识别为：${localGuess}。请确认并补充详细信息。`
    : '';

  return `
你是一个专业的花卉识别助手。请仔细分析这张图片中的内容。

${guessText}

请严格按照以下 JSON 格式返回结果，不要包含任何 Markdown 格式或额外解释：

{
  "name": "花卉名称（中文）",
  "confidence": 0.0-1.0（你对识别结果的置信度）,
  "scientificName": "学名（拉丁名）",
  "family": "科属",
  "origin": "产地",
  "bloomPeriod": "花期",
  "description": "简要描述（20-50字）",
  "imageContent": "仅在图片中不是花卉时填写，花卉时省略此字段",
  "careGuide": {
    "water": "浇水建议",
    "fertilize": "施肥建议",
    "sunlight": "光照要求",
    "temperature": "温度要求"
  }
}

如果图片中是花卉：
- confidence 设为 0.5-1.0（根据识别置信度）
- imageContent 留空或与 description 相同

如果图片中不是花卉或无法识别：
- confidence 设为 0
- name 设为 "未知"
- imageContent 省略不输出
- description 说明不是花卉的原因
`;
}

function parseJsonResponse(rawText: string): LlmFlowerInfo | null {
  try {
    const cleanText = rawText
      .replace(/```json\s*/g, '')
      .replace(/\s*```/g, '')
      .trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return parsed as LlmFlowerInfo;
    }
  } catch (e) {
    logger.warn('LlmService', 'JSON 解析失败:', e);
  }
  return null;
}

function createTimeoutPromise(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('LLM 请求超时')), LLM_TIMEOUT_MS);
  });
}

async function callApi(config: LlmApiConfig, prompt: string): Promise<string> {
  if (!config.apiKey) {
    throw new Error('LLM API Key 未配置');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  const body = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
    temperature: LLM_TEMPERATURE,
    max_tokens: 1024,
  };

  const response = await Promise.race([
    fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    createTimeoutPromise(),
  ]);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const statusText = response.statusText || '';
    logger.error(
      'LlmService',
      `LLM API 请求失败`,
      `| URL: ${config.url}`,
      `| Status: ${response.status} ${statusText}`,
      `| Response: ${errorText.slice(0, 500)}`,
    );
    throw new Error(`LLM API 请求失败: ${response.status} ${statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callApiWithImage(
  config: LlmApiConfig,
  base64Image: string,
  localGuess?: string,
): Promise<string> {
  if (!config.apiKey) {
    const errorMsg = 'LLM API Key 未配置';
    console.error(`[LlmService] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 使用 console.log 确保在 Logcat 中可见
  console.log(
    `[LlmService] callApiWithImage - URL: ${config.url}, model: ${config.model}`,
  );
  console.log(
    `[LlmService] callApiWithImage - base64图片长度: ${base64Image.length}`,
  );
  logger.info(
    'LlmService',
    'callApiWithImage',
    `URL: ${config.url}`,
    `model: ${config.model}`,
  );
  logger.info(
    'LlmService',
    'callApiWithImage',
    `base64图片长度: ${base64Image.length}`,
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  // 使用 buildPrompt 生成完整的 JSON 格式引导 prompt
  const prompt = buildPrompt(base64Image, localGuess);

  const body = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } },
        ],
      },
    ],
    temperature: LLM_TEMPERATURE,
    max_tokens: 1024,
  };

  // 使用 console.log 确保在 Logcat 中可见
  console.log('[LlmService] callApiWithImage - 开始发送请求...');
  logger.info('LlmService', 'callApiWithImage', '开始发送请求...');

  const response = await Promise.race([
    fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    createTimeoutPromise(),
  ]);

  // 使用 console.log 确保在 Logcat 中可见
  console.log(
    `[LlmService] callApiWithImage - 收到响应, status: ${response.status}`,
  );
  logger.info(
    'LlmService',
    'callApiWithImage',
    `收到响应, status: ${response.status}`,
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const statusText = response.statusText || '';
    logger.error(
      'LlmService',
      `LLM API 请求失败`,
      `| URL: ${config.url}`,
      `| Status: ${response.status} ${statusText}`,
      `| Response: ${errorText.slice(0, 500)}`,
    );
    throw new Error(`LLM API 请求失败: ${response.status} ${statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

const HEALTH_RETRY_INTERVAL_MS = 30000;

class LlmService {
  private static instance: LlmService;
  private primaryHealthy: boolean = true;
  private primaryFailureTime: number = 0;

  static getInstance(): LlmService {
    if (!LlmService.instance) {
      LlmService.instance = new LlmService();
    }
    return LlmService.instance;
  }

  private shouldRetryPrimary(): boolean {
    if (this.primaryHealthy) {
      return true;
    }
    const elapsed = Date.now() - this.primaryFailureTime;
    if (elapsed >= HEALTH_RETRY_INTERVAL_MS) {
      logger.info('LlmService', '主模型失败已超过30秒，尝试重新连接');
      return true;
    }
    return false;
  }

  private async checkNetwork(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      const isConnected = state.isConnected ?? false;
      const isReachable = state.isInternetReachable ?? false;
      const type = state.type || 'unknown';
      // 使用 console.log 确保在 Logcat 中可见
      console.log(
        `[LlmService] 网络状态检查 - type: ${type}, isConnected: ${isConnected}, isReachable: ${isReachable}`,
      );
      logger.info(
        'LlmService',
        '网络状态检查',
        `type: ${type}`,
        `isConnected: ${isConnected}`,
        `isReachable: ${isReachable}`,
      );

      // 如果完全没有连接，直接返回false
      if (!isConnected) {
        console.warn('[LlmService] 网络未连接，跳过LLM调用');
        logger.warn('LlmService', '网络未连接，跳过LLM调用');
        return false;
      }

      // 如果已连接但 isReachable 为 false（如蜂窝网络刚连接时），继续尝试调用
      // 因为 isReachable 检查在某些网络环境下可能不准确
      if (!isReachable) {
        console.warn(
          '[LlmService] 网络已连接但可能无法访问互联网，尝试继续调用',
        );
        logger.warn(
          'LlmService',
          '网络已连接但可能无法访问互联网，尝试继续调用',
        );
        // 仍然返回 true，让调用继续
      }

      return true;
    } catch (e) {
      console.warn('[LlmService] 网络状态检查失败，继续尝试调用:', e);
      logger.warn('LlmService', '网络状态检查失败，继续尝试调用:', e);
      return true;
    }
  }

  async identify(imagePath: string, localGuess?: string): Promise<LlmResponse> {
    const startTime = Date.now();
    let useSecondary = !this.shouldRetryPrimary();
    let lastError: Error | null = null;

    if (!(await this.checkNetwork())) {
      return {
        success: false,
        errorMessage: '网络不可用',
        modelUsed: useSecondary ? 'secondary' : 'primary',
        latencyMs: Date.now() - startTime,
      };
    }

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      const config = getApiConfig(useSecondary);

      try {
        logger.info(
          'LlmService',
          `第 ${attempt + 1} 次尝试，模型: ${
            useSecondary ? 'secondary' : 'primary'
          }`,
        );

        let rawResponse: string;
        if (config.supportsImage) {
          const base64Image = await readImageAsBase64(imagePath);
          rawResponse = await callApiWithImage(config, base64Image, localGuess);
        } else {
          const prompt = localGuess
            ? `本地模型初步识别图片中的花卉为：${localGuess}。请确认并提供详细信息。`
            : '请根据常见花卉知识，提供可能的花卉详细信息。';
          rawResponse = await callApi(config, prompt);
        }

        const flowerInfo = parseJsonResponse(rawResponse);

        const latency = Date.now() - startTime;

        if (flowerInfo) {
          if (!useSecondary) {
            this.primaryHealthy = true;
          }

          logger.info(
            'LlmService',
            `✅ LLM 识别成功 (${latency}ms)`,
            `| 花名: ${flowerInfo.name}`,
            `| 置信度: ${(flowerInfo.confidence * 100).toFixed(1)}%`,
          );

          return {
            success: true,
            flowerInfo,
            rawResponse,
            modelUsed: useSecondary ? 'secondary' : 'primary',
            latencyMs: latency,
          };
        } else {
          throw new Error('LLM 响应解析失败');
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          'LlmService',
          `❌ LLM 调用失败 (${useSecondary ? 'secondary' : 'primary'})`,
          lastError.message,
        );

        if (!useSecondary) {
          const secondaryApiKey = getApiKey(LLM_SECONDARY_KEY_ENV);
          if (!secondaryApiKey) {
            logger.info('LlmService', '备用模型 API Key 未配置，跳过备用模型');
            break;
          }
          logger.info('LlmService', '切换到备用模型');
          useSecondary = true;
          this.primaryHealthy = false;
          this.primaryFailureTime = Date.now();
        } else {
          break;
        }
      }
    }

    const latency = Date.now() - startTime;

    return {
      success: false,
      errorMessage: lastError?.message || 'LLM 调用失败',
      modelUsed: useSecondary ? 'secondary' : 'primary',
      latencyMs: latency,
    };
  }

  async describeFlower(name: string): Promise<LlmResponse> {
    const startTime = Date.now();
    let useSecondary = !this.shouldRetryPrimary();
    let lastError: Error | null = null;

    if (!(await this.checkNetwork())) {
      return {
        success: false,
        errorMessage: '网络不可用',
        modelUsed: useSecondary ? 'secondary' : 'primary',
        latencyMs: Date.now() - startTime,
      };
    }

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      const config = getApiConfig(useSecondary);

      try {
        logger.info(
          'LlmService',
          `describeFlower 第 ${attempt + 1} 次尝试，模型: ${
            useSecondary ? 'secondary' : 'primary'
          }`,
        );

        const prompt = `
请提供花卉"${name}"的详细信息。

请严格按照以下 JSON 格式返回结果，不要包含任何 Markdown 格式或额外解释：

{
  "name": "${name}",
  "confidence": 1.0,
  "scientificName": "学名（拉丁名）",
  "family": "科属",
  "origin": "产地",
  "bloomPeriod": "花期",
  "description": "简要描述（20-50字）",
  "careGuide": {
    "water": "浇水建议",
    "fertilize": "施肥建议",
    "sunlight": "光照要求",
    "temperature": "温度要求"
  }
}
`;

        const rawResponse = await callApi(config, prompt);
        const flowerInfo = parseJsonResponse(rawResponse);

        const latency = Date.now() - startTime;

        if (flowerInfo) {
          if (!useSecondary) {
            this.primaryHealthy = true;
          }

          logger.info(
            'LlmService',
            `✅ describeFlower 成功 (${latency}ms)`,
            `| 花名: ${flowerInfo.name}`,
          );

          return {
            success: true,
            flowerInfo,
            rawResponse,
            modelUsed: useSecondary ? 'secondary' : 'primary',
            latencyMs: latency,
          };
        } else {
          throw new Error('LLM 响应解析失败');
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          'LlmService',
          `❌ describeFlower 失败 (${useSecondary ? 'secondary' : 'primary'})`,
          lastError.message,
        );

        if (!useSecondary) {
          const secondaryApiKey = getApiKey(LLM_SECONDARY_KEY_ENV);
          if (!secondaryApiKey) {
            logger.info('LlmService', '备用模型 API Key 未配置，跳过备用模型');
            break;
          }
          useSecondary = true;
          this.primaryHealthy = false;
          this.primaryFailureTime = Date.now();
        } else {
          break;
        }
      }
    }

    const latency = Date.now() - startTime;

    return {
      success: false,
      errorMessage: lastError?.message || 'LLM 调用失败',
      modelUsed: useSecondary ? 'secondary' : 'primary',
      latencyMs: latency,
    };
  }

  resetHealthStatus(): void {
    this.primaryHealthy = true;
  }
}

export default LlmService;
