import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AdminDialogComponent } from './admin-dialog.component';

// Test host component to pass inputs
@Component({
  template: `
    <app-admin-dialog
      [open]="open()"
      [title]="title()"
      [confirmLabel]="confirmLabel()"
      [cancelLabel]="cancelLabel()"
      [loading]="loading()"
      [loadingLabel]="loadingLabel()"
      [variant]="variant()"
      [closeOnBackdrop]="closeOnBackdrop()"
      (confirm)="onConfirm()"
      (cancel)="onCancel()"
    >
      <p>Dialog content</p>
    </app-admin-dialog>
  `,
  imports: [AdminDialogComponent],
})
class TestHostComponent {
  open = signal(false);
  title = signal('Test Dialog');
  confirmLabel = signal('Confirm');
  cancelLabel = signal('Cancel');
  loading = signal(false);
  loadingLabel = signal<string | undefined>(undefined);
  variant = signal<'default' | 'danger'>('default');
  closeOnBackdrop = signal(true);
  confirmCount = 0;
  cancelCount = 0;

  onConfirm(): void {
    this.confirmCount++;
  }

  onCancel(): void {
    this.cancelCount++;
  }
}

describe('AdminDialogComponent', () => {
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

  it('should not render dialog when closed', () => {
    host.open.set(false);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('should render dialog when open', () => {
    host.open.set(true);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });

  it('should display the title', () => {
    host.open.set(true);
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.admin-heading-card');
    expect(title.textContent).toContain('Test Dialog');
  });

  it('should display custom button labels', () => {
    host.open.set(true);
    host.confirmLabel.set('Submit');
    host.cancelLabel.set('Abort');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].textContent).toContain('Abort');
    expect(buttons[1].textContent).toContain('Submit');
  });

  it('should emit confirm event when confirm button is clicked', () => {
    host.open.set(true);
    fixture.detectChanges();

    const confirmButton = fixture.nativeElement.querySelector('.btn-primary');
    confirmButton.click();
    fixture.detectChanges();

    expect(host.confirmCount).toBe(1);
  });

  it('should emit cancel event when cancel button is clicked', () => {
    host.open.set(true);
    fixture.detectChanges();

    const cancelButton = fixture.nativeElement.querySelector('.btn-muted');
    cancelButton.click();
    fixture.detectChanges();

    expect(host.cancelCount).toBe(1);
  });

  it('should emit cancel event when backdrop is clicked', () => {
    host.open.set(true);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.modal-backdrop');
    backdrop.click();
    fixture.detectChanges();

    expect(host.cancelCount).toBe(1);
  });

  it('should not emit cancel when backdrop clicked and closeOnBackdrop is false', () => {
    host.open.set(true);
    host.closeOnBackdrop.set(false);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.modal-backdrop');
    backdrop.click();
    fixture.detectChanges();

    expect(host.cancelCount).toBe(0);
  });

  it('should disable buttons when loading', () => {
    host.open.set(true);
    host.loading.set(true);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('should show loading spinner when loading', () => {
    host.open.set(true);
    host.loading.set(true);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('should apply btn-danger class when variant is danger', () => {
    host.open.set(true);
    host.variant.set('danger');
    fixture.detectChanges();

    const confirmButton = fixture.nativeElement.querySelector('.btn-primary');
    expect(confirmButton.classList).toContain('btn-danger');
  });

  it('should have aria-modal attribute for accessibility', () => {
    host.open.set(true);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('should project content inside dialog', () => {
    host.open.set(true);
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector('.dialog-content p');
    expect(content.textContent).toContain('Dialog content');
  });

  it('should close on Escape key', fakeAsync(() => {
    host.open.set(true);
    fixture.detectChanges();
    tick();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(host.cancelCount).toBe(1);
  }));

  it('should not close on Escape when loading', fakeAsync(() => {
    host.open.set(true);
    host.loading.set(true);
    fixture.detectChanges();
    tick();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(host.cancelCount).toBe(0);
  }));
});
