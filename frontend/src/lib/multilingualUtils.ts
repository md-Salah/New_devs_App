/**
 * Utility functions for handling multilingual content
 */

/**
 * Extracts a string from a multilingual object or returns the string as-is
 * @param value - The value that could be a string or multilingual object
 * @param defaultValue - Default value if extraction fails
 * @returns The extracted string
 */
export function extractMultilingualText(
  value: string | Record<string, string> | any,
  defaultValue: string = 'Unknown'
): string {
  if (!value) {
    return defaultValue;
  }

  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }

  // If it's an object, try to extract the appropriate language
  if (typeof value === 'object' && value !== null) {
    // Priority order: English, French, Spanish, Arabic
    const languages = ['en', 'fr', 'es', 'ar'];
    
    for (const lang of languages) {
      if (value[lang]) {
        return value[lang];
      }
    }
    
    // If no preferred language found, return the first available value
    const values = Object.values(value).filter(v => typeof v === 'string');
    if (values.length > 0) {
      return values[0] as string;
    }
  }

  return defaultValue;
}

/**
 * Gets the user's preferred language from localStorage or browser
 * @returns The preferred language code
 */
export function getPreferredLanguage(): string {
  // Check localStorage for saved preference
  const savedLang = localStorage.getItem('preferredLanguage');
  if (savedLang) {
    return savedLang;
  }

  // Check browser language
  const browserLang = navigator.language.split('-')[0];
  if (['en', 'fr', 'es', 'ar'].includes(browserLang)) {
    return browserLang;
  }

  // Default to English
  return 'en';
}

/**
 * Extracts text in the user's preferred language
 * @param value - The value that could be a string or multilingual object
 * @param defaultValue - Default value if extraction fails
 * @returns The extracted string in the preferred language
 */
export function extractPreferredLanguageText(
  value: string | Record<string, string> | any,
  defaultValue: string = 'Unknown'
): string {
  if (!value) {
    return defaultValue;
  }

  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }

  // If it's an object, try to extract the preferred language
  if (typeof value === 'object' && value !== null) {
    const preferredLang = getPreferredLanguage();
    
    // Try preferred language first
    if (value[preferredLang]) {
      return value[preferredLang];
    }
    
    // Fall back to general extraction
    return extractMultilingualText(value, defaultValue);
  }

  return defaultValue;
}