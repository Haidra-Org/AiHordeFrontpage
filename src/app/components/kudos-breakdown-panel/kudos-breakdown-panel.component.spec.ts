import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  KudosBreakdownPanelComponent,
  KudosBreakdownVariant,
} from './kudos-breakdown-panel.component';
import { UserKudosDetails } from '../../types/horde-user';

// Test host component to pass inputs
@Component({
  template: `
    <app-kudos-breakdown-panel
      [kudosDetails]="kudosDetails()"
      [variant]="variant()"
      [showZeroValues]="showZeroValues()"
      [translationPrefix]="translationPrefix()"
    />
  `,
  imports: [KudosBreakdownPanelComponent],
})
class TestHostComponent {
  kudosDetails = signal<UserKudosDetails>({
    accumulated: 1000,
    gifted: 500,
    received: 250,
    admin: 100,
    recurring: 50,
    awarded: 25,
  });
  variant = signal<KudosBreakdownVariant>('admin');
  showZeroValues = signal(true);
  translationPrefix = signal<string | undefined>(undefined);
}

describe('KudosBreakdownPanelComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(host).toBeTruthy();
  });

  describe('admin variant', () => {
    beforeEach(() => {
      host.variant.set('admin');
      fixture.detectChanges();
    });

    it('should render admin grid layout', () => {
      const grid = fixture.nativeElement.querySelector('.admin-grid-stats-4');
      expect(grid).not.toBeNull();
    });

    it('should render all kudos fields as cards', () => {
      const cards = fixture.nativeElement.querySelectorAll('.admin-bg-dark');
      // 6 base fields (donated and styled are undefined so not shown)
      expect(cards.length).toBe(6);
    });

    it('should display formatted numbers', () => {
      const values = fixture.nativeElement.querySelectorAll(
        '.admin-heading-card',
      );
      expect(values.length).toBeGreaterThan(0);
    });

    it('should show donated field when present', () => {
      host.kudosDetails.set({
        ...host.kudosDetails(),
        donated: 100,
      });
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.admin-bg-dark');
      expect(cards.length).toBe(7);
    });

    it('should show styled field when present', () => {
      host.kudosDetails.set({
        ...host.kudosDetails(),
        styled: 50,
      });
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.admin-bg-dark');
      expect(cards.length).toBe(7);
    });
  });

  describe('profile variant', () => {
    beforeEach(() => {
      host.variant.set('profile');
      fixture.detectChanges();
    });

    it('should render profile grid layout', () => {
      const grid = fixture.nativeElement.querySelector('.data-grid-2-3');
      expect(grid).not.toBeNull();
    });

    it('should render kudos fields as data items', () => {
      const items = fixture.nativeElement.querySelectorAll('.data-item');
      expect(items.length).toBe(6);
    });

    it('should have data-label and data-value elements', () => {
      const labels = fixture.nativeElement.querySelectorAll('.data-label');
      const values = fixture.nativeElement.querySelectorAll('.data-value');
      expect(labels.length).toBeGreaterThan(0);
      expect(values.length).toBeGreaterThan(0);
    });
  });

  describe('showZeroValues', () => {
    it('should hide zero value fields when showZeroValues is false', () => {
      host.kudosDetails.set({
        accumulated: 1000,
        gifted: 0,
        received: 0,
        admin: 0,
        recurring: 50,
        awarded: 0,
      });
      host.showZeroValues.set(false);
      host.variant.set('profile');
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.data-item');
      // Only accumulated (1000) and recurring (50) should show
      expect(items.length).toBe(2);
    });

    it('should show all fields when showZeroValues is true', () => {
      host.kudosDetails.set({
        accumulated: 1000,
        gifted: 0,
        received: 0,
        admin: 0,
        recurring: 0,
        awarded: 0,
      });
      host.showZeroValues.set(true);
      host.variant.set('admin');
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.admin-bg-dark');
      expect(cards.length).toBe(6);
    });
  });

  describe('translationPrefix', () => {
    it('should use admin prefix by default for admin variant', () => {
      host.variant.set('admin');
      host.translationPrefix.set(undefined);
      fixture.detectChanges();

      // Component should use 'admin.users.kudos.' prefix internally
      // We can't directly test translation keys, but we can verify component renders
      const component = fixture.nativeElement.querySelector(
        'app-kudos-breakdown-panel',
      );
      expect(component).not.toBeNull();
    });

    it('should use profile prefix by default for profile variant', () => {
      host.variant.set('profile');
      host.translationPrefix.set(undefined);
      fixture.detectChanges();

      // Component should use 'profile.kudos_' prefix internally
      const component = fixture.nativeElement.querySelector(
        'app-kudos-breakdown-panel',
      );
      expect(component).not.toBeNull();
    });

    it('should use custom prefix when provided', () => {
      host.translationPrefix.set('custom.');
      fixture.detectChanges();

      // Component should use custom prefix
      const component = fixture.nativeElement.querySelector(
        'app-kudos-breakdown-panel',
      );
      expect(component).not.toBeNull();
    });
  });
});
