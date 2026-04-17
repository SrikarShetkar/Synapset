import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useCreateFocusSession, useGetFocusHeatmap, getGetFocusHeatmapQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, RotateCcw, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Focus() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessionsDone, setSessionsDone] = useState(0);

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
        const score = Math.floor(Math.random() * 20 + 75);
        createFocusSession.mutate(
          { data: { duration: 25 * 60, focusConsistencyScore: score } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetFocusHeatmapQueryKey() });
            },
          }
        );
        setSessionsDone((s) => s + 1);
        toast({ title: "Focus Session Complete!", description: "Time for a 5 minute break." });
        setIsBreak(true);
        setTimeLeft(5 * 60);
      } else {
        toast({ title: "Break Over!", description: "Ready for another session?" });
        setIsBreak(false);
        setTimeLeft(25 * 60);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft, isBreak, toast, createFocusSession, queryClient]);

  const toggleTimer = () => setIsActive((a) => !a);

  const resetTimer = () => {
    setIsActive(false);
    setIsBreak(false);
    setTimeLeft(25 * 60);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progress = isBreak
    ? 1 - timeLeft / (5 * 60)
    : 1 - timeLeft / (25 * 60);

  const circumference = 2 * Math.PI * 120;

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Deep Work Mode</h1>
          <p className="text-muted-foreground mt-1">Wire connections faster with unbroken concentration.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="bg-card border border-card-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden">
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-0">
                  <div
                    className={`w-[350px] h-[350px] rounded-full filter blur-[120px] opacity-15 animate-pulse-glow ${
                      isBreak ? "bg-primary" : "bg-accent"
                    }`}
                  />
                </div>
              )}

              <div className="relative z-10 flex flex-col items-center">
                <div className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-8">
                  {isBreak ? "Break Time" : "Focus Session"}
                </div>

                {/* Circular progress ring */}
                <div className="relative mb-10">
                  <svg width="280" height="280" className="-rotate-90">
                    <circle
                      cx="140"
                      cy="140"
                      r="120"
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth="6"
                    />
                    <circle
                      cx="140"
                      cy="140"
                      r="120"
                      fill="none"
                      stroke={isBreak ? "hsl(var(--primary))" : "hsl(var(--accent))"}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - progress)}
                      style={{ transition: "stroke-dashoffset 1s linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-6xl font-bold tracking-tighter font-mono tabular-nums text-foreground">
                      {formatTime(timeLeft)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {isBreak ? "rest" : "focus"}
                    </div>
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
                    {isActive ? (
                      <>
                        <Square className="w-5 h-5 mr-2" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" /> Start
                      </>
                    )}
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
            {/* Session counter */}
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <div className="text-4xl font-black text-primary font-mono mb-1">{sessionsDone}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Sessions today</div>
              <div className="flex justify-center gap-2 mt-4">
                {Array.from({ length: Math.max(4, sessionsDone + 1) }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-sm transition-all ${
                      i < sessionsDone ? "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" : "bg-sidebar-accent"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Break reminder */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Coffee className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-sm">Next break</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {isBreak
                  ? "Resting. Synaptic pruning in progress."
                  : isActive
                  ? `${Math.ceil(timeLeft / 60)} min until break`
                  : "Start a session to begin tracking."}
              </p>
            </div>

            {/* Focus Heatmap */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-4 text-sm">Focus History</h3>
              {heatmap && heatmap.length > 0 ? (
                <div className="grid grid-cols-7 gap-1.5">
                  {heatmap.slice(-28).map((entry, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-sm transition-all ${
                        entry.score > 80
                          ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.4)]"
                          : entry.score > 60
                          ? "bg-primary/60"
                          : entry.score > 0
                          ? "bg-primary/30"
                          : "bg-sidebar-accent"
                      }`}
                      title={`${entry.date}: score ${entry.score}`}
                    />
                  ))}
                  {Array.from({ length: Math.max(0, 28 - (heatmap?.length ?? 0)) }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square rounded-sm bg-sidebar-accent" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-sm bg-sidebar-accent" />
                  ))}
                </div>
              )}
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
