/**
 * useAppStore 状态管理测试
 * 验证全局状态的设置和获取
 */

import {useAppStore} from './useAppStore';

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      lastImageUri: undefined,
      lastInferenceResult: null,
      user: {
        userId: null,
        nickname: '花友',
        isPhoneBound: false,
        isInitialized: false,
      },
    });
  });

  describe('初始状态', () => {
    it('初始时 lastImageUri 应为 undefined', () => {
      const state = useAppStore.getState();
      expect(state.lastImageUri).toBeUndefined();
    });

    it('初始时 lastInferenceResult 应为 null', () => {
      const state = useAppStore.getState();
      expect(state.lastInferenceResult).toBeNull();
    });

    it('初始时 user 应有默认值', () => {
      const state = useAppStore.getState();
      expect(state.user.userId).toBeNull();
      expect(state.user.nickname).toBe('花友');
      expect(state.user.isPhoneBound).toBe(false);
      expect(state.user.isInitialized).toBe(false);
    });
  });

  describe('状态更新', () => {
    it('应能设置 lastImageUri', () => {
      const testUri = 'file:///test/image.jpg';
      useAppStore.getState().setLastImageUri(testUri);
      const state = useAppStore.getState();
      expect(state.lastImageUri).toBe(testUri);
    });

    it('应能清除 lastImageUri', () => {
      useAppStore.getState().setLastImageUri('file:///test/image.jpg');
      useAppStore.getState().setLastImageUri(undefined);
      const state = useAppStore.getState();
      expect(state.lastImageUri).toBeUndefined();
    });

    it('应能设置推理结果', () => {
      const testResult = {
        topClass: '玫瑰',
        confidence: 0.90,
        inferenceTimeMs: 100,
        allClasses: [{name: '玫瑰', probability: 0.9}, {name: '百合', probability: 0.1}],
      };
      useAppStore.getState().setLastInferenceResult(testResult);
      const state = useAppStore.getState();
      expect(state.lastInferenceResult).toEqual(testResult);
    });

    it('应能清除推理结果', () => {
      useAppStore.getState().setLastInferenceResult({
        topClass: '玫瑰',
        confidence: 0.90,
        inferenceTimeMs: 100,
        allClasses: [{name: '玫瑰', probability: 0.9}],
      });
      useAppStore.getState().setLastInferenceResult(null);
      const state = useAppStore.getState();
      expect(state.lastInferenceResult).toBeNull();
    });

    it('应能更新用户信息', () => {
      useAppStore.getState().setUser({
        userId: 'test-user-id',
        nickname: '测试用户',
        isPhoneBound: true,
        isInitialized: true,
      });
      const state = useAppStore.getState();
      expect(state.user.userId).toBe('test-user-id');
      expect(state.user.nickname).toBe('测试用户');
      expect(state.user.isPhoneBound).toBe(true);
      expect(state.user.isInitialized).toBe(true);
    });

    it('应能重置用户信息', () => {
      useAppStore.getState().setUser({userId: 'test-user-id'});
      useAppStore.getState().resetUser();
      const state = useAppStore.getState();
      expect(state.user.userId).toBeNull();
      expect(state.user.nickname).toBe('花友');
      expect(state.user.isPhoneBound).toBe(false);
      expect(state.user.isInitialized).toBe(false);
    });
  });
});