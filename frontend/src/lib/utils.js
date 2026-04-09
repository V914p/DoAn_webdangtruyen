export function cn(...inputs) {
  return inputs
    .flatMap((input) => {
      if (!input) {
        return [];
      }

      if (Array.isArray(input)) {
        return input;
      }

      return [input];
    })
    .filter(Boolean)
    .join(' ');
}