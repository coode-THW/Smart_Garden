// Node 内置模块的最小类型声明
//
// 为什么需要这个文件：项目没有装 @types/node，而 tsconfig 又显式限定了
// `"types": ["jest"]`，所以 `import * as fs from 'fs'` 这类会报
// 「Cannot find module 'fs'」。jest 运行时能解析它们，只有 tsc 不认。
//
// 为什么不用「装 @types/node」这个更常规的做法：
// 在 React Native 项目里引入 node 类型会带来一类经典冲突 ——
// setTimeout / setInterval 的返回值在 node 类型下是 NodeJS.Timeout、
// 在 RN 下是 number，一旦全局生效，项目里已有的相关代码会冒出一批新错误。
// 为了一个测试文件去动全项目的类型面，不划算。
//
// 所以这里只声明**本仓库实际用到的那几个函数**，范围可控。
// 以后若真的需要完整的 node 类型，再统一改成装 @types/node 并把 "node"
// 加进 tsconfig 的 types 数组（届时需要一并处理上面说的 setTimeout 冲突）。
//
// 遵循本项目既有惯例：src/types/jpeg-js.d.ts 也是这么给未类型化的模块补声明的。

/** CommonJS 注入的模块所在目录（jest 环境下可用） */
declare const __dirname: string;

declare module 'fs' {
  /** 不传编码时返回原始字节 */
  export function readFileSync(path: string): Uint8Array;
  /** 传了编码时返回字符串 */
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function statSync(path: string): {size: number};
}

declare module 'path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}

declare module 'crypto' {
  interface Hash {
    update(data: Uint8Array | string): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}
