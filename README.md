# 🌿 智慧花园 Smart Garden

> 拍照识花 · 科学养护 · 本地推理 · 隐私优先

基于 **YOLOv11 + ONNX Runtime 移动端本地推理** 的智能花卉养护助手。拍照即可识别花卉品种，获取科学养护指南。核心识别在手机上离线完成，无需注册、无需联网。

---

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                   APP 客户端 (React Native)           │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  UI 层   │ → │  识别编排器   │ → │  YOLO 推理   │  │
│  │ 拍照/相册 │ ← │ Orchestrator │ ← │ ONNX Runtime │  │
│  └──────────┘   └──────┬───────┘   └─────────────┘  │
│                        │                             │
│         conf<30%   30%~85%     conf≥85%              │
│         (非花卉)   (疑似花卉)   (确认花卉)             │
│            │          │            │                 │
│            ↓          ↓            ↓                 │
│        提示重拍    LLM 增强     本地返回              │
│                  (HTTPS 直连)                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  数据层: SQLite (用户数据) + JSON (养护知识库)   │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

| 层级 | 技术 | 说明 |
|------|------|------|
| **UI 层** | React Native 0.86 + React Native Paper | 跨平台移动端界面 |
| **业务逻辑层** | TypeScript + Zustand | 识别编排、状态管理 |
| **AI 推理层** | ONNX Runtime Mobile + YOLOv11n | 本地离线推理 |
| **数据层** | SQLite + JSON | 用户数据 + 养护知识库 |
| **云端扩展** | 阿里云百炼 / 智谱AI (HTTPS 直连) | 低置信度时增强识别 |

### 核心设计

- **三级置信度决策**：<30% 拒绝并引导重拍 → 30%~85% 调 LLM 增强 → ≥85% 本地直接返回
- **免注册即用**：首次启动自动生成匿名 UUID，无需注册即可使用全部功能
- **离线可用**：YOLO 推理完全本地执行，网络仅用于 LLM 增强和知识库更新
- **模型规格**：YOLOv11n 分类模型 → ONNX FP16 5.9MB → 输入 224×224 → 输出 5 类概率

---

## 项目结构

> ⭐ = main 分支 &nbsp;|&nbsp; 🏠 = 个人/训练分支（不合并 main）&nbsp;|&nbsp; 🚫 = Git 不跟踪

```
YOLO_smart-garden/
├── CLAUDE.md                 ⭐  AI 编码导航（Claude Code 自动加载）
├── README.md                 ⭐  项目说明
│
├── models/
│   └── yolov11n-flower.onnx  ⭐  ONNX 部署模型 (5.9MB, 5 类)
│
├── docs/                     ⭐  项目文档
│   ├── 智慧花园项目需求文档.md
│   ├── 智慧花园项目架构文档.md   # ← 权威参考 (v2.2)
│   ├── 智慧花园开发线路图.md
│   ├── 模块名称结构图.md        # ← 文件分支归属速查
│   └── 设计风格总结-植物养护App.md  # ← UI 设计参考
│
└── SmartGarden/              ⭐  React Native 移动端 APP
    ├── App.tsx               ⭐  根组件（启动预加载 + 新拟态 UI）
    ├── __tests__/            ⭐  Jest 单元测试
    ├── assets/
    │   └── yolov11n-flower.onnx  ⭐  随 APP 打包的模型
    ├── android/              ⭐  Android 原生工程
    ├── ios/                  ⭐  iOS 原生工程
    └── src/                  ⭐  业务源码
        ├── constants.ts          模型配置、类别名、阈值、设计令牌
        ├── navigation/           导航（Root + 底部 Tab）
        ├── screens/              首页 / 识别 / 花园
        ├── components/           相机取景器 / 新拟态容器
        ├── services/             YoloService / ImagePreprocessor / KnowledgeService
        ├── store/                Zustand 状态管理
        └── types/                类型声明
```

> Python 训练脚本 (`train.py`, `export_onnx.py` 等) 已从 `main` 删除，保留在 git 历史中可恢复。

---

## 快速开始

### 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Python | 3.11+ | 模型训练、ONNX 导出、Flask 验证 |
| Node.js | 22.11+ | React Native 开发 |
| Android Studio | 最新 | Android 构建与模拟器 |
| Xcode | 15+ (macOS) | iOS 构建 |

### 1. 克隆仓库

```bash
git clone <repo-url>
cd YOLO_smart-garden
```

> ✅ ONNX 模型 (`models/yolov11n-flower.onnx`, 5.9MB) 已包含在仓库中，无需额外下载或训练。

### 2. Python 环境（仅模型训练/导出时需要）

> ⚠️ Python 脚本已从 `main` 分支移除。如需训练或导出模型，请从 git 历史恢复或切换到训练分支。

```bash
# 创建虚拟环境
conda create -n yolo_env python=3.11
conda activate yolo_env

# 安装依赖
pip install -r requirements.txt
```

### 3. 导出 ONNX 模型（如需重新训练）

```bash
# 从 git 历史恢复训练脚本
git show 34da349:export_onnx.py > export_onnx.py

# 确保 best.pt 存在后运行
python export_onnx.py
# 输出: models/yolov11n-flower.onnx (~5.9MB)
```

### 4. 运行 Flask 验证服务（可选）

```bash
# 恢复 Flask 脚本
git show 34da349:app.py > app.py
git show 34da349:model_utils.py > model_utils.py
python app.py
# 浏览器访问 http://localhost:5000
```

### 5. 运行 React Native APP

```bash
cd SmartGarden

# 安装依赖
npm install

# 启动 Metro
npx react-native start

# 另一个终端：运行 Android
npx react-native run-android

# 或运行 iOS (macOS)
npx react-native run-ios
```

---

## 开发阶段

| 阶段 | 周期 | 目标 |
|------|------|------|
| **Phase 1** | 第 1-40 天 | 拍照识花（≥50 种）、养护指南、花园管理、免注册 |
| **Phase 2** | 第 41-60 天 | 一键设置养护提醒、本地通知、知识库在线更新 |
| **Phase 3** | 第 61-80 天 | 远程推送、纠错数据收集、发布上线 |

当前进度：**Phase 1** — 模型导出 ✅ | 项目初始化 ✅ | 端到端识别 ✅ | 新拟态 UI ✅ | 养护知识库（示例数据已内置）📋

> 详见 [开发线路图](docs/智慧花园开发线路图.md)

---

## 分支策略

```
⭐ main       源码 + ONNX 模型 + 配置 + 文档
🏠 training/*  训练脚本 + Flask 验证工具（不合并 main）
```

- **训练模型**：在 `training/*` 分支操作，完成后仅将 `models/*.onnx` 和 `export_onnx.py` 合并到 `main`
- **开发功能**：`feature/*` → Pull Request → `main`
- **训练权重** (`*.pt`)、**数据集** (`datasets/`)、**构建产物** 已通过 `.gitignore` 排除

> 详见 [模块名称结构图 - 附录 B](docs/模块名称结构图.md#附录-b典型工作流与分支操作)

---

## 文档索引

| 文档 | 说明 |
|------|------|
| **CLAUDE.md** | 🤖 AI 编码导航——模块地图、关键约定、入口速查 |
| [项目需求文档](docs/智慧花园项目需求文档.md) | 产品定位、功能需求、验收标准 |
| [项目架构文档](docs/智慧花园项目架构文档.md) | 技术架构、模块设计、数据协议（**权威参考**） |
| [开发线路图](docs/智慧花园开发线路图.md) | 80 天 3 人分工、里程碑、风险评估 |
| [模块名称结构图](docs/模块名称结构图.md) | 文件结构、分支归属、Git 忽略策略 |
| [设计风格总结](docs/设计风格总结-植物养护App.md) | UI 设计系统参考（色彩/新拟态/组件/动画） |

---

## 团队

| 角色 | 技术方向 | 职责 |
|------|----------|------|
| AI 工程师 | Python / ONNX / LLM | 模型训练导出、推理封装、LLM 调用 |
| 前端工程师 | React Native / UI | 页面开发、相机相册、交互体验 |
| 全栈工程师 | 数据 / 服务 / 测试 | SQLite、知识库、Nginx、测试文档 |

---

## 许可证

待定

---

> 📖 文档中有不一致时，以 [项目架构文档 v2.2](docs/智慧花园项目架构文档.md) 为准。
