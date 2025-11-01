import { Component, input } from '@angular/core';

@Component({
  selector: 'app-tool-card',
  standalone: true,
  templateUrl: './tool-card.component.html',
  styleUrl: './tool-card.component.css',
})
export class ToolCardComponent {
  public name = input.required<string>();
  public link = input.required<string>();
  public description = input.required<string>();

  public darkBackground = input(false);
}
