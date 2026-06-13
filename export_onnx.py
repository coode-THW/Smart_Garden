"""
将训练好的 YOLOv11 花卉分类模型导出为 ONNX 格式，
并验证导出的模型能正常推理。
"""
from pathlib import Path
from ultralytics import YOLO
import onnxruntime as ort
import numpy as np

# ━━━━━ 配置 ━━━━━
MODEL_PATH = Path("runs/classify/runs/classify/flower_yolo11n/weights/best.pt")
OUTPUT_ONNX = Path("models/yolov11n-flower.onnx")
OUTPUT_ONNX.parent.mkdir(exist_ok=True)

# ━━━━━ Step 1：加载训练好的模型 ━━━━━
print(f"[1/4] 加载模型: {MODEL_PATH}")
model = YOLO(str(MODEL_PATH))

# 看看模型的基本信息
print(f"  模型类型: {model.task}")        # classify
print(f"  类别数: {model.model.yaml.get('nc', '?')}")
print(f"  输入尺寸: {getattr(model.model, 'imgsz', '?')}")

# ━━━━━ Step 2：导出 ONNX ━━━━━
print(f"\n[2/4] 导出 ONNX → {OUTPUT_ONNX}")
# opset 14 兼容性好，simplify 去掉冗余算子
export_path = model.export(
    format="onnx",
    opset=14,
    simplify=True,
    imgsz=224,          # 分类模型用 224×224 就够了
)

# ultralytics 导出的默认文件名，移动到我们想要的位置
export_path = Path(export_path)
if export_path != OUTPUT_ONNX:
    import shutil
    shutil.move(str(export_path), str(OUTPUT_ONNX))
    print(f"  已移动到: {OUTPUT_ONNX}")

onnx_size = OUTPUT_ONNX.stat().st_size
print(f"  ONNX 文件大小: {onnx_size/1024/1024:.1f} MB")

# ━━━━━ Step 3：桌面端验证推理 ━━━━━
print(f"\n[3/4] 桌面端验证推理...")
session = ort.InferenceSession(
    str(OUTPUT_ONNX),
    providers=['CPUExecutionProvider'],
)

# 打印输入输出信息
print("  输入:")
for inp in session.get_inputs():
    print(f"    {inp.name}: shape={inp.shape}, type={inp.type}")

print("  输出:")
for out in session.get_outputs():
    print(f"    {out.name}: shape={out.shape}, type={out.type}")

# 用一张假图跑一次推理
input_name = session.get_inputs()[0].name
input_shape = session.get_inputs()[0].shape  # e.g. [1, 3, 224, 224]
dummy = np.random.randn(*input_shape).astype(np.float32)

outputs = session.run(None, {input_name: dummy})

print(f"\n  推理完成!")
print(f"  输出数量: {len(outputs)}")
for i, o in enumerate(outputs):
    print(f"  输出[{i}] shape: {o.shape}, dtype: {o.dtype}")
    print(f"  输出[{i}] 前5个值: {o.flatten()[:5]}")

# ━━━━━ Step 4：用真实图片验证（如果有的话） ━━━━━
print(f"\n[4/4] 对比 PyTorch vs ONNX 结果...")

# 用一张随机图片，对比 PyTorch 和 ONNX 的输出是否一致
test_input = np.random.randn(1, 3, 224, 224).astype(np.float32)

# PyTorch 推理
import torch
model.model.eval()
with torch.no_grad():
    pt_output = model.model(torch.from_numpy(test_input))
    if isinstance(pt_output, (tuple, list)):
        pt_output = pt_output[0]
    pt_probs = torch.softmax(pt_output, dim=1).numpy()[0]

# ONNX 推理
ort_outputs = session.run(None, {input_name: test_input})
ort_probs = ort_outputs[0][0]  # [1, num_classes] → [num_classes]

# 对比
diff = np.abs(pt_probs - ort_probs).max()
print(f"  PyTorch Top-3:  {np.argsort(pt_probs)[-3:][::-1]} → {np.sort(pt_probs)[-3:][::-1]}")
print(f"  ONNX    Top-3:  {np.argsort(ort_probs)[-3:][::-1]} → {np.sort(ort_probs)[-3:][::-1]}")
print(f"  最大误差: {diff:.8f}")

if diff < 0.001:
    print(f"  ✅ PyTorch 与 ONNX 输出一致（误差 < 0.001）")
elif diff < 0.01:
    print(f"  ⚠️ 有微小偏差（< 0.01），FP32→FP32 不应该这么大，检查一下")
else:
    print(f"  ❌ 偏差过大（{diff:.4f}），输出不一致！")

print(f"\n{'='*50}")
print(f"✅ 导出完成！ONNX 文件: {OUTPUT_ONNX.resolve()}")
print(f"   下一步：把这个文件复制到 React Native 项目的 assets/ 目录")
print(f"   然后运行 App.tsx 里的 testYolo() 验证手机端加载")
