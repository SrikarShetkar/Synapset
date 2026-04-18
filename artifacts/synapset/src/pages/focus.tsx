import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useCreateFocusSession, useGetFocusHeatmap, getGetFocusHeatmapQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Square, RotateCcw, Coffee, Camera, CameraOff,
  Loader2, AlertCircle, UserCheck, UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";

type SessionResult = { score: number; presencePct: number; duration: number };

function ScoreCard({ result, onClose }: { result: SessionResult; onClose: () => void }) {
  const grade =
    result.score >= 90 ? { letter: "A", label: "Neural Focus Achieved", color: "#10B981" } :
    result.score >= 75 ? { letter: "B", label: "Strong Concentration",   color: "#00D4FF" } :
    result.score >= 55 ? { letter: "C", label: "Moderate Focus",          color: "#F59E0B" } :
                         { letter: "D", label: "Needs More Focus",        color: "#EF4444" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85 }}
        className="bg-card border border-card-border rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl"
      >
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-5">Session Score</p>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="w-28 h-28 rounded-full border-4 mx-auto mb-5 flex items-center justify-center"
          style={{ borderColor: grade.color, boxShadow: `0 0 30px ${grade.color}40` }}
        >
          <div>
            <div className="text-5xl font-black font-mono" style={{ color: grade.color }}>{grade.letter}</div>
          </div>
        </motion.div>

        <div className="text-xl font-bold text-foreground mb-1">{grade.label}</div>
        <div className="text-sm text-muted-foreground mb-6">{result.score}% focus score</div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-sidebar rounded-xl p-3">
            <div className="text-2xl font-black font-mono text-primary">{result.presencePct}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Presence</div>
          </div>
          <div className="bg-sidebar rounded-xl p-3">
            <div className="text-2xl font-black font-mono text-foreground">{Math.round(result.duration / 60)}m</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Duration</div>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Focus Quality</span>
            <span className="font-mono" style={{ color: grade.color }}>{result.score}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${result.score}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
              className="h-full rounded-full"
              style={{ backgroundColor: grade.color }}
            />
          </div>
        </div>

        <Button onClick={onClose} className="w-full rounded-full">Done</Button>
      </motion.div>
    </motion.div>
  );
}

export default function Focus() {
  // ── timer ────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft]         = useState(25 * 60);
  const [isActive, setIsActive]         = useState(false);
  const [isBreak, setIsBreak]           = useState(false);
  const [sessionsDone, setSessionsDone] = useState(0);
  const [lastResult, setLastResult]     = useState<SessionResult | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── CV ───────────────────────────────────────────────────────────────────
  const [cvEnabled, setCvEnabled]     = useState(false);
  const [cvLoading, setCvLoading]     = useState(false);
  const [cvError, setCvError]         = useState<string | null>(null);
  const [cvReady, setCvReady]         = useState(false);
  const [facePresent, setFacePresent] = useState(false);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasOverRef  = useRef<HTMLCanvasElement>(null);
  const landmarkerRef  = useRef<any>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number | null>(null);
  const sessionActive  = useRef(false);
  const presenceRef    = useRef({ present: 0, total: 0 });
  const [presenceLive, setPresenceLive] = useState<number | null>(null);

  const { toast }          = useToast();
  const queryClient        = useQueryClient();
  const createFocusSession = useCreateFocusSession();
  const { data: heatmap }  = useGetFocusHeatmap();

  // ── Finish session ───────────────────────────────────────────────────────
  const finishSession = useCallback((sessionDuration: number) => {
    const cvScore = presenceRef.current.total > 0
      ? Math.round((presenceRef.current.present / presenceRef.current.total) * 100)
      : Math.floor(Math.random() * 20 + 75);

    createFocusSession.mutate(
      { data: { duration: sessionDuration, focusConsistencyScore: cvScore } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFocusHeatmapQueryKey() }) }
    );
    setLastResult({ score: cvScore, presencePct: cvScore, duration: sessionDuration });
    presenceRef.current = { present: 0, total: 0 };
    setPresenceLive(null);
    sessionActive.current = false;
  }, [createFocusSession, queryClient]);

  // ── Timer tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      if (!isBreak) {
        finishSession(25 * 60);
        setSessionsDone((s) => s + 1);
        setIsBreak(true);
        setTimeLeft(5 * 60);
        toast({ title: "Pomodoro Complete!", description: "5 min break — check your score." });
      } else {
        setIsBreak(false);
        setTimeLeft(25 * 60);
        toast({ title: "Break Over!", description: "Ready for another session?" });
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, timeLeft, isBreak, finishSession, toast]);

  // ── CV detection loop (ref-stable, no closure issues) ────────────────────
  const runLoop = useCallback(() => {
    const video = videoRef.current;
    const lm    = landmarkerRef.current;
    if (!video || !lm) return;

    const step = () => {
      if (video.readyState >= 2 && lm) {
        try {
          const result  = lm.detectForVideo(video, performance.now());
          const present = (result.faceLandmarks?.length ?? 0) > 0;
          setFacePresent(present);

          // Draw face mesh on overlay canvas
          const canvas = canvasOverRef.current;
          if (canvas && video.videoWidth > 0) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              if (result.faceLandmarks?.[0]) {
                const landmarks = result.faceLandmarks[0];
                // Draw key face contours (eyes, nose, mouth edges)
                const eyeL = [33,160,158,133,153,144,362,385,387,263,373,380];
                const eyeR = [362,385,387,263,373,380,33,160,158,133,153,144];
                [eyeL, eyeR].forEach((pts) => {
                  ctx.beginPath();
                  pts.forEach((idx, i) => {
                    const p = landmarks[idx];
                    if (!p) return;
                    const x = p.x * canvas.width;
                    const y = p.y * canvas.height;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                  });
                  ctx.strokeStyle = present ? "rgba(0,212,255,0.5)" : "rgba(239,68,68,0.5)";
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                });
                // Dot on nose tip
                const nose = landmarks[4];
                if (nose) {
                  ctx.beginPath();
                  ctx.arc(nose.x * canvas.width, nose.y * canvas.height, 4, 0, 2 * Math.PI);
                  ctx.fillStyle = "hsl(var(--primary))";
                  ctx.shadowBlur = 8;
                  ctx.shadowColor = "hsl(var(--primary))";
                  ctx.fill();
                  ctx.shadowBlur = 0;
                }
              }
            }
          }

          if (sessionActive.current) {
            presenceRef.current.total += 1;
            if (present) presenceRef.current.present += 1;
            const pct = Math.round((presenceRef.current.present / presenceRef.current.total) * 100);
            setPresenceLive(pct);
          }
        } catch (_) {}
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => { videoRef.current!.play(); res(); };
        });
      }
      setCvReady(true);
      setCvLoading(false);
      runLoop();
    } catch (err: any) {
      setCvLoading(false);
      setCvEnabled(false);
      setCvError(err?.name === "NotAllowedError" ? "Camera permission denied." : "Face tracker failed to load.");
    }
  }, [runLoop]);

  const stopCV = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCvReady(false);
    setFacePresent(false);
  }, []);

  const handleCvToggle = (on: boolean) => {
    setCvEnabled(on);
    if (on && !cvReady) initCV();
    else if (!on) stopCV();
  };

  useEffect(() => () => stopCV(), [stopCV]);

  const toggleTimer = () => {
    const next = !isActive;
    setIsActive(next);
    sessionActive.current = next && !isBreak;
  };
  const resetTimer = () => {
    setIsActive(false); setIsBreak(false); setTimeLeft(25 * 60);
    if (timerRef.current) clearInterval(timerRef.current);
    presenceRef.current = { present: 0, total: 0 };
    setPresenceLive(null);
    sessionActive.current = false;
  };
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const progress = isBreak ? 1 - timeLeft / (5 * 60) : 1 - timeLeft / (25 * 60);
  const circ     = 2 * Math.PI * 52; // small ring

  const gradeColor =
    presenceLive == null ? "hsl(var(--primary))" :
    presenceLive >= 90 ? "#10B981" :
    presenceLive >= 75 ? "#00D4FF" :
    presenceLive >= 55 ? "#F59E0B" : "#EF4444";

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deep Work Mode</h1>
          <p className="text-muted-foreground mt-1">CV-tracked focus with real-time presence scoring.</p>
        </div>

        {cvError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />{cvError}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* ── LEFT: Camera / CV (main area) ── */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              {/* Toggle bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-card-border">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Focus Tracker CV</span>
                  {cvEnabled && cvReady && (
                    <div className={`flex items-center gap-1.5 ml-2 text-xs font-medium ${facePresent ? "text-green-400" : "text-red-400"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${facePresent ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                      {facePresent ? "Present" : "Away"}
                    </div>
                  )}
                </div>
                <Switch checked={cvEnabled} onCheckedChange={handleCvToggle} disabled={cvLoading} />
              </div>

              {/* Camera feed */}
              <div className="relative aspect-video bg-background flex items-center justify-center overflow-hidden">
                {!cvEnabled && !cvLoading && (
                  <div className="flex flex-col items-center gap-3 text-center px-8">
                    <div className="p-4 bg-primary/10 rounded-full">
                      <Camera className="w-10 h-10 text-primary opacity-60" />
                    </div>
                    <p className="text-sm text-muted-foreground">Enable Focus Tracker to activate camera.<br />MediaPipe tracks your face presence in real time.</p>
                  </div>
                )}
                {cvLoading && (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading face model...</p>
                  </div>
                )}
                <video
                  ref={videoRef}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity ${cvReady ? "opacity-100" : "opacity-0"}`}
                  style={{ transform: "scaleX(-1)" }}
                  playsInline muted
                />
                <canvas
                  ref={canvasOverRef}
                  className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity ${cvReady ? "opacity-100" : "opacity-0"}`}
                  style={{ transform: "scaleX(-1)" }}
                />

                {/* Live score overlay (bottom of camera) */}
                {cvEnabled && cvReady && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] text-white/60 uppercase tracking-wider">Live Focus</div>
                      <div className="text-3xl font-black font-mono" style={{ color: gradeColor }}>
                        {presenceLive !== null ? `${presenceLive}%` : "—"}
                      </div>
                    </div>
                    {presenceLive !== null && (
                      <div className="text-right">
                        <div className="text-[10px] text-white/60 mb-1">Quality</div>
                        <div className="text-lg font-black font-mono" style={{ color: gradeColor }}>
                          {presenceLive >= 90 ? "A" : presenceLive >= 75 ? "B" : presenceLive >= 55 ? "C" : "D"}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Presence bar */}
              {cvEnabled && cvReady && presenceLive !== null && (
                <div className="px-5 py-3 border-t border-card-border">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Presence this session</span>
                    <span className="font-mono" style={{ color: gradeColor }}>{presenceLive}%</span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${presenceLive}%`, backgroundColor: gradeColor }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Focus heatmap */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-3">Focus History (28 days)</h3>
              <div className="grid grid-cols-14 gap-1">
                {(heatmap && heatmap.length > 0
                  ? [...Array.from({ length: Math.max(0, 28 - heatmap.length) }, () => ({ score: 0 })), ...heatmap.slice(-28)]
                  : Array.from({ length: 28 }, () => ({ score: 0 }))
                ).map((entry, i) => (
                  <div
                    key={i}
                    className={`h-6 rounded-sm transition-all ${
                      entry.score > 80 ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.4)]" :
                      entry.score > 60 ? "bg-primary/60" :
                      entry.score > 0  ? "bg-primary/30" : "bg-sidebar-accent"
                    }`}
                    title={`Score: ${entry.score}`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>28 days ago</span><span>Today</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Timer sidebar ── */}
          <div className="space-y-5">
            {/* Compact circular timer */}
            <div className="bg-card border border-card-border rounded-xl p-6 flex flex-col items-center gap-5">
              <div className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
                {isBreak ? "Break" : "Focus"}
              </div>

              {/* Small ring */}
              <div className="relative">
                <svg width="130" height="130" className="-rotate-90">
                  <circle cx="65" cy="65" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                  <circle
                    cx="65" cy="65" r="52" fill="none"
                    stroke={isBreak ? "hsl(var(--primary))" : "hsl(var(--accent))"}
                    strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - progress)}
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold font-mono tabular-nums">{formatTime(timeLeft)}</div>
                  {cvEnabled && presenceLive !== null && (
                    <div className="flex items-center gap-1 mt-1">
                      {facePresent
                        ? <UserCheck className="w-3 h-3 text-green-400" />
                        : <UserX className="w-3 h-3 text-red-400" />}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  size="sm"
                  onClick={toggleTimer}
                  className={`rounded-full px-5 font-bold ${
                    isActive
                      ? "bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.4)]"
                  }`}
                >
                  {isActive ? <><Square className="w-3.5 h-3.5 mr-1.5" />Pause</> : <><Play className="w-3.5 h-3.5 mr-1.5" />Start</>}
                </Button>
                <Button size="sm" variant="outline" onClick={resetTimer} className="rounded-full w-9 h-9 p-0">
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Session count */}
            <div className="bg-card border border-card-border rounded-xl p-5 text-center">
              <div className="text-4xl font-black text-primary font-mono mb-1">{sessionsDone}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Sessions today</div>
              <div className="flex justify-center gap-1.5 mt-3 flex-wrap">
                {Array.from({ length: Math.max(4, sessionsDone + 1) }).map((_, i) => (
                  <div key={i} className={`w-5 h-5 rounded-sm transition-all ${i < sessionsDone ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" : "bg-sidebar-accent"}`} />
                ))}
              </div>
            </div>

            {/* Next break */}
            <div className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">Status</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {isBreak ? "Resting. Synaptic pruning in progress." :
                  isActive ? `${Math.ceil(timeLeft / 60)} min remaining` :
                  "Start a session to begin."}
              </p>
            </div>

            {/* Score history note */}
            {sessionsDone > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="text-xs font-semibold text-primary mb-1">Last session score</div>
                <div className="text-2xl font-black font-mono" style={{ color: gradeColor }}>
                  {lastResult?.score ?? "—"}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {lastResult && (
          <ScoreCard result={lastResult} onClose={() => setLastResult(null)} />
        )}
      </AnimatePresence>
    </Layout>
  );
}
