# 智慧花园 Smart Garden — AI 编码导航

> 拍照识花 · YOLOv11 + ONNX Runtime 移动端本地推理 · 免注册 · 离线优先

## 项目定位

React Native 移动端花卉识别 APP。YOLO 推理在手机上本地完成。**没有后端服务器**（Phase 1/2）。

## 模块地图

| 模块 | 位置 | 状态 | 说明 |
|------|------|------|------|
| **移动端 APP** | `SmartGarden/` | ✅ 开发中 | React Native 0.86 |
| **业务代码** | `SmartGarden/src/` | ✅ 就绪 | 导航/页面/服务/组件/状态管理 |
| **ONNX 模型** | `models/yolov11n-flower.onnx` | ✅ 就绪 | 5 类花卉分类, 224×224, 5.9MB |
| **APP 内模型** | `SmartGarden/assets/yolov11n-flower.onnx` | ✅ 就绪 | Metro 随 APP 打包 |
| **养护知识库** | `SmartGarden/src/services/KnowledgeService.ts` | 📋 示例数据 | 接口已定义，内置 5 种花示例 |
| **启动脚本** | `scripts/` | 🏠 本地 | 不推送至仓库 |
| **Python 训练** | `train.py` 等 | 🏠 git 历史 | `34da349` 可恢复，main 已删除 |

## 当前开发状态

```
Phase 1
  ✅ ONNX 模型导出 + React Native 项目初始化
  ✅ 端到端识别：拍照 → 预处理 → ONNX 推理 → 显示结果
  ✅ 非花卉过滤（7 重判断：置信度+边距+熵+跌落比+底部和+绿色占比+饱和度）
  ✅ 相机组件（闪光灯/权限/生命周期/isActive）
  ✅ 有机自然主义 UI（DesignCard 精致阴影 + 圆角卡片 + 杂志编辑风格）
  ✅ WelcomeScreen 沉浸式引导页（4 页水平滑动 + 叶子生长动画）
  ✅ 按钮系统重构（ActionButton 6 种变体 + ButtonGroup 自动换行）
  ✅ 花卉档案卡片（学名/科属/产地/花期 — 2 列网格布局）
  ✅ 拍照按钮状态管理（模型未就绪时灰色禁用）
  ✅ Jest 单元测试
  ✅ 暗色模式适配
  📋 养护知识库 JSON（接口已定义，示例数据已内置）
  📋 推送提醒 / 养护日历
```

## 关键技术约定

- **模型**: YOLOv11n 分类, 输入 `[1,3,224,224]` FP32, 输出 `[1,5]` 已内嵌 softmax 的概率
- **5 个类别**: 雏菊 / 蒲公英 / 玫瑰 / 向日葵 / 郁金香
- **⚠️ ONNX 已内嵌 softmax**：模型输出即概率，**不要再 softmax**（历史 bug：double softmax 致置信度从 90% 掉到 40%）
- **归一化**: 只需 `/255`，无 mean/std
- **推理引擎**: iOS 用 CoreML, Android 用 XNNPACK, 兜底 CPU
- **非花卉判断**: 7 项全过才算 HIGH（参见 `constants.ts` 阈值）
- **免注册**: 首次启动自动生成匿名 UUID
- **分支策略**: `main` = 产品代码 + ONNX + 文档
- **环境变量**: `.env` 含 API Key, **绝对不能提交**
- **团队注意**: `build.gradle` 含阿里云 Maven 镜像，海外队员构建可能超时
- **Metro 配置**: `metro.config.js` 已添加 `watchFolders` 和 `resetCache: true`，解决模块解析和缓存问题

## 代码结构

```
SmartGarden/src/
├── constants.ts              # 模型配置、类别名、阈值、设计令牌（COLORS/SHADOWS/SPACING/TYPOGRAPHY）
├── navigation/
│   ├── types.ts              # 导航类型定义
│   ├── RootNavigator.tsx     # 根导航栈
│   └── MainTabNavigator.tsx  # 底部标签栏（首页/识别/花园）
├── screens/
│   ├── WelcomeScreen.tsx     # 全屏沉浸式引导页（4 页水平滑动 + 品牌/功能/加载）
│   ├── HomeScreen.tsx        # 首页 — Hero + 有机自然功能卡片
│   ├── RecognizeScreen.tsx   # 识别主界面 — 状态机 + 杂志式结果页
│   └── GardenScreen.tsx      # 我的花园 — 空状态 + CTA
├── components/
│   ├── CameraViewfinder.tsx  # 全屏取景器（拍照/闪光灯/权限/生命周期）
│   ├── DesignCard.tsx        # 精致阴影 + 圆角卡片（NeumorphView 替代方案）
│   ├── SectionHeader.tsx     # 杂志编辑风格区块标题（英文标签 + 中文大标题）
│   ├── FlowerAvatar.tsx      # 彩色圆形头像，替代 emoji
│   ├── StatusBadge.tsx       # 胶囊状态标签
│   ├── ActionButton.tsx      # 统一行动按钮（6 种变体 + 3 种尺寸 + 图标 + 按压动画）
│   └── ButtonGroup.tsx       # 按钮组容器（自动换行，解决小屏幕溢出问题）
├── services/
│   ├── YoloService.ts        # ONNX 模型加载与推理（单例 + 进度回调）
│   ├── ImagePreprocessor.ts  # 图片预处理（缩放→解码→归一化→CHW）+ 颜色分析
│   └── KnowledgeService.ts   # 花卉知识查询（接口定义 + 示例数据）
└── store/
    └── useAppStore.ts        # Zustand 全局状态
```

## UI 设计系统

### 颜色体系（有机自然主义）

| Token | 值 | 用途 |
|-------|-----|------|
| `COLORS.forest` | `#2D5A3D` | 深森林绿 — 主品牌色 |
| `COLORS.sage` | `#A3B899` | 鼠尾草绿 — 强调色（原 `primary` 别名） |
| `COLORS.earth` | `#8B7355` | 大地棕 — 辅助色 |
| `COLORS.cream` | `#F7F5F0` | 暖米白 — 页面底色（原 `bg` 别名） |
| `COLORS.cinnabar` | `#CD5C5C` | 朱砂红 — 警示/高亮 |
| `COLORS.bg` / `bgDark` | `#F7F5F0` / `#1E1E1C` | 页面底色（保留旧名向后兼容） |

> 向后兼容：旧颜色名称 `primary`、`sage` 等仍可用作别名。

### 阴影系统

| Token | 值 | 用途 |
|-------|-----|------|
| `SHADOWS.sm` | 轻阴影 | 小标签、头像 |
| `SHADOWS.md` | 标准阴影 | 普通卡片 |
| `SHADOWS.lg` | 重阴影 | 浮层、弹窗 |
| `SHADOWS.xl` | 极重阴影 | 全屏覆盖层 |

### 间距系统

| Token | 值 | 用途 |
|-------|-----|------|
| `SPACING.xs` / `sm` / `md` / `lg` / `xl` | 4 / 8 / 16 / 24 / 32 | 基础间距阶梯 |
| `SPACING.screen` | 20 | 屏幕安全边距 |

### 排版系统

| Token | 值 | 用途 |
|-------|-----|------|
| `TYPOGRAPHY.h1` | 32px / Bold | 页面大标题 |
| `TYPOGRAPHY.h2` | 24px / SemiBold | 区块标题 |
| `TYPOGRAPHY.body` | 16px / Regular | 正文 |
| `TYPOGRAPHY.caption` | 12px / Medium | 标签、辅助文字 |

### 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `RADIUS.pill` | `999` | 胶囊按钮、标签 |
| `RADIUS.lg` | `16` | 卡片圆角 |
| `RADIUS.md` | `12` | 中等组件 |
| `RADIUS.sm` | `8` | 小按钮、输入框 |

有机自然主义原则：以森林绿为品牌锚点，大地色系营造温暖自然感；卡片使用精致分层阴影而非双色叠影；排版强调杂志编辑感（英文标签 + 中文大标题组合）。

### 图标库依赖

- `react-native-vector-icons` — 图标库主包
- `@react-native-vector-icons/material-design-icons` — Material Design 图标子集
- 字体文件需手动复制到 `android/app/src/main/assets/fonts/`

## 已知坑

1. **ONNX 输出已内嵌 softmax** — 不要再 softmax（历史上 debug 了最久的一个 bug）
2. **ImagePreprocessor 兜底 padding** — `padVal = 114` (Uint8Array 原值)，不是归一化值
3. **JPEG 二次压缩** — `createResizedImage` 用 JPEG Q=100，减少有损压缩
4. **`@react-native/jest-preset`** — RN 0.86 需单独 `npm install --save-dev`
5. **`StyleSheet.absoluteFillObject`** — RN 中应是 `absoluteFill`（不能加 Object 后缀）
6. **Paper v5 `accent` 已移除** — 主题用 `secondary` 替代
7. **`react-native-vision-camera` v4** — `takePhoto` 无 `quality` 参数
8. **模拟器 x86** — XNNPACK FP16 在 x86 模拟器精度可能不足，真机无此问题
9. **嵌套 ScrollView** — 结果页用 `<View>` 不是 `<ScrollView>`，外层统一滚动

## 启动流程

```
App mount → WelcomeScreen 全屏覆盖（状态栏自动隐藏）
  → 第 1 页：品牌页（全屏森林绿背景 + 中央 160px 大图标 + 品牌名）
  → 第 2-3 页：功能介绍（大幅居中图标 + 大标题滑动）
  → 第 4 页：加载页（功能介绍 + 叶子生长动画 + 旋转水波纹 + 进度条）
    → YoloService.loadModel(onProgress) 预加载模型
  → 用户操作 / 加载完成后 → 状态栏恢复 → 进入主界面
  → RecognizeScreen 按钮初始为灰色 "模型加载中…"，
    isLoaded 为 true 后变为可用
```

## 团队协作检查清单

- ✅ 无硬编码绝对路径（`D:\` `C:\` 等）
- ✅ `local.properties` 已 gitignore
- ✅ `.env` 已 gitignore，无 API Key 泄露
- ✅ `package.json` 脚本均为通用命令
- ⚠️ `build.gradle` 含阿里云 Maven — 海外队员需删除或注释

## 源码头

- 移动端 APP 源码在 `SmartGarden/src/`
- Python 训练脚本(`train.py`, `export_onnx.py`, `model_utils.py`, `predict.py`)已在初始提交中删除，可在 git 历史 `34da349` 中恢复

## 权威文档

| 文档 | 用途 |
|------|------|
| `docs/智慧花园项目架构文档.md` | **权威参考** — 技术架构、模块设计 |
| `docs/模块名称结构图.md` | 文件结构、分支归属、Git 忽略策略 |
| `docs/智慧花园开发线路图.md` | 80 天 3 人分工、里程碑 |
| `docs/智慧花园项目需求文档.md` | 产品需求、验收标准 |
| `docs/设计风格总结-植物养护App.md` | UI 设计系统参考（色彩/组件/动画） |
| `README.md` | 项目概览、快速开始 |

> 文档不一致时，以架构文档为准。
