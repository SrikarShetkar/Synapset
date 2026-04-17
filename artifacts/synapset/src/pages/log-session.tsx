import { useState } from "react";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateStudySession, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Brain, Zap, Clock, Target } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useLocation } from "wouter";

const formSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  duration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  difficulty: z.number().min(1).max(5),
  notes: z.string().optional(),
});

export default function LogSession() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      duration: 30,
      difficulty: 3,
      notes: "",
    },
  });

  const createSession = useCreateStudySession();

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createSession.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Synapse Fired!",
            description: "Session logged. We've scheduled your next optimal revision.",
          });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: "Failed to log session",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 max-w-3xl mx-auto w-full space-y-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Feed Your Synapse</h1>
          <p className="text-muted-foreground mt-1">Log your study session to schedule future revisions.</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" /> Topic / Concept
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Action Potentials" {...field} className="bg-background border-border focus-visible:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" /> Duration (minutes)
                    </FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" {...field} className="bg-background border-border focus-visible:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center gap-2 mb-4">
                      <Target className="w-4 h-4 text-primary" /> Difficulty
                    </FormLabel>
                    <FormControl>
                      <div className="pt-2 pb-6 px-2">
                        <Slider
                          min={1}
                          max={5}
                          step={1}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                          className="[&_[role=slider]]:bg-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-3 px-1">
                          <span>1 - Effortless</span>
                          <span>3 - Normal</span>
                          <span>5 - Brain Melting</span>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4 text-accent" /> Notes / Key Takeaways (Optional)
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="What were the main points?" 
                        className="resize-none min-h-[100px] bg-background border-border focus-visible:ring-primary" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 shadow-[0_0_15px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_25px_hsl(var(--primary)/0.5)] transition-all"
                disabled={createSession.isPending}
              >
                {createSession.isPending ? "Wiring..." : "Log Session & Schedule Revisions"}
              </Button>
            </form>
          </Form>
        </div>
      </motion.div>
    </Layout>
  );
}
