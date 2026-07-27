// Country list used for nation selection at registration and on the profile.
// `code` is the ISO 3166-1 alpha-2 code (matches expo-location's
// `isoCountryCode`), `name` is the display name, `flag` is the emoji flag.
// Keep names in sync with what we persist to `profiles.country` (we store the
// display name so it renders directly wherever the profile is shown).

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "BN", name: "Brunei", flag: "🇧🇳" },
  { code: "KH", name: "Cambodia", flag: "🇰🇭" },
  { code: "LA", name: "Laos", flag: "🇱🇦" },
  { code: "MM", name: "Myanmar", flag: "🇲🇲" },
  { code: "TL", name: "Timor-Leste", flag: "🇹🇱" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "PE", name: "Peru", flag: "🇵🇪" },
];

const CODE_INDEX: Record<string, Country> = COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {} as Record<string, Country>);

const NAME_INDEX: Record<string, Country> = COUNTRIES.reduce((acc, c) => {
  acc[c.name.toLowerCase()] = c;
  return acc;
}, {} as Record<string, Country>);

/** Resolve an ISO alpha-2 country code (e.g. from GPS) to a Country. */
export function findCountryByCode(code?: string | null): Country | undefined {
  if (!code) return undefined;
  return CODE_INDEX[code.toUpperCase()];
}

/** Resolve a stored/display country name to a Country (for flag lookup). */
export function findCountryByName(name?: string | null): Country | undefined {
  if (!name) return undefined;
  return NAME_INDEX[name.trim().toLowerCase()];
}

/** Emoji flag for a stored country name, or a globe fallback. */
export function flagForCountry(name?: string | null): string {
  return findCountryByName(name)?.flag ?? "🌍";
}
