import { View } from 'react-native';

import { SLO, type FeedTelemetry } from '../../contracts';
import { Text } from '../../design/Text';
import { Card, Divider, Pill, Row, SectionTitle } from '../../design/primitives';
import { space } from '../../design/tokens';

/**
 * Live feed telemetry.
 *
 * Surfacing the retrieval pipeline in the product (rather than only in an ops
 * dashboard) is deliberate: casting teams ask "why am I not seeing anyone",
 * and the honest answer is usually that the hard filters cut the candidate set
 * before ranking ever ran.
 */
export function TelemetryCard({ telemetry }: { telemetry: FeedTelemetry }) {
  const withinSlo = telemetry.totalMs <= SLO.feedLatencyP95Ms;

  return (
    <Card variant="alt" style={{ gap: space.md }}>
      <Row justify="space-between">
        <SectionTitle title="Search Speed & Stats" />
        <Pill
          label={withinSlo ? `Fast (< ${SLO.feedLatencyP95Ms}ms)` : 'Normal'}
          tone={withinSlo ? 'success' : 'warning'}
          size="sm"
        />
      </Row>

      <Row justify="space-between" wrap>
        <Metric label="Profiles checked" value={String(telemetry.candidatesRetrieved)} />
        <Metric label="Matches found" value={String(telemetry.candidatesAfterHardFilter)} />
        <Metric label="Areas searched" value={telemetry.cellsScanned.toLocaleString()} />
      </Row>

      <Divider />

      <Row justify="space-between" wrap>
        <Metric label="AI match" value={`${telemetry.vectorSearchMs.toFixed(1)}ms`} />
        <Metric label="Sorting" value={`${telemetry.rerankMs.toFixed(1)}ms`} />
        <Metric label="Total time" value={`${telemetry.totalMs.toFixed(1)}ms`} tone="success" />
      </Row>

      <Text variant="micro" tone="faint" numberOfLines={1}>
        Results updated live based on your filters and location.
      </Text>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success';
}) {
  return (
    <View style={{ gap: 1 }}>
      <Text variant="micro" tone="faint" upper>
        {label}
      </Text>
      <Text variant="subheading" tone={tone} mono>
        {value}
      </Text>
    </View>
  );
}
