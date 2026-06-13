"""
单张花卉图片预测脚本
====================
用法: python predict.py <图片路径>
示例: python predict.py imgs/img1.jpg
      或直接运行 python predict.py 使用默认测试图片
"""

import sys
from pathlib import Path

import cv2
import matplotlib.pyplot as plt

from model_utils import predict_top5, model_exists, CLASS_NAMES_ZH

# 默认测试图片目录
DEFAULT_IMG_DIR = Path("datasets/tf_flowers/val/daisy")

if __name__ == "__main__":
    # 检查模型
    if not model_exists():
        print("❌ 未找到训练好的模型，请先运行 python train.py 训练模型")
        sys.exit(1)

    # 图片路径
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
    else:
        # 自动找一个测试图片
        candidates = list(DEFAULT_IMG_DIR.glob("*.jpg")) if DEFAULT_IMG_DIR.exists() else []
        if candidates:
            img_path = str(candidates[0])
            print(f"使用默认测试图片: {img_path}")
        else:
            print("请指定图片路径: python predict.py <图片路径>")
            sys.exit(1)

    # 预测
    result = predict_top5(img_path)
    preds = result["predictions"]

    if not preds:
        print("❌ 推理失败")
        sys.exit(1)

    print("\n" + "=" * 40)
    print("   🌺 花卉识别结果")
    print("=" * 40)
    for i, p in enumerate(preds, 1):
        bar = "█" * int(p["confidence"] * 40)
        print(f"  {i}. {p['name_zh']:6s}  {p['confidence']:6.1%}  {bar}")

    print(f"\n  边距(margin): {result['margin']:.1%}  |  熵(entropy): {result['entropy']:.3f}")
    print("-" * 40)

    # 显示图片
    img = cv2.imread(img_path)
    if img is not None:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        plt.figure(figsize=(8, 6))
        plt.imshow(img)
        plt.title(f"Top-1: {preds[0]['name_zh']} ({preds[0]['confidence']:.1%})",
                  fontsize=14, fontfamily='sans-serif')
        plt.axis("off")
        plt.tight_layout()
        plt.show()
    else:
        print(f"⚠️  无法读取图片: {img_path}")
