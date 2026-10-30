import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { ArtCategory, ArtOpportunity } from '../contracts';
import { ART_CATEGORIES, ART_CATEGORY_META } from '../contracts/art';
import { GeoMap, type MapMarker } from '../design/GeoMap';
import { Icon } from '../design/Icon';
import { Text } from '../design/Text';
import { Button, Card, Pill, Row, Spacer, Stack } from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { api } from '../lib/api';
import { useQuery } from '../lib/query';

const NEIGHBORHOOD_CENTER = { lat: 34.0782, lng: -118.2606 }; // Silver Lake / Echo Park, LA

export default function MakeArtMap() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<ArtCategory | 'all'>('all');
  const [selectedOppId, setSelectedOppId] = useState<string | null>('art_cam_01');

  const { data, loading, refetch } = useQuery<{ opportunities: ArtOpportunity[]; total: number }>(
    () => api.get<{ opportunities: ArtOpportunity[]; total: number }>('/art/opportunities'),
    []
  );

  const allOpps = data?.opportunities ?? [];

  const filteredOpps = useMemo(() => {
    if (selectedCategory === 'all') return allOpps;
    return allOpps.filter((o) => o.category === selectedCategory);
  }, [allOpps, selectedCategory]);

  const activeOpp = useMemo(
    () => allOpps.find((o) => o.id === selectedOppId) ?? filteredOpps[0] ?? null,
    [allOpps, selectedOppId, filteredOpps]
  );

  const mapMarkers = useMemo<MapMarker[]>(() => {
    return filteredOpps.map((o) => ({
      id: o.id,
      lat: o.lat,
      lng: o.lng,
      kind: 'gig' as const,
      label: o.title,
      pinColor: ART_CATEGORY_META[o.category]?.pinColor ?? color.accent,
      selected: o.id === activeOpp?.id,
      onPress: () => setSelectedOppId(o.id),
    }));
  }, [filteredOpps, activeOpp]);

  return (
    <Screen
      title="Make Art Together"
      accent="Local Creative Map"
      onRefresh={refetch}
    >
      <Stack gap={space.lg}>
        {/* Neighborhood Banner */}
        <Card variant="alt">
          <Row justify="space-between" align="center" wrap>
            <Row align="center" gap={space.sm}>
              <View style={styles.livePulse}>
                <View style={styles.liveDot} />
              </View>
              <Text variant="subheading" weight="700">
                Eastside LA Creative Circle
              </Text>
            </Row>
            <Text variant="caption" tone="faint">
              Silver Lake • Echo Park • Arts District
            </Text>
          </Row>
          <Spacer size={space.xs} />
          <Text variant="caption" tone="muted">
            All creative invitations are local, free of agencies, and welcoming to beginners. Walk, bike, or take a short bus ride to collaborate!
          </Text>
        </Card>

        {/* Category Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          <Pressable
            onPress={() => setSelectedCategory('all')}
            style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
          >
            <Text
              variant="caption"
              weight="700"
              style={[styles.filterChipText, selectedCategory === 'all' && styles.filterChipTextActive]}
            >
              All Art ({allOpps.length})
            </Text>
          </Pressable>

          {ART_CATEGORIES.map((cat) => {
            const meta = ART_CATEGORY_META[cat];
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.filterChip,
                  active && { backgroundColor: `${meta.pinColor}22`, borderColor: meta.pinColor },
                ]}
              >
                <View style={[styles.categoryDot, { backgroundColor: meta.pinColor }]} />
                <Text
                  variant="caption"
                  weight="700"
                  style={[styles.filterChipText, active && { color: meta.pinColor }]}
                >
                  {meta.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* The Neighborhood Map */}
        <Card style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <Row justify="space-between" align="center">
              <Row align="center" gap={space.xs}>
                <Icon name="pin" size={16} color={color.accent} />
                <Text variant="label" weight="700">
                  Walk & Bus Radius (Within 1.5 miles)
                </Text>
              </Row>
              <Text variant="caption" tone="faint">
                {filteredOpps.length} open creative activities
              </Text>
            </Row>
          </View>

          <GeoMap
            center={NEIGHBORHOOD_CENTER}
            spanMiles={3.0}
            height={260}
            markers={mapMarkers}
          />

          {/* Active Opportunity Callout Pin preview */}
          {activeOpp ? (
            <Pressable
              onPress={() => router.push(`/collaboration/${activeOpp.id}` as never)}
              style={styles.selectedCallout}
            >
              <Row justify="space-between" align="flex-start" gap={space.sm}>
                <Stack gap={space.xxs} style={{ flex: 1 }}>
                  <Row align="center" gap={space.xs}>
                    <Pill label={activeOpp.activityBadge} tone="brand" size="sm" />
                    <Text variant="caption" tone="success" weight="700">
                      • {activeOpp.distanceMiles} mi ({activeOpp.walkMinutes} min walk)
                    </Text>
                  </Row>
                  <Text variant="subheading" weight="700" numberOfLines={1}>
                    {activeOpp.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {activeOpp.creatorName} ({activeOpp.creatorRole}) • {activeOpp.neighborhood}
                  </Text>
                </Stack>
                <Button
                  label="View Details"
                  variant="primary"
                  size="sm"
                  onPress={() => router.push(`/collaboration/${activeOpp.id}` as never)}
                />
              </Row>
            </Pressable>
          ) : null}
        </Card>

        {/* Opportunity List */}
        <Stack gap={space.md}>
          <Row justify="space-between" align="center">
            <Text variant="heading" weight="800">
              Nearby Creative Activities
            </Text>
            <Text variant="caption" tone="muted">
              {filteredOpps.length} welcoming projects
            </Text>
          </Row>

          {loading && allOpps.length === 0 ? (
            <Card>
              <Text variant="body" tone="muted" align="center">
                Scanning your neighborhood for creative circles...
              </Text>
            </Card>
          ) : null}

          {filteredOpps.map((opp) => {
            const meta = ART_CATEGORY_META[opp.category];
            const isSelected = opp.id === activeOpp?.id;

            return (
              <Pressable
                key={opp.id}
                onPress={() => {
                  setSelectedOppId(opp.id);
                  router.push(`/collaboration/${opp.id}` as never);
                }}
              >
                <Card
                  variant={isSelected ? 'default' : 'alt'}
                  style={[
                    styles.opportunityCard,
                    isSelected && { borderColor: meta?.pinColor ?? color.accent },
                  ]}
                >
                  <Stack gap={space.sm}>
                    {/* Badge & Meta Row */}
                    <Row justify="space-between" align="center" wrap>
                      <Row align="center" gap={space.xs}>
                        <View style={[styles.categoryPill, { backgroundColor: `${meta?.pinColor ?? color.accent}20` }]}>
                          <Text
                            variant="micro"
                            weight="800"
                            style={{ color: meta?.pinColor ?? color.accent }}
                            upper
                          >
                            {opp.categoryLabel}
                          </Text>
                        </View>
                        <Pill label={opp.activityBadge} tone="neutral" size="sm" />
                      </Row>

                      <Row align="center" gap={space.xxs}>
                        <Icon name="pin" size={13} color={color.success} />
                        <Text variant="caption" tone="success" weight="700">
                          {opp.distanceMiles} mi • {opp.walkMinutes} min walk
                        </Text>
                      </Row>
                    </Row>

                    {/* Title & Story Hook */}
                    <Text variant="heading" weight="700">
                      {opp.title}
                    </Text>

                    <Text variant="body" tone="muted" numberOfLines={2}>
                      {opp.projectStory}
                    </Text>

                    {/* Creator & Perks Row */}
                    <Row justify="space-between" align="center" wrap gap={space.sm}>
                      <Row align="center" gap={space.xs}>
                        <View style={styles.creatorAvatarMini} />
                        <Text variant="caption" weight="600">
                          {opp.creatorName}
                        </Text>
                        <Text variant="caption" tone="faint">
                          • {opp.timeRange} ({opp.dateLabel})
                        </Text>
                      </Row>

                      <Row align="center" gap={space.xs}>
                        <Pill label="No Experience Needed" tone="success" size="sm" />
                        <Text variant="caption" tone="brand" weight="700">
                          {opp.spotsTotal - opp.spotsJoined} spots left →
                        </Text>
                      </Row>
                    </Row>
                  </Stack>
                </Card>
              </Pressable>
            );
          })}
        </Stack>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  livePulse: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: `${color.success}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.success,
  },
  categoryScroll: {
    paddingVertical: space.xxs,
    gap: space.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterChipActive: {
    backgroundColor: `${color.accent}20`,
    borderColor: color.accent,
  },
  filterChipText: {
    color: color.textMuted,
  },
  filterChipTextActive: {
    color: color.accent,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mapCard: {
    padding: 0,
    overflow: 'hidden',
  },
  mapHeader: {
    padding: space.sm,
    backgroundColor: 'rgba(14,6,18,0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  selectedCallout: {
    padding: space.md,
    backgroundColor: 'rgba(28,12,36,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  opportunityCard: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  creatorAvatarMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.accent,
  },
});
