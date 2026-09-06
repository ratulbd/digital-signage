import { useEffect, useState } from 'react';

interface IconProps {
  name: string;
  className?: string;
}

/**
 * Centralized Icon Component with FOUT (Flash of Unstyled Text) Protection
 * 
 * This component prevents icon font names from appearing as text before
 * the Material Symbols font loads. It uses CSS visibility control and
 * fade-in transitions for a smooth experience.
 */
export function Icon({ name, className = '' }: IconProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if font is already loaded
    if (document.documentElement.classList.contains('material-symbols-loaded')) {
      setIsLoaded(true);
      return;
    }

    // Use Font Loading API if available
    if (document.fonts) {
      document.fonts.load('12px "Material Symbols Outlined"').then(() => {
        setIsLoaded(true);
      }).catch(() => {
        // Fallback: show icon anyway
        setIsLoaded(true);
      });
    } else {
      // Fallback for older browsers
      setTimeout(() => setIsLoaded(true), 300);
    }

    // Also listen for the class being added to HTML element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const html = mutation.target as HTMLElement;
          if (html.classList.contains('material-symbols-loaded')) {
            setIsLoaded(true);
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  return (
    <span 
      className={`material-symbols-outlined ${className} ${isLoaded ? 'icon-loaded' : 'icon-loading'}`}
      style={{
        opacity: isLoaded ? 1 : 0,
        visibility: isLoaded ? 'visible' : 'hidden',
        transition: 'opacity 0.15s ease, visibility 0.15s ease',
      }}
    >
      {name}
    </span>
  );
}

export default Icon;
