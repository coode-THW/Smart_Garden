/**
 * 花卉实时视频识别 — 前端逻辑（高帧率优化版）
 * ==============================================
 * 优化策略：
 *   - 帧缩放到 224x224 再发送，匹配模型输入尺寸，减少传输量
 *   - 非阻塞发送：上一帧未返回时不发新帧，避免请求堆积
 *   - 降低 JPEG 质量以减少网络传输
 *   - 缩短平滑窗口以加快响应
 *
 * 参考：video_predict.py 的预测平滑逻辑
 */

// ============================================================
//  配置常量
// ============================================================
const CONFIDENCE_THRESHOLD = 0.55;   // top1 最低置信度
const UNCERTAIN_THRESHOLD = 0.35;    // 不确定状态最低置信度
const MARGIN_THRESHOLD = 0.30;       // top1 - top2 最低差距
const ENTROPY_THRESHOLD = 1.2;       // 熵值上限（超过则分布太均匀）
const HISTORY_LEN = 8;
const STABLE_FRAMES = 2;
const PREDICT_INTERVAL_MS = 200;   // 发送间隔
const SEND_WIDTH = 224;            // 发送帧宽度（匹配模型 img_size）
const SEND_HEIGHT = 224;           // 发送帧高度
const JPEG_QUALITY = 0.5;          // JPEG 压缩质量

// 花卉 emoji 映射
const EMOJI_MAP = {
    '雏菊': '🌼', '蒲公英': '🌾', '玫瑰': '🌹',
    '向日葵': '🌻', '郁金香': '🌷'
};

// ============================================================
//  状态
// ============================================================
let mediaStream = null;
let predictTimer = null;
let fpsTimer = null;
let isRunning = false;
let requestInFlight = false;       // 是否有请求正在进行中

let predictionHistory = [];        // [{name, confidence}, ...]
let stableCounter = 0;
let lastStableResult = '';
let lastStableConf = 0;
let lastStableStatus = 'unknown';

let currentName = '未识别';
let currentConf = 0;
let currentStatus = 'unknown';
let currentFps = 0;

let frameCount = 0;
let fpsLastTime = performance.now();

// ============================================================
//  DOM 引用（由 video.html 设置）
// ============================================================
let videoEl, canvasEl, ctx;
let overlayNameEl, overlayConfEl, overlayStatusEl, overlayFpsEl;
let statusIndicatorEl, statusTextEl, currentFlowerEl;
let btnStart, btnStop;
let predictionHistoryEl;

// ============================================================
//  初始化
// ============================================================
function initVideo(config) {
    videoEl = config.videoEl;
    canvasEl = config.canvasEl;
    ctx = canvasEl.getContext('2d');

    overlayNameEl = config.overlayNameEl;
    overlayConfEl = config.overlayConfEl;
    overlayStatusEl = config.overlayStatusEl;
    overlayFpsEl = config.overlayFpsEl;
    statusIndicatorEl = config.statusIndicatorEl;
    statusTextEl = config.statusTextEl;
    currentFlowerEl = config.currentFlowerEl;
    btnStart = config.btnStart;
    btnStop = config.btnStop;
    predictionHistoryEl = config.predictionHistoryEl;
}

// ============================================================
//  启动摄像头
// ============================================================
async function startWebcam() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'environment',
            },
            audio: false,
        });

        videoEl.srcObject = mediaStream;
        await videoEl.play();

        // 等视频准备好后设置 canvas 尺寸
        videoEl.addEventListener('loadedmetadata', () => {
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
        });

        isRunning = true;
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');

        // 开始预测循环
        predictionHistory = [];
        stableCounter = 0;
        lastStableResult = '';
        lastStableConf = 0;
        lastStableStatus = 'unknown';
        currentName = '未识别';
        currentConf = 0;
        currentStatus = 'unknown';
        frameCount = 0;
        fpsLastTime = performance.now();
        requestInFlight = false;

        predictTimer = setInterval(captureAndPredict, PREDICT_INTERVAL_MS);
        fpsTimer = setInterval(updateFps, 1000);

        // 绘制循环
        requestAnimationFrame(drawLoop);

        updateStatusUI('unknown');
        addHistoryItem('摄像头已启动', null);

    } catch (err) {
        console.error('摄像头启动失败:', err);
        let msg = '无法访问摄像头';
        if (err.name === 'NotAllowedError') {
            msg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
        } else if (err.name === 'NotFoundError') {
            msg = '未检测到摄像头设备';
        }
        alert('⚠️ ' + msg);
    }
}

// ============================================================
//  停止摄像头
// ============================================================
function stopWebcam() {
    isRunning = false;

    if (predictTimer) {
        clearInterval(predictTimer);
        predictTimer = null;
    }
    if (fpsTimer) {
        clearInterval(fpsTimer);
        fpsTimer = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }

    videoEl.srcObject = null;

    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');

    // 清除画布
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    updateOverlay('摄像头已停止', null, 'unknown');
    updateStatusUI('unknown');
    addHistoryItem('摄像头已停止', null);
}

// ============================================================
//  帧捕获 & 预测（非阻塞 + 缩略图优化）
// ============================================================
async function captureAndPredict() {
    if (!isRunning || !mediaStream) return;

    // 如果上一帧还在处理中，跳过本帧，避免堆积
    if (requestInFlight) return;

    requestInFlight = true;

    try {
        // Step 1：从 video 截帧并缩放到 224x224（匹配模型输入尺寸，大幅减少传输量）
        const offCanvas = new OffscreenCanvas(SEND_WIDTH, SEND_HEIGHT);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(videoEl, 0, 0, SEND_WIDTH, SEND_HEIGHT);

        // Step 2：导出为低质量 JPEG blob
        const blob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
        if (!blob) {
            requestInFlight = false;
            return;
        }

        // Step 3：发送到后端
        const res = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
        });

        const data = await res.json();
        if (!data.success) {
            requestInFlight = false;
            return;
        }

        const top1 = data.top1;
        const nameZh = top1.name_zh;
        const conf = top1.confidence;
        const margin = data.margin || 0;
        const entropy = data.entropy || 999;

        // 综合判定状态：置信度 + 边距 + 熵
        let frameStatus;
        if (
            conf > CONFIDENCE_THRESHOLD &&
            margin > MARGIN_THRESHOLD &&
            entropy < ENTROPY_THRESHOLD
        ) {
            frameStatus = 'recognized';
        } else if (conf > UNCERTAIN_THRESHOLD) {
            frameStatus = 'uncertain';
        } else {
            frameStatus = 'unknown';
        }

        // 添加到历史（附带状态 + margin + entropy）
        predictionHistory.push({
            name: nameZh,
            confidence: conf,
            status: frameStatus,
            margin: margin,
            entropy: entropy,
        });
        if (predictionHistory.length > HISTORY_LEN) {
            predictionHistory.shift();
        }

        // 加权平均平滑
        const smoothed = weightedAveragePredict(predictionHistory);
        if (smoothed) {
            // 稳定性判定
            if (smoothed.name === lastStableResult) {
                stableCounter++;
            } else {
                stableCounter = 0;
                lastStableResult = smoothed.name;
                lastStableConf = smoothed.confidence;
                lastStableStatus = smoothed.status;
            }

            // 达到稳定帧数才更新显示
            if (stableCounter >= STABLE_FRAMES) {
                currentName = smoothed.name;
                currentConf = smoothed.confidence;
                currentStatus = smoothed.status;
            } else {
                currentName = lastStableResult !== '未知' ? lastStableResult : smoothed.name;
                currentConf = smoothed.confidence;
                currentStatus = smoothed.status;
            }
        }

        frameCount++;

    } catch (err) {
        console.error('预测请求失败:', err);
    } finally {
        requestInFlight = false;
    }
}

// ============================================================
//  加权平均平滑（综合置信度 + 边距 + 熵 + 历史状态）
// ============================================================
function weightedAveragePredict(history) {
    if (!history || history.length === 0) {
        return { name: '未知', confidence: 0, status: 'unknown' };
    }

    // 统计最近 N 帧中每种状态的数量
    const statusCounts = { recognized: 0, uncertain: 0, unknown: 0 };
    for (const h of history) {
        if (h.status) statusCounts[h.status]++;
    }

    const scores = {};
    const weights = [];
    for (let i = 0; i < history.length; i++) {
        // 线性权重：0.5 ~ 1.0
        weights.push(0.5 + (0.5 * i / (history.length - 1 || 1)));
    }

    for (let i = 0; i < history.length; i++) {
        const { name, confidence } = history[i];
        const weight = weights[i] * confidence;
        scores[name] = (scores[name] || 0) + weight;
    }

    // 找最高分
    let bestName = '未知';
    let bestScore = 0;
    for (const [name, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestName = name;
        }
    }

    const weightSum = weights.reduce((a, b) => a + b, 0);
    const bestConf = weightSum > 0 ? bestScore / weightSum : 0;

    // 综合判定：加权置信度 + 历史帧状态投票
    // 如果最近多数帧都标记为 unknown，即使 top1 置信度稍高也不信
    const majorityStatus = statusCounts.unknown >= statusCounts.recognized + statusCounts.uncertain
        ? 'unknown'
        : (statusCounts.recognized >= statusCounts.uncertain ? 'recognized' : 'uncertain');

    let status;
    if (bestConf > CONFIDENCE_THRESHOLD && majorityStatus === 'recognized') {
        status = 'recognized';
    } else if (bestConf > UNCERTAIN_THRESHOLD) {
        status = 'uncertain';
    } else {
        status = 'unknown';
    }

    return { name: bestName, confidence: bestConf, status };
}

// ============================================================
//  绘制循环
// ============================================================
function drawLoop() {
    if (!isRunning) {
        requestAnimationFrame(drawLoop); // 继续循环等待
        return;
    }

    updateOverlay(currentName, currentConf, currentStatus);
    updateStatusUI(currentStatus);

    if (currentStatus !== lastStableStatus || currentName !== lastStableResult) {
        if (currentStatus === 'recognized' || currentStatus === 'uncertain') {
            if (currentName !== '未知') {
                addHistoryItem(currentName, currentConf);
            }
        }
    }
    lastStableStatus = currentStatus;
    lastStableResult = currentName;

    requestAnimationFrame(drawLoop);
}

// ============================================================
//  覆盖层文字更新
// ============================================================
function updateOverlay(name, conf, status) {
    if (!overlayNameEl) return;

    const emoji = EMOJI_MAP[name] || '🌸';

    if (status === 'recognized') {
        overlayNameEl.textContent = `${emoji} ${name}`;
        overlayNameEl.style.color = '#fff';
        overlayConfEl.textContent = conf ? `置信度: ${(conf * 100).toFixed(1)}%` : '';
        overlayStatusEl.className = 'overlay-status recognized';
    } else if (status === 'uncertain') {
        overlayNameEl.textContent = `🤔 ${name}？`;
        overlayNameEl.style.color = '#f1c40f';
        overlayConfEl.textContent = conf ? `置信度较低: ${(conf * 100).toFixed(1)}%` : '';
        overlayStatusEl.className = 'overlay-status uncertain';
    } else {
        overlayNameEl.textContent = '❓ 未识别到花卉';
        overlayNameEl.style.color = '#e74c3c';
        overlayConfEl.textContent = conf && conf > 0
            ? `当前置信度: ${(conf * 100).toFixed(1)}% (低于 ${CONFIDENCE_THRESHOLD * 100}% 阈值)`
            : '请将摄像头对准花卉';
        overlayStatusEl.className = 'overlay-status unknown';
    }
}

// ============================================================
//  状态指示器
// ============================================================
function updateStatusUI(status) {
    if (!statusIndicatorEl) return;

    statusIndicatorEl.className = 'status-indicator ' + status;

    if (status === 'recognized') {
        statusIndicatorEl.innerHTML = '<span class="status-dot green"></span> 已识别';
        if (currentFlowerEl) currentFlowerEl.textContent = currentName !== '未知' ? currentName : '—';
    } else if (status === 'uncertain') {
        statusIndicatorEl.innerHTML = '<span class="status-dot yellow"></span> 不确定';
        if (currentFlowerEl) currentFlowerEl.textContent = currentName !== '未知' ? currentName + '?' : '—';
    } else {
        statusIndicatorEl.innerHTML = '<span class="status-dot red"></span> 未识别';
        if (currentFlowerEl) currentFlowerEl.textContent = '—';
    }
}

// ============================================================
//  FPS 更新
// ============================================================
function updateFps() {
    const now = performance.now();
    const elapsed = (now - fpsLastTime) / 1000;
    currentFps = Math.round(frameCount / elapsed);
    frameCount = 0;
    fpsLastTime = now;

    if (overlayFpsEl) {
        overlayFpsEl.textContent = `FPS: ${currentFps}`;
    }

    if (currentFlowerEl) {
        const confStr = currentConf > 0 ? (currentConf * 100).toFixed(1) + '%' : '—';
        document.getElementById('sidebarConfidence')?.textContent?.(confStr);
    }

    // 更新 margin 和 entropy 显示（取最近一帧的值）
    const lastFrame = predictionHistory.length > 0 ? predictionHistory[predictionHistory.length - 1] : null;
    if (lastFrame) {
        const marginEl = document.getElementById('sidebarMargin');
        const entropyEl = document.getElementById('sidebarEntropy');
        if (marginEl && lastFrame.margin !== undefined) {
            marginEl.textContent = (lastFrame.margin * 100).toFixed(1) + '%';
            marginEl.style.color = lastFrame.margin > MARGIN_THRESHOLD ? 'var(--green)' : 'var(--red)';
        }
        if (entropyEl && lastFrame.entropy !== undefined) {
            entropyEl.textContent = lastFrame.entropy.toFixed(2);
            entropyEl.style.color = lastFrame.entropy < ENTROPY_THRESHOLD ? 'var(--green)' : 'var(--red)';
        }
    }
}

// ============================================================
//  预测历史
// ============================================================
function addHistoryItem(name, conf) {
    if (!predictionHistoryEl) return;

    const item = document.createElement('li');
    item.className = 'history-item';

    const emoji = EMOJI_MAP[name] || '📷';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'history-name';
    nameSpan.textContent = `${emoji} ${name}`;

    const confSpan = document.createElement('span');
    confSpan.className = 'history-conf';
    confSpan.textContent = conf ? (conf * 100).toFixed(1) + '%' : '—';

    item.appendChild(nameSpan);
    item.appendChild(confSpan);

    predictionHistoryEl.insertBefore(item, predictionHistoryEl.firstChild);

    // 最多保留 20 条
    while (predictionHistoryEl.children.length > 20) {
        predictionHistoryEl.removeChild(predictionHistoryEl.lastChild);
    }
}
