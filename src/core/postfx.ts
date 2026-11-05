import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * W5 #21 / issue #27: the fixed film grade and the four photo filters.
 *
 * The grade pass is intentionally one small shader: grain, vignette, a slight
 * teal-shadow / warm-highlight split, saturation and contrast. The photo filters
 * are parameter sets over the same shader, so the "look" remains one pipeline
 * and the game can never drift into a different style by accident.
 */
export interface PhotoFilter {
  id: string;
  label: string;
  grain: number;
  vignette: number;
  saturation: number;
  contrast: number;
  lift: [number, number, number];
  gain: [number, number, number];
}

export const PHOTO_FILTERS: readonly PhotoFilter[] = [
  {
    id: 'neutral',
    label: '原片',
    grain: 0.018,
    vignette: 0.24,
    saturation: 1.02,
    contrast: 1.03,
    lift: [-0.004, 0.002, 0.008],
    gain: [1.03, 1.0, 0.97],
  },
  {
    id: 'film',
    label: '胶片',
    grain: 0.055,
    vignette: 0.4,
    saturation: 0.9,
    contrast: 1.05,
    lift: [0.018, 0.012, 0.002],
    gain: [1.05, 1.0, 0.9],
  },
  {
    id: 'cool',
    label: '冷调',
    grain: 0.03,
    vignette: 0.3,
    saturation: 0.88,
    contrast: 1.04,
    lift: [-0.006, 0.0, 0.016],
    gain: [0.93, 1.0, 1.06],
  },
  {
    id: 'warm',
    label: '暖调',
    grain: 0.025,
    vignette: 0.28,
    saturation: 1.06,
    contrast: 1.06,
    lift: [0.02, 0.006, -0.01],
    gain: [1.08, 1.02, 0.92],
  },
  {
    id: 'faded',
    label: '褪色',
    grain: 0.045,
    vignette: 0.34,
    saturation: 0.72,
    contrast: 0.92,
    lift: [0.026, 0.022, 0.022],
    gain: [0.98, 0.98, 1.0],
  },
];

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    grain: { value: 0.018 },
    vignette: { value: 0.24 },
    saturation: { value: 1.02 },
    contrast: { value: 1.03 },
    lift: { value: new THREE.Vector3(-0.004, 0.002, 0.008) },
    gain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 lift;
    uniform vec3 gain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      color = color * gain + lift;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      float noise = hash(vUv * vec2(1920.0, 1080.0) + time * 17.0) - 0.5;
      color += noise * grain;
      float d = distance(vUv, vec2(0.5));
      color *= 1.0 - vignette * smoothstep(0.32, 0.82, d);
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
};

export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bokeh: BokehPass;
  private readonly grade: ShaderPass;
  private baseExposure = 1.1;
  private photoStops = 0;
  private photoMode = false;
  private filterIndex = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bokeh = new BokehPass(scene, camera, {
      focus: 12,
      aperture: 0.0007,
      maxblur: 0.0035,
    });
    this.composer.addPass(this.bokeh);

    this.grade = new ShaderPass(gradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.applyFilter(0);
    this.applyExposure();
  }

  get filter(): PhotoFilter {
    return PHOTO_FILTERS[this.filterIndex]!;
  }

  get filterIndexValue(): number {
    return this.filterIndex;
  }

  get composerSize(): { width: number; height: number } {
    return { width: this.renderer.domElement.width, height: this.renderer.domElement.height };
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setBaseExposure(value: number): void {
    if (Math.abs(value - this.baseExposure) < 1e-4) return;
    this.baseExposure = value;
    this.applyExposure();
  }

  setPhotoMode(active: boolean): void {
    this.photoMode = active;
    this.applyFocus();
  }

  setPhotoStops(stops: number): void {
    this.photoStops = Math.max(-1, Math.min(1, Math.round(stops)));
    this.applyExposure();
  }

  setFilter(index: number): void {
    const clamped = ((index % PHOTO_FILTERS.length) + PHOTO_FILTERS.length) % PHOTO_FILTERS.length;
    this.applyFilter(clamped);
  }

  /** Update the focus distance so the car stays sharp while the background falls off. */
  updateFocus(cameraPosition: THREE.Vector3, target: THREE.Vector3): void {
    const distance = cameraPosition.distanceTo(target);
    this.bokehUniforms().focus!.value = distance;
    this.applyFocus();
  }

  render(): void {
    const uniforms = this.grade.uniforms;
    uniforms.time!.value = (performance.now() / 1000) % 1000;
    this.composer.render();
  }

  /**
   * Capture the current frame as a PNG data URL. The composer renders
   * synchronously first; the canvas is read in the same task so no
   * preserveDrawingBuffer flag is needed.
   */
  capture(): string {
    this.renderer.setRenderTarget(null);
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.composer.dispose();
  }

  private applyFilter(index: number): void {
    this.filterIndex = index;
    const filter = PHOTO_FILTERS[index]!;
    const uniforms = this.grade.uniforms;
    uniforms.grain!.value = filter.grain;
    uniforms.vignette!.value = filter.vignette;
    uniforms.saturation!.value = filter.saturation;
    uniforms.contrast!.value = filter.contrast;
    (uniforms.lift!.value as THREE.Vector3).set(...filter.lift);
    (uniforms.gain!.value as THREE.Vector3).set(...filter.gain);
  }

  private applyFocus(): void {
    // In gameplay keep the depth of field very light; photo mode opens it up so
    // a close subject separates from the ridge.
    const uniforms = this.bokehUniforms();
    uniforms.aperture!.value = this.photoMode ? 0.0008 : 0.00035;
    uniforms.maxblur!.value = this.photoMode ? 0.004 : 0.0018;
    this.bokeh.enabled = true;
  }

  private bokehUniforms(): Record<string, THREE.IUniform> {
    return this.bokeh.uniforms as unknown as Record<string, THREE.IUniform>;
  }

  private applyExposure(): void {
    this.renderer.toneMappingExposure = this.baseExposure * Math.pow(2, this.photoStops);
  }
}
