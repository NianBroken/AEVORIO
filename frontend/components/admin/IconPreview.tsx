import { ICON_REGISTRY } from "../../lib/icon-registry";
export function IconPreview({ name }: { name: string }) {
  const Icon = ICON_REGISTRY[name as keyof typeof ICON_REGISTRY];
  return Icon ? <Icon data-managed-icon={name} size={21} strokeWidth={1.6} /> : null;
}
