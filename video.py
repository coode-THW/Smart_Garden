from collections import deque
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from model_utils import (
    get_model,
    model_exists,
    CLASS_NAMES_ZH,
    CLASS_NAMES_EN,
    CONFIDENCE_THRESHOLD,
    UNCERTAIN_THRESHOLD,
    MARGIN_THRESHOLD,
    ENTROPY_THRESHOLD,
)

# 加载模型
if not model_exists():
    print("❌ 未找到训练好的模型，请先运行 python train.py 训练模型")
    sys.exit(1)
model = get_model()

# ========== 未识别配置 ==========
SHOW_UNKNOWN_PROMPT = True  # 是否显示未识别提示
UNKNOWN_PROMPT_TEXT = "未识别到花卉"  # 未识别提示文字
# ================================

# 中文字体配置
FONT_PATH = "C:/Windows/Fonts/simhei.ttf"
if not os.path.exists(FONT_PATH):
    # 备选字体
    FONT_PATH = "C:/Windows/Fonts/msyh.ttc"
    if not os.path.exists(FONT_PATH):
        FONT_PATH = None


def draw_chinese_text(img, text, position, font_size=30, color=(0, 255, 0)):
    """在OpenCV图片上绘制中文"""
    if FONT_PATH is None:
        # 没有中文字体，使用英文提示
        cv2.putText(img, text.encode('ascii', 'ignore').decode(), position,
                    cv2.FONT_HERSHEY_SIMPLEX, font_size / 20, color, 2)
        return img

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    draw = ImageDraw.Draw(pil_img)

    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except:
        font = ImageFont.load_default()

    draw.text(position, text, font=font, fill=color)
    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    return img_bgr


# 平滑参数
HISTORY_LEN = 10
STABLE_FRAMES = 3

prediction_history = deque(maxlen=HISTORY_LEN)
confidence_history = deque(maxlen=HISTORY_LEN)
stable_counter = 0
last_stable_result = "未知"
last_stable_conf = 0.0
last_stable_status = "unknown"


def weighted_average_predict():
    """加权平均预测"""
    if not prediction_history:
        return "未知", 0.0, "unknown"

    scores = {}
    weights = np.linspace(0.5, 1.0, len(prediction_history))

    for i, (pred, conf) in enumerate(zip(prediction_history, confidence_history)):
        weight = weights[i] * conf
        if pred not in scores:
            scores[pred] = 0
        scores[pred] += weight

    if not scores:
        return "未知", 0.0, "unknown"

    best_pred = max(scores.items(), key=lambda x: x[1])
    best_conf = best_pred[1] / sum(weights)

    # 综合判定：加权置信度 + margin 检查（多数帧为 unknown 则不输出 recognized）
    unknown_count = sum(1 for _ in range(len(prediction_history)))
    # 无法从 history 中知道每帧的 status，故只依赖加权置信度 + 硬阈值
    if best_conf > CONFIDENCE_THRESHOLD:
        status = "recognized"
    elif best_conf > UNCERTAIN_THRESHOLD:
        status = "uncertain"
    else:
        status = "unknown"

    return best_pred[0], best_conf, status


print("=" * 50)
print("摄像头实时花卉识别")
print(f"识别范围: {', '.join(CLASS_NAMES_ZH)}")
print(f"置信度阈值: {CONFIDENCE_THRESHOLD * 100:.0f}%")
print("=" * 50)

print("正在启动摄像头...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

frame_count = 0
fps = 0
last_time = time.time()
PREDICT_INTERVAL = 3

# ========== 初始化变量（修复 NameError）==========
current_name = "未识别"
current_conf = 0.0
current_status = "unknown"
# =================================================

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w = frame.shape[:2]
    frame_count += 1

    if frame_count % PREDICT_INTERVAL == 0:
        results = model(frame)

        for r in results:
            probs = r.probs.top5
            top1_idx = probs[0]
            top1_name_en = r.names[top1_idx]
            top1_conf = r.probs.top5conf[0].item()

            # 计算 margin（top1 - top2）和熵
            top5_confs = [r.probs.top5conf[i].item() for i in range(len(probs))]
            margin = top5_confs[0] - top5_confs[1] if len(top5_confs) >= 2 else 0.0
            entropy_val = -sum(c * np.log(max(c, 1e-12)) for c in top5_confs)

            # 综合判定当前帧状态（置信度 + 边距 + 熵）
            if (
                top1_conf > CONFIDENCE_THRESHOLD
                and margin > MARGIN_THRESHOLD
                and entropy_val < ENTROPY_THRESHOLD
            ):
                frame_status = "recognized"
            elif top1_conf > UNCERTAIN_THRESHOLD:
                frame_status = "uncertain"
            else:
                frame_status = "unknown"

            # 获取中文名称
            if top1_name_en in CLASS_NAMES_EN:
                idx = CLASS_NAMES_EN.index(top1_name_en)
                top1_name_zh = CLASS_NAMES_ZH[idx]
            else:
                top1_name_zh = top1_name_en

            # 记录预测历史
            prediction_history.append(top1_name_zh)
            confidence_history.append(top1_conf)

            # 平滑预测
            smoothed_name, smoothed_conf, smoothed_status = weighted_average_predict()

            # 稳定性判断
            if smoothed_name == last_stable_result:
                stable_counter += 1
            else:
                stable_counter = 0
                last_stable_result = smoothed_name

            # 达到稳定帧数才更新显示
            if stable_counter >= STABLE_FRAMES:
                current_name = smoothed_name
                current_conf = smoothed_conf
                current_status = smoothed_status
            else:
                current_name = last_stable_result if last_stable_result != "未知" else smoothed_name
                current_conf = smoothed_conf
                current_status = smoothed_status

    # 绘制界面
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 100), (0, 0, 0), -1)
    frame = cv2.addWeighted(overlay, 0.6, frame, 0.4, 0)

    # 根据识别状态显示不同内容
    if current_status == "recognized":
        # 识别成功
        color = (0, 255, 0)  # 绿色
        icon = "🌺"
        title_text = f"{icon} {current_name}"
        subtitle_text = f"置信度: {current_conf:.1%}"

    elif current_status == "uncertain":
        # 不确定
        color = (0, 255, 255)  # 黄色
        icon = "🤔"
        title_text = f"{icon} {current_name}？"
        subtitle_text = f"置信度较低: {current_conf:.1%}"

    else:
        # 未识别到花卉
        color = (0, 0, 255)  # 红色
        icon = "❓"
        if SHOW_UNKNOWN_PROMPT:
            title_text = f"{icon} {UNKNOWN_PROMPT_TEXT}"
        else:
            title_text = f"{icon} 无法识别"

        if current_conf > 0:
            subtitle_text = f"置信度: {current_conf:.1%} (低于{CONFIDENCE_THRESHOLD * 100:.0f}%阈值)"
        else:
            subtitle_text = "请将摄像头对准花卉"

    # 绘制文字
    frame = draw_chinese_text(frame, title_text, (20, 45), font_size=32, color=color)
    frame = draw_chinese_text(frame, subtitle_text, (20, 80), font_size=18, color=(200, 200, 200))

    # 显示识别范围提示
    range_text = f"可识别: {', '.join(CLASS_NAMES_ZH)}"
    frame = draw_chinese_text(frame, range_text, (20, h - 30), font_size=14, color=(255, 255, 255))

    # 显示状态指示器
    if current_status == "recognized":
        status_color = (0, 255, 0)
        status_text = "● 已识别"
    elif current_status == "uncertain":
        status_color = (0, 255, 255)
        status_text = "● 不确定"
    else:
        status_color = (0, 0, 255)
        status_text = "● 未识别"

    cv2.putText(frame, status_text, (w - 100, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 2)

    # FPS显示
    current_time = time.time()
    if current_time - last_time >= 1.0:
        fps = frame_count // PREDICT_INTERVAL if PREDICT_INTERVAL > 0 else 0
        frame_count = 0
        last_time = current_time

    cv2.putText(frame, f"FPS: {fps}", (w - 70, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

    # 操作提示
    cv2.putText(frame, "Q:退出  S:截图", (10, h - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

    cv2.imshow("Flower Recognition", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        print("正在退出...")
        break
    elif key == ord('s'):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        cv2.imwrite(f"screenshot_{timestamp}.jpg", frame)
        print(f"截图已保存: screenshot_{timestamp}.jpg")

cap.release()
cv2.destroyAllWindows()
print("程序已退出")