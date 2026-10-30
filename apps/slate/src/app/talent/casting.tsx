import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import type { CastingRoomResponse, Project, SelfTape, SideScript } from '../../contracts';
import { Icon } from '../../design/Icon';
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
  Toggle,
} from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';
import { Screen } from '../../features/shell/Shell';
import { useResponsive } from '../../features/shell/useResponsive';
import { Teleprompter } from '../../features/casting/Teleprompter';
import { Watermark } from '../../features/casting/Watermark';
import { api } from '../../lib/api';
import { relativeTime, timecode } from '../../lib/format';
import { useMutation, useQuery } from '../../lib/query';

const SEED_SIDE_ID = 'sid_seed';

export default function CastingRoom() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sideId?: string }>();
  const { compact, contentWidth } = useResponsive();

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [promptSpeed, setPromptSpeed] = useState(1);
  const [promptOn, setPromptOn] = useState(true);
  const [mirror, setMirror] = useState(true);

  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  /* The side id can arrive from a pitch deep link; otherwise fall back to the
     project's first published side so the room is never empty. */
  const projects = useQuery<{ projects: Project[] }>(
    (signal) => api.get<{ projects: Project[] }>('/projects', undefined, signal),
    [],
  );

  const sideId = params.sideId ?? null;
  const firstProjectId = projects.data?.projects[0]?.id ?? null;
  const discovered = useQuery<{ sides: SideScript[] }>(
    (signal) =>
      api.get<{ project: Project; sides: SideScript[] }>(
        `/projects/${firstProjectId ?? ''}`,
        undefined,
        signal,
      ),
    [firstProjectId],
    { enabled: !sideId && Boolean(firstProjectId) },
  );

  const resolvedSideId = sideId ?? discovered.data?.sides[0]?.id ?? null;

  const room = useQuery<CastingRoomResponse>(
    (signal) => api.get<CastingRoomResponse>(`/casting/sides/${resolvedSideId}`, undefined, signal),
    [resolvedSideId],
    { enabled: Boolean(resolvedSideId) },
  );

  const submit = useMutation(async (durationSeconds: number, note: string) =>
    api.post<{ take: SelfTape; takes: SelfTape[] }>('/casting/takes', {
      sideScriptId: resolvedSideId,
      durationSeconds,
      note,
    }),
  );

  /* Recording clock. Kept in JS rather than reading the camera because the
     web recorder does not expose a reliable elapsed time. */
  useEffect(() => {
    if (!recording || paused) return;
    const timer = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(timer);
  }, [recording, paused]);

  const needsPermission =
    Platform.OS !== 'web' && (!cameraPermission?.granted || !micPermission?.granted);

  if (!resolvedSideId && (projects.loading || discovered.loading)) {
    return (
      <Screen title="Casting Room" accent="Self-tape">
        <Loading label="Opening the room" />
      </Screen>
    );
  }

  if (room.error) {
    return (
      <Screen title="Casting Room" accent="Self-tape">
        <ErrorNote message={room.error.message} onRetry={room.refetch} />
      </Screen>
    );
  }

  if (!resolvedSideId || (!room.data && !room.loading)) {
    return (
      <Screen title="Casting Room" accent="Self-tape">
        <EmptyState
          title="No side assigned yet"
          body="When a casting director attaches a script side to a pitch, it opens here with the teleprompter ready."
          action={<Button label="Check inbox" onPress={() => router.push('/talent/inbox')} />}
        />
      </Screen>
    );
  }

  if (!room.data) {
    return (
      <Screen title="Casting Room" accent="Self-tape">
        <Loading label="Loading side" />
      </Screen>
    );
  }

  const { side, project, takes, watermark } = room.data;

  const viewfinder = (
    <Card padding={0} level={2} style={{ overflow: 'hidden' }}>
      <View style={{ height: compact ? 420 : 460, backgroundColor: color.bg }}>
        {Platform.OS !== 'web' && cameraPermission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="front"
            mode="video"
            mirror={mirror}
            videoQuality="1080p"
          />
        ) : (
          <WebViewfinder mirror={mirror} />
        )}

        {/* Confidential sides carry a moving, viewer-identifying watermark. */}
        {side.confidential ? <Watermark text={watermark.text} opacity={watermark.opacity} rotateDeg={watermark.rotateDeg} intervalMs={watermark.intervalMs} /> : null}

        {/* Recording chip */}
        <View style={{ position: 'absolute', top: space.md, left: 0, right: 0, alignItems: 'center' }}>
          <Row
            gap={space.xs}
            style={{
              backgroundColor: recording ? 'rgba(244, 63, 94, 0.92)' : 'rgba(38, 16, 48, 0.85)',
              paddingHorizontal: space.md,
              paddingVertical: 5,
              borderRadius: radius.pill,
            }}
          >
            {recording ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />
            ) : null}
            <Text variant="micro" upper style={{ color: '#FFF' }}>
              {recording ? (paused ? 'Paused' : 'Recording') : 'Standby'}
            </Text>
          </Row>
        </View>

        {/* Teleprompter */}
        {promptOn ? (
          <View style={{ position: 'absolute', left: space.md, right: space.md, bottom: space.xl }}>
            <Teleprompter
              body={side.body}
              scene={side.sceneNumber}
              character={side.character}
              running={recording && !paused}
              speed={promptSpeed}
            />
          </View>
        ) : null}

        {/* Timecode */}
        <View style={{ position: 'absolute', bottom: space.sm, left: 0, right: 0, alignItems: 'center' }}>
          <Text variant="label" mono style={{ color: 'rgba(255,255,255,0.85)' }}>
            {timecode(elapsed)}
          </Text>
        </View>
      </View>

      {/* Transport */}
      <Row justify="center" gap={space.xxl} style={{ paddingVertical: space.lg, backgroundColor: color.surface }}>
        <TransportButton
          label="Restart take"
          icon="rewind"
          onPress={() => {
            setElapsed(0);
            setPaused(false);
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
          onPress={() => {
            if (recording) {
              setRecording(false);
              setPaused(false);
            } else {
              setElapsed(0);
              setRecording(true);
            }
          }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 3,
            borderColor: color.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: recording ? 24 : 48,
              height: recording ? 24 : 48,
              borderRadius: recording ? 5 : 24,
              backgroundColor: color.danger,
            }}
          />
        </Pressable>
        <TransportButton
          label={paused ? 'Resume' : 'Pause'}
          icon={paused ? 'play' : 'pause'}
          disabled={!recording}
          onPress={() => setPaused((p) => !p)}
        />
      </Row>
    </Card>
  );

  const controls = (
    <Stack gap={space.lg}>
      {needsPermission ? (
        <Card variant="alt" style={{ gap: space.md, borderColor: color.warningSoft }}>
          <Text variant="subheading">Camera & microphone access needed</Text>
          <Text variant="caption" tone="muted">
            Your audition video is recorded privately on your device. Nothing is sent until you review and submit it.
          </Text>
          <Button
            label="Allow camera & mic"
            onPress={() => {
              void requestCamera();
              void requestMic();
            }}
          />
        </Card>
      ) : null}

      <Card style={{ gap: space.lg }}>
        <SectionTitle title="Teleprompter" />
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text variant="subheading">Show prompter</Text>
            <Text variant="micro" tone="faint">
              Scrolls automatically while recording
            </Text>
          </View>
          <Toggle value={promptOn} onChange={setPromptOn} label="Show prompter" />
        </Row>
        <Divider />
        <Stack gap={space.sm}>
          <Row justify="space-between">
            <Text variant="caption" tone="muted">
              Scroll speed
            </Text>
            <Text variant="caption" tone="accent">
              {promptSpeed.toFixed(1)}×
            </Text>
          </Row>
          <Row gap={space.sm}>
            {[0.5, 0.8, 1, 1.3, 1.7].map((speed) => (
              <Pressable
                key={speed}
                accessibilityRole="radio"
                accessibilityState={{ checked: promptSpeed === speed }}
                onPress={() => setPromptSpeed(speed)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  alignItems: 'center',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: promptSpeed === speed ? color.accentBorder : color.border,
                  backgroundColor: promptSpeed === speed ? color.accentSoft : color.surfaceAlt,
                }}
              >
                <Text variant="caption" tone={promptSpeed === speed ? 'accent' : 'muted'}>
                  {speed}×
                </Text>
              </Pressable>
            ))}
          </Row>
        </Stack>
        <Divider />
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Text variant="subheading">Mirror preview</Text>
            <Text variant="micro" tone="faint">
              Recording is never mirrored
            </Text>
          </View>
          <Toggle value={mirror} onChange={setMirror} label="Mirror preview" />
        </Row>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Audition Script" accent={`Scene ${side.sceneNumber}`} />
        <Row gap={space.xs} wrap>
          <Pill label={project.title} tone="brand" size="sm" />
          <Pill label={side.character} tone="outline" size="sm" />
          {side.confidential ? (
            <Pill
              label="Confidential"
              tone="accent"
              size="sm"
              icon={<Icon name="lock" size={10} color={color.accent} />}
            />
          ) : null}
        </Row>
        <Text variant="micro" tone="faint">
          This script is private and confidential. It is digitally stamped with your details to prevent leaks.
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle title="Takes" accent={String(takes.length)} />
        {takes.length === 0 ? (
          <Text variant="caption" tone="faint">
            No takes submitted yet. Record, review, then submit the one you want in the queue.
          </Text>
        ) : (
          <Stack gap={space.sm}>
            {takes.map((take) => (
              <Row key={take.id} justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text variant="caption">
                    Take {take.takeNumber} · {timecode(take.durationSeconds)}
                  </Text>
                  {take.note ? (
                    <Text variant="micro" tone="faint" numberOfLines={1}>
                      {take.note}
                    </Text>
                  ) : null}
                </View>
                <Row gap={space.sm}>
                  {take.reviewerRating ? (
                    <Pill label={`★ ${take.reviewerRating}`} tone="success" size="sm" />
                  ) : null}
                  <Pill
                    label={take.status}
                    tone={take.status === 'reviewed' ? 'brand' : 'neutral'}
                    size="sm"
                  />
                </Row>
              </Row>
            ))}
          </Stack>
        )}

        {submit.error ? <ErrorNote message={submit.error.message} /> : null}

        <Button
          label={elapsed > 0 ? `Submit take (${timecode(elapsed)})` : 'Record a take first'}
          full
          disabled={elapsed <= 0 || recording}
          loading={submit.pending}
          icon={<Icon name="send" size={15} color="#FFF" />}
          onPress={async () => {
            const result = await submit.mutate(elapsed, '');
            if (result) {
              setElapsed(0);
              room.refetch();
            }
          }}
        />
      </Card>
    </Stack>
  );

  return (
    <Screen title="Casting Room" accent={project.title.toUpperCase()}>
      {compact ? (
        <Stack gap={space.xl}>
          {viewfinder}
          {controls}
        </Stack>
      ) : (
        <Row gap={space.xl} align="flex-start">
          <View style={{ width: Math.min(520, contentWidth * 0.56) }}>{viewfinder}</View>
          <View style={{ flex: 1 }}>{controls}</View>
        </Row>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function TransportButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: 'rewind' | 'play' | 'pause';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceAlt,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={19} color={color.textMuted} />
    </Pressable>
  );
}

/**
 * Web viewfinder.
 *
 * expo-camera has no web implementation, so the browser build drives
 * getUserMedia directly. Same framing, same controls — the only difference is
 * where the pixels come from.
 */
function WebViewfinder({ mirror }: { mirror: boolean }) {
  const ref = useRef<View>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;

    const media = (globalThis as { navigator?: { mediaDevices?: MediaDevices } }).navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      setError('This browser does not expose a camera API.');
      return;
    }

    media
      .getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: true })
      .then((granted) => {
        stream = granted;
        video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.srcObject = granted;
        Object.assign(video.style, {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        });
        node.appendChild(video);
        setStreaming(true);
      })
      .catch((cause: Error) => {
        setError(
          cause.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in the browser address bar to record.'
            : 'No camera available on this device.',
        );
      });

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      video?.remove();
    };
  }, []);

  return (
    <View
      ref={ref}
      style={[
        { flex: 1, backgroundColor: color.bg, overflow: 'hidden' },
        mirror && streaming ? { transform: [{ scaleX: -1 }] } : null,
      ]}
    >
      {!streaming ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl }}>
          <Icon name="video" size={30} color={color.textFaint} />
          <Text variant="caption" tone="faint" align="center">
            {error ?? 'Requesting camera…'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
