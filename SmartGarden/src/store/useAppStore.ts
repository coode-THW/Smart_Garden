import create from 'zustand';

export type InferenceResult = {
  topClass: string;
  confidence: number;
  inferenceTimeMs: number;
  allClasses: Array<{name: string; probability: number}>;
};

type AppState = {
  lastImageUri?: string;
  lastInferenceResult?: InferenceResult | null;
  setLastImageUri: (uri?: string) => void;
  setLastInferenceResult: (result: InferenceResult | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  lastImageUri: undefined,
  lastInferenceResult: null,
  setLastImageUri: (uri) => set({lastImageUri: uri}),
  setLastInferenceResult: (result) => set({lastInferenceResult: result}),
}));
