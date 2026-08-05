/**
 * HomeScreen — 首页 · 有机自然主义风格
 *
 * Hero 问候 + 天气 + 快捷功能网格（主操作大卡 + 次操作小卡）+ 养护百科弹窗
 */

import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Icon} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from '../navigation/types';
import DesignCard from '../components/DesignCard';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import WeatherCard from '../components/WeatherCard';
import ActionButton from '../components/ActionButton';
import ButtonGroup from '../components/ButtonGroup';
import SectionHeader from '../components/SectionHeader';
import {KnowledgeService} from '../services/KnowledgeService';
import type {CareGuide} from '../types';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

function HomeScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;

  // ━━ 养护百科状态 ━━
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<CareGuide | null>(null);
  const allGuides = useMemo(() => KnowledgeService.getInstance().getAllGuides(), []);

  const handleRecognize = () => navigation.navigate('Recognize');
  const handleGarden = () => navigation.navigate('Garden');
  const handleEncyclopedia = () => setShowEncyclopedia(true);

  // 获取当前小时，显示问候语
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <ScrollView
      style={[styles.page, {backgroundColor: pageBg}]}
      contentContainerStyle={[
        styles.pageContent,
        {paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xxl},
      ]}
      showsVerticalScrollIndicator={false}>

      {/* ━━ Hero 问候区 ━━ */}
      <View style={styles.heroSection}>
        <View style={styles.heroGreeting}>
          <Text style={[styles.heroLabel, {color: isDark ? COLORS.sageLight : COLORS.sageDark}]}>
            PLANT CARE
          </Text>
          <Text style={[styles.heroTitle, {color: textColor}]}>{greeting}，</Text>
          <Text style={[styles.heroSub, {color: COLORS.forest}]}>
            今天也要照顾好你的植物
          </Text>
        </View>
      </View>

      {/* ━━ 天气卡片 ━━ */}
      <View style={styles.sectionGap}>
        <WeatherCard />
      </View>

      {/* ━━ 快捷功能区 ━━ */}
      <View style={styles.sectionGap}>
        <Text style={[styles.sectionLabel, {color: isDark ? COLORS.sage : COLORS.sageDark}]}>
          QUICK ACTIONS
        </Text>

        {/* 主操作：拍照识别大卡片 */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleRecognize}
          style={styles.heroCardWrap}>
          <DesignCard
            shadow="cardHover"
            padding={0}
            radius={RADIUS.xxl}
            bg={isDark ? COLORS.forestDark : COLORS.forest}
            style={styles.recognizeHeroCard}>
            <View style={styles.recognizeCardContent}>
              <View style={styles.recognizeCardText}>
                <Text style={styles.recognizeCardLabel}>AI RECOGNITION</Text>
                <Text style={styles.recognizeCardTitle}>拍照识花</Text>
                <Text style={styles.recognizeCardDesc}>
                  对准花卉拍照，AI 秒级识别品种与养护方法
                </Text>
                <View style={styles.recognizeCardCta}>
                  <Text style={styles.recognizeCardCtaText}>开始识别</Text>
                  <Icon source="arrow-right" size={16} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.recognizeCardIcon}>
                <Icon source="camera-iris" size={64} color="rgba(255,255,255,0.15)" />
              </View>
            </View>
          </DesignCard>
        </TouchableOpacity>

        {/* 次操作：花园 + 百科 并排 */}
        <View style={styles.subActionsRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleGarden}
            style={styles.subActionFlex}>
            <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
              <View style={[styles.subActionIcon, {backgroundColor: isDark ? COLORS.earth + '20' : COLORS.earthBg}]}>
                <Icon source="flower-tulip-outline" size={24} color={COLORS.earth} />
              </View>
              <Text style={[styles.subActionTitle, {color: textColor}]}>我的花园</Text>
              <Text style={[styles.subActionDesc, {color: secondaryColor}]}>
                查看养护档案
              </Text>
            </DesignCard>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleEncyclopedia}
            style={styles.subActionFlex}>
            <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
              <View style={[styles.subActionIcon, {backgroundColor: isDark ? COLORS.info + '20' : COLORS.infoLight}]}>
                <Icon source="book-open-variant" size={24} color={COLORS.info} />
              </View>
              <Text style={[styles.subActionTitle, {color: textColor}]}>养护百科</Text>
              <Text style={[styles.subActionDesc, {color: secondaryColor}]}>
                50+ 品种知识
              </Text>
            </DesignCard>
          </TouchableOpacity>
        </View>
      </View>

      {/* ━━ 底部标识 ━━ */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, {color: secondaryColor}]}>
          离线优先 · 隐私安全 · YOLOv11 ONNX
        </Text>
      </View>

      {/* ━━ 养护百科弹窗 ━━ */}
      <Modal
        visible={showEncyclopedia}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowEncyclopedia(false);
          setSelectedGuide(null);
        }}>
        <View style={[styles.modalContainer, {backgroundColor: pageBg}]}>
          <View style={[styles.modalHeader, {paddingTop: insets.top + SPACING.sm}]}>
            {selectedGuide ? (
              <ButtonGroup align="left" wrap={false}>
                <ActionButton
                  title="返回"
                  variant="ghost"
                  size="sm"
                  icon="chevron-left"
                  iconPosition="left"
                  onPress={() => setSelectedGuide(null)}
                />
              </ButtonGroup>
            ) : (
              <SectionHeader
                label="PLANT ENCYCLOPEDIA"
                title="养护百科"
                titleColor={textColor}
                labelColor={isDark ? COLORS.sage : COLORS.sageDark}
                style={{marginBottom: 0}}
              />
            )}
            <TouchableOpacity
              onPress={() => {
                setShowEncyclopedia(false);
                setSelectedGuide(null);
              }}
              style={[styles.modalCloseBtn, {backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0EDE8'}]}>
              <Icon source="close" size={20} color={secondaryColor} />
            </TouchableOpacity>
          </View>

          {selectedGuide ? (
            <EncyclopediaDetail
              guide={selectedGuide}
              textColor={textColor}
              secondaryColor={secondaryColor}
              cardBg={cardBg}
              isDark={isDark}
            />
          ) : (
            <FlatList
              data={allGuides}
              keyExtractor={item => String(item.flowerId)}
              numColumns={2}
              contentContainerStyle={styles.encyclopediaList}
              columnWrapperStyle={styles.encyclopediaRow}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.encyclopediaItem}
                  activeOpacity={0.8}
                  onPress={() => setSelectedGuide(item)}>
                  <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.lg} bg={cardBg}>
                    <View style={styles.encyclopediaItemInner}>
                      <FlowerAvatar name={item.flowerName} size={44} />
                      <Text
                        style={[styles.encyclopediaName, {color: textColor}]}
                        numberOfLines={1}>
                        {item.flowerName}
                      </Text>
                    </View>
                  </DesignCard>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

// ━━ 百科详情子组件 ━━

function EncyclopediaDetail({
  guide,
  textColor,
  secondaryColor,
  cardBg,
  isDark,
}: {
  guide: CareGuide;
  textColor: string;
  secondaryColor: string;
  cardBg: string;
  isDark: boolean;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.detailScroll}
      showsVerticalScrollIndicator={false}>
      <DesignCard shadow="card" padding={SPACING.xxl} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.detailCard}>
          <FlowerAvatar name={guide.flowerName} size={64} />
          <Text style={[styles.detailName, {color: textColor}]}>
            {guide.flowerName}
          </Text>
          <Text style={[styles.detailLatin, {color: secondaryColor}]}>
            {guide.scientificName}
          </Text>
          <View style={styles.detailMetaWrap}>
            <StatusBadge text={`${guide.family} · ${guide.origin}`} variant="default" />
            <StatusBadge text={`花期 ${guide.bloomPeriod}`} variant="info" />
          </View>
        </View>
      </DesignCard>

      <DesignCard shadow="card" padding={SPACING.xxl} radius={RADIUS.xl} bg={cardBg}>
        <View style={styles.detailCard}>
          <Section
            title="浇水"
            icon="water"
            textColor={textColor}
            iconColor={COLORS.info}
            isDark={isDark}>
            {guide.watering.frequency}{'\n'}
            {guide.watering.amount} · {guide.watering.timing}{'\n'}
            {guide.watering.method}
          </Section>
          <Section
            title="施肥"
            icon="sprout"
            textColor={textColor}
            iconColor={COLORS.success}
            isDark={isDark}>
            {guide.fertilizing.period} · {guide.fertilizing.amount}{'\n'}
            推荐：{guide.fertilizing.recommended.join('、')}
          </Section>
          <Section
            title="光照"
            icon="white-balance-sunny"
            textColor={textColor}
            iconColor={COLORS.warning}
            isDark={isDark}>
            {guide.lighting.requirement}{'\n'}
            最佳位置：{guide.lighting.bestLocation}
          </Section>
          <Section
            title="环境"
            icon="thermometer"
            textColor={textColor}
            iconColor={COLORS.error}
            isDark={isDark}>
            温度 {guide.environment.temperature}{'\n'}
            湿度 {guide.environment.humidity}{'\n'}
            通风 {guide.environment.ventilation}
          </Section>
          {guide.pests.length > 0 && (
            <Section
              title="病虫害"
              icon="bug-outline"
              textColor={textColor}
              iconColor={COLORS.earth}
              isDark={isDark}>
              {guide.pests.map(p => `· ${p.name}：${p.symptom}\n  防治：${p.treatment}`).join('\n\n')}
            </Section>
          )}
        </View>
      </DesignCard>
    </ScrollView>
  );
}

function Section({
  title,
  icon,
  textColor,
  iconColor,
  isDark,
  children,
}: {
  title: string;
  icon: string;
  textColor: string;
  iconColor: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.wrap}>
      <View
        style={[
          sectionStyles.titleRow,
          {
            backgroundColor: isDark ? iconColor + '15' : iconColor + '0D',
            borderRadius: RADIUS.md,
            padding: SPACING.sm,
            marginBottom: SPACING.sm,
          },
        ]}>
        <Icon source={icon} size={16} color={iconColor} />
        <Text style={[sectionStyles.title, {color: iconColor}]}>{title}</Text>
      </View>
      <Text style={[sectionStyles.body, {color: textColor}]}>{children}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: {marginBottom: SPACING.lg},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.buttonSmall,
  },
  body: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 20,
    paddingLeft: SPACING.xs,
  },
});

// ━━ 样式 ━━

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: SPACING.xl,
  },

  // Hero
  heroSection: {
    marginBottom: SPACING.xl,
  },
  heroGreeting: {
    paddingTop: SPACING.sm,
  },
  heroLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  heroSub: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    letterSpacing: 0,
    marginTop: 2,
  },

  // Section spacing
  sectionGap: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },

  // Recognize hero card
  heroCardWrap: {
    marginBottom: SPACING.md,
  },
  recognizeHeroCard: {
    overflow: 'hidden',
  },
  recognizeCardContent: {
    flexDirection: 'row',
    padding: SPACING.xl,
    minHeight: 140,
  },
  recognizeCardText: {
    flex: 1,
    justifyContent: 'center',
    zIndex: 1,
  },
  recognizeCardIcon: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
  recognizeCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: SPACING.xs,
  },
  recognizeCardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    letterSpacing: -0.3,
  },
  recognizeCardDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 18,
    marginBottom: SPACING.md,
    maxWidth: '80%',
  },
  recognizeCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    gap: SPACING.xs,
  },
  recognizeCardCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Sub actions row
  subActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  subActionFlex: {
    flex: 1,
  },
  subActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  subActionTitle: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
    marginBottom: 2,
  },
  subActionDesc: {
    ...TYPOGRAPHY.bodySmall,
    fontSize: 12,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: SPACING.lg,
  },
  footerText: {
    fontSize: 10,
    letterSpacing: 1.2,
    opacity: 0.6,
  },

  // Modal
  modalContainer: {flex: 1},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encyclopediaList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  encyclopediaRow: {
    gap: SPACING.md,
  },
  encyclopediaItem: {
    flex: 1,
  },
  encyclopediaItemInner: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  encyclopediaName: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  detailScroll: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  detailCard: {
    alignItems: 'center',
  },
  detailName: {
    ...TYPOGRAPHY.h1,
    fontSize: 22,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: 4,
  },
  detailLatin: {
    ...TYPOGRAPHY.bodySmall,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  detailMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
});

export default HomeScreen;
