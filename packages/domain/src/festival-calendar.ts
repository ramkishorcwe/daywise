// Published calendar dates, not a live traffic feed. Never roll lunar dates into another year.
// Maintenance and evidence: festival-traffic.md.
export type Festival = {
  id: string;
  name: string;
  countryCode: string;
  cities?: readonly string[];
  periods: readonly (readonly [string, string])[];
  advice: string;
  source: { label: string; url: string };
  informationUrl?: string;
  reviewedOn: string;
};
const rajasthan = { label: 'Rajasthan Tourism calendar', url: 'https://www.tourism.rajasthan.gov.in/content/dam/rajasthan-tourism/english/pdf/FairsandFestivals.pdf' };
const holidays = { label: 'Government holiday calendar', url: 'https://www.iirs.gov.in/holidaycalender' };
const reviewedOn = '2026-10-15';
const india = (id: string, name: string, date: string, advice: string): Festival => ({ id, name, countryCode: 'IN', periods: [[date, date]], advice, source: holidays, reviewedOn });
export const festivalCalendar: readonly Festival[] = [
  {
    id: 'jaipur-gangaur', name: 'Gangaur', countryCode: 'IN', cities: ['Jaipur', 'जयपुर'],
    periods: [['2026-03-21', '2026-03-22'], ['2027-04-09', '2027-04-10'], ['2028-03-28', '2028-03-29'], ['2029-04-16', '2029-04-17'], ['2030-04-05', '2030-04-06']],
    advice: 'Processions may mean crowds, slow traffic or diversions around City Palace, Tripolia Bazaar and Chhoti Chaupar. Allow extra time around the Old City.',
    source: rajasthan, informationUrl: 'https://www.tourism.rajasthan.gov.in/jaipur.html', reviewedOn,
  },
  {
    id: 'jaipur-teej', name: 'Teej', countryCode: 'IN', cities: ['Jaipur', 'जयपुर'],
    periods: [['2026-08-14', '2026-08-15'], ['2027-08-04', '2027-08-05'], ['2028-07-24', '2028-07-25'], ['2029-08-12', '2029-08-13'], ['2030-08-01', '2030-08-02']],
    advice: 'Processions may mean crowds, slow traffic or diversions around City Palace, Tripolia Bazaar and Chhoti Chaupar. Allow extra time around the Old City.',
    source: rajasthan, informationUrl: 'https://www.tourism.rajasthan.gov.in/jaipur.html', reviewedOn,
  },
  {
    id: 'udaipur-mewar', name: 'Mewar Festival / Gangaur', countryCode: 'IN', cities: ['Udaipur', 'उदयपुर'],
    periods: [['2026-03-21', '2026-03-23'], ['2027-04-09', '2027-04-11']],
    advice: 'Festival processions and gatherings may slow access around the Old City and Lake Pichola. Allow extra time near event areas.',
    source: rajasthan, informationUrl: 'https://www.tourism.rajasthan.gov.in/travel-diaries/itvaSthan.html', reviewedOn,
  },
  {
    id: 'jodhpur-marwar', name: 'Marwar Festival', countryCode: 'IN', cities: ['Jodhpur', 'जोधपुर'],
    periods: [['2026-10-24', '2026-10-25'], ['2027-10-13', '2027-10-14']],
    advice: 'Festival gatherings may slow travel near the Clock Tower and event venues. Allow extra time if your visits pass through these areas.',
    source: rajasthan, informationUrl: 'https://www.tourism.rajasthan.gov.in/fairs-and-festivals.html', reviewedOn,
  },
  india('holi-2026', 'Holi', '2026-03-04', 'Local celebrations may cause crowds, slower travel and diversions. Confirm access to your visits before leaving.'),
  india('ram-navami-2026', 'Ram Navami', '2026-03-26', 'Temple gatherings or processions may slow nearby roads. Allow extra time around celebration areas.'),
  india('janmashtami-2026', 'Janmashtami', '2026-09-04', 'Temple gatherings and celebrations may slow nearby roads, especially later in the day.'),
  india('dussehra-2026', 'Dussehra', '2026-10-20', 'Local fairs and celebrations may cause crowds, slower travel or diversions around event grounds, especially in the evening.'),
  india('diwali-2026', 'Diwali', '2026-11-08', 'Celebrations and busy markets may cause congestion around shopping and event areas, especially in the evening. Allow extra travel time.'),
  india('gurpurab-2026', 'Guru Nanak Jayanti', '2026-11-24', 'Gatherings or processions near gurdwaras may slow nearby roads. Check local arrangements before leaving.'),
  india('christmas-2026', 'Christmas', '2026-12-25', 'Gatherings near churches, markets and celebration areas may cause local congestion. Allow extra time if your route passes nearby.'),
];
