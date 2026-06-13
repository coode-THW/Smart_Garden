"""
YOLOv11 花卉识别训练脚本
=======================
功能：
  1. 自动下载 tf_flowers 数据集（5种常见花卉，国内可访问）
  2. 使用 YOLOv11 进行分类训练
  3. 可视化并保存 loss / accuracy 曲线

使用方法：
  python train_flower.py

如需使用更大的数据集（如魔乐社区102类花卉），修改 DATASET_DIR 指向本地数据集路径即可。
"""

import os
import sys
import tarfile
import shutil
from pathlib import Path

import random
import requests
import numpy as np
import pandas as pd
import matplotlib
try:
    matplotlib.use("TkAgg")  # 兼容 Windows 下的 GUI 后端
except Exception:
    pass
import matplotlib.pyplot as plt
from ultralytics import YOLO
import torch

# ============================================================
#  配置常量
# ============================================================

# --- 数据集 ---
# tf_flowers: 5 种常见花卉，Google Storage 国内通常可访问
DATASET_URL = (
    "https://storage.googleapis.com/download.tensorflow.org/"
    "example_images/flower_photos.tgz"
)
DATASET_NAME = "tf_flowers"
DATASET_DIR = Path("datasets") / DATASET_NAME  # 下载 & 解压后的数据集根目录
DATA_YAML = DATASET_DIR / "data.yaml"           # YOLO 训练配置

# --- 模型 ---
MODEL_NAME = "yolo11n-cls.pt"   # 优先使用分类预训练权重
FALLBACK_MODEL = "yolo11n.pt"   # 后备：检测预训练权重

# --- 训练 ---
EPOCHS = 50
IMG_SIZE = 224
BATCH_SIZE = 32 if torch.cuda.is_available() else 8
LEARNING_RATE = 0.001
PATIENCE = 10                     # 早停
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
WORKERS = 0                       # Windows 多进程兼容
AMP = torch.cuda.is_available()   # GPU 下开启混合精度

# --- 输出 ---
PROJECT_DIR = "runs/classify"
EXPERIMENT_NAME = "flower_yolo11n"
LOSS_CURVE_FILE = Path("loss_curves.png")

# 5 种花卉的中英文对照
CLASS_NAMES_ZH = ["雏菊", "蒲公英", "玫瑰", "向日葵", "郁金香"]
CLASS_NAMES_EN = ["daisy", "dandelion", "roses", "sunflowers", "tulips"]


# ============================================================
#  工具函数
# ============================================================

def print_device_info() -> None:
    """打印当前运行设备信息（修复 GPU 显存属性）"""
    print("-" * 50)
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        # 兼容旧版本 PyTorch (total_mem) 和新版本 (total_memory)
        props = torch.cuda.get_device_properties(0)
        if hasattr(props, 'total_memory'):
            gpu_mem = props.total_memory / 1024 ** 3
        else:
            # 兼容 <=1.13 版本
            gpu_mem = props.total_mem / 1024 ** 3
        print(f"[设备] GPU: {gpu_name}  |  显存: {gpu_mem:.1f} GB")
    else:
        print("[设备] CPU 模式（无可用 GPU）")
    print(f"[设备] PyTorch {torch.__version__}  |  CUDA: {torch.version.cuda or 'N/A'}")
    print("-" * 50)


# ============================================================
#  Block 2: 下载 & 准备数据集
# ============================================================

def download_tf_flowers(extract_dir: Path) -> bool:
    """
    下载 tf_flowers.tgz 并解压到 extract_dir。
    返回 True 表示成功，False 表示失败（此时应提示用户手动下载）。
    """
    extract_dir.mkdir(parents=True, exist_ok=True)

    # 如果已经解压过，跳过下载
    photos_dir = extract_dir / "flower_photos"
    if photos_dir.exists() and any(photos_dir.iterdir()):
        print(f"[数据] 数据集已存在: {photos_dir}")
        return True

    tgz_path = extract_dir / "flower_photos.tgz"

    print(f"[下载] 正在下载 tf_flowers 数据集 (~220 MB)...")
    print(f"[下载] 源地址: {DATASET_URL}")

    try:
        response = requests.get(DATASET_URL, stream=True, timeout=120)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))
        downloaded = 0

        with open(tgz_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = downloaded / total_size * 100
                    print(f"\r[下载] {downloaded / 1024 / 1024:.1f} / "
                          f"{total_size / 1024 / 1024:.1f} MB ({pct:.0f}%)", end="")
        print()  # 换行

    except requests.RequestException as e:
        print(f"\n[错误] 下载失败: {e}")
        print("[提示] 请手动下载数据集并放到以下路径:")
        print(f"       {extract_dir / 'flower_photos'}")
        print(f"  下载地址: {DATASET_URL}")
        print(f"  解压后确保目录结构为: {extract_dir / 'flower_photos' / '<类别名>' / '*.jpg'}")
        return False

    # 解压
    print("[解压] 正在解压 tgz 文件...")
    try:
        with tarfile.open(tgz_path, "r:gz") as tar:
            tar.extractall(path=extract_dir)
        tgz_path.unlink()  # 删除 tgz 节省空间
        print("[解压] 完成")
    except tarfile.TarError as e:
        print(f"[错误] 解压失败: {e}")
        return False

    return True


def prepare_yolo_classification_dataset(extract_dir: Path, dataset_dir: Path) -> Path:
    """
    将 tf_flowers 转换为 YOLO 分类格式:

    dataset_dir/
      train/
        daisy/     (70%)
        dandelion/
        roses/
        sunflowers/
        tulips/
      val/
        daisy/     (30%)
        ...

    返回 data.yaml 的路径。
    """
    photos_dir = extract_dir / "flower_photos"
    if not photos_dir.exists():
        raise FileNotFoundError(f"未找到数据集目录: {photos_dir}")

    # 清理旧数据
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    train_dir = dataset_dir / "train"
    val_dir = dataset_dir / "val"

    class_names = sorted(
        d.name for d in photos_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

    if not class_names:
        # 如果 flower_photos 下没有子目录，检查是否是 LICENSE.txt 等平级文件
        # tf_flowers 标准结构是 flower_photos/daisy/*.jpg
        raise FileNotFoundError(f"{photos_dir} 下未找到任何类别文件夹，请检查数据集结构")

    print(f"[数据] 检测到 {len(class_names)} 个类别: {class_names}")

    for class_name in class_names:
        (train_dir / class_name).mkdir(parents=True, exist_ok=True)
        (val_dir / class_name).mkdir(parents=True, exist_ok=True)

        # 获取所有 jpg 图片
        images = list((photos_dir / class_name).glob("*.jpg"))
        if not images:
            print(f"[警告] 类别 '{class_name}' 下没有任何 jpg 图片，跳过")
            continue

        # 按 7:3 划分 train/val（手动随机分割，无外部依赖）
        shuffled = list(images)
        random.seed(42)
        random.shuffle(shuffled)
        split_idx = int(len(shuffled) * 0.7)
        train_imgs = shuffled[:split_idx]
        val_imgs = shuffled[split_idx:]

        # 复制图片到对应目录
        for img_path in train_imgs:
            shutil.copy2(img_path, train_dir / class_name / img_path.name)
        for img_path in val_imgs:
            shutil.copy2(img_path, val_dir / class_name / img_path.name)

        print(f"  {class_name}: train={len(train_imgs)}, val={len(val_imgs)}")

    # 写入 data.yaml
    yaml_path = dataset_dir / "data.yaml"
    yaml_content = f"""# YOLO 分类训练配置 (自动生成)
path: {dataset_dir.resolve().as_posix()}
train: train/
val: val/

# 类别数
nc: {len(class_names)}
# 类别名
names: {class_names}
"""
    yaml_path.write_text(yaml_content)
    print(f"[数据] data.yaml 已生成: {yaml_path}")
    return yaml_path


# ============================================================
#  Block 3: 训练模型 (修改后)
# ============================================================

def train_model(data_yaml_path: Path) -> Path:
    """
    加载 YOLO 模型并在花卉数据集上进行分类训练。
    返回 Ultralytics 结果保存目录。
    """
    # --- 选择模型权重 ---
    model_file = MODEL_NAME
    if not Path(model_file).exists():
        print(f"[模型] {model_file} 不存在，尝试自动下载...")
        try:
            _ = YOLO(model_file)  # 触发 ultralytics 自动下载
        except Exception:
            print(f"[模型] 下载失败，使用后备模型 {FALLBACK_MODEL}")
            model_file = FALLBACK_MODEL

    print(f"[训练] 加载模型: {model_file}")
    model = YOLO(model_file)

    # --- 开始训练 ---
    # 【修改点】将 data 参数指向数据集所在的根目录 (data_yaml_path 的父目录)
    dataset_root_dir = data_yaml_path.parent
    print(f"[训练] 开始训练 (device={DEVICE}, epochs={EPOCHS}, batch={BATCH_SIZE})")
    print(f"[训练] 使用数据集路径: {dataset_root_dir}")

    results = model.train(
        data=str(dataset_root_dir),  # <--- 这里是关键修改，从文件路径改为目录路径
        task="classify",
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        batch=BATCH_SIZE,
        device=DEVICE,
        workers=WORKERS,
        amp=AMP,
        lr0=LEARNING_RATE,
        augment=True,
        patience=PATIENCE,
        project=PROJECT_DIR,
        name=EXPERIMENT_NAME,
        exist_ok=True,
        verbose=True,
    )

    # 训练结果保存目录
    save_dir = Path(results.save_dir)
    print(f"[训练] 完成！模型保存至: {save_dir}")
    return save_dir


# ============================================================
#  Block 4: 绘制 Loss / Accuracy 曲线
# ============================================================

def plot_loss_curves(results_dir: Path, class_names: list, save_path: Path) -> None:
    """从 results.csv 读取训练日志，绘制 loss / accuracy 曲线。"""
    csv_path = results_dir / "results.csv"
    if not csv_path.exists():
        print(f"[绘图] 未找到 {csv_path}，跳过自定义绘图")
        print(f"[绘图] 你可以查看 Ultralytics 自动生成的 {results_dir / 'results.png'}")
        return

    df = pd.read_csv(csv_path)
    # 清理列名（去除前后空格）
    df.columns = df.columns.str.strip()

    print(f"[绘图] 读取 {len(df)} 条训练记录")

    # 创建 2×2 子图
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle(f"YOLOv11 花卉分类训练曲线  ({len(class_names)} 类)", fontsize=14)

    # --- 子图 1: 训练 Loss ---
    ax = axes[0, 0]
    if "train/loss" in df.columns:
        ax.plot(df["epoch"], df["train/loss"], "b-", linewidth=1.5, label="Train Loss")
        if "val/loss" in df.columns:
            ax.plot(df["epoch"], df["val/loss"], "r--", linewidth=1.5, label="Val Loss")
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Loss")
        ax.set_title("训练 & 验证 Loss")
        ax.legend()
        ax.grid(True, alpha=0.3)
    else:
        ax.text(0.5, 0.5, "无 Loss 数据", ha="center", va="center", transform=ax.transAxes)

    # --- 子图 2: Top-1 准确率 ---
    ax = axes[0, 1]
    if "metrics/accuracy_top1" in df.columns:
        ax.plot(df["epoch"], df["metrics/accuracy_top1"] * 100,
                "g-", linewidth=1.5, label="Top-1 Accuracy")
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Accuracy (%)")
        ax.set_title("验证集 Top-1 准确率")
        ax.legend()
        ax.grid(True, alpha=0.3)
        # 标注最佳准确率
        best_idx = df["metrics/accuracy_top1"].idxmax()
        best_acc = df.loc[best_idx, "metrics/accuracy_top1"] * 100
        best_epoch = df.loc[best_idx, "epoch"]
        ax.annotate(f"Best: {best_acc:.1f}% (epoch {int(best_epoch)})",
                    xy=(best_epoch, best_acc),
                    xytext=(best_epoch + 3, best_acc - 5),
                    arrowprops=dict(arrowstyle="->", color="darkgreen"),
                    fontsize=9, color="darkgreen")
    else:
        ax.text(0.5, 0.5, "无 Accuracy 数据", ha="center", va="center", transform=ax.transAxes)

    # --- 子图 3: Top-5 准确率 ---
    ax = axes[1, 0]
    if "metrics/accuracy_top5" in df.columns:
        ax.plot(df["epoch"], df["metrics/accuracy_top5"] * 100,
                "m-", linewidth=1.5, label="Top-5 Accuracy")
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Accuracy (%)")
        ax.set_title("验证集 Top-5 准确率")
        ax.legend()
        ax.grid(True, alpha=0.3)
        best_idx = df["metrics/accuracy_top5"].idxmax()
        best_acc = df.loc[best_idx, "metrics/accuracy_top5"] * 100
        best_epoch = df.loc[best_idx, "epoch"]
        ax.annotate(f"Best: {best_acc:.1f}% (epoch {int(best_epoch)})",
                    xy=(best_epoch, best_acc),
                    xytext=(best_epoch + 3, best_acc - 2),
                    arrowprops=dict(arrowstyle="->", color="darkmagenta"),
                    fontsize=9, color="darkmagenta")
    else:
        ax.text(0.5, 0.5, "无 Top-5 数据", ha="center", va="center", transform=ax.transAxes)

    # --- 子图 4: 学习率 ---
    ax = axes[1, 1]
    if "lr/pg0" in df.columns:
        ax.plot(df["epoch"], df["lr/pg0"], "c-", linewidth=1.5, label="Learning Rate")
        ax.set_xlabel("Epoch")
        ax.set_ylabel("Learning Rate")
        ax.set_title("学习率变化")
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.ticklabel_format(style="scientific", axis="y", scilimits=(0, 0))
    else:
        ax.text(0.5, 0.5, "无 LR 数据", ha="center", va="center", transform=ax.transAxes)

    plt.tight_layout()
    fig.savefig(save_path, dpi=150, bbox_inches="tight")
    print(f"[绘图] Loss 曲线已保存至: {save_path}")

    # 尝试显示（GUI 环境下）
    try:
        plt.show()
    except Exception:
        pass


# ============================================================
#  Block 5: 主函数
# ============================================================

def main() -> None:
    print("=" * 50)
    print("   YOLOv11 花卉识别训练")
    print("=" * 50)

    # 1. 设备信息
    print_device_info()

    # 2. 下载数据集
    print("\n[Step 1/4] 准备数据集...")
    # tf_flowers 解压到 datasets/ 下
    extract_root = DATASET_DIR.parent  # datasets/
    success = download_tf_flowers(extract_root)
    if not success:
        sys.exit(1)

    # 3. 转换为 YOLO 分类格式
    print("\n[Step 2/4] 转换为 YOLO 分类格式...")
    yaml_path = prepare_yolo_classification_dataset(
        extract_dir=extract_root,
        dataset_dir=DATASET_DIR,
    )

    # 4. 训练
    print("\n[Step 3/4] 开始训练...")
    results_dir = train_model(yaml_path)

    # 5. 绘制 loss 曲线
    print("\n[Step 4/4] 绘制 Loss 曲线...")
    plot_loss_curves(results_dir, CLASS_NAMES_ZH, LOSS_CURVE_FILE)

    # 完成
    print("\n" + "=" * 50)
    print("   训练完成！")
    print(f"   最佳模型: {(results_dir / 'weights' / 'best.pt').resolve()}")
    print(f"   Loss 曲线: {LOSS_CURVE_FILE.resolve()}")
    print(f"   Ultralytics 结果: {results_dir.resolve()}")
    print("=" * 50)

    # 快速推理示例
    print("\n[示例] 如何使用训练好的模型进行推理:")
    print(f"  from ultralytics import YOLO")
    print(f"  model = YOLO(r'{(results_dir / 'weights' / 'best.pt').resolve()}')")
    print(f"  results = model('your_flower.jpg')")
    print(f"  # results[0].probs.top5  → top-5 预测类别及概率")


if __name__ == "__main__":
    main()