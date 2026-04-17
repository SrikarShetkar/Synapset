import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Timer,
  PenTool,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar({ className }: { className?: string }) {
  const [location] = useLocation();

  const links = [
    { href: "/dashboard", label: "Brain Map", icon: LayoutDashboard },
    { href: "/log", label: "Log Session", icon: BookOpen },
    { href: "/coach", label: "Coach", icon: MessageSquare },
    { href: "/focus", label: "Deep Work", icon: Timer },
    { href: "/air-draw", label: "Trace to Remember", icon: PenTool },
    { href: "/break", label: "Synapse Reset", icon: BrainCircuit },
  ];

  return (
    <nav
      className={cn(
        "flex flex-col w-64 bg-sidebar border-r border-sidebar-border min-h-screen p-4",
        className
      )}
    >
      <div className="mb-8 px-2 flex items-center gap-2">
        <BrainCircuit className="w-8 h-8 text-primary" />
        <span className="text-xl font-bold tracking-tight text-foreground">
          Synapset
        </span>
      </div>
      <div className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar className="hidden md:flex shrink-0 z-10" />
      <main className="flex-1 flex flex-col h-screen overflow-y-auto relative z-0">
        {children}
      </main>
    </div>
  );
}
