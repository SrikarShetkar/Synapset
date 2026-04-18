import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useCreateAirDrawing, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Eraser, Info, Minus, Plus,
  Hand, MousePointer, Loader2, AlertCircle, CameraOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Gesture thresholds ─────────────────────────────────────────────────────
const PINCH_DIST      = 0.08;   // normalised thumb↔index tip distance
const PALM_EXT_COUNT  = 4;      // fingers extended to trigger clear

type DrawMode  = "mouse" | "hand";
type HandGesture = "drawing" | "pinch" | "palm" | "none";

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function AirDraw() {
  // ── canvas ────────────────────────────────────────────────────────────────
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const isMouseDownRef = useRef(false);
  const [color, setColor]       = useState("#00D4FF");
  const [brushSize, setBrushSize] = useState(6);
  const [topic, setTopic]       = useState("");

  // ── hand mode ─────────────────────────────────────────────────────────────
  const [drawMode, setDrawMode]   = useState<DrawMode>("mouse");
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError]     = useState<string | null>(null);
  const [cvReady, setCvReady]     = useState(false);
  const [gesture, setGesture]     = useState<HandGesture>("none");
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });

  // stable refs (accessible inside RAF without stale closures)
  const videoRef       = useRef<HTMLVideoElement>(null);
  const overlayRef     = useRef<HTMLCanvasElement>(null);
  const landmarkerRef  = useRef<any>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number | null>(null);
  const gestureRef     = useRef<HandGesture>("none");
  const isHandDrawing  = useRef(false);
  const colorRef       = useRef(color);
  const brushRef       = useRef(brushSize);
  const cvReadyRef     = useRef(false);

  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushRef.current = brushSize; }, [brushSize]);

  const { toast }     = useToast();
  const createDrawing = useCreateAirDrawing();
  const queryClient   = useQueryClient();

  // ── size canvas on mount + resize ─────────────────────────────────────────
  useEffect(() => {
    const sizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Preserve drawing by copying to temp
      const temp = document.createElement("canvas");
      temp.width  = canvas.width;
      temp.height = canvas.height;
      temp.getContext("2d")?.drawImage(canvas, 0, 0);

      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  || 800;
      canvas.height = rect.height || 500;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineCap  = "round";
        ctx.lineJoin = "round";
        ctx.drawImage(temp, 0, 0); // restore
      }
    };
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, []);

  // ── mouse drawing ─────────────────────────────────────────────────────────
  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode !== "mouse") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    isMouseDownRef.current = true;
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current || drawMode !== "mouse") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth   = brushRef.current;
    ctx.shadowBlur  = brushRef.current * 1.5;
    ctx.shadowColor = colorRef.current;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const onMouseUp  = () => { isMouseDownRef.current = false; };
  const onMouseOut = () => { isMouseDownRef.current = false; };

  // ── hand CV loop (fully ref-based, no stale closures) ─────────────────────
  const handLoop = useCallback(() => {
    const step = () => {
      if (!cvReadyRef.current) return;

      const video    = videoRef.current;
      const lm       = landmarkerRef.current;
      const canvas   = canvasRef.current;
      const overlay  = overlayRef.current;

      if (!video || !lm || video.readyState < 2 || !canvas) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      let results: any;
      try {
        results = lm.detectForVideo(video, performance.now());
      } catch (_) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      if (results.landmarks?.length > 0) {
        const lms = results.landmarks[0];

        // ── Coordinate mapping ──────────────────────────────────────────────
        // Video is CSS-mirrored (scaleX(-1)), so mirror x for natural drawing
        const tipX = (1 - lms[8].x) * canvas.width;
        const tipY =      lms[8].y  * canvas.height;
        setCursorPos({ x: tipX, y: tipY });

        // ── Gesture classification ──────────────────────────────────────────
        const thumbTip = { x: lms[4].x, y: lms[4].y };
        const indexTip = { x: lms[8].x, y: lms[8].y };

        const pinching = dist2D(thumbTip, indexTip) < PINCH_DIST;

        const extCount = [
          lms[8].y  < lms[6].y,   // index
          lms[12].y < lms[10].y,  // middle
          lms[16].y < lms[14].y,  // ring
          lms[20].y < lms[18].y,  // pinky
        ].filter(Boolean).length;
        const isPalm = extCount >= PALM_EXT_COUNT && !pinching;

        let newGesture: HandGesture = "drawing";
        if (isPalm)    newGesture = "palm";
        else if (pinching) newGesture = "pinch";

        // ── Palm → clear canvas ─────────────────────────────────────────────
        if (newGesture === "palm" && gestureRef.current !== "palm") {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          isHandDrawing.current = false;
          toast({ title: "Canvas cleared", description: "Open palm detected." });
        }

        // ── Drawing strokes ─────────────────────────────────────────────────
        if (newGesture === "drawing") {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (!isHandDrawing.current) {
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              isHandDrawing.current = true;
            } else {
              ctx.strokeStyle = colorRef.current;
              ctx.lineWidth   = brushRef.current;
              ctx.shadowBlur  = brushRef.current * 1.5;
              ctx.shadowColor = colorRef.current;
              ctx.lineCap     = "round";
              ctx.lineJoin    = "round";
              ctx.lineTo(tipX, tipY);
              ctx.stroke();
            }
          }
        } else {
          // pen lifted — next drawing stroke starts fresh
          isHandDrawing.current = false;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.beginPath();
        }

        gestureRef.current = newGesture;
        setGesture(newGesture);

        // ── Overlay: draw hand skeleton on video ────────────────────────────
        if (overlay && video.videoWidth > 0) {
          overlay.width  = video.videoWidth;
          overlay.height = video.videoHeight;
          const oCtx = overlay.getContext("2d");
          if (oCtx) {
            oCtx.clearRect(0, 0, overlay.width, overlay.height);
            const CONNECTIONS = [
              [0,1],[1,2],[2,3],[3,4],
              [0,5],[5,6],[6,7],[7,8],
              [5,9],[9,10],[10,11],[11,12],
              [9,13],[13,14],[14,15],[15,16],
              [13,17],[17,18],[18,19],[19,20],[0,17],
            ];
            // Lines
            oCtx.strokeStyle = "rgba(0,212,255,0.35)";
            oCtx.lineWidth   = 1.5;
            CONNECTIONS.forEach(([a, b]) => {
              const pa = lms[a], pb = lms[b];
              oCtx.beginPath();
              oCtx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
              oCtx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
              oCtx.stroke();
            });
            // Joints
            lms.forEach((pt: any, i: number) => {
              const isIndexTip = i === 8;
              const x = pt.x * overlay.width;
              const y = pt.y * overlay.height;
              oCtx.beginPath();
              oCtx.arc(x, y, isIndexTip ? 7 : 3, 0, 2 * Math.PI);
              if (isIndexTip) {
                const dotColor = pinching ? "#F59E0B" : isPalm ? "#EF4444" : colorRef.current;
                oCtx.fillStyle   = dotColor;
                oCtx.shadowBlur  = 14;
                oCtx.shadowColor = dotColor;
              } else {
                oCtx.fillStyle   = "rgba(124,58,237,0.75)";
                oCtx.shadowBlur  = 0;
              }
              oCtx.fill();
              oCtx.shadowBlur = 0;
            });
          }
        }
      } else {
        setGesture("none");
        isHandDrawing.current = false;
        setCursorPos({ x: -100, y: -100 });
        const oCtx = overlayRef.current?.getContext("2d");
        if (oCtx && overlayRef.current) oCtx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
        if (canvasRef.current) canvasRef.current.getContext("2d")?.beginPath();
      }

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [toast]);

  // ── init hand CV ──────────────────────────────────────────────────────────
  const initHandCV = useCallback(async () => {
    setCvLoading(true);
    setCvError(null);
    cvReadyRef.current = false;
    try {
      const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await new Promise<void>((res) => {
          video.onloadedmetadata = () => { video.play(); res(); };
        });
        // Wait for actual first frame
        await new Promise<void>((res) => {
          const check = () => video.readyState >= 2 ? res() : requestAnimationFrame(check);
          check();
        });
      }

      cvReadyRef.current = true;
      setCvReady(true);
      setDrawMode("hand");
      setCvLoading(false);
      handLoop(); // start loop — handLoop is a stable ref from useCallback
    } catch (err: any) {
      cvReadyRef.current = false;
      setCvLoading(false);
      setCvError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied."
          : "Could not load hand model. Check connection."
      );
    }
  }, [handLoop]);

  const stopHandMode = useCallback(() => {
    cvReadyRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setDrawMode("mouse");
    setCvReady(false);
    setGesture("none");
    isHandDrawing.current = false;
    setCursorPos({ x: -100, y: -100 });
  }, []);

  useEffect(() => () => {
    cvReadyRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current; const ctx = getCtx();
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (!topic.trim()) {
      toast({ title: "Topic Required", variant: "destructive" }); return;
    }
    const canvas = canvasRef.current; if (!canvas) return;
    createDrawing.mutate(
      { data: { topicLinked: topic, imageUrl: canvas.toDataURL("image/png") } },
      {
        onSuccess: () => {
          toast({ title: "Drawing Saved", description: `Linked to "${topic}".` });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          clearCanvas(); setTopic("");
        },
      }
    );
  };

  const colors = ["#00D4FF", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#FFFFFF"];

  const gestureLabel: Record<HandGesture, string> = {
    drawing: "Drawing",
    pinch: "Pen lifted",
    palm: "Canvas cleared!",
    none: "No hand detected",
  };
  const gestureDot: Record<HandGesture, string> = {
    drawing: "bg-green-400",
    pinch: "bg-yellow-400",
    palm: "bg-red-400",
    none: "bg-muted-foreground",
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
              Stress Bursters · CV-Powered
            </div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              Neural Canvas
              <Tooltip>
                <TooltipTrigger><Info className="w-5 h-5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  Motor memory + visual encoding = 2× recall. In Hand Mode: index finger draws, pinch lifts pen, open palm clears canvas — all tracked by MediaPipe HandLandmarker (21 keypoints at ~30fps).
                </TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Mouse or hand-tracking CV — index draws · pinch lifts · palm clears
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input placeholder="Link to topic..." value={topic} onChange={(e) => setTopic(e.target.value)} className="w-56 bg-card border-card-border" />
            <Button onClick={handleSave} disabled={createDrawing.isPending || !topic.trim()}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>

        {cvError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />{cvError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          {/* ── Main canvas area ── */}
          <div className="space-y-3">
            {/* Mode bar */}
            <div className="flex items-center gap-3 bg-card border border-card-border rounded-xl p-3">
              <button
                onClick={() => drawMode === "hand" ? stopHandMode() : setDrawMode("mouse")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${drawMode === "mouse" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
              >
                <MousePointer className="w-4 h-4" /> Mouse
              </button>
              <button
                onClick={() => drawMode === "hand" ? stopHandMode() : initHandCV()}
                disabled={cvLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${drawMode === "hand" ? "bg-accent/20 text-accent border border-accent/30" : "text-muted-foreground hover:text-foreground"}`}
              >
                {cvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />}
                {cvLoading ? "Loading model…" : "Hand Tracking CV"}
              </button>
              {drawMode === "hand" && (
                <div className="ml-auto flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${gestureDot[gesture]}`} />
                  <span className="text-xs font-mono text-muted-foreground">{gestureLabel[gesture]}</span>
                </div>
              )}
            </div>

            {/* Canvas + optional side-by-side camera */}
            <div className={`grid gap-3 ${drawMode === "hand" ? "grid-cols-[1fr_180px]" : "grid-cols-1"}`}>
              {/* Drawing surface */}
              <div className="relative bg-card border border-card-border rounded-xl overflow-hidden">
                {/* Grid bg */}
                <div className="absolute inset-0 pointer-events-none opacity-10" style={{
                  backgroundImage: `linear-gradient(to right, #444 1px, transparent 1px), linear-gradient(to bottom, #444 1px, transparent 1px)`,
                  backgroundSize: "40px 40px",
                }} />
                {/* Cursor dot */}
                {drawMode === "hand" && (
                  <div
                    className="absolute pointer-events-none z-20 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                    style={{
                      left: cursorPos.x,
                      top: cursorPos.y,
                      width:  gesture === "palm"   ? 28 : gesture === "pinch" ? 10 : brushRef.current * 2 + 4,
                      height: gesture === "palm"   ? 28 : gesture === "pinch" ? 10 : brushRef.current * 2 + 4,
                      backgroundColor:
                        gesture === "palm"    ? "rgba(239,68,68,0.3)" :
                        gesture === "pinch"   ? "rgba(245,158,11,0.3)" :
                        `${colorRef.current}33`,
                      border: `2px solid ${
                        gesture === "palm"  ? "#EF4444" :
                        gesture === "pinch" ? "#F59E0B" :
                        colorRef.current
                      }`,
                      boxShadow: gesture === "drawing"
                        ? `0 0 ${brushRef.current * 2}px ${colorRef.current}` : "none",
                    }}
                  />
                )}
                <canvas
                  ref={canvasRef}
                  className="w-full h-[520px] relative z-10 touch-none"
                  style={{ cursor: drawMode === "hand" ? "none" : "crosshair" }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseOut={onMouseOut}
                />
              </div>

              {/* Camera panel (hand mode only) */}
              {drawMode === "hand" && (
                <div className="space-y-2">
                  <div className="relative bg-card border border-card-border rounded-xl overflow-hidden aspect-[4/3]">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                      playsInline muted
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ transform: "scaleX(-1)" }}
                    />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${gesture !== "none" ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                      <span className="text-[9px] font-mono text-white">{gesture !== "none" ? "HAND" : "SEARCHING"}</span>
                    </div>
                  </div>

                  {/* Gesture guide */}
                  <div className="bg-card border border-card-border rounded-xl p-3 space-y-2.5">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Gestures</div>
                    {[
                      { e: "☝️", t: "Index tip",  d: "Draws stroke" },
                      { e: "🤏", t: "Pinch",       d: "Lifts pen" },
                      { e: "🖐", t: "Open palm",   d: "Clears canvas" },
                    ].map(({ e, t, d }) => (
                      <div key={t} className="flex items-center gap-2">
                        <span className="text-base leading-none">{e}</span>
                        <div>
                          <div className="text-xs font-medium leading-none text-foreground">{t}</div>
                          <div className="text-[10px] text-muted-foreground">{d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar tools ── */}
          <div className="space-y-4">
            {/* Color */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Color</h3>
              <div className="flex flex-wrap gap-2.5">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${color === c ? "scale-110 border-white" : "border-transparent"}`}
                    style={{ backgroundColor: c, boxShadow: color === c ? `0 0 12px ${c}` : "none" }}
                  />
                ))}
              </div>
            </div>

            {/* Brush size */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Brush Size</h3>
                <span className="text-xs font-mono text-primary">{brushSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setBrushSize((s) => Math.max(1, s - 1))} className="p-1 text-muted-foreground hover:text-foreground">
                  <Minus className="w-3 h-3" />
                </button>
                <Slider min={1} max={32} step={1} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} className="flex-1" />
                <button onClick={() => setBrushSize((s) => Math.min(32, s + 1))} className="p-1 text-muted-foreground hover:text-foreground">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center justify-center h-10">
                <div
                  className="rounded-full transition-all"
                  style={{
                    width:  `${Math.max(4, brushSize * 2)}px`,
                    height: `${Math.max(4, brushSize * 2)}px`,
                    backgroundColor: color,
                    boxShadow: `0 0 ${brushSize * 2}px ${color}`,
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
              <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Actions</h3>
              <Button variant="outline" className="w-full" onClick={clearCanvas}>
                <Eraser className="w-4 h-4 mr-2" /> Clear Canvas
              </Button>
              {drawMode === "hand" && (
                <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={stopHandMode}>
                  <CameraOff className="w-4 h-4 mr-2" /> Stop Camera
                </Button>
              )}
            </div>

            {/* Note */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-accent font-semibold">MediaPipe HandLandmarker</span> tracks 21 3D keypoints at ~30fps entirely in your browser. No data leaves your device.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
