import { clamp } from '../core/math';

/**
 * W2 #6 / issue #12: surface materials and grip curves.
 *
 * Each wheel looks up the surface of the collider it touches. The surface
 * provides the peak friction coefficient, the lateral grip multiplier and the
 * rolling resistance; `gripCurve` adds the drop-off that makes a sliding tire
 * lose grip progressively instead of behaving like a constant friction pad.
 */
export type SurfaceId = 'dirt' | 'mud' | 'wetMud' | 'rock' | 'snow' | 'water' | 'wood';

export interface Surface {
  id: SurfaceId;
  label: string;
  /** Peak longitudinal friction coefficient. 30° needs roughly 0.58 to climb. */
  friction: number;
  /** Multiplier on the lateral tire force; snow lets the tail step out. */
  lateralGrip: number;
  /** Multiplier on the rolling-resistance term. */
  rollingResistance: number;
  /** 0..1 how much loose material a spinning tire throws up. */
  looseness: number;
  /** Dust/spray colour used by the effects layer. */
  dustColor: number;
}

export const SURFACES: Record<SurfaceId, Surface> = {
  // Baseline for the whitebox ground: dry dirt / grass.
  dirt: {
    id: 'dirt',
    label: '干土',
    friction: 1.0,
    lateralGrip: 1.0,
    rollingResistance: 1.0,
    looseness: 0.45,
    dustColor: 0x8a7a55,
  },
  mud: {
    id: 'mud',
    label: '泥地',
    friction: 0.52,
    lateralGrip: 0.6,
    rollingResistance: 2.3,
    looseness: 0.9,
    dustColor: 0x5b4226,
  },
  // Wet mud is the "same slope, cannot climb" material: 0.35 < tan(30°) ≈ 0.58.
  wetMud: {
    id: 'wetMud',
    label: '湿泥',
    friction: 0.32,
    lateralGrip: 0.45,
    rollingResistance: 2.6,
    looseness: 1.0,
    dustColor: 0x3f2d1a,
  },
  rock: {
    id: 'rock',
    label: '岩石',
    friction: 1.1,
    lateralGrip: 1.25,
    rollingResistance: 0.75,
    looseness: 0.2,
    dustColor: 0x9a9a90,
  },
  snow: {
    id: 'snow',
    label: '雪地',
    friction: 0.32,
    lateralGrip: 0.35,
    rollingResistance: 2.8,
    looseness: 0.8,
    dustColor: 0xf2f6fa,
  },
  // W4 #21: the 4 m plank bridge. Dry wood has less grip than rock and a bit
  // more rolling resistance than dirt, so the car crosses it deliberately.
  wood: {
    id: 'wood',
    label: '木板',
    friction: 0.78,
    lateralGrip: 0.9,
    rollingResistance: 1.1,
    looseness: 0.05,
    dustColor: 0x8a6a3a,
  },
  // Deep water is not a driving surface; it is the submerged terrain under the
  // water plane. It is only used if a wheel somehow touches the bed.
  water: {
    id: 'water',
    label: '深水',
    friction: 0.35,
    lateralGrip: 0.5,
    rollingResistance: 3.0,
    looseness: 0,
    dustColor: 0xbfe3ef,
  },
};

/**
 * Friction falls off as the contact patch slides faster. Low slip keeps full
 * grip (launch, braking); a spinning or sideways-sliding tire loses up to 40 %.
 */
export function gripCurve(slipSpeed: number): number {
  const speed = Math.abs(slipSpeed);
  if (speed <= 1.5) return 1;
  return clamp(1 - (speed - 1.5) * 0.05, 0.6, 1);
}

export function slopeDegFromNormal(normalY: number): number {
  return (Math.acos(clamp(normalY, -1, 1)) * 180) / Math.PI;
}

export interface WaterZone {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  /** World-space height of the water surface (ground is y = 0). */
  level: number;
  /** Water depth from the ground to the surface. */
  depth: number;
}

export class TerrainField {
  private readonly surfaceByCollider = new Map<number, Surface>();
  private readonly waterZones: WaterZone[] = [];

  addSurface(colliderHandle: number, surface: Surface): void {
    this.surfaceByCollider.set(colliderHandle, surface);
  }

  surfaceAt(colliderHandle: number): Surface {
    return this.surfaceByCollider.get(colliderHandle) ?? SURFACES.dirt;
  }

  /** Remove a dynamic surface registration (e.g. a consumed plank bridge). */
  removeSurface(colliderHandle: number): void {
    this.surfaceByCollider.delete(colliderHandle);
  }

  addWater(zone: WaterZone): void {
    this.waterZones.push(zone);
  }

  /** Deepest water zone containing the point, or null on dry land. */
  waterAt(x: number, z: number): WaterZone | null {
    let deepest: WaterZone | null = null;
    for (const zone of this.waterZones) {
      if (Math.abs(x - zone.x) > zone.halfWidth) continue;
      if (Math.abs(z - zone.z) > zone.halfDepth) continue;
      if (!deepest || zone.depth > deepest.depth) deepest = zone;
    }
    return deepest;
  }

  waterDepthAt(x: number, z: number): number {
    return this.waterAt(x, z)?.depth ?? 0;
  }

  get waters(): readonly WaterZone[] {
    return this.waterZones;
  }
}
