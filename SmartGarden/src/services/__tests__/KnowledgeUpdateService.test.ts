/**
 * KnowledgeUpdateService 单元测试 — Day51-52
 * =========================================
 * 这个服务跑在**启动流程**上，所以最重要的一条是：**它永远不能抛异常、不能阻塞启动**。
 * 网络断了、Nginx 挂了、version.json 被写坏了、请求打到错误页返回 HTML ——
 * 全部只能降级为「本次不更新」，不能影响 APP 起来。
 *
 * 另外：@env 的变量被 react-native-dotenv 在编译期内联成字面量，
 * jest.mock('@env') 无效，所以远端地址与随包版本都走构造函数注入。
 */

import {KnowledgeUpdateService} from '../KnowledgeUpdateService';

// ━━━━━ 测试替身 ━━━━━

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/doc',
  CachesDirectoryPath: '/cache',
  exists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

const mockKnowledgeService = {applyOverride: jest.fn()};
jest.mock('../KnowledgeService', () => ({
  KnowledgeService: {
    getInstance: () => mockKnowledgeService,
  },
}));

const RNFS = require('react-native-fs');
const NetInfo = require('@react-native-community/netinfo');

const REMOTE_URL = 'https://example.test/care/version.json';

/** 造一份远端清单响应 */
function manifestResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const REMOTE_MANIFEST = {
  version: '2026.10.01',
  releaseDate: '2026-10-01',
  files: {
    '玫瑰.json': {url: 'https://cdn/rose.json', checksum: 'rose-v2'},
    '牡丹.json': {url: 'https://cdn/peony.json', checksum: 'peony-v2'},
  },
};

// ━━━━━ 测试 ━━━━━

describe('KnowledgeUpdateService', () => {
  let service: KnowledgeUpdateService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;

    // 默认：在线
    NetInfo.fetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
    // 默认：没有落盘版本
    RNFS.exists.mockResolvedValue(false);

    service = new KnowledgeUpdateService({
      remoteUrl: REMOTE_URL,
      bundledVersion: '2026.09.01',
    });
  });

  // ───────────────────────────────────────────
  // 降级路径：不联网 / 未配置
  // ───────────────────────────────────────────

  describe('降级：跳过检查', () => {
    it('未配置远端地址时跳过，且不发请求', async () => {
      const noUrl = new KnowledgeUpdateService({remoteUrl: '', bundledVersion: '1.0.0'});

      const result = await noUrl.checkForUpdate();

      expect(result.state).toBe('skipped');
      expect(result.updateAvailable).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('离线时跳过，且不发请求', async () => {
      NetInfo.fetch.mockResolvedValue({isConnected: false, isInternetReachable: false});

      const result = await service.checkForUpdate();

      expect(result.state).toBe('skipped');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('isConnected 为 true 但 isInternetReachable 为 false 也算离线', async () => {
      NetInfo.fetch.mockResolvedValue({isConnected: true, isInternetReachable: false});

      expect((await service.checkForUpdate()).state).toBe('skipped');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('跳过后本地版本仍可读出', async () => {
      NetInfo.fetch.mockResolvedValue({isConnected: false});

      expect((await service.checkForUpdate()).localVersion).toBe('2026.09.01');
    });
  });

  // ───────────────────────────────────────────
  // 正常路径
  // ───────────────────────────────────────────

  describe('检查到新版本', () => {
    it('远端更新时应报出可用更新与变更文件', async () => {
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('ready');
      expect(result.updateAvailable).toBe(true);
      expect(result.remoteVersion).toBe('2026.10.01');
      expect(result.localVersion).toBe('2026.09.01');
      expect(Object.keys(result.changedFiles).sort()).toEqual(
        ['玫瑰.json', '牡丹.json'].sort(),
      );
    });

    it('已落盘版本优先于随包版本', async () => {
      // 之前下载应用过 2026.09.15，且玫瑰.json 已经是 rose-v2
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({
          version: '2026.09.15',
          appliedAt: '2026-09-15T00:00:00.000Z',
          files: {'玫瑰.json': {checksum: 'rose-v2'}},
        }),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.localVersion).toBe('2026.09.15');
      // 玫瑰.json 的 checksum 已一致 → 只剩牡丹.json 需要下
      expect(Object.keys(result.changedFiles)).toEqual(['牡丹.json']);
    });

    it('远端版本不比本地新时不报更新', async () => {
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({version: '2026.10.01', appliedAt: 'x', files: {}}),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('ready');
      expect(result.updateAvailable).toBe(false);
      expect(result.changedFiles).toEqual({});
    });

    it('远端版本更旧时也不报更新（回滚保护）', async () => {
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({version: '2026.11.01', appliedAt: 'x', files: {}}),
      );
      fetchMock.mockReturnValue(
        manifestResponse({...REMOTE_MANIFEST, version: '2026.01.01'}),
      );

      expect((await service.checkForUpdate()).updateAvailable).toBe(false);
    });

    it('hasUpdate 用版本比较，不依赖文件是否变更', async () => {
      // 版本号前进了，但所有文件 checksum 都一致 → 仍算「有新版本」
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({
          version: '2026.09.01',
          appliedAt: 'x',
          files: {
            '玫瑰.json': {checksum: 'rose-v2'},
            '牡丹.json': {checksum: 'peony-v2'},
          },
        }),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.updateAvailable).toBe(true);
      expect(result.changedFiles).toEqual({});
    });
  });

  // ───────────────────────────────────────────
  // 失败路径：一律降级，绝不抛
  // ───────────────────────────────────────────

  describe('失败一律降级，绝不抛出', () => {
    it('fetch 抛异常（断网）时返回 error 而不是 reject', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('error');
      expect(result.updateAvailable).toBe(false);
      expect(result.errorMessage).toContain('network down');
    });

    it('HTTP 500 时返回 error', async () => {
      fetchMock.mockReturnValue(manifestResponse({}, false, 500));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('error');
      expect(result.errorMessage).toContain('500');
    });

    it('响应不是合法 JSON（例如错误页返回 HTML）时返回 error', async () => {
      fetchMock.mockReturnValue(
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Unexpected token <')),
        }),
      );

      const result = await service.checkForUpdate();

      expect(result.state).toBe('error');
    });

    it('JSON 合法但清单结构非法时返回 error', async () => {
      fetchMock.mockReturnValue(manifestResponse({not: 'a manifest'}));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('error');
      expect(result.updateAvailable).toBe(false);
    });

    it('NetInfo 自身抛异常时也降级而不是崩', async () => {
      NetInfo.fetch.mockRejectedValue(new Error('netinfo broken'));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('error');
    });

    it('落盘版本文件损坏时退回随包版本，仍能正常检查', async () => {
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue('{ 这不是 JSON');
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.state).toBe('ready');
      expect(result.localVersion).toBe('2026.09.01');
    });

    it('读落盘版本失败时也退回随包版本', async () => {
      RNFS.exists.mockRejectedValue(new Error('fs broken'));
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(result.localVersion).toBe('2026.09.01');
    });

    it('任何失败路径下 checkForUpdate 都不会 reject', async () => {
      const breakages: Array<() => void> = [
        () => fetchMock.mockRejectedValue(new Error('x')),
        () => fetchMock.mockReturnValue(Promise.reject(new Error('y'))),
        () => NetInfo.fetch.mockRejectedValue(new Error('z')),
        () => RNFS.exists.mockRejectedValue(new Error('w')),
      ];

      for (const breakIt of breakages) {
        jest.clearAllMocks();
        RNFS.exists.mockResolvedValue(false);
        NetInfo.fetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
        breakIt();

        await expect(service.checkForUpdate()).resolves.toBeDefined();
      }
    });
  });

  // ───────────────────────────────────────────
  // 状态与订阅
  // ───────────────────────────────────────────

  describe('状态暴露', () => {
    it('检查前 getLastCheck 为 null', () => {
      expect(service.getLastCheck()).toBeNull();
    });

    it('检查后可通过 getLastCheck 拿到结果', async () => {
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.checkForUpdate();

      expect(service.getLastCheck()).toEqual(result);
    });

    it('订阅者能收到检查完成的通知', async () => {
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));
      const seen: string[] = [];
      const unsubscribe = service.addListener(r => seen.push(r.state));

      await service.checkForUpdate();

      expect(seen).toContain('ready');
      unsubscribe();
    });

    it('退订后不再收到通知', async () => {
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));
      const seen: string[] = [];
      const unsubscribe = service.addListener(r => seen.push(r.state));

      unsubscribe();
      await service.checkForUpdate();

      expect(seen).toEqual([]);
    });

    it('订阅者抛异常不应影响检查结果', async () => {
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));
      service.addListener(() => {
        throw new Error('bad listener');
      });

      const result = await service.checkForUpdate();

      expect(result.state).toBe('ready');
    });
  });

  // ───────────────────────────────────────────
  // 增量下载与应用（Day55-56）
  // ───────────────────────────────────────────

  describe('downloadAndApply', () => {
    /** 造一份下载响应：body 是养护 JSON 的原始文本 */
    function fileResponse(body: string, ok = true, status = 200) {
      return Promise.resolve({ok, status, text: () => Promise.resolve(body)});
    }

    /** 一份形状合法的养护数据 */
    const ROSE_BODY = JSON.stringify({
      flowerId: 3,
      flowerName: '玫瑰',
      watering: {frequency: '夏季每天1次'},
    });
    const PEONY_BODY = JSON.stringify({
      flowerId: 12,
      flowerName: '牡丹',
      watering: {frequency: '每周1次'},
    });

    /** 让 fetch 按 url 分发响应 */
    function routeFetch(routes: Record<string, any>) {
      fetchMock.mockImplementation((url: string) => {
        for (const [key, resp] of Object.entries(routes)) {
          if (url.includes(key)) return resp;
        }
        return Promise.reject(new Error(`未配置的 url: ${url}`));
      });
    }

    /** 抓取本次写入的文件内容 */
    function writes() {
      return RNFS.writeFile.mock.calls.map((c: any[]) => ({
        path: c[0],
        body: c[1],
      }));
    }

    function writtenJson(name: string) {
      const hit = writes().find((w: any) => String(w.path).includes(name));
      return hit ? JSON.parse(hit.body) : null;
    }

    beforeEach(() => {
      // 默认：没有任何落盘记录、目录已存在
      RNFS.exists.mockResolvedValue(false);
      RNFS.mkdir.mockResolvedValue(undefined);
      RNFS.writeFile.mockResolvedValue(undefined);
    });

    it('没有更新时不下载任何文件', async () => {
      // 本地已是远端版本
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({version: '2026.10.01', appliedAt: 'x', files: {}}),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(0);
      // 只应该发过「拉清单」那一次请求
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });

    it('下载全部变更文件并落盘', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(2);
      expect(result.failed).toEqual([]);
      expect(result.rejected).toEqual([]);
      expect(writtenJson('knowledge_cache.json')).toEqual({
        玫瑰: JSON.parse(ROSE_BODY),
        牡丹: JSON.parse(PEONY_BODY),
      });
    });

    it('已应用版本记录写明版本号与各文件 checksum', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      const record = writtenJson('knowledge_version.json');
      expect(record.version).toBe('2026.10.01');
      expect(record.files).toEqual({
        '玫瑰.json': {checksum: 'rose-v2'},
        '牡丹.json': {checksum: 'peony-v2'},
      });
    });

    it('只请求变更的文件，未变更的不发请求', async () => {
      // 玫瑰.json 已是 rose-v2，只有牡丹.json 需要下
      RNFS.exists.mockImplementation(async (p: string) =>
        String(p).includes('knowledge_version.json'),
      );
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({
          version: '2026.09.01',
          appliedAt: 'x',
          files: {'玫瑰.json': {checksum: 'rose-v2'}},
        }),
      );
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'peony.json': fileResponse(PEONY_BODY),
      });

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(1);
      const urls = fetchMock.mock.calls.map((c: any[]) => c[0]);
      expect(urls.some((u: string) => u.includes('rose.json'))).toBe(false);
      expect(urls.some((u: string) => u.includes('peony.json'))).toBe(true);
    });

    it('单个文件 HTTP 失败时记为该文件失败，不影响其他文件', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse('', false, 500),
        'peony.json': fileResponse(PEONY_BODY),
      });

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(1);
      expect(result.failed).toEqual(['玫瑰.json']);
      // 成功的那个仍要落盘，不能白下
      expect(Object.keys(writtenJson('knowledge_cache.json'))).toEqual(['牡丹']);
    });

    it('内容不是合法 JSON 时拒绝该文件（可能是错误页/截断）', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse('<html>404 Not Found</html>'),
        'peony.json': fileResponse(PEONY_BODY),
      });

      const result = await service.downloadAndApply();

      expect(result.rejected).toEqual(['玫瑰.json']);
      expect(result.downloaded).toBe(1);
    });

    it('内容缺少 flowerName 等关键字段时拒绝该文件', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(JSON.stringify({flowerId: 3})),
        'peony.json': fileResponse(PEONY_BODY),
      });

      expect((await service.downloadAndApply()).rejected).toEqual(['玫瑰.json']);
    });

    it('全部成功时版本号才前进', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      expect(writtenJson('knowledge_version.json').version).toBe('2026.10.01');
    });

    it('部分失败时版本号不前进，下次启动会重试', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse('', false, 500),
        'peony.json': fileResponse(PEONY_BODY),
      });

      const result = await service.downloadAndApply();

      const record = writtenJson('knowledge_version.json');
      // 版本号不能前进，否则下次检查会认为「已是最新」而永远不再重试
      expect(record.version).toBe('2026.09.01');
      expect(result.version).toBe('2026.09.01');
    });

    it('部分失败时成功的文件仍被记录，避免重复下载', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse('', false, 500),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      const record = writtenJson('knowledge_version.json');
      expect(record.files['牡丹.json']).toEqual({checksum: 'peony-v2'});
      expect(record.files['玫瑰.json']).toBeUndefined();
    });

    it('全部失败时不写任何文件', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse('', false, 500),
        'peony.json': fileResponse('', false, 500),
      });

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(0);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });

    it('先写数据文件、后写版本记录（中断时不会谎报已应用）', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      const order: string[] = RNFS.writeFile.mock.calls.map((c: any[]) =>
        String(c[0]),
      );
      const cacheIdx = order.findIndex((p: string) =>
        p.includes('knowledge_cache.json'),
      );
      const versionIdx = order.findIndex((p: string) =>
        p.includes('knowledge_version.json'),
      );

      expect(cacheIdx).toBeGreaterThanOrEqual(0);
      // 反过来的话，中途被杀进程会留下「版本已更新但数据没写全」的状态
      expect(cacheIdx).toBeLessThan(versionIdx);
    });

    it('第二次更新时保留上一次的覆盖（累加而非覆盖掉）', async () => {
      // 本地已有 玫瑰 的覆盖，以及它对应的版本记录
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockImplementation(async (p: string) =>
        String(p).includes('knowledge_cache.json')
          ? JSON.stringify({玫瑰: JSON.parse(ROSE_BODY)})
          : JSON.stringify({
              version: '2026.09.01',
              appliedAt: 'x',
              files: {'玫瑰.json': {checksum: 'rose-v2'}},
            }),
      );
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      expect(Object.keys(writtenJson('knowledge_cache.json')).sort()).toEqual([
        '牡丹',
        '玫瑰',
      ]);
    });

    it('会把合并后的数据推给 KnowledgeService 生效', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      await service.downloadAndApply();

      const applied = mockKnowledgeService.applyOverride.mock.calls[0][0];
      expect(Object.keys(applied).sort()).toEqual(['牡丹', '玫瑰']);
    });

    it('没有可应用的更新时不碰 KnowledgeService', async () => {
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({version: '2026.10.01', appliedAt: 'x', files: {}}),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));

      await service.downloadAndApply();

      expect(mockKnowledgeService.applyOverride).not.toHaveBeenCalled();
    });

    it('从未检查过也能直接调用（内部会先检查一次）', async () => {
      routeFetch({
        'version.json': manifestResponse(REMOTE_MANIFEST),
        'rose.json': fileResponse(ROSE_BODY),
        'peony.json': fileResponse(PEONY_BODY),
      });

      expect(service.getLastCheck()).toBeNull();
      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(2);
    });

    it('离线时跳过，不发请求', async () => {
      NetInfo.fetch.mockResolvedValue({isConnected: false});

      const result = await service.downloadAndApply();

      expect(result.downloaded).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('缓存按 flowerName 索引：文件名与花名不一致时覆盖仍能命中', async () => {
      // KnowledgeService 是按花名合并覆盖的。若这里用文件名当键，
      // 一旦文件名与 flowerName 不一致，这条覆盖就永远命中不到 —— 更新静默失效。
      const manifest = {
        version: '2026.10.01',
        files: {'rose.json': {url: 'https://cdn/rose.json', checksum: 'r1'}},
      };
      routeFetch({
        'version.json': manifestResponse(manifest),
        'rose.json': fileResponse(
          JSON.stringify({flowerId: 3, flowerName: '玫瑰'}),
        ),
      });

      await service.downloadAndApply();

      expect(Object.keys(writtenJson('knowledge_cache.json'))).toEqual(['玫瑰']);
    });

    it('随包版本已新于下载的覆盖层时忽略覆盖（APP 升级后不该停在旧数据上）', async () => {
      // 曾下载过 2026.09.15，但这次 APP 升级自带的数据已经是 2026.11.01
      const upgraded = new KnowledgeUpdateService({
        remoteUrl: REMOTE_URL,
        bundledVersion: '2026.11.01',
      });
      RNFS.exists.mockResolvedValue(true);
      RNFS.readFile.mockResolvedValue(
        JSON.stringify({
          version: '2026.09.15',
          appliedAt: 'x',
          files: {
            '玫瑰.json': {checksum: 'rose-v2'},
            '牡丹.json': {checksum: 'peony-v2'},
          },
        }),
      );
      fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST)); // 远端 2026.10.01

      const result = await upgraded.checkForUpdate();

      // 覆盖层被忽略 → 本地版本回到随包的 2026.11.01 → 远端反而更旧
      expect(result.localVersion).toBe('2026.11.01');
      expect(result.updateAvailable).toBe(false);
    });

    it('任何失败下都不会 reject', async () => {
      const breakages: Array<() => void> = [
        () => fetchMock.mockRejectedValue(new Error('x')),
        () => RNFS.writeFile.mockRejectedValue(new Error('disk full')),
        () => RNFS.readFile.mockRejectedValue(new Error('read fail')),
        () => mockKnowledgeService.applyOverride.mockImplementation(() => {
          throw new Error('apply fail');
        }),
      ];

      for (const breakIt of breakages) {
        jest.clearAllMocks();
        RNFS.exists.mockResolvedValue(false);
        RNFS.mkdir.mockResolvedValue(undefined);
        RNFS.writeFile.mockResolvedValue(undefined);
        NetInfo.fetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
        fetchMock.mockReturnValue(manifestResponse(REMOTE_MANIFEST));
        breakIt();

        await expect(service.downloadAndApply()).resolves.toBeDefined();
      }
    });
  });
});
