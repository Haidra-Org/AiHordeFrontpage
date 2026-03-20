import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal, WritableSignal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import {
  ItemListSectionComponent,
  DisplayItem,
} from './item-list-section.component';
import { EnumDisplayService } from '../../services/enum-display.service';
import {
  ItemType,
  Domain,
  Platform,
  FunctionKind,
} from '../../types/item-types';

// jsdom does not provide IntersectionObserver — stub it
class FakeIntersectionObserver {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
globalThis.IntersectionObserver =
  FakeIntersectionObserver as unknown as typeof IntersectionObserver;

@Component({
  template: `
    <app-item-list-section
      [items]="items()"
      [sectionName]="sectionName()"
      [title]="title()"
      [expandedRows]="expandedRows()"
      [collapsedSections]="collapsedSections()"
      [viewMode]="viewMode()"
      (rowToggle)="onRowToggle($event)"
      (sectionToggle)="onSectionToggle($event)"
    />
  `,
  imports: [ItemListSectionComponent],
})
class TestHostComponent {
  items = signal<DisplayItem[]>([]);
  sectionName = signal('test-section');
  title = signal('guis_and_tools.section_title');
  expandedRows = signal<WritableSignal<Set<string>>>(signal(new Set()));
  collapsedSections = signal<WritableSignal<Set<string>>>(signal(new Set()));
  viewMode = signal<'table' | 'grid'>('table');
  rowToggleEvents: string[] = [];
  sectionToggleEvents: string[] = [];

  onRowToggle(name: string): void {
    this.rowToggleEvents.push(name);
  }
  onSectionToggle(name: string): void {
    this.sectionToggleEvents.push(name);
  }
}

function makeItem(overrides: Partial<DisplayItem> = {}): DisplayItem {
  return {
    name: 'Test GUI',
    description: 'A test GUI application',
    link: 'https://example.com',
    uniqueId: 'test-gui',
    categories: ['Web'],
    itemType: ItemType.GUI_IMAGE,
    functionKind: FunctionKind.FRONTEND,
    ...overrides,
  };
}

describe('ItemListSectionComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TestHostComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  it('should create the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render nothing when items array is empty', () => {
    host.items.set([]);
    fixture.detectChanges();

    expect(el.querySelector('.table-section-wrapper')).toBeNull();
  });

  it('should render section header when items are provided', () => {
    host.items.set([makeItem()]);
    fixture.detectChanges();

    const header = el.querySelector('h2');
    expect(header).not.toBeNull();
  });

  it('should display the item count', () => {
    host.items.set([
      makeItem({ uniqueId: 'a', name: 'Item A' }),
      makeItem({ uniqueId: 'b', name: 'Item B' }),
    ]);
    fixture.detectChanges();

    const count = el.querySelector('.tools-section-count');
    expect(count?.textContent?.trim()).toBe('2');
  });

  it('should display item names in table view', () => {
    host.items.set([
      makeItem({ uniqueId: 'gui-1', name: 'Lucid Creations' }),
      makeItem({ uniqueId: 'gui-2', name: 'ArtBot' }),
    ]);
    fixture.detectChanges();

    expect(el.textContent).toContain('Lucid Creations');
    expect(el.textContent).toContain('ArtBot');
  });

  it('should display item descriptions', () => {
    host.items.set([makeItem({ description: 'A powerful image generator' })]);
    fixture.detectChanges();

    expect(el.textContent).toContain('A powerful image generator');
  });

  it('should emit rowToggle when a table row is clicked', () => {
    host.items.set([makeItem({ name: 'ClickMe' })]);
    fixture.detectChanges();

    const row = el.querySelector('.item-list-row') as HTMLElement;
    row?.click();
    fixture.detectChanges();

    expect(host.rowToggleEvents).toContain('ClickMe');
  });

  it('should emit sectionToggle when section header is clicked', () => {
    host.items.set([makeItem()]);
    fixture.detectChanges();

    const header = el.querySelector('h2') as HTMLElement;
    header?.click();
    fixture.detectChanges();

    expect(host.sectionToggleEvents).toContain('test-section');
  });

  it('should set aria-expanded on section header', () => {
    host.items.set([makeItem()]);
    fixture.detectChanges();

    const header = el.querySelector('h2');
    expect(header?.getAttribute('aria-expanded')).toBe('true');
  });

  it('should set aria-expanded=false when section is collapsed', () => {
    const collapsed = signal(new Set(['test-section']));
    host.collapsedSections.set(collapsed);
    host.items.set([makeItem()]);
    fixture.detectChanges();

    const header = el.querySelector('h2');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
  });

  it('should hide items when section is collapsed', () => {
    const collapsed = signal(new Set(['test-section']));
    host.collapsedSections.set(collapsed);
    host.items.set([makeItem({ name: 'HiddenItem' })]);
    fixture.detectChanges();

    expect(el.querySelector('.item-list-row')).toBeNull();
  });

  it('should display domain and platform badges', () => {
    TestBed.inject(EnumDisplayService);

    host.items.set([
      makeItem({
        domain: [Domain.IMAGE],
        platform: [Platform.WEB],
      }),
    ]);
    fixture.detectChanges();

    const badges = el.querySelectorAll('.badge-base');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('should render grid view when viewMode is grid', () => {
    host.viewMode.set('grid');
    host.items.set([makeItem()]);
    fixture.detectChanges();

    expect(el.querySelector('.tools-grid')).not.toBeNull();
    expect(el.querySelector('.table-items')).toBeNull();
  });

  it('should render table view when viewMode is table', () => {
    host.viewMode.set('table');
    host.items.set([makeItem()]);
    fixture.detectChanges();

    expect(el.querySelector('.table-items')).not.toBeNull();
    expect(el.querySelector('.tools-grid')).toBeNull();
  });

  it('should show recommended badge for recommended items', () => {
    host.items.set([makeItem({ recommended: true })]);
    fixture.detectChanges();

    const badge = el.querySelector('.badge-recommended');
    expect(badge).not.toBeNull();
  });

  it('should render source control link when provided and row is expanded', () => {
    const expanded = signal(new Set(['TestItem']));
    host.expandedRows.set(expanded);
    host.items.set([
      makeItem({
        name: 'TestItem',
        sourceControlLink: 'https://github.com/test/repo',
      }),
    ]);
    fixture.detectChanges();

    const sourceLink = el.querySelector('.btn-source-control');
    expect(sourceLink).not.toBeNull();
    expect(sourceLink?.textContent).toContain('GitHub');
  });
});
