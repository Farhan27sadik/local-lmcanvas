import type { Message } from "@shared/types";
import { formatReplyTime, formatReplyTimeFull } from "@shared/replyMeta";
import { prettyModelLabel } from "@/hooks/useProviderInfo";
import { claudeModelLabel } from "@/lib/modelLabel";
import { PROVIDER_INFO } from "@/components/Onboarding/providerInfo";
import { ProviderLogo } from "./ProviderLogo";

/** Which model wrote a reply: its name, or just the provider for replies from before it was recorded. */
function modelText(message: Message): string | undefined {
  const { provider } = message;
  if (!provider) return undefined;
  // A retried reply was written by the model it was retried on.
  const model = message.modelFallback?.toModel ?? message.model;
  const name = PROVIDER_INFO[provider].name;
  if (model === undefined) return name;
  if (model === "") return `${name} default`;
  return provider === "claude" ? claudeModelLabel(model) : prettyModelLabel(provider, model);
}

/** The small line under a reply: the model that wrote it and when it started. */
export function ReplyMeta({ message }: { message: Message }) {
  const model = modelText(message);
  return (
    <div className="flex items-center gap-1 pt-0.5 text-[9px] text-muted-foreground">
      {message.provider && <ProviderLogo provider={message.provider} size={9} />}
      {model && <span className="truncate">{model}</span>}
      {model && <span aria-hidden="true">·</span>}
      <time dateTime={new Date(message.createdAt).toISOString()} title={formatReplyTimeFull(message.createdAt)}>
        {formatReplyTime(message.createdAt)}
      </time>
    </div>
  );
}
