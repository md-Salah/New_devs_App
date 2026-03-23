import { useContext } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { City } from '../components/keys/CitySelector';
import { CityContext } from '../components/keys/KeysView';

interface CityContextType {
  activeCity: City['id'];
}

export function useCity() {
  // Try to use the new CityContext first
  const cityContext = useContext(CityContext);
  if (cityContext) {
    return cityContext;
  }
  
  // Fall back to outlet context for backward compatibility
  try {
    return useOutletContext<CityContextType>();
  } catch {
    // If both fail, return a default value
    return { activeCity: localStorage.getItem('activeCity') || '' };
  }
}
