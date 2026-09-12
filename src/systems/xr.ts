/* ── WebXR Immersive-VR subsystem for GIGAHRUSH ────────────────────
 *
 * Full stereoscopic VR pipeline for Meta Quest 2 and WebXR headsets:
 * - Session initialization & lifecycle ('immersive-vr')
 * - 6DoF head tracking with orientation quaternion -> yaw/pitch
 * - Dual-eye stereoscopic geometry with true IPD offset & FOV projection
 * - Meta Quest 2 Touch controller input mapping into universal InputFrame
 * - Tactile haptic feedback integration
 */

import type { CameraView } from './camera';
import type { InputFrame } from './input_intent';
import {
  mergeAxis,
  pressAction,
  releaseAction,
  setActionHeld,
  setActiveDevice,
} from './input_intent';
import type { InputState } from '../core/types';
import type { World } from '../core/world';

export interface XREyeCameraInfo {
  camera: CameraView;
  viewport: { x: number; y: number; width: number; height: number };
  eye: 'left' | 'right' | 'none';
}

export interface XRTrackingState {
  headYaw: number;
  headPitch: number;
  headPosition: { x: number; y: number; z: number };
  snapTurnYaw: number;
}

class WebXRManager {
  private session: XRSession | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private glLayer: XRWebGLLayer | null = null;
  private viewerPose: XRViewerPose | null = null;

  private headYaw = 0;
  private headPitch = 0;
  private headPosition = { x: 0, y: 1.6, z: 0 };
  private snapTurnYaw = 0;
  private snapTurnHeld = false;

  // Controller edge state tracking
  private prevButtonStates = {
    leftTrigger: false,
    leftGrip: false,
    leftX: false,
    leftY: false,
    leftStick: false,
    rightTrigger: false,
    rightGrip: false,
    rightA: false,
    rightB: false,
    rightStick: false,
  };

  private supported: boolean | null = null;
  private onSessionStartedCb: ((session: XRSession) => void) | null = null;
  private onSessionEndedCb: (() => void) | null = null;

  async isSupported(): Promise<boolean> {
    if (this.supported !== null) return this.supported;
    if (typeof navigator === 'undefined' || !navigator.xr) {
      this.supported = false;
      return false;
    }
    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-vr');
      return this.supported;
    } catch {
      this.supported = false;
      return false;
    }
  }

  isActive(): boolean {
    return this.session !== null && this.glLayer !== null;
  }

  getSession(): XRSession | null {
    return this.session;
  }

  getGLLayer(): XRWebGLLayer | null {
    return this.glLayer;
  }

  getViewerPose(): XRViewerPose | null {
    return this.viewerPose;
  }

  getTrackingState(): XRTrackingState {
    return {
      headYaw: this.headYaw,
      headPitch: this.headPitch,
      headPosition: { ...this.headPosition },
      snapTurnYaw: this.snapTurnYaw,
    };
  }

  resetSnapTurn(): void {
    this.snapTurnYaw = 0;
  }

  async startSession(
    gl: WebGL2RenderingContext,
    onStarted?: (session: XRSession) => void,
    onEnded?: () => void,
  ): Promise<boolean> {
    if (this.session) return true;
    const supported = await this.isSupported();
    if (!supported || !navigator.xr) return false;

    this.onSessionStartedCb = onStarted ?? null;
    this.onSessionEndedCb = onEnded ?? null;

    try {
      // Ensure WebGL context is compatible with the VR compositor
      if (typeof gl.makeXRCompatible === 'function') {
        await gl.makeXRCompatible();
      }

      let session: XRSession;
      try {
        session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking'],
        });
      } catch {
        // Fallback without local-floor if headset does not support room scale
        session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local', 'hand-tracking'],
        });
      }

      const glLayer = new XRWebGLLayer(session, gl, {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        ignoreDepthValues: false,
      });

      await session.updateRenderState({ baseLayer: glLayer });

      let refSpace: XRReferenceSpace;
      try {
        refSpace = await session.requestReferenceSpace('local-floor');
      } catch {
        refSpace = await session.requestReferenceSpace('local');
      }

      this.session = session;
      this.glLayer = glLayer;
      this.refSpace = refSpace;

      session.addEventListener('end', () => {
        this.cleanupSession();
      });

      if (this.onSessionStartedCb) {
        this.onSessionStartedCb(session);
      }

      return true;
    } catch (err) {
      console.error('[WebXR] Failed to start immersive-vr session:', err);
      this.cleanupSession();
      return false;
    }
  }

  async endSession(): Promise<void> {
    if (!this.session) return;
    try {
      await this.session.end();
    } catch (e) {
      console.warn('[WebXR] Error ending session:', e);
    } finally {
      this.cleanupSession();
    }
  }

  private cleanupSession(): void {
    this.session = null;
    this.refSpace = null;
    this.glLayer = null;
    this.viewerPose = null;
    this.headYaw = 0;
    this.headPitch = 0;
    this.snapTurnYaw = 0;
    this.snapTurnHeld = false;

    if (this.onSessionEndedCb) {
      this.onSessionEndedCb();
      this.onSessionEndedCb = null;
    }
    this.onSessionStartedCb = null;
  }

  updateFrame(frame: XRFrame): XRViewerPose | null {
    if (!this.session || !this.refSpace) return null;
    const pose = frame.getViewerPose(this.refSpace) ?? null;
    this.viewerPose = pose;

    if (pose) {
      const q = pose.transform.orientation;
      // Convert orientation quaternion to yaw and pitch
      const fx = -2 * (q.x * q.z + q.w * q.y);
      const fy = 2 * (q.w * q.x - q.y * q.z);
      const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));

      this.headYaw = Math.atan2(fx, -fz);
      this.headPitch = Math.asin(Math.max(-1, Math.min(1, fy)));

      this.headPosition.x = pose.transform.position.x;
      this.headPosition.y = pose.transform.position.y;
      this.headPosition.z = pose.transform.position.z;
    }

    return pose;
  }

  /**
   * Poll Meta Quest 2 Touch controllers and feed their actions directly into
   * the universal InputFrame and InputState.
   */
  pollControllers(frame: InputFrame, input: InputState): void {
    if (!this.session) return;
    const inputSources = this.session.inputSources;
    if (!inputSources || inputSources.length === 0) return;

    let anyInput = false;

    for (let i = 0; i < inputSources.length; i++) {
      const source = inputSources[i];
      const gp = source.gamepad;
      if (!gp || !gp.connected) continue;

      const handedness = source.handedness;

      // ── Left Controller: Move & Strafe, Tool, Sprint, Inventory ──
      if (handedness === 'left') {
        // Thumbstick axes
        const stickX = gp.axes.length > 2 ? gp.axes[2] : (gp.axes[0] ?? 0);
        const stickY = gp.axes.length > 3 ? gp.axes[3] : (gp.axes[1] ?? 0);

        const deadzone = 0.16;
        if (Math.abs(stickX) > deadzone) {
          mergeAxis(frame, 'moveX', stickX);
          anyInput = true;
        }
        if (Math.abs(stickY) > deadzone) {
          // In InputFrame moveY: positive is forward, negative is backward
          mergeAxis(frame, 'moveY', -stickY);
          anyInput = true;
        }

        // Trigger (buttons[0]): sprint hold
        const trigger = gp.buttons[0]?.pressed ?? false;
        if (trigger) {
          setActionHeld(frame, 'sprint', true);
          anyInput = true;
        }

        // Grip (buttons[1]): secondary sprint / crouch
        const grip = gp.buttons[1]?.pressed ?? false;
        if (grip) {
          setActionHeld(frame, 'sprint', true);
          anyInput = true;
        }

        // Thumbstick press (buttons[3]): sprint hold
        const stickBtn = gp.buttons[3]?.pressed ?? false;
        if (stickBtn) {
          setActionHeld(frame, 'sprint', true);
          anyInput = true;
        }

        // Button X (buttons[4]): Inventory
        const btnX = gp.buttons[4]?.pressed ?? false;
        if (btnX && !this.prevButtonStates.leftX) {
          pressAction(frame, 'inventory');
          this.hapticPulse(source, 0.4, 20);
          anyInput = true;
        } else if (!btnX && this.prevButtonStates.leftX) {
          releaseAction(frame, 'inventory');
        } else if (btnX) {
          setActionHeld(frame, 'inventory', true);
        }
        this.prevButtonStates.leftX = btnX;

        // Button Y (buttons[5]): Map / Quest Log
        const btnY = gp.buttons[5]?.pressed ?? false;
        if (btnY && !this.prevButtonStates.leftY) {
          pressAction(frame, 'map');
          this.hapticPulse(source, 0.4, 20);
          anyInput = true;
        } else if (!btnY && this.prevButtonStates.leftY) {
          releaseAction(frame, 'map');
        } else if (btnY) {
          setActionHeld(frame, 'map', true);
        }
        this.prevButtonStates.leftY = btnY;
      }

      // ── Right Controller: Snap/Smooth Turn, Attack, Tool, Interact, Menu ──
      if (handedness === 'right') {
        const stickX = gp.axes.length > 2 ? gp.axes[2] : (gp.axes[0] ?? 0);
        const stickY = gp.axes.length > 3 ? gp.axes[3] : (gp.axes[1] ?? 0);

        // Snap Turn: flick stick left/right by 45 degrees (PI / 4)
        const snapThreshold = 0.55;
        const resetThreshold = 0.22;
        if (stickX > snapThreshold && !this.snapTurnHeld) {
          this.snapTurnYaw += Math.PI / 4;
          this.snapTurnHeld = true;
          this.hapticPulse(source, 0.5, 25);
          anyInput = true;
        } else if (stickX < -snapThreshold && !this.snapTurnHeld) {
          this.snapTurnYaw -= Math.PI / 4;
          this.snapTurnHeld = true;
          this.hapticPulse(source, 0.5, 25);
          anyInput = true;
        } else if (Math.abs(stickX) < resetThreshold) {
          this.snapTurnHeld = false;
        }

        // Stick Y: Menu navigation up/down
        if (stickY < -0.5) {
          input.invUp = true;
          anyInput = true;
        } else if (stickY > 0.5) {
          input.invDn = true;
          anyInput = true;
        }

        // Trigger (buttons[0]): Attack
        const trigger = gp.buttons[0]?.pressed ?? false;
        if (trigger && !this.prevButtonStates.rightTrigger) {
          pressAction(frame, 'attack');
          this.hapticPulse(source, 0.8, 35);
          anyInput = true;
        } else if (!trigger && this.prevButtonStates.rightTrigger) {
          releaseAction(frame, 'attack');
        } else if (trigger) {
          setActionHeld(frame, 'attack', true);
          anyInput = true;
        }
        this.prevButtonStates.rightTrigger = trigger;

        // Grip (buttons[1]): Tool / Flashlight hold
        const grip = gp.buttons[1]?.pressed ?? false;
        if (grip && !this.prevButtonStates.rightGrip) {
          pressAction(frame, 'useTool');
          this.hapticPulse(source, 0.3, 15);
          anyInput = true;
        } else if (!grip && this.prevButtonStates.rightGrip) {
          releaseAction(frame, 'useTool');
        } else if (grip) {
          setActionHeld(frame, 'useTool', true);
          anyInput = true;
        }
        this.prevButtonStates.rightGrip = grip;

        // Button A (buttons[4]): Interact (Doors, Containers, Dialogue, Accept)
        const btnA = gp.buttons[4]?.pressed ?? false;
        if (btnA && !this.prevButtonStates.rightA) {
          pressAction(frame, 'interact');
          input.interact = true;
          input.interactHeld = true;
          input.menuAccept = true;
          this.hapticPulse(source, 0.6, 30);
          anyInput = true;
        } else if (!btnA && this.prevButtonStates.rightA) {
          releaseAction(frame, 'interact');
          input.interactHeld = false;
        } else if (btnA) {
          setActionHeld(frame, 'interact', true);
          input.interactHeld = true;
        }
        this.prevButtonStates.rightA = btnA;

        // Button B (buttons[5]): Game Menu / Close / Cancel
        const btnB = gp.buttons[5]?.pressed ?? false;
        if (btnB && !this.prevButtonStates.rightB) {
          pressAction(frame, 'gameMenu');
          pressAction(frame, 'menuClose');
          input.menuClose = true;
          this.hapticPulse(source, 0.4, 20);
          anyInput = true;
        } else if (!btnB && this.prevButtonStates.rightB) {
          releaseAction(frame, 'gameMenu');
          releaseAction(frame, 'menuClose');
        }
        this.prevButtonStates.rightB = btnB;
      }
    }

    if (anyInput) {
      setActiveDevice(frame, 'gamepad');
      frame.hardware.gamepadConnected = true;
      frame.hardware.gamepadMappingStandard = true;
      frame.hardware.gamepadLabel = 'Meta Quest Touch VR';
    }
  }

  /**
   * Provide tactile haptic vibration through the Quest Touch controller
   */
  hapticPulse(source: XRInputSource, intensity = 0.5, durationMs = 25): void {
    try {
      const actuators = source.gamepad?.hapticActuators;
      if (actuators && actuators.length > 0 && typeof actuators[0].pulse === 'function') {
        actuators[0].pulse(Math.max(0, Math.min(1, intensity)), durationMs);
      }
    } catch {
      // Ignored if haptics unsupported
    }
  }

  /**
   * Generate stereoscopic per-eye camera poses based on head tracking,
   * snap turn, eye IPD offset, and headset projection matrix.
   */
  computeEyeCamera(
    baseCamera: CameraView,
    view: XRView,
    world: World,
  ): CameraView {
    const totalAngle = baseCamera.angle + this.snapTurnYaw + this.headYaw;
    const totalPitch = Math.max(-0.85, Math.min(0.85, (baseCamera.pitch || 0) + Math.tan(this.headPitch)));

    // Scale real-world meters to game grid units (1 cell = 2 meters)
    const WORLD_SCALE = 0.5;

    // View position offset (IPD offset relative to head center)
    let eyeOffsetMeters = view.transform.position.x;
    if (Math.abs(eyeOffsetMeters) < 0.005) {
      eyeOffsetMeters = view.eye === 'left' ? -0.032 : view.eye === 'right' ? 0.032 : 0;
    }
    const ipdUnits = eyeOffsetMeters * WORLD_SCALE;

    // Lateral right vector in world grid coordinates: (sin(totalAngle), -cos(totalAngle))
    let eyeX = baseCamera.x + Math.sin(totalAngle) * ipdUnits;
    let eyeY = baseCamera.y - Math.cos(totalAngle) * ipdUnits;

    // Guard against eye clipping through solid cells
    const cellX = Math.floor(eyeX);
    const cellY = Math.floor(eyeY);
    if (world.idx(cellX, cellY) >= 0 && world.solid(cellX, cellY)) {
      eyeX = baseCamera.x;
      eyeY = baseCamera.y;
    }

    // Room-scale height: standing reference is 1.6m
    const headHeightMeters = view.transform.position.y;
    const heightDeltaUnits = (headHeightMeters - 1.6) * WORLD_SCALE;
    const eyeHeight = Math.max(0.12, Math.min(0.88, (baseCamera.height || 0.5) + heightDeltaUnits));

    // Optical field of view from headset lens projection matrix
    const p0 = view.projectionMatrix[0];
    const eyeFov = p0 > 0.01 ? 2.0 * Math.atan(1.0 / p0) : (baseCamera.fovRadians || Math.PI / 2);

    return {
      ...baseCamera,
      x: eyeX,
      y: eyeY,
      angle: totalAngle,
      pitch: totalPitch,
      height: eyeHeight,
      fovRadians: eyeFov,
    };
  }
}

export const xrManager = new WebXRManager();
