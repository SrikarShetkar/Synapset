import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useGetDashboardSummary, useGetMe } from "@workspace/api-client-react";
import { Flame, Brain, Zap, ArrowRight, Activity, Clock } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: user, isLoading: isUserLoading } = useGetMe();

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
            {[1,2,3].map(i => (
              <div key={i} className="h-48 bg-card animate-pulse rounded-xl border border-card-border" />
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
                  transition={{ delay: i * 0.1 }}
                  className={`bg-card border rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden ${
                    card.isUrgent ? "border-destructive/50 animate-pulse-glow" : "border-card-border"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-lg line-clamp-1" title={card.topic}>{card.topic}</h3>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      card.isUrgent ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                    }`}>
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
                          card.retentionPercent > 80 ? "bg-green-500" :
                          card.retentionPercent > 50 ? "bg-yellow-500" : "bg-destructive"
                        }`}
                        style={{ width: `${card.retentionPercent}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {card.daysSinceStudy} days ago
                    </div>
                    {card.isUrgent ? (
                      <Link href="/coach" className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1">
                        Revise Now <ArrowRight className="w-3 h-3" />
                      </Link>
                    ) : (
                      <Link href="/coach" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                        Review <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-card border border-card-border rounded-xl">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">Your brain map is empty</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Start logging your study sessions to build your neural network and track retention.</p>
            <Link href="/log" className="px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium inline-flex items-center gap-2 hover:bg-primary/90 transition-colors">
              Log Session <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </motion.div>
    </Layout>
  );
}
