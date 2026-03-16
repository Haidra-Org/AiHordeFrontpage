import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';
import { IconRegistryService } from '../../services/icon-registry.service';

describe('IconComponent', () => {
  let fixture: ComponentFixture<IconComponent>;
  let component: IconComponent;
  let registry: IconRegistryService;

  const testSvgContent =
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();

    registry = TestBed.inject(IconRegistryService);
    registry.register('x-mark', testSvgContent);

    fixture = TestBed.createComponent(IconComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render an SVG element', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should set the default viewBox to 0 0 24 24', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('should use a custom viewBox when provided', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.componentRef.setInput('viewBox', '0 0 20 20');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 20');
  });

  it('should render the SVG path content', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    const path = fixture.nativeElement.querySelector('svg path');
    expect(path).toBeTruthy();
    expect(path.getAttribute('d')).toBe('M6 18L18 6M6 6l12 12');
  });

  it('should set aria-hidden when no ariaLabel is provided', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.getAttribute('aria-label')).toBeNull();
    expect(fixture.nativeElement.getAttribute('role')).toBeNull();
  });

  it('should set aria-label and role when ariaLabel is provided', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.componentRef.setInput('ariaLabel', 'Close');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBeNull();
    expect(fixture.nativeElement.getAttribute('aria-label')).toBe('Close');
    expect(fixture.nativeElement.getAttribute('role')).toBe('img');
  });

  it('should have the icon host class', () => {
    fixture.componentRef.setInput('name', 'x-mark');
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('icon')).toBeTrue();
  });

  it('should warn and render nothing for an unknown icon', () => {
    spyOn(console, 'warn');
    fixture.componentRef.setInput('name', 'does-not-exist');
    fixture.detectChanges();
    expect(console.warn).toHaveBeenCalledWith(
      '[IconComponent] Unknown icon: "does-not-exist"',
    );
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.innerHTML).toBe('');
  });
});
