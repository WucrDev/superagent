export type Gear = 'L' | 'H';
/** Drive direction: normal forward range or reverse. */
export type DriveDirection = 'D' | 'R';
/** What the HUD shows: the current forward range, or R while reversing. */
export type GearLabel = Gear | 'R';

const GEAR_MAX_SPEED: Record<Gear, number> = {
  L: 9.72, // 35 km/h
  H: 25, // 90 km/h
};

const GEAR_TORQUE: Record<Gear, number> = {
  // Low range multiplies torque so it can climb; high range trades torque for top speed.
  L: 1.45,
  H: 0.82,
};

// Reverse is deliberately short-legged: enough to back out of a rut or off a
// trailer, not a second highway gear.
const REVERSE_MAX_SPEED = 12 / 3.6; // 12 km/h
const REVERSE_TORQUE = 1.25;

/**
 * Two-speed transfer case for W1 #3 plus the R direction added for the
 * playtest feedback "S does not brake and there is no reverse".
 *
 * Manual L/H with a 0.3 s power interruption. `direction` is selected by the
 * vehicle control layer: S engages R at a standstill and W engages D again.
 * Surface slip, the clutch and engine audio live in the vehicle/audio modules.
 */
export class Drivetrain {
  gear: Gear = 'L';
  direction: DriveDirection = 'D';
  private shiftTimer = 0;
  readonly shiftDuration = 0.3;

  get shifting(): boolean {
    return this.shiftTimer > 0;
  }

  get isReverse(): boolean {
    return this.direction === 'R';
  }

  get gearLabel(): GearLabel {
    return this.isReverse ? 'R' : this.gear;
  }

  get maxSpeed(): number {
    return this.isReverse ? REVERSE_MAX_SPEED : GEAR_MAX_SPEED[this.gear];
  }

  get torqueFactor(): number {
    return this.isReverse ? REVERSE_TORQUE : GEAR_TORQUE[this.gear];
  }

  get speedLimitKmh(): number {
    return this.maxSpeed * 3.6;
  }

  update(dt: number): void {
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
  }

  shiftUp(): boolean {
    if (this.shifting || this.isReverse || this.gear === 'H') return false;
    this.gear = 'H';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  shiftDown(): boolean {
    if (this.shifting || this.isReverse || this.gear === 'L') return false;
    this.gear = 'L';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  /** Engage reverse. Call only at (near) standstill; the vehicle checks that. */
  engageReverse(): boolean {
    if (this.isReverse || this.shifting) return false;
    this.direction = 'R';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  /** Engage the forward range again, keeping the selected L/H range. */
  engageForward(): boolean {
    if (!this.isReverse || this.shifting) return false;
    this.direction = 'D';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  reset(): void {
    this.gear = 'L';
    this.direction = 'D';
    this.shiftTimer = 0;
  }
}
