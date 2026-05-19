const FLAGS: Record<string, string> = {
  'Afghanistan': '🇦🇫', 'Argentina': '🇦🇷', 'Armenia': '🇦🇲', 'Australia': '🇦🇺',
  'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿', 'Bali': '🇮🇩', 'Belgium': '🇧🇪',
  'Bhutan': '🇧🇹', 'Bolivia': '🇧🇴', 'Brazil': '🇧🇷', 'Bulgaria': '🇧🇬',
  'Cambodia': '🇰🇭', 'Canada': '🇨🇦', 'Chile': '🇨🇱', 'China': '🇨🇳',
  'Colombia': '🇨🇴', 'Croatia': '🇭🇷', 'Cuba': '🇨🇺', 'Czech Republic': '🇨🇿',
  'Denmark': '🇩🇰', 'Dubai': '🇦🇪', 'Ecuador': '🇪🇨', 'Egypt': '🇪🇬',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Ethiopia': '🇪🇹', 'Finland': '🇫🇮', 'France': '🇫🇷',
  'Georgia': '🇬🇪', 'Germany': '🇩🇪', 'Greece': '🇬🇷', 'Hong Kong': '🇭🇰',
  'Hungary': '🇭🇺', 'Iceland': '🇮🇸', 'India': '🇮🇳', 'Indonesia': '🇮🇩',
  'Ireland': '🇮🇪', 'Israel': '🇮🇱', 'Italy': '🇮🇹', 'Japan': '🇯🇵',
  'Jordan': '🇯🇴', 'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪', 'Korea': '🇰🇷',
  'Laos': '🇱🇦', 'Lebanon': '🇱🇧', 'Maldives': '🇲🇻', 'Malaysia': '🇲🇾',
  'Mexico': '🇲🇽', 'Mongolia': '🇲🇳', 'Morocco': '🇲🇦', 'Myanmar': '🇲🇲',
  'Nepal': '🇳🇵', 'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿', 'Norway': '🇳🇴',
  'Peru': '🇵🇪', 'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹',
  'Romania': '🇷🇴', 'Russia': '🇷🇺', 'Rwanda': '🇷🇼', 'Serbia': '🇷🇸',
  'Singapore': '🇸🇬', 'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'South Africa': '🇿🇦',
  'South Korea': '🇰🇷', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰', 'Sweden': '🇸🇪',
  'Switzerland': '🇨🇭', 'Taiwan': '🇹🇼', 'Tanzania': '🇹🇿', 'Thailand': '🇹🇭',
  'Turkey': '🇹🇷', 'UAE': '🇦🇪', 'UK': '🇬🇧', 'Ukraine': '🇺🇦',
  'United Arab Emirates': '🇦🇪', 'United Kingdom': '🇬🇧', 'United States': '🇺🇸',
  'USA': '🇺🇸', 'Uzbekistan': '🇺🇿', 'Vietnam': '🇻🇳',
}

export function countryFlag(country: string | null | undefined): string {
  if (!country) return '🌍'
  return FLAGS[country] ?? '🌍'
}
