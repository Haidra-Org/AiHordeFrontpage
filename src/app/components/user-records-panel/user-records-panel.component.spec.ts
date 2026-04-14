import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import {
  UserRecordsPanelComponent,
  UserRecordsInput,
} from './user-records-panel.component';
import { UnitConversionService } from '../../services/unit-conversion.service';

const MOCK_UNIT = {
  primary: { formatted: '1.23 MP', value: 1.23, unit: 'MP' },
  technical: { formatted: '1,230,000 px', value: 1230000, unit: 'px' },
  rawValue: 1230000,
  explanationKeys: [],
};

function createComponent(data: UserRecordsInput = {}) {
  const mockUnits = {
    formatTotalPixelsteps: vi.fn().mockReturnValue(MOCK_UNIT),
    formatTotalTokens: vi.fn().mockReturnValue(MOCK_UNIT),
  };

  @Component({
    imports: [UserRecordsPanelComponent],
    template: `<app-user-records-panel [data]="data()" />`,
  })
  class Host {
    data = input<UserRecordsInput>(data);
  }

  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: {},
        translocoConfig: { defaultLang: 'en' },
      }),
    ],
    providers: [{ provide: UnitConversionService, useValue: mockUnits }],
  });

  const fixture: ComponentFixture<Host> = TestBed.createComponent(Host);
  fixture.detectChanges();

  const comp = fixture.debugElement.children[0]
    .componentInstance as UserRecordsPanelComponent;
  return { fixture, comp, mockUnits };
}

describe('UserRecordsPanelComponent', () => {
  describe('usageMegapixelsteps', () => {
    it('returns null when records.usage undefined', () => {
      const { comp } = createComponent({});
      expect(comp.usageMegapixelsteps()).toBeNull();
    });

    it('converts megapixelsteps to raw pixelsteps and formats', () => {
      const { comp, mockUnits } = createComponent({
        records: { usage: { megapixelsteps: 5 } },
      });
      expect(comp.usageMegapixelsteps()).toEqual(MOCK_UNIT);
      expect(mockUnits.formatTotalPixelsteps).toHaveBeenCalledWith(5_000_000);
    });
  });

  describe('usageTokens', () => {
    it('returns null when records.usage.tokens undefined', () => {
      const { comp } = createComponent({});
      expect(comp.usageTokens()).toBeNull();
    });

    it('delegates to formatTotalTokens', () => {
      const { comp, mockUnits } = createComponent({
        records: { usage: { tokens: 1000 } },
      });
      expect(comp.usageTokens()).toEqual(MOCK_UNIT);
      expect(mockUnits.formatTotalTokens).toHaveBeenCalledWith(1000);
    });
  });

  describe('contributionMegapixelsteps', () => {
    it('returns null without contribution data', () => {
      const { comp } = createComponent({});
      expect(comp.contributionMegapixelsteps()).toBeNull();
    });

    it('formats contribution megapixelsteps', () => {
      const { comp, mockUnits } = createComponent({
        records: { contribution: { megapixelsteps: 2 } },
      });
      expect(comp.contributionMegapixelsteps()).toEqual(MOCK_UNIT);
      expect(mockUnits.formatTotalPixelsteps).toHaveBeenCalledWith(2_000_000);
    });
  });

  describe('contributionTokens', () => {
    it('returns null without contribution tokens', () => {
      const { comp } = createComponent({});
      expect(comp.contributionTokens()).toBeNull();
    });

    it('formats contribution tokens', () => {
      const { comp, mockUnits } = createComponent({
        records: { contribution: { tokens: 500 } },
      });
      expect(comp.contributionTokens()).toEqual(MOCK_UNIT);
      expect(mockUnits.formatTotalTokens).toHaveBeenCalledWith(500);
    });
  });
});
