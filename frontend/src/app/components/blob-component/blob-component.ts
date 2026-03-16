import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  signal,
  input,
} from '@angular/core';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  SphereGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Mesh,
  Vector2,
  type BufferGeometry,
} from 'three';
import { blobVertexShader } from './blob.vertex.glsl';
import { blobFragmentShader } from './blob.fragment.glsl';

@Component({
  selector: 'app-blob-component',
  templateUrl: './blob-component.html',
  styleUrl: './blob-component.css',
})
export class BlobComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private renderer: WebGLRenderer | null = null;
  private mesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  private backgroundMesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  private animationId: number | null = null;
  private startTime = 0;
  private resizeListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  readonly uSpeed = signal(0.5);
  readonly uNoiseDensity = signal(2.0);
  readonly uNoiseStrength = signal(0.2);
  readonly uFrequency = signal(3.0);
  readonly uAmplitude = signal(0.5);
  readonly uIntensity = signal(2.0);
  readonly level = input<number>(0);
  private smoothedLevel = 0;

  ngAfterViewInit(): void {
    const container = this.containerRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 2.2;

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const resolution = new Vector2(width, height);
    const backgroundGeometry = new PlaneGeometry(8, 8);
    const backgroundMaterial = new ShaderMaterial({
      uniforms: {
        resolution: { value: resolution },
        rand: { value: Math.random() * 1000 },
      },
      depthWrite: true,
      depthTest: true,
    });

    const geometry = new SphereGeometry(0.5, 64, 64);
    const material = new ShaderMaterial({
      vertexShader: blobVertexShader.trim(),
      fragmentShader: blobFragmentShader.trim(),
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: this.uSpeed() },
        uNoiseDensity: { value: this.uNoiseDensity() },
        uNoiseStrength: { value: this.uNoiseStrength() },
        uFrequency: { value: this.uFrequency() },
        uAmplitude: { value: this.uAmplitude() },
        uIntensity: { value: this.uIntensity() },
      },
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.mesh = mesh;

    this.startTime = performance.now() / 1000;

    const applySize = (): void => {
      const el = this.containerRef?.nativeElement;
      if (!el || !this.camera || !this.renderer) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.backgroundMesh) {
        (this.backgroundMesh.material.uniforms['resolution'].value as Vector2).set(w, h);
      }
    };
    this.resizeListener = applySize;
    window.addEventListener('resize', this.resizeListener);
    this.resizeObserver = new ResizeObserver(() => applySize());
    this.resizeObserver.observe(container);

    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate);
      const time = performance.now() / 1000 - this.startTime;
      if (this.mesh) {
        const u = this.mesh.material.uniforms;
        const targetLevel = this.level() ?? 0;
        this.smoothedLevel += (targetLevel - this.smoothedLevel) * 0.15;
        const ampBase = this.uAmplitude();
        const intensityBase = this.uIntensity();
        const boost = 1 + this.smoothedLevel * 1.2;
        u['uTime'].value = time;
        u['uSpeed'].value = this.uSpeed();
        u['uNoiseDensity'].value = this.uNoiseDensity();
        u['uNoiseStrength'].value = this.uNoiseStrength();
        u['uFrequency'].value = this.uFrequency();
        u['uAmplitude'].value = ampBase * boost;
        u['uIntensity'].value = intensityBase * boost;
      }
      this.renderer!.render(scene, camera);
    };
    animate();
  }

  ngOnDestroy(): void {
    if (this.animationId != null) cancelAnimationFrame(this.animationId);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.backgroundMesh?.geometry.dispose();
    this.backgroundMesh?.material.dispose();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
    this.renderer?.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.backgroundMesh = null;
    this.mesh = null;
  }
}
