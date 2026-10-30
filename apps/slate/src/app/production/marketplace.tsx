import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SECTOR_CATALOG, type GearListing, type MarketplaceResponse, type Sector, type TalentProfile } from '../../contracts';
import { Icon } from '../../design/Icon';
import { ChipGroup, Segmented } from '../../design/Segmented';
import { Sheet } from '../../design/Sheet';
import { Text } from '../../design/Text';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  Photo,
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
import { formatMoney, rateLabel, titleCase, unionLabel } from '../../lib/format';
import { useQuery } from '../../lib/query';

type Tab = 'crew' | 'gear';

const CREW_SECTORS: Sector[] = ['camera_lighting', 'music_sound', 'art_style_sfx', 'post_production'];

export default function Marketplace() {
  const { columns, compact } = useResponsive();
  const [tab, setTab] = useState<Tab>('crew');
  const [sectors, setSectors] = useState<Sector[]>(CREW_SECTORS);
  const [unionOnly, setUnionOnly] = useState(false);
  const [maxRate, setMaxRate] = useState<number | null>(null);
  const [selected, setSelected] = useState<TalentProfile | null>(null);
  const [selectedGear, setSelectedGear] = useState<GearListing | null>(null);

  const market = useQuery<MarketplaceResponse>(
    (signal) =>
      api.get<MarketplaceResponse>(
        '/marketplace',
        { sectors, union: unionOnly, maxRateCents: maxRate ?? undefined },
        signal,
      ),
    [sectors.join(','), unionOnly, maxRate],
  );

  const crew = market.data?.crew ?? [];
  const gear = market.data?.gear ?? [];
  const cardWidth = columns === 1 ? '100%' : `${100 / Math.min(3, columns) - 1.4}%`;

  return (
    <Screen
      title="Crew"
      accent="Marketplace"
      onRefresh={market.refetch}
      refreshing={market.refreshing}
    >
      <Stack gap={space.xl}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'crew', label: 'Crew', badge: crew.length },
            { value: 'gear', label: 'Gear rental', badge: gear.length },
          ]}
        />

        {/* ---------- Filters ---------- */}
        <Card variant="alt" style={{ gap: space.md }}>
          <Row justify="space-between">
            <SectionTitle title="Filter" />
            <Row gap={space.sm}>
              <Text variant="caption" tone="muted">
                Union only
              </Text>
              <Toggle value={unionOnly} onChange={setUnionOnly} label="Union only" />
            </Row>
          </Row>

          {tab === 'crew' ? (
            <ChipGroup
              options={CREW_SECTORS.map((s) => ({ value: s, label: SECTOR_CATALOG[s].shortLabel }))}
              selected={sectors}
              onToggle={(value) =>
                setSectors((current) =>
                  current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
                )
              }
            />
          ) : null}

          <ChipGroup
            single
            options={[
              { value: 'any', label: 'Any rate' },
              { value: '75000', label: '≤ $750' },
              { value: '120000', label: '≤ $1.2K' },
              { value: '200000', label: '≤ $2K' },
            ]}
            selected={[maxRate ? String(maxRate) : 'any']}
            onToggle={(value) => setMaxRate(value === 'any' ? null : Number(value))}
          />
        </Card>

        {market.loading && !market.data ? (
          <Loading label="Loading the marketplace" />
        ) : market.error ? (
          <ErrorNote message={market.error.message} onRetry={market.refetch} />
        ) : tab === 'crew' ? (
          crew.length === 0 ? (
            <EmptyState title="No crew match those filters" body="Try clearing the union filter or widening the rate band." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {crew.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(member)}
                  style={{ width: cardWidth as never }}
                >
                  <Card padding={0} style={{ overflow: 'hidden' }}>
                    <Photo uri={member.avatarUrl} seed={member.id} height={compact ? 130 : 150} rounded={0}>
                      <View style={{ position: 'absolute', top: space.sm, left: space.sm }}>
                        <Pill label={unionLabel(member.unionStatus)} tone="brand" size="sm" />
                      </View>
                    </Photo>
                    <Stack gap={space.xs} style={{ padding: space.md }}>
                      <Text variant="micro" tone="faint" upper numberOfLines={1}>
                        {member.primaryRole}
                      </Text>
                      <Text variant="subheading" numberOfLines={1}>
                        {member.displayName}
                      </Text>
                      <Row justify="space-between">
                        <Text variant="label" tone="success">
                          {rateLabel(member.dayRateCents ?? 0, 'day')}
                        </Text>
                        <Row gap={2}>
                          <Icon name="star" size={11} color={color.warning} />
                          <Text variant="caption" tone="muted">
                            {member.rating.toFixed(1)}
                          </Text>
                        </Row>
                      </Row>
                    </Stack>
                  </Card>
                </Pressable>
              ))}
            </View>
          )
        ) : gear.length === 0 ? (
          <EmptyState title="No gear listed in range" />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {gear.map((listing) => (
              <Pressable
                key={listing.id}
                accessibilityRole="button"
                onPress={() => setSelectedGear(listing)}
                style={{ width: cardWidth as never }}
              >
                <Card padding={0} style={{ overflow: 'hidden' }}>
                  <Photo uri={listing.imageUrl} seed={listing.id} height={compact ? 118 : 132} rounded={0}>
                    <View style={{ position: 'absolute', top: space.sm, left: space.sm }}>
                      <Pill label={titleCase(listing.category)} tone="outline" size="sm" />
                    </View>
                    {listing.insured ? (
                      <View style={{ position: 'absolute', top: space.sm, right: space.sm }}>
                        <Pill
                          label="Insured"
                          tone="success"
                          size="sm"
                          icon={<Icon name="shield" size={9} color={color.success} />}
                        />
                      </View>
                    ) : null}
                  </Photo>
                  <Stack gap={space.xs} style={{ padding: space.md }}>
                    <Text variant="subheading" numberOfLines={2}>
                      {listing.name}
                    </Text>
                    <Row justify="space-between">
                      <Text variant="label" tone="success">
                        {rateLabel(listing.dayRateCents, 'day')}
                      </Text>
                      <Row gap={2}>
                        <Icon name="star" size={11} color={color.warning} />
                        <Text variant="caption" tone="muted">
                          {listing.rating.toFixed(1)}
                        </Text>
                      </Row>
                    </Row>
                    <Text variant="micro" tone="faint" numberOfLines={1}>
                      {listing.location.label}
                    </Text>
                  </Stack>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </Stack>

      {/* ---------- Crew detail ---------- */}
      <Sheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.displayName ?? ''}
        subtitle={selected ? `${selected.primaryRole} · ${selected.location.label}` : undefined}
        footer={
          <Row gap={space.md}>
            <Button label="Close" variant="ghost" onPress={() => setSelected(null)} />
            <View style={{ flex: 1 }} />
            <Button label="Send direct pitch" onPress={() => setSelected(null)} />
          </Row>
        }
      >
        {selected ? (
          <Stack gap={space.lg}>
            <Photo uri={selected.avatarUrl} seed={selected.id} height={190} />
            <Row justify="space-between">
              <Stat label="Day rate" value={rateLabel(selected.dayRateCents ?? 0, 'day')} tone="success" />
              <Stat label="Rating" value={`★ ${selected.rating.toFixed(1)}`} align="center" />
              <Stat label="Bookings" value={String(selected.bookingsCompleted)} align="center" />
              <Stat label="Response" value={`${selected.responseScore}%`} align="flex-end" />
            </Row>
            <Divider />
            <Text variant="body" tone="muted">
              {selected.headline}
            </Text>
            <Row gap={space.xs} wrap>
              {selected.specialties.map((s) => (
                <Pill key={s} label={s} tone="outline" size="sm" />
              ))}
            </Row>
            <Row gap={space.xs} wrap>
              {selected.badges.map((badge) => (
                <Pill
                  key={badge}
                  label={titleCase(badge)}
                  tone="success"
                  size="sm"
                  icon={<Icon name="shield" size={9} color={color.success} />}
                />
              ))}
            </Row>
          </Stack>
        ) : null}
      </Sheet>

      {/* ---------- Gear detail ---------- */}
      <Sheet
        visible={Boolean(selectedGear)}
        onClose={() => setSelectedGear(null)}
        title={selectedGear?.name ?? ''}
        subtitle={selectedGear ? titleCase(selectedGear.category) : undefined}
        footer={
          <Row gap={space.md}>
            <Button label="Close" variant="ghost" onPress={() => setSelectedGear(null)} />
            <View style={{ flex: 1 }} />
            <Button
              label={selectedGear ? `Reserve · ${formatMoney(selectedGear.dayRateCents)}/day` : 'Reserve'}
              onPress={() => setSelectedGear(null)}
            />
          </Row>
        }
      >
        {selectedGear ? (
          <Stack gap={space.lg}>
            <Photo uri={selectedGear.imageUrl} seed={selectedGear.id} height={190} />
            <Row justify="space-between">
              <Stat label="Day rate" value={formatMoney(selectedGear.dayRateCents)} tone="success" />
              <Stat label="Rating" value={`★ ${selectedGear.rating.toFixed(1)}`} align="center" />
              <Stat
                label="Insurance"
                value={selectedGear.insured ? 'Verified' : 'None'}
                align="flex-end"
                tone={selectedGear.insured ? 'success' : 'danger'}
              />
            </Row>
            <Divider />
            <Row gap={space.sm}>
              <Icon name="pin" size={14} color={color.textFaint} />
              <Text variant="caption" tone="muted">
                {selectedGear.location.label}, {selectedGear.location.region}
              </Text>
            </Row>
            <Text variant="micro" tone="faint">
              Gear rentals settle through the same escrow rails as talent bookings: the rental is funded
              up front and released when the package is checked back in.
            </Text>
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}
