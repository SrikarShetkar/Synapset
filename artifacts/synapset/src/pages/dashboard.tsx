import { useState } from "react";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetDashboardSummary,
  useGetMe,
  useDeleteStudySession,
  useGetRetentionCurve,
  getGetDashboardSummaryQueryKey,
  getGetRetentionCurveQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Flame, Brain, Zap, ArrowRight, Activity, Clock, Trash2, TrendingDown, X } from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

function RetentionCurveModal({ sessionId, topic, onClose }: { sessionId: number; topic: string; onClose: () => void }) {
  const { data: curve, isLoading } = useGetRetentionCurve(sessionId, {
    query: { queryKey: getGetRetentionCurveQueryKey(sessionId) },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-lg text-foreground">{topic}</h2>
            </div>
            <p className="text-xs text-muted-foreground">Ebbinghaus Forgetting Curve — R = e^(−t/S)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
            Loading curve data...
          </div>
        ) : curve ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="retentionGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="50%" stopColor="#F59E0B" />
                      <stop offset="100%" stopColor="#EF4444" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Days", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--card-border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "Retention"]}
                    labelFormatter={(label) => `Day ${label}`}
                  />
                  <ReferenceLine
                    y={50}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: "50%", position: "right", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <ReferenceLine
                    x={curve.optimalRevisionDay}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.8}
                    label={{ value: "Optimal revision", position: "top", fontSize: 9, fill: "hsl(var(--primary))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="retention"
                    stroke="url(#retentionGradient)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  />
                  <ReferenceDot
                    x={Math.round(curve.optimalRevisionDay * 2) / 2}
                    y={curve.currentRetention}
                    r={6}
                    fill="hsl(var(--primary))"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-sidebar rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-foreground font-mono">{curve.currentRetention.toFixed(0)}%</div>
                <div className="text-[10px] text-muted-foreground">Current retention</div>
              </div>
              <div className="bg-sidebar rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-primary font-mono">Day {curve.optimalRevisionDay.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">Optimal revision</div>
              </div>
              <div className="bg-sidebar rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-foreground font-mono">{curve.difficulty}/5</div>
                <div className="text-[10px] text-muted-foreground">Difficulty</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              You'll forget 50% of this in approximately {curve.optimalRevisionDay.toFixed(0)} days without revision.
            </p>
          </>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No curve data available.
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: user } = useGetMe();
  const deleteSession = useDeleteStudySession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<{ id: number; topic: string } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; topic: string } | null>(null);

  const handleDelete = (sessionId: number, topic: string) => {
    setConfirmDelete({ id: sessionId, topic });
  };

  const confirmAndDelete = () => {
    if (!confirmDelete) return;
    deleteSession.mutate(
      { id: confirmDelete.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Subject removed", description: `"${confirmDelete.topic}" deleted from your brain map.` });
          setConfirmDelete(null);
        },
        onError: () => {
          toast({ title: "Delete failed", description: "Could not remove subject. Try again.", variant: "destructive" });
          setConfirmDelete(null);
        },
      }
    );
  };

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 max-w-6xl mx-auto w-full space-y-8"
      >
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Your Brain Map</h1>
            <p className="text-muted-foreground mt-1">Live neural connections and retention stats</p>
          </div>

          {user && (
            <div className="flex gap-4">
              <div className="bg-card border border-card-border rounded-xl p-3 flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg text-orange-500">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Streak</div>
                  <div className="font-bold text-foreground">{user.streak} Days</div>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-3 flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg text-primary">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Lvl {user.level}</div>
                  <div className="font-bold text-foreground">{user.xp} XP</div>
                </div>
              </div>
            </div>
          )}
        </header>

        {isSummaryLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-52 bg-card animate-pulse rounded-xl border border-card-border" />
            ))}
          </div>
        ) : summary?.subjectCards?.length ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              Active Synapses
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {summary.subjectCards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className={`bg-card border rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden group ${
                    card.isUrgent ? "border-destructive/50 animate-pulse-glow" : "border-card-border"
                  }`}
                >
                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(card.sessionId, card.topic)}
                    disabled={deleteSession.isPending}
                    className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Remove subject"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex justify-between items-start pr-6">
                    <h3 className="font-semibold text-lg line-clamp-1" title={card.topic}>
                      {card.topic}
                    </h3>
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${
                        card.isUrgent ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                      }`}
                    >
                      {Math.round(card.retentionPercent)}% retained
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Retention</span>
                      <span>Optimal</span>
                    </div>
                    <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          card.retentionPercent > 80
                            ? "bg-green-500"
                            : card.retentionPercent > 50
                            ? "bg-yellow-500"
                            : "bg-destructive"
                        }`}
                        style={{ width: `${card.retentionPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {Math.round(card.daysSinceStudy)} days ago
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedSession({ id: card.sessionId, topic: card.topic })}
                        className="text-xs font-medium text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        <TrendingDown className="w-3 h-3" /> Curve
                      </button>
                      {card.isUrgent ? (
                        <Link
                          href="/coach"
                          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
                        >
                          Revise Now <ArrowRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link
                          href="/coach"
                          className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          Review <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-card border border-card-border rounded-xl">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">Your brain map is empty</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Start logging your study sessions to build your neural network and track retention.
            </p>
            <Link
              href="/log"
              className="px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium inline-flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              Log Session <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedSession && (
          <RetentionCurveModal
            sessionId={selectedSession.id}
            topic={selectedSession.topic}
            onClose={() => setSelectedSession(null)}
          />
        )}
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-destructive/10 rounded-xl">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Remove Subject</h3>
                  <p className="text-xs text-muted-foreground">This cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Remove <span className="text-foreground font-semibold">"{confirmDelete.topic}"</span> from your brain map? All retention data will be deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-card-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndDelete}
                  disabled={deleteSession.isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60"
                >
                  {deleteSession.isPending ? "Removing…" : "Remove"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
