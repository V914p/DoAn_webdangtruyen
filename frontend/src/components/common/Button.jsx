export function Button({ children, className = '', variant = 'primary', ...props }) {
  const baseClasses = 'inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition';
  
  const variantClasses = {
    primary: 'bg-brand text-white hover:bg-brand-light',
    secondary: 'btn-secondary',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-400',
    ghost: 'text-slate-300 hover:bg-slate-800/70 hover:text-white',
  };

  const disabledClasses = props.disabled ? 'cursor-not-allowed opacity-60' : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
