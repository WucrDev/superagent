import { clamp } from './math';
import { WEATHER_ORDER, type WeatherKind } from './weather';
import { TOOL_META, TOOL_ORDER, type ToolKind } from '../tools/inventory';
import { FIRST_RUN_ID, type FirstRunSaved } from '../mission/firstRun';

/**
 * W5 #22 / issue #28: a small, validated localStorage save.
 *
 * The save is a checkpoint snapshot, not a rewind of the physics world: the
 * player is restored at the hut with the vehicle condition, tool stock and
 * discovered landmarks they had when the checkpoint fired.
 */
export const SAVE_VERSION = 1 as const;
export const SAVE_STORAGE_KEY = 'superagent.save.v1';

export type SavedInventory = Record<ToolKind, number>;

/** Mission progress is additive to save v1 so existing W5 saves still load. */
export type SavedMission = FirstRunSaved;

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: string;
  checkpointId: string;
  checkpointLabel: string;
  x: number;
  z: number;
  yaw: number;
  health: number;
  inventory: SavedInventory;
  discovered: string[];
  hours: number;
  weather: WeatherKind;
  mission: SavedMission | null;
}

/** Minimal subset of Storage so tests can run without a browser. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveSnapshot {
  checkpointId: string;
  checkpointLabel: string;
  x: number;
  z: number;
  yaw: number;
  health: number;
  inventory: SavedInventory;
  discovered: readonly string[];
  hours: number;
  weather: WeatherKind;
  mission?: SavedMission | null;
  now?: Date;
}

export function emptyInventory(): SavedInventory {
  return {
    winch: TOOL_META.winch.start,
    plank: TOOL_META.plank.start,
    jack: TOOL_META.jack.start,
    repair: TOOL_META.repair.start,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitiseInventory(value: unknown): SavedInventory {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = emptyInventory();
  for (const kind of TOOL_ORDER) {
    const raw = source[kind];
    const meta = TOOL_META[kind];
    if (meta.max < 0) {
      result[kind] = meta.start;
    } else if (isFiniteNumber(raw)) {
      result[kind] = clamp(Math.round(raw), 0, meta.max);
    }
  }
  return result;
}

function sanitiseDiscovered(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim().slice(0, 64);
    if (id.length === 0) continue;
    seen.add(id);
    if (seen.size >= 32) break;
  }
  return [...seen];
}

/** Build a fresh checkpoint snapshot; `now` is injectable for tests. */
export function createSaveData(snapshot: SaveSnapshot): SaveData {
  const now = snapshot.now ?? new Date();
  return {
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    checkpointId: snapshot.checkpointId.slice(0, 64),
    checkpointLabel: snapshot.checkpointLabel.slice(0, 64),
    x: snapshot.x,
    z: snapshot.z,
    yaw: snapshot.yaw,
    health: clamp(snapshot.health, 0, 100),
    inventory: sanitiseInventory(snapshot.inventory),
    discovered: sanitiseDiscovered(snapshot.discovered),
    hours: clamp(snapshot.hours, 0, 24),
    weather: WEATHER_ORDER.includes(snapshot.weather) ? snapshot.weather : 'clear',
    mission: sanitiseMission(snapshot.mission),
  };
}

const MAX_MISSION_MS = 24 * 60 * 60 * 1000;

function sanitiseMission(value: unknown): SavedMission | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  if (source.id !== FIRST_RUN_ID) return null;
  if (source.status !== 'active' && source.status !== 'complete') return null;
  if (!isFiniteNumber(source.objectiveIndex)) return null;
  const elapsedMs = isFiniteNumber(source.elapsedMs) ? source.elapsedMs : 0;
  const bestMs = isFiniteNumber(source.bestMs) ? source.bestMs : null;
  return {
    id: FIRST_RUN_ID,
    status: source.status,
    objectiveIndex: Math.round(clamp(source.objectiveIndex, 0, 32)),
    elapsedMs: clamp(elapsedMs, 0, MAX_MISSION_MS),
    bestMs: bestMs === null ? null : clamp(bestMs, 0, MAX_MISSION_MS),
  };
}

/**
 * Parse and validate a raw save string. Anything corrupt, incomplete or from an
 * older version is rejected as a whole instead of being half-applied.
 */
export function parseSaveData(raw: string | null): SaveData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const source = parsed as Record<string, unknown>;
  if (source.version !== SAVE_VERSION) return null;
  if (
    !isFiniteNumber(source.x) ||
    !isFiniteNumber(source.z) ||
    !isFiniteNumber(source.yaw) ||
    !isFiniteNumber(source.health) ||
    !isFiniteNumber(source.hours)
  ) {
    return null;
  }
  const weather = source.weather;
  if (typeof weather !== 'string' || !WEATHER_ORDER.includes(weather as WeatherKind)) {
    return null;
  }
  const checkpointId = typeof source.checkpointId === 'string' ? source.checkpointId : '';
  if (checkpointId.length === 0) return null;
  const checkpointLabel =
    typeof source.checkpointLabel === 'string' ? source.checkpointLabel : '检查点';
  return {
    version: SAVE_VERSION,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : new Date(0).toISOString(),
    checkpointId,
    checkpointLabel,
    x: source.x,
    z: source.z,
    yaw: source.yaw,
    health: clamp(source.health, 0, 100),
    inventory: sanitiseInventory(source.inventory),
    discovered: sanitiseDiscovered(source.discovered),
    hours: clamp(source.hours, 0, 24),
    weather: weather as WeatherKind,
    mission: sanitiseMission(source.mission),
  };
}

export function loadSave(storage: Pick<SaveStorage, 'getItem'>): SaveData | null {
  try {
    return parseSaveData(storage.getItem(SAVE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSave(storage: Pick<SaveStorage, 'setItem'>, data: SaveData): boolean {
  try {
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Private browsing / quota failures must never break the run.
    return false;
  }
}

export function clearSave(storage: Pick<SaveStorage, 'removeItem'>): void {
  try {
    storage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage failures; there is nothing else to do.
  }
}
