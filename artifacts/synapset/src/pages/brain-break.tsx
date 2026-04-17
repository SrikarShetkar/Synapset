import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateBrainBreak, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Play, Award, Zap, Camera, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "loading-cv" | "ready" | "active" | "result";
type BlinkState = "open" | "closed";

const BLINK_CLOSE_THRESHOLD = 0.35;
const BLINK_OPEN_THRESHOLD  = 0.20;
const SESSION_DURATION       = 30;
const PULSE_INTERVAL_MS      = 3500;
const BLINK_WINDOW_MS        = 900;

interface BlinkEvent {
  timestamp: number;
  synced: boolean;
}

export default function BlinkReset() {
  const [phase, setPhase]             = useState<Phase>("idle");
  const [cvError, setCvError]         = useState<string | null>(null);
  const [timeLeft, setTimeLeft]       = useState(SESSION_DURATION);
  const [blinkEvents, setBlinkEvents] = useState<BlinkEvent[]>([]);
  const [totalBlinks, setTotalBlinks] = useState(0);
  const [syncedBlinks, setSyncedBlinks] = useState(0);
  const [finalScore, setFinalScore]   = useState(0);
  const [isPulsing, setIsPulsing]     = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [leftEAR, setLeftEAR]         = useState(1);
  const [rightEAR, setRightEAR]       = useState(1);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const landmarkerRef  = useRef<any>(null);
  const rafRef         = useRef<number | null>(null);
  const blinkStateRef  = useRef<BlinkState>("open");
  const lastPulseRef   = useRef<number>(0);
  const pulseTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const countdownRef   = useRef<NodeJS.Timeout | null>(null);
  const blinkEventsRef = useRef<BlinkEvent[]>([]);
  const streamRef      = useRef<MediaStream | null>(null);

  const { toast }       = useToast();
  const queryClient     = useQueryClient();
  const createBreak     = useCreateBrainBreak();

  // ─── Load MediaPipe FaceLandmarker ───────────────────────────────────────
  const initCV = useCallback(async () => {
    setPhase("loading-cv");
    setCvError(null);

    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });

      landmarkerRef.current = faceLandmarker;

      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => {
            videoRef.current!.play();
            res();
          };
        });
      }

      setPhase("ready");
    } catch (err: any) {
      console.error("CV init error:", err);
      if (err?.name === "NotAllowedError" || err?.message?.includes("Permission")) {
        setCvError("Camera permission denied. Please allow camera access and try again.");
      } else {
        setCvError("Could not load face tracking. Check your connection and try again.");
      }
      setPhase("idle");
    }
  }, []);

  // ─── Detection loop ───────────────────────────────────────────────────────
  const detectionLoop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectionLoop);
      return;
    }

    const now = performance.now();
    const results = landmarker.detectForVideo(video, now);

    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      setFaceDetected(true);
      const blendshapes: { categoryName: string; score: number }[] =
        results.faceBlendshapes[0].categories;

      const leftBlink  = blendshapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score  ?? 0;
      const rightBlink = blendshapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
      const avgBlink   = (leftBlink + rightBlink) / 2;

      setLeftEAR(1 - leftBlink);
      setRightEAR(1 - rightBlink);

      // Draw landmarks overlay
      const canvas = canvasRef.current;
      if (canvas && video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx && results.faceLandmarks?.[0]) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Draw eye landmark dots
          const eyeIndices = [
            33, 133, 159, 145, 160, 144, 158, 153, // left eye
            362, 263, 386, 374, 385, 380, 387, 373, // right eye
          ];
          eyeIndices.forEach((idx) => {
            const lm = results.faceLandmarks[0][idx];
            if (!lm) return;
            const x = lm.x * canvas.width;
            const y = lm.y * canvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = avgBlink > BLINK_CLOSE_THRESHOLD ? "#EF4444" : "#00D4FF";
            ctx.shadowBlur = 6;
            ctx.shadowColor = avgBlink > BLINK_CLOSE_THRESHOLD ? "#EF4444" : "#00D4FF";
            ctx.fill();
          });
        }
      }

      // Blink state machine
      if (blinkStateRef.current === "open" && avgBlink > BLINK_CLOSE_THRESHOLD) {
        blinkStateRef.current = "closed";

        // Check sync with pulse
        const timeSincePulse = Math.abs(Date.now() - lastPulseRef.current);
        const synced = timeSincePulse < BLINK_WINDOW_MS;

        const event: BlinkEvent = { timestamp: Date.now(), synced };
        blinkEventsRef.current = [...blinkEventsRef.current, event];
        setBlinkEvents((prev) => [...prev, event]);
        setTotalBlinks((n) => n + 1);
        if (synced) setSyncedBlinks((n) => n + 1);
      } else if (blinkStateRef.current === "closed" && avgBlink < BLINK_OPEN_THRESHOLD) {
        blinkStateRef.current = "open";
      }
    } else {
      setFaceDetected(false);
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    rafRef.current = requestAnimationFrame(detectionLoop);
  }, []);

  // ─── Start session ────────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    setPhase("active");
    setTimeLeft(SESSION_DURATION);
    setBlinkEvents([]);
    setTotalBlinks(0);
    setSyncedBlinks(0);
    blinkEventsRef.current = [];
    blinkStateRef.current  = "open";
    lastPulseRef.current   = 0;

    // Start detection loop
    rafRef.current = requestAnimationFrame(detectionLoop);

    // Pulse timer
    const firePulse = () => {
      lastPulseRef.current = Date.now();
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);
    };
    firePulse();
    pulseTimerRef.current = setInterval(firePulse, PULSE_INTERVAL_MS);

    // Countdown
    let remaining = SESSION_DURATION;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        clearInterval(pulseTimerRef.current!);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        finishSession();
      }
    }, 1000);
  }, [detectionLoop]);

  const finishSession = useCallback(() => {
    const total  = blinkEventsRef.current.length;
    const synced = blinkEventsRef.current.filter((e) => e.synced).length;
    const pulseCount = Math.floor(SESSION_DURATION * 1000 / PULSE_INTERVAL_MS);
    const score  = Math.round(Math.min(100, (synced / Math.max(1, pulseCount)) * 100));
    setFinalScore(score);
    setPhase("result");

    createBreak.mutate(
      { data: { blinkScore: score } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Blink Reset Complete!",
            description: `${synced} synced blinks. Score: ${score}/100.`,
          });
        },
      }
    );
  }, [createBreak, queryClient, toast]);

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current)       cancelAnimationFrame(rafRef.current);
    if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    if (countdownRef.current)  clearInterval(countdownRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleReset = () => {
    stopCamera();
    setPhase("idle");
    setBlinkEvents([]);
    setTotalBlinks(0);
    setSyncedBlinks(0);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const pulseCount = Math.floor(SESSION_DURATION * 1000 / PULSE_INTERVAL_MS);

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-3">
            Stress Bursters · CV-Powered
          </div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            Blink Reset
          </h1>
          <p className="text-muted-foreground mt-1">
            Real computer vision tracks your eye blinks. Sync with the pulse to reset your mind.
          </p>
        </div>

        {/* Error Banner */}
        {cvError && (
          <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {cvError}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* ── Left: Camera + landmark overlay ── */}
          <div className="relative bg-card border border-card-border rounded-2xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <div className="p-4 bg-primary/10 rounded-full">
                  <Camera className="w-10 h-10 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-xs px-4">
                  Camera feed will appear here. MediaPipe tracks your eye landmarks in real time.
                </p>
              </div>
            )}

            {phase === "loading-cv" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-card/90">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Loading face tracking model...</p>
                <p className="text-xs text-muted-foreground/60">First load may take a few seconds</p>
              </div>
            )}

            {/* Mirrored video feed */}
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover ${
                phase === "ready" || phase === "active" ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: "scaleX(-1)" }}
              playsInline
              muted
            />

            {/* Landmark overlay canvas */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${
                phase === "active" ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: "scaleX(-1)" }}
            />

            {/* Face detection status */}
            {(phase === "ready" || phase === "active") && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-20">
                <div className={`w-2 h-2 rounded-full ${faceDetected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                <span className="text-[11px] font-mono text-white">
                  {faceDetected ? "FACE LOCKED" : "NO FACE"}
                </span>
              </div>
            )}

            {/* EAR meters */}
            {phase === "active" && faceDetected && (
              <div className="absolute bottom-3 left-3 right-3 flex gap-2 z-20">
                {[
                  { label: "L", val: leftEAR },
                  { label: "R", val: rightEAR },
                ].map(({ label, val }) => (
                  <div key={label} className="flex-1 bg-black/60 rounded-lg p-2">
                    <div className="text-[9px] text-white/60 uppercase tracking-wider mb-1">{label} Eye</div>
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-75"
                        style={{
                          width: `${Math.max(0, Math.min(100, val * 100))}%`,
                          backgroundColor: val < 0.3 ? "#EF4444" : "#00D4FF",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Game UI ── */}
          <div className="flex flex-col gap-5">
            {/* Pulse orb */}
            <div className="flex-1 bg-card border border-card-border rounded-2xl flex flex-col items-center justify-center gap-6 p-6 min-h-[220px]">
              <AnimatePresence mode="wait">
                {phase === "idle" && (
                  <motion.div key="idle" className="flex flex-col items-center gap-5">
                    <Eye className="w-12 h-12 text-primary opacity-60" />
                    <Button
                      size="lg"
                      onClick={initCV}
                      className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                    >
                      <Camera className="w-5 h-5 mr-2" /> Activate Camera
                    </Button>
                  </motion.div>
                )}

                {phase === "loading-cv" && (
                  <motion.div key="loading" className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Initialising face model...</p>
                  </motion.div>
                )}

                {phase === "ready" && (
                  <motion.div
                    key="ready"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-5"
                  >
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-sm font-semibold text-green-400">Camera Ready</span>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Blink when the orb pulses. Synced blinks = higher score.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={startSession}
                      className="rounded-full px-8 bg-primary hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                    >
                      <Play className="w-5 h-5 mr-2" /> Start 30s Session
                    </Button>
                  </motion.div>
                )}

                {phase === "active" && (
                  <motion.div
                    key="active"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4 w-full"
                  >
                    {/* Countdown */}
                    <div className="text-5xl font-black font-mono text-foreground">{timeLeft}s</div>

                    {/* Pulse orb */}
                    <div className="relative flex items-center justify-center">
                      {isPulsing && (
                        <motion.div
                          initial={{ scale: 1, opacity: 0.6 }}
                          animate={{ scale: 2.4, opacity: 0 }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          className="absolute w-20 h-20 rounded-full bg-primary"
                        />
                      )}
                      <motion.div
                        animate={isPulsing ? { scale: 1.25, boxShadow: "0 0 40px hsl(var(--primary))" } : { scale: 1, boxShadow: "0 0 10px transparent" }}
                        transition={{ duration: 0.25 }}
                        className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center"
                      >
                        {isPulsing ? (
                          <EyeOff className="w-7 h-7 text-primary" />
                        ) : (
                          <Eye className="w-7 h-7 text-primary/60" />
                        )}
                      </motion.div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {isPulsing ? "BLINK NOW" : "Wait for the pulse..."}
                    </p>
                  </motion.div>
                )}

                {phase === "result" && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4 text-center"
                  >
                    <motion.div
                      animate={{ rotateY: 360 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    >
                      <Award className="w-14 h-14 text-accent drop-shadow-[0_0_15px_hsl(var(--accent))]" />
                    </motion.div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Blink Sync Score</div>
                      <div className="text-6xl font-black font-mono text-foreground">{finalScore}</div>
                      <div className="text-xs text-muted-foreground mt-1">out of 100</div>
                    </div>
                    <Button variant="outline" className="rounded-full mt-2" onClick={() => { blinkEventsRef.current = []; startSession(); }}>
                      <Play className="w-4 h-4 mr-2" /> Again
                    </Button>
                    <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Close camera
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Live stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-card-border rounded-xl p-3 text-center">
                <div className="text-2xl font-black font-mono text-foreground">{totalBlinks}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Total blinks</div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-3 text-center">
                <div className="text-2xl font-black font-mono text-primary">{syncedBlinks}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Synced</div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-3 text-center">
                <div className="text-2xl font-black font-mono text-accent">{pulseCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Pulses</div>
              </div>
            </div>
          </div>
        </div>

        {/* Science note */}
        <div className="bg-sidebar border border-sidebar-border rounded-xl p-5 flex gap-4 items-start">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground mb-1">The Neuroscience</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Blink rate drops by 66% during intense screen focus, causing mental fatigue. 
              Intentional blinking resets the default mode network and clears visual cortex 
              buffers. Syncing blinks to a rhythmic cue trains attentional control.
              <span className="text-primary font-medium"> MediaPipe FaceLandmarker</span> tracks 
              your eye aspect ratio in real time — no data leaves your device.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
