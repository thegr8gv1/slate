import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { Divider, Row } from './primitives';
import { color, radius, space } from './tokens';
import { useResponsive } from '../features/shell/useResponsive';

/**
 * Modal sheet.
 *
 * Slides from the bottom on phones and centres as a dialog on wide screens —
 * the two conventions users expect from each form factor — but the content,
 * padding and dismiss affordances are identical, so a flow written once
 * behaves correctly on both.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { compact } = useResponsive();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={compact ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: compact ? 'flex-end' : 'center', alignItems: 'center' }}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim }}
        />
        <View
          style={{
            width: compact ? '100%' : width,
            maxWidth: '100%',
            maxHeight: '88%',
            backgroundColor: color.bgElev,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderBottomLeftRadius: compact ? 0 : radius.xl,
            borderBottomRightRadius: compact ? 0 : radius.xl,
            borderWidth: 1,
            borderColor: color.border,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? ({ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as object)
              : {}),
          }}
        >
          {compact ? (
            <View style={{ alignItems: 'center', paddingTop: space.sm }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: color.borderStrong }} />
            </View>
          ) : null}

          <Row justify="space-between" align="flex-start" style={{ padding: space.lg, paddingBottom: space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{title}</Text>
              {subtitle ? (
                <Text variant="micro" tone="faint" upper>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Icon name="close" size={20} color={color.textMuted} />
            </Pressable>
          </Row>
          <Divider />

          <ScrollView
            contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? (
            <>
              <Divider />
              <View style={{ padding: space.lg }}>{footer}</View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
