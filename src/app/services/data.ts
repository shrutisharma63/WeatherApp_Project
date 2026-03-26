import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

export interface Item {
  date: NgbDateStruct;
  remark: string;
  file: File | null;
  number: number;
}

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private items: Item[] = [];
  private itemsSubject = new BehaviorSubject<Item[]>([]);
  private editingItemSubject = new BehaviorSubject<{ index: number; item: Item } | null>(null);

  getItems() {
    return this.itemsSubject.asObservable();
  }

  addItem(item: Item) {
    this.items.push(item);
    this.itemsSubject.next([...this.items]);
  }

  updateItem(index: number, item: Item) {
    this.items[index] = item;
    this.itemsSubject.next([...this.items]);
  }

  setEditingItem(index: number, item: Item) {
    this.editingItemSubject.next({ index, item });
  }

  getEditingItem() {
    return this.editingItemSubject.asObservable();
  }

  clearEditingItem() {
    this.editingItemSubject.next(null);
  }
}
