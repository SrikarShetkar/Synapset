import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useCreateAirDrawing, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Eraser, Info, Minus, Plus, Camera, CameraOff,
  Hand, MousePointer, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

// ── gesture constants ──────────────────────────────────────────────────────
const PINCH_DIST     = 0.07;   // normalised: thumb↔index close = pen-up
const PALM_THRESHOLD = 4;      // fingers extended to trigger clear

type DrawMode = "mouse" | "hand";
type HandState = "drawing" | "pinch" | "palm" | "none";

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function AirDraw() {
  // ── canvas / drawing ──────────────────────────────────────────────────────
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [color, setColor]       = useState("#00D4FF");
  const [brushSize, setBrushSize] = useState(4);
  const [topic, setTopic]       = useState("");

  // ── hand-mode ─────────────────────────────────────────────────────────────
  const [drawMode, setDrawMode]       = useState<DrawMode>("mouse");
  const [cvLoading, setCvLoading]     = useState(false);
  const [cvError, setCvError]         = useState<string | null>(null);
  const [handState, setHandState]     = useState<HandState>("none");
  const [handReady, setHandReady]     = useState(false);
  const [cursorPos, setCursorPos]     = useState({ x: 0, y: 0 });

  const videoRef       = useRef<HTMLVideoElement>(null);
  const overlayRef     = useRef<HTMLCanvasElement>(null);
  const landmarkerRef  = useRef<any>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const rafRef         = useRef<number | null>(null);
  const handStateRef   = useRef<HandState>("none");
  const isDrawingRef   = useRef(false);
  const colorRef       = useRef(color);
  const brushRef       = useRef(brushSize);

  // keep refs in sync
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushRef.current = brushSize; }, [brushSize]);

  const { toast }   = useToast();
  const createDrawing = useCreateAirDrawing();
  const queryClient   = useQueryClient();

  // ── init canvas on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  || 800;
    canvas.height = rect.height || 600;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.lineCap = "round"; ctx.lineJoin = "round"; }
  }, []);

  // ── mouse drawing ─────────────────────────────────────────────────────────
  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode !== "mouse") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsMouseDown(true);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDown || drawMode !== "mouse") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const ctx = getCtx(); if (!ctx) return;
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth   = brushRef.current;
    ctx.shadowBlur  = brushRef.current * 2;
    ctx.shadowColor = colorRef.current;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const onMouseUp   = () => setIsMouseDown(false);
  const onMouseOut  = () => setIsMouseDown(false);

  // ── hand-mode: load MediaPipe HandLandmarker ──────────────────────────────
  const initHandCV = useCallback(async () => {
    if (handReady) { setDrawMode("hand"); return; }
    setCvLoading(true);
    setCvError(null);
    try {
      const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
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
      setHandReady(true);
      setDrawMode("hand");
      setCvLoading(false);
      startHandLoop();
    } catch (err: any) {
      setCvLoading(false);
      setCvError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied."
          : "Could not load hand tracking. Check your connection."
      );
    }
  }, [handReady]);

  // ── hand detection loop ───────────────────────────────────────────────────
  const startHandLoop = useCallback(() => {
    const loop = () => {
      const video    = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const results = landmarker.detectForVideo(video, performance.now());
      const canvas  = canvasRef.current;
      const overlay = overlayRef.current;

      if (results.landmarks?.length > 0 && canvas) {
        const lm = results.landmarks[0];

        // Mirror x for natural drawing (video is CSS-mirrored)
        const tipX = (1 - lm[8].x) * canvas.width;
        const tipY =      lm[8].y  * canvas.height;
        setCursorPos({ x: tipX, y: tipY });

        // ─ Gesture detection ─
        const thumbTip = { x: lm[4].x, y: lm[4].y };
        const indexTip = { x: lm[8].x, y: lm[8].y };
        const pinching = dist2D(thumbTip, indexTip) < PINCH_DIST;

        const fingersExtended = [
          lm[8].y  < lm[6].y,   // index
          lm[12].y < lm[10].y,  // middle
          lm[16].y < lm[14].y,  // ring
          lm[20].y < lm[18].y,  // pinky
        ].filter(Boolean).length;
        const isOpenPalm = fingersExtended >= PALM_THRESHOLD;

        let gesture: HandState = "drawing";
        if (isOpenPalm) gesture = "palm";
        else if (pinching) gesture = "pinch";

        // State transitions
        if (gesture === "palm" && handStateRef.current !== "palm") {
          // Clear canvas
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          isDrawingRef.current = false;
          toast({ title: "Canvas Cleared", description: "Open palm detected." });
        }

        if (gesture === "drawing" && !isDrawingRef.current) {
          const ctx = canvas.getContext("2d");
          if (ctx) { ctx.beginPath(); ctx.moveTo(tipX, tipY); }
          isDrawingRef.current = true;
        } else if (gesture === "drawing" && isDrawingRef.current) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.strokeStyle = colorRef.current;
            ctx.lineWidth   = brushRef.current;
            ctx.shadowBlur  = brushRef.current * 2;
            ctx.shadowColor = colorRef.current;
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
          }
        } else if (gesture !== "drawing") {
          isDrawingRef.current = false;
          const ctx = canvas.getContext("2d");
          if (ctx) { ctx.beginPath(); }
        }

        handStateRef.current = gesture;
        setHandState(gesture);

        // ─ Draw overlay dots on video ─
        if (overlay && video.videoWidth > 0) {
          overlay.width  = video.videoWidth;
          overlay.height = video.videoHeight;
          const oCtx = overlay.getContext("2d");
          if (oCtx) {
            oCtx.clearRect(0, 0, overlay.width, overlay.height);
            // Connection lines
            const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
              [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
              [13,17],[17,18],[18,19],[19,20],[0,17]];
            oCtx.strokeStyle = "rgba(0,212,255,0.4)";
            oCtx.lineWidth = 1.5;
            connections.forEach(([a, b]) => {
              oCtx.beginPath();
              // Note: overlay is NOT CSS-mirrored but video IS, so draw in original coords
              oCtx.moveTo(lm[a].x * overlay.width, lm[a].y * overlay.height);
              oCtx.lineTo(lm[b].x * overlay.width, lm[b].y * overlay.height);
              oCtx.stroke();
            });
            // Joint dots
            lm.forEach((pt, idx) => {
              const x = pt.x * overlay.width;
              const y = pt.y * overlay.height;
              oCtx.beginPath();
              oCtx.arc(x, y, idx === 8 ? 7 : 3, 0, 2 * Math.PI);
              oCtx.fillStyle = idx === 8 ? colorRef.current : "rgba(124,58,237,0.8)";
              oCtx.shadowBlur  = idx === 8 ? 12 : 0;
              oCtx.shadowColor = colorRef.current;
              oCtx.fill();
              oCtx.shadowBlur = 0;
            });
          }
        }
      } else {
        setHandState("none");
        isDrawingRef.current = false;
        const oCtx = overlayRef.current?.getContext("2d");
        if (oCtx && overlayRef.current) oCtx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [toast]);

  const stopHandMode = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setDrawMode("mouse");
    setHandState("none");
    isDrawingRef.current = false;
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const clearCanvas = () => {
    const ctx = getCtx(); if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleSave = () => {
    if (!topic.trim()) {
      toast({ title: "Topic Required", description: "Enter a topic first.", variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current; if (!canvas) return;
    createDrawing.mutate(
      { data: { topicLinked: topic, imageUrl: canvas.toDataURL("image/png") } },
      {
        onSuccess: () => {
          toast({ title: "Drawing Saved", description: `Linked to "${topic}".` });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          clearCanvas();
          setTopic("");
        },
      }
    );
  };

  const colors = ["#00D4FF", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#FFFFFF"];

  const gestureLabel: Record<HandState, string> = {
    drawing: "Drawing",
    pinch: "Pen Lifted",
    palm: "Clear!",
    none: "No hand",
  };
  const gestureColor: Record<HandState, string> = {
    drawing: "bg-green-500",
    pinch: "bg-yellow-500",
    palm: "bg-red-500",
    none: "bg-muted",
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto w-full space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-2">
              Stress Bursters
            </div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              Neural Canvas
              <Tooltip>
                <TooltipTrigger><Info className="w-5 h-5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  Motor memory + visual encoding = 2× recall. Draw concepts with your hand in the air using real-time CV.
                </TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Draw with mouse or use hand-tracking CV — index finger draws, pinch lifts pen, open palm clears.</p>
          </div>
          <div className="flex items-center gap-3">
            <Input placeholder="Link to topic..." value={topic} onChange={(e) => setTopic(e.target.value)} className="w-56 bg-card border-card-border" />
            <Button onClick={handleSave} disabled={createDrawing.isPending || !topic.trim()}><Save className="w-4 h-4 mr-2" /> Save</Button>
          </div>
        </div>

        {cvError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />{cvError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          {/* ── Main area ── */}
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-4 bg-card border border-card-border rounded-xl p-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { if (drawMode === "hand") stopHandMode(); else setDrawMode("mouse"); }}
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
                  {cvLoading ? "Loading model..." : "Hand Tracking CV"}
                </button>
              </div>

              {drawMode === "hand" && (
                <div className="ml-auto flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${gestureColor[handState]}`} />
                  <span className="text-xs font-mono text-muted-foreground">{gestureLabel[handState]}</span>
                </div>
              )}
            </div>

            {/* Canvas + camera-in-picture layout */}
            <div className={`relative grid gap-3 ${drawMode === "hand" ? "grid-cols-[1fr_200px]" : "grid-cols-1"}`}>
              {/* Drawing canvas */}
              <div className="relative bg-card border border-card-border rounded-xl overflow-hidden">
                <div className="absolute inset-0 pointer-events-none opacity-15" style={{
                  backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`,
                  backgroundSize: "40px 40px"
                }} />
                {/* Hand cursor */}
                {drawMode === "hand" && handState !== "none" && (
                  <div
                    className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: cursorPos.x, top: cursorPos.y }}
                  >
                    <div className={`rounded-full border-2 transition-all ${
                      handState === "drawing" ? "border-primary bg-primary/20 w-5 h-5 shadow-[0_0_12px_hsl(var(--primary))]" :
                      handState === "pinch"   ? "border-yellow-400 bg-yellow-400/20 w-3 h-3" :
                                               "border-red-400 bg-red-400/20 w-8 h-8"
                    }`} />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="w-full h-[540px] relative z-10 touch-none"
                  style={{ cursor: drawMode === "hand" ? "none" : "crosshair" }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseOut={onMouseOut}
                />
              </div>

              {/* Camera feed (hand mode) */}
              {drawMode === "hand" && (
                <div className="space-y-3">
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
                    {/* Status */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${handState !== "none" ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                      <span className="text-[9px] font-mono text-white">{handState !== "none" ? "HAND" : "SEARCHING"}</span>
                    </div>
                  </div>

                  {/* Gesture legend */}
                  <div className="bg-card border border-card-border rounded-xl p-3 space-y-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Gestures</div>
                    {[
                      { icon: "☝️", label: "Index finger", desc: "Draws stroke" },
                      { icon: "🤏", label: "Pinch", desc: "Lifts pen" },
                      { icon: "🖐", label: "Open palm", desc: "Clears canvas" },
                    ].map(({ icon, label, desc }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-sm">{icon}</span>
                        <div>
                          <div className="text-xs font-medium text-foreground">{label}</div>
                          <div className="text-[10px] text-muted-foreground">{desc}</div>
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
              <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Color</h3>
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
                <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Brush Size</h3>
                <span className="text-xs font-mono text-primary">{brushSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setBrushSize((s) => Math.max(1, s - 1))} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Minus className="w-3 h-3" />
                </button>
                <Slider min={1} max={32} step={1} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} className="flex-1" />
                <button onClick={() => setBrushSize((s) => Math.min(32, s + 1))} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center justify-center h-10">
                <div className="rounded-full transition-all" style={{
                  width: `${Math.max(4, brushSize * 2)}px`,
                  height: `${Math.max(4, brushSize * 2)}px`,
                  backgroundColor: color,
                  boxShadow: `0 0 ${brushSize * 2}px ${color}`,
                }} />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-2">
              <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>
              <Button variant="outline" className="w-full" onClick={clearCanvas}>
                <Eraser className="w-4 h-4 mr-2" /> Clear Canvas
              </Button>
              {drawMode === "hand" && (
                <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={stopHandMode}>
                  <CameraOff className="w-4 h-4 mr-2" /> Stop Camera
                </Button>
              )}
            </div>

            {/* Info */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-accent font-semibold">Hand CV</span> uses MediaPipe HandLandmarker — 21 3D hand keypoints at ~30fps. No data leaves your device.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
