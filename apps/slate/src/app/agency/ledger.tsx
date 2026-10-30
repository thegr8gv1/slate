import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { SLO, type LedgerBalance, type LedgerEntry } from '../../contracts';
import { BarChart } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { ChipGroup } from '../../design/Segmented';
import { Text } from '../../design/Text';
import {
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
import { formatMoney, relativeTime } from '../../lib/format';
import { useQuery } from '../../lib/query';

interface LedgerResponse {
  entries: LedgerEntry[];
  balances: LedgerBalance[];
  driftCents: number;
  throughputTps: number;
  sloTps: number;
}

const ACCOUNT_FILTERS = [
  { value: 'all', label: 'All accounts' },
  { value: 'liability:escrow', label: 'Escrow' },
  { value: 'liability:talent', label: 'Talent' },
  { value: 'liability:agency', label: 'Agency' },
  { value: 'revenue:platform_fee', label: 'Platform fee' },
  { value: 'liability:union_and_tax', label: 'Union & tax' },
];

export default function Ledger() {
  const { compact, contentWidth } = useResponsive();
  const [filter, setFilter] = useState('all');

  const ledger = useQuery<LedgerResponse>(
    (signal) => api.get<LedgerResponse>('/ledger', undefined, signal),
    [],
  );

  const entries = useMemo(() => {
    const all = ledger.data?.entries ?? [];
    if (filter === 'all') return [...all].reverse();
    return [...all]
      .filter((e) => e.debitAccount.startsWith(filter) || e.creditAccount.startsWith(filter))
      .reverse();
  }, [ledger.data, filter]);

  if (ledger.loading && !ledger.data) {
    return (
      <Screen title="Ledger" accent="Transaction History">
        <Loading label="Loading transactions" />
      </Screen>
    );
  }
  if (ledger.error) {
    return (
      <Screen title="Ledger" accent="Transaction History">
        <ErrorNote message={ledger.error.message} onRetry={ledger.refetch} />
      </Screen>
    );
  }

  const data = ledger.data!;
  const balanced = data.driftCents === 0;

  const summary = (
    <Stack gap={space.lg}>
      <Card
        style={{
          gap: space.lg,
          borderColor: balanced ? color.success : color.danger,
          borderWidth: 1.5,
        }}
      >
        <Row justify="space-between">
          <SectionTitle title="Account Balance Check" />
          <Pill
            label={balanced ? '100% Balanced' : 'MISMATCH DETECTED'}
            tone={balanced ? 'success' : 'danger'}
            size="sm"
            icon={
              <Icon
                name={balanced ? 'checkCircle' : 'alert'}
                size={10}
                color={balanced ? color.success : color.danger}
              />
            }
          />
        </Row>

        <Row justify="space-between">
          <Stat
            label="Discrepancy"
            value={formatMoney(data.driftCents, { cents: true })}
            tone={balanced ? 'success' : 'danger'}
          />
          <Stat label="Entries" value={String(data.entries.length)} align="center" />
          <Stat
            label="Throughput"
            value={`${data.throughputTps.toLocaleString()} tps`}
            align="flex-end"
          />
        </Row>

        <Divider />

        <Text variant="micro" tone="faint">
          Every movement books an equal debit and credit, so the sum across all accounts must be exactly
          zero. Anything else means corruption. There is no UPDATE or DELETE path to this table —
          corrections are posted as compensating entries. Target throughput is{' '}
          {SLO.ledgerTps.toLocaleString()} tps with zero drift.
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Account balances" accent={String(data.balances.length)} />
        {data.balances.length === 0 ? (
          <Text variant="caption" tone="faint">
            No postings yet.
          </Text>
        ) : (
          <Stack gap={space.sm}>
            {data.balances.map((balance) => (
              <Row key={balance.account} justify="space-between" align="flex-start">
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {balance.label}
                  </Text>
                  <Text variant="micro" tone="faint" mono numberOfLines={1}>
                    {balance.account}
                  </Text>
                </View>
                <Text
                  variant="caption"
                  mono
                  tone={balance.balanceCents >= 0 ? 'success' : 'danger'}
                  style={{ minWidth: 96, textAlign: 'right' }}
                >
                  {formatMoney(balance.balanceCents)}
                </Text>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );

  const journal = (
    <Stack gap={space.lg}>
      <Card variant="alt" style={{ gap: space.md }}>
        <SectionTitle title="Filter" />
        <ChipGroup
          single
          options={ACCOUNT_FILTERS}
          selected={[filter]}
          onToggle={setFilter}
        />
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Journal" accent={`${entries.length} entries`} />
        {entries.length === 0 ? (
          <EmptyState title="No entries for this filter" />
        ) : (
          <Stack gap={space.md}>
            {entries.map((entry) => (
              <View key={entry.id}>
                <Row justify="space-between" align="flex-start">
                  <Row gap={space.sm} style={{ flex: 1 }}>
                    <View
                      style={{
                        minWidth: 34,
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                        borderRadius: radius.xs,
                        backgroundColor: color.surfaceAlt,
                        alignItems: 'center',
                      }}
                    >
                      <Text variant="micro" tone="faint" mono>
                        #{entry.seq}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="caption" numberOfLines={2}>
                        {entry.reason}
                      </Text>
                      <Row gap={space.xs} style={{ marginTop: 2 }}>
                        <Text variant="micro" tone="danger" mono numberOfLines={1}>
                          DR {shortAccount(entry.debitAccount)}
                        </Text>
                        <Text variant="micro" tone="faint">
                          →
                        </Text>
                        <Text variant="micro" tone="success" mono numberOfLines={1}>
                          CR {shortAccount(entry.creditAccount)}
                        </Text>
                      </Row>
                    </View>
                  </Row>
                  <Stack gap={1} style={{ alignItems: 'flex-end' }}>
                    <Text variant="caption" mono>
                      {formatMoney(entry.amountCents)}
                    </Text>
                    <Text variant="micro" tone="faint">
                      {relativeTime(entry.createdAt)}
                    </Text>
                  </Stack>
                </Row>
                <Divider style={{ marginTop: space.md }} />
              </View>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );

  return (
    <Screen title="Ledger" accent="Double-entry" onRefresh={ledger.refetch} refreshing={ledger.refreshing}>
      {compact ? (
        <Stack gap={space.xl}>
          {summary}
          {journal}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ width: Math.min(360, contentWidth * 0.36) }}>{summary}</View>
          <View style={{ flex: 1 }}>{journal}</View>
        </Row>
      )}
    </Screen>
  );
}

function shortAccount(account: string): string {
  const parts = account.split(':');
  if (parts.length < 3) return account;
  return `${parts[1]}:…${parts[2].slice(-6)}`;
}
