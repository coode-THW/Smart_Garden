/**
 * PestsPromptBuilder — 常见病虫害识别 Prompt 模板
 *
 * 用途：用户上传疑似有病虫害的叶片照片时，引导 LLM 做精准的病虫害识别。
 * 每个模板包含：病虫害名称、典型视觉特征、鉴别要点，帮助 LLM 区分相似症状。
 *
 * 模板覆盖 10 种花卉最常见的病虫害（来自养护 JSON 数据统计）：
 *   真菌类：白粉病、黑斑病、灰霉病、锈病、根腐病、叶斑病
 *   虫害类：蚜虫、红蜘蛛、介壳虫
 *   生理类：日灼（非病原，易误判为病害）
 */

// ━━━ 类型 ━━━

export interface PestProfile {
  /** 病虫害中文名 */
  name: string;
  /** 英文名（用于 LLM 交叉验证） */
  nameEn: string;
  /** 类别：真菌病 / 细菌病 / 病毒病 / 虫害 / 生理病 */
  category: '真菌病' | '细菌病' | '病毒病' | '虫害' | '生理病';
  /** 典型视觉特征（给 LLM 的鉴别提示） */
  visualClues: string[];
  /** 与相似病症的鉴别要点 */
  differentialTips: string[];
}

// ━━━ 10 种常见病虫害模板 ━━━

export const PEST_PROFILES: PestProfile[] = [
  {
    name: '白粉病',
    nameEn: 'Powdery Mildew',
    category: '真菌病',
    visualClues: [
      '叶片表面覆盖白色粉末状霉层，触感粗糙',
      '多从叶片正面开始，严重时覆盖整个叶面',
      '后期霉层可变为灰白色或浅褐色',
      '叶片皱缩卷曲，新梢生长受阻',
      '通常不造成叶片迅速坏死',
    ],
    differentialTips: [
      '→ 与霜霉病区分：霜霉病霉层在叶背，白粉病在叶面',
      '→ 与灰尘区分：灰尘可擦掉，白粉病擦不掉且叶片变形',
    ],
  },
  {
    name: '黑斑病',
    nameEn: 'Black Spot',
    category: '真菌病',
    visualClues: [
      '叶片出现黑色或深褐色圆形/椭圆形斑点',
      '斑点边缘不规则，常带有黄色晕圈',
      '严重时病斑连片，叶片整体发黄脱落',
      '下部叶片先发病，逐渐向上蔓延',
      '潮湿环境下病斑上可能有黑色霉层',
    ],
    differentialTips: [
      '→ 与叶斑病区分：叶斑病病斑较小、数量多，黑斑病斑点大、边缘有黄晕',
      '→ 与灼伤区分：灼伤斑点是灰白色，黑斑病是黑色',
    ],
  },
  {
    name: '灰霉病',
    nameEn: 'Botrytis',
    category: '真菌病',
    visualClues: [
      '叶片、花蕾出现褐色水渍状腐烂',
      '病部覆盖灰色或灰褐色霉层（像灰尘）',
      '花瓣受害后变褐软腐，容易脱落',
      '在高湿（90%+）和低温（15-20°C）条件下爆发',
      '病斑扩展迅速，1-2天可蔓延全株',
    ],
    differentialTips: [
      '→ 与软腐病区分：软腐病是细菌性、无霉层、有臭味，灰霉病有灰色霉层',
      '→ 与冻伤区分：冻伤是整片叶变褐干枯，灰霉病有霉层且从局部开始',
    ],
  },
  {
    name: '锈病',
    nameEn: 'Rust',
    category: '真菌病',
    visualClues: [
      '叶片背面出现橘黄色或锈褐色粉末状孢子堆',
      '孢子堆呈圆形或椭圆形，密集时像撒了锈粉',
      '叶面对应位置可能出现黄色褪绿斑',
      '严重时叶片背面布满锈粉，正面黄化',
      '多发生在叶片背面，正面症状较轻',
    ],
    differentialTips: [
      '→ 与白粉病区分：白粉病在叶面、白色，锈病在叶背、橘黄色',
      '→ 与灰尘区分：锈粉有金属光泽，擦拭后叶组织有褪绿斑',
    ],
  },
  {
    name: '根腐病',
    nameEn: 'Root Rot',
    category: '真菌病',
    visualClues: [
      '地上部表现：叶片发黄萎蔫、植株矮化',
      '茎基部变褐变黑，皮层腐烂',
      '根系变褐软腐，严重时一拔就断',
      '土壤常伴随潮湿、板结、积水',
      '发展缓慢，初期仅部分叶片发黄',
    ],
    differentialTips: [
      '→ 与缺水区分：缺水是整株萎蔫、土壤干，根腐病是局部发黄、土壤湿',
      '→ 与虫害区分：根腐病是根系问题，虫害有虫粪或虫体',
    ],
  },
  {
    name: '叶斑病',
    nameEn: 'Leaf Spot',
    category: '真菌病',
    visualClues: [
      '叶片出现大量小型圆形或近圆形病斑',
      '病斑多为褐色或灰白色，边缘颜色较深',
      '后期病斑中央可能变干脱落形成穿孔',
      '病斑数量多、分布密集，直径通常 < 5mm',
      '与黑斑病相比斑点更小、颜色更浅',
    ],
    differentialTips: [
      '→ 与黑斑病区分：黑斑病斑点大（>1cm）、边缘有黄晕，叶斑病小而密',
      '→ 与虫害咬伤区分：咬伤是不规则缺口，病斑是完整圆形',
    ],
  },
  {
    name: '蚜虫',
    nameEn: 'Aphid',
    category: '虫害',
    visualClues: [
      '嫩梢、花蕾、叶背聚集大量小型软体虫',
      '虫体呈绿色、黑色、棕色或粉色（因种类而异）',
      '叶片卷曲变形，嫩梢生长停滞',
      '严重时叶背有粘腻的蜜露（蚂蚁常来吸食）',
      '虫体大小约 1-3mm，无硬壳',
    ],
    differentialTips: [
      '→ 与介壳虫区分：介壳虫有硬壳、固定不动，蚜虫柔软、可移动',
      '→ 与红蜘蛛区分：红蜘蛛极小（<0.5mm）、多在叶背结网，蚜虫肉眼可见',
    ],
  },
  {
    name: '红蜘蛛',
    nameEn: 'Spider Mite',
    category: '虫害',
    visualClues: [
      '叶片正面出现细密的黄白色褪绿小点（针尖大小）',
      '严重时叶片整体黄化、早衰脱落',
      '叶背可见极细小的红色或白色小虫（需放大镜）',
      '严重时叶背有细密的蛛丝',
      '高温干燥（>28°C）环境下爆发',
    ],
    differentialTips: [
      '→ 与白粉病区分：白粉病有白色粉末，红蜘蛛只有褪绿点和蛛丝',
      '→ 与缺氮区分：缺氮是整叶均匀黄化，红蜘蛛是密集小点、叶背有虫',
    ],
  },
  {
    name: '介壳虫',
    nameEn: 'Scale',
    category: '虫害',
    visualClues: [
      '茎干、叶背可见圆形/椭圆形的硬壳小虫',
      '颜色多为白色、棕色或灰色，大小 2-5mm',
      '虫体固定不动（有硬壳保护），用指甲可刮掉',
      '叶片黄化、生长缓慢，严重时整株衰弱',
      '常伴随粘腻的蜜露，诱发煤污病',
    ],
    differentialTips: [
      '→ 与蚜虫区分：蚜虫软、可动，介壳虫硬、固定',
      '→ 与虫卵区分：虫卵更小、排列整齐、数量极多',
    ],
  },
  {
    name: '日灼',
    nameEn: 'Sun Scald',
    category: '生理病',
    visualClues: [
      '叶片向阳面出现大片灰白色或淡黄色灼伤',
      '灼伤区域界限清晰，不扩展到叶背',
      '多发生在夏季正午强光（>35°C 直射）后',
      '新叶、薄叶品种更易受害',
      '无霉层、无虫体、无病斑扩展',
    ],
    differentialTips: [
      '→ 与黑斑病区分：黑斑病是黑色斑点，日灼是灰白色大片',
      '→ 与药害区分：药害斑点不规则、有用药史，日灼形状规则、与光照方向一致',
    ],
  },
];

// ━━━ 构建 Prompt ━━━

/**
 * 构建病虫害识别专用 Prompt
 *
 * 注意：图片 base64 不应嵌入在 prompt 文本中，
 * 而是作为 API 请求体的 image_url content 单独传递（参考 LlmService.callApiWithImage）。
 * 本函数只负责 prompt 文本部分。
 *
 * 与通用花卉识别 prompt 的区别：
 *   - 聚焦在"这株植物生了什么病"而非"这是什么花"
 *   - 给出 10 种常见病虫害的视觉特征作为参考
 *   - 要求 LLM 提供鉴别依据（confidence + 匹配特征）
 */
export function buildPestPrompt(): string {
  const profilesText = PEST_PROFILES.map(
    p => `### ${p.name} (${p.nameEn}) — ${p.category}
典型特征：
${p.visualClues.map(c => `  - ${c}`).join('\n')}
鉴别要点：
${p.differentialTips.map(t => `  ${t}`).join('\n')}`,
  ).join('\n\n');

  return `
你是一个专业的花卉病虫害诊断专家。请仔细观察这张植物图片，诊断它可能患了什么病虫害。

下面是 10 种花卉最常见的病虫害及其视觉特征参考（如果图片症状匹配其中某种，请优先考虑）：

${profilesText}

请严格按照以下 JSON 格式返回结果，不要包含任何 Markdown 格式或额外解释：

{
  "diseaseName": "确诊的病虫害名称（如果无法确定则填 '未知'）",
  "category": "真菌病/细菌病/病毒病/虫害/生理病/正常（无病虫害）",
  "confidence": 0.0-1.0（你对诊断结果的置信度）,
  "matchedFeatures": ["图片中匹配到的 2-3 个典型特征"],
  "differentialDiagnosis": "与最相似病症的鉴别说明（为什么是 X 而不是 Y）",
  "severity": "轻度/中度/重度",
  "treatment": {
    "immediateAction": "立即采取的措施（如剪除病叶、隔离病株）",
    "chemical": "推荐药剂及用法（如 多菌灵 1000倍液 每7天1次）",
    "environmental": "环境调整建议（如 加强通风、降低湿度）",
    "prevention": "后续预防措施"
  }
}

## 诊断规则：
1. 仔细观察叶片正面和背面的症状（如白粉病在正面、锈病在背面）
2. 注意颜色特征（黑色→黑斑病、橘黄→锈病、灰色霉层→灰霉病）
3. 区分虫害和病害（虫害有虫体/蜜露、病害有霉层/病斑扩展）
4. 如果图片清晰但症状不典型，confidence 设为 0.3-0.5 并说明不确定
5. 如果图片模糊或看不到叶片细节，confidence 设为 <0.3 并返回建议重拍
6. 如果植物看起来健康，category 设为 "正常"，confidence 设高

请确保返回的 JSON 格式正确，所有字段值都使用双引号，数组使用方括号。`;
}

/**
 * 获取指定病虫害的治疗建议（从内置模板直接返回，不依赖 LLM）
 *
 * 用于 LLM 识别后，前端展示治疗建议时的本地兜底。
 */
export function getPestTreatmentTemplate(diseaseName: string): string | null {
  const profile = PEST_PROFILES.find(
    p =>
      p.name === diseaseName ||
      p.nameEn.toLowerCase() === diseaseName.toLowerCase(),
  );
  if (!profile) return null;

  const clueLine = profile.visualClues.slice(0, 3).join('；');
  return (
    `【${profile.name}】(${profile.category})\n` +
    `识别特征：${clueLine}\n` +
    `鉴别要点：${profile.differentialTips[0] ?? ''}`
  );
}
