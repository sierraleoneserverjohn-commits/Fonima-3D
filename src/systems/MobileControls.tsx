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
  const maxJoyRadius = 46;
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
      {/* Right Half Touch Camera Rotate + 2-Finger Pinch Zoom Zone */}
      <div
        onPointerDown={handleLookStart}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookEnd}
        onPointerCancel={handleLookEnd}
        className="absolute top-14 right-0 bottom-0 w-3/5 pointer-events-auto"
        aria-label="Touch camera look and pinch zoom area"
      />

      {/* Left Virtual Movement / Steering Joystick */}
      <div
        onPointerDown={handleJoyStart}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyEnd}
        onPointerCancel={handleJoyEnd}
        onLostPointerCapture={resetJoystick}
        className="
          absolute bottom-7 left-6 sm:bottom-9 sm:left-9
          w-32 h-32 rounded-full
          bg-slate-950/55 backdrop-blur-md
          border-2 border-white/20 shadow-2xl
          flex items-center justify-center
          pointer-events-auto
        "
        aria-label={isDriving ? 'Steering joystick' : 'Movement joystick'}
      >
        <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 -translate-y-8">
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
            absolute w-14 h-14 rounded-full shadow-lg border-2 transition-colors duration-75
            flex items-center justify-center
            ${
              isDriving
                ? 'bg-emerald-400/95 border-emerald-200'
                : isSprinting
                  ? 'bg-amber-400/90 border-amber-200'
                  : 'bg-white/85 border-white'
            }
          `}
        >
          <div className="w-5 h-5 rounded-full bg-slate-900/25 border border-slate-950/30" />
        </div>
      </div>

      {/* Contextual Action Cluster (Bottom-Right): Adapts to Driving vs Walking vs Drone vs Cinematic */}
      <div className="absolute bottom-7 right-6 sm:bottom-9 sm:right-9 flex flex-col items-end gap-3 pointer-events-auto">
        {cameraMode === 'CINEMATIC' && (
          <div className="flex flex-wrap justify-end gap-1.5 bg-slate-950/75 backdrop-blur-md p-2 rounded-2xl border border-white/15">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  cinematicShotIndex === shot.idx
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-white/10 text-white/85 hover:bg-white/20'
                }`}
              >
                {shot.label}
              </button>
            ))}
          </div>
        )}

        {cameraMode === 'DRONE' ? (
          /* Aerial Drone Altitude & Boost Controls */
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSprint}
              className={`
                w-16 h-16 rounded-2xl backdrop-blur-md border-2 shadow-xl
                flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95
                ${
                  sprintToggle || isSprinting
                    ? 'bg-amber-500/85 border-amber-200 text-slate-950'
                    : 'bg-slate-950/60 border-white/20 text-white/85'
                }
              `}
            >
              <Zap className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-tight">
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
                w-16 h-16 rounded-2xl bg-slate-950/65 backdrop-blur-md
                border-2 border-white/25 text-white shadow-xl
                flex flex-col items-center justify-center gap-0.5 active:scale-95
              "
            >
              <ArrowDown className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-tight">
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
                w-16 h-16 rounded-2xl bg-sky-500/80 backdrop-blur-md
                border-2 border-sky-200 text-slate-950 shadow-xl
                flex flex-col items-center justify-center gap-0.5 active:scale-95
              "
            >
              <ArrowUp className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-tight">
                Ascend
              </span>
            </button>
          </div>
        ) : isDriving ? (
          /* 4x4 SUV VEHICLE DRIVING CONTROLS (Exit Car, Horn, Brake/Reverse, Gas Pedal) */
          <>
            <div className="flex items-center gap-2.5">
              {/* Car Horn Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  inputRef.current.vehicleHornRequested = true;
                }}
                className="
                  h-11 px-3.5 rounded-2xl bg-slate-950/75 backdrop-blur-md
                  border border-white/20 text-amber-300 shadow-lg
                  flex items-center gap-1.5 active:scale-95
                "
                title="Honk Horn (H)"
              >
                <Volume2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Horn</span>
              </button>

              {/* Exit Vehicle Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  inputRef.current.interactRequested = true;
                }}
                className="
                  h-11 px-4 rounded-2xl bg-rose-500/90 backdrop-blur-md
                  border-2 border-rose-200 text-white shadow-xl
                  flex items-center gap-2 active:scale-95
                "
              >
                <LogOut className="w-4 h-4" />
                <span className="text-xs font-bold tracking-tight">
                  Exit Car ({vehicleSpeedKmh} km/h)
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3">
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
                  w-18 h-16 px-3 rounded-2xl bg-amber-600/85 backdrop-blur-md
                  border-2 border-amber-300 text-white shadow-xl
                  flex flex-col items-center justify-center gap-0.5 active:scale-95
                "
              >
                <ArrowDown className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight">
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
                  w-20 h-20 rounded-2xl bg-emerald-500/90 backdrop-blur-md
                  border-2 border-emerald-200 text-slate-950 shadow-2xl
                  flex flex-col items-center justify-center gap-0.5 active:scale-95
                "
              >
                <ArrowUp className="w-6 h-6" />
                <span className="text-xs font-extrabold tracking-tight">
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
                h-12 px-4 rounded-2xl backdrop-blur-md border-2 shadow-xl
                flex items-center gap-2 transition-all duration-150 active:scale-95
                ${
                  isNearVehicle
                    ? 'bg-emerald-500/95 border-emerald-200 text-slate-950 animate-pulse'
                    : nearbyInteractable
                      ? 'bg-amber-500/90 border-amber-200 text-slate-950'
                      : 'bg-slate-950/55 border-white/20 text-white/80'
                }
              `}
              aria-label="Interact with nearby object or vehicle"
            >
              {isNearVehicle ? (
                <Car className="w-4 h-4" />
              ) : (
                <Hand className="w-4 h-4" />
              )}
              <span className="text-xs font-bold tracking-tight">
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
                  w-16 h-16 rounded-2xl backdrop-blur-md border-2 shadow-xl
                  flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95
                  ${
                    sprintToggle || isSprinting
                      ? 'bg-amber-500/85 border-amber-200 text-slate-950'
                      : 'bg-slate-950/60 border-white/20 text-white/85'
                  }
                `}
                aria-label="Sprint"
              >
                <Zap className="w-5 h-5" />
                <span className="text-[10px] font-semibold tracking-tight">
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
                  w-16 h-16 rounded-2xl bg-slate-950/65 backdrop-blur-md
                  border-2 border-white/25 text-white shadow-xl
                  flex flex-col items-center justify-center gap-0.5
                  transition-transform active:scale-95 active:bg-white/20
                "
                aria-label="Jump"
              >
                <ArrowUp className="w-5 h-5" />
                <span className="text-[10px] font-semibold tracking-tight">
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
