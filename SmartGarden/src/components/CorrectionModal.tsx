/**
 * CorrectionModal — 识别纠错弹窗
 *
 * 从 RecognizeScreen 抽取
 */

import React, {useState} from 'react';
import {Modal, Text, TextInput, View, useColorScheme} from 'react-native';
import {COLORS, RADIUS, SPACING, TYPOGRAPHY} from '../constants';
import DesignCard from './DesignCard';
import ActionButton from './ActionButton';
import ButtonGroup from './ButtonGroup';

interface Props {
  visible: boolean;
  topClass?: string;
  onClose: () => void;
  onSubmit: (correction: string) => void;
}

function CorrectionModal({
  visible,
  topClass,
  onClose,
  onSubmit,
}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [text, setText] = useState('');

  const textColor = isDark ? COLORS.textDark : COLORS.text;
  const secondaryColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const cardBg = isDark ? COLORS.cardDark : COLORS.card;
  const dividerColor = isDark ? COLORS.borderDark : COLORS.border;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    onClose();
  };

  const handleClose = () => {
    setText('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
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
              识别纠错
            </Text>

            {topClass ? (
              <Text
                style={{
                  ...TYPOGRAPHY.bodySmall,
                  color: secondaryColor,
                  marginBottom: SPACING.sm,
                }}
              >
                当前识别：{topClass}
              </Text>
            ) : null}

            <Text
              style={{
                ...TYPOGRAPHY.bodySmall,
                color: secondaryColor,
                marginBottom: SPACING.xs,
              }}
            >
              请输入正确的花卉名称
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
              value={text}
              onChangeText={setText}
              placeholder="如：玫瑰、郁金香"
              placeholderTextColor={secondaryColor}
              autoFocus
            />

            <ButtonGroup align="stretch">
              <ActionButton
                title="取消"
                variant="outline"
                onPress={handleClose}
              />
              <ActionButton
                title="提交反馈"
                variant="primary"
                onPress={handleSubmit}
                disabled={!text.trim()}
              />
            </ButtonGroup>
          </View>
        </DesignCard>
      </View>
    </Modal>
  );
}

export default CorrectionModal;
