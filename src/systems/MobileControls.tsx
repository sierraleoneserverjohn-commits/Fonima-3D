import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Car,
  Hand,
  LogOut,
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
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [sprintToggle, setSprintToggle] = useState<boolean>(false);

  const joyTouchId = useRef<number | null>(null);
  const joyOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const maxJoyRadius = 58;
  const deadzoneRatio = 0.08;

  const lookPointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevPinchDist = useRef<number | null>(null);

  const resetJoystick = useCallback(() => {
    joyTouchId.current = null;
    setJoyKnob({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  }, [inputRef]);

  useEffect(() => {
    const keys = new Set<string>();

    const syncKeys = () => {
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

      if (joyTouchId.current === null) {
        inputRef.current.moveX = kx;
        inputRef.current.moveY = ky;
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
        inputRef.current.vehicleBrake = 0;
      }
      syncKeys();
    };

    const onWheel = (e: WheelEvent) => {
      inputRef.current.pinchZoomDelta += e.deltaY * 0.003;
    };

    const onWindowBlurOrHide = () => {
      keys.clear();
      resetJoystick();
      lookPointers.current.clear();
      prevPinchDist.current = null;
      inputRef.current.droneVertical = 0;
      inputRef.current.vehicleThrottle = 0;
      inputRef.current.vehicleBrake = 0;
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
  }, [inputRef, sprintToggle, resetJoystick, isDriving]);

  const handleJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joyTouchId.current !== null) return;
    joyTouchId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    joyOrigin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyTouchId.current !== e.pointerId) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyTouchId.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture already lost
    }
    resetJoystick();
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    let dx = clientX - joyOrigin.current.x;
    let dy = clientY - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxJoyRadius) {
      dx = (dx / dist) * maxJoyRadius;
      dy = (dy / dist) * maxJoyRadius;
    }

    const normDist = Math.min(1, dist / maxJoyRadius);
    if (normDist < deadzoneRatio) {
      setJoyKnob({ x: 0, y: 0 });
      inputRef.current.moveX = 0;
      inputRef.current.moveY = 0;
      return;
    }

    setJoyKnob({ x: dx, y: dy });

    const rescaledMag = (normDist - deadzoneRatio) / (1 - deadzoneRatio);
    const angle = Math.atan2(dy, dx);
    inputRef.current.moveX = Math.cos(angle) * rescaledMag;
    inputRef.current.moveY = Math.sin(angle) * rescaledMag;
  };

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

  const isNearVehicle = nearbyInteractable?.type === 'vehicle';

  return (
    <div className="fixed inset-0 pointer-events-none z-10 select-none touch-none">
      {/* Right Half Touch Camera Rotate + 2-Finger Pinch Zoom Zone (Starts below top HUD to prevent conflict) */}
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

      {/* Left Virtual Movement / Steering Joystick (Enlarged for Mobile Thumbs) */}
      <div
        onPointerDown={handleJoyStart}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyEnd}
        onPointerCancel={handleJoyEnd}
        onLostPointerCapture={resetJoystick}
        style={{
          bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))',
          left: 'max(1.25rem, calc(env(safe-area-inset-left, 0px) + 1rem))',
        }}
        className="
          absolute
          w-38 h-38 sm:w-44 sm:h-44 rounded-full
          bg-slate-950/65 backdrop-blur-md
          border-2 border-white/25 shadow-2xl
          flex items-center justify-center
          pointer-events-auto
        "
        aria-label={isDriving ? 'Steering joystick' : 'Movement joystick'}
      >
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-white/15 flex items-center justify-center">
          <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-white/40 -translate-y-10 sm:-translate-y-12 font-bold">
            {isDriving
              ? 'STEER / DRIVE'
              : cameraMode === 'DRONE'
                ? 'FLY'
                : 'FWD'}
          </span>
        </div>

        <div
          style={{
            transform: `translate3d(${joyKnob.x}px, ${joyKnob.y}px, 0)`,
          }}
          className={`
            absolute w-18 h-18 sm:w-20 sm:h-20 rounded-full shadow-2xl border-2 transition-colors duration-75
            flex items-center justify-center
            ${
              isDriving
                ? 'bg-emerald-400/95 border-emerald-200 shadow-emerald-500/30'
                : isSprinting
                  ? 'bg-amber-400/95 border-amber-200 shadow-amber-500/30'
                  : 'bg-white/90 border-white shadow-white/20'
            }
          `}
        >
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/30 border border-slate-950/40" />
        </div>
      </div>

      {/* Contextual Action Cluster (Bottom-Right): Enlarged with Thumb Ergonomics & Safe-Area Bounds */}
      <div
        style={{
          bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))',
          right: 'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 1rem))',
        }}
        className="absolute flex flex-col items-end gap-3 pointer-events-auto"
      >
        {cameraMode === 'CINEMATIC' && (
          <div className="flex flex-wrap justify-end gap-1.5 bg-slate-950/80 backdrop-blur-md p-2.5 rounded-2xl border border-white/15 shadow-xl">
            {[
              { idx: 0, label: 'Auto' },
              { idx: 1, label: 'Orbit' },
              { idx: 2, label: 'Close-Up Face' },
              { idx: 3, label: 'Low Track' },
              { idx: 4, label: 'City Pan' },
            ].map((shot) => (
              <button
                key={shot.idx}
                type="button"
                onClick={() => onSelectCinematicShot(shot.idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
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

        {cameraMode === 'DRONE' ? (
          /* Aerial Drone Altitude & Boost Controls: Significantly Enlarged for Easy Thumb Access */
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={toggleSprint}
              className={`
                w-20 h-20 sm:w-24 sm:h-24 rounded-2xl backdrop-blur-md border-2 shadow-2xl
                flex flex-col items-center justify-center gap-1 transition-transform active:scale-95
                ${
                  sprintToggle || isSprinting
                    ? 'bg-amber-500/90 border-amber-200 text-slate-950 shadow-amber-500/30 font-bold'
                    : 'bg-slate-950/70 border-white/25 text-white/90'
                }
              `}
              title="Fast Drone Thrusters"
            >
              <Zap className="w-6 h-6" />
              <span className="text-xs font-bold tracking-tight">
                Fast
              </span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.droneVertical = -1;
              }}
              onPointerUp={() => {
                inputRef.current.droneVertical = 0;
              }}
              onPointerCancel={() => {
                inputRef.current.droneVertical = 0;
              }}
              className="
                w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-950/70 backdrop-blur-md
                border-2 border-white/30 text-white shadow-2xl
                flex flex-col items-center justify-center gap-1 active:scale-95
              "
              title="Descend Drone"
            >
              <ArrowDown className="w-6 h-6" />
              <span className="text-xs font-bold tracking-tight">
                Down
              </span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.droneVertical = 1;
              }}
              onPointerUp={() => {
                inputRef.current.droneVertical = 0;
              }}
              onPointerCancel={() => {
                inputRef.current.droneVertical = 0;
              }}
              className="
                w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-sky-500/85 backdrop-blur-md
                border-2 border-sky-200 text-slate-950 shadow-2xl shadow-sky-500/30
                flex flex-col items-center justify-center gap-1 active:scale-95
              "
              title="Ascend Drone"
            >
              <ArrowUp className="w-6 h-6" />
              <span className="text-xs font-extrabold tracking-tight">
                Ascend
              </span>
            </button>
          </div>
        ) : isDriving ? (
          /* 4x4 SUV VEHICLE DRIVING CONTROLS (Exit Car, Horn, Brake/Reverse, Gas Pedal) */
          <>
            <div className="flex items-center gap-3">
              {/* Car Horn Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  inputRef.current.vehicleHornRequested = true;
                }}
                className="
                  h-12 px-4 rounded-2xl bg-slate-950/80 backdrop-blur-md
                  border border-white/20 text-amber-300 shadow-xl
                  flex items-center gap-2 active:scale-95
                "
                title="Honk Horn (H)"
              >
                <Volume2 className="w-4 h-4" />
                <span className="text-xs font-bold">Horn</span>
              </button>

              {/* Exit Vehicle Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  inputRef.current.interactRequested = true;
                }}
                className="
                  h-12 px-5 rounded-2xl bg-rose-500/90 backdrop-blur-md
                  border-2 border-rose-200 text-white shadow-2xl
                  flex items-center gap-2 active:scale-95
                "
              >
                <LogOut className="w-4 h-4" />
                <span className="text-xs font-extrabold tracking-tight">
                  Exit Car ({vehicleSpeedKmh} km/h)
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              {/* Brake / Reverse Pedal */}
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
                  w-22 h-20 sm:w-26 sm:h-24 px-3 rounded-2xl bg-amber-600/90 backdrop-blur-md
                  border-2 border-amber-300 text-white shadow-2xl
                  flex flex-col items-center justify-center gap-0.5 active:scale-95
                "
              >
                <ArrowDown className="w-6 h-6" />
                <span className="text-[11px] font-extrabold tracking-tight">
                  BRAKE / REV
                </span>
              </button>

              {/* Gas / Accelerate Pedal */}
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
                  w-24 h-22 sm:w-28 sm:h-26 rounded-2xl bg-emerald-500/95 backdrop-blur-md
                  border-2 border-emerald-200 text-slate-950 shadow-2xl shadow-emerald-500/30
                  flex flex-col items-center justify-center gap-0.5 active:scale-95
                "
              >
                <ArrowUp className="w-7 h-7" />
                <span className="text-xs font-black tracking-wider">
                  GAS
                </span>
              </button>
            </div>
          </>
        ) : (
          /* ON-FOOT PLAYER CONTROLS (Enter Car / Interact, Sprint, Jump) */
          <>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                inputRef.current.interactRequested = true;
              }}
              className={`
                h-14 px-5 rounded-2xl backdrop-blur-md border-2 shadow-2xl
                flex items-center gap-2.5 transition-all duration-150 active:scale-95
                ${
                  isNearVehicle
                    ? 'bg-emerald-500/95 border-emerald-200 text-slate-950 animate-pulse font-extrabold'
                    : nearbyInteractable
                      ? 'bg-amber-500/90 border-amber-200 text-slate-950 font-bold'
                      : 'bg-slate-950/65 border-white/20 text-white/90 font-semibold'
                }
              `}
              aria-label="Interact with nearby object or vehicle"
            >
              {isNearVehicle ? (
                <Car className="w-5 h-5" />
              ) : (
                <Hand className="w-5 h-5" />
              )}
              <span className="text-xs sm:text-sm font-bold tracking-tight">
                {isNearVehicle
                  ? 'Enter 4x4 Car'
                  : nearbyInteractable
                    ? 'Interact'
                    : 'Inspect'}
              </span>
            </button>

            <div className="flex items-center gap-3.5">
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
                  w-20 h-20 sm:w-22 sm:h-22 rounded-2xl backdrop-blur-md border-2 shadow-2xl
                  flex flex-col items-center justify-center gap-1 transition-transform active:scale-95
                  ${
                    sprintToggle || isSprinting
                      ? 'bg-amber-500/90 border-amber-200 text-slate-950 font-bold shadow-amber-500/30'
                      : 'bg-slate-950/65 border-white/25 text-white/90'
                  }
                `}
                aria-label="Sprint"
              >
                <Zap className="w-6 h-6" />
                <span className="text-[11px] font-bold tracking-tight">
                  Sprint
                </span>
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  inputRef.current.jumpRequested = true;
                }}
                className="
                  w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-slate-950/70 backdrop-blur-md
                  border-2 border-white/30 text-white shadow-2xl
                  flex flex-col items-center justify-center gap-1
                  transition-transform active:scale-95 active:bg-white/20
                "
                aria-label="Jump"
              >
                <ArrowUp className="w-6 h-6" />
                <span className="text-[11px] font-bold tracking-tight">
                  Jump
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
