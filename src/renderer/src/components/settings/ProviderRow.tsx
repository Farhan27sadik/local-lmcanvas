import { motion } from "framer-motion";
import { ArrowUpRight, Loader2, Plug2, RotateCw } from "lucide-react";
import type { Provider } from "@shared/types";
import { useProviderAuth } from "@/hooks/useProviderAuth";
import { PROVIDER_INFO } from "@/components/Onboarding/providerInfo";
import { ProviderLogo } from "@/components/Canvas/ProviderLogo";

type Props = { provider: Provider };

export function ProviderRow({ provider }: Props) {
  const info = PROVIDER_INFO[provider];
  const auth = useProviderAuth(provider);

  const authenticated = auth.status?.authenticated ?? false;
  const installed = auth.status?.installed ?? false;

  const handleSignIn = async () => {
    try {
      await window.api.providers.openLoginTerminal(provider);
    } finally {
      auth.startPolling();
    }
  };

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  return (
    <div title={info.tagline} className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <ProviderLogo provider={provider} size={14} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground truncate">{info.name}</div>
        </div>
        <div className="ml-auto flex items-center shrink-0">
          {authenticated ? (
            <motion.button
              type="button"
              onClick={(e) => {
                stop(e);
                void handleSignIn();
              }}
              onMouseDown={stop}
              whileTap={{ scale: 0.95 }}
              title="Connected. Hover to re-check"
              aria-label="Connected. Hover to re-check"
              className="group relative inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-900 transition-colors hover:border-border hover:bg-card hover:text-foreground dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 cursor-pointer"
            >
              <span className="inline-flex items-center opacity-100 transition-opacity duration-150 group-hover:opacity-0">
                <Plug2 className="h-3 w-3" />
              </span>
              <span className="absolute inline-flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <RotateCw className="h-3 w-3" />
              </span>
            </motion.button>
          ) : installed ? (
            <motion.button
              type="button"
              onClick={(e) => {
                stop(e);
                void handleSignIn();
              }}
              onMouseDown={stop}
              disabled={auth.isPolling}
              whileTap={{ scale: 0.95 }}
              className="inline-flex h-7 items-center justify-center rounded-lg bg-foreground px-2 text-[10px] font-medium text-background hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {auth.isPolling ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Wait…
                </>
              ) : (
                "Sign in"
              )}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={(e) => {
                stop(e);
                window.open(info.installUrl, "_blank", "noopener");
              }}
              onMouseDown={stop}
              whileTap={{ scale: 0.95 }}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[10px] text-foreground hover:bg-muted cursor-pointer"
            >
              Install
              <ArrowUpRight className="h-2.5 w-2.5" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
