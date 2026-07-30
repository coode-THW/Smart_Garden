# 设计风格总结 — 从非遗文创到植物养护管家

> 基于「荣昌陶器与夏布 · 非遗文创平台」的完整设计系统提炼，映射到植物养护手机应用 UI 设计。

---

## 一、色彩体系（核心骨架）

### 1.1 原平台色板

| Token | Hex | 设计语义 |
|-------|-----|---------|
| `clay` | `#D2B48C` | 主品牌色 / 按钮 / 导航高亮 |
| `clay-deep` | `#8B7355` | 副标题 / hover 加深 |
| `clay-light` | `#E8D5B7` | 强调文字 / 品牌名高亮 |
| `celadon` | `#5F9EA0` | 次要强调 / 链接 / 信息提示 |
| `celadon-light` | `#A8D5D7` | 装饰色 |
| `cinnabar` | `#CD5C5C` | 价格 / CTA 按钮 / 错误 / 删除 |
| `cinnabar-deep` | `#A05252` | 红色按钮 hover |
| `rice` | `#F5F5DC` | 全局页面背景 |
| `ramie` | `#F8F4E9` | 次级背景 / 表头 / 卡片底色 |
| `charcoal` | `#2C2C2C` | 正文 / 侧边栏背景 |
| `charcoal-soft` | `#4A4A4A` | 次级文字 |

### 1.2 植物养护 App 映射方案

| 植物 Token | Hex | 设计语义 | 原平台对应 |
|-----------|-----|---------|-----------|
| `sage` | `#A3B899` | 主品牌色 / 按钮 / 导航高亮 | `clay` |
| `forest` | `#5A7A5A` | 副标题 / hover 加深 | `clay-deep` |
| `mint` | `#C8DDC5` | 强调文字 / 品牌名高亮 | `clay-light` |
| `leaf` | `#5A9A6F` | 次要强调 / 链接 / 信息提示 | `celadon` |
| `leaf-light` | `#A3CFAB` | 装饰色 | `celadon-light` |
| `cinnabar` | `#CD5C5C` | **保留不变** — 危险 / 枯萎 / 缺水警告 | `cinnabar` |
| `cinnabar-deep` | `#A05252` | 红色按钮 hover | `cinnabar-deep` |
| `cream` | `#F9F8F4` | 全局页面背景（暖奶油白） | `rice` |
| `dew` | `#F2F7F0` | 次级背景 / 表头（微绿底色，晨露感） | `ramie` |
| `soil` | `#2D2D2A` | 正文 / 深色区域（泥土深灰） | `charcoal` |
| `soil-soft` | `#5A5A55` | 次级文字 | `charcoal-soft` |

> **设计公式**：暖色做品牌 + 冷绿做功能 + 红色做警示 + 奶油做底色。从陶土到绿植，色相偏移约 60°，饱和度和明度保持不变。

### 1.3 Tailwind Config 一键替换

```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        sage:           '#A3B899',
        'forest':       '#5A7A5A',
        'mint':         '#C8DDC5',
        leaf:           '#5A9A6F',
        'leaf-light':   '#A3CFAB',
        cinnabar:       '#CD5C5C',
        'cinnabar-deep':'#A05252',
        cream:          '#F9F8F4',
        dew:            '#F2F7F0',
        soil:           '#2D2D2A',
        'soil-soft':    '#5A5A55'
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'serif'],
        sans:  ['Noto Sans SC', 'sans-serif']
      }
    }
  }
}
```

---

## 二、字体排版

| 层级 | 字体 | 大小/权重 | 用途 |
|------|------|----------|------|
| **大标题** | `font-serif` | text-3xl（~30px）font-bold | 页面主标题（"今日养护"） |
| **区块标签** | `font-sans` | text-xs tracking-[0.3em] uppercase font-medium | 英文小标签（"PLANT CARE"） |
| **卡片标题** | `font-sans` | text-sm font-medium | 植物名称 |
| **描述文字** | `font-sans` | text-xs text-charcoal/40 | 植物品种 / 养护备注 |
| **价格/强调** | `font-sans` | text-lg font-bold | 植物 App 改为任务提醒用绿色/红色强调 |
| **正文** | `font-sans` | text-sm | 养护指南正文 |
| **Logo** | `font-serif` | 18px bold tracking-wider | App 标题栏品牌名 |

> **核心原则**：标题衬线（自然/文化感） + 正文无衬线（清晰/数据感）。植物养护 App 完美继承这个组合。

---

## 三、组件设计语言

### 3.1 卡片 Card

```
┌──────────────────────────────┐
│  ┌──────────────────────────┐│
│  │    植物图片（56px高）      ││ ← object-cover, group-hover:scale-105
│  │    [状态角标 pill]        ││ ← 右上角胶囊标签
│  └──────────────────────────┘│
│                              │
│  绿萝              ← 植物名   │
│  天南星科 · 喜阴   ← 品种描述 │
│                              │
│  🟢 健康    💧 2天前 浇水    │ ← 状态 + 养护信息
└──────────────────────────────┘
```

| 属性 | 值 | 说明 |
|------|-----|------|
| 圆角 | `rounded-2xl`（16px） | 非常圆润，亲和感 |
| 边框 | `border border-clay/5` | 极淡品牌色边框，几乎隐形 |
| 背景 | `bg-white` | 纯白卡片 |
| 阴影 | 无默认阴影 | hover 才触发，不做 Material 浮起 |
| hover | `translateY(-6px)` + 阴影展开 | `card-hover` 类，0.35s 过渡 |
| 图片缩放 | `group-hover:scale-105` | 500ms 慢速放大 |
| 角标 | `rounded-full` 胶囊形 | 状态标记（"需浇水"/"健康"/"新芽"） |

### 3.2 按钮 Button

| 类型 | 样式 | 场景 |
|------|------|------|
| **主按钮** | `bg-sage hover:bg-forest text-white rounded-full` | "记录浇水" / "添加植物" |
| **CTA 按钮** | `bg-cinnabar hover:bg-cinnabar-deep text-white rounded-full` | "SOS 急救" / "立即浇水" |
| **图标按钮** | `bg-sage/10 hover:bg-sage text-forest hover:text-white rounded-full` | 卡片上的快捷操作 |
| **加减按钮** | `w-8 h-8 border border-sage/20 rounded-lg` | 水量/肥料用量调节 |
| **点击反馈** | `btn-press` → `scale(0.95)` | 0.15s 微缩 |

### 3.3 列表行（购物车行 → 养护任务列表）

```
┌──────────────────────────────────────────┐
│ [✓] [🌱图]  绿萝               [− 200 +] │
│      96×96   喜阴 · 需浇水200ml  ml       │
│      圆角12  下次: 今天 14:00             │
└──────────────────────────────────────────┘
```

| 原设计元素 | 植物 App 替换 |
|-----------|-------------|
| 商品缩略图 96×96 rounded-xl | 植物照片 96×96 rounded-xl |
| 商品名称 + 描述 | 植物名 + 养护备注 |
| 单价 ¥XX | 每次浇水量 / 施肥量 |
| 数量 ± 按钮 | 水量 ml 调节 |
| 复选框选中 | 完成浇水打勾 |
| "结算"按钮 | "完成养护"按钮 |

### 3.4 空状态 Empty State

```
        🌿
   （大号叶子图标）

   还没有添加植物

   点击下方按钮
   开始你的第一株植物吧

   [➕ 添加植物]
```

- 图标：Font Awesome `fa-leaf` 或自定义植物插画
- 主文案：温暖、有情感
- 按钮：胶囊形主色按钮
- 容器：`text-center py-16 text-charcoal/40`

### 3.5 底部操作栏（购物车结算栏 → 养护进度栏）

```
┌──────────────────────────────────────────┐
│ ← 添加植物    3株需浇水     [开始养护 →] │
└──────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 定位 | `sticky bottom-0` 或固定在底部 Tab 上方 |
| 背景 | `bg-white border-t border-sage/10 shadow-up` |
| 布局 | `flex justify-between items-center` |
| 左侧 | 次要操作（文字链接 + 箭头图标） |
| 右侧 | 汇总信息 + 主操作按钮 |

### 3.6 空状态（购物车空态 → 养护任务空态）

```
         🎉
    今天所有植物都喝饱啦

    别忘了给绿萝换盆哦
    [查看养护日历 →]
```

**设计要点**：
- Font Awesome 图标 5xl（fa-check-circle / fa-smile-o）
- 主文案 `text-lg` 温暖情感化
- 副文案 `text-sm text-charcoal/40`
- 引导按钮 `rounded-full bg-sage`

---

## 四、动画系统

| 动画名 | 时长 | 缓动函数 | 植物 App 场景 |
|--------|------|---------|-------------|
| `fadeIn` | 0.35s | `cubic-bezier(0.4,0,0.2,1)` | 页面 / Tab 切换 |
| `pageReveal` | 0.5s | `cubic-bezier(0.4,0,0.2,1)` | 主内容区首次加载（从下往上 12px） |
| `modalPopIn` | 0.35s | `cubic-bezier(0.34,1.56,0.64,1)` | 浇水确认弹窗、植物详情弹窗（弹性缩放） |
| `btn-press` | 0.15s | `ease` | 所有按钮点击 → `scale(0.95)` |
| `card-hover` | 0.35s | `cubic-bezier(0.4,0,0.2,1)` | 植物卡片 → `translateY(-6px)` + 阴影 |
| `toast-enter` | 0.3s | `ease` | "浇水提醒"通知 |
| `spin` | 0.8s | `linear` 无限 | 加载植物数据 |
| `checkBounce` | 0.5s | `cubic-bezier(0.34,1.56,0.64,1)` | 浇水完成后的对勾动画 |

> 🌱 **建议新增**：`sprout` 动画 — 植物从小变大的 scaleIn（0.6s），用于首次添加植物或植物生长阶段升级。

```css
@keyframes sprout {
  from {
    opacity: 0;
    transform: scale(0.3) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.sprout-enter {
  animation: sprout 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

---

## 五、移动端布局结构（640px 以下）

```
┌─────────────────────────────┐
│  Mobile Top Bar             │  ← bg-soil text-white, sticky top-0
│  ☰ 植物管家          🔔     │     height 48px, z-index 50
├─────────────────────────────┤
│                             │
│  PLANT CARE                 │  ← 英文小标 tracking-[0.3em]
│  今日养护                   │  ← H2 font-serif font-bold
│                             │
│  ┌──────┐ ┌──────┐         │  ← grid grid-cols-2 gap-4
│  │ 🌱   │ │ 🪴   │         │     内边距 px-4（16px）
│  │ 绿萝 │ │ 龟背 │         │
│  └──────┘ └──────┘         │
│                             │
│  养护任务 (3)               │
│  ┌──────────────────────┐  │
│  │ [✓] [图] 绿萝   [− +]│  │  ← 购物车同款行结构
│  │          浇水 200ml   │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ [ ] [图] 龟背竹 [− +]│  │
│  │          施肥 5g      │  │
│  └──────────────────────┘  │
│                             │
├─────────────────────────────┤
│  Bottom Tab Bar             │  ← fixed bottom-0 h-[60px]
│  🏠  🌱   📋   👤          │     bg-white, border-t
│  首页 植物 任务 我的         │     shadow-[0_-2px_12px_rgba(0,0,0,0.06)]
└─────────────────────────────┘
```

### 响应式断点

| 断点 | 宽度 | 布局 |
|------|------|------|
| 小屏手机 | 0–479px | 单列网格，10px gap |
| 手机 | 480–639px | 双列网格，16px 内边距，底部 Tab 栏 |
| 小平板 | 640–767px | 双列网格，Carousel 增高到 320px |
| 平板 | 768–1023px | 3 列网格 |
| 桌面 | 1024px+ | 4 列网格（如有 Web 版） |

### 侧滑抽屉菜单

```
┌─────────────┐
│  植物管家    │  ← bg-soil, 深色
│  ─────────  │
│  🏠 首页     │  ← 选中项 bg-white/8 + 左侧竖线指示
│  🌱 我的植物 │
│  📋 养护日历 │
│  📊 生长记录 │
│  ⚙️ 设置     │
└─────────────┘
```

| 属性 | 值 |
|------|-----|
| 宽度 | 280px |
| 背景 | `bg-soil`（深色） |
| 动画 | `transform: translateX(-100%) → translateX(0)`，0.3s |
| 遮罩 | `bg-black/50`，opacity 过渡 |
| z-index | 抽屉 100，遮罩 99 |

---

## 六、组件复用度对照表

| 原平台组件 | 植物 App 对应 | 代码复用率 |
|-----------|-------------|-----------|
| 产品卡片 Grid | 植物卡片 Grid | **100%** — 结构完全相同，换图+换文案 |
| 购物车商品行 | 养护任务列表行 | **95%** — 数量 → 水量/次数 |
| 购物车空状态 | 全部完成 / 无植物 | **100%** |
| Toast 通知 | 浇水/施肥提醒 | **100%** — 颜色改绿色 |
| 底部 Tab 栏 | 4 个 Tab 导航 | **100%** — 换 icon |
| 结算弹窗 | 养护确认弹窗 | **90%** — loading → success 模式 |
| Hero Carousel | 植物推荐 Banner | **80%** |
| 侧滑抽屉 | 菜单抽屉 | **100%** |
| 复选框 accent-color | 复选框 accent-sage | **100%** |
| 加减数量控件 | 水量/肥料调节 | **100%** |
| 全选/批量操作 | 批量完成养护 | **100%** |

---

## 七、关键 CSS 复用片段

### 7.1 卡片 hover 效果（无需修改）

```css
.card-hover {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-hover:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 40px -12px rgba(44, 44, 44, 0.15),
              0 0 0 1px rgba(163, 184, 153, 0.15);  /* sage 替换 clay */
}

.card-hover img {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.card-hover:hover img {
  transform: scale(1.05);
}
```

### 7.2 按钮点击反馈（无需修改）

```css
.btn-press {
  transition: transform 0.15s ease;
}

.btn-press:active {
  transform: scale(0.95);
}
```

### 7.3 页面过渡（无需修改）

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes pageReveal {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### 7.4 弹窗弹出（无需修改）

```css
@keyframes modalPopIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

### 7.5 触摸优化（无需修改）

```css
@media (max-width: 767px) {
  button { min-width: 44px; min-height: 44px; }
  input[type="checkbox"] { width: 20px !important; height: 20px !important; }
  * { -webkit-tap-highlight-color: transparent; }
  .card-hover:active { transform: scale(0.97); transition: transform 0.1s ease; }
}
```

---

## 八、设计系统 Token 完整对照

```
非遗文创平台                    植物养护 App
─────────────────────────────────────────────
clay         #D2B48C    →    sage         #A3B899
clay-deep    #8B7355    →    forest       #5A7A5A
clay-light   #E8D5B7    →    mint         #C8DDC5
celadon      #5F9EA0    →    leaf         #5A9A6F
celadon-light #A8D5D7   →    leaf-light   #A3CFAB
cinnabar     #CD5C5C    →    cinnabar     #CD5C5C    (保留)
rice         #F5F5DC    →    cream        #F9F8F4
ramie        #F8F4E9    →    dew          #F2F7F0
charcoal     #2C2C2C    →    soil         #2D2D2A
charcoal-soft #4A4A4A   →    soil-soft    #5A5A55

font-serif   Noto Serif SC  →  Noto Serif SC  (保留)
font-sans    Noto Sans SC   →  Noto Sans SC   (保留)
rounded-2xl  16px           →  16px           (保留)
gap-6        24px           →  24px           (保留)
```

---

## 九、一句话总结

> **这套设计的本质是"东方极简 + 自然材质色 + 圆润亲和 + 微交互克制"。从"陶土/夏布"换成"绿植/土壤"，只需色彩偏移 60° 色相，布局、组件、动画、响应式策略全部原样继承。你需要的不是一个全新的设计系统，而是同一套系统的绿色版本。**

### 给开发者的最快上手路径

1. **复制 Tailwind Config** → 把 clay 系颜色批量替换为 sage/forest 系
2. **复制 HTML 结构** → 购物车行 = 养护任务行，产品卡片 = 植物卡片
3. **复制 CSS 动画** → `card-hover`、`btn-press`、`modalPopIn` 全部不动
4. **复制移动端布局** → 底部 Tab 栏 + 抽屉菜单 + 响应式断点
5. **改图标** → `fa-shopping-cart` → `fa-leaf`，`fa-history` → `fa-seedling`
6. **改文案** → 中文养护术语，温暖情感化表达
