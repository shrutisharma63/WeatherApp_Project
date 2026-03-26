import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherService, GeocodingResult } from '../../services/weather.service';
import { MenuService } from '../../services/menu.service';
import { SearchPopup } from '../search-popup/search-popup';

export interface FavoriteCity {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  temperature?: number;
  weatherCode?: number;
}

@Component({
  selector: 'app-favorite-cities',
  standalone: true,
  imports: [CommonModule, SearchPopup],
  templateUrl: './favorite-cities.component.html',
  styleUrls: ['./favorite-cities.component.css']
})
export class FavoriteCitiesComponent implements OnInit {
  private readonly favoriteStorageKeys = ['favoriteCities', 'favouriteCities', 'favorites'];
  
  favorites = signal<FavoriteCity[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  loadingCityId = signal<string | null>(null);
  openPopup = signal(false);
  
  favoritesCount = computed(() => this.favorites().length);

  constructor(
    public weatherService: WeatherService,
    private menuService: MenuService
  ) {}

  openpopup(): void {
    this.openPopup.set(true);
  }

  closePopup(): void {
    this.openPopup.set(false);
  }

  addSelectedCity(result: GeocodingResult): void {
    this.weatherService.getWeather(result.latitude, result.longitude, `${result.name}, ${result.country}`).subscribe({
      next: (weatherData) => {
        this.weatherService.currentWeather.set(weatherData);
        this.addCurrentToFavorites();
        this.error.set('City added to favorites!');
        setTimeout(() => this.error.set(null), 3000);
      },
      error: () => {
        this.error.set('Failed to load weather for selected city');
        setTimeout(() => this.error.set(null), 3000);
      }
    });
  }

  goToWeather(): void {
    this.menuService.setView('weather');
  }

  isDarkMode(): boolean {
    return document.body.classList.contains('dark-theme');
  }

  toggleDarkMode(): void {
    document.body.classList.toggle('dark-theme');
  }

  ngOnInit(): void {
    this.loadFavorites();
    
    if (this.favorites().length === 0) {
      this.initializeDemoFavorites();
    }
  }

  loadFavorites(): void {
    try {
      for (const key of this.favoriteStorageKeys) {
        const stored = localStorage.getItem(key);
        if (!stored) {
          continue;
        }

        const parsed = JSON.parse(stored);
        const normalizedFavorites = this.normalizeFavorites(parsed);

        if (normalizedFavorites.length > 0) {
          this.favorites.set(normalizedFavorites);
          this.saveFavorites();
          this.fetchAllWeatherData();
          return;
        }
      }
    } catch (e) {
      console.error('Error loading favorites:', e);
    }
  }

  saveFavorites(): void {
    try {
      localStorage.setItem('favoriteCities', JSON.stringify(this.favorites()));
    } catch (e) {
      console.error('Error saving favorites:', e);
    }
  }

  initializeDemoFavorites(): void {
    const demoFavorites: FavoriteCity[] = [
      {
        id: '1',
        name: 'London',
        country: 'UK',
        latitude: 51.5074,
        longitude: -0.1278
      },
      {
        id: '2',
        name: 'New York',
        country: 'USA',
        latitude: 40.7128,
        longitude: -74.0060
      },
      {
        id: '3',
        name: 'Tokyo',
        country: 'Japan',
        latitude: 35.6762,
        longitude: 139.6503
      },
      {
        id: '4',
        name: 'Paris',
        country: 'France',
        latitude: 48.8566,
        longitude: 2.3522
      },
      {
        id: '5',
        name: 'Sydney',
        country: 'Australia',
        latitude: -33.8688,
        longitude: 151.2093
      }
    ];
    
    this.favorites.set(demoFavorites);
    this.saveFavorites();
    this.fetchAllWeatherData();
  }

  fetchAllWeatherData(): void {
    const cities = this.favorites();
    cities.forEach(city => {
      this.fetchWeatherForCity(city);
    });
  }

  fetchWeatherForCity(city: FavoriteCity): void {
    this.loadingCityId.set(city.id);
    
    const simpleUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current_weather=true&timezone=auto`;
    
    fetch(simpleUrl).then(response => response.json()).then(data => {
      if (data.current_weather) {
        this.favorites.update(cities => 
          cities.map(c => 
            c.id === city.id 
              ? { 
                  ...c, 
                  temperature: Math.round(data.current_weather.temperature),
                  weatherCode: data.current_weather.weathercode 
                }
              : c
          )
        );
      }
      this.loadingCityId.set(null);
    }).catch(err => {
      console.error(`Error fetching weather for ${city.name}:`, err);
      this.loadingCityId.set(null);
    });
  }

  removeFromFavorites(cityId: string): void {
    this.favorites.update(cities => 
      cities.filter(c => c.id !== cityId)
    );
    this.saveFavorites();
  }

  viewWeather(city: FavoriteCity): void {
    this.weatherService.getWeather(
      city.latitude,
      city.longitude,
      `${city.name}, ${city.country}`
    ).subscribe({
      next: (weatherData) => {
        this.weatherService.currentWeather.set(weatherData);
        this.menuService.setView('weather');
      },
      error: (err) => {
        console.error('Error loading weather:', err);
      }
    });
  }

  getWeatherIcon(weatherCode?: number): string {
    if (weatherCode === undefined || weatherCode === null) {
      return '🌤️';
    }
    return this.weatherService.getWeatherIcon(weatherCode);
  }

  addCurrentToFavorites(): void {
    const currentWeather = this.weatherService.currentWeather();
    if (!currentWeather) return;

    const exists = this.favorites().some(
      f => f.name.toLowerCase() === currentWeather.location.split(',')[0].toLowerCase()
    );

    if (exists) {
      this.error.set('City already in favorites');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }

    const newFavorite: FavoriteCity = {
      id: Date.now().toString(),
      name: currentWeather.location.split(',')[0].trim(),
      country: currentWeather.location.split(',')[1]?.trim() || '',
      latitude: currentWeather.latitude || 0,
      longitude: currentWeather.longitude || 0,
      temperature: currentWeather.current.temperature,
      weatherCode: currentWeather.current.weatherCode
    };

    this.favorites.update(cities => [...cities, newFavorite]);
    this.saveFavorites();
  }

  private normalizeFavorites(rawValue: unknown): FavoriteCity[] {
    const possibleList = this.extractFavoriteArray(rawValue);
    if (!possibleList) {
      return [];
    }

    return possibleList
      .map((item, index) => this.normalizeFavoriteItem(item, index))
      .filter((item): item is FavoriteCity => item !== null);
  }

  private extractFavoriteArray(rawValue: unknown): unknown[] | null {
    if (Array.isArray(rawValue)) {
      return rawValue;
    }

    if (rawValue && typeof rawValue === 'object') {
      const record = rawValue as Record<string, unknown>;
      const possibleArray = record['favoriteCities'] ?? record['favouriteCities'] ?? record['favorites'];

      if (Array.isArray(possibleArray)) {
        return possibleArray;
      }

      if (record['name'] && (record['latitude'] ?? record['lat']) !== undefined && (record['longitude'] ?? record['lon']) !== undefined) {
        return [record];
      }
    }

    return null;
  }

  private normalizeFavoriteItem(rawItem: unknown, index: number): FavoriteCity | null {
    if (!rawItem || typeof rawItem !== 'object') {
      return null;
    }

    const item = rawItem as Record<string, unknown>;
    const name = String(item['name'] ?? '').trim();
    const latitude = Number(item['latitude'] ?? item['lat']);
    const longitude = Number(item['longitude'] ?? item['lon']);

    if (!name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    return {
      id: String(item['id'] ?? `${Date.now()}-${index}`),
      name,
      country: String(item['country'] ?? item['countryCode'] ?? ''),
      latitude,
      longitude,
      temperature: item['temperature'] !== undefined ? Number(item['temperature']) : undefined,
      weatherCode: item['weatherCode'] !== undefined ? Number(item['weatherCode']) : undefined
    };
  }

  isCityLoading(cityId: string): boolean {
    return this.loadingCityId() === cityId;
  }

  formatTemperature(temp?: number): string {
    if (temp === undefined || temp === null) {
      return '--°';
    }
    return `${temp}°C`;
  }

}

