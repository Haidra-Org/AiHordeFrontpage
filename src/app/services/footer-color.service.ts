import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FooterColorService {
  public readonly dark = new BehaviorSubject<boolean>(true); // Default to true for dark mode

  // You can add methods to update or retrieve the value
  setDarkMode(isDark: boolean): void {
    this.dark.next(isDark);
  }

  getDarkMode(): boolean {
    return this.dark.value;
  }
}