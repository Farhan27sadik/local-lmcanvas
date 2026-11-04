import { useEffect, useMemo } from "react";
import { Brain, ChevronDown } from "lucide-react";
import type { CanvasNode, NodeId } from "@shared/types";
import { findClaudeModel } from "@shared/claudeModels";
import { isNewSinceCheck, splitClaudeModels, withoutFailed } from "@shared/modelCatalog";
import { useModelChecksStore } from "@/hooks/useModelChecksStore";
import { nodeModelPatch } from "@/lib/claudeModelChoice";
import { prettyModelLabel, useProviderInfo } from "@/hooks/useProviderInfo";
import { useClaudeModelList, useRefreshClaudeModelsOnMount } from "@/hooks/useClaudeModels";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { claudeModelBadgeLabel } from "@/lib/modelLabel";
import { CheckModelsFooter } from "./CheckModelsFooter";
import { ModelOption } from "./ModelOption";
import { OlderModels } from "./OlderModels";
import { OtherProviderModels } from "./OtherProviderModels";
import { ProviderLogo } from "./ProviderLogo";
import { BadgePopover } from "./BadgePopover";

type Props = { nodeId: NodeId; popoverSide?: "top" | "bottom" };
type ClaudeUsageTotals = {
  turns: number;
  totalTokens: number;
  totalCostUsd: number;
  hasTokenData: boolean;
  hasCostData: boolean;
};

/** The node's Claude model: Settings' model by default, or any model the installed Claude Code offers. */
export function ModelBadge({ nodeId, popoverSide }: Props) {
  const effectiveProvider = useCanvasStore((s) => s.getEffectiveProvider(nodeId));
  const nodeModel = useCanvasStore((s) => s.nodes[nodeId]?.data.nodeSettings?.model);
  const storedEffort = useCanvasStore((s) => s.nodes[nodeId]?.data.nodeSettings?.reasoningEffort);
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodeSettings = useCanvasStore((s) => s.setNodeSettings);
  const { label: providerLabel, claudeModelId } = useProviderInfo(effectiveProvider);
  const modelList = useClaudeModelList();
  const models = modelList?.models ?? null;
  const list = models ?? [];
  const usage = useMemo(() => aggregateClaudeUsage(nodes), [nodes]);
  const checks = useModelChecksStore((s) => s.checks);
  const { latest, older } = useMemo(() => splitClaudeModels(list), [list]);
  const shown = withoutFailed(latest, "claude", checks, (m) => m.value);

  const isClaude = effectiveProvider === "claude";
  // A non-Claude node's own model counts only when the node chose that provider itself.
  const ownProviderModel = useCanvasStore((s) =>
    s.nodes[nodeId]?.data.nodeSettings?.provider === effectiveProvider ? nodeModel : undefined,
  );
  const overridden = isClaude ? nodeModel !== undefined : ownProviderModel !== undefined;
  const label = isClaude
    ? claudeModelBadgeLabel(list, nodeModel ?? claudeModelId)
    : ownProviderModel
      ? prettyModelLabel(effectiveProvider, ownProviderModel)
      : providerLabel;
  const settingsLabel = claudeModelBadgeLabel(list, claudeModelId);
  // Only a live list can say a model is gone; Claude Code's aliases don't list pinned ids.
  const retired =
    overridden && modelList?.live === true && findClaudeModel(list, nodeModel) === undefined;
  const activeValue = !isClaude || nodeModel === undefined
    ? undefined
    : (findClaudeModel(list, nodeModel)?.value ?? nodeModel);

  const choose = (model: string | undefined): void => {
    setNodeSettings(nodeId, {
      ...nodeModelPatch({ models: list, model, settingsModel: claudeModelId, isClaude, storedEffort }),
      // A Codex tier left on the node would come back if it later switched to Codex again.
      ...(isClaude ? {} : { serviceTier: undefined }),
    });
  };

  const claudeRow = (model: (typeof list)[number], close: () => void) => (
    <ModelOption
      key={model.value}
      active={activeValue === model.value}
      title={model.displayName}
      subtitle={`${model.description}${isNewSinceCheck(checks, "claude", model.value) ? " · not checked" : ""}`}
      onSelect={() => {
        choose(model.value);
        close();
      }}
    />
  );

  return (
    <BadgePopover
      side={popoverSide}
      title={`Model: ${label}${retired ? " (no longer offered by Claude Code)" : overridden ? " (node override)" : " (Settings)"} · click to change`}
      overridden={overridden}
      ariaHasPopup="listbox"
      panelClassName="w-[264px]"
      label={
        <>
          <ProviderLogo provider={effectiveProvider} size={10} />
          <span className="tracking-tight text-[8px]">{label}</span>
          {isClaude && <Brain className="w-[10px] h-[10px] text-amber-500 opacity-90" />}
          <ChevronDown className="w-[8px] h-[8px] text-muted-foreground" />
        </>
      }
    >
      {({ close }) => (
        // `nowheel` lets the list scroll instead of the canvas panning under it.
        <div role="listbox" aria-label="Model" className="nowheel max-h-[340px] overflow-y-auto pb-1">
          <div
            className="px-2.5 pt-2 pb-1 text-[8px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            Node model
          </div>
          <RefreshOnOpen />
          {retired && (
            <ModelOption
              active
              title={label}
              subtitle="No longer offered by Claude Code · pick another model"
              onSelect={close}
            />
          )}
          <ModelOption
            active={isClaude && nodeModel === undefined}
            title="Settings model"
            subtitle={`${settingsLabel} · follows Settings → Claude`}
            onSelect={() => {
              choose(undefined);
              close();
            }}
          />
          {models === null && (
            <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground">Loading Claude Code models…</p>
          )}
          {shown.map((model) => claudeRow(model, close))}
          <OlderModels count={older.length} defaultOpen={older.some((m) => m.value === activeValue)}>
            {older.map((model) => claudeRow(model, close))}
          </OlderModels>
          <OtherProviderModels nodeId={nodeId} close={close} />
          <CheckModelsFooter />
          <div className="mt-1 border-t border-border px-2.5 pt-1.5 text-[9px] text-muted-foreground">
            This canvas: {formatUsage(usage)}
          </div>
        </div>
      )}
    </BadgePopover>
  );
}

/** Mounted only while the picker is open: asks for the latest list right away. */
function RefreshOnOpen(): null {
  useRefreshClaudeModelsOnMount();
  const load = useModelChecksStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return null;
}

function aggregateClaudeUsage(nodes: Record<string, CanvasNode>): ClaudeUsageTotals {
  return Object.values(nodes)
    .flatMap((node) => node.data.chat.messages)
    .filter((message) => message.role === "assistant" && message.provider === "claude")
    .reduce<ClaudeUsageTotals>(
      (totals, message) => ({
        turns: totals.turns + 1,
        totalTokens: totals.totalTokens + (message.usage?.totalTokens ?? 0),
        totalCostUsd: totals.totalCostUsd + (message.usage?.totalCostUsd ?? 0),
        hasTokenData: totals.hasTokenData || message.usage?.totalTokens !== undefined,
        hasCostData: totals.hasCostData || message.usage?.totalCostUsd !== undefined,
      }),
      { turns: 0, totalTokens: 0, totalCostUsd: 0, hasTokenData: false, hasCostData: false },
    );
}

function formatUsage(usage: ClaudeUsageTotals): string {
  const parts: string[] = [`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`];
  if (usage.hasTokenData) parts.push(`${formatNumber(usage.totalTokens)} tok`);
  if (usage.hasCostData) parts.push(`$${usage.totalCostUsd.toFixed(4)}`);
  return parts.join(" · ");
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}
