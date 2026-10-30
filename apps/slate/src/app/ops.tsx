import { View } from 'react-native';

import { SLO, type OpsHealthResponse } from '../contracts';
import { Icon } from '../design/Icon';
import { Text } from '../design/Text';
import {
  Card,
  Divider,
  ErrorNote,
  Loading,
  Pill,
  Row,
  SectionTitle,
  Stack,
  Stat,
} from '../design/primitives';
import { color, radius, space } from '../design/tokens';
import { Screen } from '../features/shell/Shell';
import { useResponsive } from '../features/shell/useResponsive';
import { api } from '../lib/api';
import { API_BASE } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useQuery } from '../lib/query';

interface Health extends OpsHealthResponse {
  profiles: number;
  swipes: number;
  liveSubscribers: number;
}

const STATE_TONE = {
  healthy: 'success',
  degraded: 'warning',
  down: 'danger',
} as const;

export default function Ops() {
  const { columns } = useResponsive();

  const health = useQuery<Health>((signal) => api.get<Health>('/ops/health', undefined, signal), []);

  if (health.loading && !health.data) {
    return (
      <Screen title="Platform" accent="Health">
        <Loading label="Checking system status" />
      </Screen>
    );
  }
  if (health.error) {
    return (
      <Screen title="Platform" accent="Health">
        <ErrorNote message={health.error.message} onRetry={health.refetch} />
      </Screen>
    );
  }

  const data = health.data!;
  const ledgerOk = data.ledgerDriftCents === 0;
  const cardWidth = columns === 1 ? '100%' : `${100 / Math.min(2, columns) - 1}%`;

  return (
    <Screen title="Platform" accent="Health" onRefresh={health.refetch} refreshing={health.refreshing}>
      <Stack gap={space.xl}>
        <Card style={{ gap: space.lg }}>
          <Row justify="space-between">
            <View>
              <Text variant="micro" tone="faint" upper>
                Server region
              </Text>
              <Text variant="title">
                {data.region} · {data.cell}
              </Text>
            </View>
            <Pill label={`${data.uptimePct}% uptime`} tone="success" />
          </Row>
          <Divider />
          <Row justify="space-between" wrap>
            <Stat label="Talent profiles" value={data.profiles.toLocaleString()} />
            <Stat label="Swipes recorded" value={data.swipes.toLocaleString()} align="center" />
            <Stat label="Live SSE clients" value={String(data.liveSubscribers)} align="flex-end" />
          </Row>
          <Text variant="micro" tone="faint" mono numberOfLines={1}>
            {API_BASE}
          </Text>
        </Card>

        {/* ---------- System Speed & Health ---------- */}
        <Stack gap={space.md}>
          <SectionTitle title="System Speed & Health" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <SloCard
              width={cardWidth}
              label="Swipe feed speed"
              value={`${data.feedP95Ms} ms`}
              target={`< ${SLO.feedLatencyP95Ms} ms`}
              ok={data.feedP95Ms <= SLO.feedLatencyP95Ms}
            />
            <SloCard
              width={cardWidth}
              label="Peak swipe response"
              value={`${data.feedP99Ms} ms`}
              target={`< ${SLO.feedLatencyP99Ms} ms`}
              ok={data.feedP99Ms <= SLO.feedLatencyP99Ms}
            />
            <SloCard
              width={cardWidth}
              label="Urgent crew alerts"
              value={`${data.beaconFanoutMs} ms`}
              target={`< ${SLO.beaconFanoutMs} ms to 50k devices`}
              ok={data.beaconFanoutMs <= SLO.beaconFanoutMs}
            />
            <SloCard
              width={cardWidth}
              label="Account balance check"
              value={formatMoney(data.ledgerDriftCents, { cents: true })}
              target="Exactly $0.00 drift"
              ok={ledgerOk}
            />
          </View>
        </Stack>

        {/* ---------- Services ---------- */}
        <Card style={{ gap: space.md }}>
          <SectionTitle title="Core services" accent={String(data.services.length)} />
          {data.services.map((service) => (
            <Row key={service.name} justify="space-between">
              <Row gap={space.sm} style={{ flex: 1 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor:
                      service.state === 'healthy'
                        ? color.success
                        : service.state === 'degraded'
                          ? color.warning
                          : color.danger,
                  }}
                />
                <Text variant="caption" tone="muted">
                  {service.name}
                </Text>
              </Row>
              <Row gap={space.lg}>
                <Text variant="caption" mono tone="faint">
                  {service.latencyMs.toFixed(1)} ms
                </Text>
                <Pill label={service.state} tone={STATE_TONE[service.state]} size="sm" />
              </Row>
            </Row>
          ))}
        </Card>

        <Card variant="alt" style={{ gap: space.sm }}>
          <Row gap={space.sm}>
            <Icon name="alert" size={15} color={color.warning} />
            <Text variant="subheading">Local test server</Text>
          </Row>
          <Text variant="caption" tone="muted">
            This test version runs on a fast built-in database. All money calculations, payment escrow
            rules, and talent safety protections work exactly the same as in our full multi-region cloud setup.
          </Text>
        </Card>
      </Stack>
    </Screen>
  );
}

function SloCard({
  label,
  value,
  target,
  ok,
  width,
}: {
  label: string;
  value: string;
  target: string;
  ok: boolean;
  width: string;
}) {
  return (
    <View style={{ width: width as never }}>
      <Card style={{ gap: space.sm, borderColor: ok ? color.border : color.danger }}>
        <Row justify="space-between">
          <Text variant="micro" tone="faint" upper>
            {label}
          </Text>
          <Icon
            name={ok ? 'checkCircle' : 'alert'}
            size={14}
            color={ok ? color.success : color.danger}
          />
        </Row>
        <Text variant="numeric" tone={ok ? 'success' : 'danger'}>
          {value}
        </Text>
        <Text variant="micro" tone="faint">
          Target {target}
        </Text>
      </Card>
    </View>
  );
}
