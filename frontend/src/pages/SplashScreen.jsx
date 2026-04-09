import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HyperText } from '../components/HyperText';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for any click or keypress
    const handleInteraction = () => {
      navigate('/login');
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-black flex items-center justify-center cursor-pointer">
      <div className="text-center">
        <HyperText
          as="h1"
          className="text-6xl md:text-8xl font-bold text-white mb-8"
          duration={1500}
          delay={300}
          animateOnHover={false}
        >
          The Index
        </HyperText>
        
        <p className="text-white text-lg md:text-xl opacity-70 animate-pulse mt-8">
          Click anywhere or press any key to continue
        </p>
      </div>
    </div>
  );
}
