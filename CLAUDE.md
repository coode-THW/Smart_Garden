# 智慧花园 Smart Garden — AI 编码导航

> 拍照识花 · YOLOv11 + ONNX Runtime 移动端本地推理 · 免注册 · 离线优先

## 项目定位

React Native 移动端花卉识别 APP。YOLO 推理在手机上本地完成。**没有后端服务器**（Phase 1/2）。

## 团队成员与 git 身份

| 成员 | git 身份 | 角色 |
|------|----------|------|
| 唐宏苇 | `coode-THW` / `bei` | B — 前端/UI/集成构建 |
| 孙睿智 | `sunrise226` | C — 知识库/数据层/测试/天气 |
| 余浩 | `上灵` | A — AI 模型/ONNX 部署/LLM |

指导老师：何冠霖。学校：西华大学。

## 模块地图

| 模块 | 位置 | 状态 | 说明 |
|------|------|------|------|
| **移动端 APP** | `SmartGarden/` | ✅ 开发中 | React Native 0.86 + React 19 |
| **业务代码** | `SmartGarden/src/` | ✅ 就绪 | 导航/页面/服务/组件/状态管理 |
| **ONNX 模型** | `models/yolov11n-flower.onnx` | ✅ 就绪 | 9 类花卉分类, 224×224, FP16 5.9MB |
| **APP 内模型** | `SmartGarden/assets/yolov11n-flower.onnx` | ✅ 就绪 | Metro 随 APP 打包 |
| **类别顺序表** | `models/class_order.json` | ⚠️ 不同步 | 训练类别英文名，与 `flowerClasses.ts` 索引有出入（见"关键技术约定"） |
| **养护知识库** | `SmartGarden/assets/care/` + `KnowledgeService.ts` | ✅ 就绪 | 54 种花卉结构化 JSON（浇水/施肥/光照/换盆/病虫害） |
| **天气养护** | `src/services/WeatherService.ts` 等 | ✅ 就绪 | Open-Meteo 3 天预报 + 30 城 + LLM 建议 + 离线规则兜底 |
| **启动脚本** | `scripts/`（仓库根，Python）+ `SmartGarden/scripts/`（TS 调试脚本） | 🏠 本地 | 不推送至仓库 |
| **Python 训练** | `train.py` 等 | 🏠 git 历史 | `34da349` 可恢复，main 已删除 |

## 当前开发状态

```
Phase 1（核心识别闭环已交付）
  ✅ ONNX 模型导出 + React Native 项目初始化
  ✅ 端到端识别：拍照 → 预处理 → ONNX 推理 → 显示结果
  ✅ 三维置信度决策：绿色占比>0.5 拒绝 / 饱和度<20 拒绝 / conf<0.3 拒绝 /
     0.3–0.85 调云端 LLM 增强 / ≥0.85 本地直返
  ✅ 识别编排器（RecognitionOrchestrator 统一调度）+ LRU 结果缓存（50 条 / 1h TTL）
  ✅ LLM 双引擎增强（通义千问 qwen-vl-plus 主 + 豆包 doubao-vl-128k 备，
     15s 超时 / 2 次重试 / 失败自动降级；无知识库花卉由 LLM 补充养护指南）
  ✅ 相机组件（闪光灯/权限/生命周期/isActive）
  ✅ 有机自然主义 UI（DesignCard 精致阴影 + 圆角卡片 + 杂志编辑风格）+ 暗色模式
  ✅ WelcomeScreen 沉浸式引导页（4 页水平滑动 + 叶子生长动画）+ 启动预加载
  ✅ 按钮系统（ActionButton 6 种变体 + ButtonGroup 自动换行）
  ✅ 花卉档案卡片（学名/科属/产地/花期）
  ✅ 养护知识库 54 种 + 天气养护联动（Open-Meteo / 离线规则 / TTL 缓存）
  ✅ 花园管理（去重添加/长按删除/详情/导出）+ 免注册匿名 UUID
  ✅ 纠错反馈闭环（仅存 imageHash 不上传原图）+ 日志系统 + 错误码 UI 文案
  ✅ 模型更新服务（远程版本检查 + INT8 量化支持）
  ✅ Jest 测试（10 个测试文件 / 171 用例全绿）+ 人工验收（5 流程 27 用例）
  ✅ Android 双架构 APK（arm64-v8a + x86_64）
  📋 推送提醒 / 养护日历
  📋 知识库在线增量更新
```

## 关键技术约定

- **模型**: YOLOv11n 分类, 输入 `[1,3,224,224]` FP32, 输出 `[1,9]` 已内嵌 softmax 的概率
- **9 个类别**（`src/data/flowerClasses.ts` 顺序）: 雏菊 / 蒲公英 / 玫瑰 / 向日葵 / 郁金香 / 百合 / 康乃馨 / 牡丹 / 月季
- **⚠️ ONNX 已内嵌 softmax**：模型输出即概率，**不要再 softmax**（历史 bug：double softmax 致置信度从 90% 掉到 40%；YoloService 中的 softmax 工具函数已删除）
- **⚠️ 类别索引不同步（待修复）**: `models/class_order.json`（daisy/dandelion/gerbera/hydrangea/lily/lotus/roses/sunflowers/tulips）与 `flowerClasses.ts` 第 3/4/6 位（玫瑰/向日葵/康乃馨）对不上，识别可能张冠李戴——改模型或改类别表前务必对齐
- **归一化**: 只需 `/255`，无 mean/std；letterbox 填充灰 114（`LETTERBOX_PAD_COLOR = '#727272'`）
- **推理引擎**: iOS 用 CoreML, Android 用 XNNPACK, 兜底 CPU；模型从 assets 复制到文档目录缓存
- **非花卉评估**: 生产代码生效 3 项（绿色占比 >0.5 拒绝、饱和度 <20 拒绝、置信度 <0.3 拒绝）；熵/跌落比/底部和 会计算并随结果返回，但**当前未参与决策门控**（常量 `DROP_OFF_THRESHOLD`/`BOTTOM_SUM_MAX` 定义了未使用）——表述上请说"多维置信度评估"，不要说"7 重过滤"
- **三级置信度**: `HIGH_CONFIDENCE=0.85` / `LOW_CONFIDENCE=MID_CONFIDENCE=0.3`（`src/constants.ts`）
- **LLM 引擎**: 通义千问 `qwen-vl-plus`（主）+ 豆包 `doubao-vl-128k`（备）；`.env` 键 `QWEN_API_KEY` / `DOUBAO_API_KEY`，**绝对不能提交**（README 若写"智谱/DeepSeek"为旧口径）
- **免注册**: 首次启动自动生成匿名 UUID
- **分支策略**: `main` = 产品代码 + ONNX + 文档
- **Android 架构**: `gradle.properties` 设 `reactNativeArchitectures=arm64-v8a,x86_64`（双架构包兼容模拟器与真机）
- **团队注意**: `build.gradle` 含阿里云 Maven 镜像，海外队员构建可能超时
- **Metro 配置**: `metro.config.js` 已添加 `watchFolders` 和 `resetCache: true`，解决模块解析和缓存问题

## 代码结构

```
SmartGarden/src/
├── constants.ts              # 模型配置、9 类阈值、LLM 配置、设计令牌（COLORS/RADIUS/SPACING/SHADOWS/TYPOGRAPHY）
├── data/
│   ├── flowerClasses.ts      # 9 个类别（中文 + 英文）⚠️ 与 class_order.json 索引需对齐
│   └── chineseCities.ts      # 30 个城市（天气城市选择）
├── types/                    # 类型定义（CareGuide、weather 等）
├── navigation/
│   ├── types.ts              # 导航类型定义
│   ├── RootNavigator.tsx     # 根导航栈（仅 MainTabs）
│   └── MainTabNavigator.tsx  # 底部标签栏（首页/识别/花园）
├── screens/
│   ├── WelcomeScreen.tsx     # 全屏沉浸式引导页（4 页水平滑动 + 叶子生长/水波纹动画）
│   ├── HomeScreen.tsx        # 首页 — Hero + 天气卡片 + 功能卡片 + 养护百科弹窗
│   ├── RecognizeScreen.tsx   # 识别主界面 — useRecognition 状态机 + 杂志式结果页
│   └── GardenScreen.tsx      # 我的花园 — 列表 + 天气养护调整 + 详情弹窗
├── hooks/
│   └── useRecognition.ts     # 识别状态机（idle/camera/inferring/result/error）
├── components/
│   ├── CameraViewfinder.tsx  # 全屏取景器（拍照/闪光灯/权限/生命周期）
│   ├── DesignCard.tsx        # 精致阴影 + 圆角卡片
│   ├── SectionHeader.tsx     # 杂志编辑风格区块标题（英文标签 + 中文大标题）
│   ├── FlowerAvatar.tsx      # 彩色圆形头像（10 色哈希配色）
│   ├── StatusBadge.tsx       # 胶囊状态标签（5 变体）
│   ├── ActionButton.tsx      # 统一行动按钮（6 变体 + 3 尺寸 + 按压动画）
│   ├── ButtonGroup.tsx       # 按钮组容器（自动换行）
│   ├── WeatherCard.tsx / CityPickerModal.tsx / WeatherAdvisedCare.tsx  # 天气模块
│   ├── AddToGardenModal.tsx / CorrectionModal.tsx  # 结果页弹窗
│   └── Icon.tsx              # 图标封装
├── database/
│   ├── db.ts                 # SQLite 建表（user/garden/feedback 三表）
│   ├── gardenRepository.ts   # 花园数据访问
│   └── correctionRepository.ts  # 纠错数据访问（仅存 imageHash）
├── services/
│   ├── YoloService.ts        # ONNX 模型加载与推理（单例 + 进度回调 + 基准测试）
│   ├── ImagePreprocessor.ts  # 图片预处理（缩放→解码→归一化→CHW）+ 颜色分析 + FNV-1a 哈希
│   ├── RecognitionOrchestrator.ts  # 识别编排：三维置信度决策 + LLM 增强 + 知识补充
│   ├── RecognitionCache.ts   # LRU 结果缓存（50 条 / 1h TTL）
│   ├── LlmService.ts         # LLM 双引擎调用（qwen 主 / doubao 备）
│   ├── KnowledgeService.ts   # 花卉知识查询（54 种 JSON 单例）
│   ├── WeatherService.ts / WeatherCareService.ts  # 天气获取 / 天气养护建议
│   ├── CorrectionService.ts  # 纠错提交与查询
│   ├── UserService.ts / GardenService.ts / ExportService.ts  # 用户/花园/导出
│   ├── NetworkService.ts     # 在线检测 + 监听
│   ├── LoggerService.ts / ErrorHandler.ts  # 日志（4 级滚动 7 天）/ 错误码文案
│   └── ModelUpdateService.ts # 模型远程版本检查 + INT8 量化支持
└── store/
    ├── useAppStore.ts        # Zustand 全局状态（用户 + 推理结果）
    └── useWeatherStore.ts    # 天气状态（城市/TTL 缓存/离线/GPS 定位）
```

测试：`SmartGarden/__tests__/`（App/数据库/知识库）+ `src/**/__tests__/`（服务/store）；调试脚本放 `SmartGarden/scripts/`（**不要放 `__tests__` 目录**，Jest 会收集该目录下所有文件）。

## UI 设计系统

### 颜色体系（有机自然主义，`constants.ts` 实际键）

| Token | 值 | 用途 |
|-------|-----|------|
| `COLORS.forest` | `#2D5A3D` | 深森林绿 — 主品牌色 |
| `COLORS.sage` | `#A3B899` | 鼠尾草绿 — 次要强调 |
| `COLORS.earth` | `#8B7355` | 大地棕 — 辅助色 |
| `COLORS.bg` / `bgDark` | `#F7F5F0` / `#1A1A1A` | 页面底色（明/暗） |
| `COLORS.card` / `cardDark` | `#FFFFFF` / `#252524` | 卡片背景 |
| `COLORS.error` | `#CD5C5C` | 朱砂红 — 警示/错误 |
| `COLORS.text` / `textSecondary` | `#1A1A1A` / `#6B6B6B` | 文字 |

> 旧名 `primary`（→forest）、`primaryDark`（→forestDark）等仍作为 deprecated 别名存在。

### 阴影 / 间距 / 排版 / 圆角（以 `constants.ts` 为准）

| 系统 | Token 实际值 |
|------|-------------|
| `SHADOWS` | `card`（默认）/ `cardHover` / `modal` / `top`（底部导航） |
| `SPACING` | `xs:4` `sm:8` `md:12` `lg:16` `xl:20` `xxl:24` `xxxl:32` `huge:48` |
| `TYPOGRAPHY` | `hero:32/700` `h1:26/700` `h2:20/600` `h3:17/600` `body:15/400` |
| `RADIUS` | `xs:6` `sm:8` `md:12` `lg:16` `xl:20` `xxl:24` `pill:999` |

有机自然主义原则：以森林绿为品牌锚点，大地色系营造温暖自然感；卡片使用精致分层阴影而非双色叠影；排版强调杂志编辑感（英文标签 + 中文大标题组合）。

### 图标库依赖

- `react-native-vector-icons` — 图标库主包
- `@react-native-vector-icons/material-design-icons` — Material Design 图标子集
- 字体文件需手动复制到 `android/app/src/main/assets/fonts/`

## 已知坑

1. **ONNX 输出已内嵌 softmax** — 不要再 softmax（历史上 debug 了最久的一个 bug）
2. **类别索引不同步** — `class_order.json`（训练）与 `flowerClasses.ts`（APP）第 3/4/6 位不一致，改模型或类别表前先对齐
3. **ImagePreprocessor 兜底 padding** — `padVal = 114` (Uint8Array 原值)，不是归一化值
4. **JPEG 二次压缩** — `createResizedImage` 用 JPEG Q=100，减少有损压缩
5. **`@react-native/jest-preset`** — RN 0.86 需单独 `npm install --save-dev`
6. **`StyleSheet.absoluteFillObject`** — RN 中应是 `absoluteFill`（不能加 Object 后缀）
7. **Paper v5 `accent` 已移除** — 主题用 `secondary` 替代
8. **`react-native-vision-camera` v4** — `takePhoto` 无 `quality` 参数
9. **模拟器 x86** — XNNPACK FP16 在 x86 模拟器精度可能不足，真机无此问题
10. **嵌套 ScrollView** — 结果页用 `<View>` 不是 `<ScrollView>`，外层统一滚动
11. **超时定时器必须 finally 清理** — `Promise.race` 的超时 setTimeout 在分支完成后仍会残留（历史 bug：YoloService/NetworkService 已修，新增超时逻辑注意 `finally { clearTimeout }`）
12. **Jest 原生模块 mock** — `@react-native-community/geolocation`、`netinfo`、`onnxruntime-react-native`、`react-native-fs` 等原生模块必须 mock；App 级测试还需全局 mock `fetch`（返回 404），否则启动期异步（模型版本检查等）会在测试结束后才 settle，触发 "Cannot log after tests are done"
13. **调试脚本勿入 `__tests__`** — RN preset 会收集 `__tests__` 目录下**所有**文件（无 `.test` 后缀也会），调试脚本放 `SmartGarden/scripts/`
14. **识别页失焦重置** — RecognizeScreen 用 `useFocusEffect` 的 cleanup 调 `handleReset()`，离开页面清空识别结果，再次进入回到初始态（Tab 不卸载组件，state 会保留）

## 启动流程

```
App mount → 后台预加载（用户/模型更新检查/模型加载，20s 超时保护）+ GPS 自动定位
  → WelcomeScreen 全屏覆盖（状态栏自动隐藏）
  → 第 1 页：品牌页（全屏森林绿背景 + 中央 160px 大图标 + 品牌名）
  → 第 2-3 页：功能介绍（大幅居中图标 + 大标题滑动）
  → 第 4 页：加载页（功能介绍 + 叶子生长动画 + 旋转水波纹 + 进度条）
    → YoloService.loadModel(onProgress) 预加载模型
  → 用户操作 / 加载完成后 → 状态栏恢复 → 进入主界面
  → RecognizeScreen 按钮初始为灰色 "模型加载中…"，模型就绪后变为可用
  → 识别完成离开页面（Tab 切换）→ 状态自动重置，再次进入为初始态
```

## 团队协作检查清单

- ✅ 无硬编码绝对路径（`D:\` `C:\` 等）
- ✅ `local.properties` 已 gitignore
- ✅ `.env` 已 gitignore（含 `QWEN_API_KEY`/`DOUBAO_API_KEY`），无 API Key 泄露
- ✅ `package.json` 脚本均为通用命令
- ✅ 大赛材料（`docs/大赛材料/`）已 gitignore，含团队个人信息不入库
- ⚠️ `build.gradle` 含阿里云 Maven — 海外队员需删除或注释
- ⚠️ 全量 Jest 10 套件 171 用例应保持全绿；跑测试用 `npx jest`（在 `SmartGarden/` 目录）

## 源码头

- 移动端 APP 源码在 `SmartGarden/src/`
- Python 训练脚本(`train.py`, `export_onnx.py`, `model_utils.py`, `predict.py`)已在初始提交中删除，可在 git 历史 `34da349` 中恢复
- TS 调试脚本（`SmartGarden/scripts/onnx_minimal_debug.ts`、`preprocessor_debug.ts`）为手动验证用，不参与 Jest

## 权威文档

| 文档 | 用途 |
|------|------|
| `docs/智慧花园项目架构文档.md` | **权威参考** — 技术架构、模块设计（v2.2 本地推理口径） |
| `docs/模块名称结构图.md` | 文件结构、分支归属、Git 忽略策略 |
| `docs/智慧花园开发线路图.md` | 80 天 3 人分工、里程碑 |
| `docs/智慧花园项目需求文档.md` | 产品需求、验收标准（v2.0 为早期云端口径，指标以架构文档为准） |
| `docs/设计风格总结-植物养护App.md` | UI 设计系统参考（色彩/组件/动画） |
| `docs/Phase1_Unit1_验收大纲.md` | Phase 1 单元验收项（含未勾选项=未完成项） |
| `docs/Phase1_人工测试验收.html` | 人工测试验收报告（5 流程 27 用例） |
| `docs/天气养护调整功能-实现计划.md` | 天气功能 5 天实现计划 |
| `README.md` | 项目概览、快速开始 |

> 文档不一致时，以架构文档 v2.2 与代码实际为准（README/需求文档部分内容为旧口径）。
