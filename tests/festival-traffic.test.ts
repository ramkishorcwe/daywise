import { describe, expect, it } from 'vitest';
import { festivalTraffic, validTravelDate } from '../packages/domain/src/festival-traffic';
import { festivalCalendar } from '../packages/domain/src/festival-calendar';
import { localDate } from '../packages/domain/src/time-format';
const city = (name: string, countryCode = 'IN') => ({ city: { placeId: 'provider-confirmed-city', name, countryCode } });
const ids = (name: string, date: string, countryCode = 'IN') => festivalTraffic(city(name, countryCode), date).map(e => e.id);

describe('source-backed festival traffic advisories', () => {
  it('matches Gangaur on both published days without spilling into adjacent days', () => {
    expect(ids('Jaipur', '2027-04-08')).not.toContain('jaipur-gangaur');
    for (const date of ['2027-04-09', '2027-04-10']) expect(ids('Jaipur', date)).toContain('jaipur-gangaur');
    expect(ids('Jaipur', '2027-04-11')).not.toContain('jaipur-gangaur');
    expect(festivalTraffic(city('Jaipur'), '2027-04-09')[0]).toMatchObject({ startsOn: '2027-04-09', endsOn: '2027-04-10', reviewedOn: '2026-10-15' });
  });
  it('handles reviewed Teej dates, overlapping observances and city-specific festivals', () => {
    expect(ids('Jaipur', '2026-08-14')).toContain('jaipur-teej');
    expect(ids('Jaipur', '2027-08-05')).toContain('jaipur-teej');
    expect(ids('Udaipur', '2027-04-11')).toContain('udaipur-mewar');
    expect(ids('Jaipur', '2027-04-11')).not.toContain('udaipur-mewar');
    expect(ids('Jodhpur', '2026-10-24')).toContain('jodhpur-marwar');
    expect(ids('Jaipur', '2026-10-24')).toEqual([]);
  });
  it('supports country-wide observances in any Indian city, without assuming another country shares them', () => {
    for (const name of ['Jaipur', 'Mumbai', 'Delhi', 'Unlisted Indian locality']) expect(ids(name, '2026-10-20')).toEqual(['dussehra-2026']);
    expect(ids('London', '2026-11-08', 'GB')).toEqual([]);
    expect(ids('Jaipur', '2027-04-09', 'US')).toEqual([]);
  });
  it('uses exact normalized city identity, not an address substring or default city', () => {
    expect(ids('  JAIPUR  ', '2027-04-09')).toContain('jaipur-gangaur');
    expect(ids('जयपुर', '2027-04-09')).toContain('jaipur-gangaur');
    expect(ids('Near Jaipur', '2027-04-09')).toEqual([]);
    expect(ids('Jaipur Rural', '2027-04-09')).toEqual([]);
    expect(festivalTraffic({ city: null }, '2027-04-09')).toEqual([]);
    expect(festivalTraffic(null, '2027-04-09')).toEqual([]);
  });
  it('does not repeat lunar festivals on the same Gregorian date in unreviewed years', () => {
    expect(ids('Jaipur', '2027-03-21')).toEqual([]);
    expect(ids('Jaipur', '2031-04-05')).toEqual([]);
    expect(ids('Mumbai', '2027-11-08')).toEqual([]);
  });
  it('rejects incomplete, impossible or timestamp input instead of guessing a date', () => {
    for (const date of ['', '2027-4-9', '2026-02-30', '2027-13-09', '2027-04-09T00:00:00Z', 'invalid']) {
      expect(validTravelDate(date)).toBe(false); expect(ids('Jaipur', date)).toEqual([]);
    }
    expect(validTravelDate('2028-02-29')).toBe(true);
  });
  it('matches an itinerary using its destination day even when UTC or the viewer day differs', () => {
    const arrivalDay = localDate(Date.parse('2027-04-08T20:00:00Z'), 'Asia/Kolkata');
    expect(ids('Jaipur', arrivalDay)).toContain('jaipur-gangaur');
    const nextDay = localDate(Date.parse('2027-04-10T20:00:00Z'), 'Asia/Kolkata');
    expect(ids('Jaipur', nextDay)).not.toContain('jaipur-gangaur');
  });
  it('keeps published ranges valid, IDs unique and official source links on every entry', () => {
    expect(new Set(festivalCalendar.map(e => e.id)).size).toBe(festivalCalendar.length);
    for (const event of festivalCalendar) {
      expect(new URL(event.source.url).protocol).toBe('https:');
      expect(new URL(event.source.url).hostname).toMatch(/(^|\.)gov\.in$/);
      for (const [start, end] of event.periods) { expect(validTravelDate(start)).toBe(true); expect(validTravelDate(end)).toBe(true); expect(end >= start).toBe(true); }
    }
  });
});
