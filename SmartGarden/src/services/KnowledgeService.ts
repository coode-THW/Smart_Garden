/**
 * KnowledgeService — 花卉养护知识查询
 *
 * 当前为接口空实现 + 开发用示例数据。
 * 后端知识库上线后，替换 fetchKnowledge 的实现即可。
 */

// ━━━ 类型 ━━━

export interface FlowerKnowledge {
  nameZh: string;
  nameEn: string;
  scientificName: string;
  family: string;
  genus: string;
  origin: string;
  bloomPeriod: string;
  description: string;
}

// ━━━ 示例数据（5 种花，开发阶段用） ━━━

const SAMPLE_KNOWLEDGE: Record<string, FlowerKnowledge> = {
  雏菊: {
    nameZh: '雏菊',
    nameEn: 'Daisy',
    scientificName: 'Bellis perennis',
    family: '菊科',
    genus: '雏菊属',
    origin: '欧洲、西亚',
    bloomPeriod: '3月 - 6月',
    description:
      '多年生草本植物，株高10-20厘米。头状花序单生，舌状花白色或淡粉色，管状花黄色。喜凉爽湿润气候，耐寒性强，是春季最常见的观赏花卉之一。',
  },
  蒲公英: {
    nameZh: '蒲公英',
    nameEn: 'Dandelion',
    scientificName: 'Taraxacum officinale',
    family: '菊科',
    genus: '蒲公英属',
    origin: '欧亚大陆',
    bloomPeriod: '4月 - 10月',
    description:
      '多年生草本，全株含白色乳汁。花黄色，头状花序。果实为瘦果，顶端具白色冠毛，形成标志性的"绒球"。耐寒耐旱，适应性极强，遍布温带地区。',
  },
  玫瑰: {
    nameZh: '玫瑰',
    nameEn: 'Rose',
    scientificName: 'Rosa rugosa',
    family: '蔷薇科',
    genus: '蔷薇属',
    origin: '中国、东亚',
    bloomPeriod: '5月 - 7月',
    description:
      '落叶灌木，株高1-2米，茎干密生皮刺。花单生或簇生，花瓣紫红色或白色，具浓郁芳香。喜光耐寒，对土壤要求不严。"玫瑰"在中文中常与月季、蔷薇混称。',
  },
  向日葵: {
    nameZh: '向日葵',
    nameEn: 'Sunflower',
    scientificName: 'Helianthus annuus',
    family: '菊科',
    genus: '向日葵属',
    origin: '北美洲',
    bloomPeriod: '7月 - 9月',
    description:
      '一年生高大草本，株高可达3米。头状花序巨大，直径可达30厘米以上，舌状花金黄色，管状花棕色或紫色。因花序随太阳转动而得名，是重要的油料和观赏作物。',
  },
  郁金香: {
    nameZh: '郁金香',
    nameEn: 'Tulip',
    scientificName: 'Tulipa gesneriana',
    family: '百合科',
    genus: '郁金香属',
    origin: '中亚、土耳其',
    bloomPeriod: '3月 - 5月',
    description:
      '多年生球根花卉，鳞茎扁圆锥形。花单生茎顶，杯状，花色极为丰富，涵盖红、黄、白、紫、黑等。荷兰国花，17世纪曾引发"郁金香狂热"，是世界著名观赏花卉。',
  },
};

// ━━━ 查询接口 ━━━

/**
 * 根据花名查询养护知识。
 * 当前返回内置示例数据；后端知识库上线后替换为 API 调用或 JSON 读取。
 *
 * @param flowerName 中文花名（如"向日葵"）
 * @returns 知识对象或 null（未收录）
 */
export async function fetchKnowledge(
  flowerName: string,
): Promise<FlowerKnowledge | null> {
  // TODO: 接入真实知识库（JSON 文件 / API / SQLite）
  return SAMPLE_KNOWLEDGE[flowerName] ?? null;
}
