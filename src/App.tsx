import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Car,
  Check,
  ChevronRight,
  Clock,
  CloudRain,
  Compass,
  Download,
  Eye,
  HelpCircle,
  LogOut,
  Map as MapIcon,
  MapPin,
  Maximize,
  Minimize,
  Moon,
  Navigation,
  Pause,
  Plane,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  Sliders,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CameraMode,
  CameraSettings,
  ControlInputState,
  DEFAULT_CAMERA_SETTINGS,
  GameTelemetry,
  NavigationDestination,
  TrafficDensity,
  WeatherCondition,
  WorldSettings,
  loadSavedCameraSettings,
  loadSavedProgressState,
  loadSavedWorldSettings,
} from './systems/GameState';
import { WorldSystem } from './systems/World';
import { MobileControls } from './systems/MobileControls';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldSystem | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // Phone Game Lifecycle States
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const [inGame, setInGame] = useState<boolean>(false);
  const [isFadingToGame, setIsFadingToGame] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<
    'controls' | 'graphics' | 'audio' | 'traffic'
  >('controls');
  const [isMapOpen, setIsMapOpen] = useState<boolean>(false);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(() => {
    return !localStorage.getItem('fonima_seen_how_to_play');
  });
  const [hasSavedProgress, setHasSavedProgress] = useState<boolean>(() => {
    return loadSavedProgressState() !== null;
  });
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  isPausedRef.current = isPaused;

  const inputRef = useRef<ControlInputState>({
    moveX: 0,
    moveY: 0,
    droneVertical: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    pinchZoomDelta: 0,
    jumpRequested: false,
    sprintActive: false,
    interactRequested: false,
    vehicleThrottle: 0,
    vehicleBrake: 0,
    vehicleHandbrake: false,
    vehicleHornRequested: false,
  });

  const [camSettings, setCamSettings] = useState<CameraSettings>(() =>
    loadSavedCameraSettings()
  );
  const [worldSettings, setWorldSettings] = useState<WorldSettings>(() =>
    loadSavedWorldSettings()
  );

  const [telemetry, setTelemetry] = useState<GameTelemetry>({
    x: 0,
    y: 0,
    z: -1.8,
    heading: 0,
    speed: 0,
    isGrounded: true,
    isSprinting: false,
    animState: 'IDLE',
    surfaceType: 'asphalt',
    zoneName: 'Williams Street · Goodrich / Fonima',
    regionId: 'FREETOWN',
    regionLabel: 'Goodrich / Fonima · Freetown',
    isDriving: false,
    vehicleSpeedKmh: 0,
    vehiclePosition: { x: 8.5, z: -1.6 },
    destination: 'BO',
    distanceToDestinationMeters: 1150,
    activeStreamedChunks: 2,
    nearbyInteractable: null,
    lastInteractionMessage:
      'Walk to your 4x4 SUV on Williams Street and tap "Enter 4x4 Car" to drive the highway journey to Bo City!',
    timeHours: 10.5,
    formattedClock: '10:30',
    dayPhaseName: 'Morning',
    isNight: false,
    weather: worldSettings.weather,
    cameraMode: camSettings.mode,
    audioEnabled: false,
    fps: 60,
    trafficCount: 0,
    trafficDensity: 'medium',
  });

  const [webglError, setWebglError] = useState<boolean>(false);
  const [canvasKey, setCanvasKey] = useState<number>(0);

  // Keep screen awake using the Screen Wake Lock API while playing
  useEffect(() => {
    let wakeLockSentinel: any = null;
    let isDisposed = false;

    const requestWakeLock = async () => {
      if (
        'wakeLock' in navigator &&
        document.visibilityState === 'visible' &&
        !isDisposed
      ) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        } catch {
          // Device power profile or background state prevented wake lock
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      } else if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const onFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(
        Boolean(
          doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement
        )
      );
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      isDisposed = true;
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;
      const isFull = Boolean(
        doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement
      );
      if (!isFull) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        }
      }
    } catch {
      // Fallback silently if not allowed
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  // 3D Scene & WorldSystem Initialization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDisposed = false;
    let animationFrameId: number = 0;
    let recoveryTimeoutId: number | null = null;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      setWebglError(true);
      if (recoveryTimeoutId === null && !isDisposed) {
        recoveryTimeoutId = window.setTimeout(() => {
          if (!isDisposed) {
            setWebglError(false);
            setCanvasKey((k) => k + 1);
          }
        }, 650);
      }
    };

    const handleContextRestored = () => {
      if (isDisposed) return;
      setWebglError(false);
      if (worldRef.current) {
        worldRef.current.precompileAndWarmUp();
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    let world: WorldSystem;
    try {
      world = new WorldSystem(canvas, (percent, label) => {
        if (typeof (window as any).__setLoadingProgress === 'function') {
          (window as any).__setLoadingProgress(percent, label);
        }
      });
      worldRef.current = world;
      setWebglError(false);

      // Perform one state & telemetry warm-up step
      const initialTelemetry = world.update(0.016, inputRef.current);
      setTelemetry({ ...initialTelemetry });

      // Signal completion to HTML initial loading screen
      if (typeof (window as any).__setLoadingProgress === 'function') {
        (window as any).__setLoadingProgress(100, 'Ready');
      }
      setTimeout(() => {
        if (typeof (window as any).__hideInitialLoader === 'function') {
          (window as any).__hideInitialLoader();
        }
        setIsEngineReady(true);
      }, 350);
    } catch {
      setWebglError(true);
      return;
    }

    let lastTime = performance.now();
    let uiSyncAccumulator = 0;

    const animate = (now: number) => {
      if (isDisposed) return;

      if (document.hidden || world.isContextLost() || isPausedRef.current) {
        lastTime = now;
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.max(0.001, Math.min(rawDt, 0.05));

      const latestState = world.update(dt, inputRef.current);

      uiSyncAccumulator += dt;
      if (uiSyncAccumulator >= 0.065) {
        uiSyncAccumulator = 0;
        setTelemetry({ ...latestState });
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!isDisposed && !world.isContextLost()) {
        world.handleResize(window.innerWidth, window.innerHeight);
      }
    };

    const onOrientation = () => {
      onResize();
      setTimeout(onResize, 100);
      setTimeout(onResize, 300);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      isDisposed = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (recoveryTimeoutId !== null) clearTimeout(recoveryTimeoutId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      world.dispose();
    };
  }, [canvasKey]);

  // Entering Game (From Start or Continue)
  const handleStartGame = async (continueSaved: boolean = false) => {
    if (!worldRef.current) return;

    if (!continueSaved) {
      worldRef.current.resetToNewGame();
    }

    // 1. Enter fullscreen where supported
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      }
    } catch {
      // Fallback silently if blocked by browser policy
    }

    // 2. Lock orientation to landscape where supported
    try {
      if (
        screen.orientation &&
        typeof (screen.orientation as any).lock === 'function'
      ) {
        await (screen.orientation as any).lock('landscape');
      }
    } catch {
      // Fallback silently
    }

    // 3. Start audio on user gesture
    worldRef.current.audio.enable();
    setTelemetry((prev) => ({ ...prev, audioEnabled: true }));

    // 4. Fade smoothly from title screen into game
    setIsFadingToGame(true);
    setTimeout(() => {
      worldRef.current?.setTitleScreenMode(false);
      setInGame(true);
      setIsFadingToGame(false);
      setHasSavedProgress(true);
    }, 450);
  };

  const updateCameraSetting = (partial: Partial<CameraSettings>) => {
    if (!worldRef.current) return;
    const updated = worldRef.current.cameraSystem.updateSettings(partial);
    setCamSettings({ ...updated });
    setTelemetry((prev) => ({ ...prev, cameraMode: updated.mode }));
  };

  const updateWorldSetting = (partial: Partial<WorldSettings>) => {
    if (!worldRef.current) return;
    const updated = worldRef.current.lighting.updateWorldSettings(partial);
    if (partial.trafficDensity) {
      worldRef.current.traffic.setDensity(partial.trafficDensity);
      updated.trafficDensity = partial.trafficDensity;
    }
    setWorldSettings((prev) => ({ ...prev, ...updated }));
    setTelemetry((prev) => ({
      ...prev,
      weather: updated.weather,
      trafficDensity: updated.trafficDensity || prev.trafficDensity,
      trafficCount:
        worldRef.current?.traffic.getActiveCount() ?? prev.trafficCount,
    }));
  };

  const handleSetDestination = (dest: NavigationDestination) => {
    if (!worldRef.current) return;
    worldRef.current.setNavigationDestination(dest);
    setTelemetry((prev) => ({ ...prev, destination: dest }));
  };

  const handleInspectCloneFace = () => {
    if (!worldRef.current) return;
    if (
      camSettings.mode === 'CINEMATIC' &&
      camSettings.cinematicShotIndex === 2
    ) {
      updateCameraSetting({ mode: 'THIRD_PERSON' });
    } else {
      updateCameraSetting({ mode: 'CINEMATIC', cinematicShotIndex: 2 });
    }
  };

  const handleToggleAudio = () => {
    if (!worldRef.current) return;
    const enabled = worldRef.current.audio.toggleAudio();
    setTelemetry((prev) => ({ ...prev, audioEnabled: enabled }));
  };

  const handleRespawnAtNo22 = () => {
    if (!worldRef.current) return;
    worldRef.current.resetToWilliamsStreetFreetown();
    if (camSettings.mode === 'DRONE') {
      updateCameraSetting({ mode: 'THIRD_PERSON' });
    }
  };

  const handleOpenPauseMenu = () => {
    setIsPaused(true);
    isPausedRef.current = true;
    worldRef.current?.pauseAudio();
  };

  const handleResumeGame = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    setIsSettingsOpen(false);
    setIsMapOpen(false);
    worldRef.current?.resumeAudio();
  };

  const handleRestartLocation = () => {
    worldRef.current?.resetToWilliamsStreetFreetown();
    handleResumeGame();
  };

  const handleQuitToTitle = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    setIsSettingsOpen(false);
    setIsMapOpen(false);
    setInGame(false);
    worldRef.current?.setTitleScreenMode(true);
    worldRef.current?.pauseAudio();
  };

  const formatCameraModeLabel = (mode: CameraMode) => {
    if (mode === 'THIRD_PERSON') return 'Follow';
    if (mode === 'FIRST_PERSON') return 'First Person';
    if (mode === 'DRONE') return 'Aerial Drone';
    return 'Cinematic';
  };

  const dismissHowToPlay = () => {
    setShowHowToPlay(false);
    try {
      localStorage.setItem('fonima_seen_how_to_play', '1');
    } catch {
      // Ignore storage quota
    }
  };

  // Map X in [-95, 1340] to [4%, 96%] for the connected Sierra Leone Corridor Map
  const mapPercentX = (worldX: number) =>
    Math.max(4, Math.min(96, ((worldX + 95) / 1435) * 92 + 4));
  const mapPercentZ = (worldZ: number) =>
    Math.max(8, Math.min(92, 50 + (worldZ / 95) * 40));

  return (
    <div className="relative w-[100dvw] h-[100dvh] w-screen h-screen overflow-hidden bg-slate-950 select-none touch-none">
      {/* 3D WebGL Viewport Canvas */}
      <canvas
        key={canvasKey}
        ref={canvasRef}
        className="block w-[100dvw] h-[100dvh] w-full h-full"
      />

      {/* WebGL Context Lost Fallback Safety */}
      {webglError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 text-center">
          <div className="max-w-md space-y-3">
            <h1 className="text-xl font-semibold text-white">
              3D Graphics Context Paused
            </h1>
            <p className="text-sm text-slate-300">
              Your mobile browser suspended the WebGL context. Tap below to
              restore Freetown & Bo City.
            </p>
            <button
              type="button"
              onClick={() => {
                setWebglError(false);
                setCanvasKey((k) => k + 1);
              }}
              className="min-h-[56px] px-6 py-3 text-sm font-bold bg-amber-500 text-slate-950 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              Restore 3D World
            </button>
          </div>
        </div>
      )}

      {/* FADE TRANSITION OVERLAY BETWEEN TITLE AND WORLD */}
      <div
        className={`fixed inset-0 z-50 bg-slate-950 pointer-events-none transition-opacity duration-500 ease-out ${
          isFadingToGame ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* =========================================================================
          TITLE SCREEN (Dark Cinematic Backdrop with Williams Street 3D Camera Drift)
          ========================================================================= */}
      {!inGame && isEngineReady && (
        <div className="absolute inset-0 z-30 flex flex-col justify-between select-none pointer-events-auto">
          {/* Subtle cinematic gradient vignette letting the 3D world drift underneath */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/45 to-slate-950/65 pointer-events-none" />

          {/* Top Bar with Safe Area */}
          <header
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="relative z-10 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Sierra Leone 3D
              </span>
              <span className="hidden sm:inline text-xs text-slate-400">
                Freetown ↔ Bo City Highway
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHowToPlay(true)}
                className="h-11 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="How to Play"
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Controls</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 flex items-center justify-center transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </button>
            </div>
          </header>

          {/* Center Title Branding */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 -mt-4">
            <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-wider text-white drop-shadow-2xl">
              FONIMA 3D
            </h1>
            <p className="mt-2 text-xs sm:text-sm font-semibold tracking-widest uppercase text-amber-400 drop-shadow">
              No. 22 Williams Street · Goodrich, Freetown
            </p>
            <p className="mt-1 text-[11px] sm:text-xs text-slate-300/80 max-w-sm sm:max-w-md">
              Explore the compound, drive your 4x4 SUV across rural Sierra Leone,
              and reach Sweet Bo City.
            </p>
          </div>

          {/* Bottom Thumb-Friendly Action Buttons (>= 56px Tall) */}
          <footer
            style={{
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="relative z-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-3xl mx-auto w-full"
          >
            {/* CONTINUE BUTTON (If saved progress exists) */}
            {hasSavedProgress && (
              <button
                type="button"
                onClick={() => handleStartGame(true)}
                className="
                  flex-1 min-w-[150px] max-w-[240px]
                  h-14 min-h-[56px] px-6
                  bg-emerald-500 hover:bg-emerald-400 active:scale-95
                  text-slate-950 font-bold text-base tracking-wide
                  rounded-2xl shadow-xl shadow-emerald-950/40
                  flex items-center justify-center gap-2.5 transition-all
                "
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>CONTINUE</span>
              </button>
            )}

            {/* START BUTTON */}
            <button
              type="button"
              onClick={() => handleStartGame(false)}
              className="
                flex-1 min-w-[150px] max-w-[240px]
                h-14 min-h-[56px] px-6
                bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95
                text-slate-950 font-bold text-base tracking-wide
                rounded-2xl shadow-xl shadow-amber-950/40
                flex items-center justify-center gap-2.5 transition-all
              "
            >
              <Play className="w-5 h-5 fill-slate-950" />
              <span>{hasSavedProgress ? 'NEW GAME' : 'START'}</span>
            </button>

            {/* SETTINGS BUTTON */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="
                flex-1 min-w-[140px] max-w-[220px]
                h-14 min-h-[56px] px-6
                bg-white/10 hover:bg-white/15 active:scale-95
                text-white font-semibold text-base
                border border-white/20 rounded-2xl shadow-lg
                flex items-center justify-center gap-2.5 transition-all
              "
            >
              <SettingsIcon className="w-5 h-5 text-slate-300" />
              <span>SETTINGS</span>
            </button>
          </footer>
        </div>
      )}

      {/* =========================================================================
          "HOW TO PLAY" MODAL (Shown once on first launch, thumb-friendly >=56px button)
          ========================================================================= */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div
            style={{
              maxHeight: 'calc(100dvh - 2rem)',
            }}
            className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between text-white overflow-y-auto no-scrollbar"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold">How to Play</h2>
                    <p className="text-[11px] text-slate-400">
                      Fonima 3D Mobile Controls Guide
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissHowToPlay}
                  className="p-2 text-slate-400 hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                    <span>🕹️ Left Stick: Move</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Push the large analog stick in the bottom-left corner to move smoothly. Tap Sprint to run fast.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="font-bold text-sky-300 flex items-center gap-1.5 mb-1">
                    <span>👁️ Right Stick: Look</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Use the right analog stick to orbit the camera, or drag anywhere on the right screen.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                    <span>🚙 Drive 4x4 SUV (GTA Style)</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Left/Right buttons steer wheels. Hold GAS to drive, hold BRAKE to slow down, and press again to reverse. Handbrake & Horn available!
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                    <span>⚡ Jump & Interact</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Jump button hops over obstacles. When near the SUV or gates, a contextual Interact button appears!
                  </p>
                </div>
              </div>

              <div className="mt-3 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="text-[11px] text-amber-300 font-medium">
                  🎯 Objective: Drive from Williams Street across Rural Sierra
                  Leone to Bo City!
                </span>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={dismissHowToPlay}
                className="w-full h-14 min-h-[56px] rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-950/30 transition-all"
              >
                <span>GOT IT — LET&apos;S PLAY!</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL-SCREEN SETTINGS PANEL (Controls, Graphics, Audio, Traffic)
          ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/98 backdrop-blur-2xl flex flex-col text-white pointer-events-auto overflow-hidden">
          {/* Header with Safe Area Inset */}
          <div
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="flex items-center justify-between pb-3 border-b border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Settings</h2>
                <p className="text-xs text-slate-400">Fonima 3D Engine & Preferences</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-semibold text-xs border border-white/15 flex items-center gap-1.5 transition-all"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>

          {/* Section Tabs (Min-h 48px thumb targets) */}
          <div
            style={{
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="pt-3 pb-2 flex gap-2 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0"
          >
            {(
              [
                ['controls', 'Controls'],
                ['graphics', 'Graphics & Time'],
                ['audio', 'Audio'],
                ['traffic', 'Traffic'],
              ] as const
            ).map(([tabKey, tabLabel]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setSettingsTab(tabKey)}
                className={`h-11 px-5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center justify-center ${
                  settingsTab === tabKey
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          {/* Tab Content Body */}
          <div
            style={{
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="flex-1 overflow-y-auto no-scrollbar py-4 space-y-6"
          >
            {/* SECTION 1: CONTROLS */}
            {settingsTab === 'controls' && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Camera Perspective Mode
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        'THIRD_PERSON',
                        'FIRST_PERSON',
                        'DRONE',
                        'CINEMATIC',
                      ] as CameraMode[]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateCameraSetting({ mode: m })}
                        className={`h-12 rounded-xl text-xs font-bold border transition-all ${
                          camSettings.mode === m
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {formatCameraModeLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Touch Sensitivity Slider */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-200">Look Touch Sensitivity</span>
                    <span className="font-mono text-amber-300">
                      {camSettings.sensitivity.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="2.5"
                    step="0.1"
                    value={camSettings.sensitivity}
                    onChange={(e) =>
                      updateCameraSetting({
                        sensitivity: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-3 accent-amber-500 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Precise (0.4x)</span>
                    <span>Fast (2.5x)</span>
                  </div>
                </div>

                {/* Camera Distance Slider */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-200">Camera Distance (Zoom)</span>
                    <span className="font-mono text-amber-300">
                      {camSettings.distance.toFixed(1)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.6"
                    max="9.5"
                    step="0.1"
                    value={camSettings.distance}
                    onChange={(e) =>
                      updateCameraSetting({
                        distance: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-3 accent-amber-500 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Close-up (1.6m)</span>
                    <span>Panoramic (9.5m)</span>
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setShowHowToPlay(true);
                    }}
                    className="h-12 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 flex items-center justify-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>Review &quot;How to Play&quot; Guide</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleRespawnAtNo22();
                      setIsSettingsOpen(false);
                    }}
                    className="h-12 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4 text-sky-400" />
                    <span>Teleport to Williams St No. 22</span>
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 2: GRAPHICS & TIME */}
            {settingsTab === 'graphics' && (
              <div className="space-y-5 max-w-2xl">
                {/* 24-Hour Time Slider */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-200 flex items-center gap-1.5">
                      {telemetry.isNight ? (
                        <Moon className="w-4 h-4 text-indigo-300" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-400" />
                      )}
                      <span>Time of Day (24-Hour Cycle)</span>
                    </span>
                    <span className="font-mono text-amber-300">
                      {telemetry.formattedClock} ({telemetry.dayPhaseName})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.25"
                    value={telemetry.timeHours}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      worldRef.current?.lighting.setTimeHours(val);
                      setTelemetry((prev) => ({
                        ...prev,
                        timeHours: val,
                        formattedClock:
                          worldRef.current?.lighting.getFormattedClock() ??
                          prev.formattedClock,
                        dayPhaseName:
                          worldRef.current?.lighting.getDayPhaseName() ??
                          prev.dayPhaseName,
                        isNight:
                          worldRef.current?.lighting.isNight ?? prev.isNight,
                      }));
                    }}
                    className="w-full h-3 accent-amber-500 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>00:00 (Midnight)</span>
                    <span>12:00 (Noon)</span>
                    <span>24:00 (Night)</span>
                  </div>
                </div>

                {/* Weather Presets */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Weather Condition
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(
                      [
                        ['clear', '☀️ Clear'],
                        ['cloudy', '⛅ Cloudy'],
                        ['rain', '🌧️ Rain'],
                        ['heavy_rain', '⛈️ Storm'],
                        ['mist', '🌫️ Mist'],
                      ] as [WeatherCondition, string][]
                    ).map(([wKey, wLabel]) => (
                      <button
                        key={wKey}
                        type="button"
                        onClick={() => updateWorldSetting({ weather: wKey })}
                        className={`h-12 rounded-xl text-xs font-bold border transition-all ${
                          worldSettings.weather === wKey
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {wLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Cycle Time Toggle */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-200">
                      Day & Night Auto-Progression
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Smooth dynamic lighting cycle across Sierra Leone
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateWorldSetting({
                        autoProgressTime: !worldSettings.autoProgressTime,
                      })
                    }
                    className={`h-10 px-4 rounded-xl text-xs font-bold transition-all ${
                      worldSettings.autoProgressTime
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/10 text-slate-300 border border-white/15'
                    }`}
                  >
                    {worldSettings.autoProgressTime ? 'ENABLED' : 'PAUSED'}
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 3: AUDIO */}
            {settingsTab === 'audio' && (
              <div className="space-y-5 max-w-2xl">
                {/* Master Audio Toggle */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                        telemetry.audioEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      {telemetry.audioEnabled ? (
                        <Volume2 className="w-5 h-5" />
                      ) : (
                        <VolumeX className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-200">
                        3D Spatial Sound Engine
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Vehicle engine, footsteps, rain, & environmental birds
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleAudio}
                    className={`h-11 px-5 rounded-xl text-xs font-bold transition-all ${
                      telemetry.audioEnabled
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'bg-white/10 text-slate-300 border border-white/15'
                    }`}
                  >
                    {telemetry.audioEnabled ? 'ON' : 'MUTED'}
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <div className="font-semibold text-amber-300">
                    Spatial Sound Sources:
                  </div>
                  <div>• 4x4 SUV V8 engine pitch dynamic throttle & reverse</div>
                  <div>• Car horn on demand with steering wheel button</div>
                  <div>• Surface footsteps (asphalt, concrete, red dirt, grass)</div>
                  <div>• Tropical African bird ambient sounds and rain droplets</div>
                </div>
              </div>
            )}

            {/* SECTION 4: TRAFFIC */}
            {settingsTab === 'traffic' && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Highway & Street Traffic Density
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        ['off', 'Off', '0 cars'],
                        ['low', 'Low', '~15'],
                        ['medium', 'Med', '~30'],
                        ['high', 'High', '~42'],
                      ] as [TrafficDensity, string, string][]
                    ).map(([dKey, dLabel, dSub]) => (
                      <button
                        key={dKey}
                        type="button"
                        onClick={() => updateWorldSetting({ trafficDensity: dKey })}
                        className={`h-14 rounded-2xl text-xs font-bold border transition-all flex flex-col items-center justify-center ${
                          (worldSettings.trafficDensity ||
                            telemetry.trafficDensity) === dKey
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <span>{dLabel}</span>
                        <span className="text-[10px] opacity-75">{dSub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Active Nearby Vehicles</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {telemetry.trafficCount} vehicles
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Performance</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {telemetry.fps} FPS · Smooth Instancing
                    </span>
                  </div>
                  <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400">
                    Vehicles observe right-hand highway lanes, check for lead
                    distance, and smoothly decelerate at junctions.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Thumb-Friendly Close Button (>= 56px Tall) */}
          <div
            style={{
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
            }}
            className="pt-3 border-t border-white/10 shrink-0"
          >
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="
                w-full h-14 min-h-[56px]
                bg-emerald-500 hover:bg-emerald-400 active:scale-98
                text-slate-950 font-bold text-base
                rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all
              "
            >
              <Check className="w-5 h-5" />
              <span>Resume Game</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          IN-GAME HUD (Clean Single-Row Top Bar, Safe-Area Fitted, No Clutter)
          ========================================================================= */}
      {inGame && !isSettingsOpen && (
        <>
          <header
            style={{
              paddingTop: 'max(0.45rem, env(safe-area-inset-top, 0px))',
              paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
              height: 'calc(2.9rem + env(safe-area-inset-top, 0px))',
            }}
            className="
              fixed top-0 left-0 right-0 z-20 pointer-events-auto
              bg-slate-950/75 backdrop-blur-md border-b border-white/10
              flex items-center justify-between gap-2.5
            "
          >
            {/* Zone 1: Current Zone Name (small, single-line, no overlap) + Time/Weather icons */}
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-[240px]">
                  {telemetry.regionId === 'BO_CITY'
                    ? 'Bo City'
                    : telemetry.regionId === 'FREETOWN'
                      ? 'Williams St, Freetown'
                      : 'Freetown–Bo Highway'}
                </span>
              </div>

              {/* Time and Weather Small Icons */}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-slate-300 shrink-0">
                {telemetry.isNight ? (
                  <Moon className="w-3.5 h-3.5 text-indigo-300" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{telemetry.formattedClock}</span>
                <span className="text-white/20">|</span>
                {telemetry.weather === 'rain' || telemetry.weather === 'heavy_rain' ? (
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                ) : telemetry.weather === 'mist' ? (
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                )}
              </div>

              {/* Destination badge: small badge or hidden until destination set */}
              {telemetry.destination !== 'NONE' && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-300 shrink-0">
                  <Navigation className="w-3 h-3 rotate-90 text-emerald-400" />
                  <span>
                    {telemetry.destination}: {telemetry.distanceToDestinationMeters}m
                  </span>
                </div>
              )}
            </div>

            {/* Zone 2: ONLY the Pause button on top right */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenPauseMenu}
                className="
                  h-10 px-3.5 rounded-xl bg-slate-900/80 backdrop-blur-md
                  border border-white/25 text-white font-bold text-xs
                  flex items-center gap-1.5 shadow-lg
                  hover:bg-white/15 active:scale-95 active:bg-amber-500 active:text-slate-950 transition-all
                "
                aria-label="Pause Menu"
              >
                <Pause className="w-4 h-4 text-amber-400" />
                <span className="tracking-wide">PAUSE</span>
              </button>
            </div>
          </header>

          {/* =========================================================================
              FULL-SCREEN PAUSE MENU (Resume, Settings, Camera Mode, Restart, Quit)
              ========================================================================= */}
          {isPaused && (
            <div
              style={{
                paddingTop: 'max(1.25rem, env(safe-area-inset-top, 0px))',
                paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
                paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
              }}
              className="
                fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl
                flex flex-col items-center justify-between text-white pointer-events-auto
                overflow-y-auto no-scrollbar
              "
            >
              {/* Header */}
              <div className="w-full max-w-md flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Pause className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-wider uppercase">Game Paused</h2>
                    <p className="text-xs text-slate-400">{telemetry.zoneName}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResumeGame}
                  className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-bold border border-white/15"
                >
                  Resume
                </button>
              </div>

              {/* Action Buttons Panel */}
              <div className="w-full max-w-md my-auto py-3 space-y-3.5">
                {/* 1. Big Resume Button */}
                <button
                  type="button"
                  onClick={handleResumeGame}
                  className="
                    w-full h-14 min-h-[56px] rounded-2xl
                    bg-emerald-500 hover:bg-emerald-400 active:scale-98
                    text-slate-950 font-black text-base tracking-wide
                    flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/40
                    transition-all
                  "
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>RESUME GAME</span>
                </button>

                {/* 2. Camera Mode Selector (Follow / First person / Aerial) */}
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Camera Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'THIRD_PERSON', label: 'Follow', icon: Camera },
                      { mode: 'FIRST_PERSON', label: 'First Person', icon: Eye },
                      { mode: 'DRONE', label: 'Aerial', icon: Plane },
                    ].map(({ mode, label, icon: Icon }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateCameraSetting({ mode: mode as CameraMode })}
                        className={`
                          h-12 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all
                          ${
                            camSettings.mode === mode
                              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md font-black'
                              : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Settings & World Map Row */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="
                      h-14 min-h-[56px] rounded-2xl bg-white/10 hover:bg-white/15 active:scale-98
                      border border-white/15 text-white font-bold text-sm
                      flex items-center justify-center gap-2 transition-all
                    "
                  >
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMapOpen(true)}
                    className="
                      h-14 min-h-[56px] rounded-2xl bg-white/10 hover:bg-white/15 active:scale-98
                      border border-white/15 text-white font-bold text-sm
                      flex items-center justify-center gap-2 transition-all
                    "
                  >
                    <MapIcon className="w-4 h-4 text-emerald-400" />
                    <span>World Map</span>
                  </button>
                </div>

                {/* Quick Vehicle Switch in Pause Menu */}
                <button
                  type="button"
                  onClick={() => {
                    worldRef.current?.toggleVehicleEnterExit();
                  }}
                  className="
                    w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-98
                    border border-white/10 text-white font-semibold text-xs
                    flex items-center justify-center gap-2 transition-all
                  "
                >
                  <Car className="w-4 h-4 text-sky-400" />
                  <span>
                    {telemetry.isDriving ? 'Exit Vehicle (Walk on Foot)' : 'Enter 4x4 Land Cruiser SUV'}
                  </span>
                </button>

                {/* 4. Restart Location & Quit to Title */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleRestartLocation}
                    className="
                      h-13 min-h-[52px] rounded-2xl bg-white/5 hover:bg-amber-500/20 active:scale-98
                      border border-white/15 hover:border-amber-400 text-amber-300 font-bold text-xs
                      flex items-center justify-center gap-2 transition-all
                    "
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restart Location</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleQuitToTitle}
                    className="
                      h-13 min-h-[52px] rounded-2xl bg-white/5 hover:bg-rose-500/20 active:scale-98
                      border border-white/15 hover:border-rose-400 text-rose-300 font-bold text-xs
                      flex items-center justify-center gap-2 transition-all
                    "
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Quit to Title</span>
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="w-full max-w-md text-center text-[11px] text-slate-500 pb-1">
                Fonima 3D · Williams St, Freetown ↔ Bo City Highway
              </div>
            </div>
          )}

          {/* Contextual Interaction Banner */}
          {telemetry.nearbyInteractable && (
            <div
              style={{
                top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
              }}
              className="
                fixed left-1/2 -translate-x-1/2 z-20
                w-[90%] max-w-sm px-4 py-2.5 rounded-2xl
                bg-slate-950/90 backdrop-blur-md border border-amber-400/40
                shadow-xl pointer-events-none text-center
              "
            >
              <p className="text-xs font-bold text-amber-300">
                {telemetry.nearbyInteractable.title}
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {telemetry.nearbyInteractable.subtitle}
              </p>
            </div>
          )}

          {/* Story / Landmark Arrival Toast */}
          {telemetry.lastInteractionMessage && !telemetry.nearbyInteractable && (
            <div
              style={{
                top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
              }}
              className="
                fixed left-1/2 -translate-x-1/2 z-20
                w-[90%] max-w-md px-4 py-2 rounded-2xl
                bg-slate-950/85 backdrop-blur-md border border-white/15
                shadow-lg pointer-events-none text-center
              "
            >
              <p className="text-xs text-slate-100 leading-relaxed font-medium">
                {telemetry.lastInteractionMessage}
              </p>
            </div>
          )}

          {/* CONNECTED WORLD MAP MODAL */}
          {isMapOpen && (
            <div
              style={{
                top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
                right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
              }}
              className="
                fixed z-30
                w-80 sm:w-96 p-4 rounded-3xl
                bg-slate-950/95 backdrop-blur-xl border border-white/15
                shadow-2xl pointer-events-auto text-white
              "
            >
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-1.5">
                    <MapIcon className="w-4 h-4 text-emerald-400" />
                    Sierra Leone Highway Corridor
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Freetown (West) ↔ Rural Corridor ↔ Bo City (East)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Highway Canvas Representation */}
              <div className="relative w-full h-32 rounded-2xl bg-slate-900/90 border border-white/10 overflow-hidden mb-3">
                <div
                  className="absolute inset-x-0 h-1 bg-amber-500/40"
                  style={{ top: '50%', transform: 'translateY(-50%)' }}
                />
                <div
                  className="absolute inset-x-0 border-t border-dashed border-white/30"
                  style={{ top: '50%' }}
                />

                {/* Freetown Marker */}
                <div className="absolute left-[4%] top-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="w-3 h-3 mx-auto rounded-full bg-sky-400 border-2 border-white shadow-sm" />
                  <span className="text-[9px] font-bold text-sky-300 block mt-0.5">
                    Freetown
                  </span>
                </div>

                {/* Bo City Marker */}
                <div className="absolute right-[4%] top-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="w-3 h-3 mx-auto rounded-full bg-emerald-400 border-2 border-white shadow-sm" />
                  <span className="text-[9px] font-bold text-emerald-300 block mt-0.5">
                    Bo City
                  </span>
                </div>

                {/* Active Player / SUV Marker */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200"
                  style={{
                    left: `${mapPercentX(telemetry.x)}%`,
                    top: `${mapPercentZ(telemetry.z)}%`,
                  }}
                >
                  <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md flex items-center justify-center animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Destination:</span>
                <div className="flex gap-1.5">
                  {(['BO', 'FREETOWN', 'NONE'] as NavigationDestination[]).map(
                    (d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleSetDestination(d)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          telemetry.destination === d
                            ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                            : 'bg-white/5 text-slate-300 border-white/10'
                        }`}
                      >
                        {d}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Touch & Keyboard Virtual Controls */}
          {!isPaused && (
            <MobileControls
              inputRef={inputRef}
              nearbyInteractable={telemetry.nearbyInteractable}
              isSprinting={telemetry.isSprinting}
              isDriving={telemetry.isDriving}
              vehicleSpeedKmh={telemetry.vehicleSpeedKmh}
              cameraMode={camSettings.mode}
              cinematicShotIndex={camSettings.cinematicShotIndex}
              onSelectCinematicShot={(shotIdx) =>
                updateCameraSetting({ cinematicShotIndex: shotIdx })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
