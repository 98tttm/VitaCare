import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { BlogService } from './services/blog.service';

/** Gọi API blog sớm (không chặn app) → vào Home thường trúng cache, popup không cần skeleton */
function prefetchHomeBlogs(blog: BlogService) {
  return () => {
    blog.getBlogs({ limit: 24, page: 1 }).subscribe({ error: () => {} });
    return Promise.resolve();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'disabled' })),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: prefetchHomeBlogs,
      deps: [BlogService],
      multi: true,
    },
  ],
};
