import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import { stopPriceLines } from '../stop-price';
export function StopPrice({ detail, people, compact = false }: { detail: GuidePlan['stops'][number]; people?: number; compact?: boolean }) {
  const lines = stopPriceLines(detail, people);
  const visible = compact ? lines.filter(line => /^(Admission:|Admission for your group:|Food per person:|Food for your group:|Food price unknown)/.test(line) || (!!detail.cost && line.startsWith('Entry/cover charge:'))) : lines;
  return <div className="stop-price" aria-label="Visit price details">{visible.map((line, i) => <p key={i}>{line}</p>)}</div>;
}
