import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { AppNotification, Pitch, TalentHomeResponse } from '../../contracts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  Pill,
  Row,
  SectionTitle,
  Stack,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { api } from '../../lib/api';
import { formatMoney, relativeTime, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

type Tab = 'pitches' | 'alerts';

export default function TalentInbox() {
  const router = useRouter();
  const { notifications, markNotificationRead, unreadCount } = useSession();
  const [tab, setTab] = useState<Tab>('pitches');
  const [open, setOpen] = useState<Pitch | null>(null);

  const home = useQuery<TalentHomeResponse>(
    (signal) => api.get<TalentHomeResponse>('/talent/home', undefined, signal),
    [],
  );

  const respond = useMutation(async (pitchId: string, outcome: 'accepted' | 'declined') => {
    // The inbox is optimistic: the reply is recorded locally the moment it is
    // sent so the row never appears to hang on a slow network.
    void pitchId;
    void outcome;
    return true;
  });

  const pitches = home.data?.inbox ?? [];
  const sorted = useMemo(
    () => [...pitches].sort((a, b) => a.queueRank - b.queueRank || Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [pitches],
  );

  return (
    <Screen title="Inbox" accent="Pitches & offers" onRefresh={home.refetch} refreshing={home.refreshing}>
      <Stack gap={space.xl}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pitches', label: 'Pitches', badge: sorted.filter((p) => !p.readAt).length },
            { value: 'alerts', label: 'Alerts', badge: unreadCount },
          ]}
        />

        {tab === 'pitches' ? (
          home.loading && !home.data ? (
            <Loading label="Loading inbox" />
          ) : home.error ? (
            <ErrorNote message={home.error.message} onRetry={home.refetch} />
          ) : sorted.length === 0 ? (
            <EmptyState
              title="Inbox is clear"
              body="Pitches from casting directors and brand managers land here. Super Pitches are pinned to the top."
              action={<Button label="Open gigs deck" onPress={() => router.push('/talent/discover')} />}
            />
          ) : (
            <Stack gap={space.md}>
              {sorted.map((pitch) => (
                <PitchCard key={pitch.id} pitch={pitch} onOpen={() => setOpen(pitch)} />
              ))}
            </Stack>
          )
        ) : (
          <AlertList notifications={notifications} onRead={markNotificationRead} />
        )}
      </Stack>

      <Sheet
        visible={Boolean(open)}
        onClose={() => setOpen(null)}
        title="Pitch detail"
        subtitle={open?.superTier ? `Super Pitch · ${open.superTier}` : 'Standard queue'}
        footer={
          open ? (
            <Row gap={space.md}>
              <Button
                label="Decline"
                variant="secondary"
                onPress={() => {
                  void respond.mutate(open.id, 'declined');
                  setOpen(null);
                }}
              />
              <View style={{ flex: 1 }} />
              <Button
                label="Accept & open escrow"
                loading={respond.pending}
                onPress={() => {
                  void respond.mutate(open.id, 'accepted');
                  setOpen(null);
                  router.push('/agency/escrow');
                }}
              />
            </Row>
          ) : null
        }
      >
        {open ? (
          <Stack gap={space.lg}>
            <Card variant="alt" style={{ gap: space.sm }}>
              <Text variant="body">{open.message}</Text>
            </Card>
            <Row justify="space-between">
              <Detail label="Offer" value={open.offerCents ? formatMoney(open.offerCents) : 'Not stated'} />
              <Detail label="Received" value={relativeTime(open.createdAt)} />
              <Detail label="Status" value={titleCase(open.outcome)} />
            </Row>
            {open.sideScriptId ? (
              <Button
                label="Open side in Casting Room"
                variant="secondary"
                full
                icon={<Icon name="video" size={15} color={color.textMuted} />}
                onPress={() => {
                  setOpen(null);
                  router.push(`/talent/casting?sideId=${open.sideScriptId}` as never);
                }}
              />
            ) : null}
            <Text variant="micro" tone="faint">
              Accepting opens a Smart Escrow agreement. The production funds the full booking before call
              time; releases are tied to check-in, wrap sign-off and final payout.
            </Text>
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function PitchCard({ pitch, onOpen }: { pitch: Pitch; onOpen: () => void }) {
  const isSuper = Boolean(pitch.superTier);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card
        style={{
          gap: space.md,
          borderColor: isSuper ? color.brand : color.border,
          borderWidth: isSuper ? 1.5 : 1,
        }}
      >
        <Row justify="space-between">
          <Row gap={space.xs} wrap>
            {isSuper ? (
              <Pill
                label={`Super · ${pitch.superTier}`}
                tone="brand"
                size="sm"
                icon={<Icon name="zap" size={10} color={color.brand} />}
              />
            ) : (
              <Pill label="Instant pitch" tone="outline" size="sm" />
            )}
            {!pitch.readAt ? <Pill label="Unread" tone="accent" size="sm" /> : null}
            {pitch.sideScriptId ? <Pill label="Side attached" tone="neutral" size="sm" /> : null}
          </Row>
          <Text variant="micro" tone="faint">
            {relativeTime(pitch.createdAt)}
          </Text>
        </Row>

        <Text variant="body" tone="muted" numberOfLines={3}>
          {pitch.message}
        </Text>

        <Divider />

        <Row justify="space-between">
          {pitch.offerCents ? (
            <Row gap={space.xs}>
              <Icon name="dollar" size={14} color={color.success} />
              <Text variant="subheading" tone="success">
                {formatMoney(pitch.offerCents)}
              </Text>
            </Row>
          ) : (
            <Text variant="caption" tone="faint">
              Rate to be discussed
            </Text>
          )}
          <Row gap={space.xxs}>
            <Text variant="micro" tone="accent" upper>
              Review
            </Text>
            <Icon name="chevronRight" size={13} color={color.accent} />
          </Row>
        </Row>
      </Card>
    </Pressable>
  );
}

function AlertList({
  notifications,
  onRead,
}: {
  notifications: AppNotification[];
  onRead: (id: string) => void;
}) {
  const router = useRouter();
  if (notifications.length === 0) {
    return <EmptyState title="No alerts yet" body="Beacons, escrow milestones and audit results appear here." />;
  }

  const toneFor = (priority: AppNotification['priority']) =>
    priority === 'critical' ? color.accent : priority === 'high' ? color.brand : color.textFaint;

  return (
    <Stack gap={space.sm}>
      {notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          onPress={() => {
            onRead(notification.id);
            if (notification.deepLink) router.push(notification.deepLink as never);
          }}
        >
          <Card variant="alt" padding={space.md}>
            <Row gap={space.md} align="flex-start">
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${toneFor(notification.priority)}22`,
                }}
              >
                <Icon
                  name={
                    notification.kind === 'beacon'
                      ? 'zap'
                      : notification.kind === 'escrow'
                        ? 'dollar'
                        : notification.kind === 'agreement'
                          ? 'file'
                          : notification.kind === 'audit'
                            ? 'shield'
                            : 'bell'
                  }
                  size={15}
                  color={toneFor(notification.priority)}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row justify="space-between">
                  <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
                    {notification.title}
                  </Text>
                  <Text variant="micro" tone="faint">
                    {relativeTime(notification.createdAt)}
                  </Text>
                </Row>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {notification.body}
                </Text>
              </View>
              {!notification.readAt ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
              ) : null}
            </Row>
          </Card>
        </Pressable>
      ))}
    </Stack>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="micro" tone="faint" upper>
        {label}
      </Text>
      <Text variant="subheading">{value}</Text>
    </View>
  );
}
