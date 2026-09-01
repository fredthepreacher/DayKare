import type { RealtimeChannel } from '@supabase/supabase-js';
import { ensureSession, getCloudClient, readCloudConfig } from '@workspace/cloud-sync';
import { create } from 'zustand';
import type { GameZone } from './world';
import { ONLINE_MAX_PLAYERS } from './modeStore';
import type { StorybookItemId } from './storybookLaneConfig';
import { useStorybookLaneStore } from './storybookLaneStore';

export const MULTIPLAYER_NETWORK_HZ = 10;

export interface NetworkTransform {
  id: string;
  name: string;
  color: string;
  zone: GameZone;
  position: [number, number, number];
  rotationY: number;
  animation: 'idle' | 'walking' | 'running' | 'flopped';
  hasDog: boolean;
  vehicle: 'none' | 'tricycle' | 'mini-ride-on';
  updatedAt: number;
}

export type MultiplayerStatus = 'idle' | 'connecting' | 'connected' | 'room-full' | 'unavailable' | 'error';

interface MultiplayerState {
  status: MultiplayerStatus;
  roomId: string;
  localId: string | null;
  occupancy: number;
  players: Record<string, NetworkTransform>;
  error: string | null;
}

const initial: MultiplayerState = { status: 'idle', roomId: '', localId: null, occupancy: 0, players: {}, error: null };

export const useMultiplayerStore = create<MultiplayerState>()(() => initial);

let channel: RealtimeChannel | null = null;
let cloudClient: Awaited<ReturnType<typeof getCloudClient>> = null;
let activeRoom = '';
let heartbeatTimer: number | null = null;

const colors = ['#ffad33', '#33cccc', '#ff66b3', '#8ed081', '#a98be8', '#ff8566'];

function safeText(value: unknown, fallback: string, max = 24) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

export function validateNetworkTransform(value: unknown): NetworkTransform | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NetworkTransform>;
  if (typeof candidate.id !== 'string' || candidate.id.length > 64) return null;
  if (!Array.isArray(candidate.position) || candidate.position.length !== 3 || !candidate.position.every(Number.isFinite)) return null;
  if (!['hub', 'garden', 'storybook'].includes(candidate.zone ?? '')) return null;
  if (typeof candidate.rotationY !== 'number' || !Number.isFinite(candidate.rotationY)) return null;
  const animation = ['idle', 'walking', 'running', 'flopped'].includes(candidate.animation ?? '')
    ? candidate.animation as NetworkTransform['animation']
    : 'idle';
  return {
    id: candidate.id,
    name: safeText(candidate.name, 'New Kid'),
    color: /^#[0-9a-f]{6}$/i.test(candidate.color ?? '') ? candidate.color! : colors[0],
    zone: candidate.zone as GameZone,
    position: [candidate.position[0], candidate.position[1], candidate.position[2]],
    rotationY: candidate.rotationY,
    animation,
    hasDog: candidate.hasDog === true,
    vehicle: candidate.vehicle === 'tricycle' || candidate.vehicle === 'mini-ride-on' ? candidate.vehicle : 'none',
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now(),
  };
}

function syncPresence() {
  if (!channel) return;
  const state = channel.presenceState<Record<string, unknown>>();
  const localId = useMultiplayerStore.getState().localId;
  const presentIds = new Set<string>();
  Object.values(state).flat().forEach((entry) => {
    const id = typeof entry.userId === 'string' ? entry.userId : '';
    if (id) presentIds.add(id);
  });
  useMultiplayerStore.setState((current) => ({
    occupancy: Math.min(ONLINE_MAX_PLAYERS, presentIds.size),
    players: Object.fromEntries(Object.entries(current.players).filter(([id]) => id === localId || presentIds.has(id))),
  }));
}

export async function connectMultiplayer(
  roomId: string,
  displayName: string,
  env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>,
) {
  if (channel && activeRoom === roomId && useMultiplayerStore.getState().status === 'connected') return true;
  await disconnectMultiplayer();
  useMultiplayerStore.setState({ ...initial, status: 'connecting', roomId });
  const config = readCloudConfig(env);
  if (!config) {
    useMultiplayerStore.setState({ status: 'unavailable', error: 'Multiplayer needs the two Supabase public environment variables.' });
    return false;
  }
  try {
    cloudClient = await getCloudClient(config);
    const session = await ensureSession(cloudClient);
    if (!cloudClient || !session.user) throw new Error(session.error ?? 'Could not create a player session.');
    const userId = session.user.id;
    const safeRoom = /^[a-z0-9-]{1,32}$/i.test(roomId) ? roomId.toLowerCase() : 'friends-1';
    const safeName = safeText(displayName, 'New Kid');
    const join = await cloudClient.rpc('join_daykare_room', { p_room_id: safeRoom, p_display_name: safeName });
    if (join.error) throw join.error;
    const result = Array.isArray(join.data) ? join.data[0] : join.data;
    if (!result?.accepted) {
      useMultiplayerStore.setState({ status: result?.reason === 'room-full' ? 'room-full' : 'error', error: result?.reason ?? 'Could not join room.' });
      return false;
    }
    const color = colors[Math.abs(userId.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0)) % colors.length];
    channel = cloudClient.channel(`daykare-room:${safeRoom}`, {
      config: { presence: { key: userId }, broadcast: { self: false, ack: false } },
    });
    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('broadcast', { event: 'player-move' }, ({ payload }) => {
        const transform = validateNetworkTransform(payload);
        if (!transform || transform.id === userId) return;
        useMultiplayerStore.setState((current) => ({ players: { ...current.players, [transform.id]: transform } }));
      });
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Room connection timed out.')), 10_000);
      channel!.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timer);
          await channel!.track({ userId, name: safeName, color, joinedAt: Date.now() });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          window.clearTimeout(timer);
          reject(new Error('Realtime room connection failed.'));
        }
      });
    });
    activeRoom = safeRoom;
    heartbeatTimer = window.setInterval(() => {
      if (cloudClient && activeRoom) void cloudClient.rpc('heartbeat_daykare_room', { p_room_id: activeRoom });
    }, 30_000);
    useMultiplayerStore.setState({ status: 'connected', roomId: safeRoom, localId: userId, occupancy: Number(result.occupancy) || 1, error: null });
    return true;
  } catch (error) {
    await disconnectMultiplayer();
    useMultiplayerStore.setState({ status: 'error', roomId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export async function sendPlayerTransform(transform: Omit<NetworkTransform, 'id' | 'updatedAt'>) {
  const state = useMultiplayerStore.getState();
  if (!channel || state.status !== 'connected' || !state.localId) return;
  await channel.send({ type: 'broadcast', event: 'player-move', payload: { ...transform, id: state.localId, updatedAt: Date.now() } });
}

export async function purchaseMultiplayerStorybookItem(item: StorybookItemId | 'ice-cream') {
  if (!cloudClient || useMultiplayerStore.getState().status !== 'connected') {
    return { accepted: false, reason: 'not-connected' } as const;
  }
  const response = await cloudClient.rpc('purchase_storybook_item', { p_item_id: item });
  if (response.error) return { accepted: false, reason: response.error.message } as const;
  const result = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!result) return { accepted: false, reason: 'empty-response' } as const;
  const save = {
    ribbonBucks: Number(result.ribbon_bucks) || 0,
    ownedItems: (Array.isArray(result.owned_items) ? result.owned_items : []) as StorybookItemId[],
    cribTier: Math.max(0, Math.min(3, Number(result.crib_tier) || 0)) as 0 | 1 | 2 | 3,
  };
  if (item !== 'ice-cream' || !result.accepted) useStorybookLaneStore.getState().applyAuthoritativeProfile(save);
  return { accepted: result.accepted === true, reason: String(result.reason ?? ''), save };
}

export async function disconnectMultiplayer() {
  const room = activeRoom || useMultiplayerStore.getState().roomId;
  if (channel) {
    try { await channel.untrack(); } catch { /* best effort */ }
    try { await channel.unsubscribe(); } catch { /* best effort */ }
  }
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  channel = null;
  activeRoom = '';
  if (cloudClient && room) {
    try { await cloudClient.rpc('leave_daykare_room', { p_room_id: room }); } catch { /* stale rows expire server-side */ }
  }
  useMultiplayerStore.setState(initial);
}
