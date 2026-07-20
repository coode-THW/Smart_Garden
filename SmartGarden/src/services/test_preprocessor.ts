/**
 * 图片预处理验证脚本
 *
 * Day 7-8 AI 工程师任务：编写图片预处理函数，
 * 验证输入输出 shape 的正确性
 */

import { loadImageAsTensor, createRandomTensor } from './ImagePreprocessor';
import { MODEL_INPUT_SHAPE, MODEL_INPUT_SIZE } from '../constants';

/**
 * 验证随机数据预处理
 * 确保 HWC → CHW 转置和归一化正确
 */
export function testRandomTensorPreprocessing(): void {
  console.log('\n' + '='.repeat(60));
  console.log('  随机数据预处理验证');
  console.log('='.repeat(60));

  const result = createRandomTensor();

  console.log(`\n  输入 shape: ${result.shape}`);
  console.log(`  期望元素数: ${MODEL_INPUT_SIZE}`);
  console.log(`  实际元素数: ${result.tensor.length}`);
  console.log(`  数据类型: ${result.tensor.constructor.name}`);

  // 验证形状匹配
  const shapeMatches = JSON.stringify(result.shape) === JSON.stringify(MODEL_INPUT_SHAPE);
  const sizeMatches = result.tensor.length === MODEL_INPUT_SIZE;

  console.log(`\n  ✅ shape 匹配: ${shapeMatches}`);
  console.log(`  ✅ size 匹配: ${sizeMatches}`);

  if (!shapeMatches || !sizeMatches) {
    throw new Error('预处理输出 shape 或 size 不匹配!');
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ✅ 随机数据预处理验证通过!');
  console.log('='.repeat(60));
}

/**
 * 验证真实图片预处理
 * 测试完整的预处理流程：缩放 → 解码 → 归一化 → 转置
 */
export async function testImagePreprocessing(imagePath: string): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('  真实图片预处理验证');
  console.log('='.repeat(60));

  try {
    console.log(`\n  输入图片: ${imagePath}`);

    const result = await loadImageAsTensor(imagePath);

    console.log(`\n  原始尺寸: ${result.originalWidth}x${result.originalHeight}`);
    console.log(`  输出 shape: [${result.shape.join(', ')}]`);
    console.log(`  输出元素数: ${result.tensor.length}`);
    console.log(`  数据类型: ${result.tensor.constructor.name}`);

    // 验证数据范围（归一化后应在 [0, 1] 之间）
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < Math.min(1000, result.tensor.length); i++) {
      minVal = Math.min(minVal, result.tensor[i]);
      maxVal = Math.max(maxVal, result.tensor[i]);
    }
    console.log(`  数据范围: [${minVal.toFixed(4)}, ${maxVal.toFixed(4)}]`);

    // 验证颜色特征
    console.log(`  绿色占比: ${(result.greenRatio * 100).toFixed(1)}%`);
    console.log(`  平均饱和度: ${result.avgSaturation.toFixed(1)}`);

    // 验证形状和大小
    const shapeMatches = JSON.stringify(result.shape) === JSON.stringify(MODEL_INPUT_SHAPE);
    const sizeMatches = result.tensor.length === MODEL_INPUT_SIZE;
    const rangeValid = minVal >= 0 && maxVal <= 1;

    console.log(`\n  ✅ shape 匹配: ${shapeMatches}`);
    console.log(`  ✅ size 匹配: ${sizeMatches}`);
    console.log(`  ✅ 数据范围有效: ${rangeValid}`);

    if (!shapeMatches || !sizeMatches || !rangeValid) {
      throw new Error('图片预处理验证失败!');
    }

    console.log('\n' + '='.repeat(60));
    console.log('  ✅ 真实图片预处理验证通过!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('  ❌ 图片预处理验证失败!');
    console.error(`  错误: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(60));
    throw error;
  }
}

/**
 * 验证预处理管线的端到端流程
 * 从图片路径到可以直接输入 ONNX 模型的 Tensor
 */
export async function testEndToEndPipeline(imagePath: string): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('  预处理管线端到端验证');
  console.log('='.repeat(60));

  // 1. 预处理
  console.log('\n[1/2] 图片预处理...');
  const preprocessStart = Date.now();
  const preprocessed = await loadImageAsTensor(imagePath);
  const preprocessTime = Date.now() - preprocessStart;
  console.log(`  ✅ 预处理完成 (${preprocessTime.toFixed(1)}ms)`);

  // 2. 验证输出格式（模拟 ONNX 输入）
  console.log('\n[2/2] 验证输出格式...');
  console.log(`  期望输入 shape: [${MODEL_INPUT_SHAPE.join(', ')}]`);
  console.log(`  实际输出 shape: [${preprocessed.shape.join(', ')}]`);
  console.log(`  数据长度: ${preprocessed.tensor.length}`);

  // 验证可以构造 Tensor
  try {
    const { Tensor } = await import('onnxruntime-react-native');
    const tensor = new Tensor('float32', preprocessed.tensor, preprocessed.shape);
    console.log(`  ✅ 成功构造 ONNX Tensor`);
    console.log(`  Tensor type: ${tensor.type}`);
    console.log(`  Tensor dims: ${tensor.dims}`);
  } catch (error) {
    console.error(`  ❌ 构造 Tensor 失败: ${error}`);
    throw error;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ✅ 预处理管线端到端验证通过!');
  console.log('='.repeat(60));
}