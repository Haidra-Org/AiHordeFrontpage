import { Component } from '@angular/core';
import {TranslocoPipe, TranslocoModule} from "@jsverse/transloco";
import {InlineSvgComponent} from "../../../../components/inline-svg/inline-svg.component";

@Component({
  selector: 'app-homepage-quickstart',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    InlineSvgComponent
  ],
  templateUrl: './homepage-quickstart.component.html',
  styleUrl: './homepage-quickstart.component.scss'
})
export class HomepageQuickstartComponent {

}
