/**
 * ONNX 推理最小示例测试脚本
 *
 * 验证：模型加载 + 推理会话创建 + 前向传播
 */

import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Image, Platform } from 'react-native';
import { MODEL_INPUT_SHAPE, MODEL_ASSET } from '../../constants';

/**
 * 解析模型路径或获取模型字节数据
 *
 * Debug 模式：Metro HTTP URL → fetch 获取字节数据
 * Release 模式：file:// 路径直接使用
 */
async function getModelSource(): Promise<string | Uint8Array> {
  const resolved = Image.resolveAssetSource(MODEL_ASSET);
  console.log(`  Asset URI: ${resolved.uri}`);

  // Release 模式：file:// 路径，直接使用
  if (resolved.uri.startsWith('file://')) {
    const path =
      Platform.OS === 'android'
        ? resolved.uri.replace('file://', '')
        : resolved.uri;
    console.log(`  使用文件路径: ${path}`);
    return path;
  }

  // Debug 模式：Metro http:// 地址，需要 fetch 获取字节数据
  console.log(`  Debug 模式，fetch 模型字节数据...`);
  try {
    const resp = await fetch(resolved.uri);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const buffer = await resp.arrayBuffer();
    console.log(`  获取模型字节数: ${buffer.byteLength}`);
    return new Uint8Array(buffer);
  } catch (error) {
    console.error(`  fetch 模型失败: ${error}`);
    throw error;
  }
}

/**
 * 最小化 ONNX 推理测试
 * 验证：模型加载 + 推理会话创建 + 前向传播
 */
export async function testOnnxMinimal(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('  ONNX 推理最小示例测试');
  console.log('='.repeat(60));

  try {
    // Step 1: 获取模型源（路径或字节数据）
    console.log('\n[1/3] 解析模型路径...');
    const modelSource = await getModelSource();
    const sourceType = typeof modelSource === 'string' ? '路径' : '字节数据';
    console.log(`  模型源类型: ${sourceType}`);
    if (typeof modelSource === 'string') {
      console.log(`  模型路径: ${modelSource}`);
    }

    // Step 2: 创建推理会话（核心验证点）
    console.log('\n[2/3] 创建 InferenceSession...');
    const startTime = Date.now();

    const session = await InferenceSession.create(modelSource as any, {
      executionProviders: [Platform.OS === 'ios' ? 'coreml' : 'xnnpack', 'cpu'],
    });

    const loadTime = Date.now() - startTime;
    console.log(`  ✅ 推理会话创建成功! (${loadTime.toFixed(1)}ms)`);
    console.log(`  输入名称: ${session.inputNames[0]}`);
    console.log(`  输出名称: ${session.outputNames[0]}`);

    // Step 3: 执行一次前向传播
    console.log('\n[3/3] 执行前向传播测试...');
    const dummyInput = new Float32Array(
      MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1),
    );
    for (let i = 0; i < dummyInput.length; i++) {
      dummyInput[i] = Math.random() * 2 - 1; // [-1, 1] 范围的随机数
    }

    const tensor = new Tensor('float32', dummyInput, MODEL_INPUT_SHAPE);
    const inferenceStart = Date.now();

    const results = await session.run({ [session.inputNames[0]]: tensor });

    const inferenceTime = Date.now() - inferenceStart;
    console.log(`  ✅ 前向传播成功! (${inferenceTime.toFixed(1)}ms)`);

    // 验证输出
    const output = results[session.outputNames[0]];
    const outputData = output.data as Float32Array;
    console.log(`  输出 shape: ${output.dims}`);
    console.log(`  输出元素数: ${outputData.length}`);
    const firstFive = Array.from(outputData)
      .slice(0, 5)
      .map(v => v.toFixed(4));
    console.log(`  输出前5个值: ${firstFive}`);

    const probs = output.data as Float32Array;
    const sum = probs.reduce((a, b) => a + b, 0);
    console.log(`  概率总和: ${sum.toFixed(4)} (期望值≈1.0)`);

    console.log('\n' + '='.repeat(60));
    console.log('  ✅ ONNX 推理最小示例测试通过!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('  ❌ ONNX 推理测试失败!');
    console.error(
      `  错误: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error('='.repeat(60));
    throw error;
  }
}

/**
 * 获取模型元信息
 * 通过创建临时推理会话获取输入输出 shape
 */
export async function getModelInfo(): Promise<{
  inputName: string;
  inputShape: number[];
  outputName: string;
  outputShape: number[];
}> {
  const modelSource = await getModelSource();
  const session = await InferenceSession.create(modelSource as any, {
    executionProviders: [Platform.OS === 'ios' ? 'coreml' : 'xnnpack', 'cpu'],
  });

  // 创建一个临时输入张量来获取实际的输入 shape
  const inputName = session.inputNames[0];
  const dummyInput = new Float32Array(
    MODEL_INPUT_SHAPE.reduce((a, b) => a * b, 1),
  );
  const tensor = new Tensor('float32', dummyInput, MODEL_INPUT_SHAPE);

  // 执行一次推理来获取输出 shape
  const results = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const output = results[outputName];

  return {
    inputName,
    inputShape: MODEL_INPUT_SHAPE as number[],
    outputName,
    outputShape: output.dims as number[],
  };
}
