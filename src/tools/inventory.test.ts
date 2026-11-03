import { describe, expect, it } from 'vitest';
import {
  Inventory,
  TOOL_META,
  TOOL_ORDER,
  slotForRingPoint,
  slotForWheelDirection,
} from './inventory';

describe('W4 inventory and tool wheel', () => {
  it('starts with four slots and the documented starting stack', () => {
    const inventory = new Inventory();
    expect(inventory.slots).toHaveLength(4);
    expect(inventory.slots.map((slot) => slot.kind)).toEqual([...TOOL_ORDER]);
    expect(inventory.count('winch')).toBe(-1);
    expect(inventory.count('plank')).toBe(TOOL_META.plank.start);
    expect(inventory.count('jack')).toBe(1);
    expect(inventory.count('repair')).toBe(1);
    expect(inventory.activeKind).toBe('winch');
  });

  it('selects by slot index and kind, ignoring out-of-range values', () => {
    const inventory = new Inventory();
    expect(inventory.select(2)).toBe(true);
    expect(inventory.activeKind).toBe('jack');
    expect(inventory.select(9)).toBe(false);
    expect(inventory.activeKind).toBe('jack');
    expect(inventory.selectKind('plank')).toBe(true);
    expect(inventory.activeKind).toBe('plank');
  });

  it('cycles the four slots in both directions', () => {
    const inventory = new Inventory();
    inventory.cycle();
    expect(inventory.activeKind).toBe('plank');
    inventory.cycle(-1);
    expect(inventory.activeKind).toBe('winch');
    inventory.cycle(-1);
    expect(inventory.activeKind).toBe('repair');
  });

  it('caps consumable stacks and never spends the winch', () => {
    const inventory = new Inventory();
    expect(inventory.add('plank', 10)).toBe(TOOL_META.plank.max - TOOL_META.plank.start);
    expect(inventory.count('plank')).toBe(TOOL_META.plank.max);
    expect(inventory.take('plank', 1)).toBe(true);
    expect(inventory.count('plank')).toBe(TOOL_META.plank.max - 1);
    expect(inventory.take('winch', 1)).toBe(false);
    expect(inventory.count('winch')).toBe(-1);
    expect(inventory.has('repair')).toBe(true);
  });

  it('refuses to spend more units than are in the stack', () => {
    const inventory = new Inventory();
    inventory.take('repair', 1);
    expect(inventory.count('repair')).toBe(0);
    expect(inventory.has('repair')).toBe(false);
    expect(inventory.take('repair', 1)).toBe(false);
    expect(inventory.add('repair', 1)).toBe(1);
  });

  it('maps wheel directions to the four slots', () => {
    expect(slotForWheelDirection(0, -1)).toBe(0);
    expect(slotForWheelDirection(1, 0)).toBe(1);
    expect(slotForWheelDirection(0, 1)).toBe(2);
    expect(slotForWheelDirection(-1, 0)).toBe(3);
    expect(slotForWheelDirection(0.05, 0.05)).toBeNull();
    // Dominant axis wins for diagonals.
    expect(slotForWheelDirection(0.9, 0.4)).toBe(1);
    expect(slotForWheelDirection(-0.3, -0.9)).toBe(0);
  });

  it('maps a pointer position around the ring to a slot', () => {
    expect(slotForRingPoint(0, -70, 60)).toBe(0);
    expect(slotForRingPoint(70, 0, 60)).toBe(1);
    expect(slotForRingPoint(0, 70, 60)).toBe(2);
    expect(slotForRingPoint(-70, 0, 60)).toBe(3);
    expect(slotForRingPoint(5, 5, 60)).toBeNull();
  });
});
