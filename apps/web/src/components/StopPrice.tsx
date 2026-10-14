import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import { stopPriceLines } from '../stop-price';
export function StopPrice({ detail, people }: { detail: GuidePlan['stops'][number]; people?: number }) {
  return <div className="stop-price" aria-label="Visit price details">{stopPriceLines(detail, people).map((line, i) => <p key={i}>{line}</p>)}</div>;
}
