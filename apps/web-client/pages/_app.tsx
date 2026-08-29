import type { AppProps } from "next/app";
import { I18nProvider } from "../context/I18nContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <I18nProvider>
      <Component {...pageProps} />
    </I18nProvider>
  );
}
