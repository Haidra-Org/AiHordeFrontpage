import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StylesListComponent } from './styles-list.component';
import { StyleService } from '../../../services/style.service';
import { AuthService } from '../../../services/auth.service';
import { ImageStyle } from '../../../types/style';

/** How many styles one page of the horde's list carries. */
const PAGE_SIZE = 25;

const style = (id: string): ImageStyle =>
  ({
    id,
    name: `style-${id}`,
    creator: 'someone',
  }) as unknown as ImageStyle;

/** A page of `count` styles, numbered from `from`. */
const page = (from: number, count: number): ImageStyle[] =>
  Array.from({ length: count }, (_, index) => style(String(from + index)));

describe('StylesListComponent', () => {
  let fixture: ComponentFixture<StylesListComponent>;
  let component: StylesListComponent;
  let getImageStyles: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getImageStyles = vi.fn();
    await TestBed.configureTestingModule({
      imports: [
        StylesListComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({}) } },
        {
          provide: Router,
          useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: StyleService,
          useValue: {
            getImageStyles,
            getTextStyles: vi.fn().mockReturnValue(of([])),
            getCollections: vi.fn().mockReturnValue(of([])),
          },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal(null),
            isLoggedIn: signal(false),
            isInitialized: signal(true),
          },
        },
      ],
    })
      .overrideComponent(StylesListComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(StylesListComponent);
    component = fixture.componentInstance;
  });

  it('keeps asking for pages until a short one ends the list', () => {
    getImageStyles.mockImplementation(({ page: requested }: { page: number }) =>
      of(
        requested === 3
          ? page(51, 4)
          : page((requested - 1) * PAGE_SIZE + 1, PAGE_SIZE),
      ),
    );

    component.loadStyles();

    expect(getImageStyles).toHaveBeenCalledTimes(3);
    expect(component.imageStyles().length).toBe(PAGE_SIZE * 2 + 4);
    expect(component.loading()).toBe(false);
  });

  it('stops when a page repeats what is already held', () => {
    getImageStyles.mockImplementation(() => of(page(1, PAGE_SIZE)));

    component.loadStyles();

    expect(getImageStyles).toHaveBeenCalledTimes(2);
    expect(component.imageStyles().length).toBe(PAGE_SIZE);
  });

  it('searches the whole fetched list, not just its first page', () => {
    getImageStyles.mockImplementation(({ page: requested }: { page: number }) =>
      of(
        requested === 1
          ? page(1, PAGE_SIZE)
          : [style('needle'), ...page(26, 4)].slice(0, 5),
      ),
    );

    component.loadStyles();
    component.onClientFiltersChange({
      searchQuery: 'style-needle',
      hideNsfw: false,
    });

    expect(component.filteredStyles().map((entry) => entry.id)).toEqual([
      'needle',
    ]);
  });
});
