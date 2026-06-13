"""
花卉识别共享推理模块
====================
提供模型加载单例、路径探测、Top-5 预测等共用逻辑。
供 Flask 后端（app.py）和原脚本（predict_flower.py / video_predict.py）复用。
"""

import os
from pathlib import Path

from ultralytics import YOLO

# ============================================================
#  类别映射
# ============================================================

CLASS_NAMES_ZH = ["雏菊", "蒲公英", "玫瑰", "向日葵", "郁金香"]
CLASS_NAMES_EN = ["daisy", "dandelion", "roses", "sunflowers", "tulips"]

# 置信度与边距阈值
CONFIDENCE_THRESHOLD = 0.55      # top1 最低置信度
UNCERTAIN_THRESHOLD = 0.35       # 不确定状态的最低置信度
MARGIN_THRESHOLD = 0.30          # top1 - top2 最低差距（差距小说明模型拿不准）
ENTROPY_THRESHOLD = 1.2          # 熵值上限（熵越高分布越均匀，越不像真实花卉）


def en_to_zh(name_en: str) -> str:
    """英文类别名 → 中文类别名"""
    for en, zh in zip(CLASS_NAMES_EN, CLASS_NAMES_ZH):
        if name_en.lower() == en.lower():
            return zh
    return name_en  # 未匹配则返回原文


# ============================================================
#  模型路径探测
# ============================================================

# 项目根目录（该文件位于项目根目录）
PROJECT_ROOT = Path(__file__).resolve().parent

MODEL_PATH_CANDIDATES = [
    PROJECT_ROOT / "runs/classify/runs/classify/flower_yolo11n/weights/best.pt",
    PROJECT_ROOT / "runs/classify/flower_yolo11n/weights/best.pt",
    Path("runs/classify/runs/classify/flower_yolo11n/weights/best.pt"),
    Path("runs/classify/flower_yolo11n/weights/best.pt"),
]


def get_model_path() -> Path | None:
    """探测实际存在的模型文件路径，返回第一个命中的路径，都不存在则返回 None"""
    for p in MODEL_PATH_CANDIDATES:
        if p.exists():
            return p.resolve()
    return None


def model_exists() -> bool:
    """检查是否有可用的训练模型"""
    return get_model_path() is not None


# ============================================================
#  模型单例
# ============================================================

_model = None
_model_path: Path | None = None


def load_model() -> bool:
    """
    加载 YOLO 模型（单例模式，只加载一次）。
    返回 True 表示加载成功，False 表示未找到模型文件。
    """
    global _model, _model_path

    if _model is not None:
        return True  # 已加载

    path = get_model_path()
    if path is None:
        print("[model_utils] 未找到训练好的模型文件，请先运行 train_flower.py 训练模型")
        return False

    print(f"[model_utils] 加载模型: {path}")
    _model = YOLO(str(path))
    _model_path = path
    return True


def get_model() -> YOLO | None:
    """获取模型实例（未加载时自动加载），失败返回 None"""
    if _model is None:
        ok = load_model()
        if not ok:
            return None
    return _model


# ============================================================
#  推理接口
# ============================================================

def predict_top5(image_input):
    """
    对输入图像进行 Top-5 分类预测。

    参数
    ----
    image_input : str | Path | numpy.ndarray
        图片文件路径，或 OpenCV / PIL 图像数组

    返回
    ----
    dict  {predictions, margin, entropy}
        predictions: list[dict] 按置信度降序排列的 Top-5
        margin: float            top1 - top2 置信度差距
        entropy: float           概率分布熵值（越高越不确定）
        模型未加载时返回 {"predictions": [], "margin": 0, "entropy": 0}
    """
    import math

    model = get_model()
    if model is None:
        return {"predictions": [], "margin": 0.0, "entropy": 0.0}

    results = model(image_input, verbose=False)

    for r in results:
        probs = r.probs.top5
        names = [r.names[i] for i in probs]
        confs = [r.probs.top5conf[i].item() for i in range(len(probs))]

        output = []
        for name_en, conf in zip(names, confs):
            name_zh = en_to_zh(name_en)
            output.append({
                "name_zh": name_zh,
                "name_en": name_en,
                "confidence": round(conf, 4),
            })

        # 计算 Margin（top1 - top2）
        margin = round(confs[0] - confs[1], 4) if len(confs) >= 2 else 0.0

        # 计算熵（值越大分布越均匀 = 越不确定）
        entropy = -sum(c * math.log(max(c, 1e-12)) for c in confs)

        return {
            "predictions": output,
            "margin": margin,
            "entropy": round(entropy, 4),
        }

    return {"predictions": [], "margin": 0.0, "entropy": 0.0}


def predict_top1(image_input) -> dict | None:
    """
    对输入图像进行 Top-1 分类预测，综合置信度 + 边距 + 熵判定状态。

    返回
    ----
    dict | None  {name_zh, name_en, confidence, status, margin, entropy}
        status: "recognized" | "uncertain" | "unknown"
        模型未加载时返回 None
    """
    result = predict_top5(image_input)
    preds = result["predictions"]
    if not preds:
        return None

    best = preds[0]
    conf = best["confidence"]
    margin = result["margin"]
    entropy = result["entropy"]

    # 综合判定：置信度足够高 + 与第二名差距足够大 + 分布够集中
    if (
        conf > CONFIDENCE_THRESHOLD
        and margin > MARGIN_THRESHOLD
        and entropy < ENTROPY_THRESHOLD
    ):
        status = "recognized"
    elif conf > UNCERTAIN_THRESHOLD:
        status = "uncertain"
    else:
        status = "unknown"

    return {**best, "status": status, "margin": margin, "entropy": entropy}


# ============================================================
#  模型信息
# ============================================================

def get_model_info() -> dict:
    """返回模型状态信息（供前端 /api/model/status 使用）"""
    path = get_model_path()
    return {
        "model_exists": path is not None,
        "model_path": str(path) if path else None,
        "classes_zh": CLASS_NAMES_ZH,
        "classes_en": CLASS_NAMES_EN,
        "class_count": len(CLASS_NAMES_ZH),
    }
