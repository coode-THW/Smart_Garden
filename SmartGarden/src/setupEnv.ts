/**
 * 将 .env 中的 API Key 注入到 globalThis，
 * LlmService.getApiKey() 从 globalThis 读取。
 *
 * 此文件在 App.tsx 最顶部导入，确保 service 初始化前已就绪。
 */
import {QWEN_API_KEY, DOUBAO_API_KEY} from '@env';

const g = globalThis as unknown as Record<string, string | undefined>;
g.QWEN_API_KEY = QWEN_API_KEY;
g.DOUBAO_API_KEY = DOUBAO_API_KEY;

console.log(
  '[setupEnv] QWEN_API_KEY:',
  QWEN_API_KEY ? '已配置' : '未配置',
  '| DOUBAO_API_KEY:',
  DOUBAO_API_KEY ? '已配置' : '未配置',
);
