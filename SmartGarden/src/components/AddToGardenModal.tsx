/**
 * AddToGardenModal — 添加到花园弹窗
 *
 * 从 RecognizeScreen 抽取，Props 明确，无副作用泄漏
 */

import React, {useState} from 'react';
import {Alert, Modal, Text, TextInput, View, useColorScheme} from 'react-native';
import {GardenService} from '../services/GardenService';
import {getErrorInfo, getErrorInfoFromError} from '../services/ErrorHandler';
import {ErrorCode} from '../types';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import ActionButton from './ActionButton';
import ButtonGroup from './ButtonGroup';

interface Props {
  visible: boolean;
  flowerId?: number;
  defaultName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddToGardenModal({
  visible,
  flowerId,
  defaultName,
  onClose,
  onSuccess,
}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [customName, setCustomName] = useState(defaultName ?? '');
  const [gardenLocation, setGardenLocation] = useState('');

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const dividerColor = isDark ? COLORS.borderDark : COLORS.border;

  const handleConfirm = async () => {
    onClose();
    try {
      if (!flowerId) {
        const info = getErrorInfo(ErrorCode.DATA_QUERY_FAILED);
        Alert.alert(info.title, info.description);
        return;
      }
      const resp = await GardenService.getInstance().addToGarden({
        flowerId,
        customName: customName || undefined,
        location: gardenLocation || undefined,
      });
      if (resp.code === 0) {
        Alert.alert('添加成功', '已添加到我的花园');
        onSuccess();
      } else {
        const info = getErrorInfoFromError(resp.message);
        Alert.alert('添加失败', `${info.title}：${resp.message}`);
      }
    } catch (e: any) {
      const info = getErrorInfoFromError(e);
      Alert.alert('添加失败', info.fullMessage);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <DesignCard
          bg={cardBg}
          shadow="modal"
          style={{width: '100%', marginHorizontal: SPACING.xl}}
        >
          <View style={{padding: SPACING.xxl}}>
            <Text
              style={{
                ...TYPOGRAPHY.h3,
                color: textColor,
                marginBottom: SPACING.lg,
              }}
            >
              添加到我的花园
            </Text>

            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                marginBottom: SPACING.xs,
              }}
            >
              花卉名称
            </Text>
            <TextInput
              style={{
                fontSize: TYPOGRAPHY.body.fontSize,
                color: textColor,
                borderWidth: 1,
                borderColor: dividerColor,
                borderRadius: RADIUS.sm,
                padding: SPACING.md,
                marginBottom: SPACING.lg,
                backgroundColor: isDark ? COLORS.bgDark : COLORS.bg,
              }}
              value={customName}
              onChangeText={setCustomName}
              placeholderTextColor={secondaryColor}
            />

            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                marginBottom: SPACING.xs,
              }}
            >
              摆放位置（选填）
            </Text>
            <TextInput
              style={{
                fontSize: TYPOGRAPHY.body.fontSize,
                color: textColor,
                borderWidth: 1,
                borderColor: dividerColor,
                borderRadius: RADIUS.sm,
                padding: SPACING.md,
                marginBottom: SPACING.lg,
                backgroundColor: isDark ? COLORS.bgDark : COLORS.bg,
              }}
              value={gardenLocation}
              onChangeText={setGardenLocation}
              placeholder="如：阳台、客厅、书房"
              placeholderTextColor={secondaryColor}
            />

            <ButtonGroup align="stretch">
              <ActionButton title="取消" variant="outline" onPress={onClose} />
              <ActionButton
                title="确认添加"
                variant="primary"
                onPress={handleConfirm}
              />
            </ButtonGroup>
          </View>
        </DesignCard>
      </View>
    </Modal>
  );
}

export default AddToGardenModal;
