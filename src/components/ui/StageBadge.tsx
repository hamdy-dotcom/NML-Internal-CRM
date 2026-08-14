import { stageBadgeClass, STAGE_LABELS } from "@/lib/utils";
import type { MerchantStage } from "@/lib/database.types";

export default function StageBadge({ stage }: { stage: MerchantStage }) {
  return <span className={stageBadgeClass(stage)}>{STAGE_LABELS[stage]}</span>;
}
