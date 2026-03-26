import { Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MenuService } from '../../services/menu.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { WeatherService } from '../../services/weather.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class SidebarComponent implements OnDestroy {

  constructor(
    public menuService: MenuService,
    private sanitizer: DomSanitizer,
    public weatherService: WeatherService
  ) {}

  get mapSrc(): SafeResourceUrl | null {
    // Only show map in sidebar when on weather view with valid weather data
    if (this.menuService.currentView() !== 'weather') return null;
    
    const weather = this.weatherService.currentWeather();
    if (!weather || weather.latitude == null || weather.longitude == null) return null;
    const lat = Number(weather.latitude);
    const lon = Number(weather.longitude);
    const delta = 0.06;
    const lonMin = (lon - delta).toFixed(5);
    const latMin = (lat - delta).toFixed(5);
    const lonMax = (lon + delta).toFixed(5);
    const latMax = (lat + delta).toFixed(5);
    const zoom = 10;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lonMin}%2C${latMin}%2C${lonMax}%2C${latMax}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lon.toFixed(5)}#map=${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  ngOnDestroy() {
    // Safety cleanup (important)
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'auto';
    }
  }

}
