// jpeg-js 模块的类型声明
declare module 'jpeg-js' {
  interface JpegDecodeOptions {
    useTArray?: boolean;
    colorTransform?: boolean;
    useWebAssembly?: boolean;
  }

  interface JpegDecodeResult {
    width: number;
    height: number;
    data: Uint8Array; // RGBA 像素，长度 = width * height * 4
  }

  export function decode(src: Buffer | Uint8Array, options?: JpegDecodeOptions): JpegDecodeResult;
}
