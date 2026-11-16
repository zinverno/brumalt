export type Screen = 'Home' | 'Progress' | 'GameSetup' | 'GameActive' | 'SessionResult';
export type NavigationEvent = 'home' | 'progress' | 'prepare' | 'start' | 'finish';

const routes: Record<Screen, Partial<Record<NavigationEvent, Screen>>> = {
  Home: { progress: 'Progress', prepare: 'GameSetup' },
  Progress: { home: 'Home' },
  GameSetup: { home: 'Home', start: 'GameActive', finish: 'SessionResult' },
  GameActive: { home: 'Home', prepare: 'GameSetup', start: 'GameActive', finish: 'SessionResult' },
  SessionResult: { home: 'Home', prepare: 'GameSetup' },
};

/** Ephemeral routes only. Attempt phases and durable saves have their own lifetimes. */
export class Navigation {
  private screen: Screen = 'Home';
  get current(): Screen { return this.screen; }
  send(event: NavigationEvent): boolean {
    const next = routes[this.screen][event];
    if (!next) return false;
    this.screen = next;
    return true;
  }
}
