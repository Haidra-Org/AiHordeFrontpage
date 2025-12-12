import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ExpandableSectionComponent } from './expandable-section.component';

// Test host component to pass inputs
@Component({
  template: `
    <app-expandable-section
      [title]="title()"
      [expanded]="expanded()"
      [count]="count()"
      [noPaddingTop]="noPaddingTop()"
      (toggle)="onToggle()"
    >
      <p>Test content</p>
    </app-expandable-section>
  `,
  imports: [ExpandableSectionComponent],
})
class TestHostComponent {
  title = signal('Test Section');
  expanded = signal(false);
  count = signal<number | undefined>(undefined);
  noPaddingTop = signal(false);
  toggleCount = 0;

  onToggle(): void {
    this.toggleCount++;
  }
}

describe('ExpandableSectionComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(host).toBeTruthy();
  });

  it('should display the title', () => {
    const titleEl = fixture.nativeElement.querySelector('.admin-text-light');
    expect(titleEl.textContent).toContain('Test Section');
  });

  it('should not show content when collapsed', () => {
    host.expanded.set(false);
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector('p');
    expect(content).toBeNull();
  });

  it('should show content when expanded', () => {
    host.expanded.set(true);
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector('p');
    expect(content).not.toBeNull();
    expect(content.textContent).toContain('Test content');
  });

  it('should emit toggle event when header is clicked', () => {
    const button = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    expect(host.toggleCount).toBe(1);
  });

  it('should display count when provided', () => {
    host.count.set(5);
    fixture.detectChanges();

    const countEl = fixture.nativeElement.querySelector(
      '.admin-text-muted.text-sm',
    );
    expect(countEl.textContent).toContain('(5)');
  });

  it('should not display count when undefined', () => {
    host.count.set(undefined);
    fixture.detectChanges();

    const countEl = fixture.nativeElement.querySelector(
      '.admin-text-muted.text-sm',
    );
    expect(countEl).toBeNull();
  });

  it('should add expanded class to icon when expanded', () => {
    host.expanded.set(true);
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('.expandable-icon');
    expect(icon.classList).toContain('expanded');
  });

  it('should apply pt-0 class when noPaddingTop is true', () => {
    host.expanded.set(true);
    host.noPaddingTop.set(true);
    fixture.detectChanges();

    const contentDiv = fixture.nativeElement.querySelector('.p-4');
    expect(contentDiv.classList).toContain('pt-0');
  });
});
