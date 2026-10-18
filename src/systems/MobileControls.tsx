import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Car,
  Disc,
  Eye,
  Hand,
  LogOut,
  Plane,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  CameraMode,
  ControlInputState,
  InteractiveObject,
} from './GameState';

interface MobileControlsProps {
  inputRef: React.MutableRefObject<ControlInputState>;
  nearbyInteractable: InteractiveObject | null;
  isSprinting: boolean;
  isDriving: boolean;
  vehicleSpeedKmh: number;
  cameraMode: CameraMode;
  cinematicShotIndex: number;
  onSelectCinematicShot: (shotIndex: number) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  inputRef,
  nearbyInteractable,
  isSprinting,
  isDriving,
  vehicleSpeedKmh,
  cameraMode,
  cinematicShotIndex,
  onSelectCinematicShot,
}) => {
  // Left Movement Analog Joystick State (On foot)
  const [moveJoyKnob, setMoveJoyKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const moveJoyTouchId = useRef<number | null>(null);
  const moveJoyOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const maxJoyRadius = 46;
  const deadzoneRatio = 0.08;

  // Right Camera Look Analog Joystick State (On foot)
  const [camJoyKnob, setCamJoyKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const camJoyTouchId = useRef<number | null>(null);
  const camJoyOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const camLookOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sprint Toggle
  const [sprintToggle, setSprintToggle] = useState<boolean>(false);

  // GTA Driving Steering Buttons State
  const steerLeftActive = useRef<boolean>(false);
  const steerRightActive = useRef<boolean>(false);
  const [steerLeftPressed, setSteerLeftPressed] = useState<boolean>(false);
  const [steerRightPressed, setSteerRightPressed] = useState<boolean>(false);

  // Fallback Full-Screen Touch Camera Rotate (Right half) & Pinch Zoom
  const lookPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevPinchDist = useRef<number | null>(null);

  // Reset Left Movement Joystick
  const resetMoveJoystick = useCallback(() => {
    moveJoyTouchId.current = null;
    setMoveJoyKnob({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  }, [inputRef]);

  // Reset Right Camera Joystick
  const resetCamJoystick = useCallback(() => {
    camJoyTouchId.current = null;
    setCamJoyKnob({ x: 0, y: 0 });
    camLookOffsetRef.current = { x: 0, y: 0 };
  }, []);

  // Sync Steering Button State to inputRef.moveX
  const updateSteering = useCallback(() => {
    if (steerLeftActive.current && !steerRightActive.current) {
      inputRef.current.moveX = -1;
    } else if (steerRightActive.current && !steerLeftActive.current) {
      inputRef.current.moveX = 1;
    } else {
      inputRef.current.moveX = 0;
    }
  }, [inputRef]);

  // Animation Loop for continuous Camera Stick Rotation
  useEffect(() => {
    let animId: number = 0;
    const tick = () => {
      const { x, y } = camLookOffsetRef.current;
      if (x !== 0 || y !== 0) {
        inputRef.current.lookDeltaX += x * 0.052;
        inputRef.current.lookDeltaY += y * 0.040;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [inputRef]);

  // Keyboard controls for desktop development & testing
  useEffect(() => {
    const keys = new Set<string>();

    const syncKeys = () => {
      if (isDriving) {
        let steer = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
        inputRef.current.moveX = steer;

        let throttle = 0;
        let brake = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) throttle = 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) brake = 1;
        inputRef.current.vehicleThrottle = throttle;
        inputRef.current.vehicleBrake = brake;
      } else {
        let kx = 0;
        let ky = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;

        if (kx !== 0 && ky !== 0) {
          const inv = 1 / Math.SQRT2;
          kx *= inv;
          ky *= inv;
        }

        if (moveJoyTouchId.current === null) {
          inputRef.current.moveX = kx;
          inputRef.current.moveY = ky;
        }
      }

      let dv = 0;
      if (keys.has('KeyE')) dv += 1;
      if (keys.has('KeyQ')) dv -= 1;
      inputRef.current.droneVertical = dv;

      inputRef.current.sprintActive =
        keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintToggle;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'Space') {
        if (isDriving) {
          inputRef.current.vehicleHandbrake = true;
          inputRef.current.vehicleBrake = 1;
        } else {
          inputRef.current.jumpRequested = true;
        }
      }
      if (e.code === 'KeyF' || e.code === 'Enter') {
        inputRef.current.interactRequested = true;
      }
      if (e.code === 'KeyH') {
        inputRef.current.vehicleHornRequested = true;
      }
      syncKeys();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (e.code === 'Space') {
        if (isDriving) {
          inputRef.current.vehicleHandbrake = false;
          inputRef.current.vehicleBrake = 0;
        }
      }
      syncKeys();
    };

    const onWheel = (e: WheelEvent) => {
      inputRef.current.pinchZoomDelta += e.deltaY * 0.003;
    };

    const onWindowBlurOrHide = () => {
      keys.clear();
      resetMoveJoystick();
      resetCamJoystick();
      steerLeftActive.current = false;
      steerRightActive.current = false;
      setSteerLeftPressed(false);
      setSteerRightPressed(false);
      lookPointers.current.clear();
      prevPinchDist.current = null;
      inputRef.current.droneVertical = 0;
      inputRef.current.vehicleThrottle = 0;
      inputRef.current.vehicleBrake = 0;
      inputRef.current.vehicleHandbrake = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('blur', onWindowBlurOrHide);
    document.addEventListener('visibilitychange', onWindowBlurOrHide);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onWindowBlurOrHide);
      document.removeEventListener('visibilitychange', onWindowBlurOrHide);
    };
  }, [inputRef, sprintToggle, resetMoveJoystick, resetCamJoystick, isDriving]);

  // ---------------------------------------------------------------------------
  // LEFT MOVEMENT JOYSTICK HANDLERS (ON FOOT)
  // ---------------------------------------------------------------------------
  const handleMoveJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (moveJoyTouchId.current !== null) return;
    moveJoyTouchId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    moveJoyOrigin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    updateMoveJoystick(e.clientX, e.clientY);
  };

  const handleMoveJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (moveJoyTouchId.current !== e.pointerId) return;
    updateMoveJoystick(e.clientX, e.clientY);
  };

  const handleMoveJoyEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (moveJoyTouchId.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    resetMoveJoystick();
  };

  const updateMoveJoystick = (clientX: number, clientY: number) => {
    let dx = clientX - moveJoyOrigin.current.x;
    let dy = clientY - moveJoyOrigin.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxJoyRadius) {
      dx = (dx / dist) * maxJoyRadius;
      dy = (dy / dist) * maxJoyRadius;
    }

    const normDist = Math.min(1, dist / maxJoyRadius);
    if (normDist < deadzoneRatio) {
      setMoveJoyKnob({ x: 0, y: 0 });
      inputRef.current.moveX = 0;
      inputRef.current.moveY = 0;
      return;
    }

    setMoveJoyKnob({ x: dx, y: dy });

    const rescaledMag = (normDist - deadzoneRatio) / (1 - deadzoneRatio);
    const angle = Math.atan2(dy, dx);
    inputRef.current.moveX = Math.cos(angle) * rescaledMag;
    inputRef.current.moveY = Math.sin(angle) * rescaledMag;
  };

  // ---------------------------------------------------------------------------
  // RIGHT CAMERA LOOK JOYSTICK HANDLERS (ON FOOT)
  // ---------------------------------------------------------------------------
  const handleCamJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (camJoyTouchId.current !== null) return;
    camJoyTouchId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    camJoyOrigin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    updateCamJoystick(e.clientX, e.clientY);
  };

  const handleCamJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (camJoyTouchId.current !== e.pointerId) return;
    updateCamJoystick(e.clientX, e.clientY);
  };

  const handleCamJoyEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (camJoyTouchId.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    resetCamJoystick();
  };

  const updateCamJoystick = (clientX: number, clientY: number) => {
    let dx = clientX - camJoyOrigin.current.x;
    let dy = clientY - camJoyOrigin.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxJoyRadius) {
      dx = (dx / dist) * maxJoyRadius;
      dy = (dy / dist) * maxJoyRadius;
    }

    const normDist = Math.min(1, dist / maxJoyRadius);
    if (normDist < deadzoneRatio) {
      setCamJoyKnob({ x: 0, y: 0 });
      camLookOffsetRef.current = { x: 0, y: 0 };
      return;
    }

    setCamJoyKnob({ x: dx, y: dy });

    const rescaledMag = (normDist - deadzoneRatio) / (1 - deadzoneRatio);
    const angle = Math.atan2(dy, dx);
    camLookOffsetRef.current = {
      x: Math.cos(angle) * rescaledMag,
      y: Math.sin(angle) * rescaledMag,
    };
  };

  // ---------------------------------------------------------------------------
  // FALLBACK RIGHT SCREEN TOUCH ROTATE & PINCH ZOOM
  // ---------------------------------------------------------------------------
  const handleLookStart = (e: React.PointerEvent<HTMLDivElement>) => {
    lookPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (lookPointers.current.size === 2) {
      const pts = Array.from(lookPointers.current.values());
      prevPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lookPointers.current.has(e.pointerId)) return;

    const prev = lookPointers.current.get(e.pointerId)!;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    lookPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (lookPointers.current.size === 1) {
      inputRef.current.lookDeltaX += dx * 0.0065;
      inputRef.current.lookDeltaY += dy * 0.0052;
    } else if (lookPointers.current.size === 2) {
      const pts = Array.from(lookPointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (prevPinchDist.current !== null) {
        const deltaPinch = prevPinchDist.current - dist;
        inputRef.current.pinchZoomDelta += deltaPinch * 0.015;
      }
      prevPinchDist.current = dist;
    }
  };

  const handleLookEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lookPointers.current.has(e.pointerId)) return;
    lookPointers.current.delete(e.pointerId);
    prevPinchDist.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const toggleSprint = () => {
    const next = !sprintToggle;
    setSprintToggle(next);
    inputRef.current.sprintActive = next;
  };

  // Compute Current Gear for Driving Dashboard (D / R)
  const isReverseGear =
    vehicleSpeedKmh < -0.5 ||
    (Math.abs(vehicleSpeedKmh) <= 0.5 && inputRef.current.vehicleBrake > 0.05);
  const gearIndicator = isReverseGear ? 'R' : 'D';

  const isNearVehicle = nearbyInteractable?.type === 'vehicle';

  return (
    <div className="fixed inset-0 pointer-events-none z-10 select-none touch-none">
      {/* Right Half Touch Area: Fallback camera orbit and 2-finger pinch zoom */}
      <div
        onPointerDown={handleLookStart}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookEnd}
        onPointerCancel={handleLookEnd}
        style={{
          top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          right: 0,
          bottom: 0,
          width: '58%',
        }}
        className="absolute pointer-events-auto"
        aria-label="Touch camera look and pinch zoom area"
      />

      {/* =======================================================================
          LEFT SIDE CONTROLS
          - On Foot: Large Analog Movement Joystick
          - In Vehicle: GTA-Style Large LEFT & RIGHT Steering Buttons
          ======================================================================= */}
      {!isDriving ? (
        /* ON FOOT: LEFT MOVEMENT JOYSTICK */
        <div
          key="left-joystick"
          onPointerDown={handleMoveJoyStart}
          onPointerMove={handleMoveJoyMove}
          onPointerUp={handleMoveJoyEnd}
          onPointerCancel={handleMoveJoyEnd}
          onLostPointerCapture={resetMoveJoystick}
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
            left: 'max(1rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
          }}
          className="
            absolute
            w-32 h-32 sm:w-36 sm:h-36 rounded-full
            bg-slate-950/75 backdrop-blur-md
            border-2 border-white/25 shadow-2xl
            flex items-center justify-center
            pointer-events-auto
            transition-opacity duration-200
          "
          aria-label="Movement joystick"
        >
          <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full border border-white/15 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-white/40 -translate-y-8 sm:-translate-y-9 font-bold">
              MOVE
            </span>
          </div>

          <div
            style={{
              transform: `translate3d(${moveJoyKnob.x}px, ${moveJoyKnob.y}px, 0)`,
            }}
            className={`
              absolute w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl border-2 transition-colors duration-75
              flex items-center justify-center pointer-events-none
              ${
                isSprinting
                  ? 'bg-amber-400/95 border-amber-200 shadow-amber-500/30'
                  : 'bg-white/90 border-white shadow-white/20'
              }
            `}
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900/30 border border-slate-950/40" />
          </div>
        </div>
      ) : (
        /* DRIVING: GTA-STYLE LEFT & RIGHT STEERING BUTTONS */
        <div
          key="left-steering-buttons"
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
            left: 'max(1rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
          }}
          className="absolute flex items-center gap-3 pointer-events-auto transition-opacity duration-200"
        >
          {/* STEER LEFT BUTTON (At least 64px thumb target) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              steerLeftActive.current = true;
              setSteerLeftPressed(true);
              updateSteering();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              steerLeftActive.current = false;
              setSteerLeftPressed(false);
              updateSteering();
            }}
            onPointerCancel={() => {
              steerLeftActive.current = false;
              setSteerLeftPressed(false);
              updateSteering();
            }}
            onPointerLeave={() => {
              steerLeftActive.current = false;
              setSteerLeftPressed(false);
              updateSteering();
            }}
            className={`
              w-18 h-18 sm:w-20 sm:h-20 min-w-[68px] min-h-[68px] rounded-2xl
              backdrop-blur-md border-2 shadow-2xl
              flex flex-col items-center justify-center gap-0.5
              transition-all duration-75 active:scale-95
              ${
                steerLeftPressed
                  ? 'bg-emerald-500 border-emerald-200 text-slate-950 shadow-emerald-500/40 scale-95'
                  : 'bg-slate-950/80 border-white/25 text-white shadow-black/50'
              }
            `}
            aria-label="Steer Left"
          >
            <ArrowLeft className="w-7 h-7 stroke-[2.5]" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              LEFT
            </span>
          </button>

          {/* STEER RIGHT BUTTON (At least 64px thumb target) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              steerRightActive.current = true;
              setSteerRightPressed(true);
              updateSteering();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              steerRightActive.current = false;
              setSteerRightPressed(false);
              updateSteering();
            }}
            onPointerCancel={() => {
              steerRightActive.current = false;
              setSteerRightPressed(false);
              updateSteering();
            }}
            onPointerLeave={() => {
              steerRightActive.current = false;
              setSteerRightPressed(false);
              updateSteering();
            }}
            className={`
              w-18 h-18 sm:w-20 sm:h-20 min-w-[68px] min-h-[68px] rounded-2xl
              backdrop-blur-md border-2 shadow-2xl
              flex flex-col items-center justify-center gap-0.5
              transition-all duration-75 active:scale-95
              ${
                steerRightPressed
                  ? 'bg-emerald-500 border-emerald-200 text-slate-950 shadow-emerald-500/40 scale-95'
                  : 'bg-slate-950/80 border-white/25 text-white shadow-black/50'
              }
            `}
            aria-label="Steer Right"
          >
            <ArrowRight className="w-7 h-7 stroke-[2.5]" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              RIGHT
            </span>
          </button>
        </div>
      )}

      {/* =======================================================================
          BOTTOM CENTER DASHBOARD: SPEED READOUT & GEAR (D / R)
          Only displayed when driving the 4x4 SUV
          ======================================================================= */}
      {isDriving && (
        <div
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
          }}
          className="
            absolute left-1/2 -translate-x-1/2
            px-4 py-2 rounded-2xl
            bg-slate-950/85 backdrop-blur-md border-2 border-white/20
            shadow-2xl flex items-center gap-3 pointer-events-none
          "
        >
          {/* Automatic Transmission Gear Indicator (D / R) */}
          <div
            className={`
              w-9 h-9 rounded-xl flex items-center justify-center font-black text-base shadow-md
              ${
                gearIndicator === 'D'
                  ? 'bg-emerald-500 text-slate-950 border border-emerald-300'
                  : 'bg-rose-500 text-white border border-rose-300 animate-pulse'
              }
            `}
          >
            {gearIndicator}
          </div>

          {/* Speed in KM/H */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-black text-white leading-none">
                {Math.round(Math.abs(vehicleSpeedKmh))}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                KM/H
              </span>
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {gearIndicator === 'D' ? 'Drive' : 'Reverse'}
            </span>
          </div>
        </div>
      )}

      {/* =======================================================================
          RIGHT SIDE CONTROLS
          - On Foot: Right Analog Camera Joystick + Jump + Sprint + Contextual Interact
          - In Vehicle: Large GAS + BRAKE/REVERSE pedals, Horn, Handbrake, Exit
          ======================================================================= */}
      {!isDriving ? (
        /* ON FOOT RIGHT CLUSTER */
        <div
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
            right: 'max(1rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
          }}
          className="absolute flex flex-col items-end gap-3 pointer-events-auto"
        >
          {/* Cinematic Shot Selector if in CINEMATIC mode */}
          {cameraMode === 'CINEMATIC' && (
            <div className="flex flex-wrap justify-end gap-1.5 bg-slate-950/80 backdrop-blur-md p-2 rounded-xl border border-white/15 shadow-xl max-w-[280px]">
              {[
                { idx: 0, label: 'Auto' },
                { idx: 1, label: 'Orbit' },
                { idx: 2, label: 'Close-Up' },
                { idx: 3, label: 'Low Track' },
                { idx: 4, label: 'City Pan' },
              ].map((shot) => (
                <button
                  key={shot.idx}
                  type="button"
                  onClick={() => onSelectCinematicShot(shot.idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    cinematicShotIndex === shot.idx
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white/10 text-white/90 hover:bg-white/20'
                  }`}
                >
                  {shot.label}
                </button>
              ))}
            </div>
          )}

          {/* Contextual Interact Button: ONLY appears when something is nearby */}
          {nearbyInteractable && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.interactRequested = true;
              }}
              className={`
                h-13 min-h-[52px] px-4.5 rounded-2xl backdrop-blur-md border-2 shadow-2xl
                flex items-center gap-2.5 transition-all duration-150 active:scale-95
                ${
                  isNearVehicle
                    ? 'bg-emerald-500/95 border-emerald-200 text-slate-950 animate-pulse font-black'
                    : 'bg-amber-500/95 border-amber-200 text-slate-950 font-black'
                }
              `}
              aria-label="Interact"
            >
              {isNearVehicle ? (
                <Car className="w-5 h-5" />
              ) : (
                <Hand className="w-5 h-5" />
              )}
              <span className="text-xs font-black tracking-tight">
                {isNearVehicle
                  ? 'ENTER 4x4 CAR'
                  : nearbyInteractable.title
                    ? nearbyInteractable.title.toUpperCase()
                    : 'INTERACT'}
              </span>
            </button>
          )}

          {/* Jump & Sprint Buttons: Placed above the Camera Look stick */}
          <div className="flex items-center gap-3">
            {/* SPRINT BUTTON (At least 64px) */}
            <button
              type="button"
              onClick={toggleSprint}
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.sprintActive = true;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (!sprintToggle) inputRef.current.sprintActive = false;
              }}
              className={`
                w-16 h-16 min-w-[64px] min-h-[64px] rounded-2xl backdrop-blur-md border-2 shadow-2xl
                flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95
                ${
                  sprintToggle || isSprinting
                    ? 'bg-amber-500 border-amber-200 text-slate-950 font-black shadow-amber-500/40'
                    : 'bg-slate-950/75 border-white/25 text-white/90'
                }
              `}
              aria-label="Sprint"
            >
              <Zap className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-tight">SPRINT</span>
            </button>

            {/* JUMP BUTTON (At least 64px) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.jumpRequested = true;
              }}
              className="
                w-16 h-16 min-w-[64px] min-h-[64px] rounded-2xl bg-slate-950/75 backdrop-blur-md
                border-2 border-white/25 text-white shadow-2xl
                flex flex-col items-center justify-center gap-0.5
                transition-all active:scale-95 active:bg-sky-500 active:border-sky-300 active:text-slate-950
              "
              aria-label="Jump"
            >
              <ArrowUp className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-tight">JUMP</span>
            </button>
          </div>

          {/* RIGHT CAMERA LOOK JOYSTICK */}
          <div
            onPointerDown={handleCamJoyStart}
            onPointerMove={handleCamJoyMove}
            onPointerUp={handleCamJoyEnd}
            onPointerCancel={handleCamJoyEnd}
            onLostPointerCapture={resetCamJoystick}
            className="
              w-30 h-30 sm:w-32 sm:h-32 rounded-full
              bg-slate-950/75 backdrop-blur-md
              border-2 border-white/25 shadow-2xl
              flex items-center justify-center
              pointer-events-auto
            "
            aria-label="Camera look joystick"
          >
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border border-white/15 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 -translate-y-7 sm:-translate-y-8 font-bold">
                LOOK
              </span>
            </div>

            <div
              style={{
                transform: `translate3d(${camJoyKnob.x}px, ${camJoyKnob.y}px, 0)`,
              }}
              className="
                absolute w-13 h-13 sm:w-14 sm:h-14 rounded-full shadow-2xl border-2
                bg-white/85 border-white shadow-white/20
                flex items-center justify-center pointer-events-none transition-colors duration-75
              "
            >
              <Eye className="w-4 h-4 text-slate-800/80" />
            </div>
          </div>
        </div>
      ) : (
        /* DRIVING RIGHT CLUSTER: GTA-STYLE CONTROLS */
        <div
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
            right: 'max(1rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
          }}
          className="absolute flex flex-col items-end gap-3 pointer-events-auto transition-opacity duration-200"
        >
          {/* Secondary Vehicle Actions Row: Horn, Handbrake, Exit */}
          <div className="flex items-center gap-2.5">
            {/* HORN BUTTON (At least 64px thumb target) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.vehicleHornRequested = true;
              }}
              className="
                w-16 h-16 min-w-[64px] min-h-[64px] rounded-2xl bg-slate-950/80 backdrop-blur-md
                border-2 border-white/25 text-amber-300 shadow-xl
                flex flex-col items-center justify-center gap-0.5
                active:scale-95 active:bg-amber-400 active:border-amber-200 active:text-slate-950 transition-all
              "
              aria-label="Honk Horn"
            >
              <Volume2 className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-tight">
                HORN
              </span>
            </button>

            {/* HANDBRAKE BUTTON (At least 64px thumb target) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.vehicleHandbrake = true;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                inputRef.current.vehicleHandbrake = false;
              }}
              onPointerCancel={() => {
                inputRef.current.vehicleHandbrake = false;
              }}
              onPointerLeave={() => {
                inputRef.current.vehicleHandbrake = false;
              }}
              className="
                w-16 h-16 min-w-[64px] min-h-[64px] rounded-2xl bg-slate-950/80 backdrop-blur-md
                border-2 border-white/25 text-amber-300 shadow-xl
                flex flex-col items-center justify-center gap-0.5
                active:scale-95 active:bg-amber-500 active:border-amber-300 active:text-slate-950 transition-all
              "
              aria-label="Handbrake"
            >
              <Disc className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-tight">
                P-BRAKE
              </span>
            </button>

            {/* EXIT CAR BUTTON */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.interactRequested = true;
              }}
              className="
                h-16 px-4 rounded-2xl bg-rose-600/90 backdrop-blur-md
                border-2 border-rose-300 text-white shadow-xl
                flex flex-col items-center justify-center gap-0.5
                active:scale-95 active:bg-rose-500 transition-all font-bold text-xs
              "
              aria-label="Exit Vehicle"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[9px] font-black uppercase tracking-tight">
                EXIT
              </span>
            </button>
          </div>

          {/* Primary Driving Pedals Row: BRAKE / REVERSE & GAS (Large >= 64px buttons) */}
          <div className="flex items-center gap-3">
            {/* BRAKE / REVERSE BUTTON */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.vehicleBrake = 1;
              }}
              onPointerUp={() => {
                inputRef.current.vehicleBrake = 0;
              }}
              onPointerCancel={() => {
                inputRef.current.vehicleBrake = 0;
              }}
              onPointerLeave={() => {
                inputRef.current.vehicleBrake = 0;
              }}
              className="
                w-20 h-20 sm:w-22 sm:h-22 min-w-[72px] min-h-[72px] rounded-2xl
                bg-rose-600/90 backdrop-blur-md border-2 border-rose-300 text-white
                shadow-2xl shadow-rose-950/50 flex flex-col items-center justify-center gap-0.5
                active:scale-95 active:bg-rose-500 transition-all
              "
              aria-label="Brake and Reverse"
            >
              <ArrowDown className="w-7 h-7 stroke-[2.5]" />
              <span className="text-[10px] font-black tracking-tight uppercase">
                BRAKE / REV
              </span>
            </button>

            {/* GAS BUTTON */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.vehicleThrottle = 1;
              }}
              onPointerUp={() => {
                inputRef.current.vehicleThrottle = 0;
              }}
              onPointerCancel={() => {
                inputRef.current.vehicleThrottle = 0;
              }}
              onPointerLeave={() => {
                inputRef.current.vehicleThrottle = 0;
              }}
              className="
                w-20 h-20 sm:w-22 sm:h-22 min-w-[72px] min-h-[72px] rounded-2xl
                bg-emerald-500/95 backdrop-blur-md border-2 border-emerald-200 text-slate-950
                shadow-2xl shadow-emerald-500/40 flex flex-col items-center justify-center gap-0.5
                active:scale-95 active:bg-emerald-400 transition-all
              "
              aria-label="Gas Accelerator"
            >
              <ArrowUp className="w-8 h-8 stroke-[2.5]" />
              <span className="text-xs font-black tracking-wider uppercase">
                GAS
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
