import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import {
  BEACON,
  SECTORS,
  SECTOR_CATALOG,
  SLO,
  type Beacon,
  type BeaconCandidate,
  type BeaconDispatchResponse,
  type Project,
  type Sector,
} from '../../contracts';
import { GeoMap, MapCallout } from '../../design/GeoMap';
import { Icon } from '../../design/Icon';
import { ChipGroup } from '../../design/Segmented';
import { Text } from '../../design/Text';
import {
  Avatar,
  Button,
  Card,
  Divider,
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
import { clockTime, distanceLabel, formatMoney, hoursUntil, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

const CALL_OFFSETS = [
  { label: '3 hrs', hours: 3 },
  { label: '6 hrs', hours: 6 },
  { label: '12 hrs', hours: 12 },
  { label: 'Tomorrow', hours: 20 },
];

export default function SetBeacon() {
  const { compact, contentWidth } = useResponsive();

  const [sector, setSector] = useState<Sector>('camera_lighting');
  const [role, setRole] = useState('Gaffer');
  const [radiusMiles, setRadiusMiles] = useState<number>(BEACON.defaultRadiusMiles);
  const [multiplier, setMultiplier] = useState<number>(BEACON.defaultRateMultiplier);
  const [baseRate, setBaseRate] = useState('650');
  const [callHours, setCallHours] = useState(3);
  const [notes, setNotes] = useState('');
  const [dispatch, setDispatch] = useState<BeaconDispatchResponse | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<BeaconCandidate | null>(null);

  const projects = useQuery<{ projects: Project[] }>(
    (signal) => api.get<{ projects: Project[] }>('/projects', undefined, signal),
    [],
  );
  const live = useQuery<{ beacons: Beacon[] }>(
    (signal) => api.get<{ beacons: Beacon[] }>('/beacons', undefined, signal),
    [],
  );

  const project = projects.data?.projects[0] ?? null;
  const roles = SECTOR_CATALOG[sector].roles;

  const send = useMutation(async () =>
    api.post<BeaconDispatchResponse>('/beacons', {
      projectId: project?.id ?? '',
      role,
      sector,
      notes,
      radiusMiles,
      rateMultiplier: multiplier,
      baseRateCents: Math.round(Number(baseRate || '0') * 100),
      callTime: new Date(Date.now() + callHours * 3600_000).toISOString(),
    }),
  );

  const payout = Math.round(Number(baseRate || '0') * 100 * multiplier);

  const markers = useMemo(() => {
    if (!dispatch || !project) return [];
    return dispatch.candidates.map((candidate, index) => ({
      id: candidate.profileId,
      // The API returns distance, not coordinates, so fan the pins out on a
      // deterministic spiral at their true radius — the shape of the crowd is
      // what matters here, and exact addresses are not exposed pre-booking.
      lat: project.location.lat + (candidate.distanceMiles / 69) * Math.cos(index * 2.4),
      lng:
        project.location.lng +
        (candidate.distanceMiles / (69 * Math.cos((project.location.lat * Math.PI) / 180))) *
          Math.sin(index * 2.4),
      kind: 'crew' as const,
      label: candidate.displayName,
      selected: selectedCandidate?.profileId === candidate.profileId,
      onPress: () => setSelectedCandidate(candidate),
    }));
  }, [dispatch, project, selectedCandidate]);

  if (projects.loading && !projects.data) {
    return (
      <Screen title="Set-Beacon" accent="Emergency crew">
        <Loading />
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen title="Set-Beacon" accent="Emergency crew">
        <ErrorNote message="A beacon needs a project to broadcast from." />
      </Screen>
    );
  }

  const mapPanel = (
    <Stack gap={space.lg}>
      <View>
        <GeoMap
          center={project.location}
          spanMiles={radiusMiles * 2.6}
          radiusMiles={radiusMiles}
          height={compact ? 300 : 400}
          label={`${project.location.label} · ${radiusMiles} mi radius`}
          markers={markers}
        />
        {selectedCandidate ? (
          <View style={{ position: 'absolute', left: space.md, bottom: space.md, right: space.md }}>
            <MapCallout
              title={selectedCandidate.displayName}
              rows={[
                { label: 'Role', value: selectedCandidate.role },
                { label: 'Distance', value: distanceLabel(selectedCandidate.distanceMiles) },
                { label: 'Rating', value: `★ ${selectedCandidate.rating.toFixed(1)}` },
                { label: 'Responds in', value: `~${selectedCandidate.respondsInMinutes} min` },
              ]}
            />
          </View>
        ) : null}
      </View>

      {dispatch ? (
        <Card
          style={{
            gap: space.lg,
            borderColor: dispatch.dispatch.withinSlo ? color.success : color.warning,
            borderWidth: 1.5,
          }}
        >
          <Row justify="space-between">
            <Row gap={space.sm}>
              <Icon name="zap" size={17} color={color.accent} />
              <Text variant="heading">Urgent Alert Sent</Text>
            </Row>
            <Pill
              label={dispatch.dispatch.withinSlo ? 'Instant Alert' : 'Sent'}
              tone={dispatch.dispatch.withinSlo ? 'success' : 'warning'}
              size="sm"
            />
          </Row>

          <Row justify="space-between">
            <Stat label="Crew alerted" value={String(dispatch.dispatch.devicesTargeted)} tone="success" />
            <Stat label="Areas searched" value={dispatch.dispatch.cellsQueried.toLocaleString()} align="center" />
            <Stat label="Alert speed" value={`${dispatch.dispatch.fanoutMs}ms`} align="flex-end" />
          </Row>

          <Divider />

          <SectionTitle title="Nearby available crew" accent={String(dispatch.candidates.length)} />
          <Stack gap={space.sm}>
            {dispatch.candidates.slice(0, 6).map((candidate) => (
              <Pressable
                key={candidate.profileId}
                accessibilityRole="button"
                onPress={() => setSelectedCandidate(candidate)}
              >
                <Row gap={space.md}>
                  <Avatar name={candidate.displayName} uri={candidate.avatarUrl} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption">{candidate.displayName}</Text>
                    <Text variant="micro" tone="faint" upper>
                      {candidate.role} · ★ {candidate.rating.toFixed(1)}
                    </Text>
                  </View>
                  <Stack gap={1} style={{ alignItems: 'flex-end' }}>
                    <Text variant="caption" tone="accent">
                      {distanceLabel(candidate.distanceMiles)}
                    </Text>
                    <Text variant="micro" tone="faint">
                      ~{candidate.respondsInMinutes} min
                    </Text>
                  </Stack>
                </Row>
              </Pressable>
            ))}
          </Stack>

          <Text variant="micro" tone="faint">
            First to confirm claims the role. Everyone else receives a "role filled" push the moment the
            atomic claim lands — no double bookings.
          </Text>
        </Card>
      ) : null}

      {live.data && live.data.beacons.length > 0 ? (
        <Stack gap={space.md}>
          <SectionTitle title="Live beacons" accent={String(live.data.beacons.length)} />
          {live.data.beacons.map((beacon) => (
            <Card key={beacon.id} variant="alt" padding={space.md}>
              <Row justify="space-between">
                <View>
                  <Text variant="caption">{beacon.role}</Text>
                  <Text variant="micro" tone="faint">
                    Call {clockTime(beacon.callTime)} · {beacon.devicesTargeted} reached
                  </Text>
                </View>
                <Pill label={titleCase(beacon.state)} tone="accent" size="sm" />
              </Row>
            </Card>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );

  const form = (
    <Card style={{ gap: space.lg }}>
      <SectionTitle title="Send urgent crew call" accent={project.title.toUpperCase()} />

      <Stack gap={space.sm}>
        <Text variant="micro" tone="faint" upper>
          Department
        </Text>
        <ChipGroup
          single
          options={SECTORS.map((s) => ({ value: s, label: SECTOR_CATALOG[s].shortLabel }))}
          selected={[sector]}
          onToggle={(value) => {
            setSector(value);
            setRole(SECTOR_CATALOG[value].roles[0]);
          }}
        />
      </Stack>

      <Stack gap={space.sm}>
        <Text variant="micro" tone="faint" upper>
          Role needed
        </Text>
        <ChipGroup
          single
          options={roles.map((r) => ({ value: r, label: r }))}
          selected={[role]}
          onToggle={setRole}
        />
      </Stack>

      <Stack gap={space.sm}>
        <Row justify="space-between">
          <Text variant="micro" tone="faint" upper>
            Call time
          </Text>
          <Text variant="label" tone="accent">
            {hoursUntil(new Date(Date.now() + callHours * 3600_000).toISOString())}
          </Text>
        </Row>
        <ChipGroup
          single
          options={CALL_OFFSETS.map((o) => ({ value: String(o.hours), label: o.label }))}
          selected={[String(callHours)]}
          onToggle={(value) => setCallHours(Number(value))}
        />
      </Stack>

      <Stack gap={space.sm}>
        <Row justify="space-between">
          <Text variant="micro" tone="faint" upper>
            Broadcast radius
          </Text>
          <Text variant="label" tone="accent">
            {radiusMiles} mi
          </Text>
        </Row>
        <ChipGroup
          single
          options={[10, 25, 40, 60].map((r) => ({ value: String(r), label: `${r} mi` }))}
          selected={[String(radiusMiles)]}
          onToggle={(value) => setRadiusMiles(Number(value))}
        />
      </Stack>

      <Row gap={space.md}>
        <Stack gap={space.sm} style={{ flex: 1 }}>
          <Text variant="micro" tone="faint" upper>
            Base day rate
          </Text>
          <TextInput
            value={baseRate}
            onChangeText={setBaseRate}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="650"
            placeholderTextColor={color.textFaint}
            style={inputStyle}
          />
        </Stack>
        <Stack gap={space.sm} style={{ flex: 1 }}>
          <Text variant="micro" tone="faint" upper>
            Urgent bonus rate
          </Text>
          <ChipGroup
            single
            options={[1.25, 1.5, 2].map((m) => ({ value: String(m), label: `${m}×` }))}
            selected={[String(multiplier)]}
            onToggle={(value) => setMultiplier(Number(value))}
          />
        </Stack>
      </Row>

      <Stack gap={space.sm}>
        <Text variant="micro" tone="faint" upper>
          Notes for crew
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Night exteriors, 40k package on the truck. Park on 6th."
          placeholderTextColor={color.textFaint}
          style={[inputStyle, { minHeight: 76, textAlignVertical: 'top' }]}
        />
      </Stack>

      <Divider />

      <Row justify="space-between" align="center">
        <View>
          <Text variant="micro" tone="faint" upper>
            Payout at claim
          </Text>
          <Text variant="numeric" tone="success">
            {formatMoney(payout)}
          </Text>
        </View>
        <Text variant="micro" tone="faint" align="right" style={{ flex: 1, marginLeft: space.md }}>
          Held safely in escrow the moment a crew member confirms
        </Text>
      </Row>

      {send.error ? <ErrorNote message={send.error.message} /> : null}

      <Button
        label="Broadcast urgent alert"
        size="lg"
        full
        loading={send.pending}
        icon={<Icon name="zap" size={17} color="#FFF" />}
        onPress={async () => {
          const result = await send.mutate();
          if (result) {
            setDispatch(result);
            setSelectedCandidate(null);
            live.refetch();
          }
        }}
      />
    </Card>
  );

  return (
    <Screen title="Set-Beacon" accent="Emergency crew" onRefresh={live.refetch} refreshing={live.refreshing}>
      {compact ? (
        <Stack gap={space.xl}>
          {form}
          {mapPanel}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ flex: 1.15 }}>{mapPanel}</View>
          <View style={{ width: Math.min(400, contentWidth * 0.42) }}>{form}</View>
        </Row>
      )}
    </Screen>
  );
}

const inputStyle = {
  backgroundColor: color.surfaceAlt,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 11,
  color: color.text,
  fontSize: 14.5,
} as const;
