/**
 * CameraViewfinder — 全屏相机取景器
 *
 * 覆层: 四角对焦框 + 圆形快门按钮 + 相册选择 + 取消按钮
 * 权限处理: 未授权 / 永久拒绝 / 无后置摄像头
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type PhotoFile,
} from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import logger from '../services/LoggerService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ━━━ 对焦框参数 ━━━
const FOCUS_SIZE = 250;
const CORNER_LEN = 28;
const CORNER_W = 2;

interface CameraViewfinderProps {
  isActive: boolean;
  onPhotoTaken: (localUri: string) => void;
  onAlbumPick: () => void;
  onCancel: () => void;
}

function CameraViewfinder({
  isActive,
  onPhotoTaken,
  onAlbumPick,
  onCancel,
}: CameraViewfinderProps): React.JSX.Element {
  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');

  // ━━━ 拍照 ━━━

  const handleSnap = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }
    setIsCapturing(true);
    try {
      const photo: PhotoFile = await cameraRef.current.takePhoto({
        flash: flashMode,
      });

      // 从临时路径复制到缓存目录，避免系统清理
      const fileName = `capture_${Date.now()}.jpg`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

      await RNFS.copyFile(photo.path, destPath);

      const fileUri =
        Platform.OS === 'android' ? `file://${destPath}` : destPath;

      // 先停用 Camera，等待 native 层停止推送帧数据
      // 防止组件卸载时 BufferQueue 和 ImageReader 被废弃导致的错误
      setDeactivating(true);

      // 等待 500ms 让 native camera 完全停止捕获会话并释放资源
      // ImageReader 需要足够时间完成缓冲区释放
      setTimeout(() => {
        onPhotoTaken(fileUri);
      }, 500);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logger.error('CameraViewfinder', '拍照失败:', msg);
      Alert.alert('拍照失败', msg || '请重试');
      setDeactivating(false);
    } finally {
      setIsCapturing(false);
    }
  }, [flashMode, onPhotoTaken]);

  // ━━━ 请求权限 ━━━

  const handleRequestPermission = useCallback(async () => {
    try {
      const granted = await requestPermission();
      if (!granted) {
        setPermissionError(
          Platform.OS === 'ios'
            ? '请在系统设置中开启相机权限'
            : '相机权限被拒绝',
        );
      }
    } catch (e: any) {
      setPermissionError(e?.message ?? '权限请求失败');
    }
  }, [requestPermission]);

  // ━━━ 权限未授予 ━━━

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>需要相机权限</Text>
        <Text style={styles.permissionHint}>请授予相机权限以拍摄花卉照片</Text>
        {permissionError ? (
          <>
            <Text style={styles.permissionError}>{permissionError}</Text>
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.settingsButtonText}>打开设置</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={styles.grantButton}
            onPress={handleRequestPermission}
          >
            <Text style={styles.grantButtonText}>授予权限</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.backButton} onPress={onCancel}>
          <Text style={styles.backButtonText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ━━━ 无后置摄像头 ━━━

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>未检测到后置摄像头</Text>
        <Text style={styles.permissionHint}>
          请使用带有后置摄像头的设备，或从相册选择照片
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={onCancel}>
          <Text style={styles.backButtonText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ━━━ 对焦框位置 ━━━

  const focusTop = (SCREEN_HEIGHT - FOCUS_SIZE) / 2;
  const focusLeft = (SCREEN_WIDTH - FOCUS_SIZE) / 2;

  // ━━━ 正常相机取景 ━━━

  return (
    <View style={styles.root}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive && !deactivating}
        photo={true}
        enableZoomGesture={true}
      />

      {/* ── 闪光灯切换 ── */}
      <TouchableOpacity
        style={styles.flashButton}
        onPress={() => setFlashMode(mode => (mode === 'off' ? 'on' : 'off'))}
      >
        <Text style={styles.flashText}>
          {flashMode === 'off' ? '⚡' : '💡'}
        </Text>
      </TouchableOpacity>

      {/* ── 四角对焦框 ── */}
      <View
        style={[
          styles.corner,
          styles.cornerTL,
          { top: focusTop, left: focusLeft },
        ]}
      />
      <View
        style={[
          styles.corner,
          styles.cornerTR,
          { top: focusTop, left: focusLeft + FOCUS_SIZE - CORNER_LEN },
        ]}
      />
      <View
        style={[
          styles.corner,
          styles.cornerBL,
          { top: focusTop + FOCUS_SIZE - CORNER_LEN, left: focusLeft },
        ]}
      />
      <View
        style={[
          styles.corner,
          styles.cornerBR,
          {
            top: focusTop + FOCUS_SIZE - CORNER_LEN,
            left: focusLeft + FOCUS_SIZE - CORNER_LEN,
          },
        ]}
      />

      {/* ── 取消按钮 ── */}
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelText}>✕ 取消</Text>
      </TouchableOpacity>

      {/* ── 底部操作区 ── */}
      <View style={styles.bottomBar}>
        {/* 快门按钮 */}
        <TouchableOpacity
          style={styles.snapOuter}
          onPress={handleSnap}
          disabled={isCapturing}
          activeOpacity={0.7}
        >
          <View style={styles.snapInner}>
            {isCapturing && <View style={styles.snapCapturingDot} />}
          </View>
        </TouchableOpacity>

        {/* 从相册选择 */}
        <TouchableOpacity style={styles.albumButton} onPress={onAlbumPick}>
          <Text style={styles.albumButtonText}>从相册选择</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ━━━ 样式 ━━━

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // ── 对焦框角括号 ──
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
  },
  cornerTL: {
    borderTopWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cornerTR: {
    borderTopWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cornerBL: {
    borderBottomWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cornerBR: {
    borderBottomWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderColor: 'rgba(255,255,255,0.85)',
  },

  // ── 闪光灯 ──
  flashButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashText: { fontSize: 20 },

  // ── 取消 ──
  cancelButton: {
    position: 'absolute',
    top: 48,
    left: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
  },
  cancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── 底部操作区 ──
  bottomBar: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // ── 快门按钮 ──
  snapOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapCapturingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e74c3c',
  },

  // ── 相册按钮 ──
  albumButton: {
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
  },
  albumButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── 权限页面 ──
  permissionContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionIcon: { fontSize: 64, marginBottom: 20 },
  permissionTitle: {
    color: '#e0e0e0',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  permissionHint: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  permissionError: {
    color: '#e74c3c',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  grantButton: {
    backgroundColor: '#4caf50',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  grantButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: '#4caf50',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 16,
  },
  settingsButtonText: {
    color: '#4caf50',
    fontSize: 17,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#999',
    fontSize: 15,
  },
});

export default CameraViewfinder;
