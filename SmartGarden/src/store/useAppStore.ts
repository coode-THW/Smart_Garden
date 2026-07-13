import {create} from 'zustand';

export type InferenceResult = {
  topClass: string;
  confidence: number;
  inferenceTimeMs: number;
  allClasses: Array<{name: string; probability: number}>;
};

export type UserState = {
  userId: string | null;
  nickname: string;
  isPhoneBound: boolean;
  isInitialized: boolean;
};

type AppState = {
  // ─── 推理状态 ───
  lastImageUri?: string;
  lastInferenceResult?: InferenceResult | null;
  setLastImageUri: (uri?: string) => void;
  setLastInferenceResult: (result: InferenceResult | null) => void;

  // ─── 用户状态 ───
  user: UserState;
  setUser: (user: Partial<UserState>) => void;
  resetUser: () => void;
};

const initialUserState: UserState = {
  userId: null,
  nickname: '花友',
  isPhoneBound: false,
  isInitialized: false,
};

export const useAppStore = create<AppState>()((set) => ({
  // ─── 推理 ───
  lastImageUri: undefined,
  lastInferenceResult: null,
  setLastImageUri: (uri?: string) => set({lastImageUri: uri}),
  setLastInferenceResult: (result: InferenceResult | null) =>
    set({lastInferenceResult: result}),

  // ─── 用户 ───
  user: initialUserState,
  setUser: (partial: Partial<UserState>) =>
    set((state: AppState) => ({
      user: {...state.user, ...partial},
    })),
  resetUser: () => set({user: initialUserState}),
}));
