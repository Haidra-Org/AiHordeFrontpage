import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UptimeSparklineComponent } from './uptime-sparkline.component';
import { PublicHistoryDay } from '../../types/status';

function day(operational: number, down = 0): PublicHistoryDay {
  return {
    date: '2026-09-01',
    status_level: down > 0 ? 2 : 0,
    operational_seconds: operational,
    degraded_seconds: 0,
    down_seconds: down,
    maintenance_seconds: 0,
    unknown_seconds: 0,
  };
}

@Component({
  imports: [UptimeSparklineComponent],
  template: `<app-uptime-sparkline [days]="days()" [tone]="tone()" />`,
})
class HostComponent {
  public readonly days = signal<readonly PublicHistoryDay[]>([]);
  public readonly tone = signal('operational');
}

describe('UptimeSparklineComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  const find = (selector: string): Element | null =>
    (fixture.nativeElement as HTMLElement).querySelector(selector);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('draws nothing until there is a line to draw', () => {
    expect(find('.status-sparkline')).toBeNull();

    fixture.componentInstance.days.set([day(86400)]);
    fixture.detectChanges();
    expect(find('.status-sparkline')).toBeNull();
  });

  it('charts the trailing days and takes the service tone', () => {
    fixture.componentInstance.days.set([
      day(86400),
      day(43200, 43200),
      day(86400),
    ]);
    fixture.componentInstance.tone.set('degraded');
    fixture.detectChanges();

    const line = find('.status-sparkline__line')!;
    expect(line.getAttribute('points')!.split(' ')).toHaveLength(3);
    // The dip is the middle day, which is drawn lower than its neighbours.
    const ys = line
      .getAttribute('points')!
      .split(' ')
      .map((point) => Number(point.split(',')[1]));
    expect(ys[1]).toBeGreaterThan(ys[0]);
    expect(find('.status-sparkline')!.classList).toContain(
      'status-sparkline--degraded',
    );
    expect(find('.status-sparkline__area')!.getAttribute('points')).toContain(
      '0,28',
    );
  });
});
