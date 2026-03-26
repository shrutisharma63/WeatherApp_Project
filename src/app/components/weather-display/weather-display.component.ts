 import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { WeatherService } from '../../services/weather.service';
import { ModernWeatherDashboardComponent } from '../modern-weather-dashboard/modern-weather-dashboard.component';
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

@Component({
  selector: 'app-weather-display',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, ModernWeatherDashboardComponent],
  templateUrl: './weather-display.component.html',
  styleUrls: ['./weather-display.component.css']
})
export class WeatherDisplayComponent {
  isBrowser: boolean;

  constructor(
    public weatherService: WeatherService,
    @Inject(PLATFORM_ID) platformId: Object,
    private sanitizer: DomSanitizer
  ) {
      this.isBrowser = isPlatformBrowser(platformId);
      if (this.isBrowser) {
        this.weatherService.getUserLocationWeather();
      }
  }

  get mapSrc(): SafeResourceUrl | null {
    const weather = this.weatherService.currentWeather();
    if (!weather || weather.latitude == null || weather.longitude == null) return null;
    const lat = Number(weather.latitude);
    const lon = Number(weather.longitude);
    const delta = 0.12;
    const lonMin = (lon - delta).toFixed(5);
    const latMin = (lat - delta).toFixed(5);
    const lonMax = (lon + delta).toFixed(5);
    const latMax = (lat + delta).toFixed(5);
    const zoom = 10;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lonMin}%2C${latMin}%2C${lonMax}%2C${latMax}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lon.toFixed(5)}#map=${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getWeatherIcon(code: number): string {
    return this.weatherService.getWeatherIcon(code);
  }

  getWeatherDescription(code: number): string {
    return this.weatherService.getWeatherDescription(code);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();
    return `${dayName}, ${month} ${dayNum}`;
  }

  // Get short day name for charts
  private getShortDayName(dateStr: string): string {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  // Simple Line Chart - Temperature for next 7 days
  get temperatureChartData(): ChartData<'line'> {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return { labels: [], datasets: [] };
    }

    const forecast = weather.forecast.slice(0, 7);
    const labels = forecast.map(day => this.getShortDayName(day.date));
    const maxTemps = forecast.map(day => day.temperatureMax);
    const minTemps = forecast.map(day => day.temperatureMin);

    return {
      labels: labels,
      datasets: [
        {
          data: maxTemps,
          label: 'High (°C)',
          borderColor: '#FF6B6B',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          data: minTemps,
          label: 'Low (°C)',
          borderColor: '#4ECDC4',
          backgroundColor: 'rgba(78, 205, 196, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    };
  }

  get temperatureChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'bottom',
          labels: { color: '#94a3b8', padding: 20 }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }

  // Simple Bar Chart - Precipitation for next 7 days
  get precipitationChartData(): ChartData<'bar'> {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return { labels: [], datasets: [] };
    }

    const forecast = weather.forecast.slice(0, 7);
    const labels = forecast.map(day => this.getShortDayName(day.date));
    const precip = forecast.map(day => day.precipitationProbability || 0);

    return {
      labels: labels,
      datasets: [
        {
          data: precip,
          label: 'Rain Chance (%)',
          backgroundColor: '#4D96FF',
          borderRadius: 4
        }
      ]
    };
  }

  get precipitationChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'bottom',
          labels: { color: '#94a3b8', padding: 20 }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: { 
          beginAtZero: true, 
          max: 100,
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }

  // Simple Line Chart - Humidity for next 7 days
  get humidityChartData(): ChartData<'line'> {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return { labels: [], datasets: [] };
    }

    const forecast = weather.forecast.slice(0, 7);
    const labels = forecast.map(day => this.getShortDayName(day.date));
    const humidity = forecast.map(day => day.humidity || 0);

    return {
      labels: labels,
      datasets: [
        {
          data: humidity,
          label: 'Humidity (%)',
          borderColor: '#9B59B6',
          backgroundColor: 'rgba(155, 89, 182, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    };
  }

  get humidityChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'bottom',
          labels: { color: '#94a3b8', padding: 20 }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }

  // Monthly temperature trend chart (first 30 days)
  get monthlyTempChartData(): ChartData<'line'> {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return { labels: [], datasets: [] };
    }
    const forecast = weather.forecast.slice(0, 30);
    const labels = forecast.map(day => this.getDayNumber(day.date).toString());
    const maxTemps = forecast.map(day => day.temperatureMax);

    return {
      labels,
      datasets: [
        {
          data: maxTemps,
          label: '30‑Day High (°C)',
          borderColor: '#FF6B6B',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    };
  }

  get monthlyTempChartOptions(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'bottom',
          labels: { color: '#94a3b8', padding: 20 }
        }
      },
      scales: {
        x: { 
          ticks: { maxRotation: 0, minRotation: 0, color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    };
  }

  formatHour(timeStr: string): string {
    const date = new Date(timeStr);
    return `${date.getHours()}:00`;
  }

  get hourlyForecast() {
    const weather = this.weatherService.currentWeather();
    if (!weather || !weather.hourly) {
      return [];
    }
    return weather.hourly.slice(0, 12);
  }

  // Monthly weather data
  get months(): string[] {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }

  get weeks(): string[] {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  }

  // Get month name from date
  getMonthName(dateStr: string): string {
    const date = new Date(dateStr);
    return this.months[date.getMonth()];
  }

  // Get day number from date
  getDayNumber(dateStr: string): number {
    const date = new Date(dateStr);
    return date.getDate();
  }

  // Get short day name
  getDayName(dateStr: string): string {
    const date = new Date(dateStr);
    return this.weeks[date.getDay()];
  }

  // Get monthly forecast (up to 30 days)
  get monthlyForecast() {
    const weather = this.weatherService.currentWeather();
    if (!weather) {
      return [];
    }
    // service now returns 30 days; slice if more just in case
    return weather.forecast.slice(0, 30);
  }
}
