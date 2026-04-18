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

// ── gesture constants ──────────────────────────────────────────────────────
const PINCH_DIST     = 0.09;   // normalised thumb↔index tip distance
const PALM_EXT_COUNT = 4;      // all 4 fingers extended = clear canvas

type DrawMode    = "mouse" | "hand";
type HandGesture = "drawing" | "pinch" | "palm" | "none";

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function AirDraw() {
  // ── canvas / mouse drawing ─────────────────────────────────────────────
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const mouseDownRef   = useRef(false);
  const [color, setColor]         = useState("#00D4FF");
  const [brushSize, setBrushSize] = useState(6);
  const [topic, setTopic]         = useState("");

  // ── hand mode state ────────────────────────────────────────────────────
  const [drawMode, setDrawMode]   = useState<DrawMode>("mouse");
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError]     = useState<string | null>(null);
  const [gesture, setGesture]     = useState<HandGesture>("none");
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });

  // stable refs read inside RAF loop (no stale closure issues)
  const videoRef      = useRef<HTMLVideoElement>(null);
  const overlayRef    = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);
  const isRunningRef  = useRef(false);          // loop sentinel
  const gestureRef    = useRef<HandGesture>("none");
  const isDrawingRef  = useRef(false);          // pen-down state
  const colorRef      = useRef(color);
  const brushRef      = useRef(brushSize);
  const prevPtRef     = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync with state
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushRef.current = brushSize; }, [brushSize]);

  const { toast }     = useToast();
  const createDrawing = useCreateAirDrawing();
  const queryClient   = useQueryClient();

  // ── Canvas sizing ──────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    // Preserve drawing
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width; tmp.height = canvas.height;
    tmp.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width  = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.drawImage(tmp, 0, 0); }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  // Re-size canvas after layout switches to 2-col (hand mode adds right panel)
  useEffect(() => {
    const id = setTimeout(resizeCanvas, 120);
    return () => clearTimeout(id);
  }, [drawMode, resizeCanvas]);

  // ── Mouse drawing ──────────────────────────────────────────────────────
  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode !== "mouse") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    mouseDownRef.current = true;
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mouseDownRef.current || drawMode !== "mouse") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth   = brushRef.current;
    ctx.shadowBlur  = brushRef.current * 1.5;
    ctx.shadowColor = colorRef.current;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const onMouseUp  = () => { mouseDownRef.current = false; };
  const onMouseOut = () => { mouseDownRef.current = false; };

  // ── Hand tracking loop (fully ref-based) ──────────────────────────────
  // The loop function is recreated every render so it always reads fresh refs.
  // It's stored in a ref so the RAF callback always calls the latest version.
  const loopFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    loopFnRef.current = () => {
      const video    = videoRef.current;
      const lm       = landmarkerRef.current;
      const canvas   = canvasRef.current;
      const overlay  = overlayRef.current;

      // Always reschedule while running — never bail without rescheduling
      if (!isRunningRef.current) return;
      if (!video || !lm || video.readyState < 2 || !canvas) {
        rafRef.current = requestAnimationFrame(() => loopFnRef.current());
        return;
      }

      // ── Run hand detection ──────────────────────────────────────────
      let results: any = null;
      try { results = lm.detectForVideo(video, performance.now()); } catch (_) {}

      if (!results?.landmarks?.length) {
        // No hand — lift pen, clear overlay
        gestureRef.current = "none";
        isDrawingRef.current = false;
        prevPtRef.current    = null;
        setGesture("none");
        setCursorPos({ x: -200, y: -200 });
        if (overlay) {
          const oc = overlay.getContext("2d");
          if (oc) oc.clearRect(0, 0, overlay.width, overlay.height);
        }
        rafRef.current = requestAnimationFrame(() => loopFnRef.current());
        return;
      }

      const lms = results.landmarks[0];

      // ── Coordinate mapping ──────────────────────────────────────────
      // Use getBoundingClientRect() so CSS pixels match canvas pixels
      const canvasBCR = canvas.getBoundingClientRect();

      // Mirror x: video is CSS-mirrored, drawing should feel like a mirror
      const tipCSSX = (1 - lms[8].x) * canvasBCR.width;
      const tipCSSY = lms[8].y        * canvasBCR.height;

      // Canvas draw coords — must match canvas's internal resolution
      // canvas.width is kept equal to canvasBCR.width via ResizeObserver
      const tipDrawX = (1 - lms[8].x) * canvas.width;
      const tipDrawY = lms[8].y        * canvas.height;

      setCursorPos({ x: tipCSSX, y: tipCSSY });

      // ── Gesture classification ──────────────────────────────────────
      const thumbTip = lms[4], indexTip = lms[8];
      const pinching = dist2D(thumbTip, indexTip) < PINCH_DIST;

      const extCount = [
        lms[8].y  < lms[6].y,
        lms[12].y < lms[10].y,
        lms[16].y < lms[14].y,
        lms[20].y < lms[18].y,
      ].filter(Boolean).length;
      const isPalm = extCount >= PALM_EXT_COUNT && !pinching;

      let newGesture: HandGesture = "drawing";
      if (isPalm)    newGesture = "palm";
      else if (pinching) newGesture = "pinch";

      // ── Palm → clear canvas ─────────────────────────────────────────
      if (newGesture === "palm" && gestureRef.current !== "palm") {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        isDrawingRef.current = false;
        prevPtRef.current    = null;
        // Show toast outside RAF via setTimeout to keep loop clean
        setTimeout(() => toast({ title: "Canvas cleared", description: "Open palm detected." }), 0);
      }

      // ── Draw stroke ─────────────────────────────────────────────────
      if (newGesture === "drawing") {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.strokeStyle = colorRef.current;
          ctx.lineWidth   = brushRef.current;
          ctx.shadowBlur  = brushRef.current * 1.5;
          ctx.shadowColor = colorRef.current;
          ctx.lineCap     = "round";
          ctx.lineJoin    = "round";

          if (!isDrawingRef.current || !prevPtRef.current) {
            ctx.beginPath();
            ctx.moveTo(tipDrawX, tipDrawY);
            isDrawingRef.current = true;
          } else {
            ctx.beginPath();
            ctx.moveTo(prevPtRef.current.x, prevPtRef.current.y);
            ctx.lineTo(tipDrawX, tipDrawY);
            ctx.stroke();
          }
          prevPtRef.current = { x: tipDrawX, y: tipDrawY };
        }
      } else {
        isDrawingRef.current = false;
        prevPtRef.current    = null;
      }

      gestureRef.current = newGesture;
      setGesture(newGesture);

      // ── Overlay: hand skeleton on video canvas ──────────────────────
      if (overlay && video.videoWidth > 0) {
        overlay.width  = video.videoWidth;
        overlay.height = video.videoHeight;
        const oc = overlay.getContext("2d");
        if (oc) {
          oc.clearRect(0, 0, overlay.width, overlay.height);
          const CONNS = [
            [0,1],[1,2],[2,3],[3,4],
            [0,5],[5,6],[6,7],[7,8],
            [5,9],[9,10],[10,11],[11,12],
            [9,13],[13,14],[14,15],[15,16],
            [13,17],[17,18],[18,19],[19,20],[0,17],
          ];
          oc.strokeStyle = isPalm ? "rgba(239,68,68,0.5)" :
                           pinching ? "rgba(245,158,11,0.5)" :
                           "rgba(0,212,255,0.4)";
          oc.lineWidth = 1.5;
          CONNS.forEach(([a, b]) => {
            oc.beginPath();
            oc.moveTo(lms[a].x * overlay.width, lms[a].y * overlay.height);
            oc.lineTo(lms[b].x * overlay.width, lms[b].y * overlay.height);
            oc.stroke();
          });
          lms.forEach((pt: any, i: number) => {
            const isTip = i === 8;
            const x = pt.x * overlay.width, y = pt.y * overlay.height;
            oc.beginPath();
            oc.arc(x, y, isTip ? 7 : 3, 0, 2 * Math.PI);
            const c = isTip
              ? (pinching ? "#F59E0B" : isPalm ? "#EF4444" : colorRef.current)
              : "rgba(124,58,237,0.8)";
            oc.fillStyle  = c;
            oc.shadowBlur  = isTip ? 12 : 0;
            oc.shadowColor = c;
            oc.fill();
            oc.shadowBlur = 0;
          });
        }
      }

      rafRef.current = requestAnimationFrame(() => loopFnRef.current());
    };
  }); // runs every render → always fresh

  // ── Init hand CV ───────────────────────────────────────────────────────
  const initHandCV = useCallback(async () => {
    setCvLoading(true);
    setCvError(null);
    isRunningRef.current = false;
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
      const video = videoRef.current!;
      video.srcObject = stream;

      // Wait for video to be playable
      await new Promise<void>((res, rej) => {
        video.onloadeddata = () => { video.play().then(res).catch(rej); };
        video.onerror = rej;
      });

      // One extra frame so readyState === HAVE_ENOUGH_DATA
      await new Promise<void>((res) => {
        const check = () =>
          video.readyState >= 3 ? res() : requestAnimationFrame(check);
        check();
      });

      // Switch layout first so ResizeObserver resizes the canvas
      setDrawMode("hand");
      setCvLoading(false);

      // Start loop after layout settles
      setTimeout(() => {
        isRunningRef.current = true;
        rafRef.current = requestAnimationFrame(() => loopFnRef.current());
      }, 150);
    } catch (err: any) {
      isRunningRef.current = false;
      setCvLoading(false);
      setCvError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Allow access and retry."
          : "Could not load hand model. Check your internet connection."
      );
    }
  }, []); // no deps — reads only refs

  const stopHandMode = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setDrawMode("mouse");
    setGesture("none");
    setCursorPos({ x: -200, y: -200 });
    isDrawingRef.current = false;
    prevPtRef.current    = null;
  }, []);

  useEffect(() => () => {
    isRunningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const clearCanvas = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  const handleSave = () => {
    if (!topic.trim()) { toast({ title: "Topic Required", variant: "destructive" }); return; }
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
  const gestureDot: Record<HandGesture, string> = {
    drawing: "bg-green-400 animate-pulse",
    pinch:   "bg-yellow-400",
    palm:    "bg-red-400",
    none:    "bg-muted-foreground/40",
  };
  const gestureLabel: Record<HandGesture, string> = {
    drawing: "Drawing",
    pinch:   "Pen lifted",
    palm:    "Clear!",
    none:    "No hand",
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
              Stress Bursters · CV-Powered
            </div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              Neural Canvas
              <Tooltip>
                <TooltipTrigger><Info className="w-5 h-5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  Motor memory + visual encoding = 2× recall. Hand Mode uses MediaPipe HandLandmarker — 21 3D keypoints at ~30fps. Index finger draws · Pinch lifts pen · Open palm clears.
                </TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Mouse mode or live hand-tracking CV — index draws · pinch lifts · palm clears
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Link to topic..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-56 bg-card border-card-border"
            />
            <Button onClick={handleSave} disabled={createDrawing.isPending || !topic.trim()}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>

        {cvError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" /> {cvError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          {/* ── Main area ── */}
          <div className="space-y-3">
            {/* Mode toggle bar */}
            <div className="flex items-center gap-2 bg-card border border-card-border rounded-xl p-2.5">
              <button
                onClick={() => { if (drawMode === "hand") stopHandMode(); }}
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
                <div className="ml-auto flex items-center gap-2 pr-1">
                  <div className={`w-2 h-2 rounded-full ${gestureDot[gesture]}`} />
                  <span className="text-xs font-mono text-muted-foreground">{gestureLabel[gesture]}</span>
                </div>
              )}
            </div>

            {/* Canvas + side camera */}
            <div className={`grid gap-3 ${drawMode === "hand" ? "grid-cols-[1fr_170px]" : "grid-cols-1"}`}>
              {/* Drawing canvas */}
              <div className="relative bg-card border border-card-border rounded-xl overflow-hidden">
                <div
                  className="absolute inset-0 pointer-events-none opacity-10"
                  style={{
                    backgroundImage: "linear-gradient(to right,#444 1px,transparent 1px),linear-gradient(to bottom,#444 1px,transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
                {/* Cursor indicator */}
                {drawMode === "hand" && (
                  <div
                    className="absolute pointer-events-none z-20 rounded-full -translate-x-1/2 -translate-y-1/2 transition-none"
                    style={{
                      left:   cursorPos.x,
                      top:    cursorPos.y,
                      width:  gesture === "palm" ? 32 : gesture === "pinch" ? 12 : Math.max(8, brushRef.current * 2),
                      height: gesture === "palm" ? 32 : gesture === "pinch" ? 12 : Math.max(8, brushRef.current * 2),
                      border: `2px solid ${gesture === "palm" ? "#EF4444" : gesture === "pinch" ? "#F59E0B" : colorRef.current}`,
                      backgroundColor:
                        gesture === "palm"  ? "rgba(239,68,68,0.2)" :
                        gesture === "pinch" ? "rgba(245,158,11,0.2)" :
                        `${colorRef.current}22`,
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

              {/* Camera feed (hand mode only) */}
              {drawMode === "hand" && (
                <div className="flex flex-col gap-2">
                  <div className="relative bg-card border border-card-border rounded-xl overflow-hidden aspect-[4/3]">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                      playsInline
                      muted
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ transform: "scaleX(-1)" }}
                    />
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5 z-10">
                      <div className={`w-1.5 h-1.5 rounded-full ${gesture !== "none" ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                      <span className="text-[9px] font-mono text-white">{gesture !== "none" ? "HAND" : "SEARCHING"}</span>
                    </div>
                  </div>

                  {/* Gesture guide */}
                  <div className="bg-card border border-card-border rounded-xl p-3 space-y-2 flex-1">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gestures</div>
                    {[
                      { e: "☝️", t: "Index tip",  d: "Draws" },
                      { e: "🤏", t: "Pinch",       d: "Lifts pen" },
                      { e: "🖐", t: "Open palm",   d: "Clears all" },
                    ].map(({ e, t, d }) => (
                      <div key={t} className="flex items-center gap-2">
                        <span className="text-base leading-none">{e}</span>
                        <div>
                          <div className="text-xs font-medium text-foreground leading-tight">{t}</div>
                          <div className="text-[10px] text-muted-foreground">{d}</div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={stopHandMode}
                      className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <CameraOff className="w-3 h-3" /> Stop camera
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar tools ── */}
          <div className="space-y-4">
            {/* Color */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</h3>
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
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brush Size</h3>
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
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>
              <Button variant="outline" className="w-full" onClick={clearCanvas}>
                <Eraser className="w-4 h-4 mr-2" /> Clear Canvas
              </Button>
            </div>

            {/* Info */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-accent font-semibold">MediaPipe HandLandmarker</span> — 21 3D keypoints at ~30fps entirely in your browser. Zero data leaves your device.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
