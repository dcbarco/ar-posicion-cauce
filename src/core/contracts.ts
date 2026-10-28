// src/core/contracts.ts — tipos e interfaces compartidas entre agentes.
// Dueño: Agente 1. Cambios SOLO vía docs/PEDIDOS-DE-CONTRATO.md.
// Versión del contrato (súbela en cada cambio incompatible y anótalo en PEDIDOS):
export const CONTRACT_VERSION = '0.1.2';

import type * as THREE from 'three';
import type { TableSpec } from './table/spec';
import type { TableBounds } from './table/bounds';

export type { TableBounds } from './table/bounds';
export type ExperienceId = 'taller' | 'cuenca' | 'cosmos';
export type QualityLevel = 'high' | 'medium' | 'low';

// ───────────────────────────── Modelos (Agente 2 → 1 y 3) ─────────────────────────────

/** `extras` de cada nodo `part_*` en el GLB. */
export interface PartExtras {
  partId: string;
  group: string;
  explode: { dir: [number, number, number]; dist: number; order: number };
  labelKey: string;
  /** Solo Taller/Cosmos: piezas que deben estar montadas antes que esta en el reto de armado. */
  requires?: string[];
}

export interface ClipInfo {
  name: string; // anim_<nombre>
  duration: number; // s
  loop: boolean;
}

export interface BoundsBox {
  min: [number, number, number];
  max: [number, number, number];
}

/** Una entrada de public/models/manifest.json. */
export interface ModelManifestEntry {
  id: string;
  file: string; // relativo a /models/
  experience: ExperienceId | 'shared';
  tris: number;
  sizeKB: number;
  parts: { partId: string; labelKey: string; requires?: string[] }[];
  clips: ClipInfo[];
  bounds: { assembled: BoundsBox; exploded: BoundsBox };
  license: 'CC0' | 'CC-BY' | 'own';
  author: string;
  sourceUrl: string;
  /** Hash corto del GLB (P-011); el cargador lo usa como `?v=` para romper la caché inmutable. */
  hash?: string;
  /** Nota del pipeline, p. ej. "texturas WebP temporales (sin toktx)". */
  notes?: string;
}

export interface ModelManifest {
  version: number;
  models: ModelManifestEntry[];
}

export interface LoadedPart {
  id: string;
  node: THREE.Object3D;
  extras: PartExtras;
  /** Pose local original (armado), para volver a ella. */
  restPosition: THREE.Vector3;
  restQuaternion: THREE.Quaternion;
}

export interface LoadedModel {
  id: string;
  entry: ModelManifestEntry;
  /** Clon independiente: la experiencia lo puede modificar y debe liberarlo con dispose(). */
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  parts: Map<string, LoadedPart>;
  pivots: Map<string, THREE.Object3D>;
  anchors: Map<string, THREE.Object3D>;
  dispose(): void;
}

// ───────────────────────────── Gestos (núcleo → experiencia) ─────────────────────────────

/**
 * Todas las coordenadas van en el marco "mesa local" (0,0,0 = centro del tope, Y arriba, metros).
 * `ray` es el rayo de la cámara por el dedo; `point` su intersección con el plano del tope (Y = 0),
 * o null si el rayo no lo corta. Los objetos se reutilizan entre eventos: copia lo que guardes.
 */
interface GestureBase {
  ray: THREE.Ray;
  point: THREE.Vector3 | null;
  /** Posición en pantalla normalizada 0..1 (para menús contextuales). */
  screen: { x: number; y: number };
}
export type GesturePhase = 'start' | 'move' | 'end' | 'cancel';

export type GestureEvent =
  | (GestureBase & { type: 'tap' })
  | (GestureBase & { type: 'doubletap' })
  | (GestureBase & { type: 'longpress' })
  | (GestureBase & {
      type: 'drag';
      phase: GesturePhase;
      /** Punto del tope donde empezó el arrastre. */
      origin: THREE.Vector3 | null;
      /** Si el arrastre empezó en un ítem de una bandeja (`tray`) de la UI. */
      fromTray?: { trayId: string; itemId: string };
    })
  | (GestureBase & { type: 'rotate'; phase: GesturePhase; /** Δ yaw (rad) desde el evento anterior. */ deltaAngle: number })
  | (GestureBase & { type: 'pinch'; phase: GesturePhase; /** Factor de escala desde el evento anterior. */ deltaScale: number });

// ───────────────────────────── Controles (experiencia → UI) ─────────────────────────────

interface ControlBase {
  id: string;
  labelKey: string;
  /** Agrupa controles en el HUD (p. ej. 'main', 'view', 'challenge'). */
  group?: string;
  disabled?: boolean;
}

export type ControlSpec =
  | (ControlBase & { kind: 'slider'; min: number; max: number; step?: number; value: number; format?: 'percent' | 'number' | 'speed'; onInput(v: number): void })
  | (ControlBase & { kind: 'toggle'; value: boolean; onChange(v: boolean): void })
  | (ControlBase & { kind: 'button'; icon?: string; onPress(): void })
  | (ControlBase & { kind: 'tray'; items: { id: string; labelKey: string; icon: string; disabled?: boolean }[]; onPick(id: string): void })
  | (ControlBase & { kind: 'readout'; value(): string | number })
  /** Ampliación 0.1.0: selector de una opción (modos, presets, velocidades). */
  | (ControlBase & { kind: 'select'; options: { id: string; labelKey: string; icon?: string }[]; value: string; onChange(id: string): void });

export type ControlKind = ControlSpec['kind'];

// ───────────────────────────── Estado de la app (núcleo → UI) ─────────────────────────────

export type AppState =
  | 'boot' // comprobando soporte
  | 'operator' // sin WebXR: pantalla para el operador
  | 'home' // selector 2D (en modo sala, encima de la sesión AR que sigue abierta)
  | 'intro' // modal de 3 pasos de la experiencia elegida
  | 'scan' // XR iniciado, buscando superficie
  | 'lock' // Table Lock
  | 'place' // retícula para ubicar
  | 'explore'; // experiencia activa

export type LockPhase = 'aim' | 'adjust';
export type ReticleState = 'ok' | 'warn' | 'hidden';

export interface AppSnapshot {
  state: AppState;
  experience: ExperienceId | null;
  /** Precarga 0..1 de la experiencia elegida. */
  loadProgress: number;
  lockPhase: LockPhase;
  reticle: ReticleState;
  /** Modo de colocación de la experiencia cargada (P-010), o null si no hay. */
  placeMode: 'point' | 'table' | null;
  /** Velo "Reubicando…" (tracking perdido con histéresis). */
  relocating: boolean;
  /** Sugerir *Recalibrar mesa* (deriva de altura o tracking perdido > 8 s). */
  suggestRecalibrate: boolean;
  /** Aviso de inactividad: segundos restantes, o null si no hay aviso. */
  idleCountdown: number | null;
  /** Panel *Cambiar experiencia* abierto (dentro de AR). */
  switcherOpen: boolean;
  helpOpen: boolean;
  muted: boolean;
  /** Modo simulador de escritorio (?sim=1). */
  simulator: boolean;
  /** Motivo técnico para la pantalla de operador (nunca se muestra al visitante). */
  operatorReason: string | null;
  quality: QualityLevel;
  /** Ampliación 0.1.2 · modo sala (?sala=1, D25): la sesión AR y la calibración siguen entre visitantes. */
  room: boolean;
  /** Hay sesión AR abierta (en modo sala sigue abierta también en HOME e INTRO). */
  xrActive: boolean;
  /** Modo sala con la mesa ya calibrada: al entrar se va directo a PLACE. */
  tableReady: boolean;
}

/** Acciones que la UI pide al núcleo. */
export type UiAction =
  | { type: 'pick-experience'; id: ExperienceId } // tarjeta de HOME o panel de cambio
  | { type: 'enter-ar' } // botón final del modal (gesto de usuario que inicia XR)
  | { type: 'close-intro' }
  | { type: 'lock-nudge'; dx?: number; dz?: number; dyawDeg?: number } // ±1 cm / ±1°, ejes de la mesa
  | { type: 'lock-confirm' }
  | { type: 'recalibrate' }
  | { type: 'reset' }
  | { type: 'exit' }
  | { type: 'switcher'; open: boolean }
  | { type: 'help'; open: boolean }
  | { type: 'idle-continue' }
  | { type: 'mute'; muted: boolean }
  | { type: 'operator-restart' };

/** Mapa de eventos de la app. Clave → payload. */
export interface AppEvents {
  // núcleo → UI
  'app:state': AppSnapshot;
  /** La experiencia cambió su lista de controles: la UI vuelve a llamar getControls(). */
  'controls:changed': { experience: ExperienceId };
  'toast': { key: string; vars?: Record<string, string | number>; tone?: 'info' | 'success' | 'warn' };
  /** Modal de contenido (informe, logro, ficha de capa). */
  'modal:open': { id: string; titleKey: string; bodyKey: string; vars?: Record<string, string | number>; actions?: { id: string; labelKey: string }[] };
  'modal:action': { id: string; action: string };
  'contextmenu:open': { screen: { x: number; y: number }; items: { id: string; labelKey: string; icon?: string }[] };
  'contextmenu:pick': { id: string };
  /** Ficha flotante anclada a un objeto 3D (null = cerrar). */
  'label:show': { id: string; anchor: THREE.Object3D; titleKey: string; bodyKey?: string; actions?: { id: string; labelKey: string }[] } | null;
  'label:action': { id: string; action: string };
  // UI → núcleo
  'ui:action': UiAction;
  /** Arrastre que empieza en un ítem de bandeja (coordenadas de pantalla en px CSS). */
  'ui:tray-drag': { trayId: string; itemId: string; phase: GesturePhase; x: number; y: number };
  /** Cualquier toque del visitante (reinicia el temporizador de inactividad). */
  'ui:activity': void;
  // experiencia → todos
  'explode:set': { value: number };
  'part:selected': { modelId: string; partId: string | null };
  'challenge:done': { experience: ExperienceId; challenge: string; success: boolean };
  'sound': { id: SoundId };
}

export type SoundId = 'tap' | 'snap' | 'success' | 'fail' | 'whoosh' | 'place';

export interface TypedEmitter<E> {
  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void;
  off<K extends keyof E>(type: K, fn: (payload: E[K]) => void): void;
  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

// ───────────────────────────── Experiencias ─────────────────────────────

export interface ExperienceContext {
  /** Hijo del marco "mesa local": (0,0,0) = centro del tope. */
  root: THREE.Group;
  table: TableSpec;
  bounds: TableBounds;
  assets: { loadModel(id: string): Promise<LoadedModel> };
  t: Translate;
  events: TypedEmitter<AppEvents>;
  fx: FxKit;
  /** Cámara actual (XR o simulador), solo lectura: para billboards y LOD. */
  camera: THREE.Camera;
  /** Nivel de calidad vigente; cambia con 'app:state'. */
  quality(): QualityLevel;
}

export interface ExperiencePlacement {
  /** 'point': el visitante elige un punto con la retícula. 'table': ocupa toda la mesa (el toque solo confirma). */
  mode: 'point' | 'table';
  /** Radio que ocupa el objeto sobre el tope (m), para el clamp. */
  footprintRadius: number;
  /** Escala permitida por pellizco; omitir = sin pellizco. */
  scaleRange?: [number, number];
}

export interface Experience {
  id: ExperienceId;
  placement: ExperiencePlacement;
  load(ctx: ExperienceContext, onProgress?: (p: number) => void): Promise<void>;
  /** El visitante confirmó la ubicación (`at` en mesa local; centro del tope si mode = 'table'). */
  onPlaced(at: THREE.Vector3): void;
  update(dt: number, t: number): void;
  /** Devuelve true si consumió el gesto; si no, el núcleo aplica la manipulación por defecto (mover/girar/escalar). */
  onGesture(g: GestureEvent): boolean | void;
  /**
   * Objeto (hijo de `ctx.root`) que el núcleo mueve/gira/escala con los gestos no consumidos.
   * null o ausente = sin manipulación por defecto. Su `scale.x` es la escala del visitante (D9).
   */
  getManipulationTarget?(): THREE.Object3D | null;
  getControls(): ControlSpec[];
  reset(): void;
  dispose(): void;
}

/** Metadatos para HOME. Las claves de texto siguen `home.card.<id>.*` en common.json. */
export interface ExperienceMeta {
  id: ExperienceId;
  /** Ruta de la ilustración en /public (placeholder hasta tener arte final). */
  image: string;
  /** Ids de modelos a precargar al tocar la tarjeta. */
  preload: string[];
  factory: () => Promise<Experience>;
}

// ───────────────────────────── FX, audio y UI (Agente 3 implementa) ─────────────────────────────

export interface TableEdgeFx {
  object: THREE.Object3D;
  /** Rectángulo 100×70 cm. `lock` = brillante (calibrando); `rest` = línea sutil (~0,35). */
  setMode(mode: 'lock' | 'rest' | 'hidden'): void;
  /** Pulso breve al interactuar. */
  pulse(): void;
  /** Barrido de luz por el perímetro al cerrar el Table Lock. */
  sweep(): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}

export interface ReticleFx {
  object: THREE.Object3D;
  setState(s: ReticleState): void;
  update(dt: number): void;
  dispose(): void;
}

export interface FxKit {
  createTableEdge(table: TableSpec): TableEdgeFx;
  createReticle(): ReticleFx;
  /** Sello de marca: líneas de luz verde desde el borde LED que condensan el objeto. */
  appear(target: THREE.Object3D, opts?: { from?: 'edge' | 'above'; durationMs?: number }): Promise<void>;
  /** El objeto se disuelve en líneas de luz. No lo elimina de la escena. */
  disappear(target: THREE.Object3D, opts?: { durationMs?: number }): Promise<void>;
  /** Contorno de selección (null = quitar). */
  outline(target: THREE.Object3D | null): void;
  /** Material fantasma (opacidad 0,15) sobre los objetos dados; `false` lo revierte. */
  ghost(targets: THREE.Object3D[], on: boolean): void;
  setQuality(q: QualityLevel): void;
  update(dt: number): void;
  dispose(): void;
}

export interface AudioKit {
  play(id: SoundId): void;
  setMuted(m: boolean): void;
  dispose(): void;
}

/** Lo que el núcleo ofrece a la UI. */
export interface UiApi {
  events: TypedEmitter<AppEvents>;
  t: Translate;
  getState(): AppSnapshot;
  /** Controles de la experiencia activa (vacío fuera de EXPLORE). */
  getControls(): ControlSpec[];
  experiences: readonly ExperienceId[];
  /** Proyecta un objeto 3D a pantalla (px CSS). Escribe en `out` y devuelve `out`. */
  project(target: THREE.Object3D, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean };
}

/** Gancho de desarrollo `window.__cauce` (solo DEV) que usan las pruebas de humo (P-004). */
export interface CauceDevHook {
  app: { events: TypedEmitter<AppEvents> };
  getState(): AppSnapshot;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export interface UiModule {
  /** `root` es el elemento del DOM Overlay; la capa de gestos ya existe dentro (id="gesture-layer"). */
  mount(root: HTMLElement, api: UiApi): void;
  /** Se llama cada frame (para fichas flotantes); la UI decide cada cuánto refresca `readout`s. */
  tick(dt: number): void;
  dispose(): void;
}
