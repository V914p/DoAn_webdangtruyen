import { useEffect, useState } from 'react';

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export function Meteors({
  number = 44,
  minDelay = 0,
  maxDelay = 0.9,
  minDuration = 3.2,
  maxDuration = 5.4,
  angle = 215,
  className = ''
}) {
  const [meteorStyles, setMeteorStyles] = useState([]);

  useEffect(() => {
    const createMeteorStyles = () => {
      const viewportWidth = window.innerWidth;
      const styles = Array.from({ length: number }, () => {
        const particleSize = (Math.random() * 1.1 + 1.15).toFixed(2);
        const tailLength = Math.floor(Math.random() * 85 + 110);
        const startTop = Math.floor(Math.random() * 62) - 12;
        const startLeft = Math.floor(Math.random() * (viewportWidth + 320)) - 80;

        return {
          '--angle': `${angle}deg`,
          '--meteor-size': `${particleSize}px`,
          '--meteor-tail': `${tailLength}px`,
          '--meteor-opacity': (Math.random() * 0.22 + 0.78).toFixed(2),
          top: `${startTop}%`,
          left: `${startLeft}px`,
          animationDelay: `${(Math.random() * (maxDelay - minDelay) + minDelay).toFixed(2)}s`,
          animationDuration: `${(Math.random() * (maxDuration - minDuration) + minDuration).toFixed(2)}s`
        };
      });

      setMeteorStyles(styles);
    };

    createMeteorStyles();
    window.addEventListener('resize', createMeteorStyles);

    return () => {
      window.removeEventListener('resize', createMeteorStyles);
    };
  }, [angle, maxDelay, maxDuration, minDelay, minDuration, number]);

  return meteorStyles.map((style, index) => (
    <span
      key={`meteor-${index}`}
      style={style}
      className={joinClasses(
        'animate-meteor meteor-particle pointer-events-none absolute rounded-full',
        className
      )}
    >
      <span className="meteor-trail pointer-events-none absolute top-1/2 -translate-y-1/2" />
    </span>
  ));
}