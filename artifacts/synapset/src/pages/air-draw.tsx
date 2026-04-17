import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useCreateAirDrawing, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PenTool, Save, Eraser, Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function AirDraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#00D4FF");
  const [brushSize, setBrushSize] = useState(4);
  const [topic, setTopic] = useState("");
  const { toast } = useToast();
  const createDrawing = useCreateAirDrawing();
  const queryClient = useQueryClient();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getCtx = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getCtx();
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getCtx();
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.shadowBlur = brushSize * 2;
    ctx.shadowColor = color;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (!topic.trim()) {
      toast({ title: "Topic Required", description: "Please enter a topic.", variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    createDrawing.mutate(
      { data: { topicLinked: topic, imageUrl: dataUrl } },
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

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-3">
              Stress Bursters
            </div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              Neural Canvas
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-5 h-5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  Motor memory + visual memory = 2x stronger recall. Drawing concepts physically helps cement them in long-term memory faster than passive reading.
                </TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground mt-1">Draw concepts in the air to wire them deeper into memory.</p>
          </div>

          <div className="flex items-center gap-3">
            <Input
              placeholder="Link to topic (e.g. Action Potential)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-64 bg-card border-card-border"
            />
            <Button onClick={handleSave} disabled={createDrawing.isPending || !topic.trim()}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <div className="md:col-span-3 bg-card border border-card-border rounded-xl overflow-hidden relative">
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`,
                backgroundSize: "40px 40px",
              }}
            />
            <canvas
              ref={canvasRef}
              className="w-full h-[600px] cursor-crosshair relative z-10 touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
            />
          </div>

          <div className="space-y-5">
            {/* Color Picker */}
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
              <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Color</h3>
              <div className="flex flex-wrap gap-3">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${
                      color === c ? "scale-110 border-white" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c, boxShadow: color === c ? `0 0 12px ${c}` : "none" }}
                  />
                ))}
              </div>
            </div>

            {/* Brush Size */}
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Brush Size</h3>
                <span className="text-xs font-mono text-primary">{brushSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBrushSize((s) => Math.max(1, s - 1))}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <Slider
                  min={1}
                  max={32}
                  step={1}
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  className="flex-1"
                />
                <button
                  onClick={() => setBrushSize((s) => Math.min(32, s + 1))}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {/* Preview dot */}
              <div className="flex items-center justify-center h-12">
                <div
                  className="rounded-full transition-all"
                  style={{
                    width: `${brushSize * 2}px`,
                    height: `${brushSize * 2}px`,
                    backgroundColor: color,
                    boxShadow: `0 0 ${brushSize * 2}px ${color}`,
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
              <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Actions</h3>
              <Button variant="outline" className="w-full" onClick={clearCanvas}>
                <Eraser className="w-4 h-4 mr-2" /> Clear Canvas
              </Button>
            </div>

            {/* Info */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-accent font-semibold">Motor memory</span> + visual memory = 2x stronger recall. Draw what you learned.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
