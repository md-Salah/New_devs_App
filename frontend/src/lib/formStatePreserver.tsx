import React, { useEffect } from 'react';
import { useFormStatePreservation } from './pageState';

// Higher-order component to add form state preservation to any form component
export function withFormStatePreservation<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return (props: P) => {
    const { preserveStateBeforeSubmit } = useFormStatePreservation();
    
    // Add a global form submission handler
    useEffect(() => {
      const handleFormSubmit = (e: Event) => {
        const target = e.target as HTMLFormElement;
        if (target.tagName === 'FORM') {
          preserveStateBeforeSubmit();
        }
      };
      
      // Capture form submissions at the document level
      document.addEventListener('submit', handleFormSubmit, true);
      
      return () => {
        document.removeEventListener('submit', handleFormSubmit, true);
      };
    }, [preserveStateBeforeSubmit]);
    
    return <Component {...props} preserveStateBeforeSubmit={preserveStateBeforeSubmit} />;
  };
}

// Hook to use in functional components that need form state preservation
export function useFormSubmitHandler() {
  const { preserveStateBeforeSubmit } = useFormStatePreservation();
  
  const handleSubmit = (callback: (e: React.FormEvent) => Promise<void> | void) => {
    return async (e: React.FormEvent) => {
      preserveStateBeforeSubmit();
      await callback(e);
    };
  };
  
  return { handleSubmit };
}
