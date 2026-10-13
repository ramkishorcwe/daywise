import { getCity } from '../../../fixtures/cities';
import { planSchema, tripInputSchema } from '../../../packages/contracts/src';
import { compareFood } from '../../../packages/domain/src/food-options';

self.onmessage = (event: MessageEvent) => {
  try {
    const input = tripInputSchema.parse(event.data.input), city = getCity(input.cityId);
    if (!city) throw new Error('This city has no supported food fixture.');
    const plan = event.data.plan === null ? null : planSchema.parse(event.data.plan);
    self.postMessage({ options: compareFood(input, city, plan) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Food comparison could not run.' }); }
};
