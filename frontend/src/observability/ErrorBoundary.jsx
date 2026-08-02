import React from "react";
import * as Sentry from "@sentry/react";

export class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[RootErrorBoundary] Intercepted React crash:", error, errorInfo);
    // Report crash to Sentry
    Sentry.withScope((scope) => {
      scope.setExtra("errorInfo", errorInfo);
      scope.setTag("error_category", "react_render_crash");
      Sentry.captureException(error);
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950 font-sans text-center select-none">
          <div className="max-w-md w-full p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-955/20 text-rose-600 flex items-center justify-center text-xl font-black mx-auto">
              !
            </div>
            
            <h1 className="text-xl font-black uppercase text-zinc-955 dark:text-zinc-50 tracking-wider">
              Something went wrong
            </h1>
            
            <p className="text-xs text-zinc-450 dark:text-zinc-500 font-semibold leading-relaxed">
              We've logged this error and are looking into it. Please try reloading the page or contact support if the issue persists.
            </p>
            
            <div className="pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-zinc-955 hover:bg-zinc-900 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-extrabold rounded-2xl text-xs transition duration-150 cursor-pointer border-none shadow-3xs"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
