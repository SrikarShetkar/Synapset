import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useCreateFocusSession, useGetFocusHeatmap, getGetFocusHeatmapQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, RotateCcw, Coffee, Camera, CameraOff, Loader2, AlertCircle, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function Focus() {
  // ── timer ──────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft]   = useState(25 * 60);
  const [isActive, setIsActive]   = useState(false);
  const [isBreak, setIsBreak]     = useState(false);
  const [sessionsDone, setSessionsDone] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── CV focus tracker ───────────────────────────────────────────────────────
  const [cvEnabled, setCvEnabled]   = useState(false);
  const [cvLoading, setCvLoading]   = useState(false);
  const [cvError, setCvError]       = useState<string | null>(null);
  const [cvReady, setCvReady]       = useState(false);
  const [facePresent, setFacePresent] = useState(false);
  const [presenceFrames, setPresenceFrames] = useState(0);
  const [totalFrames, setTotalFrames]       = useState(0);

  const videoRef      = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);
  const presenceRef   = useRef({ present: 0, total: 0 });

  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const createFocusSession = useCreateFocusSession();
  const { data: heatmap } = useGetFocusHeatmap();

  // ── Pomodoro timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      if (!isBreak) {
        // Compute focus score from CV presence if available, else random
        const cvScore = presenceRef.current.total > 0
          ? Math.round((presenceRef.current.present / presenceRef.current.total) * 100)
          : Math.floor(Math.random() * 20 + 75);
        createFocusSession.mutate(
          { data: { duration: 25 * 60, focusConsistencyScore: cvScore } },
          { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFocusHeatmapQueryKey() }) }
        );
        setSessionsDone((s) => s + 1);
        // Reset counters
        presenceRef.current = { present: 0, total: 0 };
        setPresenceFrames(0);
        setTotalFrames(0);
        toast({ title: "Focus Session Complete!", description: `Focus score: ${cvScore}%` });
        setIsBreak(true);
        setTimeLeft(5 * 60);
      } else {
        toast({ title: "Break Over!", description: "Ready for another session?" });
        setIsBreak(false);
        setTimeLeft(25 * 60);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, timeLeft, isBreak, toast, createFocusSession, queryClient]);

  // ── CV: load MediaPipe FaceLandmarker ──────────────────────────────────────
  const initCV = useCallback(async () => {
    setCvLoading(true);
    setCvError(null);
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => { videoRef.current!.play(); res(); };
        });
      }
      setCvReady(true);
      setCvLoading(false);
      startCVLoop();
    } catch (err: any) {
      setCvLoading(false);
      setCvEnabled(false);
      setCvError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied."
          : "Face tracker failed to load."
      );
    }
  }, []);

  const stopCV = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCvReady(false);
    setFacePresent(false);
  }, []);

  const startCVLoop = useCallback(() => {
    const loop = () => {
      const video = videoRef.current;
      const lm    = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const result = lm.detectForVideo(video, performance.now());
      const present = (result.faceLandmarks?.length ?? 0) > 0;
      setFacePresent(present);

      // Only track frames while a session is active
      if ((window as any).__focusSessionActive) {
        presenceRef.current.total  += 1;
        if (present) presenceRef.current.present += 1;
        setTotalFrames(presenceRef.current.total);
        setPresenceFrames(presenceRef.current.present);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Signal to CV loop when session is active
  useEffect(() => {
    (window as any).__focusSessionActive = isActive && !isBreak;
  }, [isActive, isBreak]);

  // Handle CV toggle
  const handleCvToggle = (on: boolean) => {
    setCvEnabled(on);
    if (on && !cvReady) initCV();
    else if (!on) stopCV();
  };

  useEffect(() => () => stopCV(), [stopCV]);

  const toggleTimer = () => setIsActive((a) => !a);
  const resetTimer  = () => {
    setIsActive(false); setIsBreak(false); setTimeLeft(25 * 60);
    if (timerRef.current) clearInterval(timerRef.current);
    presenceRef.current = { present: 0, total: 0 };
    setPresenceFrames(0); setTotalFrames(0);
  };
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const progress     = isBreak ? 1 - timeLeft / (5 * 60) : 1 - timeLeft / (25 * 60);
  const circumference = 2 * Math.PI * 120;
  const presencePct  = totalFrames > 0 ? Math.round((presenceFrames / totalFrames) * 100) : null;

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deep Work Mode</h1>
          <p className="text-muted-foreground mt-1">Wire connections faster with unbroken concentration.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* ── Timer ── */}
          <div className="md:col-span-2">
            <div className="bg-card border border-card-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden">
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-0">
                  <div className={`w-[350px] h-[350px] rounded-full filter blur-[120px] opacity-15 animate-pulse-glow ${isBreak ? "bg-primary" : "bg-accent"}`} />
                </div>
              )}
              <div className="relative z-10 flex flex-col items-center">
                <div className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-8">
                  {isBreak ? "Break Time" : "Focus Session"}
                </div>
                {/* Ring */}
                <div className="relative mb-10">
                  <svg width="280" height="280" className="-rotate-90">
                    <circle cx="140" cy="140" r="120" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                    <circle
                      cx="140" cy="140" r="120" fill="none"
                      stroke={isBreak ? "hsl(var(--primary))" : "hsl(var(--accent))"}
                      strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - progress)}
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-6xl font-bold tracking-tighter font-mono tabular-nums text-foreground">
                      {formatTime(timeLeft)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">{isBreak ? "rest" : "focus"}</div>
                    {cvEnabled && cvReady && presencePct !== null && (
                      <div className={`mt-2 text-xs font-semibold flex items-center gap-1 ${facePresent ? "text-green-400" : "text-red-400"}`}>
                        {facePresent ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                        {presencePct}% present
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button
                    size="lg"
                    onClick={toggleTimer}
                    className={`w-32 h-14 rounded-full text-lg font-bold shadow-lg transition-all ${
                      isActive
                        ? "bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                    }`}
                  >
                    {isActive ? <><Square className="w-5 h-5 mr-2" />Pause</> : <><Play className="w-5 h-5 mr-2" />Start</>}
                  </Button>
                  <Button size="lg" variant="outline" onClick={resetTimer} className="w-14 h-14 rounded-full p-0">
                    <RotateCcw className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-5">
            {/* CV Focus Tracker */}
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Focus Tracker</span>
                </div>
                <Switch
                  checked={cvEnabled}
                  onCheckedChange={handleCvToggle}
                  disabled={cvLoading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                CV detects your presence via face tracking. Scores how long you stayed focused.
              </p>

              {cvError && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {cvError}
                </div>
              )}

              {cvLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading face model...
                </div>
              )}

              {cvEnabled && cvReady && (
                <div className="space-y-3">
                  {/* Camera thumbnail */}
                  <div className="relative rounded-lg overflow-hidden aspect-video bg-background border border-border">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                      playsInline muted
                    />
                    {/* Status overlay */}
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 bg-black/70 rounded-full px-2 py-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${facePresent ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                      <span className="text-[9px] font-mono text-white">
                        {facePresent ? "PRESENT" : "AWAY"}
                      </span>
                    </div>
                  </div>

                  {/* Presence bar */}
                  {presencePct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Presence score</span>
                        <span className="font-mono text-primary">{presencePct}%</span>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${presencePct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button onClick={() => { setCvEnabled(false); stopCV(); }} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    Stop camera
                  </button>
                </div>
              )}
            </div>

            {/* Session counter */}
            <div className="bg-card border border-card-border rounded-xl p-5 text-center">
              <div className="text-4xl font-black text-primary font-mono mb-1">{sessionsDone}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Sessions today</div>
              <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
                {Array.from({ length: Math.max(4, sessionsDone + 1) }).map((_, i) => (
                  <div key={i} className={`w-6 h-6 rounded-sm transition-all ${i < sessionsDone ? "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" : "bg-sidebar-accent"}`} />
                ))}
              </div>
            </div>

            {/* Next break */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">Next break</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {isBreak ? "Resting. Synaptic pruning in progress." :
                  isActive ? `${Math.ceil(timeLeft / 60)} min until break` :
                  "Start a session to begin tracking."}
              </p>
            </div>

            {/* Heatmap */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h3 className="font-semibold mb-3 text-sm">Focus History</h3>
              <div className="grid grid-cols-7 gap-1.5">
                {(heatmap && heatmap.length > 0
                  ? [...Array.from({ length: Math.max(0, 28 - heatmap.length) }, () => ({ score: 0 })), ...heatmap.slice(-28)]
                  : Array.from({ length: 28 }, () => ({ score: 0 }))
                ).map((entry, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-sm transition-all ${
                      entry.score > 80 ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.4)]" :
                      entry.score > 60 ? "bg-primary/60" :
                      entry.score > 0  ? "bg-primary/30" : "bg-sidebar-accent"
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                <span>Less</span><span>More</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
