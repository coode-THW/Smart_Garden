# 智慧花园 Smart Garden — AI 编码导航

> 拍照识花 · YOLOv11 + ONNX Runtime 移动端本地推理 · 免注册 · 离线优先

## 项目定位

React Native 移动端花卉识别 APP。YOLO 推理在手机上本地完成，仅低置信度时直连云端大模型增强。**没有后端服务器**（Phase 1/2）。

## 模块地图

| 模块 | 位置 | 状态 | 说明 |
|------|------|------|------|
| **移动端 APP** | `SmartGarden/` | ✅ 开发中 | React Native 0.86，端到端识别可用 |
| **业务代码** | `SmartGarden/src/` | ✅ 就绪 | 导航/页面/服务/组件/状态管理 |
| **ONNX 模型** | `models/yolov11n-flower.onnx` | ✅ 就绪 | 5 类花卉分类, 224×224 FP16, 5.9MB |
| **APP 内模型** | `SmartGarden/assets/yolov11n-flower.onnx` | ✅ 就绪 | Metro 随 APP 打包 |
| **启动脚本** | `scripts/` | ✅ 就绪 | `start-android.bat` / `.ps1` 一键启动 |
| **养护知识库** | `SmartGarden/assets/care/` | 📋 待创建 | 50+ 品种 JSON, 尚未开始 |
| **Python 训练** | `train.py` 等 | 🏠 个人分支 | 不在 main 分支, 见分支策略 |

## 当前开发状态

```
Phase 1 (第 1-40 天)
  ✅ ONNX 模型导出 (yolov11n-flower.onnx, 5.9MB)
  ✅ React Native 项目初始化
  ✅ SmartGarden/src/ 业务代码（导航/页面/服务/组件）
  ✅ 端到端识别：拍照 → 预处理 → ONNX 推理 → 显示结果
  ✅ 非花卉过滤（7 重判断：置信度+边距+熵+跌落比+底部和+绿色占比+饱和度）
  ✅ 相机组件增强（闪光灯/拍照质量/错误弹窗/生命周期管理）
  ✅ Jest 单元测试可用
  📋 养护知识库 JSON（尚未创建）
  📋 Flask 验证服务（个人分支）
```

## 关键技术约定

- **模型**: YOLOv11n 分类, 输入 `[1,3,224,224]` FP32, 输出 `[1,5]` 已内嵌 softmax 的概率
- **5 个类别**: 雏菊 / 蒲公英 / 玫瑰 / 向日葵 / 郁金香
- **⚠️ ONNX 已内嵌 softmax**：模型输出即概率，**不要再 softmax**
- **归一化**: 只需 `/255`，无 mean/std
- **推理引擎**: iOS 用 CoreML, Android 用 XNNPACK, 兜底 CPU
- **非花卉判断**: 置信度 + 边距 + 熵 + 跌落比 + 底部和 + 绿色占比 + 饱和度，7 项全过才算 HIGH
- **免注册**: 首次启动自动生成匿名 UUID, 全部功能可用
- **分支策略**: `main` = 产品代码 + ONNX + 文档; `training/*` = Python 训练脚本(不合并)
- **环境变量**: `.env` 含 API Key, **绝对不能提交**

## 代码结构

```
SmartGarden/src/
├── constants.ts              # 模型配置、类别名、阈值常量
├── navigation/
│   ├── types.ts              # 导航类型定义
│   ├── RootNavigator.tsx     # 根导航栈
│   └── MainTabNavigator.tsx  # 底部标签栏（首页/识别/花园）
├── screens/
│   ├── HomeScreen.tsx        # 首页
│   ├── RecognizeScreen.tsx   # 识别主界面（状态机驱动）
│   └── GardenScreen.tsx      # 我的花园
├── components/
│   └── CameraViewfinder.tsx  # 全屏相机取景器（拍照/闪光灯/权限）
├── services/
│   ├── YoloService.ts        # ONNX 模型加载与推理单例
│   └── ImagePreprocessor.ts  # 图片预处理管线（缩放→解码→归一化→CHW）
└── store/
    └── useAppStore.ts        # Zustand 全局状态
```

## 已知坑

1. **ONNX 输出已内嵌 softmax** — `YoloService.ts` 直接取 `output.data`，不要再调 `softmax()`
2. **ImagePreprocessor 兜底 padding** — `padVal = 114` (Uint8Array 原值)，不是归一化值
3. **JPEG 二次压缩** — `createResizedImage` 用 JPEG Q=100，减少有损压缩损失
4. **`@react-native/jest-preset`** — RN 0.86 需单独 `npm install --save-dev`
5. **模拟器 x86** — XNNPACK FP16 在 x86 模拟器精度可能不足，真机无此问题

## 源码头

- 移动端 APP 源码在 `SmartGarden/src/`
- Python 训练脚本(`train.py`, `export_onnx.py`, `model_utils.py`, `predict.py`)已在初始提交中删除，可在 git 历史 `34da349` 中恢复

## 权威文档

| 文档 | 用途 |
|------|------|
| `docs/智慧花园项目架构文档.md` (v2.2) | **权威参考** — 技术架构、模块设计、数据协议 |
| `docs/模块名称结构图.md` (v1.1) | 文件结构、分支归属、Git 忽略策略速查 |
| `docs/智慧花园开发线路图.md` (v1.0) | 80 天 3 人分工、里程碑 |
| `docs/智慧花园项目需求文档.md` (v2.0) | 产品需求、验收标准 |
| `README.md` | 项目概览、快速开始 |

> 文档不一致时，以架构文档 v2.2 为准。
