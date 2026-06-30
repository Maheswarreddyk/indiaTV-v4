import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { SessionProvider } from './contexts/SessionContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import { AboutPage } from './pages/AboutPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { PrivacyPage } from './pages/PrivacyPage.js';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
