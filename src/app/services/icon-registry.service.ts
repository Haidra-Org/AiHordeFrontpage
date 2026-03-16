import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IconRegistryService {
  private readonly icons = new Map<string, string>();

  register(name: string, svgContent: string): void {
    this.icons.set(name, svgContent);
  }

  registerAll(icons: Record<string, string>): void {
    for (const [name, svg] of Object.entries(icons)) {
      this.icons.set(name, svg);
    }
  }

  get(name: string): string | undefined {
    return this.icons.get(name);
  }

  has(name: string): boolean {
    return this.icons.has(name);
  }
}
