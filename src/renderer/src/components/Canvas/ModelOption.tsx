import { Check } from "lucide-react";
import clsx from "clsx";
import type { Provider } from "@shared/types";
import { ProviderLogo } from "./ProviderLogo";

type Props = {
  active: boolean;
  title: string;
  subtitle: string;
  onSelect: () => void;
  provider?: Provider;
};

/** One row of the node model picker. */
export function ModelOption({ active, title, subtitle, onSelect, provider = "claude" }: Props) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={clsx(
        "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors cursor-pointer",
        active ? "bg-accent/15 text-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      <ProviderLogo provider={provider} size={12} />
      <span className="flex-1 min-w-0">
        <span className="block truncate">{title}</span>
        {subtitle && <span className="block truncate text-[9px] text-muted-foreground">{subtitle}</span>}
      </span>
      {active && <Check className="h-3 w-3 text-foreground/70" />}
    </button>
  );
}
