import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WeatherService } from '../../services/weather.service';
import { FavoriteCitiesComponent } from '../favorite-cities/favorite-cities.component';

@Component({
  selector: 'app-city-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './city-search.component.html',
  styleUrls: ['./city-search.component.css']
})
export class CitySearchComponent implements OnInit {
  searchQuery: string = '';

  constructor(public weatherService: WeatherService, private favoriteCities: FavoriteCitiesComponent) {}

  ngOnInit(): void {
    // Weather is loaded from weather-display component by default
  }

  onLocationClick(): void {
    this.weatherService.getUserLocationWeather();
  }

  onSearch(): void {
    console.log('Search triggered with query:', this.searchQuery);
    this.weatherService.searchWeather(this.searchQuery);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    // Removed default city - global search support
  }



  addToFavorites(): void {
    const currentWeather = this.weatherService.currentWeather();
    if (currentWeather) {
      this.favoriteCities.addCurrentToFavorites();
      console.log('Added to favorites:', currentWeather.location);
    }
  }
}

