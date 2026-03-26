import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewApp } from './App/new-app/new-app';

interface Playlist {
  id: string;
  name: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NewApp
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {

}
