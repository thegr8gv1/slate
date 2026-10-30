import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import type {
  EscrowAgreement,
  EscrowResponse,
  LedgerBalance,
  LedgerEntry,
  Project,
} from '../../contracts';
import { MilestoneTrack, type TrackStep } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Segmented } from '../../design/Segmented';
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
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { bpsToPct, formatMoney, relativeTime, shortDate, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

type Tab = 'payable' | 'receivable' | 'roster';

interface EscrowDetail {
  escrow: EscrowAgreement;
  ledger: LedgerEntry[];
  balances: LedgerBalance[];
  project: Project | null;
}

const STATE_TONE: Record<EscrowAgreement['state'], 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  offer_accepted: 'neutral',
  escrow_funded: 'brand',
  checked_in: 'brand',
  wrap_signed: 'success',
  paid_out: 'success',
  dispute_raised: 'danger',
  refunded: 'warning',
  cancelled: 'neutral',
};

export default function EscrowSettlement() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { compact, contentWidth } = useResponsive();

  const [tab, setTab] = useState<Tab>('payable');
  const [openId, setOpenId] = useState<string | null>(params.id ?? null);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const list = useQuery<{
    payable: EscrowAgreement[];
    receivable: EscrowAgreement[];
    roster: EscrowAgreement[];
  }>(
    (signal) =>
      api.get<{ payable: EscrowAgreement[]; receivable: EscrowAgreement[]; roster: EscrowAgreement[] }>(
        '/escrows',
        undefined,
        signal,
      ),
    [],
  );

  const rows =
    tab === 'payable'
      ? list.data?.payable ?? []
      : tab === 'receivable'
        ? list.data?.receivable ?? []
        : list.data?.roster ?? [];

  useEffect(() => {
    if (!openId && rows.length > 0) setOpenId(rows[0].id);
  }, [rows, openId]);

  // Land on whichever lens actually has agreements for this account, so an
  // agency does not open to an empty "paying" tab it will never use.
  useEffect(() => {
    if (!list.data) return;
    if (list.data.payable.length > 0) return;
    if (list.data.receivable.length > 0) setTab('receivable');
    else if (list.data.roster.length > 0) setTab('roster');
  }, [list.data]);

  const detail = useQuery<EscrowDetail>(
    (signal) => api.get<EscrowDetail>(`/escrows/${openId}`, undefined, signal),
    [openId],
    { enabled: Boolean(openId) },
  );

  const act = useMutation(async (action: string, extra: Record<string, unknown> = {}) =>
    api.post<EscrowResponse>(`/escrows/${openId}/actions`, { action, ...extra }),
  );

  const applyResult = (result: EscrowResponse | null) => {
    if (!result) return;
    detail.setData((current) =>
      current ? { ...current, escrow: result.escrow, ledger: result.ledger, balances: result.balances } : current,
    );
    list.refetch();
  };

  const escrow = detail.data?.escrow;

  const listPanel = (
    <Stack gap={space.md}>
      <Segmented<Tab>
        value={tab}
        onChange={(next) => {
          setTab(next);
          setOpenId(null);
        }}
        options={[
          { value: 'payable', label: 'Paying', badge: list.data?.payable.length ?? 0 },
          { value: 'receivable', label: 'Receiving', badge: list.data?.receivable.length ?? 0 },
          ...(list.data?.roster.length
            ? [{ value: 'roster' as const, label: 'Roster', badge: list.data.roster.length }]
            : []),
        ]}
      />

      {list.loading && !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No escrow agreements"
          body="Escrows open from the project board when an offer is accepted."
        />
      ) : (
        rows.map((row) => (
          <Pressable key={row.id} accessibilityRole="button" onPress={() => setOpenId(row.id)}>
            <Card
              padding={space.md}
              style={{ borderColor: openId === row.id ? color.accentBorder : color.border, gap: space.sm }}
            >
              <Row gap={space.md}>
                <Avatar name={row.talentDisplayName} uri={row.talentAvatarUrl} size={36} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {row.talentDisplayName}
                  </Text>
                  <Text variant="micro" tone="faint" numberOfLines={1} upper>
                    {row.role} · {row.projectTitle}
                  </Text>
                </View>
                <Stack gap={2} style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" tone="success">
                    {formatMoney(row.grossCents)}
                  </Text>
                  <Pill label={titleCase(row.state)} tone={STATE_TONE[row.state]} size="sm" />
                </Stack>
              </Row>
            </Card>
          </Pressable>
        ))
      )}
    </Stack>
  );

  const detailPanel = !escrow ? (
    openId ? (
      <Loading label="Loading escrow" />
    ) : (
      <EmptyState title="Select an escrow" body="Milestones, payment breakdown, and transaction records will appear here." />
    )
  ) : (
    <Stack gap={space.lg}>
      {/* ---------- Header ---------- */}
      <Card style={{ gap: space.lg }}>
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <Text variant="micro" tone="faint" upper>
              Project
            </Text>
            <Text variant="title" numberOfLines={1}>
              {escrow.projectTitle}
            </Text>
          </View>
          <Pill label={titleCase(escrow.state)} tone={STATE_TONE[escrow.state]} />
        </Row>

        <Row gap={space.lg} align="flex-start" wrap>
          <Card variant="alt" padding={space.md} style={{ flex: 1, minWidth: 190, gap: space.sm }}>
            <Row gap={space.md}>
              <Avatar name={escrow.talentDisplayName} uri={escrow.talentAvatarUrl} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="micro" tone="faint" upper>
                  Talent
                </Text>
                <Text variant="subheading" numberOfLines={1}>
                  {escrow.talentDisplayName}
                </Text>
              </View>
            </Row>
            <Divider />
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Role
              </Text>
              <Text variant="caption">{escrow.role}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Rate
              </Text>
              <Text variant="caption">
                {formatMoney(escrow.rateCents)}/{escrow.rateUnit === 'week' ? 'wk' : escrow.rateUnit}
              </Text>
            </Row>
          </Card>

          <Card variant="alt" padding={space.md} style={{ flex: 1, minWidth: 190, gap: space.sm }}>
            <Text variant="micro" tone="faint" upper>
              Escrow balance
            </Text>
            <Text variant="display" tone="success" style={{ fontSize: 26 }}>
              {formatMoney(escrow.fundedCents - escrow.releasedCents)}
            </Text>
            <Divider />
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Funded
              </Text>
              <Text variant="caption">{formatMoney(escrow.fundedCents)}</Text>
            </Row>
            <Row justify="space-between">
              <Text variant="micro" tone="faint" upper>
                Released
              </Text>
              <Text variant="caption">{formatMoney(escrow.releasedCents)}</Text>
            </Row>
          </Card>
        </Row>
      </Card>

      {/* ---------- Milestones ---------- */}
      <Card style={{ gap: space.lg }}>
        <SectionTitle title="Transaction progress" accent={formatMoney(escrow.grossCents)} />
        <MilestoneTrack steps={trackFor(escrow)} />

        <Divider />

        <Stack gap={space.sm}>
          {escrow.milestones.map((milestone) => (
            <Row key={milestone.id} justify="space-between" align="center">
              <Row gap={space.sm} style={{ flex: 1 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: milestone.signedOffAt ? color.success : color.surfaceHot,
                  }}
                >
                  {milestone.signedOffAt ? (
                    <Icon name="check" size={11} color="#06231A" strokeWidth={3} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" numberOfLines={1}>
                    {milestone.label}
                  </Text>
                  <Text variant="micro" tone="faint">
                    {milestone.signedOffAt
                      ? `Signed ${relativeTime(milestone.signedOffAt)}`
                      : `Due ${shortDate(milestone.dueAt)}`}
                    {milestone.releaseBps > 0 ? ` · releases ${bpsToPct(milestone.releaseBps)}` : ''}
                  </Text>
                </View>
              </Row>
              {!milestone.signedOffAt && escrow.state !== 'offer_accepted' && escrow.state !== 'paid_out' ? (
                <Button
                  label="Sign off"
                  size="sm"
                  variant="secondary"
                  loading={act.pending}
                  onPress={async () =>
                    applyResult(await act.mutate('sign_milestone', { milestoneId: milestone.id }))
                  }
                />
              ) : null}
            </Row>
          ))}
        </Stack>
      </Card>

      {/* ---------- Splits ---------- */}
      <Card style={{ gap: space.md }}>
        <SectionTitle title="Payout split" accent="At wrap" />
        {escrow.splits.map((split) => (
          <Row key={split.party} justify="space-between">
            <Row gap={space.sm} style={{ flex: 1 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    split.party === 'talent'
                      ? color.success
                      : split.party === 'agency'
                        ? color.brand
                        : split.party === 'platform'
                          ? color.accent
                          : color.warning,
                }}
              />
              <Text variant="caption" tone="muted">
                {split.label}
              </Text>
            </Row>
            <Row gap={space.lg}>
              <Text variant="caption" tone="faint">
                {bpsToPct(split.bps)}
              </Text>
              <Text variant="caption" style={{ minWidth: 78, textAlign: 'right' }}>
                {formatMoney(split.amountCents)}
              </Text>
            </Row>
          </Row>
        ))}
        <Divider />
        <Row justify="space-between">
          <Text variant="subheading">Total</Text>
          <Text variant="subheading" tone="success">
            {formatMoney(escrow.splits.reduce((sum, s) => sum + s.amountCents, 0))}
          </Text>
        </Row>
      </Card>

      {/* ---------- Ledger ---------- */}
      <Card style={{ gap: space.md }}>
        <SectionTitle title="Payment records" accent={`${detail.data?.ledger.length ?? 0} entries`} />
        {(detail.data?.ledger ?? []).length === 0 ? (
          <Text variant="caption" tone="faint">
            No transactions yet — entries will appear once the payment is funded.
          </Text>
        ) : (
          <Stack gap={space.sm}>
            {(detail.data?.ledger ?? []).map((entry) => (
              <Row key={entry.id} justify="space-between" align="flex-start">
                <View style={{ flex: 1 }}>
                  <Text variant="micro" tone="muted" numberOfLines={1}>
                    #{entry.seq} · {entry.reason}
                  </Text>
                  <Text variant="micro" tone="faint" mono numberOfLines={1}>
                    {shortAccount(entry.debitAccount)} → {shortAccount(entry.creditAccount)}
                  </Text>
                </View>
                <Text variant="caption" mono>
                  {formatMoney(entry.amountCents)}
                </Text>
              </Row>
            ))}
          </Stack>
        )}
      </Card>

      {act.error ? <ErrorNote message={act.error.message} /> : null}

      {/* ---------- Actions ---------- */}
      <Row gap={space.md} wrap>
        {escrow.state === 'offer_accepted' ? (
          <Button
            label={`Fund escrow · ${formatMoney(escrow.grossCents)}`}
            loading={act.pending}
            onPress={async () => applyResult(await act.mutate('fund'))}
          />
        ) : null}
        {escrow.state === 'escrow_funded' ? (
          <Button
            label="Confirm on-set check-in"
            loading={act.pending}
            onPress={async () => applyResult(await act.mutate('check_in'))}
          />
        ) : null}
        {['checked_in', 'wrap_signed'].includes(escrow.state) ? (
          <Button
            label="Release final payout"
            loading={act.pending}
            onPress={async () => applyResult(await act.mutate('release'))}
          />
        ) : null}
        {!['paid_out', 'refunded', 'cancelled', 'dispute_raised'].includes(escrow.state) ? (
          <Button label="Raise dispute" variant="secondary" onPress={() => setDisputeOpen(true)} />
        ) : null}
        {escrow.state === 'dispute_raised' ? (
          <>
            <Button
              label="Resolve — release to talent"
              loading={act.pending}
              onPress={async () =>
                applyResult(await act.mutate('resolve_dispute', { resolution: 'release_to_talent' }))
              }
            />
            <Button
              label="Resolve — split"
              variant="secondary"
              loading={act.pending}
              onPress={async () => applyResult(await act.mutate('resolve_dispute', { resolution: 'split' }))}
            />
          </>
        ) : null}
      </Row>

      {escrow.state === 'dispute_raised' && escrow.disputeDeadlineAt ? (
        <Card style={{ borderColor: color.danger, gap: space.sm }}>
          <Row gap={space.sm}>
            <Icon name="alert" size={16} color={color.danger} />
            <Text variant="subheading" tone="danger">
              Arbitration window open
            </Text>
          </Row>
          <Text variant="caption" tone="muted">
            Funds are frozen in a dispute hold. A Slate adjudicator is paged if the parties do not agree
            by {relativeTime(escrow.disputeDeadlineAt)}.
          </Text>
        </Card>
      ) : null}
    </Stack>
  );

  return (
    <Screen title="Transaction" accent="Escrow settlement" onRefresh={list.refetch} refreshing={list.refreshing}>
      {compact ? (
        <Stack gap={space.xl}>
          {listPanel}
          {detailPanel}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ width: Math.min(340, contentWidth * 0.34) }}>{listPanel}</View>
          <View style={{ flex: 1 }}>{detailPanel}</View>
        </Row>
      )}

      <Sheet
        visible={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title="Raise a dispute"
        subtitle="Freezes the remaining escrow balance"
        footer={
          <Row gap={space.md}>
            <Button label="Cancel" variant="ghost" onPress={() => setDisputeOpen(false)} />
            <View style={{ flex: 1 }} />
            <Button
              label="Freeze funds & open dispute"
              variant="danger"
              loading={act.pending}
              onPress={async () => {
                applyResult(await act.mutate('raise_dispute', { note: 'Raised from settlement screen' }));
                setDisputeOpen(false);
              }}
            />
          </Row>
        }
      >
        <Stack gap={space.md}>
          <Text variant="body" tone="muted">
            Everything still held in escrow moves to a dispute hold account. No milestone can release
            against it until the dispute is resolved.
          </Text>
          <Text variant="body" tone="muted">
            Both parties have 72 hours to agree an outcome. After that a Slate adjudicator reviews the
            call sheet, check-in records and deliverables, and rules.
          </Text>
        </Stack>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function trackFor(escrow: EscrowAgreement): TrackStep[] {
  const order: EscrowAgreement['milestones'][number]['kind'][] = ['deposit', 'check_in', 'wrap', 'final_payout'];
  const ordered = order
    .map((kind) => escrow.milestones.find((m) => m.kind === kind))
    .filter((m): m is EscrowAgreement['milestones'][number] => Boolean(m));
  const firstOpen = ordered.findIndex((m) => !m.signedOffAt);

  return ordered.map((milestone, index) => ({
    label: milestone.label,
    sub: milestone.releaseBps > 0 ? bpsToPct(milestone.releaseBps) : undefined,
    state: milestone.signedOffAt ? 'done' : index === firstOpen ? 'current' : 'todo',
  }));
}

/** Ledger account ids are long by design; the UI only needs the tail. */
function shortAccount(account: string): string {
  const parts = account.split(':');
  if (parts.length < 3) return parts.join(':');
  return `${parts[1]}:…${parts[2].slice(-6)}`;
}
