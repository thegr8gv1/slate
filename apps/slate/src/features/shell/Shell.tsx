import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';

import type { Workspace } from '../../contracts';
import { Icon, SlateMark, type IconName } from '../../design/Icon';
import { Text } from '../../design/Text';
import { Avatar, Button, Card, Divider, Pill, Row, Stack } from '../../design/primitives';
import { color, elevation, layout, radius, space } from '../../design/tokens';
import {
  NAV,
  WORKSPACE_ICONS,
  WORKSPACE_LABELS,
  activeHref,
  workspaceForPath,
  type NavItem,
} from '../../lib/nav';
import { useSession } from '../../lib/session';
import { useResponsive } from './useResponsive';

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({
  title,
  accent,
  onMenu,
  onSearch,
  right,
}: {
  title?: string;
  accent?: string;
  onMenu: () => void;
  onSearch?: () => void;
  right?: ReactNode;
}) {
  const { unreadCount } = useSession();

  return (
    <View
      style={{
        height: layout.headerHeight,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: color.bgElev,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
          : {}),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={onMenu}
        hitSlop={10}
        style={{ width: 40 }}
      >
        <Icon name="menu" size={22} color={color.textMuted} />
      </Pressable>

      <Row gap={space.xxs} justify="center" style={{ flex: 1 }}>
        <SlateMark size={20} />
        <Text variant="heading" style={{ letterSpacing: 3.4 }} upper>
          Slate
        </Text>
      </Row>

      <Row gap={space.md} justify="flex-end" style={{ width: 40 }}>
        {right}
        {onSearch ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={onSearch} hitSlop={10}>
            <View>
              <Icon name="search" size={21} color={color.textMuted} />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -4,
                    minWidth: 14,
                    height: 14,
                    paddingHorizontal: 3,
                    borderRadius: 7,
                    backgroundColor: color.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="micro" style={{ color: '#FFF', fontSize: 9 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen title strip — the "- VFX COLLAB" band under the header       */
/* ------------------------------------------------------------------ */

function TitleStrip({ title, accent }: { title: string; accent?: string }) {
  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
        paddingTop: space.sm,
        backgroundColor: color.bgElev,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: space.xs,
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
          : {}),
      }}
    >
      <Text variant="overline" tone="faint">
        —
      </Text>
      <Text variant="overline" tone="muted" upper>
        {title}
      </Text>
      {accent ? (
        <Text variant="overline" tone="accent" upper>
          {accent}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom tab bar (compact)                                            */
/* ------------------------------------------------------------------ */

function TabBar({ items, active }: { items: NavItem[]; active: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const primary = items.filter((i) => i.primary).slice(0, 5);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.bgElev,
        borderTopWidth: 1,
        borderTopColor: color.border,
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0),
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
          : {}),
      }}
    >
      {primary.map((item) => {
        const isActive = active === item.href;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href as never)}
            style={{
              flex: 1,
              height: layout.tabBarHeight,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
          >
            <Icon name={item.icon} size={21} color={isActive ? color.accent : color.textFaint} />
            <Text variant="micro" tone={isActive ? 'accent' : 'faint'} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Side rail (medium / expanded)                                       */
/* ------------------------------------------------------------------ */

function Rail({
  items,
  active,
  collapsed,
  workspace,
}: {
  items: NavItem[];
  active: string | null;
  collapsed: boolean;
  workspace: Workspace;
}) {
  const router = useRouter();
  const { account, setWorkspace, signOut } = useSession();

  return (
    <View
      style={{
        width: collapsed ? layout.railCollapsed : layout.railWidth,
        backgroundColor: color.bgElev,
        borderRightWidth: 1,
        borderRightColor: color.border,
        paddingVertical: space.lg,
        paddingHorizontal: collapsed ? space.sm : space.md,
        gap: space.xs,
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
          : {}),
      }}
    >
      {!collapsed ? (
        <>
          <Text variant="micro" tone="faint" upper style={{ paddingHorizontal: space.sm }}>
            Workspace
          </Text>
          <Stack gap={2} style={{ marginBottom: space.md }}>
            {(account?.workspaces ?? []).map((ws) => (
              <Pressable
                key={ws}
                accessibilityRole="button"
                onPress={() => {
                  setWorkspace(ws);
                  router.replace(NAV[ws][0].href as never);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  paddingHorizontal: space.sm,
                  paddingVertical: 7,
                  borderRadius: radius.sm,
                  backgroundColor: ws === workspace ? color.surfaceAlt : 'transparent',
                }}
              >
                <Icon
                  name={WORKSPACE_ICONS[ws]}
                  size={15}
                  color={ws === workspace ? color.accent : color.textFaint}
                />
                <Text variant="caption" tone={ws === workspace ? 'default' : 'faint'}>
                  {WORKSPACE_LABELS[ws]}
                </Text>
              </Pressable>
            ))}
          </Stack>
          <Divider style={{ marginBottom: space.md }} />
        </>
      ) : null}

      {items.map((item) => {
        const isActive = active === item.href;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="link"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href as never)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: space.md,
              paddingHorizontal: collapsed ? 0 : space.md,
              paddingVertical: 10,
              borderRadius: radius.sm,
              backgroundColor: isActive ? color.accentSoft : 'transparent',
            }}
          >
            <Icon name={item.icon} size={19} color={isActive ? color.accent : color.textFaint} />
            {!collapsed ? (
              <Text variant="subheading" tone={isActive ? 'accent' : 'muted'} numberOfLines={1}>
                {item.label}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <View style={{ flex: 1 }} />

      {!collapsed && account ? (
        <>
          <Divider style={{ marginBottom: space.md }} />
          <Row gap={space.sm}>
            <Avatar name={account.displayName} uri={account.avatarUrl} size={32} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" numberOfLines={1}>
                {account.displayName}
              </Text>
              <Text variant="micro" tone="faint" numberOfLines={1}>
                {account.plan.replace('_', ' ')}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()}>
              <Icon name="logout" size={17} color={color.textFaint} />
            </Pressable>
          </Row>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Menu sheet                                                          */
/* ------------------------------------------------------------------ */

function MenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { account, workspace, setWorkspace, signOut } = useSession();
  const pathWorkspace = workspaceForPath(pathname);
  const routeWorkspace =
    pathWorkspace && account?.workspaces.includes(pathWorkspace) ? pathWorkspace : workspace;
  const items = NAV[routeWorkspace];
  const active = activeHref(items, pathname);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: color.scrim }}
      />
      <View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 300,
            backgroundColor: color.bgElev,
            borderRightWidth: 1,
            borderRightColor: color.border,
            paddingTop: 52,
            paddingHorizontal: space.lg,
            paddingBottom: space.xl,
          },
          elevation(3),
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.lg }}>
          <Row gap={space.sm}>
            <SlateMark size={22} />
            <Text variant="title" style={{ letterSpacing: 3 }} upper>
              Slate
            </Text>
          </Row>

          {account ? (
            <Card variant="alt" padding={space.md}>
              <Row gap={space.md}>
                <Avatar name={account.displayName} uri={account.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {account.displayName}
                  </Text>
                  <Text variant="micro" tone="faint">
                    {account.email}
                  </Text>
                </View>
              </Row>
              <Row gap={space.xs} wrap style={{ marginTop: space.md }}>
                <Pill label={account.plan.replace(/_/g, ' ')} tone="accent" size="sm" />
                {account.pitchAllowance !== null ? (
                  <Pill label={`${account.pitchAllowance} pitches left`} tone="outline" size="sm" />
                ) : (
                  <Pill label="Unlimited pitches" tone="success" size="sm" />
                )}
              </Row>
            </Card>
          ) : null}

          <View style={{ gap: space.xs }}>
            <Text variant="micro" tone="faint" upper>
              Switch workspace
            </Text>
            {(account?.workspaces ?? []).map((ws) => (
              <Pressable
                key={ws}
                accessibilityRole="button"
                onPress={() => {
                  setWorkspace(ws);
                  onClose();
                  router.replace(NAV[ws][0].href as never);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingVertical: 9,
                  paddingHorizontal: space.md,
                  borderRadius: radius.sm,
                  backgroundColor: ws === routeWorkspace ? color.surfaceAlt : 'transparent',
                }}
              >
                <Icon
                  name={WORKSPACE_ICONS[ws]}
                  size={17}
                  color={ws === routeWorkspace ? color.accent : color.textFaint}
                />
                <Text variant="body" tone={ws === routeWorkspace ? 'default' : 'muted'}>
                  {WORKSPACE_LABELS[ws]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 2 }}>
            <Text variant="micro" tone="faint" upper>
              {WORKSPACE_LABELS[routeWorkspace]}
            </Text>
            {items.map((item) => (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                onPress={() => {
                  onClose();
                  router.push(item.href as never);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingVertical: 10,
                  paddingHorizontal: space.md,
                  borderRadius: radius.sm,
                  backgroundColor: active === item.href ? color.accentSoft : 'transparent',
                }}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  color={active === item.href ? color.accent : color.textFaint}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" tone={active === item.href ? 'accent' : 'default'}>
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text variant="micro" tone="faint" numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>

          <Divider />
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              onClose();
              router.push('/ops' as never);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.md }}
          >
            <Icon name="settings" size={18} color={color.textFaint} />
            <Text variant="subheading" tone="muted">
              Platform health
            </Text>
          </Pressable>

          <Button
            label="Sign out"
            variant="secondary"
            full
            icon={<Icon name="logout" size={16} color={color.textMuted} />}
            onPress={() => {
              onClose();
              void signOut();
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export interface ScreenProps {
  /** Rendered in the title strip, e.g. "MAP" + accent "LIVE EVENTS". */
  title: string;
  accent?: string;
  children: ReactNode;
  /** Disables the scroll container for screens that manage their own (decks). */
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Fills the viewport with no content padding — used by the swipe decks. */
  bleed?: boolean;
  headerRight?: ReactNode;
  footer?: ReactNode;
}

export function Screen({
  title,
  accent,
  children,
  scroll = true,
  onRefresh,
  refreshing,
  bleed,
  headerRight,
  footer,
}: ScreenProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { account, workspace, setWorkspace } = useSession();
  const { compact, expanded, contentWidth, gutter } = useResponsive();
  const insets = useSafeAreaInsets();

  // The rail follows the route, but only into a workspace this account actually
  // holds. Deep-linking a production account at /talent/... should not hand it
  // talent navigation it has no permission to use; it keeps its own rail and
  // the screen renders whatever the API is willing to return.
  const pathWorkspace = workspaceForPath(pathname);
  const routeWorkspace =
    pathWorkspace && account?.workspaces.includes(pathWorkspace) ? pathWorkspace : workspace;

  useEffect(() => {
    if (routeWorkspace !== workspace) setWorkspace(routeWorkspace);
  }, [routeWorkspace, workspace, setWorkspace]);

  const items = NAV[routeWorkspace];
  const active = activeHref(items, pathname);

  const body = bleed ? (
    <View style={{ flex: 1 }}>{children}</View>
  ) : scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingTop: space.lg,
        paddingBottom: space.huge + (compact ? 0 : space.xl),
        alignItems: 'center',
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={color.accent}
            colors={[color.accent]}
            progressBackgroundColor={color.surface}
          />
        ) : undefined
      }
    >
      <View style={{ width: contentWidth, maxWidth: '100%' }}>{children}</View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: gutter, alignItems: 'center' }}>
      <View style={{ width: contentWidth, maxWidth: '100%', flex: 1 }}>{children}</View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top, overflow: 'hidden' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ethereal background glowing rose orbs */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -90,
          right: -90,
          width: 380,
          height: 380,
          borderRadius: 190,
          backgroundColor: 'rgba(244, 63, 94, 0.12)',
          ...(Platform.OS === 'web' ? ({ filter: 'blur(75px)' } as object) : {}),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 20,
          left: -110,
          width: 440,
          height: 440,
          borderRadius: 220,
          backgroundColor: 'rgba(192, 132, 252, 0.08)',
          ...(Platform.OS === 'web' ? ({ filter: 'blur(85px)' } as object) : {}),
        }}
      />

      <Header
        onMenu={() => setMenuOpen(true)}
        onSearch={() => router.push('/search' as never)}
        right={headerRight}
      />
      <TitleStrip title={title} accent={accent} />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {!compact ? (
          <Rail items={items} active={active} collapsed={!expanded} workspace={routeWorkspace} />
        ) : null}
        <View style={{ flex: 1 }}>{body}</View>
      </View>

      {footer}
      {compact ? <TabBar items={items} active={active} /> : null}
      <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

/** Sticky action bar pinned above the tab bar — used by the decks and wizards. */
export function ActionBar({ children }: { children: ReactNode }) {
  const { compact, contentWidth, gutter } = useResponsive();
  return (
    <View
      style={[
        {
          backgroundColor: color.bgElev,
          borderTopWidth: 1,
          borderTopColor: color.border,
          paddingHorizontal: gutter,
          paddingVertical: space.md,
          alignItems: 'center',
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
            : {}),
        },
        Platform.OS === 'web' ? {} : elevation(2),
      ]}
    >
      <View style={{ width: compact ? '100%' : contentWidth, maxWidth: '100%' }}>{children}</View>
    </View>
  );
}

export type { IconName };
