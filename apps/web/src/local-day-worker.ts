import { getCity } from '../../../fixtures/cities';
import { sessionSchema } from '../../../packages/contracts/src';
import { acceptLocalDay, previewLocalDay, reportLocalDay, reportLocalReturn } from '../../../packages/domain/src/local-day';

self.onmessage = (event: MessageEvent) => {
  try {
    const session = sessionSchema.parse(event.data.session), city = getCity(session.input.cityId);
    if (!city) throw new Error('This city has no supported local catalog.');
    if (event.data.action === 'report') self.postMessage({ session: reportLocalDay(session, city, event.data.completedCount, event.data.delayMinutes) });
    else if (event.data.action === 'return') self.postMessage({ session: reportLocalReturn(session, city, event.data.arrivalDate, event.data.arrivalTime) });
    else if (event.data.action === 'preview') self.postMessage(previewLocalDay(session, city, event.data.change));
    else if (event.data.action === 'accept') self.postMessage({ session: acceptLocalDay(session, city, event.data.proposal) });
    else throw new Error('Unsupported local day action.');
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'The local update could not run.' }); }
};
