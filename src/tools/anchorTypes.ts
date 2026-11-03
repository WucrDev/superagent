import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';

/**
 * W3 #16 / docs/winch-design.md §3.1: anchor kinds and their structural
 * strength. Strength is on the design's 0–120 scale; the winch converts it to
 * a force threshold relative to the rope's maximum tension.
 */
export type AnchorKind = 'tree' | 'rock' | 'stump' | 'bush' | 'vehicle';

export type AnchorFailure = 'break' | 'roll' | 'slip' | 'none';

export interface AnchorTypeDef {
  label: string;
  strength: number;
  attachable: boolean;
  /** Auto-aim never picks misleading anchors such as bushes. */
  autoSelectable: boolean;
  failure: AnchorFailure;
  color: number;
}

export const ANCHOR_TYPES: Record<AnchorKind, AnchorTypeDef> = {
  tree: {
    label: '树干',
    strength: 100,
    attachable: true,
    autoSelectable: true,
    failure: 'break',
    color: 0x8fbf6a,
  },
  rock: {
    label: '大岩石',
    strength: 120,
    attachable: true,
    autoSelectable: true,
    failure: 'roll',
    color: 0xc4c8bd,
  },
  stump: {
    label: '木桩',
    strength: 60,
    attachable: true,
    autoSelectable: true,
    failure: 'break',
    color: 0xc9a227,
  },
  bush: {
    label: '细灌木',
    strength: 0,
    attachable: true,
    autoSelectable: false,
    failure: 'slip',
    color: 0x4f7a47,
  },
  vehicle: {
    label: '其他车辆',
    strength: 150,
    attachable: true,
    autoSelectable: true,
    failure: 'slip',
    color: 0x6fa7c9,
  },
};

export interface WinchAnchor {
  id: string;
  kind: AnchorKind;
  label: string;
  /** World-space hook point (on the trunk / boulder / stump). */
  attachPoint: THREE.Vector3;
  /** World height of the anchor's base; used by the failure animation. */
  baseY: number;
  strength: number;
  group: THREE.Group;
  /** Base highlight ring, owned by the anchor visual. */
  ring: THREE.Mesh;
  /** Floating label; hidden when the anchor fails. */
  labelMesh?: THREE.Mesh;
  colliderHandles: Set<number>;
  /** Present for rock anchors so a failed rock can become a rolling body. */
  rigidBody?: RAPIER.RigidBody;
  status: 'ok' | 'failed';
  /** Seconds since failure began; -1 while intact. */
  failTimer: number;
  failDirection: THREE.Vector3;
}
