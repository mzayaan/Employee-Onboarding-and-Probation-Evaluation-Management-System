import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names safely, resolving conflicts.
 * Used by all shadcn/ui components.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
