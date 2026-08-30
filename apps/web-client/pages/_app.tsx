import type { AppProps } from "next/app";
import { I18nProvider } from "../context/I18nContext";
import { ErrorBoundary } from "../components/ErrorBoundary";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <Component {...pageProps} />
      </I18nProvider>
    </ErrorBoundary>
  );
}
