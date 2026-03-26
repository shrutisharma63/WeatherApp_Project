import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';

import { WeatherDisplayComponent } from '../../components/weather-display/weather-display.component';
import { PremiumWeatherDashboardComponent } from '../../components/premium-weather-dashboard/premium-weather-dashboard.component';
import { SearchBarComponent } from '../../components/city-search/search-bar.component';

import { FavoriteCitiesComponent } from '../../components/favorite-cities/favorite-cities.component';

import { FeedbackComponent } from '../../components/feedback/feedback.component';
import { SettingsComponent } from '../../components/settings/settings.component';
import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-new-app',
  imports: [
    CommonModule,
    HeaderComponent,
    SidebarComponent,


    SearchBarComponent,
    WeatherDisplayComponent,
    FavoriteCitiesComponent,


    FeedbackComponent,
    SettingsComponent
  ],
  templateUrl: './new-app.html',
  styleUrl: './new-app.css',
})
export class NewApp {
  constructor(public menuService: MenuService) {}
}

