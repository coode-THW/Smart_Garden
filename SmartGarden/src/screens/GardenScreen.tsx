/**
 * GardenScreen — 我的花园
 *
 * 展示已添加花卉列表，支持查看详情、删除。
 */

import React, {useCallback, useEffect, useState} from 'react';
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
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from '../navigation/types';
import DesignCard from '../components/DesignCard';
import SectionHeader from '../components/SectionHeader';
import FlowerAvatar from '../components/FlowerAvatar';
import StatusBadge from '../components/StatusBadge';
import ActionButton from '../components/ActionButton';
import ButtonGroup from '../components/ButtonGroup';
import {GardenService, type GardenEntry} from '../services/GardenService';
import {KnowledgeService} from '../services/KnowledgeService';
import type {CareGuide} from '../types';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';

type Nav = BottomTabNavigationProp<MainTabParamList>;

function GardenScreen(): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<Nav>();

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
  const knowledgeService = KnowledgeService.getInstance();

  const loadGarden = useCallback(async () => {
    setLoading(true);
    const list = await gardenService.getMyGarden();
    setEntries(list);
    setLoading(false);
  }, [gardenService]);

  // 每次页面获得焦点时刷新
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
        <DesignCard shadow="card" padding={SPACING.lg} bg={cardBg}>
          <View style={styles.itemInner}>
            <FlowerAvatar name={guide?.flowerName || name} size={48} />
            <View style={styles.itemBody}>
              <View style={styles.itemNameRow}>
                <Text style={[styles.itemName, {color: textColor}]} numberOfLines={1}>
                  {name}
                </Text>
                <StatusBadge text="健康" variant="success" style={styles.itemBadge} />
              </View>
              {guide && (
                <Text style={[styles.itemMeta, {color: secondaryColor}]} numberOfLines={1}>
                  {guide.scientificName} · {guide.family}
                </Text>
              )}
              {garden.location ? (
                <View style={styles.itemLocationRow}>
                  <Icon source="map-marker-outline" size={12} color={secondaryColor} />
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
      <View style={[styles.page, {backgroundColor: pageBg}]}>
        <SectionHeader
          label="MY GARDEN"
          title="我的花园"
          labelColor={isDark ? COLORS.sage : COLORS.sageDark}
          titleColor={textColor}
        />
        <View style={styles.emptyState}>
          <Icon
            source="flower-outline"
            size={64}
            color={isDark ? COLORS.sageDark : COLORS.sage}
          />
          <Text style={[styles.emptyTitle, {color: textColor}]}>花园还是空的</Text>
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
      <SectionHeader
        label="MY GARDEN"
        title="我的花园"
        labelColor={isDark ? COLORS.sage : COLORS.sageDark}
        titleColor={textColor}
        rightElement={
          <TouchableOpacity style={styles.addBtn} onPress={handleAddFlower}>
            <Icon source="plus" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={entries}
        keyExtractor={item => String(item.garden.gardenId)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{height: SPACING.lg}} />}
      />

      {/* ━━ 详情弹窗 ━━ */}
      <Modal
        visible={!!selectedEntry}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedEntry(null)}>
        {selectedEntry && (
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
            onClose={() => setSelectedEntry(null)}
            onDelete={() => {
              setSelectedEntry(null);
              handleDelete(selectedEntry);
            }}
          />
        )}
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
  onClose: () => void;
  onDelete: () => void;
}) {
  const guide = entry.careGuide;
  const garden = entry.garden;
  const name = garden.customName || guide?.flowerName || '未知花卉';

  const activeTabBg = isDark ? 'rgba(163,184,153,0.15)' : COLORS.forest + '18';
  const activeTabBorder = isDark ? 'rgba(163,184,153,0.35)' : COLORS.forest + '40';
  const activeTabText = isDark ? COLORS.sageLight : COLORS.forest;

  return (
    <View style={[styles.modalContainer, {backgroundColor: pageBg}]}>
      {/* header */}
      <View style={styles.modalHeader}>
        <ButtonGroup align="stretch">
          <ActionButton
            title="关闭"
            variant="ghost"
            size="sm"
            onPress={onClose}
          />
          <ActionButton
            title="移除"
            variant="danger"
            size="sm"
            onPress={onDelete}
          />
        </ButtonGroup>
      </View>

      <ScrollView contentContainerStyle={styles.detailScroll}>
        {/* hero */}
        <DesignCard shadow="card" padding={SPACING.xl} bg={cardBg}>
          <View style={styles.detailHero}>
            <FlowerAvatar name={guide?.flowerName || name} size={64} />
            <Text style={[styles.detailName, {color: textColor}]}>{name}</Text>
            {guide && (
              <>
                <Text style={[styles.detailLatin, {color: secondaryColor}]}>
                  {guide.scientificName}
                </Text>
                <Text style={[styles.detailMeta, {color: secondaryColor}]}>
                  {guide.family} · {guide.origin} · {guide.bloomPeriod}
                </Text>
              </>
            )}
            {garden.location && (
              <View style={styles.detailLocationRow}>
                <Icon source="map-marker-outline" size={14} color={secondaryColor} />
                <Text style={[styles.detailLocation, {color: secondaryColor}]}>
                  {garden.location}
                </Text>
              </View>
            )}
          </View>
        </DesignCard>

        {guide && (
          <>
            {/* tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[
                  styles.tab,
                  detailTab === 'care' && {
                    backgroundColor: activeTabBg,
                    borderColor: activeTabBorder,
                  },
                ]}
                onPress={() => setDetailTab('care')}>
                <View style={styles.tabInner}>
                  <Icon
                    source="book-open-page-variant"
                    size={16}
                    color={detailTab === 'care' ? activeTabText : secondaryColor}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      {color: detailTab === 'care' ? activeTabText : secondaryColor},
                    ]}>
                    养护指南
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  detailTab === 'info' && {
                    backgroundColor: activeTabBg,
                    borderColor: activeTabBorder,
                  },
                ]}
                onPress={() => setDetailTab('info')}>
                <View style={styles.tabInner}>
                  <Icon
                    source="information-outline"
                    size={16}
                    color={detailTab === 'info' ? activeTabText : secondaryColor}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      {color: detailTab === 'info' ? activeTabText : secondaryColor},
                    ]}>
                    基本信息
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {detailTab === 'care' ? (
              <DesignCard shadow="card" padding={SPACING.lg} bg={cardBg}>
                <View style={styles.careGrid}>
                  <View style={[styles.careCell, {borderBottomColor: borderColor}]}>
                    <Icon source="water" size={20} color={COLORS.forest} />
                    <Text style={[styles.careLabel, {color: COLORS.forest}]}>浇水</Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.watering.frequency}
                    </Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.watering.amount}
                    </Text>
                    <Text style={[styles.careSub, {color: secondaryColor}]}>
                      {guide.watering.timing} · {guide.watering.method}
                    </Text>
                  </View>
                  <View style={[styles.careCell, {borderBottomColor: borderColor}]}>
                    <Icon source="sprout" size={20} color={COLORS.forest} />
                    <Text style={[styles.careLabel, {color: COLORS.forest}]}>施肥</Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.fertilizing.period}
                    </Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.fertilizing.amount}
                    </Text>
                    <Text style={[styles.careSub, {color: secondaryColor}]}>
                      {guide.fertilizing.recommended.join('、')}
                    </Text>
                  </View>
                  <View style={[styles.careCell, {borderBottomColor: borderColor}]}>
                    <Icon source="white-balance-sunny" size={20} color={COLORS.forest} />
                    <Text style={[styles.careLabel, {color: COLORS.forest}]}>光照</Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.lighting.requirement}
                    </Text>
                    <Text style={[styles.careSub, {color: secondaryColor}]}>
                      最佳：{guide.lighting.bestLocation}
                    </Text>
                  </View>
                  <View style={[styles.careCell, {borderBottomColor: borderColor}]}>
                    <Icon source="thermometer" size={20} color={COLORS.forest} />
                    <Text style={[styles.careLabel, {color: COLORS.forest}]}>环境</Text>
                    <Text style={[styles.careValue, {color: textColor}]}>
                      {guide.environment.temperature}
                    </Text>
                    <Text style={[styles.careSub, {color: secondaryColor}]}>
                      湿度 {guide.environment.humidity} · {guide.environment.ventilation}
                    </Text>
                  </View>
                </View>
              </DesignCard>
            ) : (
              <DesignCard shadow="card" padding={SPACING.lg} bg={cardBg}>
                <View style={styles.grid}>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, {color: secondaryColor}]}>学名</Text>
                    <Text style={[styles.gridValue, {color: textColor}]}>
                      {guide.scientificName}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, {color: secondaryColor}]}>科属</Text>
                    <Text style={[styles.gridValue, {color: textColor}]}>
                      {guide.family}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, {color: secondaryColor}]}>产地</Text>
                    <Text style={[styles.gridValue, {color: textColor}]}>
                      {guide.origin}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridLabel, {color: secondaryColor}]}>花期</Text>
                    <Text style={[styles.gridValue, {color: textColor}]}>
                      {guide.bloomPeriod}
                    </Text>
                  </View>
                </View>
              </DesignCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ━━ 样式 ━━

const styles = StyleSheet.create({
  page: {flex: 1, paddingTop: 72, paddingHorizontal: SPACING.xl},

  // header add button
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.forest,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // empty
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  // list
  listContent: {paddingBottom: SPACING.xxl},
  itemInner: {flexDirection: 'row', alignItems: 'center'},
  itemBody: {flex: 1, marginLeft: 14},
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {fontSize: 16, fontWeight: '600', flexShrink: 1},
  itemBadge: {marginLeft: 8},
  itemMeta: {fontSize: 12, lineHeight: 18},
  itemLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  itemLocation: {fontSize: 12, marginLeft: 4},

  // modal
  modalContainer: {flex: 1},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 56,
    paddingBottom: 12,
  },
  detailScroll: {padding: SPACING.lg, gap: 14},

  // detail hero
  detailHero: {alignItems: 'center'},
  detailName: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: SPACING.lg,
    marginBottom: 4,
  },
  detailLatin: {fontSize: 13, fontStyle: 'italic', marginBottom: 6},
  detailMeta: {fontSize: 12, textAlign: 'center'},
  detailLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  detailLocation: {fontSize: 13, marginLeft: 4},

  // tabs (shared)
  tabRow: {flexDirection: 'row', gap: 10},
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabInner: {flexDirection: 'row', alignItems: 'center', gap: 6},
  tabText: {fontSize: 14, fontWeight: '500'},

  // cards
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  gridCell: {width: '50%', paddingVertical: 8, paddingRight: 8},
  gridLabel: {fontSize: 12, marginBottom: 2},
  gridValue: {fontSize: 14, fontWeight: '500'},

  careGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  careCell: {
    width: '50%',
    paddingVertical: 10,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  careLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  careValue: {fontSize: 13, lineHeight: 18},
  careSub: {fontSize: 11, marginTop: 2, lineHeight: 16},
});

export default GardenScreen;
