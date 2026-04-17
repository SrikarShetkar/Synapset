import { NeuralNetwork } from "@/components/neural-network";
import { Link } from "wouter";
import { BrainCircuit, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <NeuralNetwork />
      
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2 text-primary">
          <BrainCircuit className="w-8 h-8" />
          <span className="text-2xl font-bold tracking-tighter text-foreground">Synapset</span>
        </div>
        <Link href="/dashboard" className="px-6 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium border border-primary/20">
          Sign In
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl space-y-8"
        >
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            Don't just study. Connect.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Stop passively reading. Synapset wires knowledge directly into your brain using active recall, spatial tracing, and AI-driven forgetting curves.
          </p>
          <div className="flex justify-center pt-8">
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-background bg-primary rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_30px_hsl(var(--primary)/0.6)]"
            >
              <span className="mr-2">Initialize Brain Map</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
            </Link>
          </div>
        </motion.div>
      </main>
      
      <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-background to-transparent z-0 pointer-events-none" />
    </div>
  );
}
