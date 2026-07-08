import {
  BrainCircuit,
  Code2,
  Terminal,
  Sparkles,
  Smartphone,
  Palette,
  type LucideIcon,
} from "lucide-react";

/** Maps the `icon` string in a tool config to a lucide component. */
export const ICONS: Record<string, LucideIcon> = {
  BrainCircuit,
  Code2,
  Terminal,
  Sparkles,
  Smartphone,
  Palette,
};

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? BrainCircuit;
}
