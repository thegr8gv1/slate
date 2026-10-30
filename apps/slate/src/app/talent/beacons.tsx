import { useState } from 'react';
import { View } from 'react-native';

import { BEACON, type Beacon, type ClaimBeaconResponse } from '../../contracts';
import { GeoMap } from '../../design/GeoMap';
import { Icon } from '../../design/Icon';
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
  Stat,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { clockTime, distanceLabel, formatMoney, hoursUntil, relativeTime } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';
import { useSession } from '../../lib/session';

const CLAIM_COPY: Record<NonNullable<ClaimBeaconResponse['reason']>, string> = {
  already_claimed: 'Another crew member confirmed first. The position is now filled.',
  expired: 'This urgent call expired before anyone confirmed.',
  out_of_range: 'You are outside the travel area for this call.',
  not_eligible: 'Your profile role does not match what this urgent call needs.',
};

export default function TalentBeacons() {
  const { profile } = useSession();
  const { compact } = useResponsive();
  const [selected, setSelected] = useState<Beacon | null>(null);
  const [result, setResult] = useState<ClaimBeaconResponse | null>(null);

  const beacons = useQuery<{ beacons: Beacon[] }>(
    (signal) => api.get<{ beacons: Beacon[] }>('/beacons', undefined, signal),
    [],
  );

  const claim = useMutation(async (beaconId: string) =>
    api.post<ClaimBeaconResponse>(`/beacons/${beaconId}/claim`, {}),
  );

  const list = beacons.data?.beacons ?? [];

  return (
    <Screen
      title="Set-Beacon"
      accent="Emergency calls"
      onRefresh={beacons.refetch}
      refreshing={beacons.refreshing}
    >
      <Stack gap={space.xl}>
        <Card variant="alt" style={{ gap: space.md }}>
          <Row gap={space.md}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color.accentSoft,
              }}
            >
              <Icon name="zap" size={19} color={color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">You are on the urgent crew alert list</Text>
              <Text variant="micro" tone="faint">
                When a set needs someone immediately, an alert goes out to nearby crew. First to confirm
                books the job with secured escrow payment.
              </Text>
            </View>
          </Row>
          <Divider />
          <Row justify="space-between">
            <Stat label="Your radius" value={`${profile?.travelRadiusMiles ?? BEACON.defaultRadiusMiles} mi`} />
            <Stat label="Emergency rate" value={`${BEACON.defaultRateMultiplier}×`} align="center" tone="success" />
            <Stat label="Claim window" value={`${BEACON.ttlMinutes / 60}h`} align="flex-end" />
          </Row>
        </Card>

        {beacons.loading && !beacons.data ? (
          <Loading label="Checking for live beacons" />
        ) : beacons.error ? (
          <ErrorNote message={beacons.error.message} onRetry={beacons.refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No live beacons right now"
            body="When a production loses a crew member inside 24 hours of call time, every eligible profile in range gets a critical push. Keep notifications on."
            icon={<Icon name="zap" size={26} color={color.textFaint} />}
          />
        ) : (
          <Stack gap={space.md}>
            <SectionTitle title="Broadcasting now" accent={String(list.length)} />
            {list.map((beacon) => (
              <BeaconCard
                key={beacon.id}
                beacon={beacon}
                distanceMiles={
                  profile ? haversine(profile.location, beacon.origin) : beacon.radiusMiles
                }
                onOpen={() => {
                  setResult(null);
                  setSelected(beacon);
                }}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Sheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.role} needed` : ''}
        subtitle={selected ? `Call ${clockTime(selected.callTime)} · ${hoursUntil(selected.callTime)} out` : undefined}
        footer={
          selected && !result?.claimed ? (
            <Button
              label="Claim this beacon"
              full
              size="lg"
              loading={claim.pending}
              onPress={async () => {
                const response = await claim.mutate(selected.id);
                if (response) {
                  setResult(response);
                  beacons.refetch();
                }
              }}
            />
          ) : (
            <Button label="Done" variant="secondary" full onPress={() => setSelected(null)} />
          )
        }
      >
        {selected ? (
          <Stack gap={space.lg}>
            <GeoMap
              center={selected.origin}
              spanMiles={selected.radiusMiles * 2.4}
              radiusMiles={selected.radiusMiles}
              height={compact ? 220 : 260}
              label={selected.origin.label}
              markers={[
                { id: 'origin', lat: selected.origin.lat, lng: selected.origin.lng, kind: 'beacon', selected: true },
                ...(profile
                  ? [{ id: 'me', lat: profile.location.lat, lng: profile.location.lng, kind: 'talent' as const }]
                  : []),
              ]}
            />

            <Card variant="alt" style={{ gap: space.md }}>
              <Row justify="space-between">
                <Stat label="Emergency rate" value={formatMoney(selected.payoutCents)} tone="success" />
                <Stat
                  label="Multiplier"
                  value={`${selected.rateMultiplier}×`}
                  sub={`base ${formatMoney(selected.baseRateCents)}`}
                  align="center"
                />
                <Stat label="Radius" value={`${selected.radiusMiles} mi`} align="flex-end" />
              </Row>
              <Divider />
              <Row justify="space-between">
                <Text variant="caption" tone="faint" upper>
                  Broadcast
                </Text>
                <Text variant="caption" tone="muted">
                  {selected.devicesTargeted} devices · {selected.cellsQueried.toLocaleString()} cells ·{' '}
                  {selected.fanoutMs}ms
                </Text>
              </Row>
              <Row justify="space-between">
                <Text variant="caption" tone="faint" upper>
                  Expires
                </Text>
                <Text variant="caption" tone="muted">
                  {relativeTime(selected.expiresAt)}
                </Text>
              </Row>
            </Card>

            {selected.notes ? (
              <Card variant="alt">
                <Text variant="body" tone="muted">
                  {selected.notes}
                </Text>
              </Card>
            ) : null}

            {result ? (
              result.claimed ? (
                <Card style={{ borderColor: color.success, gap: space.sm }}>
                  <Row gap={space.sm}>
                    <Icon name="checkCircle" size={19} color={color.success} />
                    <Text variant="subheading" tone="success">
                      You booked it
                    </Text>
                  </Row>
                  <Text variant="caption" tone="muted">
                    The contract has been generated and routed. Call time {clockTime(selected.callTime)} at{' '}
                    {selected.origin.label}.
                  </Text>
                </Card>
              ) : (
                <ErrorNote message={CLAIM_COPY[result.reason ?? 'already_claimed']} />
              )
            ) : null}

            {claim.error ? <ErrorNote message={claim.error.message} /> : null}
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function BeaconCard({
  beacon,
  distanceMiles,
  onOpen,
}: {
  beacon: Beacon;
  distanceMiles: number;
  onOpen: () => void;
}) {
  const urgent = Date.parse(beacon.callTime) - Date.now() < 6 * 3600_000;

  return (
    <Card style={{ gap: space.md, borderColor: urgent ? color.accentBorder : color.border }}>
      <Row justify="space-between">
        <Row gap={space.sm}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: color.accentSoft,
            }}
          >
            <Icon name="zap" size={16} color={color.accent} />
          </View>
          <View>
            <Text variant="heading" tone="accent" upper>
              {beacon.role} needed
            </Text>
            <Text variant="micro" tone="faint" upper>
              {hoursUntil(beacon.callTime)} · {beacon.origin.label}
            </Text>
          </View>
        </Row>
        <Pill label={distanceLabel(distanceMiles)} tone="outline" size="sm" />
      </Row>

      {beacon.notes ? (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {beacon.notes}
        </Text>
      ) : null}

      <Divider />

      <Row justify="space-between" align="center">
        <View>
          <Text variant="micro" tone="faint" upper>
            Emergency rate
          </Text>
          <Row gap={space.xs} align="baseline">
            <Text variant="subheading" tone="success">
              {formatMoney(beacon.payoutCents)}
            </Text>
            <Text variant="micro" tone="faint">
              {beacon.rateMultiplier}× base
            </Text>
          </Row>
        </View>
        <Button label="Review & claim" size="sm" onPress={onOpen} />
      </Row>
    </Card>
  );
}

/** Local copy so the list can show distance without another round-trip. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * 3958.7613 * Math.asin(Math.min(1, Math.sqrt(h)));
}
