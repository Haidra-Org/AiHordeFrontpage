import { Pipe, PipeTransform } from '@angular/core';
import { EnumDisplayService } from '../services/enum-display.service';

/**
 * Pipe for capitalizing the first letter of a string in templates.
 * Provides a simple way to capitalize only the first letter while preserving
 * the rest of the string, replacing scattered charAt(0).toUpperCase() logic.
 *
 * Following Angular best practices:
 * - Standalone pipe for easy reusability
 * - Pure pipe for optimal performance (default)
 * - Leverages EnumDisplayService utilities
 * - Clear, descriptive naming
 *
 * @note For other string transformations, use Angular's built-in pipes:
 * - Uppercase all letters: {{ value | uppercase }}
 * - Lowercase all letters: {{ value | lowercase }}
 * - Title Case (all words): {{ value | titlecase }}
 *
 * This pipe provides unique functionality that Angular doesn't offer:
 * capitalizing only the first letter of a string.
 *
 * @example
 * // Capitalize first letter only
 * {{ 'hello world' | capitalize }}
 * // Output: "Hello world"
 */
@Pipe({
  name: 'capitalize',
  standalone: true,
})
export class CapitalizePipe implements PipeTransform {
  constructor(private enumDisplayService: EnumDisplayService) {}

  /**
   * Transform string by capitalizing the first letter only
   *
   * @param value - The string to transform
   * @returns String with first letter capitalized
   */
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return this.enumDisplayService.capitalizeFirst(String(value));
  }
}
