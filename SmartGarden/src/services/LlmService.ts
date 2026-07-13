import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

import {
  LLM_PRIMARY_URL,
  LLM_SECONDARY_URL,
  LLM_TIMEOUT_MS,
  LLM_MAX_RETRIES,
  LLM_MODEL_NAME,
  LLM_SECONDARY_MODEL,
  LLM_TEMPERATURE,
} from '../constants';

export interface LlmFlowerInfo {
  name: string;
  confidence: number;
  scientificName: string;
  family: string;
  origin: string;
  floweringSeason: string;
  description: string;
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
  const globalAny = globalThis as unknown as Record<string, string | undefined>;

  if (globalAny[keyName]) {
    return globalAny[keyName]!;
  }

  try {
    const processEnv = (globalThis as any).process?.env;
    if (processEnv && processEnv[keyName]) {
      return processEnv[keyName];
    }
  } catch {}

  return '';
};

const getApiConfig = (
  useSecondary: boolean,
): LlmApiConfig & { supportsImage: boolean } => {
  const apiKey = useSecondary
    ? getApiKey('MOONSHOT_API_KEY')
    : getApiKey('LLM_API_KEY');

  return {
    url: useSecondary ? LLM_SECONDARY_URL : LLM_PRIMARY_URL,
    model: useSecondary ? LLM_SECONDARY_MODEL : LLM_MODEL_NAME,
    apiKey,
    supportsImage: !useSecondary,
  };
};

async function readImageAsBase64(imagePath: string): Promise<string> {
  const filePath =
    Platform.OS === 'android' ? imagePath.replace('file://', '') : imagePath;
  const base64 = await RNFS.readFile(filePath, 'base64');
  return `data:image/jpeg;base64,${base64}`;
}

function buildPrompt(base64Image: string, localGuess?: string): string {
  const guessText = localGuess
    ? `本地模型初步识别为：${localGuess}。请确认并补充详细信息。`
    : '';

  return `
你是一个专业的花卉识别助手。请仔细分析这张图片中的花卉，提供详细的结构化信息。

${guessText}

请严格按照以下 JSON 格式返回结果，不要包含任何 Markdown 格式或额外解释：

{
  "name": "花卉名称（中文）",
  "confidence": 0.0-1.0（你对识别结果的置信度）,
  "scientificName": "学名（拉丁名）",
  "family": "科属",
  "origin": "产地",
  "floweringSeason": "花期",
  "description": "简要描述（20-50字）",
  "careGuide": {
    "water": "浇水建议",
    "fertilize": "施肥建议",
    "sunlight": "光照要求",
    "temperature": "温度要求"
  }
}

如果图片中不是花卉或无法识别，请将 confidence 设为 0，并在 description 中说明原因。
`;
}

function parseJsonResponse(rawText: string): LlmFlowerInfo | null {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return parsed as LlmFlowerInfo;
    }
  } catch (e) {
    console.warn('[LlmService] JSON 解析失败:', e);
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
    throw new Error(`LLM API 请求失败: ${response.status}`);
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
    throw new Error('LLM API Key 未配置');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  const prompt = localGuess
    ? `请识别这张图片中的花卉。本地模型初步识别为：${localGuess}。请确认并提供详细信息。`
    : '请识别这张图片中的花卉并提供详细信息。';

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
    throw new Error(`LLM API 请求失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

class LlmService {
  private static instance: LlmService;
  private primaryHealthy: boolean = true;

  static getInstance(): LlmService {
    if (!LlmService.instance) {
      LlmService.instance = new LlmService();
    }
    return LlmService.instance;
  }

  async identify(imagePath: string, localGuess?: string): Promise<LlmResponse> {
    const startTime = Date.now();
    let useSecondary = !this.primaryHealthy;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      const config = getApiConfig(useSecondary);

      try {
        console.log(
          `[LlmService] 第 ${attempt + 1} 次尝试，模型: ${
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

          console.log(
            `[LlmService] ✅ LLM 识别成功 (${latency}ms)`,
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
        console.warn(
          `[LlmService] ❌ LLM 调用失败 (${
            useSecondary ? 'secondary' : 'primary'
          })`,
          lastError.message,
        );

        if (!useSecondary) {
          console.log('[LlmService] 切换到备用模型');
          useSecondary = true;
          this.primaryHealthy = false;
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
    let useSecondary = !this.primaryHealthy;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      const config = getApiConfig(useSecondary);

      try {
        console.log(
          `[LlmService] describeFlower 第 ${attempt + 1} 次尝试，模型: ${
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
  "floweringSeason": "花期",
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

          console.log(
            `[LlmService] ✅ describeFlower 成功 (${latency}ms)`,
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
        console.warn(
          `[LlmService] ❌ describeFlower 失败 (${
            useSecondary ? 'secondary' : 'primary'
          })`,
          lastError.message,
        );

        if (!useSecondary) {
          useSecondary = true;
          this.primaryHealthy = false;
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
