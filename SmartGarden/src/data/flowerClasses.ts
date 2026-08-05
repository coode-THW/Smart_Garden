/**
 * 花卉类别定义
 * 索引顺序与 ONNX 模型输出的概率数组保持一致
 * 与 models/class_order.json 一致（9 类）
 */

/** 模型识别的9个花卉类别（中文） */
export const CLASS_NAMES = [
  '雏菊',
  '蒲公英',
  '非洲菊',
  '绣球花',
  '百合',
  '荷花',
  '玫瑰',
  '向日葵',
  '郁金香',
] as const;

/** 对应的英文名称 */
export const CLASS_NAMES_EN = [
  'Daisy',
  'Dandelion',
  'Gerbera',
  'Hydrangea',
  'Lily',
  'Lotus',
  'Rose',
  'Sunflower',
  'Tulip',
] as const;

export type FlowerClass = (typeof CLASS_NAMES)[number];
