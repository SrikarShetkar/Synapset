import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useCreateAirDrawing, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PenTool, Save, Eraser, Info, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function AirDraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#00D4FF");
  const [topic, setTopic] = useState("");
  const { toast } = useToast();
  const createDrawing = useCreateAirDrawing();
  const queryClient = useQueryClient();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set correct resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (!topic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic to link this drawing to.",
        variant: "destructive"
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // In a real app, upload this dataURL to a storage bucket
    const dataUrl = canvas.toDataURL("image/png");
    
    createDrawing.mutate(
      { data: { topicLinked: topic, imageUrl: dataUrl } },
      {
        onSuccess: () => {
          toast({
            title: "Drawing Saved",
            description: `Successfully linked to "${topic}".`
          });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          clearCanvas();
          setTopic("");
        }
      }
    );
  };

  const colors = ["#00D4FF", "#7C3AED", "#10B981", "#F59E0B", "#EF4444"];

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              Trace to Remember
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-5 h-5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  Motor memory strengthens neural pathways. Drawing concepts physically helps cement them in long-term memory faster than passive reading.
                </TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground mt-1">Map out concepts visually to encode them deeper.</p>
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
            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{
              backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }} />
            
            <canvas
              ref={canvasRef}
              className="w-full h-[600px] cursor-crosshair relative z-10 touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
            />
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Tools</h3>
              
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  {colors.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${color === c ? 'scale-110 border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c, boxShadow: color === c ? `0 0 15px ${c}` : 'none' }}
                    />
                  ))}
                </div>
                
                <Button variant="outline" className="w-full mt-4" onClick={clearCanvas}>
                  <Eraser className="w-4 h-4 mr-2" /> Clear Canvas
                </Button>
              </div>
            </div>

            <div className="bg-sidebar border border-sidebar-border rounded-xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5" />
              <div className="relative z-10">
                <h3 className="font-medium text-sm text-primary flex items-center gap-2 mb-2">
                  <Camera className="w-4 h-4" /> Camera Tracking
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Enable camera to draw in the air with your index finger. (Coming Soon)
                </p>
                <div className="aspect-video bg-background border border-dashed border-border rounded-lg flex items-center justify-center">
                  <span className="text-xs font-mono text-muted-foreground">OFFLINE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
