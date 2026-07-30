/**
 * HomeScreen — 首页 · 有机自然主义风格
 *
 * Hero + 功能卡片 + 养护百科弹窗
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
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from '../navigation/types';
import DesignCard from '../components/DesignCard';
import SectionHeader from '../components/SectionHeader';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import ButtonGroup from '../components/ButtonGroup';
import {KnowledgeService} from '../services/KnowledgeService';
import type {CareGuide} from '../types';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

const FEATURES = [
  {
    icon: 'camera',
    title: '拍照识别',
    desc: '拍摄花卉，AI 秒级识别',
    action: 'Recognize',
    iconBg: '#E8F5E9',
    iconColor: COLORS.forest,
  },
  {
    icon: 'flower',
    title: '我的花园',
    desc: '收藏花卉，查看养护档案',
    action: 'Garden',
    iconBg: '#FFF3E0',
    iconColor: COLORS.earth,
  },
  {
    icon: 'book-open-variant',
    title: '养护百科',
    desc: '50+ 品种科学养护知识',
    action: 'encyclopedia',
    iconBg: '#E3F2FD',
    iconColor: COLORS.info,
  },
] as const;

function HomeScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;

  // ━━ 养护百科状态 ━━
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<CareGuide | null>(null);
  const allGuides = useMemo(() => KnowledgeService.getInstance().getAllGuides(), []);

  const handlePress = (action: string) => {
    if (action === 'encyclopedia') {
      setShowEncyclopedia(true);
    } else {
      navigation.navigate(action as keyof MainTabParamList);
    }
  };

  return (
    <View style={[styles.page, {backgroundColor: pageBg}]}>
      {/* ━━ Hero ━━ */}
      <View style={styles.hero}>
        <View style={styles.heroTextBlock}>
          <Text style={[styles.heroLabel, {color: isDark ? COLORS.sage : COLORS.sageDark}]}>
            PLANT CARE
          </Text>
          <Text style={[styles.heroTitle, {color: textColor}]}>智慧花园</Text>
          <Text style={[styles.heroSub, {color: secondaryColor}]}>
            拍照识花 · 科学养护 · 离线优先
          </Text>
        </View>
        <View style={[styles.heroDeco, {backgroundColor: COLORS.forest}]}>
          <Icon source="leaf" size={40} color={COLORS.sage} />
        </View>
      </View>

      {/* ━━ 功能卡片 ━━ */}
      <View style={styles.cardList}>
        {FEATURES.map((f, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => handlePress(f.action)}>
            <DesignCard shadow="card" padding={SPACING.xl} radius={RADIUS.xl} bg={cardBg}>
              <View style={styles.cardInner}>
                <View style={[styles.cardIconBg, {backgroundColor: f.iconBg}]}>
                  <Icon source={f.icon} size={24} color={f.iconColor} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, {color: textColor}]}>
                    {f.title}
                  </Text>
                  <Text style={[styles.cardDesc, {color: secondaryColor}]}>
                    {f.desc}
                  </Text>
                </View>
                <Icon source="chevron-right" size={22} color={secondaryColor} />
              </View>
            </DesignCard>
          </TouchableOpacity>
        ))}
      </View>

      {/* ━━ 底部 ━━ */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, {color: secondaryColor}]}>
          v1.0 · 离线优先 · 隐私安全 · YOLOv11 ONNX
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
          {/* header */}
          <View style={styles.modalHeader}>
            {selectedGuide ? (
              <ButtonGroup align="left" wrap={false}>
                <ActionButton
                  title="返回列表"
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
              />
            )}
            <ButtonGroup align="center" wrap={false}>
              <ActionButton
                title="关闭"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setShowEncyclopedia(false);
                  setSelectedGuide(null);
                }}
              />
            </ButtonGroup>
          </View>

          {/* body */}
          {selectedGuide ? (
            <EncyclopediaDetail
              guide={selectedGuide}
              textColor={textColor}
              secondaryColor={secondaryColor}
              pageBg={pageBg}
              cardBg={cardBg}
              isDark={isDark}
            />
          ) : (
            <FlatList
              data={allGuides}
              keyExtractor={item => String(item.flowerId)}
              numColumns={2}
              contentContainerStyle={styles.encyclopediaList}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.encyclopediaItem}
                  onPress={() => setSelectedGuide(item)}>
                  <DesignCard shadow="card" padding={16} radius={RADIUS.lg} bg={cardBg}>
                    <View style={styles.encyclopediaItemInner}>
                      <FlowerAvatar name={item.flowerName} size={48} />
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
    </View>
  );
}

// ━━ 百科详情子组件 ━━

function EncyclopediaDetail({
  guide,
  textColor,
  secondaryColor,
  cardBg,
}: {
  guide: CareGuide;
  textColor: string;
  secondaryColor: string;
  pageBg: string;
  cardBg: string;
  isDark: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={styles.detailScroll}>
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
            icon="watering-can"
            textColor={textColor}
            iconColor={COLORS.info}>
            {guide.watering.frequency}{'\n'}
            {guide.watering.amount} · {guide.watering.timing}{'\n'}
            {guide.watering.method}
          </Section>
          <Section
            title="施肥"
            icon="seed"
            textColor={textColor}
            iconColor={COLORS.success}>
            {guide.fertilizing.period} · {guide.fertilizing.amount}{'\n'}
            推荐：{guide.fertilizing.recommended.join('、')}
          </Section>
          <Section
            title="光照"
            icon="white-balance-sunny"
            textColor={textColor}
            iconColor={COLORS.warning}>
            {guide.lighting.requirement}{'\n'}
            最佳位置：{guide.lighting.bestLocation}
          </Section>
          <Section
            title="环境"
            icon="thermometer"
            textColor={textColor}
            iconColor={COLORS.error}>
            温度 {guide.environment.temperature}{'\n'}
            湿度 {guide.environment.humidity}{'\n'}
            通风 {guide.environment.ventilation}
          </Section>
          {guide.pests.length > 0 && (
            <Section
              title="病虫害"
              icon="bug"
              textColor={textColor}
              iconColor={COLORS.earth}>
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
  children,
}: {
  title: string;
  icon: string;
  textColor: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.titleRow}>
        <Icon source={icon} size={18} color={iconColor} />
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
    marginBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.buttonSmall,
    marginLeft: SPACING.sm,
  },
  body: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 20,
  },
});

// ━━ 样式 ━━

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: 72,
    paddingBottom: SPACING.xl,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xxl,
  },
  heroTextBlock: {
    flex: 1,
  },
  heroLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    ...TYPOGRAPHY.hero,
    marginBottom: SPACING.sm,
  },
  heroSub: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  heroDeco: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.lg,
  },
  cardList: {
    flex: 1,
    gap: SPACING.lg,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBg: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  cardBody: {flex: 1},
  cardTitle: {
    ...TYPOGRAPHY.h3,
    marginBottom: 2,
  },
  cardDesc: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
  footerText: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.7,
  },

  // ── 弹窗 ──
  modalContainer: {flex: 1},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 56,
    paddingBottom: SPACING.lg,
  },
  encyclopediaList: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  encyclopediaItem: {
    flex: 1,
    margin: SPACING.sm,
  },
  encyclopediaItemInner: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  encyclopediaName: {
    ...TYPOGRAPHY.buttonSmall,
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
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: 4,
  },
  detailLatin: {
    ...TYPOGRAPHY.bodySmall,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  detailMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
});

export default HomeScreen;
