import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal, Component } from '@angular/core';
import { NeedWorkersNotifierService } from './need-workers-notifier.service';
import { NavNotificationService } from './nav-notification.service';
import { NetworkStatusService } from './network-status.service';

/**
 * Minimal stub that exposes writable signals so tests can drive
 * NeedWorkersNotifierService without HTTP calls.
 */
class MockNetworkStatusService {
  imageNeedsHelp = signal(false);
  textNeedsHelp = signal(false);
  alchemyNeedsHelp = signal(false);
  anyNeedsHelp = signal(false);
}

/**
 * A trivial host component. Angular's `afterNextRender` only fires
 * during an actual component render, so we need a component to
 * trigger it.
 */
@Component({ template: '' })
class TestHostComponent {
  // just inject the service so it's instantiated during component creation
  readonly notifier = TestBed.inject(NeedWorkersNotifierService);
}

describe('NeedWorkersNotifierService', () => {
  let navService: NavNotificationService;
  let networkMock: MockNetworkStatusService;

  beforeEach(() => {
    localStorage.clear();
    networkMock = new MockNetworkStatusService();

    TestBed.configureTestingModule({
      declarations: [],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: NetworkStatusService, useValue: networkMock },
        NavNotificationService,
        NeedWorkersNotifierService,
      ],
    });

    navService = TestBed.inject(NavNotificationService);
  });

  afterEach(() => localStorage.clear());

  /**
   * Helper: creates and detects-changes on the host component,
   * which causes `afterNextRender` (and the `effect` inside it)
   * to run.
   */
  function renderHost(): void {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    // Trigger change detection again so the effect can react
    fixture.detectChanges();
  }

  // ===================================================================
  // Effect fires and creates notification
  // ===================================================================

  it('should add a notification when any type needs help', () => {
    networkMock.imageNeedsHelp.set(true);
    renderHost();

    const active = navService.activeNotifications();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe('need_workers');
    expect(active[0].navItem).toBe('contribute');
  });

  it('should NOT add a notification when nothing needs help', () => {
    renderHost();
    expect(navService.activeNotifications().length).toBe(0);
  });

  // ===================================================================
  // Correct type list
  // ===================================================================

  it('should include only the types that need help in stateHash', () => {
    networkMock.imageNeedsHelp.set(true);
    networkMock.alchemyNeedsHelp.set(true);
    renderHost();

    const n = navService.activeNotifications()[0];
    expect(n.stateHash).toBe('image,alchemy');
  });

  it('should format a single type without conjunction', () => {
    networkMock.textNeedsHelp.set(true);
    renderHost();

    const n = navService.activeNotifications()[0];
    expect(n.messageParams!['types']).toBe('text');
  });

  it('should join two types with "and"', () => {
    networkMock.imageNeedsHelp.set(true);
    networkMock.textNeedsHelp.set(true);
    renderHost();

    const n = navService.activeNotifications()[0];
    expect(n.messageParams!['types']).toBe('image and text');
  });

  it('should join three types with commas and "and"', () => {
    networkMock.imageNeedsHelp.set(true);
    networkMock.textNeedsHelp.set(true);
    networkMock.alchemyNeedsHelp.set(true);
    renderHost();

    const n = navService.activeNotifications()[0];
    expect(n.messageParams!['types']).toBe('image, text and alchemy');
  });

  // ===================================================================
  // Removal when condition clears
  // ===================================================================

  it('should remove the notification when no type needs help any more', () => {
    networkMock.imageNeedsHelp.set(true);
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(navService.activeNotifications().length).toBe(1);

    networkMock.imageNeedsHelp.set(false);
    fixture.detectChanges();
    expect(navService.activeNotifications().length).toBe(0);
  });

  // ===================================================================
  // Injection-context regression (THE BUG)
  // ===================================================================

  it('should actually fire the effect inside afterNextRender (injection context regression)', () => {
    // This test exists because calling `effect()` inside `afterNextRender`
    // without passing `{ injector }` silently does nothing.
    // If the effect doesn't fire, no notification will appear.
    networkMock.imageNeedsHelp.set(true);
    networkMock.textNeedsHelp.set(true);
    networkMock.alchemyNeedsHelp.set(true);
    renderHost();

    const active = navService.activeNotifications();
    expect(active.length)
      .withContext(
        'effect() must fire inside afterNextRender — if this fails, ' +
        'the Injector is likely not being passed to effect()',
      )
      .toBe(1);
    expect(active[0].stateHash).toBe('image,text,alchemy');
  });
});
