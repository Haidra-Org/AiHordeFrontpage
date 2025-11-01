import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FooterColorService {
  // Signal-based reactive state (default to true for dark mode)
  public readonly dark = signal<boolean>(true);

  // Update dark mode state
  setDarkMode(isDark: boolean): void {
    this.dark.set(isDark);
  }
}