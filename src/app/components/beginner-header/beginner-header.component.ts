import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-beginner-header',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './beginner-header.component.html',
  styleUrl: './beginner-header.component.css',
})
export class BeginnerHeaderComponent {
  /**
   * Whether to show the "View all Frontends" button
   * @default false
   */
  showButton = input<boolean>(false);

  /**
   * Whether to disable card links (e.g., when already on the target page)
   * @default false
   */
  disableLinks = input<boolean>(false);

  /**
   * Whether the section is initially expanded
   * @default true
   */
  initiallyExpanded = input<boolean>(true);
}
