import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import type { CollabNote, CollabRoom, CollabRoomResponse } from '../../contracts';
import { LineChart, Waveform } from '../../design/charts';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import {
  Avatar,
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
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { api } from '../../lib/api';
import { relativeTime, timecode, titleCase } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

export default function Collab() {
  const { compact, contentWidth } = useResponsive();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0.34);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const rooms = useQuery<{ rooms: CollabRoom[] }>(
    (signal) => api.get<{ rooms: CollabRoom[] }>('/collab/rooms', undefined, signal),
    [],
  );
  const activeId = roomId ?? rooms.data?.rooms[0]?.id ?? null;

  const room = useQuery<CollabRoomResponse>(
    (signal) => api.get<CollabRoomResponse>(`/collab/rooms/${activeId}`, undefined, signal),
    [activeId],
    { enabled: Boolean(activeId) },
  );

  const post = useMutation(async (body: string, timecodeSeconds: number) =>
    api.post<{ note: CollabNote; notes: CollabNote[] }>(`/collab/rooms/${activeId}/notes`, {
      body,
      timecodeSeconds,
    }),
  );

  if (rooms.loading && !rooms.data) {
    return (
      <Screen title="Dailies" accent="Collaboration">
        <Loading label="Opening rooms" />
      </Screen>
    );
  }

  if (!room.data) {
    return (
      <Screen title="Dailies" accent="Collaboration">
        {room.error ? (
          <ErrorNote message={room.error.message} onRetry={room.refetch} />
        ) : rooms.data?.rooms.length === 0 ? (
          <EmptyState title="No collaboration rooms" body="Rooms are created when a cut is published for review." />
        ) : (
          <Loading />
        )}
      </Screen>
    );
  }

  const { room: active, notes } = room.data;
  const currentSeconds = playhead * active.durationSeconds;

  const player = (
    <Stack gap={space.lg}>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <Photo uri={active.posterUrl} seed={active.id} height={compact ? 200 : 280} rounded={0}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(14, 6, 18, 0.45)',
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play cut"
              onPress={() => setPlayhead((p) => (p >= 0.96 ? 0 : p + 0.08))}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(244, 63, 94, 0.92)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="play" size={23} color="#FFF" />
            </Pressable>
          </View>
          <Row justify="space-between" style={{ position: 'absolute', top: space.md, left: space.md, right: space.md }}>
            <Pill label={active.department.toUpperCase()} tone="accent" size="sm" />
            <Pill
              label={titleCase(active.status)}
              tone={active.status === 'approved' ? 'success' : active.status === 'blocked' ? 'danger' : 'warning'}
              size="sm"
            />
          </Row>
        </Photo>

        {/* Scrub bar */}
        <Stack gap={space.sm} style={{ padding: space.md, backgroundColor: color.surface }}>
          <Row gap={space.md} align="center">
            <Text variant="micro" tone="faint" mono>
              {timecode(currentSeconds)}
            </Text>
            <View style={{ flex: 1 }}>
              <Waveform seed={active.id} progress={playhead} height={26} />
            </View>
            <Text variant="micro" tone="faint" mono>
              {timecode(active.durationSeconds)}
            </Text>
          </Row>

          {/* Note markers pinned to their timecode */}
          <View style={{ height: 18, justifyContent: 'center' }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: color.surfaceHot }} />
            {notes.map((note) => (
              <Pressable
                key={note.id}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${timecode(note.timecodeSeconds)}`}
                onPress={() => setPlayhead(note.timecodeSeconds / active.durationSeconds)}
                style={{
                  position: 'absolute',
                  left: `${(note.timecodeSeconds / active.durationSeconds) * 100}%`,
                  width: 12,
                  height: 12,
                  marginLeft: -6,
                  borderRadius: 6,
                  backgroundColor: note.resolved ? color.success : color.accent,
                  borderWidth: 2,
                  borderColor: color.surface,
                }}
              />
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Row gap={space.xs}>
              {active.thumbnails.map((thumb, index) => (
                <Pressable
                  key={thumb}
                  accessibilityRole="button"
                  onPress={() => setPlayhead(index / Math.max(1, active.thumbnails.length - 1))}
                >
                  <Photo
                    uri={thumb}
                    seed={`${active.id}-t${index}`}
                    width={72}
                    height={42}
                    rounded={radius.xs}
                    style={{
                      borderWidth: 2,
                      borderColor:
                        Math.round(playhead * (active.thumbnails.length - 1)) === index
                          ? color.accent
                          : 'transparent',
                    }}
                  />
                </Pressable>
              ))}
            </Row>
          </ScrollView>
        </Stack>
      </Card>

      {/* Room switcher */}
      {rooms.data && rooms.data.rooms.length > 1 ? (
        <Row gap={space.sm} wrap>
          {rooms.data.rooms.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => setRoomId(r.id)}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: 6,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: r.id === active.id ? color.accentBorder : color.border,
                backgroundColor: r.id === active.id ? color.accentSoft : color.surfaceAlt,
              }}
            >
              <Text variant="caption" tone={r.id === active.id ? 'accent' : 'muted'}>
                {r.name}
              </Text>
            </Pressable>
          ))}
        </Row>
      ) : null}
    </Stack>
  );

  const notesPanel = (
    <Card style={{ gap: space.md, flex: compact ? undefined : 1 }}>
      <Row justify="space-between">
        <SectionTitle title="Notes" accent={String(notes.length)} />
        <Row gap={space.sm}>
          <Avatar name={active.supervisor.displayName} uri={active.supervisor.avatarUrl} size={24} />
          <Text variant="micro" tone="faint" upper>
            {active.supervisor.role}
          </Text>
        </Row>
      </Row>

      <Divider />

      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: compact ? 300 : 420 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: space.md }}
      >
        {notes.map((note) => (
          <Row key={note.id} gap={space.md} align="flex-start">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${timecode(note.timecodeSeconds)}`}
              onPress={() => setPlayhead(note.timecodeSeconds / active.durationSeconds)}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: radius.xs,
                backgroundColor: color.surfaceAlt,
                minWidth: 52,
                alignItems: 'center',
              }}
            >
              <Text variant="micro" tone="accent" mono>
                {timecode(note.timecodeSeconds)}
              </Text>
            </Pressable>
            <Avatar name={note.authorName} uri={note.authorAvatarUrl} size={28} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row justify="space-between">
                <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                  {note.authorName}
                  <Text variant="micro" tone="faint">
                    {'  '}
                    {note.authorRole}
                  </Text>
                </Text>
                <Text variant="micro" tone="faint">
                  {relativeTime(note.createdAt)}
                </Text>
              </Row>
              <Text variant="caption" tone="muted">
                {note.body}
              </Text>
              {note.resolved ? (
                <Row gap={4}>
                  <Icon name="check" size={11} color={color.success} strokeWidth={2.6} />
                  <Text variant="micro" tone="success" upper>
                    Resolved
                  </Text>
                </Row>
              ) : null}
            </View>
          </Row>
        ))}
      </ScrollView>

      <Divider />

      <Row gap={space.sm} align="flex-end">
        <View style={{ flex: 1 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Note at ${timecode(currentSeconds)}…`}
            placeholderTextColor={color.textFaint}
            multiline
            style={{
              backgroundColor: color.surfaceAlt,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: 10,
              color: color.text,
              minHeight: 42,
              maxHeight: 96,
            }}
            onSubmitEditing={async () => {
              if (!draft.trim()) return;
              const result = await post.mutate(draft.trim(), currentSeconds);
              if (result) {
                setDraft('');
                room.refetch();
              }
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post note"
          disabled={!draft.trim() || post.pending}
          onPress={async () => {
            if (!draft.trim()) return;
            const result = await post.mutate(draft.trim(), currentSeconds);
            if (result) {
              setDraft('');
              room.refetch();
            }
          }}
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.md,
            backgroundColor: draft.trim() ? color.brand : color.surfaceHot,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="send" size={17} color={draft.trim() ? '#FFF' : color.textFaint} />
        </Pressable>
      </Row>

      {post.error ? <ErrorNote message={post.error.message} /> : null}
    </Card>
  );

  return (
    <Screen
      title={active.department === 'vfx' ? 'VFX Collab' : 'Post Collab'}
      accent={active.projectTitle.toUpperCase()}
      onRefresh={room.refetch}
      refreshing={room.refreshing}
    >
      {compact ? (
        <Stack gap={space.xl}>
          {player}
          {notesPanel}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ width: Math.min(520, contentWidth * 0.55) }}>{player}</View>
          <View style={{ flex: 1 }}>{notesPanel}</View>
        </Row>
      )}
    </Screen>
  );
}
