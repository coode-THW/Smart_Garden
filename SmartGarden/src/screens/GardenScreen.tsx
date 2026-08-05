/**
 * GardenScreen — 我的花园
 *
 * 展示已添加花卉列表，支持查看详情、删除。
 * 使用安全区域适配，精致列表卡片。
 */

import React, {useCallback, useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from '../navigation/types';
import DesignCard from '../components/DesignCard';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import SegmentedControl from '../components/SegmentedControl';
import WeatherAdvisedCare from '../components/WeatherAdvisedCare';
import {GardenService, type GardenEntry} from '../services/GardenService';
import {COLORS, RADIUS, SPACING, SHADOWS, TYPOGRAPHY} from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

function GardenScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const pageBg = isDark ? COLORS.bgDark : COLORS.bg;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;

  const [entries, setEntries] = useState<GardenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<GardenEntry | null>(null);
  const [detailTab, setDetailTab] = useState<'care' | 'info'>('care');

  const gardenService = GardenService.getInstance();

  const loadGarden = useCallback(async () => {
    setLoading(true);
    const list = await gardenService.getMyGarden();
    setEntries(list);
    setLoading(false);
  }, [gardenService]);

  useFocusEffect(
    useCallback(() => {
      loadGarden();
    }, [loadGarden]),
  );

  const handleDelete = (entry: GardenEntry) => {
    const name = entry.garden.customName || entry.careGuide?.flowerName || '这盆花';
    Alert.alert('移除花卉', `确定要从花园中移除「${name}」吗？`, [
      {text: '取消', style: 'cancel'},
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          await gardenService.removeFromGarden(entry.garden.gardenId!);
          loadGarden();
        },
      },
    ]);
  };

  const handleAddFlower = () => {
    navigation.navigate('Recognize');
  };

  const renderItem = ({item}: {item: GardenEntry}) => {
    const guide = item.careGuide;
    const garden = item.garden;
    const name = garden.customName || guide?.flowerName || '未知花卉';
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setSelectedEntry(item)}
        onLongPress={() => handleDelete(item)}>
        <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
          <View style={styles.itemInner}>
            <FlowerAvatar name={guide?.flowerName || name} size={50} />
            <View style={styles.itemBody}>
              <View style={styles.itemNameRow}>
                <Text style={[styles.itemName, {color: textColor}]} numberOfLines={1}>
                  {name}
                </Text>
                <StatusBadge text="健康" variant="success" />
              </View>
              {guide && (
                <Text style={[styles.itemMeta, {color: secondaryColor}]} numberOfLines={1}>
                  {guide.scientificName}
                </Text>
              )}
              {garden.location ? (
                <View style={styles.itemLocationRow}>
                  <Icon source="map-marker" size={12} color={secondaryColor} />
                  <Text style={[styles.itemLocation, {color: secondaryColor}]}>
                    {garden.location}
                  </Text>
                </View>
              ) : null}
            </View>
            <Icon source="chevron-right" size={20} color={secondaryColor} />
          </View>
        </DesignCard>
      </TouchableOpacity>
    );
  };

  // ━━ 空状态 ━━
  if (!loading && entries.length === 0) {
    return (
      <View style={[styles.page, {backgroundColor: pageBg, paddingTop: insets.top + SPACING.xl}]}>
        <View style={styles.emptyHeader}>
          <Text style={[styles.emptyLabel, {color: isDark ? COLORS.sage : COLORS.sageDark}]}>
            MY GARDEN
          </Text>
          <Text style={[styles.emptyTitle, {color: textColor}]}>我的花园</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, {backgroundColor: isDark ? COLORS.forest + '15' : COLORS.forestBg}]}>
            <Icon
              source="flower-outline"
              size={56}
              color={COLORS.forest}
            />
          </View>
          <Text style={[styles.emptyHeading, {color: textColor}]}>花园还是空的</Text>
          <Text style={[styles.emptyHint, {color: secondaryColor}]}>
            拍照识别花卉后可添加到花园{'\n'}打造属于你的数字花园
          </Text>
          <ActionButton
            title="去识别花卉"
            variant="primary"
            size="lg"
            icon="camera"
            onPress={handleAddFlower}
          />
        </View>
      </View>
    );
  }

  // ━━ 列表 ━━
  return (
    <View style={[styles.page, {backgroundColor: pageBg}]}>
      <View style={[styles.header, {paddingTop: insets.top + SPACING.xl}]}>
        <View>
          <Text style={[styles.pageLabel, {color: isDark ? COLORS.sage : COLORS.sageDark}]}>
            MY GARDEN
          </Text>
          <Text style={[styles.pageTitle, {color: textColor}]}>我的花园</Text>
          <Text style={[styles.pageCount, {color: secondaryColor}]}>
            {entries.length} 株植物
          </Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, {backgroundColor: COLORS.forest}]} onPress={handleAddFlower}>
          <Icon source="plus" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => String(item.garden.gardenId)}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          {paddingBottom: insets.bottom + SPACING.xxl},
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{height: SPACING.md}} />}
      />

      {/* ━━ 详情弹窗 ━━ */}
      <Modal
        visible={!!selectedEntry}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedEntry(null)}>
        {selectedEntry ? (
          <GardenDetail
            entry={selectedEntry}
            isDark={isDark}
            textColor={textColor}
            secondaryColor={secondaryColor}
            pageBg={pageBg}
            cardBg={cardBg}
            borderColor={borderColor}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            insets={insets}
            onClose={() => setSelectedEntry(null)}
            onDelete={() => {
              setSelectedEntry(null);
              handleDelete(selectedEntry);
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
}

// ━━ 详情子组件 ━━

function GardenDetail({
  entry,
  isDark,
  textColor,
  secondaryColor,
  pageBg,
  cardBg,
  borderColor,
  detailTab,
  setDetailTab,
  insets,
  onClose,
  onDelete,
}: {
  entry: GardenEntry;
  isDark: boolean;
  textColor: string;
  secondaryColor: string;
  pageBg: string;
  cardBg: string;
  borderColor: string;
  detailTab: 'care' | 'info';
  setDetailTab: (t: 'care' | 'info') => void;
  insets: {top: number; bottom: number};
  onClose: () => void;
  onDelete: () => void;
}) {
  const guide = entry.careGuide;
  const garden = entry.garden;
  const name = garden.customName || guide?.flowerName || '未知花卉';

  return (
    <View style={[styles.modalContainer, {backgroundColor: pageBg}]}>
      <View style={[styles.modalHeader, {paddingTop: insets.top + SPACING.sm}]}>
        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
          <Icon source="close" size={20} color={secondaryColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.modalDeleteBtn}>
          <Icon source="trash-can-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.detailScroll, {paddingBottom: insets.bottom + SPACING.xxl}]}
        showsVerticalScrollIndicator={false}>
        {/* hero */}
        <DesignCard shadow="card" padding={SPACING.xxl} radius={RADIUS.xxl} bg={cardBg}>
          <View style={styles.detailHero}>
            <FlowerAvatar name={guide?.flowerName || name} size={68} />
            <Text style={[styles.detailName, {color: textColor}]}>{name}</Text>
            {guide && (
              <>
                <Text style={[styles.detailLatin, {color: secondaryColor}]}>
                  {guide.scientificName}
                </Text>
                <View style={styles.detailMetaRow}>
                  <StatusBadge text={guide.family} variant="default" />
                  <StatusBadge text={`花期 ${guide.bloomPeriod}`} variant="info" />
                </View>
              </>
            )}
            {garden.location && (
              <View style={styles.detailLocationRow}>
                <Icon source="map-marker" size={14} color={secondaryColor} />
                <Text style={[styles.detailLocation, {color: secondaryColor}]}>
                  {garden.location}
                </Text>
              </View>
            )}
          </View>
        </DesignCard>

        {guide && (
          <>
            <SegmentedControl
              segments={[
                {key: 'care', label: '养护指南', icon: 'book-open-variant'},
                {key: 'info', label: '基本信息', icon: 'information-outline'},
              ]}
              activeKey={detailTab}
              onChange={(k) => setDetailTab(k as 'care' | 'info')}
            />

            {detailTab === 'care' ? (
              <>
                <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
                  <View style={styles.careGrid}>
                    <CareGridCell
                      icon="water-outline"
                      label="浇水"
                      iconColor={COLORS.info}
                      values={[guide.watering.frequency, guide.watering.amount]}
                      sub={`${guide.watering.timing} · ${guide.watering.method}`}
                      textColor={textColor}
                      secondaryColor={secondaryColor}
                      isDark={isDark}
                      dividerColor={borderColor}
                    />
                    <CareGridCell
                      icon="sprout"
                      label="施肥"
                      iconColor={COLORS.success}
                      values={[guide.fertilizing.period, guide.fertilizing.amount]}
                      sub={guide.fertilizing.recommended.join('、')}
                      textColor={textColor}
                      secondaryColor={secondaryColor}
                      isDark={isDark}
                      dividerColor={borderColor}
                    />
                    <CareGridCell
                      icon="white-balance-sunny"
                      label="光照"
                      iconColor={COLORS.warning}
                      values={[guide.lighting.requirement]}
                      sub={`最佳：${guide.lighting.bestLocation}`}
                      textColor={textColor}
                      secondaryColor={secondaryColor}
                      isDark={isDark}
                      dividerColor={borderColor}
                    />
                    <CareGridCell
                      icon="thermometer-lines"
                      label="环境"
                      iconColor={COLORS.error}
                      values={[guide.environment.temperature]}
                      sub={`湿度 ${guide.environment.humidity} · ${guide.environment.ventilation}`}
                      textColor={textColor}
                      secondaryColor={secondaryColor}
                      isDark={isDark}
                      dividerColor={borderColor}
                    />
                  </View>
                </DesignCard>

                <WeatherAdvisedCare
                  flowerId={guide.flowerId}
                  flowerName={guide.flowerName}
                />
              </>
            ) : (
              <DesignCard shadow="card" padding={SPACING.lg} radius={RADIUS.xl} bg={cardBg}>
                <View style={styles.infoGrid}>
                  <InfoGridCell label="学名" value={guide.scientificName} textColor={textColor} secondaryColor={secondaryColor} />
                  <InfoGridCell label="科属" value={guide.family} textColor={textColor} secondaryColor={secondaryColor} />
                  <InfoGridCell label="产地" value={guide.origin} textColor={textColor} secondaryColor={secondaryColor} />
                  <InfoGridCell label="花期" value={guide.bloomPeriod} textColor={textColor} secondaryColor={secondaryColor} />
                </View>
              </DesignCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CareGridCell({
  icon, label, iconColor, values, sub, textColor, secondaryColor, isDark, dividerColor,
}: {
  icon: string; label: string; iconColor: string; values: string[]; sub: string;
  textColor: string; secondaryColor: string; isDark: boolean; dividerColor: string;
}) {
  return (
    <View style={[careCellStyles.cell, {borderBottomColor: dividerColor}]}>
      <View style={careCellStyles.header}>
        <View style={[careCellStyles.iconWrap, {backgroundColor: isDark ? iconColor + '20' : iconColor + '12'}]}>
          <Icon source={icon} size={15} color={iconColor} />
        </View>
        <Text style={[careCellStyles.label, {color: iconColor}]}>{label}</Text>
      </View>
      {values.map((v, i) => (
        <Text key={i} style={[careCellStyles.value, {color: textColor}]} numberOfLines={1}>{v}</Text>
      ))}
      <Text style={[careCellStyles.sub, {color: secondaryColor}]} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

function InfoGridCell({
  label, value, textColor, secondaryColor,
}: {label: string; value: string; textColor: string; secondaryColor: string}) {
  return (
    <View style={infoCellStyles.cell}>
      <Text style={[infoCellStyles.label, {color: secondaryColor}]}>{label}</Text>
      <Text style={[infoCellStyles.value, {color: textColor}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const careCellStyles = StyleSheet.create({
  cell: {width: '50%', paddingVertical: SPACING.md, paddingRight: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth},
  header: {flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm},
  iconWrap: {width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center'},
  label: {fontSize: 12, fontWeight: '700'},
  value: {fontSize: 13, fontWeight: '500', lineHeight: 18},
  sub: {fontSize: 11, lineHeight: 16, marginTop: 2},
});

const infoCellStyles = StyleSheet.create({
  cell: {width: '50%', paddingVertical: SPACING.sm, paddingRight: SPACING.md},
  label: {fontSize: 11, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600'},
  value: {fontSize: 14, fontWeight: '500'},
});

// ━━ 样式 ━━

const styles = StyleSheet.create({
  page: {flex: 1, paddingHorizontal: SPACING.xl},

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.lg,
  },
  pageLabel: {...TYPOGRAPHY.label, marginBottom: SPACING.xs},
  pageTitle: {...TYPOGRAPHY.h1, fontSize: 24},
  pageCount: {...TYPOGRAPHY.bodySmall, marginTop: 2},
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.button,
  },

  // Empty state
  emptyHeader: {marginBottom: SPACING.xxxl},
  emptyLabel: {...TYPOGRAPHY.label, marginBottom: SPACING.xs},
  emptyTitle: {...TYPOGRAPHY.h1, fontSize: 24},
  emptyState: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80},
  emptyIconWrap: {width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl},
  emptyHeading: {fontSize: 18, fontWeight: '600', marginBottom: SPACING.sm},
  emptyHint: {fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xxl},

  // List
  listContent: {paddingTop: SPACING.sm},
  itemInner: {flexDirection: 'row', alignItems: 'center'},
  itemBody: {flex: 1, marginLeft: SPACING.md},
  itemNameRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2},
  itemName: {fontSize: 16, fontWeight: '600', flex: 1, marginRight: SPACING.sm},
  itemMeta: {fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginBottom: 2},
  itemLocationRow: {flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2},
  itemLocation: {fontSize: 11},

  // Modal
  modalContainer: {flex: 1},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  modalDeleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  detailScroll: {padding: SPACING.lg, gap: SPACING.lg},

  // Detail hero
  detailHero: {alignItems: 'center'},
  detailName: {fontSize: 22, fontWeight: '700', marginTop: SPACING.lg, marginBottom: 4, letterSpacing: -0.2},
  detailLatin: {fontSize: 13, fontStyle: 'italic', marginBottom: SPACING.md},
  detailMetaRow: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm},
  detailLocationRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm},
  detailLocation: {fontSize: 12},

  // Cards
  careGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  infoGrid: {flexDirection: 'row', flexWrap: 'wrap'},
});

export default GardenScreen;
