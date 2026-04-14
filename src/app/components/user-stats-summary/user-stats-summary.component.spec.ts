import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  UserStatsSummaryComponent,
  UserStatsInput,
} from './user-stats-summary.component';

/**
 * Helper wrapper: feeds `user` input into the component under test.
 * We test the computed signal logic rather than rendering.
 */
function createComponent(data: UserStatsInput = {}, loading = false) {
  @Component({
    imports: [UserStatsSummaryComponent],
    template: `<app-user-stats-summary
      [user]="user()"
      [loading]="loading()"
      [gridLayout]="layout()"
    />`,
  })
  class Host {
    user = input<UserStatsInput>(data);
    loading = input(loading);
    layout = input<'compact' | 'wide'>('compact');
  }

  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: {},
        translocoConfig: { defaultLang: 'en' },
      }),
    ],
  });

  const fixture: ComponentFixture<Host> = TestBed.createComponent(Host);
  fixture.detectChanges();

  const stats = fixture.debugElement.children[0]
    .componentInstance as UserStatsSummaryComponent;
  return { fixture, stats };
}

describe('UserStatsSummaryComponent', () => {
  describe('gridClass', () => {
    it('returns compact grid by default', () => {
      const { stats } = createComponent();
      expect(stats.gridClass()).toBe('data-grid-1-2');
    });
  });

  describe('imagesRequested', () => {
    it('prefers records.request.image when available', () => {
      const { stats } = createComponent({
        records: { request: { image: 42 } },
        usage: { requests: 99 },
      });
      expect(stats.imagesRequested()).toBe(42);
    });

    it('falls back to usage.requests when records missing', () => {
      const { stats } = createComponent({
        usage: { requests: 99 },
      });
      expect(stats.imagesRequested()).toBe(99);
    });

    it('returns null when neither source has data', () => {
      const { stats } = createComponent({});
      expect(stats.imagesRequested()).toBeNull();
    });
  });

  describe('textRequests', () => {
    it('reads from records.request.text', () => {
      const { stats } = createComponent({
        records: { request: { text: 10 } },
      });
      expect(stats.textRequests()).toBe(10);
    });

    it('returns null when no text request records', () => {
      const { stats } = createComponent({});
      expect(stats.textRequests()).toBeNull();
    });
  });

  describe('megapixelstepsGenerated', () => {
    it('prefers records.contribution.megapixelsteps', () => {
      const { stats } = createComponent({
        records: { contribution: { megapixelsteps: 500 } },
        contributions: { megapixelsteps: 300 },
      });
      expect(stats.megapixelstepsGenerated()).toBe(500);
    });

    it('falls back to contributions.megapixelsteps', () => {
      const { stats } = createComponent({
        contributions: { megapixelsteps: 300 },
      });
      expect(stats.megapixelstepsGenerated()).toBe(300);
    });

    it('returns null when no data', () => {
      const { stats } = createComponent({});
      expect(stats.megapixelstepsGenerated()).toBeNull();
    });
  });

  describe('tokensGenerated', () => {
    it('reads from records.contribution.tokens', () => {
      const { stats } = createComponent({
        records: { contribution: { tokens: 1000 } },
      });
      expect(stats.tokensGenerated()).toBe(1000);
    });

    it('returns null without contribution tokens', () => {
      const { stats } = createComponent({});
      expect(stats.tokensGenerated()).toBeNull();
    });
  });

  describe('fulfillments', () => {
    it('sums image, text, and interrogation from records', () => {
      const { stats } = createComponent({
        records: { fulfillment: { image: 10, text: 5, interrogation: 3 } },
      });
      expect(stats.fulfillments()).toBe(18);
    });

    it('coalesces undefined fields to 0 when at least one is present', () => {
      const { stats } = createComponent({
        records: { fulfillment: { image: 7 } },
      });
      // text and interrogation are undefined → treated as 0
      expect(stats.fulfillments()).toBe(7);
    });

    it('falls back to contributions.fulfillments', () => {
      const { stats } = createComponent({
        contributions: { fulfillments: 42 },
      });
      expect(stats.fulfillments()).toBe(42);
    });

    it('returns null when no fulfillment data', () => {
      const { stats } = createComponent({});
      expect(stats.fulfillments()).toBeNull();
    });
  });

  describe('hasData', () => {
    it('returns false for empty input', () => {
      const { stats } = createComponent({});
      expect(stats.hasData()).toBe(false);
    });

    it('returns true when any stat is available', () => {
      const { stats } = createComponent({
        usage: { requests: 1 },
      });
      expect(stats.hasData()).toBe(true);
    });
  });
});
