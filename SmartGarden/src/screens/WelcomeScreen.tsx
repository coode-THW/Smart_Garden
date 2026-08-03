/**
 * WelcomeScreen — 全屏沉浸式品牌欢迎页 / 启动页
 *
 * 参考微信/Notion/小红书等头部App的启动页设计：
 *  - 全屏覆盖，无状态栏干扰
 *  - 大幅品牌色背景 + 中央大图标
 *  - 底部清晰的指示器 + 操作按钮
 *  - 背景装饰元素增加层次感
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Icon } from 'react-native-paper';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  progress: number; // 0-100
  isReady: boolean;
  onEnterApp: () => void;
  statusText?: string;
}

/* ━━━ 页面数据 ━━━ */
const PAGES = [
  {
    type: 'brand' as const,
    icon: 'leaf',
    title: '智慧花园',
    subtitle: 'Smart Garden',
    desc: 'AI 驱动的植物识别与养护助手',
  },
  {
    type: 'feature' as const,
    icon: 'camera',
    title: 'AI 智慧识别',
    subtitle: 'SMART RECOGNITION',
    desc: '拍照即可识别花卉品种，\n智能分析置信度',
  },
  {
    type: 'feature' as const,
    icon: 'flower',
    title: '专属花园管理',
    subtitle: 'GARDEN MANAGEMENT',
    desc: '记录养护进度，\n追踪植物健康状态',
  },
  {
    type: 'loading' as const,
    icon: 'book-open-variant',
    title: '专业养护指南',
    subtitle: 'CARE GUIDE',
    desc: '涵盖浇水、施肥、光照等\n全方位养护知识',
  },
];

function WelcomeScreen({
  progress,
  isReady,
  onEnterApp,
  statusText,
}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  /* 隐藏状态栏，卸载时恢复 */
  useEffect(() => {
    StatusBar.setHidden(true);
    return () => StatusBar.setHidden(false);
  }, []);

  /* 动画值 */
  const animProgress = useRef(new Animated.Value(0)).current;
  const leafScale = useRef(new Animated.Value(0.3)).current;
  const leafOpacity = useRef(new Animated.Value(0.3)).current;
  const ringRotate = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pageAnims = useRef(PAGES.map(() => new Animated.Value(0))).current;

  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const mutedColor = isDark ? COLORS.textMutedDark : COLORS.textMuted;

  /* 进度动画 */
  useEffect(() => {
    const target = Math.min(progress / 100, 1);

    // 启动新动画前先停止旧的，避免 native 动画节点堆积并发动画
    animProgress.stopAnimation();
    Animated.timing(animProgress, {
      toValue: target,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    leafScale.stopAnimation();
    Animated.timing(leafScale, {
      toValue: 0.3 + target * 0.7,
      duration: 600,
      easing: Easing.out(Easing.back(1.7)),
      useNativeDriver: true,
    }).start();

    leafOpacity.stopAnimation();
    Animated.timing(leafOpacity, {
      toValue: 0.3 + target * 0.7,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  /* 卸载时停止进度/页面动画，避免 native 节点残留报错 */
  useEffect(() => {
    return () => {
      animProgress.stopAnimation();
      leafScale.stopAnimation();
      leafOpacity.stopAnimation();
      pageAnims.forEach(anim => anim.stopAnimation());
    };
  }, []);

  /* 环形水波纹持续旋转 */
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(ringRotate, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, []);

  /* 背景装饰浮动动画 */
  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    float.start();
    return () => float.stop();
  }, []);

  /* 页面入场动画 */
  useEffect(() => {
    pageAnims.forEach((anim, idx) => {
      anim.stopAnimation();
      Animated.timing(anim, {
        toValue: idx === currentPage ? 1 : 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [currentPage]);

  /* 自动进入首页 */
  useEffect(() => {
    if (isReady && currentPage === 3) {
      const timer = setTimeout(onEnterApp, 1500);
      return () => clearTimeout(timer);
    }
  }, [isReady, currentPage, onEnterApp]);

  const handleScroll = useCallback((event: any) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrentPage(page);
  }, []);

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_W, animated: true });
  }, []);

  const goNext = useCallback(() => {
    if (currentPage < PAGES.length - 1) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, goToPage]);

  /* ━━━ 环形进度组件 ━━━ */
  const spinDeg = ringRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });

  const RingProgress = () => (
    <View style={styles.ringContainer}>
      {/* 背景环 */}
      <View
        style={[
          styles.ringBase,
          {
            borderColor: isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(45,90,61,0.08)',
          },
        ]}
      />
      {/* 旋转进度弧 */}
      <Animated.View
        style={[
          styles.ringArc,
          {
            borderTopColor: COLORS.sage,
            transform: [{ rotate: spinDeg }],
          },
        ]}
      />
      {/* 中央叶子（带浮动） */}
      <Animated.View
        style={[
          styles.leafWrap,
          {
            transform: [{ scale: leafScale }, { translateY: floatY }],
            opacity: leafOpacity,
          },
        ]}
      >
        <View
          style={[
            styles.leafCircle,
            { backgroundColor: isDark ? COLORS.forestDark : COLORS.sageLight },
          ]}
        >
          <Icon source="leaf" size={48} color={COLORS.forest} />
        </View>
      </Animated.View>
    </View>
  );

  /* ━━━ 水平进度条 ━━━ */
  const barScale = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const ProgressBar = () => (
    <View style={styles.progressWrap}>
      <View
        style={[
          styles.progressTrack,
          {
            backgroundColor: isDark
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.06)',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: COLORS.forest,
            transform: [{scaleX: barScale}],
          },
        ]}
      />
    </View>
  );

  /* ━━━ 背景装饰元素 ━━━ */
  const DecoCircles = () => (
    <>
      <Animated.View
        style={[
          styles.decoCircle,
          {
            width: 280,
            height: 280,
            borderRadius: 140,
            top: SCREEN_H * 0.08,
            right: -80,
            backgroundColor: isDark
              ? 'rgba(163,184,153,0.04)'
              : 'rgba(45,90,61,0.04)',
            transform: [
              {
                translateY: floatAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 16],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.decoCircle,
          {
            width: 180,
            height: 180,
            borderRadius: 90,
            bottom: SCREEN_H * 0.15,
            left: -60,
            backgroundColor: isDark
              ? 'rgba(163,184,153,0.03)'
              : 'rgba(139,115,85,0.05)',
            transform: [
              {
                translateY: floatAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10],
                }),
              },
            ],
          },
        ]}
      />
    </>
  );

  /* ━━━ 页面渲染 ━━━ */
  const renderPage = (page: (typeof PAGES)[0], index: number) => {
    const anim = pageAnims[index];
    const translateY = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [40, 0],
    });
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
    });
    const opacity = anim;

    // 品牌页 — 全屏森林绿背景
    if (page.type === 'brand') {
      return (
        <View
          key={index}
          style={[
            styles.page,
            { backgroundColor: COLORS.forest, width: SCREEN_W },
          ]}
        >
          <DecoCircles />
          <Animated.View
            style={[
              styles.brandContainer,
              { transform: [{ translateY }, { scale }], opacity },
            ]}
          >
            {/* 中央大图标 */}
            <View style={styles.brandIconWrap}>
              <Icon source="leaf" size={100} color="rgba(255,255,255,0.9)" />
            </View>

            {/* 品牌名 */}
            <Text style={styles.brandTitle}>智慧花园</Text>
            <Text style={styles.brandSubtitle}>{page.subtitle}</Text>

            {/* 底部 slogan */}
            <View style={styles.brandSloganWrap}>
              <Text style={styles.brandSlogan}>{page.desc}</Text>
            </View>
          </Animated.View>
        </View>
      );
    }

    // 功能页 — 奶油白背景 + 大图标
    if (page.type === 'feature') {
      return (
        <View
          key={index}
          style={[styles.page, { backgroundColor: pageBg, width: SCREEN_W }]}
        >
          <DecoCircles />
          <Animated.View
            style={[
              styles.featureContainer,
              { transform: [{ translateY }, { scale }], opacity },
            ]}
          >
            {/* 大图标 */}
            <View
              style={[
                styles.featureIconWrap,
                {
                  backgroundColor: isDark
                    ? COLORS.forestDark
                    : COLORS.sageLight,
                },
              ]}
            >
              <Icon source={page.icon} size={52} color={COLORS.forest} />
            </View>

            <Text style={[styles.featureLabel, { color: mutedColor }]}>
              {page.subtitle}
            </Text>
            <Text style={[styles.featureTitle, { color: textColor }]}>
              {page.title}
            </Text>
            <Text style={[styles.featureDesc, { color: mutedColor }]}>
              {page.desc}
            </Text>
          </Animated.View>
        </View>
      );
    }

    // 加载页
    return (
      <View
        key={index}
        style={[styles.page, { backgroundColor: pageBg, width: SCREEN_W }]}
      >
        <DecoCircles />
        <Animated.View
          style={[
            styles.loadingContainer,
            { transform: [{ translateY }, { scale }], opacity },
          ]}
        >
          {/* 功能图标 */}
          <View
            style={[
              styles.featureIconWrap,
              {
                backgroundColor: isDark ? COLORS.forestDark : COLORS.sageLight,
              },
            ]}
          >
            <Icon source={page.icon} size={44} color={COLORS.forest} />
          </View>

          <Text style={[styles.featureLabel, { color: mutedColor }]}>
            {page.subtitle}
          </Text>
          <Text style={[styles.featureTitle, { color: textColor }]}>
            {page.title}
          </Text>
          <Text style={[styles.featureDesc, { color: mutedColor }]}>
            {page.desc}
          </Text>

          {/* 叶子生长进度区 */}
          <View style={styles.loadingAnimArea}>
            <RingProgress />
            <Text style={[styles.percentText, { color: textColor }]}>
              {Math.round(progress)}%
            </Text>
            <ProgressBar />
            <Text style={[styles.loadingHint, { color: mutedColor }]}>
              {isReady ? '准备就绪' : statusText || 'AI 引擎初始化中…'}
            </Text>
          </View>

          {isReady && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onEnterApp}
              style={[styles.enterBtn, { backgroundColor: COLORS.forest }]}
            >
              <Text style={styles.enterBtnText}>进入应用</Text>
              <Icon source="arrow-right" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 水平滑动页 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!isReady || currentPage < 3}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={{ width: SCREEN_W * PAGES.length }}
      >
        {PAGES.map((page, idx) => renderPage(page, idx))}
      </ScrollView>

      {/* 顶部跳过按钮（非品牌页显示） */}
      {currentPage > 0 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onEnterApp}
          style={[styles.skipBtn, { top: 52 }]}
        >
          <Text style={[styles.skipText, { color: mutedColor }]}>跳过</Text>
        </TouchableOpacity>
      )}

      {/* 品牌页底部版本提示 */}
      {currentPage === 0 && (
        <View style={styles.brandFooter}>
          <Text style={styles.brandFooterText}>v1.0.0</Text>
        </View>
      )}

      {/* 底部控制区 */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: currentPage === 0 ? 'transparent' : pageBg },
        ]}
      >
        {/* 页面指示器 */}
        <View style={styles.dotsRow}>
          {PAGES.map((_, idx) => (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.7}
              onPress={() => goToPage(idx)}
              style={[
                styles.dot,
                idx === currentPage && [
                  styles.dotActive,
                  {
                    backgroundColor:
                      currentPage === 0 ? '#FFFFFF' : COLORS.forest,
                  },
                ],
                idx !== currentPage && {
                  backgroundColor:
                    currentPage === 0
                      ? 'rgba(255,255,255,0.3)'
                      : isDark
                      ? COLORS.borderDark
                      : COLORS.earthLight,
                },
              ]}
            />
          ))}
        </View>

        {/* 下一步按钮 */}
        {currentPage < PAGES.length - 1 ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={goNext}
            style={[
              styles.nextBtn,
              {
                backgroundColor: currentPage === 0 ? '#FFFFFF' : COLORS.forest,
              },
            ]}
          >
            <Text
              style={[
                styles.nextBtnText,
                {
                  color: currentPage === 0 ? COLORS.forest : '#FFFFFF',
                },
              ]}
            >
              下一步
            </Text>
            <Icon
              source="chevron-right"
              size={20}
              color={currentPage === 0 ? COLORS.forest : '#FFFFFF'}
            />
          </TouchableOpacity>
        ) : isReady ? null : (
          <View style={styles.nextBtnPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    paddingTop: 80,
    paddingBottom: 100,
    paddingHorizontal: SPACING.xxl,
    overflow: 'hidden',
  },

  /* 背景装饰 */
  decoCircle: {
    position: 'absolute',
  },

  /* 品牌页 — 全屏森林绿，中央大图标 */
  brandContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandIconWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  brandSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  brandSloganWrap: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  brandSlogan: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  brandFooter: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  brandFooterText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },

  /* 功能页 — 大幅居中 */
  featureContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  featureIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  featureLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  featureTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: SPACING.md,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  featureDesc: {
    fontSize: 16,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 26,
    color: COLORS.textSecondary,
  },

  /* 加载页 */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  loadingAnimArea: {
    alignItems: 'center',
    marginTop: SPACING.xxl,
    marginBottom: SPACING.xl,
  },

  /* 环形进度 */
  ringContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  ringBase: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
  },
  ringArc: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  leafWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  leafCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* 水平进度条 */
  progressWrap: {
    width: 240,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  progressTrack: {
    ...StyleSheet.absoluteFill,
    borderRadius: 3,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 3,
  },

  percentText: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  loadingHint: {
    fontSize: 13,
    marginTop: 2,
  },

  /* 进入按钮 */
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  enterBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  /* 跳过按钮 */
  skipBtn: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
  },

  /* 底部控制栏 */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 40,
    paddingTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    width: 28,
    borderRadius: 5,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtnPlaceholder: {
    width: 100,
    height: 44,
  },
});

export default WelcomeScreen;
