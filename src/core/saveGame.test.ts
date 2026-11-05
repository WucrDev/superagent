import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  clearSave,
  createSaveData,
  emptyInventory,
  loadSave,
  parseSaveData,
  writeSave,
  type SaveData,
  type SaveStorage,
} from './saveGame';

function memoryStorage(): SaveStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function snapshot(overrides: Partial<Parameters<typeof createSaveData>[0]> = {}) {
  return {
    checkpointId: 'cabin',
    checkpointLabel: '木屋检查点',
    x: -11.5,
    z: 4,
    yaw: 1.2,
    health: 73,
    inventory: { winch: -1, plank: 2, jack: 1, repair: 1 },
    discovered: ['cabin', 'ridge'],
    hours: 18.4,
    weather: 'rain' as const,
    now: new Date('2026-11-05T12:00:00.000Z'),
    ...overrides,
  };
}

describe('save/checkpoint data', () => {
  it('round-trips a validated checkpoint snapshot', () => {
    const data = createSaveData(snapshot());
    const storage = memoryStorage();
    expect(writeSave(storage, data)).toBe(true);
    expect(loadSave(storage)).toEqual(data);
  });

  it('rejects missing, corrupt, or older-version saves as a whole', () => {
    expect(parseSaveData(null)).toBeNull();
    expect(parseSaveData('not json')).toBeNull();
    expect(parseSaveData(JSON.stringify({ version: 0, x: 0, z: 0, yaw: 0, health: 1, hours: 1 }))).toBeNull();
    expect(parseSaveData(JSON.stringify({ version: 1, x: 0, z: 0, yaw: 0, health: 1 }))).toBeNull();
    expect(parseSaveData(JSON.stringify({ ...createSaveData(snapshot()), weather: 'snow' }))).toBeNull();
  });

  it('clamps health, inventory and the clock instead of trusting the file', () => {
    const parsed = parseSaveData(
      JSON.stringify({
        ...createSaveData(snapshot()),
        health: 400,
        hours: -5,
        inventory: { winch: -1, plank: 99, jack: -3, repair: 2.4 },
        discovered: ['cabin', 'cabin', 'ridge', 42, '  '],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.health).toBe(100);
    expect(parsed!.hours).toBe(0);
    expect(parsed!.inventory.plank).toBe(4);
    expect(parsed!.inventory.jack).toBe(0);
    expect(parsed!.inventory.repair).toBe(2);
    expect(parsed!.inventory.winch).toBe(-1);
    expect(parsed!.discovered).toEqual(['cabin', 'ridge']);
  });

  it('clears a save and starts from a known loadout', () => {
    const storage = memoryStorage();
    writeSave(storage, createSaveData(snapshot()));
    clearSave(storage);
    expect(loadSave(storage)).toBeNull();
    expect(emptyInventory()).toEqual({ winch: -1, plank: 2, jack: 1, repair: 1 });
  });

  it('keeps the version explicit for future migrations', () => {
    const data: SaveData = createSaveData(snapshot());
    expect(data.version).toBe(SAVE_VERSION);
    expect(new Date(data.savedAt).toISOString()).toBe(data.savedAt);
  });
});
