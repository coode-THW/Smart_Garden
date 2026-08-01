/**
 * useRecognition — 识别流程 Hook
 *
 * 从 RecognizeScreen 抽取：拍照/选图 → 推理 → 结果
 */

import {useCallback, useState} from 'react';
import {launchImageLibrary} from 'react-native-image-picker';
import RecognitionOrchestrator from '../services/RecognitionOrchestrator';
import {getErrorInfo, getErrorInfoFromError} from '../services/ErrorHandler';
import {ErrorCode} from '../types';
import type {RecognitionResult} from '../services/RecognitionOrchestrator';

export type RecognitionPhase = 'idle' | 'camera' | 'inferring' | 'result' | 'error';

export interface RecognitionState {
  phase: RecognitionPhase;
  imageUri?: string;
  result?: RecognitionResult;
  message?: string;
}

export function useRecognition() {
  const [state, setState] = useState<RecognitionState>({phase: 'idle'});

  const handleEnterCamera = useCallback(() => {
    setState({phase: 'camera'});
  }, []);

  const handleCameraCancel = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

  const handleCameraPhoto = useCallback((localUri: string) => {
    async function run() {
      try {
        setState({phase: 'inferring', imageUri: localUri});
        const result = await RecognitionOrchestrator.getInstance().recognize(localUri);
        setState({phase: 'result', imageUri: localUri, result});
      } catch (e: any) {
        const info = getErrorInfoFromError(e);
        setState({phase: 'error', message: info.fullMessage});
      }
    }
    run();
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const pickResult = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
      });
      if (pickResult.didCancel) return;

      const asset = pickResult.assets?.[0];
      if (!asset?.uri) {
        const info = getErrorInfo(ErrorCode.INVALID_PARAM);
        throw new Error(info.description);
      }

      setState({phase: 'inferring', imageUri: asset.uri});
      const inferenceResult = await RecognitionOrchestrator.getInstance().recognize(asset.uri);
      setState({phase: 'result', imageUri: asset.uri, result: inferenceResult});
    } catch (e: any) {
      const info = getErrorInfoFromError(e);
      setState({phase: 'error', message: info.fullMessage});
    }
  }, []);

  const handleReset = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

  const handleRetry = useCallback(() => {
    setState({phase: 'idle'});
  }, []);

  return {
    state,
    handleEnterCamera,
    handleCameraCancel,
    handleCameraPhoto,
    handlePickImage,
    handleReset,
    handleRetry,
  } as const;
}
