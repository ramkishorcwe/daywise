// Decorative artwork only: no locations, coordinates or suggested routes.
export default function TravelArtwork({ compact = false }: { compact?: boolean }) {
  if (compact) return <svg className="travel-artwork travel-artwork-compact" viewBox="0 0 400 230" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="200" cy="195" rx="132" ry="13" fill="#dfe7d6" />
    <path d="m65 61 87-24 96 24 88-24v132l-88 24-96-24-87 24V61z" fill="#fffdf5" stroke="#c9d6bf" strokeWidth="2" strokeLinejoin="round" />
    <path d="m152 37 96 24v132l-96-24V37z" fill="#e5eddc" /><path d="M152 37v132M248 61v132" stroke="#c9d6bf" strokeWidth="2" />
    <path d="m67 107 85-18 96 25 86-22M67 153l85-20 96 22 86-24" stroke="#dce6d2" strokeWidth="10" />
    <path d="M102 139c18-28 41 2 61-15s18-36 44-30 35 38 69 24" stroke="#70966e" strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round" />
    <circle cx="102" cy="139" r="7" fill="#fffdf5" stroke="#70966e" strokeWidth="3" />
    <path d="M276 62c-17 0-29 12-29 28 0 20 29 44 29 44s29-24 29-44c0-16-12-28-29-28z" fill="#246e5b" stroke="#fffdf5" strokeWidth="4" /><circle cx="276" cy="90" r="9" fill="#fffdf5" />
    <circle cx="85" cy="55" r="17" fill="#ecc39b" /><path d="m329 189 4-10 4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#bd946c" />
  </svg>;
  return <svg className={`travel-artwork${compact ? ' travel-artwork-compact' : ''}`} viewBox="0 0 400 230" fill="none" aria-hidden="true" focusable="false">
    <path d="M32 176c37-59 71-68 101-36s59 51 104 3 81-53 132-11M12 190c49-49 85-52 122-18s72 35 111-8 88-40 144-9M37 215c47-35 80-21 111-4s68 12 103-14 78-27 125-7" stroke="currentColor" strokeOpacity=".12" strokeWidth="1.5" />
    <circle cx="302" cy="58" r="34" fill="#e9ad7d" /><circle cx="302" cy="58" r="45" stroke="#e9ad7d" strokeOpacity=".4" strokeDasharray="2 7" />
    <path d="M91 157c-13-35 28-65 76-44 48 21 21 77 77 65s43-73 79-62" stroke="#246e5b" strokeWidth="2.5" strokeDasharray="5 7" strokeLinecap="round" />
    <g transform="rotate(-12 123 85)"><rect x="57" y="35" width="132" height="98" rx="13" fill="#fffdf7" stroke="#d1d9c9" /><path d="M70 48h106v72H70z" fill="#e5eddf" /><path d="m70 110 32-34 26 24 21-16 27 36H70z" fill="#98b39e" /><path d="m84 120 28-30 31 30" fill="#6d947e" /><circle cx="153" cy="67" r="10" fill="#f1c08d" /></g>
    <g transform="rotate(10 258 159)"><rect x="204" y="116" width="133" height="85" rx="12" fill="#fffdf7" stroke="#d1d9c9" /><path d="M244 116v85" stroke="#d1d9c9" strokeDasharray="3 4" /><circle cx="223" cy="156" r="12" fill="#e7eee2" /><path d="m223 146 3 10-3 10-3-10 3-10z" fill="#246e5b" /><path d="M260 143h57M260 154h39M260 177h48" stroke="#bccbbc" strokeWidth="4" strokeLinecap="round" /><path d="m293 133 12 6-12 6 3-6-3-6z" fill="#d59366" /></g>
    <path d="M323 82c-14 0-24 10-24 23 0 18 24 38 24 38s24-20 24-38c0-13-10-23-24-23z" fill="#246e5b" stroke="#fffdf7" strokeWidth="4" /><circle cx="323" cy="105" r="7" fill="#fffdf7" />
    <circle cx="91" cy="157" r="7" fill="#fffdf7" stroke="#246e5b" strokeWidth="3" /><path d="m35 81 4-9 4 9 9 4-9 4-4 9-4-9-9-4 9-4zM198 29l3-7 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ba885b" />
  </svg>;
}
