import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsToolTabsComponent } from '../../components/gs-tool-tabs/gs-tool-tabs.component';
import { IconComponent } from '../../components/icon/icon.component';
import { FullscreenService } from '../../services/fullscreen.service';

/**
 * The shared `/generate` workspace shell. Hosts the two studio tools, image
 * generation (`/generate/image`) and Alchemy (`/generate/alchemy`), as subtabs
 * of one full-height page, with the tool row above a router outlet. The tools
 * keep their own nav entries (they deep-link straight to each subtab); this
 * shell is what makes them feel like one page rather than two.
 *
 * It is also the element that goes on the whole screen: taking the shell rather
 * than one pane keeps the settings, the results and the tool row together, so
 * everything the reader was using is still there once the site's chrome and the
 * browser's own are gone.
 */
@Component({
  selector: 'app-generate-shell',
  imports: [RouterOutlet, GsToolTabsComponent, IconComponent, TranslocoPipe],
  templateUrl: './generate-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateShellComponent implements AfterViewInit, OnDestroy {
  public readonly fullscreen = inject(FullscreenService);

  private readonly shell = viewChild<ElementRef<HTMLElement>>('shell');

  ngAfterViewInit(): void {
    this.fullscreen.setTarget(this.shell()?.nativeElement ?? null);
  }

  ngOnDestroy(): void {
    this.fullscreen.setTarget(null);
  }
}
