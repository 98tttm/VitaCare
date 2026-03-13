import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private isDarkModeSubject = new BehaviorSubject<boolean>(this.getInitialTheme());
    isDarkMode$: Observable<boolean> = this.isDarkModeSubject.asObservable();

    constructor() { }

    private getInitialTheme(): boolean {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                return savedTheme === 'dark';
            }
            return document.body.classList.contains('dark-mode');
        }
        return false;
    }

    toggleTheme(isDark: boolean) {
        this.isDarkModeSubject.next(isDark);
        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            if (isDark) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        }
    }

    get isDarkMode(): boolean {
        return this.isDarkModeSubject.value;
    }
}
