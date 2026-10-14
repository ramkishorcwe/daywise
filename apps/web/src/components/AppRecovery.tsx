import { Component, type ReactNode } from 'react';

export default class AppRecovery extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const loading = /(?:dynamic(?:ally)? import|importing a module|loading (?:chunk|css)|failed to fetch.*module|unable to preload)/i.test(this.state.error.message);
    return <main className="app-recovery" role="alert">
      <h1>{loading ? 'Reload Daywise to continue' : 'Daywise could not display this view'}</h1>
      <p>{loading ? 'A page file could not load. The app may have been updated while this tab was open, or your connection was interrupted.' : 'Reload the app to reopen your saved trip. If this happens again, report which action caused it.'}</p>
      <p>Reloading keeps trips already saved on this device. You do not need to clear browser storage.</p>
      <button type="button" className="button primary" onClick={() => window.location.reload()}>Reload Daywise</button>
    </main>;
  }
}
