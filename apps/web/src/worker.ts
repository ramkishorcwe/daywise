import { getCity } from '../../../fixtures/cities';
import { tripInputSchema } from '../../../packages/contracts/src';
import { generatePlan, scheduleOrder } from '../../../packages/domain/src/planner';

self.onmessage = (event: MessageEvent) => {
  try {
    const input = tripInputSchema.parse(event.data.input);
    const city = getCity(input.cityId);
    if (!city) throw new Error('This destination has no supported test dataset.');
    const result = event.data.order === null ? generatePlan(input, city) : scheduleOrder(input, city, event.data.order);
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'The planner could not complete this request.' }); }
};
