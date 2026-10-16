import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Car,
  CloudRain,
  Compass,
  Download,
  Map as MapIcon,
  Maximize,
  Minimize,
  Moon,
  Navigation,
  RotateCcw,
  Sliders,
  Sun,
  UserCheck,
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
  loadSavedWorldSettings,
} from './systems/GameState';
import { WorldSystem } from './systems/World';
import { MobileControls } from './systems/MobileControls';

type ActiveModal = 'none' | 'camera' | 'weather_time' | 'map' | 'traffic';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldSystem | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

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

  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
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
    } catch (e) {
      console.warn('Fullscreen toggle request was prevented:', e);
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
      // Automatically attempt a clean canvas remount after 650ms so the user is never stuck
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
      world = new WorldSystem(canvas);
      worldRef.current = world;
      setWebglError(false);

      // Perform one synchronous state & telemetry warm-up step after shader compilation
      // before scheduling the requestAnimationFrame loop
      const initialTelemetry = world.update(0.016, inputRef.current);
      setTelemetry({ ...initialTelemetry });
    } catch {
      setWebglError(true);
      return;
    }

    let lastTime = performance.now();
    let uiSyncAccumulator = 0;

    const animate = (now: number) => {
      if (isDisposed) return;

      // Skip frame if tab is hidden or WebGL context is temporarily lost
      if (document.hidden || world.isContextLost()) {
        lastTime = now;
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      // Clamp dt tightly so shader/asset compilation or tab switching never causes a physics jump
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

  const handleCycleCameraMode = () => {
    const order: CameraMode[] = ['THIRD_PERSON', 'DRONE', 'CINEMATIC'];
    const next = order[(order.indexOf(camSettings.mode) + 1) % order.length];
    updateCameraSetting({ mode: next });
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

  const getCardinalDirection = (rad: number): string => {
    const deg = (((-rad * 180) / Math.PI) % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  const formatCameraModeLabel = (mode: CameraMode) => {
    if (mode === 'THIRD_PERSON') return '3rd Person';
    if (mode === 'DRONE') return 'Aerial Drone';
    return 'Cinematic';
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
              immediately restore Freetown & Bo City.
            </p>
            <button
              type="button"
              onClick={() => {
                setWebglError(false);
                setCanvasKey((k) => k + 1);
              }}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg"
            >
              Restore 3D World
            </button>
          </div>
        </div>
      )}

      {/* Top Bar Contract: Single-Row, 3-Zone Translucent HUD with Safe-Area Insets */}
      <header
        style={{
          paddingTop: 'max(0.35rem, env(safe-area-inset-top, 0px))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          height: 'calc(3.25rem + env(safe-area-inset-top, 0px))',
        }}
        className="
          fixed top-0 left-0 right-0 z-20
          px-3 sm:px-4
          bg-black/60 backdrop-blur-md border-b border-white/10
          flex items-center justify-between gap-2
        "
      >
        {/* Zone 1: Dynamic Region Brand Title (Freetown ↔ Highway ↔ Bo City) */}
        <span className="font-display text-xs sm:text-sm font-semibold tracking-tight text-white whitespace-nowrap">
          {telemetry.regionId === 'BO_CITY'
            ? 'Bo City · Southern Province'
            : telemetry.regionId === 'FREETOWN'
              ? 'Goodrich · Freetown'
              : 'Freetown–Bo Highway'}
        </span>

        {/* Zone 2: Clean Unboxed Location, 24h Clock & Navigation Telemetry */}
        <nav className="hidden lg:flex items-center gap-2.5 text-xs text-white/85">
          <span className="font-medium text-amber-300 whitespace-nowrap">
            {telemetry.zoneName}
          </span>
          <span aria-hidden="true" className="text-white/30">
            ·
          </span>
          <span className="font-mono tabular-nums text-sky-200 whitespace-nowrap">
            {telemetry.formattedClock} ({telemetry.dayPhaseName})
          </span>
          {telemetry.destination !== 'NONE' && (
            <>
              <span aria-hidden="true" className="text-white/30">
                ·
              </span>
              <span className="font-mono tabular-nums text-emerald-300 whitespace-nowrap">
                DEST: {telemetry.destination} ({telemetry.distanceToDestinationMeters}m)
              </span>
            </>
          )}
        </nav>

        {/* Zone 3: Action Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Quick Enter/Exit Car Toggle */}
          <button
            type="button"
            onClick={() => worldRef.current?.toggleVehicleEnterExit()}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              telemetry.isDriving
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title="Enter or Exit your 4x4 SUV"
          >
            <Car className="w-3.5 h-3.5" />
            <span>
              {telemetry.isDriving
                ? `Driving (${telemetry.vehicleSpeedKmh} km/h)`
                : 'Car'}
            </span>
          </button>

          {/* Inspect Digital Clone Face Close-Up Button */}
          {!telemetry.isDriving && (
            <button
              type="button"
              onClick={handleInspectCloneFace}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                camSettings.mode === 'CINEMATIC' &&
                camSettings.cinematicShotIndex === 2
                  ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                  : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
              }`}
              title="Inspect your 3D Digital Clone Face Close-Up"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clone Face</span>
            </button>
          )}

          {/* Cycle Camera Mode Button */}
          <button
            type="button"
            onClick={handleCycleCameraMode}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Switch Camera Mode (Third-Person / Aerial Drone / Cinematic)"
          >
            <Camera className="w-3.5 h-3.5 text-amber-300" />
            <span>{formatCameraModeLabel(camSettings.mode)}</span>
          </button>

          {/* Camera Studio Settings Modal Button */}
          <button
            type="button"
            onClick={() =>
              setActiveModal((m) => (m === 'camera' ? 'none' : 'camera'))
            }
            className={`p-1.5 rounded-lg border transition-colors ${
              activeModal === 'camera'
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title="Camera Studio Settings"
            aria-label="Camera Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {/* 24h Day/Night & Weather Modal Button */}
          <button
            type="button"
            onClick={() =>
              setActiveModal((m) =>
                m === 'weather_time' ? 'none' : 'weather_time'
              )
            }
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeModal === 'weather_time'
                ? 'bg-sky-400 text-slate-950 border-sky-200 font-semibold'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title="24-Hour Day/Night Cycle & Weather"
          >
            {telemetry.weather === 'rain' ||
            telemetry.weather === 'heavy_rain' ? (
              <CloudRain className="w-3.5 h-3.5 text-sky-300" />
            ) : telemetry.isNight ? (
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span className="font-mono">{telemetry.formattedClock}</span>
          </button>

          {/* Audio Toggle */}
          <button
            type="button"
            onClick={handleToggleAudio}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors"
            title="Toggle 3D Spatial Audio"
            aria-label="Toggle Audio"
          >
            {telemetry.audioEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-white/60" />
            )}
          </button>

          {/* Traffic Density Settings Button */}
          <button
            type="button"
            onClick={() =>
              setActiveModal((m) => (m === 'traffic' ? 'none' : 'traffic'))
            }
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeModal === 'traffic'
                ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title="City Traffic & Vehicle Density"
          >
            <Car className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Traffic</span>
            <span className="text-[10px] font-mono text-amber-200">
              ({telemetry.trafficCount})
            </span>
          </button>

          {/* World Map & Navigation Button */}
          <button
            type="button"
            onClick={() =>
              setActiveModal((m) => (m === 'map' ? 'none' : 'map'))
            }
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 whitespace-nowrap ${
              activeModal === 'map'
                ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-semibold'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title="Open Connected World Map & Navigation (Freetown ↔ Bo)"
          >
            <MapIcon className="w-3.5 h-3.5 text-emerald-300" />
            <span className="hidden sm:inline">Map / Nav</span>
          </button>

          {/* Reset to No. 22 Williams St */}
          <button
            type="button"
            onClick={handleRespawnAtNo22}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors"
            title="Return to No. 22 Williams Street, Fonima (Freetown)"
            aria-label="Return to No. 22 Williams Street"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen API Toggle Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFullscreen
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-white/10 text-white hover:bg-white/15 border-white/15'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Mode'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize className="w-3.5 h-3.5" />
            ) : (
              <Maximize className="w-3.5 h-3.5" />
            )}
          </button>

          {/* PWA Install Button (PWABuilder / Chromium Install Prompt) */}
          {deferredPrompt && !isInstalled && (
            <button
              type="button"
              onClick={handleInstallPwa}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs border border-emerald-300 transition-colors flex items-center gap-1 whitespace-nowrap shadow-md"
              title="Install Fonima 3D App to Home Screen"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Sub-Banner: Unboxed Street Name, Region & Active Destination Distance with Safe Area */}
      <div
        style={{
          top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
        className="fixed z-10 flex items-center justify-between pointer-events-none lg:hidden"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300 drop-shadow">
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[205px]">{telemetry.zoneName}</span>
          <span className="text-white/50">·</span>
          <span className="text-sky-200">{telemetry.dayPhaseName}</span>
        </div>

        {telemetry.destination !== 'NONE' && (
          <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-300 drop-shadow">
            <Navigation className="w-3 h-3 rotate-90" />
            <span>
              {telemetry.destination}: {telemetry.distanceToDestinationMeters}m
            </span>
          </div>
        )}
      </div>

      {/* Contextual Interaction Prompt Banner */}
      {telemetry.nearbyInteractable && (
        <div
          style={{
            top: 'calc(5.5rem + env(safe-area-inset-top, 0px))',
          }}
          className="
            fixed left-1/2 -translate-x-1/2 z-20
            w-[90%] max-w-sm px-4 py-2.5 rounded-xl
            bg-slate-950/85 backdrop-blur-md border border-amber-400/40
            shadow-xl pointer-events-none text-center
          "
        >
          <p className="text-xs font-semibold text-amber-300">
            {telemetry.nearbyInteractable.title}
          </p>
          <p className="text-[11px] text-slate-300 mt-0.5">
            {telemetry.nearbyInteractable.subtitle}
          </p>
        </div>
      )}

      {/* Story / Landmark / Region Arrival Toast */}
      {telemetry.lastInteractionMessage && !telemetry.nearbyInteractable && (
        <div
          style={{
            top: 'calc(5.5rem + env(safe-area-inset-top, 0px))',
          }}
          className="
            fixed left-1/2 -translate-x-1/2 z-20
            w-[90%] max-w-md px-4 py-2.5 rounded-xl
            bg-slate-950/80 backdrop-blur-md border border-white/15
            shadow-lg pointer-events-none text-center
          "
        >
          <p className="text-xs text-slate-100 leading-relaxed">
            {telemetry.lastInteractionMessage}
          </p>
        </div>
      )}

      {/* MODAL 1: CAMERA STUDIO SETTINGS */}
      {activeModal === 'camera' && (
        <div
          style={{
            top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
          className="
            fixed z-30
            w-80 sm:w-96 p-4 rounded-2xl
            bg-slate-950/92 backdrop-blur-md border border-white/15
            shadow-2xl pointer-events-auto text-white
          "
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
            <div>
              <h2 className="text-sm font-semibold">3D Camera Studio</h2>
              <p className="text-[11px] text-slate-400">
                Pinch screen with 2 fingers or use sliders to zoom
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {(
              ['THIRD_PERSON', 'DRONE', 'CINEMATIC'] as CameraMode[]
            ).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateCameraSetting({ mode: m })}
                className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                  camSettings.mode === m
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                }`}
              >
                {formatCameraModeLabel(m)}
              </button>
            ))}
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">Camera Distance (Zoom)</span>
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
                  updateCameraSetting({ distance: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">Camera Height Offset</span>
                <span className="font-mono text-amber-300">
                  {camSettings.height.toFixed(2)}m
                </span>
              </div>
              <input
                type="range"
                min="1.1"
                max="2.4"
                step="0.05"
                value={camSettings.height}
                onChange={(e) =>
                  updateCameraSetting({ height: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">Touch Sensitivity</span>
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
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">Field of View (FOV)</span>
                <span className="font-mono text-amber-300">
                  {camSettings.fov}°
                </span>
              </div>
              <input
                type="range"
                min="45"
                max="80"
                step="1"
                value={camSettings.fov}
                onChange={(e) =>
                  updateCameraSetting({ fov: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            {camSettings.mode === 'DRONE' && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Aerial Drone Speed</span>
                  <span className="font-mono text-sky-300">
                    {camSettings.droneSpeed.toFixed(0)} m/s
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="24"
                  step="1"
                  value={camSettings.droneSpeed}
                  onChange={(e) =>
                    updateCameraSetting({
                      droneSpeed: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400"
                />
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
            <button
              type="button"
              onClick={() => updateCameraSetting(DEFAULT_CAMERA_SETTINGS)}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Reset Default Camera
            </button>
            <button
              type="button"
              onClick={handleInspectCloneFace}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-medium"
            >
              Inspect Clone Face
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: 24-HOUR DAY/NIGHT CYCLE & SIERRA LEONE WEATHER SYSTEM */}
      {activeModal === 'weather_time' && (
        <div
          style={{
            top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
          className="
            fixed z-30
            w-80 sm:w-96 p-4 rounded-2xl
            bg-slate-950/92 backdrop-blur-md border border-white/15
            shadow-2xl pointer-events-auto text-white
          "
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
            <div>
              <h2 className="text-sm font-semibold">
                Sierra Leone 24h Cycle & Weather
              </h2>
              <p className="text-[11px] text-slate-400">
                Shared across Freetown, Highway & Bo · {telemetry.formattedClock}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-slate-300 mb-1.5">
              Weather Condition (Affects Roads, Lighting & Rain)
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['clear', 'Clear Sun'],
                  ['cloudy', 'Cloudy'],
                  ['rain', 'Light Rain'],
                  ['heavy_rain', 'Heavy Rain'],
                  ['mist', 'Morning Mist'],
                ] as [WeatherCondition, string][]
              ).map(([wKey, wLabel]) => (
                <button
                  key={wKey}
                  type="button"
                  onClick={() => updateWorldSetting({ weather: wKey })}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                    worldSettings.weather === wKey
                      ? 'bg-sky-500 text-slate-950 border-sky-300 font-semibold'
                      : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {wLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">Time of Day (24h Clock)</span>
                <span className="font-mono text-amber-300">
                  {telemetry.formattedClock} ({telemetry.dayPhaseName})
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="23.9"
                step="0.1"
                value={telemetry.timeHours}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  worldRef.current?.lighting.setTimeHours(val);
                  setTelemetry((prev) => ({
                    ...prev,
                    timeHours: val,
                    formattedClock:
                      worldRef.current?.lighting.getFormattedClock() ||
                      prev.formattedClock,
                    dayPhaseName:
                      worldRef.current?.lighting.getDayPhaseName() ||
                      prev.dayPhaseName,
                  }));
                }}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-5 gap-1">
              {[
                ['Sunrise', 6.3],
                ['Morning', 9.5],
                ['Midday', 12.5],
                ['Sunset', 17.8],
                ['Night', 21.5],
              ].map(([label, hr]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    worldRef.current?.lighting.setTimeHours(hr as number)
                  }
                  className="py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="pt-2">
              <div className="flex justify-between mb-1">
                <span className="text-slate-300">24h Cycle Duration</span>
                <span className="font-mono text-amber-300">
                  {worldSettings.dayDurationMinutes} real mins
                </span>
              </div>
              <input
                type="range"
                min="15"
                max="30"
                step="5"
                value={worldSettings.dayDurationMinutes}
                onChange={(e) =>
                  updateWorldSetting({
                    dayDurationMinutes: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-slate-300">
                Auto-Progress 24-Hour Cycle
              </span>
              <input
                type="checkbox"
                checked={worldSettings.autoProgressTime}
                onChange={(e) =>
                  updateWorldSetting({ autoProgressTime: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </label>
          </div>
        </div>
      )}

      {/* MODAL 3: CONNECTED SIERRA LEONE WORLD MAP & NAVIGATION (FREETOWN ↔ HIGHWAY ↔ BO CITY) */}
      {activeModal === 'map' && (
        <div
          style={{
            top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
          className="
            fixed z-30
            w-80 sm:w-96 p-4 rounded-2xl
            bg-slate-950/92 backdrop-blur-md border border-white/15
            shadow-2xl pointer-events-auto text-white
          "
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Sierra Leone Connected World Map
              </h2>
              <p className="text-[11px] text-slate-400">
                {telemetry.regionLabel} · Heading{' '}
                {getCardinalDirection(telemetry.heading)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              aria-label="Close Map"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Destination Selector Buttons (DESTINATION → BO or FREETOWN) */}
          <div className="mb-3">
            <span className="block text-[11px] text-slate-300 mb-1.5">
              Set GPS Navigation Destination:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleSetDestination('BO')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                  telemetry.destination === 'BO'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-200'
                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                }`}
              >
                DEST → BO
              </button>
              <button
                type="button"
                onClick={() => handleSetDestination('FREETOWN')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                  telemetry.destination === 'FREETOWN'
                    ? 'bg-amber-500 text-slate-950 border-amber-200'
                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                }`}
              >
                DEST → FREETOWN
              </button>
              <button
                type="button"
                onClick={() => handleSetDestination('NONE')}
                className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                  telemetry.destination === 'NONE'
                    ? 'bg-slate-600 text-white border-slate-400'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                }`}
              >
                Clear Nav
              </button>
            </div>
          </div>

          {/* Connected Regional Highway & City Map */}
          <div className="relative w-full h-48 bg-stone-900 rounded-xl overflow-hidden border border-white/10">
            {/* Freetown Region Zone (West) */}
            <div
              className="absolute top-2 bottom-2 bg-amber-500/10 border border-amber-400/30 rounded-lg"
              style={{ left: '3%', width: '16%' }}
            />
            <span className="absolute left-[4.5%] top-3 text-[8px] font-mono font-bold text-amber-300">
              FREETOWN
            </span>
            <span className="absolute left-[4.5%] top-6 text-[7px] font-mono text-slate-400">
              No. 22 Fonima
            </span>

            {/* Bo City Region Zone (East) */}
            <div
              className="absolute top-2 bottom-2 bg-emerald-500/12 border border-emerald-400/35 rounded-lg"
              style={{ left: '78%', width: '19%' }}
            />
            <span className="absolute left-[80%] top-3 text-[8px] font-mono font-bold text-emerald-300">
              BO CITY
            </span>
            <span className="absolute left-[80%] top-6 text-[7px] font-mono text-slate-300">
              Clocktower & Mkt
            </span>

            {/* Connecting Freetown-Bo Highway Ribbon */}
            <svg
              viewBox="0 0 200 100"
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="none"
            >
              <path
                d="M 10 50 L 32 50 C 60 32, 85 68, 110 46 C 130 30, 145 58, 165 50 L 192 50"
                fill="none"
                stroke="#475569"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d="M 10 50 L 32 50 C 60 32, 85 68, 110 46 C 130 30, 145 58, 165 50 L 192 50"
                fill="none"
                stroke="#facc15"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
            </svg>

            {/* Key Highway Waypoints */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 bg-slate-900/80 border border-white/20 rounded text-[7px] font-mono text-slate-200"
              style={{ left: `${mapPercentX(240)}%`, top: '34%' }}
            >
              Songo
            </div>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 bg-emerald-950/90 border border-emerald-400/40 rounded text-[7px] font-mono text-emerald-200"
              style={{ left: `${mapPercentX(465)}%`, top: '66%' }}
            >
              Mile 91 Fuel
            </div>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 bg-sky-950/90 border border-sky-400/40 rounded text-[7px] font-mono text-sky-200"
              style={{ left: `${mapPercentX(670)}%`, top: '33%' }}
            >
              Sewa Bridge
            </div>

            {/* Bo Destination Pin */}
            {telemetry.destination === 'BO' && (
              <div
                style={{
                  left: `${mapPercentX(1150)}%`,
                  top: `${mapPercentZ(0)}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-400/30 border-2 border-emerald-400 animate-ping"
              />
            )}

            {/* Parked 4x4 SUV Marker (if walking separately) */}
            {!telemetry.isDriving && (
              <div
                style={{
                  left: `${mapPercentX(telemetry.vehiclePosition.x)}%`,
                  top: `${mapPercentZ(telemetry.vehiclePosition.z)}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-sm bg-sky-400 border border-slate-950"
                title="Your 4x4 SUV"
              />
            )}

            {/* Live Player / Vehicle Position Marker */}
            <div
              style={{
                left: `${mapPercentX(telemetry.x)}%`,
                top: `${mapPercentZ(telemetry.z)}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-lg"
              title="Your Current Location"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300 font-mono tabular-nums">
            <span>
              Mode: {telemetry.isDriving ? '4x4 SUV' : telemetry.animState}
            </span>
            <span>
              {telemetry.isDriving
                ? `${telemetry.vehicleSpeedKmh} km/h`
                : `${telemetry.speed.toFixed(1)} m/s`}
            </span>
            <span>
              {telemetry.destination !== 'NONE'
                ? `${telemetry.destination}: ${telemetry.distanceToDestinationMeters}m`
                : 'Free Roam'}
            </span>
          </div>
        </div>
      )}

      {/* MODAL 4: TRAFFIC & VEHICLE DENSITY SETTINGS */}
      {activeModal === 'traffic' && (
        <div
          style={{
            top: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
          className="
            fixed z-30
            w-80 sm:w-96 p-4 rounded-2xl
            bg-slate-950/92 backdrop-blur-md border border-white/15
            shadow-2xl pointer-events-auto text-white
          "
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Car className="w-4 h-4 text-amber-400" />
                City Traffic & Density
              </h2>
              <p className="text-[11px] text-slate-400">
                AI Vehicles along Freetown, Highway & Bo City
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-slate-300 mb-2">
              Traffic Density Setting (Saved locally)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
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
                  className={`py-2 px-1.5 rounded-xl text-xs font-medium border text-center transition-colors flex flex-col items-center justify-center ${
                    (worldSettings.trafficDensity ||
                      telemetry.trafficDensity) === dKey
                      ? 'bg-amber-500 text-slate-950 border-amber-300 font-semibold'
                      : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span>{dLabel}</span>
                  <span className="text-[9px] opacity-75">{dSub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Active Road Vehicles</span>
              <span className="font-mono text-amber-300 font-bold">
                {telemetry.trafficCount} nearby
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-300">Vehicle Types</span>
              <span className="text-slate-200 text-[11px]">
                Yellow Taxis · Private Cars · Small Trucks
              </span>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-white/10">
              <span className="text-slate-300">Target 60 FPS Engine</span>
              <span
                className={`font-mono font-semibold ${
                  telemetry.fps >= 50 ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {telemetry.fps} FPS · Smooth Instancing
              </span>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-400 leading-normal">
            Cars drive on the right-hand lane, slow down smoothly for corners and
            lead vehicles, and adapt dynamically to maintain phone performance.
          </div>
        </div>
      )}

      {/* Touch & Keyboard Controls Layer */}
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
    </div>
  );
}
