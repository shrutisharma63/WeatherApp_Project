import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MenuService } from '../../services/menu.service';
import { ThemeService } from '../../services/theme.service';
import { Subscription } from 'rxjs';
import { TooltipDirective } from '../../directives/tooltip.directive';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, TooltipDirective],

  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  isDarkTheme: boolean = false;
  private themeSubscription: Subscription = new Subscription();

  constructor(public menuService: MenuService, private themeService: ThemeService) {}

  ngOnInit() {
    this.themeSubscription = this.themeService.isDarkTheme$.subscribe(isDark => {
      this.isDarkTheme = isDark;
    });
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  refreshPage() {
    window.location.reload();
  }
}

