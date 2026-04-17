import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";
import { useCoachChat, useGetDashboardSummary } from "@workspace/api-client-react";
import { Brain, Send, Bot, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Coach() {
  const [messages, setMessages] = useState<Array<{role: "user" | "assistant", content: string}>>([
    { role: "assistant", content: "Hello! I'm your Synapset Coach. I have access to your brain map. What would you like to review today?" }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: summary } = useGetDashboardSummary();
  const chatMutation = useCoachChat();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);

    chatMutation.mutate(
      { 
        data: { 
          message: userMessage,
          context: summary ? {
            recentTopics: summary.subjectCards?.map(c => c.topic),
            urgentTopics: summary.subjectCards?.filter(c => c.isUrgent).map(c => c.topic)
          } : undefined
        } 
      },
      {
        onSuccess: (data) => {
          setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        },
        onError: () => {
          setMessages(prev => [...prev, { role: "assistant", content: "Sorry, my neural connection dropped. Try again?" }]);
        }
      }
    );
  };

  return (
    <Layout>
      <div className="flex h-full w-full overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col h-full p-4 md:p-8">
          <header className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-xl text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Synapset Coach</h1>
              <p className="text-sm text-muted-foreground">AI-powered active recall</p>
            </div>
          </header>

          <div className="flex-1 bg-card border border-card-border rounded-xl overflow-hidden flex flex-col shadow-lg relative">
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`flex max-w-[80%] gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        msg.role === "user" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
                      }`}>
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
                      </div>
                      <div className={`p-4 rounded-2xl ${
                        msg.role === "user" 
                          ? "bg-accent text-accent-foreground rounded-tr-sm" 
                          : "bg-background border border-border text-foreground rounded-tl-sm"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {chatMutation.isPending && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="flex max-w-[80%] gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                        <Brain className="w-4 h-4" />
                      </div>
                      <div className="p-4 rounded-2xl bg-background border border-border text-foreground rounded-tl-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> Thinking...
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border bg-background">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question or request a quiz..."
                  className="bg-card border-card-border"
                  disabled={chatMutation.isPending}
                />
                <Button 
                  type="submit" 
                  size="icon"
                  className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={chatMutation.isPending || !input.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar Context */}
        <div className="hidden lg:block w-72 border-l border-border bg-sidebar p-6 overflow-y-auto">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Brain Context</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-destructive" /> Needs Review
              </h3>
              <div className="space-y-2">
                {summary?.subjectCards?.filter(c => c.isUrgent).length ? (
                  summary.subjectCards.filter(c => c.isUrgent).map((card, i) => (
                    <div key={i} className="text-sm p-2 rounded bg-destructive/10 text-destructive border border-destructive/20">
                      {card.topic} ({Math.round(card.retentionPercent)}%)
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground italic">All good here!</div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" /> Recent Topics
              </h3>
              <div className="space-y-2">
                {summary?.subjectCards?.slice(0, 5).map((card, i) => (
                  <div key={i} className="text-sm p-2 rounded bg-card border border-border flex justify-between">
                    <span className="truncate pr-2">{card.topic}</span>
                    <span className="text-primary font-mono">{Math.round(card.retentionPercent)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
