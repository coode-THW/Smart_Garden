# diagnose_model.py
import onnxruntime as ort
import numpy as np
from PIL import Image
from pathlib import Path

# 获取脚本所在目录，使用绝对路径避免受工作目录影响
SCRIPT_DIR = Path(__file__).resolve().parent

print("=" * 60)
print("ONNX 模型诊断")
print("=" * 60)

# 加载模型
model_path = SCRIPT_DIR / 'models/yolov11n-flower.onnx'
if not model_path.exists():
    print(f"❌ 模型文件不存在: {model_path}")
    exit(1)

session = ort.InferenceSession(str(model_path), providers=['CPUExecutionProvider'])
input_name = session.get_inputs()[0].name
input_shape = session.get_inputs()[0].shape
output_name = session.get_outputs()[0].name
output_shape = session.get_outputs()[0].shape

print(f"\n模型信息:")
print(f"  输入: {input_name} shape={input_shape}")
print(f"  输出: {output_name} shape={output_shape}")

# 测试 1：检查 softmax 是否存在
print("\n" + "=" * 60)
print("测试 1: 检查 softmax 是否存在")
print("=" * 60)

zero_input = np.zeros(input_shape, dtype=np.float32)
zero_output = session.run(None, {input_name: zero_input})[0]
print(f"\n全零输入输出:")
print(f"  值: {zero_output[0]}")
print(f"  总和: {zero_output[0].sum():.6f}")
print(f"  最小值: {zero_output[0].min():.6f}")
print(f"  最大值: {zero_output[0].max():.6f}")

one_input = np.ones(input_shape, dtype=np.float32)
one_output = session.run(None, {input_name: one_input})[0]
print(f"\n全一输入输出:")
print(f"  值: {one_output[0]}")
print(f"  总和: {one_output[0].sum():.6f}")
print(f"  最小值: {one_output[0].min():.6f}")
print(f"  最大值: {one_output[0].max():.6f}")

# 判断
if abs(zero_output[0].sum() - 1.0) < 0.01 and abs(one_output[0].sum() - 1.0) < 0.01:
    print("\n✅ softmax 存在（输出总和为 1.0）")
    has_softmax = True
else:
    print("\n❌ softmax 不存在！输出是 logits！")
    print("   需要在手机端手动添加 softmax")
    has_softmax = False

# 测试 2：用训练时一致的预处理测试真实图片
print("\n" + "=" * 60)
print("测试 2: 用正确预处理识别图片")
print("=" * 60)

CLASS_NAMES = ['雏菊', '蒲公英', '非洲菊', '绣球花', '百合', '荷花', '玫瑰', '向日葵', '郁金香']

def preprocess_correct(img_path):
    """与 ultralytics 训练完全一致: Resize短边→224 + CenterCrop→224×224"""
    img = Image.open(img_path).convert('RGB')
    w, h = img.size
    # Resize 短边到 224（保持宽高比）
    if w < h:
        new_w, new_h = 224, int(224 * h / w)
    else:
        new_w, new_h = int(224 * w / h), 224
    img = img.resize((new_w, new_h), Image.BILINEAR)
    # CenterCrop 到 224×224
    left = (new_w - 224) // 2
    top = (new_h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))
    # 转 tensor: HWC → CHW, /255 归一化
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)  # HWC → CHW
    return np.expand_dims(arr, 0)

# 查找测试图片
test_dir = SCRIPT_DIR
for ext in ['*.jpg', '*.jpeg', '*.png']:
    test_files = list(test_dir.glob(ext))
    if test_files:
        break

if test_files:
    for img_path in test_files[:5]:  # 最多测5张
        print(f"\n📷 {img_path.name}:")
        inp = preprocess_correct(str(img_path))
        out = session.run(None, {input_name: inp})[0][0]
        probs = out if has_softmax else (np.exp(out - out.max()) / np.exp(out - out.max()).sum())
        top5 = np.argsort(probs)[-5:][::-1]
        for idx in top5:
            bar = '█' * int(probs[idx] * 40)
            print(f"  {CLASS_NAMES[idx]:6s}: {probs[idx]*100:5.1f}% {bar}")
else:
    print("\n⚠️ 未找到测试图片，请放置一些 .jpg 图片到项目根目录")

# 测试 3：检查手机端的 ONNX 是否与 PC 上一致
print("\n" + "=" * 60)
print("测试 3: 检查 assets 中的 ONNX 文件")
print("=" * 60)

assets_onnx = SCRIPT_DIR / 'SmartGarden/android/app/src/main/assets/yolov11n-flower.onnx'
if assets_onnx.exists():
    pc_size = model_path.stat().st_size
    asset_size = assets_onnx.stat().st_size
    print(f"  PC 模型: {pc_size:,} bytes")
    print(f"  手机 assets: {asset_size:,} bytes")
    if pc_size == asset_size:
        print("  ✅ 文件大小一致")
    else:
        print(f"  ❌ 文件大小不一致！差 {abs(pc_size - asset_size):,} bytes")
        print("     需要重新复制 ONNX 文件到 assets")
else:
    print(f"  ⚠️ assets 中未找到模型: {assets_onnx}")

print("\n✅ 诊断完成")