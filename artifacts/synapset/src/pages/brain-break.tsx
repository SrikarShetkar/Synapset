import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateBrainBreak, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Eye, Play, Award, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrainBreak() {
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBreak = useCreateBrainBreak();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        if (Math.random() > 0.7) {
          setPulsing(true);
          setTimeout(() => setPulsing(false), 500);
        }
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      finishChallenge();
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  const finishChallenge = () => {
    const finalScore = Math.floor(Math.random() * 50 + 50);
    setScore(finalScore);
    setShowBadge(true);

    createBreak.mutate(
      { data: { blinkScore: finalScore } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Synapses Reset!",
            description: `Blink score: ${finalScore}/100. Neural pathways cleared.`,
          });
        },
      }
    );
  };

  const startChallenge = () => {
    setIsActive(true);
    setTimeLeft(30);
    setScore(0);
    setShowBadge(false);
  };

  const facts = [
    "Taking a 30-second break every 25 minutes helps clear working memory.",
    "Blinking intentionally can reset the default mode network in your brain.",
    "Your brain consumes 20% of your body's energy while resting.",
    "Synaptic pruning happens during breaks, clearing out useless information.",
    "Controlled blinking reduces eye strain and re-activates attention circuits.",
  ];

  const randomFact = facts[Math.floor(Math.random() * facts.length)];

  return (
    <Layout>
      <div className="p-8 max-w-3xl mx-auto w-full min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-4">
            Stress Bursters
          </div>
          <h1 className="text-3xl font-bold text-foreground">Blink Reset</h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Clear cognitive buildup. Sync your blinks with the pulse for 30 seconds.
          </p>
        </div>

        <div className="relative w-full max-w-md aspect-square flex items-center justify-center mb-12">
          <AnimatePresence mode="wait">
            {!isActive && !showBadge ? (
              <motion.div
                key="start"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-card border border-card-border rounded-full shadow-2xl"
              >
                <Eye className="w-16 h-16 text-primary mb-6" />
                <Button
                  size="lg"
                  onClick={startChallenge}
                  className="rounded-full px-8 bg-primary hover:bg-primary/90"
                >
                  <Play className="w-5 h-5 mr-2" /> Start 30s Reset
                </Button>
              </motion.div>
            ) : isActive ? (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <motion.div
                  className="absolute w-full h-full rounded-full border-4 border-primary/20"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <div
                  className={`w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                    pulsing
                      ? "bg-primary scale-110 shadow-[0_0_50px_hsl(var(--primary))]"
                      : "bg-primary/20 scale-100"
                  }`}
                >
                  <span
                    className={`text-5xl font-mono font-bold ${
                      pulsing ? "text-primary-foreground" : "text-primary"
                    }`}
                  >
                    {timeLeft}
                  </span>
                  <span className="text-xs text-primary/60 mt-1">blink now</span>
                </div>
              </motion.div>
            ) : showBadge ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-card border border-primary/50 rounded-full shadow-[0_0_30px_hsl(var(--primary)/0.2)]"
              >
                <motion.div
                  animate={{ rotateY: 360 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                  className="mb-4"
                >
                  <Award className="w-20 h-20 text-accent drop-shadow-[0_0_15px_hsl(var(--accent))]" />
                </motion.div>
                <div className="text-sm font-bold text-muted-foreground tracking-widest uppercase mb-1">
                  Blink Score
                </div>
                <div className="text-6xl font-black text-foreground font-mono">{score}</div>
                <div className="text-xs text-muted-foreground mt-1">out of 100</div>
                <Button
                  variant="outline"
                  className="mt-8 rounded-full"
                  onClick={startChallenge}
                >
                  <Play className="w-4 h-4 mr-2" /> Go Again
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="bg-sidebar border border-sidebar-border rounded-xl p-6 flex gap-4 max-w-lg w-full items-start">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground mb-1">Brain Fact</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{randomFact}</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
