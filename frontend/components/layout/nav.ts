import { Box, CalendarClock, Compass, FileText, GitCompare, Globe2, LayoutDashboard, ScrollText, ShieldCheck, Timer, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; short: string; icon: LucideIcon; phase: string }

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Mission", short: "Mission", icon: LayoutDashboard, phase: "Phase 1" },
  { href: "/explorer", label: "Explorer", short: "Explore", icon: Globe2, phase: "Phase 2" },
  { href: "/view3d", label: "3D", short: "3D", icon: Box, phase: "Phase 10" },
  { href: "/analysis", label: "Analysis", short: "Analyze", icon: Compass, phase: "Phases 3-5" },
  { href: "/planner", label: "Slip Planner", short: "Planner", icon: CalendarClock, phase: "Phase 7" },
  { href: "/validation", label: "Validation", short: "Valid", icon: ShieldCheck, phase: "Phase 8" },
  { href: "/comparison", label: "Compare", short: "Compare", icon: GitCompare, phase: "Phase 9" },
  { href: "/timeline", label: "Timeline", short: "Time", icon: Timer, phase: "Phase 10" },
  { href: "/report", label: "Report", short: "Report", icon: ScrollText, phase: "Phase 10" },
  { href: "/methodology", label: "Data & Method", short: "Method", icon: FileText, phase: "Phase 1" },
];
