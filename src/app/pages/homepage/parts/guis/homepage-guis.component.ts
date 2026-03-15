import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { BeginnerHeaderComponent } from '../../../../components/beginner-header/beginner-header.component';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-homepage-guis',
  standalone: true,
  imports: [TranslocoModule, BeginnerHeaderComponent, ScrollRevealDirective],
  templateUrl: './homepage-guis.component.html',
  styleUrl: './homepage-guis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageGuisComponent {}
