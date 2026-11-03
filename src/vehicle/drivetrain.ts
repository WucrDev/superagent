export type Gear = 'L' | 'H';

const GEAR_MAX_SPEED: Record<Gear, number> = {
  L: 9.72, // 35 km/h
  H: 25, // 90 km/h
};

const GEAR_TORQUE: Record<Gear, number> = {
  // Low range multiplies torque so it can climb; high range trades torque for top speed.
  L: 1.45,
  H: 0.82,
};

/**
 * Two-speed transfer case for W1 #3. Manual L/H with a 0.3 s power interruption.
 * Surface slip, the clutch and engine audio live in the vehicle/audio modules.
 */
export class Drivetrain {
  gear: Gear = 'L';
  private shiftTimer = 0;
  readonly shiftDuration = 0.3;

  get shifting(): boolean {
    return this.shiftTimer > 0;
  }

  get maxSpeed(): number {
    return GEAR_MAX_SPEED[this.gear];
  }

  get torqueFactor(): number {
    return GEAR_TORQUE[this.gear];
  }

  get speedLimitKmh(): number {
    return this.maxSpeed * 3.6;
  }

  update(dt: number): void {
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
  }

  shiftUp(): boolean {
    if (this.shifting || this.gear === 'H') return false;
    this.gear = 'H';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  shiftDown(): boolean {
    if (this.shifting || this.gear === 'L') return false;
    this.gear = 'L';
    this.shiftTimer = this.shiftDuration;
    return true;
  }

  reset(): void {
    this.gear = 'L';
    this.shiftTimer = 0;
  }
}
