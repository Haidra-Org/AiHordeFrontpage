import {Component, OnDestroy, OnInit, signal} from '@angular/core';
import {RouterLink, RouterOutlet} from '@angular/router';
import {NgOptimizedImage} from "@angular/common";
import {TranslocoPipe, TranslocoModule} from "@jsverse/transloco";
import {InlineSvgComponent} from "./components/inline-svg/inline-svg.component";
import {FooterColorService} from "./services/footer-color.service";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NgOptimizedImage, TranslocoPipe, RouterLink, InlineSvgComponent,],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  public darkMode = signal(true);
  public darkFooter = this.footerColor.getDarkMode();
  public showMobileMenu = false;

  constructor(
    private readonly footerColor: FooterColorService,
  ) {
  }

  public ngOnInit(): void {
    this.darkMode.set(typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  public toggleMobileMenu(): void {
    this.showMobileMenu = !this.showMobileMenu;
  }

  public closeMobileMenu(): void {
    this.showMobileMenu = false;
  }
}
