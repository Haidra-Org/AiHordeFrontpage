import { Injectable, Signal, signal } from '@angular/core';

export interface FloatingAction {
  id: string;
  labelKey: string;
  cssClass: string;
  disabled: Signal<boolean>;
  visible: Signal<boolean>;
  action: () => void;
}

@Injectable({ providedIn: 'root' })
export class FloatingActionService {
  private readonly _actions = signal<FloatingAction[]>([]);
  public readonly actions = this._actions.asReadonly();

  register(action: FloatingAction): void {
    this._actions.update((list) => [...list, action]);
  }

  unregister(id: string): void {
    this._actions.update((list) => list.filter((a) => a.id !== id));
  }
}
