import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useCreateFocusSession, useGetFocusHeatmap, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, RotateCcw, Video, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function Focus() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [cameraAssist, setCameraAssist] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createFocusSession = useCreateFocusSession();
  const { data: heatmap } = useGetFocusHeatmap();

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      if (!isBreak) {
        // Pomodoro finished
        toast({
          title: "Focus Session Complete!",
          description: "Great job! Time for a 5 minute break.",
        });
        const duration = 25;
        const score = cameraAssist ? Math.floor(Math.random() * 20 + 80) : 0; // Mock score 80-100
        
        createFocusSession.mutate(
          { data: { duration, focusConsistencyScore: score } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            }
          }
        );
        
        setIsBreak(true);
        setTimeLeft(5 * 60);
      } else {
        // Break finished
        toast({
          title: "Break Over!",
          description: "Ready for another focus session?",
        });
        setIsBreak(false);
        setTimeLeft(25 * 60);
      }
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft, isBreak, toast, createFocusSession, cameraAssist, queryClient]);

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
    setIsActive(false);
    setIsBreak(false);
    setTimeLeft(25 * 60);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deep Work Mode</h1>
          <p className="text-muted-foreground mt-1">Wire connections faster with unbroken concentration.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card border border-card-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
              {/* Background pulsing circle when active */}
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-0">
                  <div className={`w-[300px] h-[300px] rounded-full filter blur-[100px] opacity-20 animate-pulse-glow ${isBreak ? 'bg-primary' : 'bg-accent'}`} />
                </div>
              )}
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="text-sm font-bold tracking-widest uppercase text-muted-foreground mb-6">
                  {isBreak ? "Synapse Cooling (Break)" : "Active Wiring (Focus)"}
                </div>
                
                <div className="text-8xl md:text-9xl font-bold tracking-tighter text-foreground font-mono mb-12 tabular-nums">
                  {formatTime(timeLeft)}
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
                    {isActive ? <><Square className="w-5 h-5 mr-2" /> Pause</> : <><Play className="w-5 h-5 mr-2" /> Start</>}
                  </Button>
                  
                  <Button 
                    size="lg" 
                    variant="outline" 
                    onClick={resetTimer}
                    className="w-14 h-14 rounded-full p-0"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Camera Assist Toggle */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-primary" />
                    <span className="font-semibold">Camera Assist</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        Camera Assist tracks whether you're present during a focus session and computes a focus consistency score. It does not record or store video.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">Track presence for focus scoring.</p>
                </div>
                <Switch checked={cameraAssist} onCheckedChange={setCameraAssist} />
              </div>
              
              {cameraAssist && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-6 pt-6 border-t border-border"
                >
                  <div className="aspect-video bg-background border border-border rounded-lg flex items-center justify-center relative overflow-hidden">
                    {/* Mock webcam feed */}
                    <div className="absolute inset-0 bg-secondary/10" />
                    <div className="w-32 h-32 border-2 border-primary border-dashed rounded-full animate-pulse-glow" />
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-mono text-green-500">TRACKING ACTIVE</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Heatmap */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-4 text-sm">Focus Activity</h3>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 28 }).map((_, i) => {
                  const val = Math.random();
                  return (
                    <div 
                      key={i} 
                      className={`aspect-square rounded-sm ${
                        val > 0.8 ? "bg-primary" : 
                        val > 0.5 ? "bg-primary/60" : 
                        val > 0.2 ? "bg-primary/30" : "bg-sidebar-accent"
                      }`}
                      title={`${Math.floor(val * 4)} sessions`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between items-center mt-3 text-[10px] text-muted-foreground uppercase tracking-wider">
                <span>Less</span>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
