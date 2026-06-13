"""
花卉识别 Web 应用
================
Flask 后端，提供：
  - 页面路由（首页 / 照片识别 / 视频识别）
  - REST API（模型状态 / 图片预测）
"""

import io
import time
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, render_template, request
from PIL import Image

from model_utils import get_model_info, predict_top5

# ============================================================
#  Flask 应用初始化
# ============================================================

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 限制上传大小 16 MB

# 上传暂存目录
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


# ============================================================
#  页面路由
# ============================================================

@app.route("/")
def index():
    """首页 — 模式选择"""
    return render_template("index.html")


@app.route("/photo")
def photo_page():
    """照片识别页"""
    return render_template("photo.html")


@app.route("/video")
def video_page():
    """实时视频识别页"""
    return render_template("video.html")


# ============================================================
#  API 路由
# ============================================================

@app.route("/api/model/status")
def api_model_status():
    """返回模型状态"""
    info = get_model_info()
    return jsonify(info)


@app.route("/api/predict", methods=["POST"])
def api_predict():
    """
    图片预测接口。
    接受 multipart/form-data 中的 'image' 字段，
    或直接接受 image/jpeg 原始二进制 body。
    返回 JSON: {success, predictions, top1, processing_time_ms}
    """
    t_start = time.time()

    # --- 读取图片 ---
    img_array = None

    if request.content_type and "image/" in request.content_type:
        # 原始图片字节（视频帧使用）
        try:
            img_bytes = request.get_data()
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            img_array = np.array(img)
        except Exception as e:
            return jsonify({
                "success": False,
                "error": "invalid_image",
                "message": f"无法解析图片: {str(e)}",
            }), 400
    elif "image" in request.files:
        # 文件上传
        file = request.files["image"]
        if file.filename == "":
            return jsonify({
                "success": False,
                "error": "no_file",
                "message": "未选择文件",
            }), 400
        try:
            img = Image.open(file.stream).convert("RGB")
            img_array = np.array(img)
        except Exception as e:
            return jsonify({
                "success": False,
                "error": "invalid_image",
                "message": f"无法解析图片: {str(e)}",
            }), 400
    else:
        return jsonify({
            "success": False,
            "error": "bad_request",
            "message": "请上传图片文件（字段名 'image'）或发送原始图片字节",
        }), 400

    # --- 推理 ---
    result = predict_top5(img_array)
    predictions = result["predictions"]
    margin = result["margin"]
    entropy = result["entropy"]

    if not predictions:
        return jsonify({
            "success": False,
            "error": "model_not_loaded",
            "message": "模型未加载，请先运行 python train.py 训练模型",
        }), 503

    t_elapsed = time.time() - t_start

    return jsonify({
        "success": True,
        "predictions": predictions,
        "top1": predictions[0],
        "margin": margin,
        "entropy": entropy,
        "processing_time_ms": round(t_elapsed * 1000, 1),
    })


# ============================================================
#  错误处理
# ============================================================

@app.errorhandler(413)
def too_large(e):
    return jsonify({
        "success": False,
        "error": "file_too_large",
        "message": "文件过大，请上传小于 16 MB 的图片",
    }), 413


# ============================================================
#  启动入口
# ============================================================

if __name__ == "__main__":
    print("=" * 50)
    print("   🌺 花卉识别 Web 应用")
    print("=" * 50)

    info = get_model_info()
    if info["model_exists"]:
        print(f"[启动] 模型已就绪: {info['model_path']}")
        print(f"[启动] 识别类别 ({info['class_count']}): {', '.join(info['classes_zh'])}")
    else:
        print("[启动] ⚠️  未找到训练好的模型，上传识别功能不可用")
        print("[启动] 请先运行 python train.py 训练模型")

    print(f"[启动] 访问地址: http://127.0.0.1:5000")
    print("=" * 50)

    app.run(host="127.0.0.1", port=5000, debug=True)
