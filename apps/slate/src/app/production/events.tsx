import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { EventsResponse, LiveEvent, TalentProfile } from '../../contracts';
import { GeoMap, MapCallout, type MapMarker } from '../../design/GeoMap';
import { Icon } from '../../design/Icon';
import { ChipGroup } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import {
  Avatar,
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
  Stat,
  Toggle,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { clockTime, formatCount, rateLabel, relativeTime, shortDate, titleCase } from '../../lib/format';
import { useQuery } from '../../lib/query';

const LA = { lat: 34.0522, lng: -118.2437 };

const KIND_LABEL: Record<LiveEvent['kind'], string> = {
  performance: 'Performance',
  appearance: 'Live appearance',
  shoot: 'Shoot day',
  premiere: 'Premiere',
  panel: 'Panel',
};

export default function Events() {
  const { compact, contentWidth } = useResponsive();
  const [selected, setSelected] = useState<LiveEvent | null>(null);
  const [detail, setDetail] = useState<LiveEvent | null>(null);
  const [realTimeOnly, setRealTimeOnly] = useState(true);
  const [kinds, setKinds] = useState<LiveEvent['kind'][]>([]);

  const events = useQuery<EventsResponse>(
    (signal) => api.get<EventsResponse>('/events', undefined, signal),
    [],
  );

  const all = events.data?.events ?? [];
  const profiles = events.data?.availableProfiles ?? [];
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filtered = useMemo(
    () => (kinds.length === 0 ? all : all.filter((e) => kinds.includes(e.kind))),
    [all, kinds],
  );

  const markers: MapMarker[] = useMemo(() => {
    const eventPins: MapMarker[] = filtered.map((event) => ({
      id: event.id,
      lat: event.location.lat,
      lng: event.location.lng,
      kind: 'event',
      label: event.venue,
      selected: selected?.id === event.id,
      onPress: () => setSelected(event),
    }));

    const talentPins: MapMarker[] = realTimeOnly
      ? profiles.slice(0, 14).map((profile) => ({
          id: `talent-${profile.id}`,
          lat: profile.location.lat,
          lng: profile.location.lng,
          kind: 'talent' as const,
          label: profile.displayName,
        }))
      : [];

    return [...talentPins, ...eventPins];
  }, [filtered, profiles, selected, realTimeOnly]);

  const mapPanel = (
    <View>
      <GeoMap
        center={LA}
        spanMiles={26}
        height={compact ? 340 : 460}
        label="Los Angeles"
        markers={markers}
      />
      {selected ? (
        <View style={{ position: 'absolute', left: space.md, top: space.md, maxWidth: 250 }}>
          <MapCallout
            title={KIND_LABEL[selected.kind]}
            rows={[
              { label: 'Venue', value: selected.venue },
              { label: 'Time', value: `${shortDate(selected.startsAt)} · ${clockTime(selected.startsAt)}` },
              { label: 'Booked', value: `${selected.bookedProfileIds.length} talent` },
            ]}
            actions={
              <Row gap={space.sm} style={{ marginTop: space.xs }}>
                <Button label="Details" size="sm" variant="secondary" onPress={() => setDetail(selected)} />
              </Row>
            }
          />
        </View>
      ) : null}

      <View
        style={{
          position: 'absolute',
          right: space.md,
          bottom: space.md,
          backgroundColor: color.bgElev,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.border,
          padding: space.md,
          gap: space.sm,
          minWidth: 190,
        }}
      >
        <Row justify="space-between">
          <Text variant="micro" tone="muted">
            Real-time availability
          </Text>
          <Toggle value={realTimeOnly} onChange={setRealTimeOnly} label="Real-time availability" />
        </Row>
        <Divider />
        <Row gap={space.sm}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.accent }} />
          <Text variant="micro" tone="faint">
            Events ({filtered.length})
          </Text>
        </Row>
        <Row gap={space.sm}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.brand }} />
          <Text variant="micro" tone="faint">
            Available talent ({realTimeOnly ? Math.min(14, profiles.length) : 0})
          </Text>
        </Row>
      </View>
    </View>
  );

  const listPanel = (
    <Stack gap={space.lg}>
      <Card variant="alt" style={{ gap: space.md }}>
        <SectionTitle title="Filter by type" />
        <ChipGroup
          options={(Object.keys(KIND_LABEL) as LiveEvent['kind'][]).map((k) => ({
            value: k,
            label: KIND_LABEL[k],
          }))}
          selected={kinds}
          onToggle={(value) =>
            setKinds((current) =>
              current.includes(value) ? current.filter((k) => k !== value) : [...current, value],
            )
          }
        />
      </Card>

      <Stack gap={space.md}>
        <SectionTitle title="Upcoming" accent={String(filtered.length)} />
        {filtered.length === 0 ? (
          <EmptyState title="No events match" body="Clear a filter to see the full calendar." />
        ) : (
          filtered.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              onPress={() => {
                setSelected(event);
                setDetail(event);
              }}
            >
              <Card
                style={{
                  gap: space.md,
                  borderColor: selected?.id === event.id ? color.accentBorder : color.border,
                }}
              >
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text variant="micro" tone="accent" upper>
                      {KIND_LABEL[event.kind]}
                    </Text>
                    <Text variant="subheading" numberOfLines={1}>
                      {event.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {event.venue}
                    </Text>
                  </View>
                  <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                    <Text variant="label">{clockTime(event.startsAt)}</Text>
                    <Text variant="micro" tone="faint">
                      {relativeTime(event.startsAt)}
                    </Text>
                  </Stack>
                </Row>

                <Divider />

                <Row justify="space-between">
                  <Row gap={-8}>
                    {event.bookedProfileIds.slice(0, 4).map((id, index) => {
                      const profile = byId.get(id);
                      return (
                        <View key={id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
                          <Avatar
                            name={profile?.displayName ?? 'Talent'}
                            uri={profile?.avatarUrl}
                            size={26}
                            ring={color.surface}
                          />
                        </View>
                      );
                    })}
                    {event.bookedProfileIds.length > 0 ? (
                      <Text variant="micro" tone="faint" style={{ marginLeft: space.sm }}>
                        {event.bookedProfileIds.length} booked
                      </Text>
                    ) : (
                      <Text variant="micro" tone="faint">
                        No talent attached
                      </Text>
                    )}
                  </Row>
                  <Text variant="micro" tone="faint">
                    Cap {formatCount(event.capacity)}
                  </Text>
                </Row>
              </Card>
            </Pressable>
          ))
        )}
      </Stack>
    </Stack>
  );

  if (events.loading && !events.data) {
    return (
      <Screen title="Map" accent="Live events">
        <Loading label="Loading the map" />
      </Screen>
    );
  }

  return (
    <Screen title="Map" accent="Live events" onRefresh={events.refetch} refreshing={events.refreshing}>
      {events.error ? (
        <ErrorNote message={events.error.message} onRetry={events.refetch} />
      ) : compact ? (
        <Stack gap={space.xl}>
          {mapPanel}
          {listPanel}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ flex: 1.2 }}>{mapPanel}</View>
          <View style={{ width: Math.min(400, contentWidth * 0.42) }}>{listPanel}</View>
        </Row>
      )}

      <Sheet
        visible={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        subtitle={detail ? `${KIND_LABEL[detail.kind]} · ${detail.venue}` : undefined}
        footer={
          <Row gap={space.md}>
            <Button label="View availability" variant="secondary" onPress={() => setDetail(null)} />
            <View style={{ flex: 1 }} />
            <Button label="Request contract" onPress={() => setDetail(null)} />
          </Row>
        }
      >
        {detail ? (
          <Stack gap={space.lg}>
            <GeoMap
              center={detail.location}
              spanMiles={4}
              height={180}
              label={detail.venue}
              markers={[{ id: detail.id, lat: detail.location.lat, lng: detail.location.lng, kind: 'event', selected: true }]}
            />
            <Row justify="space-between">
              <Stat label="Starts" value={clockTime(detail.startsAt)} sub={shortDate(detail.startsAt)} />
              <Stat label="Capacity" value={formatCount(detail.capacity)} align="center" />
              <Stat label="Booked" value={String(detail.bookedProfileIds.length)} align="flex-end" tone="success" />
            </Row>
            <Divider />
            <SectionTitle title="Attached talent" />
            {detail.bookedProfileIds.length === 0 ? (
              <Text variant="caption" tone="faint">
                Nobody attached yet. Book from the discovery deck or the crew marketplace.
              </Text>
            ) : (
              <Stack gap={space.md}>
                {detail.bookedProfileIds.map((id) => {
                  const profile = byId.get(id);
                  if (!profile) return null;
                  return (
                    <Row key={id} gap={space.md}>
                      <Avatar name={profile.displayName} uri={profile.avatarUrl} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text variant="subheading" numberOfLines={1}>
                          {profile.displayName}
                        </Text>
                        <Text variant="micro" tone="faint" upper>
                          {profile.primaryRole}
                          {profile.age ? `, ${profile.age}` : ''}
                        </Text>
                      </View>
                      <Text variant="caption" tone="success">
                        {profile.dayRateCents ? rateLabel(profile.dayRateCents, 'day') : profile.dayRateBand}
                      </Text>
                    </Row>
                  );
                })}
              </Stack>
            )}
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}
