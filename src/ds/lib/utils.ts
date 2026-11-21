import { clsx, type ClassValue } from 'clsx';

/** shadcn's `cn`: joins class names, dropping falsy ones. The system styles with token CSS, not Tailwind utilities, so no merge step is needed. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
