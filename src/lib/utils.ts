import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for merging Tailwind CSS classes with proper precedence.
 * Uses clsx for conditional class composition and tailwind-merge for
 * deduplication/override resolution.
 *
 * @example cn("px-4 py-2", isActive && "bg-primary", className)
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
