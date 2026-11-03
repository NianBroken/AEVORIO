import {
  CircuitBoard,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  ChevronRight,
  X,
  Cpu,
  Radio,
  Layers,
  Zap,
  Code,
  Box,
  Globe,
  Check,
  Settings,
  Activity,
  Cable,
  Sparkles,
} from "lucide-react";
const registry = {
  CircuitBoard,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  ChevronRight,
  X,
  Cpu,
  Radio,
  Layers,
  Zap,
  Code,
  Box,
  Globe,
  Check,
  Settings,
  Activity,
  Cable,
  Sparkles,
};
export function IconPreview({ name }: { name: string }) {
  const Icon = registry[name as keyof typeof registry];
  return Icon ? <Icon size={21} strokeWidth={1.6} /> : null;
}
