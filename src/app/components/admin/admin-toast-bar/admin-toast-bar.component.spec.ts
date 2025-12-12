import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import {
  AdminToastBarComponent,
  AdminToast,
} from './admin-toast-bar.component';

// Test host component to pass inputs
@Component({
  template: `
    <app-admin-toast-bar
      [toasts]="toasts()"
      [showDismiss]="showDismiss()"
      (dismiss)="onDismiss($event)"
    />
  `,
  imports: [AdminToastBarComponent],
})
class TestHostComponent {
  toasts = signal<AdminToast[]>([]);
  showDismiss = signal(true);
  dismissedIds: string[] = [];

  onDismiss(id: string): void {
    this.dismissedIds.push(id);
  }
}

describe('AdminToastBarComponent', () => {
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

  it('should not render anything when toasts array is empty', () => {
    host.toasts.set([]);
    fixture.detectChanges();

    const toastElements = fixture.nativeElement.querySelectorAll(
      '[role="alert"], [role="status"]',
    );
    expect(toastElements.length).toBe(0);
  });

  it('should render success toast with correct styling', () => {
    host.toasts.set([{ id: '1', type: 'success', message: 'Success!' }]);
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.toast-success');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Success!');
  });

  it('should render error toast with correct styling', () => {
    host.toasts.set([{ id: '2', type: 'error', message: 'Error!' }]);
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.toast-error');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Error!');
  });

  it('should render warning toast with correct styling', () => {
    host.toasts.set([{ id: '3', type: 'warning', message: 'Warning!' }]);
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.toast-warning');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Warning!');
  });

  it('should render multiple toasts', () => {
    host.toasts.set([
      { id: '1', type: 'success', message: 'Success!' },
      { id: '2', type: 'error', message: 'Error!' },
      { id: '3', type: 'warning', message: 'Warning!' },
    ]);
    fixture.detectChanges();

    const toasts = fixture.nativeElement.querySelectorAll('.toast-container > div');
    expect(toasts.length).toBe(3);
  });

  it('should emit dismiss event when dismiss button is clicked', () => {
    host.toasts.set([{ id: 'test-id', type: 'error', message: 'Dismissable' }]);
    fixture.detectChanges();

    const dismissButton = fixture.nativeElement.querySelector(
      'button[aria-label="Dismiss"]',
    );
    dismissButton.click();
    fixture.detectChanges();

    expect(host.dismissedIds).toContain('test-id');
  });

  it('should hide dismiss button when showDismiss is false', () => {
    host.toasts.set([{ id: '1', type: 'success', message: 'No dismiss' }]);
    host.showDismiss.set(false);
    fixture.detectChanges();

    const dismissButton = fixture.nativeElement.querySelector(
      'button[aria-label="Dismiss"]',
    );
    expect(dismissButton).toBeNull();
  });

  it('should have appropriate ARIA attributes for accessibility', () => {
    host.toasts.set([
      { id: '1', type: 'success', message: 'Status' },
      { id: '2', type: 'error', message: 'Alert' },
    ]);
    fixture.detectChanges();

    const statusToast = fixture.nativeElement.querySelector('[role="status"]');
    const alertToast = fixture.nativeElement.querySelector('[role="alert"]');

    expect(statusToast).not.toBeNull();
    expect(alertToast).not.toBeNull();
  });
});
