// Published admission evidence only. No coordinates, invented places or autocomplete data.
// Match against a real provider-selected place and its verified country/city.
export const admissionPrices = [
  { aliases: ['nahargarhfort', 'nahargarhfortjaipur'], indian: 100, foreign: 600, source: 'published_estimate', url: 'https://www.rajasthantourtrip.com/blog/nahargarh-fort-jaipur-complete-guide.html', note: 'Standard fort entry; separate museums, parking and activities excluded.' },
  { aliases: ['amberpalace', 'amberfort', 'amerfort', 'amerpalace', 'amerpalacefort'], indian: 200, foreign: 1000, source: 'published_estimate', url: 'https://www.rajasthantourtrip.com/blog/jaipur-monuments-timing-entry-fee.html', note: 'Reported 2026 standard admission; older sources disagree. Confirm at OBMS. Transfers and shows excluded.' },
  { aliases: ['citypalace', 'citypalacejaipur', 'thecitypalace', 'citypalacemuseumjaipur'], indian: 400, foreign: 1200, indianChild: 200, foreignChild: 600, belowAge: 12, source: 'reviewed_catalog', url: 'https://citypalace.org/visit', note: 'Museum courtyards and galleries only. Composite and Royal Tour are separate ticket products.' },
  { aliases: ['hawamahal', 'hawamahalpalaceofwinds'], indian: 100, foreign: 600, source: 'published_estimate', url: 'https://www.rajasthantourtrip.com/blog/jaipur-monuments-timing-entry-fee.html', note: 'Interior admission estimate; not a charge for seeing the exterior from a public road.' },
  { aliases: ['jantarmantar', 'jantarmantarjaipur'], indian: 100, foreign: 600, source: 'published_estimate', url: 'https://www.rajasthantourtrip.com/blog/jaipur-monuments-timing-entry-fee.html', note: 'Reported 2026 standard admission. Confirm current ticket at OBMS.' },
  { aliases: ['alberthallmuseum', 'alberthall'], indian: 100, foreign: 600, source: 'published_estimate', url: 'https://www.rajasthantourtrip.com/blog/jaipur-monuments-timing-entry-fee.html', note: 'Reported standard museum admission; special evening products excluded.' },
] as const;
export const admissionCheckedAt = '2026-10-14T00:00:00Z';
export const admissionValidUntil = '2026-11-14T00:00:00Z';
